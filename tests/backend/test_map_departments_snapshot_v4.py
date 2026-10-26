"""Pruebas del respaldo GeoJSON: no necesitan conexión a INGEMMET ni a GitHub."""

import hashlib
import json

import pytest
from fastapi import HTTPException

from app.geo import department_snapshots as snap
from app.routes import geo
from app.commands.prepare_departments import build_snapshot


def fake_source():
    """Polígonos sintéticos SOLO en tests; jamás se incluyen en producción."""
    features = []
    for name in sorted(snap.EXPECTED_NAMES):
        features.append({"type": "Feature", "properties": {"nombre": name},
                         "geometry": {"type": "Polygon", "coordinates": [[
                             [-77.0, -12.0], [-76.0, -12.0], [-76.0, -11.0],
                             [-77.0, -11.0], [-77.0, -12.0],
                         ]]}})
    return {"type": "FeatureCollection", "features": features}


def test_accepts_all_25_departments_and_accents():
    source = fake_source()
    source["features"][0]["properties"]["nombre"] = "Ámazonas"
    names = snap.validate_collection(json.dumps(source).encode())
    assert len(names) == 25
    assert "AMAZONAS" in names


def test_rejects_incomplete_country():
    source = fake_source()
    source["features"].pop()
    with pytest.raises(snap.InvalidDepartmentSnapshot, match="Faltan departamentos"):
        snap.validate_collection(json.dumps(source).encode())


def test_rejects_non_polygon_and_invented_department():
    source = fake_source()
    source["features"][0]["geometry"]["type"] = "Point"
    with pytest.raises(snap.InvalidDepartmentSnapshot, match="Polygon"):
        snap.validate_collection(json.dumps(source).encode())
    source = fake_source()
    source["features"][0]["properties"]["nombre"] = "Departamento Inventado"
    with pytest.raises(snap.InvalidDepartmentSnapshot, match="inesperado"):
        snap.validate_collection(json.dumps(source).encode())


def test_rejects_coordinates_outside_peru():
    source = fake_source()
    source["features"][0]["geometry"]["coordinates"][0][1][0] = 1e7
    with pytest.raises(snap.InvalidDepartmentSnapshot, match="fuera"):
        snap.validate_collection(json.dumps(source).encode())


def test_cli_builds_versionable_collection_with_sha256():
    raw = json.dumps(fake_source()).encode()
    result = build_snapshot(raw, "archivo_descargado.geojson")
    assert len(result["features"]) == 25
    assert result["_provenance"]["sha256_original"] == hashlib.sha256(raw).hexdigest()
    assert result["features"][0]["properties"].keys() == {"nombre"}


def test_local_boundary_preferred_over_unavailable_provider(tmp_path, monkeypatch):
    raw = json.dumps(build_snapshot(json.dumps(fake_source()).encode(), snap.SOURCE_URL)).encode()
    f = tmp_path / "peru_departamentos.geojson"
    f.write_bytes(raw)
    monkeypatch.setattr(snap, "SNAPSHOT_PATH", f)
    snap._cached_snapshot.cache_clear()
    geo._department_boundary.cache_clear()
    monkeypatch.setattr(geo, "urlopen", lambda *args, **kwargs: (_ for _ in ()).throw(AssertionError("No debe llamar a INGEMMET")))
    try:
        result = geo.department_boundary("Arequipa")
        assert result["department"] == "AREQUIPA"
        assert result["source_mode"] == "snapshot_local_referencial"
        assert len(result["features"]) == 1
        assert result["sha256"] == hashlib.sha256(raw).hexdigest()
        assert result["scope"] == "limites_referenciales"
    finally:
        snap._cached_snapshot.cache_clear()
        geo._department_boundary.cache_clear()


def test_corrupted_snapshot_not_silently_approximated(tmp_path, monkeypatch):
    f = tmp_path / "peru_departamentos.geojson"
    f.write_text('{"type":"FeatureCollection","features":[]}', encoding="utf-8")
    monkeypatch.setattr(snap, "SNAPSHOT_PATH", f)
    snap._cached_snapshot.cache_clear()
    geo._department_boundary.cache_clear()
    try:
        with pytest.raises(HTTPException) as exc:
            geo.department_boundary("LIMA")
        assert exc.value.status_code == 503
        assert "inválida" in exc.value.detail
    finally:
        snap._cached_snapshot.cache_clear()
        geo._department_boundary.cache_clear()
