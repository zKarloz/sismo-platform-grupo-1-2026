"""Aprobación/rechazo real: RBAC servidor, integridad y bitácora atómica."""
from datetime import datetime, timezone
from uuid import UUID, uuid4

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event, func, select
from sqlalchemy.pool import StaticPool

from app.auth.security import Principal, require_user
from app.db.session import get_read_engine
from app.db.tables import audit_logs, dataset_reviews, datasets, historical_snapshot_rows, metadata, users
from app.quality.report import content_sha256, quality_report
from app.routes.quality import datasets_router


@pytest.fixture
def env():
    engine = create_engine('sqlite://', connect_args={'check_same_thread': False}, poolclass=StaticPool)
    @event.listens_for(engine, 'connect')
    def attached(dbapi, _):
        dbapi.execute("ATTACH DATABASE ':memory:' AS public")
    metadata.create_all(engine)
    uid, did = uuid4(), uuid4()
    records = []
    for position, year in enumerate((2019, 2021, 2024), 2):
        records.append({
            'external_id': f'IGP-CENSIS-XLSX-R{position}', 'source_row': position,
            'source_name': 'IGP/CENSIS', 'occurred_at': f'{year}-01-01T12:00:00+00:00',
            'magnitude': 4.5, 'depth_km': 35.0, 'latitude': -12.0, 'longitude': -77.0,
            'source_url': 'https://igp.gob.pe',
            'split': 'train' if year <= 2023 else 'validation',
        })
    quality = quality_report(records)
    quality.update({'by_split': {'train': 2, 'validation': 1}, 'essential_fields_missing': 0})
    with engine.begin() as conn:
        conn.execute(users.insert().values(id=uid, auth_user_id=uuid4(),
            email='analyst@example.test', full_name='Analista de prueba',role='analista',status='active'))
        conn.execute(datasets.insert().values(id=did, name='igp_instrumental_test', version=1,
            query_spec={'source': 'IGP/CENSIS', 'dataset_kind': 'igp_instrumental_xlsx',
                        'holdout_test': '2025 reservado'}, row_count=len(records),
            quality_report=quality, content_sha256=content_sha256(records)))
        for i, r in enumerate(records, 1):
            conn.execute(historical_snapshot_rows.insert().values(
                dataset_id=did, position=i, source_row=r['source_row'], split=r['split'], record=r))
    app = FastAPI()
    app.include_router(datasets_router, prefix='/api/v1')
    app.dependency_overrides[get_read_engine] = lambda: engine
    role = {'value': 'analista'}
    def principal():
        return Principal(id=uid, auth_user_id=uuid4(), email='analyst@example.test',
                         full_name='Analista de prueba', role=role['value'], status='active')
    app.dependency_overrides[require_user] = principal
    with TestClient(app) as client:
        yield engine, client, did, role
    engine.dispose()


def decision(client, did, decision='approved', note='El archivo IGP conserva calidad esencial verificada.'):
    return client.post(f'/api/v1/datasets/{did}/review', json={'decision': decision, 'note': note})


def test_approval_writes_one_review_and_atomic_audit(env):
    engine, client, did, role = env
    listed = client.get('/api/v1/datasets').json()['items'][0]
    assert listed['review_decision'] is None
    result = decision(client, did)
    assert result.status_code == 201, result.text
    assert result.json()['decision'] == 'approved'
    listed = client.get('/api/v1/datasets').json()['items'][0]
    assert listed['review_decision'] == 'approved'
    assert listed['reviewer_name'] == 'Analista de prueba'
    with engine.connect() as conn:
        assert conn.execute(select(func.count()).select_from(dataset_reviews)).scalar_one() == 1
        audit = conn.execute(select(audit_logs.c.action, audit_logs.c.entity_id)).one()
        assert audit.action == 'dataset.review.approved' and audit.entity_id == did
    assert decision(client, did).status_code == 409


def test_roles_and_note_required(env):
    engine, client, did, role = env
    role['value'] = 'solo_lectura'
    assert decision(client, did).status_code == 403
    role['value'] = 'operador_alertas'
    assert decision(client, did).status_code == 403
    role['value'] = 'administrador'
    assert decision(client, did, note='corto').status_code == 422
    assert decision(client, did, note=' '*16).status_code == 422
    with engine.connect() as conn:
        assert conn.execute(select(func.count()).select_from(dataset_reviews)).scalar_one() == 0


def test_tampered_snapshot_cannot_be_approved_but_can_be_rejected(env):
    engine, client, did, role = env
    with engine.begin() as conn:
        row = conn.execute(select(historical_snapshot_rows).where(
            historical_snapshot_rows.c.dataset_id == did,
            historical_snapshot_rows.c.position == 1)).mappings().one()
        altered = {**row['record'], 'depth_km': 900.0}
        conn.execute(historical_snapshot_rows.update().where(
            historical_snapshot_rows.c.dataset_id == did,
            historical_snapshot_rows.c.position == 1).values(record=altered))
    assert decision(client, did).status_code == 409
    rejected = decision(client, did, decision='rejected', note='La huella del snapshot no coincide con el original.')
    assert rejected.status_code == 201, rejected.text
    assert client.get('/api/v1/datasets').json()['items'][0]['review_decision'] == 'rejected'


def test_usgs_and_unknown_cannot_be_reviewed(env):
    engine, client, did, role = env
    assert decision(client, uuid4()).status_code == 404
    with engine.begin() as conn:
        usgs = uuid4()
        conn.execute(datasets.insert().values(id=usgs, name='old-usgs', version=1,
            query_spec={'source': 'USGS'}, row_count=1, quality_report={'by_source': {'USGS': 1}},
            content_sha256='0'*64))
    assert decision(client, usgs).status_code == 404
    assert client.get('/api/v1/datasets').json()['total'] == 1


def test_reviewer_identity_cannot_be_forged(env):
    """No se permite escoger reviewed_by mediante el JSON de la petición."""
    engine, client, did, role = env
    response = client.post(f'/api/v1/datasets/{did}/review', json={
        'decision': 'approved', 'note': 'La información fue revisada con datos IGP.',
        'reviewed_by': str(uuid4()),
    })
    assert response.status_code == 422
    with engine.connect() as conn:
        assert conn.execute(select(func.count()).select_from(dataset_reviews)).scalar_one() == 0
