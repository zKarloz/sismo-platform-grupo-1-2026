"""Validación aislada del proxy cartográfico INGEMMET; sin peticiones externas."""
import io
import json

import pytest
from fastapi import HTTPException

from app.routes import geo


@pytest.fixture(autouse=True)
def reset_cache():
    geo._department_boundary.cache_clear()
    yield
    geo._department_boundary.cache_clear()


def test_department_validation_rejects_unknown():
    with pytest.raises(HTTPException) as err:
        geo.department_boundary('NO-EXISTE')
    assert err.value.status_code == 422


def test_department_fetch_geojson_and_cache(monkeypatch):
    monkeypatch.setattr(geo, "boundary_from_snapshot", lambda code: None)
    calls = []

    class Response:
        def __enter__(self): return self
        def __exit__(self, *_): pass
        def read(self, _):
            return json.dumps({'type': 'FeatureCollection', 'features': [
                {'type': 'Feature', 'geometry': {'type': 'Polygon', 'coordinates': [
                    [[-77, -12], [-76, -12], [-76, -11], [-77, -11], [-77, -12]]]},
                 'properties': {'NM_DEPA': 'LIMA'}}]}).encode()

    def fake_urlopen(request, timeout):
        calls.append(request.full_url)
        assert timeout == 15
        return Response()

    monkeypatch.setattr(geo, 'urlopen', fake_urlopen)
    first = geo.department_boundary('lima')
    second = geo.department_boundary('LIMA')
    assert first['department'] == second['department'] == 'LIMA'
    assert first['scope'] == 'limites_referenciales'
    assert len(calls) == 1
    assert "NM_DEPA%3D%27LIMA%27" in calls[0]


def test_department_no_geometry_is_not_replaced_by_rectangle(monkeypatch):
    monkeypatch.setattr(geo, "boundary_from_snapshot", lambda code: None)
    class Response:
        def __enter__(self): return self
        def __exit__(self, *_): pass
        def read(self, _): return b'{"type":"FeatureCollection","features":[]}'
    monkeypatch.setattr(geo, 'urlopen', lambda *args, **kwargs: Response())
    with pytest.raises(HTTPException) as err:
        geo.department_boundary('LIMA')
    assert err.value.status_code == 503
