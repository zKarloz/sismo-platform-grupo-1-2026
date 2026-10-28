"""Pruebas de capturas históricas sin tocar Supabase ni leer 2025 para entrenar."""
from datetime import datetime, timezone
from hashlib import sha256
from pathlib import Path
from types import SimpleNamespace
from uuid import UUID

from fastapi import FastAPI
from fastapi.testclient import TestClient
import pytest
from sqlalchemy import create_engine, event as sa_event, func, select
from sqlalchemy.pool import StaticPool

from app.db.session import get_read_engine
from app.db.tables import datasets, events, historical_snapshot_rows, metadata
from app.quality import historical
from app.routes.quality import datasets_router


@pytest.fixture
def engine():
    db = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    @sa_event.listens_for(db, "connect")
    def attach(dbapi, _):
        dbapi.execute("ATTACH DATABASE ':memory:' AS public")
    metadata.create_all(db)
    yield db
    db.dispose()


@pytest.fixture
def fake_catalog(tmp_path, monkeypatch):
    path = tmp_path / "igp_catalogo_1960_2025.xlsx"
    path.write_bytes(b"archivo de prueba sin datos personales")
    expected_hash = sha256(path.read_bytes()).hexdigest()
    rows = [
        (2018, 4.3, 101), (2019, 4.2, 102), (2023, 4.7, 103),
        (2024, 4.1, 104), (2024, 3.5, 105), (2025, 6.4, 106),
    ]
    events_mock = tuple({"id": f"IGP-CENSIS-XLSX-R{index}",
                         "fecha_utc": datetime(year, 3, 5, tzinfo=timezone.utc).isoformat(),
                         "magnitud": magnitude, "profundidad_km": 55.0,
                         "latitud": -12.0, "longitud": -77.0,
                         "url_origen": "https://ultimosismo.igp.gob.pe/repositorio/datos-sismicos"}
                        for year, magnitude, index in rows)
    def read(_):
        return SimpleNamespace(source_mode="censis_xlsx_snapshot", xlsx_sha256=expected_hash,
                               skipped=0, total_source=len(events_mock), events=events_mock)
    monkeypatch.setattr(historical, "_read_official_xlsx", read)
    return path, expected_hash


def test_preparation_excludes_2025_and_magnitudes_below_four(fake_catalog):
    file, digest = fake_catalog
    prepared = historical.prepare_historical_dataset(file, digest)
    assert prepared["row_count"] == 3
    assert prepared["by_split"] == {"train": 2, "validation": 1}
    assert [r["source_row"] for r in prepared["records"]] == [102, 103, 104]
    assert prepared["quality_report"]["essential_fields_missing"] == 0
    assert "2025" in prepared["query_spec"]["holdout_test"]
    assert set(r["source_name"] for r in prepared["records"]) == {"IGP/CENSIS"}
    with pytest.raises(ValueError, match="SHA-256"):
        historical.prepare_historical_dataset(file, "0"*64)


def test_atomic_snapshot_is_idempotent_and_events_unchanged(engine, fake_catalog):
    prepared = historical.prepare_historical_dataset(*fake_catalog)
    first = historical.persist_historical_dataset(engine, prepared)
    second = historical.persist_historical_dataset(engine, prepared)
    assert first["version"] == second["version"] == 1
    assert second["already_exists"] is True
    with engine.connect() as conn:
        assert conn.execute(select(func.count()).select_from(events)).scalar_one() == 0
        assert conn.execute(select(func.count()).select_from(historical_snapshot_rows)).scalar_one() == 3
        assert conn.execute(select(func.count()).select_from(datasets)).scalar_one() == 1
    assert len(first["content_sha256"]) == 64


def test_history_preview_and_integrity_detect_tampering(engine, fake_catalog):
    prepared = historical.prepare_historical_dataset(*fake_catalog)
    result = historical.persist_historical_dataset(engine, prepared)
    id = result["id"]
    app = FastAPI()
    app.include_router(datasets_router, prefix="/api/v1")
    app.dependency_overrides[get_read_engine] = lambda: engine
    with TestClient(app) as client:
        listing = client.get("/api/v1/datasets").json()
        assert listing["total"] == 1
        assert listing["items"][0]["query_spec"]["dataset_kind"] == historical.KIND
        preview = client.get(f"/api/v1/datasets/{id}/preview?page_size=2").json()
        assert preview["total"] == 3 and len(preview["items"]) == 2
        assert all(row["split"] == "train" for row in preview["items"])
        assert client.get(f"/api/v1/datasets/{id}/integrity").json()["verified"] is True
        with engine.begin() as conn:
            first = conn.execute(select(historical_snapshot_rows).where(
                historical_snapshot_rows.c.dataset_id == UUID(id),
                historical_snapshot_rows.c.position == 1)).mappings().one()
            changed = dict(first["record"])
            changed["magnitude"] = 8.9
            conn.execute(historical_snapshot_rows.update().where(
                historical_snapshot_rows.c.dataset_id == UUID(id),
                historical_snapshot_rows.c.position == 1).values(record=changed))
        integrity = client.get(f"/api/v1/datasets/{id}/integrity").json()
        assert integrity["hash_matches"] is False and integrity["verified"] is False
        assert client.get(f"/api/v1/datasets/{id}/preview?page_size=21").status_code == 422


def test_reject_invalid_version_or_prepared_changes(engine, fake_catalog):
    p = historical.prepare_historical_dataset(*fake_catalog)
    with pytest.raises(ValueError, match="nombre aprobado"):
        historical.persist_historical_dataset(engine, p, name="peru_usgs_historico")
    p["records"][0]["magnitude"] = 3.0
    with pytest.raises(ValueError, match="cambió"):
        historical.persist_historical_dataset(engine, p)
    with engine.connect() as conn:
        assert conn.execute(select(func.count()).select_from(datasets)).scalar_one() == 0
