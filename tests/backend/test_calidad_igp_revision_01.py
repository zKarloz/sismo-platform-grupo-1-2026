"""Contratos IGP-first: casos SQLite sin conexión externa ni modificaciones a Supabase."""
from datetime import datetime, timezone
from uuid import UUID, uuid4

from fastapi import FastAPI
from fastapi.testclient import TestClient
import pytest
from sqlalchemy import create_engine, event as sa_event, select, func
from sqlalchemy.pool import StaticPool

from app.db.session import get_read_engine
from app.db.tables import datasets, events, metadata, sources, snapshot_rows
from app.quality.service import create_dataset
from app.routes.quality import quality_router, datasets_router
from app.routes.filters import SeismicFilters

@pytest.fixture
def env():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    @sa_event.listens_for(engine, "connect")
    def attach(dbapi, _):
        dbapi.execute("ATTACH DATABASE ':memory:' AS public")
    metadata.create_all(engine)
    igp_id, usgs_id = uuid4(), uuid4()
    with engine.begin() as conn:
        for sid, name in [(igp_id, "IGP/CENSIS"), (usgs_id, "USGS")]:
            conn.execute(sources.insert().values(id=sid, name=name, organization=name,
                        base_url="https://example.org", source_type="api", status="active"))
        for source_id, eid, mag in [(igp_id, "2026-0001", 3.1), (igp_id, "2026-0002", 4.0),
                                     (usgs_id, "us1", 8.4)]:
            conn.execute(events.insert().values(id=uuid4(), source_id=source_id,
                        external_id=eid, occurred_at=datetime(2026, 10, 22, tzinfo=timezone.utc),
                        latitude=-12., longitude=-77., magnitude=mag, depth_km=35,
                        place="45 km al SO de Lima - Lima", review_status="unreviewed",
                        source_url="https://example.org/report/" + eid))
    app = FastAPI()
    app.include_router(quality_router, prefix="/api/v1")
    app.include_router(datasets_router, prefix="/api/v1")
    app.dependency_overrides[get_read_engine] = lambda: engine
    with TestClient(app) as client:
        yield engine, client
    engine.dispose()


def test_summary_igp_only_and_usgs_rejected(env):
    _, client = env
    result = client.get('/api/v1/data-quality/summary')
    assert result.status_code == 200
    payload = result.json()
    assert payload['total'] == 2
    assert payload['by_source'] == {'IGP/CENSIS': 2}
    assert client.get('/api/v1/data-quality/summary?source=USGS').status_code == 422
    assert client.get('/api/v1/data-quality/summary?min_magnitude=3.5').json()['total'] == 1


def test_new_dataset_never_accepts_usgs_or_mixed(env):
    engine, _ = env
    with pytest.raises(ValueError, match='IGP/CENSIS'):
        create_dataset(engine, name='invalid_usgs', filters=SeismicFilters(source='USGS'))
    result = create_dataset(engine, name='peru_igp', filters=SeismicFilters(), max_rows=2)
    assert result['row_count'] == 2
    assert result['quality_report']['by_source'] == {'IGP/CENSIS': 2}
    with engine.connect() as conn:
        ds = conn.execute(select(datasets).where(datasets.c.id == UUID(result['id']))).mappings().first()
        rows = conn.execute(select(snapshot_rows.c.record).where(snapshot_rows.c.dataset_id == UUID(result['id']))).scalars().all()
    assert ds['query_spec']['source'] == 'IGP/CENSIS'
    assert {row['source_name'] for row in rows} == {'IGP/CENSIS'}


def test_historical_usgs_retained_but_hidden(env):
    engine, client = env
    from app.quality.report import snapshot_record, content_sha256, quality_report
    from uuid import UUID
    with engine.begin() as conn:
        usgs_row = conn.execute(select(events, sources.c.name.label('source_name')).join(sources, events.c.source_id == sources.c.id).where(sources.c.name == 'USGS')).mappings().one()
        record = snapshot_record(dict(usgs_row))
        did = uuid4()
        conn.execute(datasets.insert().values(id=did, name='peru_usgs_historico', version=2,
                     row_count=1, query_spec={'source':'USGS'}, quality_report=quality_report([record]),
                     content_sha256=content_sha256([record]), created_at=datetime.now(timezone.utc)))
        conn.execute(snapshot_rows.insert().values(dataset_id=did, position=1, event_id=usgs_row['id'], record=record))
    assert client.get('/api/v1/datasets').json()['total'] == 0
    assert client.get(f'/api/v1/datasets/{did}/quality').status_code == 404
    assert client.get(f'/api/v1/datasets/{did}/preview').status_code == 404
    assert client.get(f'/api/v1/datasets/{did}/integrity').status_code == 404
    with engine.connect() as conn:
        assert conn.execute(select(func.count()).select_from(datasets)).scalar_one() == 1


def test_igp_preview_integrity_and_version_pagination(env):
    engine, client = env
    first = create_dataset(engine, name='peru_igp', filters=SeismicFilters(), max_rows=2)
    second = create_dataset(engine, name='peru_igp', filters=SeismicFilters(), max_rows=2)
    dsid = first['id']
    listing = client.get('/api/v1/datasets?page_size=1&page=2').json()
    assert listing['total'] == 2 and listing['page_size'] == 1 and len(listing['items']) == 1
    preview = client.get(f'/api/v1/datasets/{dsid}/preview?page_size=1').json()
    assert preview['total'] == 2 and len(preview['items']) == 1
    assert preview['items'][0]['source_name'] == 'IGP/CENSIS'
    assert 'source_id' not in preview['items'][0]
    verified = client.get(f'/api/v1/datasets/{dsid}/integrity').json()
    assert verified['verified'] and verified['igp_only']
    with engine.begin() as conn:
        row = conn.execute(select(snapshot_rows).where(snapshot_rows.c.dataset_id == UUID(dsid)).order_by(snapshot_rows.c.position)).mappings().first()
        corrupt = dict(row['record'])
        corrupt['magnitude'] = 7.5
        conn.execute(snapshot_rows.update().where(snapshot_rows.c.dataset_id == UUID(dsid), snapshot_rows.c.position == row['position']).values(record=corrupt))
    assert client.get(f'/api/v1/datasets/{dsid}/integrity').json()['verified'] is False
    assert client.get('/api/v1/datasets?page_size=500').status_code == 422
