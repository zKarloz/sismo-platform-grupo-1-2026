"""Tests del lector IGP: sin consultas externas ni acceso a Supabase."""
from datetime import datetime, timezone

import pytest

import httpx
from fastapi.testclient import TestClient

from app.igp.client import IGPFeedError, normalize, query
from app.main import app


def _recent():
    return {
        "attributes": {
            "objectid": 45, "code": "2026-0840",
            # Instante real UTC: 23/10/2026 13:38:13 en Perú.
            "fechaevento": int(datetime(2026, 10, 23, 18, 38, 13, tzinfo=timezone.utc).timestamp() * 1000),
            "hora": "13:38:13", "lat": -12.1, "lon": -77.0,
            "prof": 35, "magnitud": 3.7,
            "ref": "Cerca de la costa de Lima",
        },
        "geometry": {"x": -77.0, "y": -12.1},
    }


def test_recent_normalization_local_hour_to_utc():
    item = normalize(_recent(), "recent")
    assert item["external_id"] == "2026-0840"
    assert item["occurred_at"].endswith("+00:00")
    assert item["occurred_at"] == "2026-10-23T18:38:13+00:00"
    assert item["latitude"] == -12.1
    assert item["magnitude"] == 3.7
    assert item["source_name"] == "IGP/CENSIS"


def test_latest_uses_separate_contract():
    item = normalize({"attributes": {
        "OBJECTID": 7, "fecha_local": "23/10/2026", "hora_local": "13:38:13",
        "latitud": -12.1, "longitud": -77.0, "profundidad": 35,
        "magnitud": 3.7, "referencia": "Lima",
    }}, "latest")
    assert datetime.fromisoformat(item["occurred_at"]) == datetime(2026, 10, 23, 18, 38, 13, tzinfo=timezone.utc)


def test_query_params_and_order():
    seen = []
    def handler(request):
        seen.append(request)
        assert request.url.host == "ide.igp.gob.pe"
        assert request.url.params["f"] == "json"
        assert "fechaevento" in request.url.params["orderByFields"]
        return httpx.Response(200, json={"features": [_recent()]})
    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        records = query("recent", client=client)
    assert len(seen) == 1 and len(records) == 1


def test_empty_feed_and_official_errors():
    with httpx.Client(transport=httpx.MockTransport(lambda _: httpx.Response(200, json={"features": []}))) as client:
        assert query("recent", client=client) == []
    with httpx.Client(transport=httpx.MockTransport(lambda _: httpx.Response(200, json={"error": {"message": "invalid"}}))) as client:
        from app.igp.client import IGPUnavailable
        import pytest
        with pytest.raises(IGPUnavailable):
            query("recent", client=client)


def test_broken_feature_rejected():
    import pytest
    with pytest.raises(IGPFeedError):
        normalize({"attributes": {"objectid": 10, "hora": "xx"}}, "recent")


def test_live_api_read_only(monkeypatch):
    import app.routes.igp as route
    route._cache.clear()
    monkeypatch.setattr(route, "query", lambda feed, limit: [normalize(_recent(), "recent")])
    with TestClient(app) as client:
        response = client.get('/api/v1/igp/recent')
        assert response.status_code == 200
        assert response.json()["items"][0]["source_name"] == "IGP/CENSIS"
        assert client.post('/api/v1/igp/recent').status_code == 405
    route._cache.clear()


def _recent_report(*, code: str, timestamp_utc: str, hora_local: str, place: str) -> dict:
    """Fixture de un sismo IGP con fechaevento ArcGIS en UTC y hora local."""
    epoch_ms = int(datetime.fromisoformat(timestamp_utc).timestamp() * 1000)
    return {
        "attributes": {
            "objectid": int(code.split("-")[-1]),
            "code": code,
            "fechaevento": epoch_ms,
            "hora": hora_local,
            "lat": -12.0, "lon": -77.0,
            "prof": 25, "magnitud": 4.0,
            "ref": place,
        },
        "geometry": {"x": -77.0, "y": -12.0},
    }


@pytest.mark.parametrize("code,utc_instant,local_hour", [
    # El error anterior desplazaba +1 día los eventos nocturnos de Cusco, Vitor y Quilca.
    ("2026-0746", "2026-10-23T04:25:24+00:00", "23:25:24"),
    ("2026-0745", "2026-10-21T03:12:48+00:00", "22:12:48"),
    ("2026-0738", "2026-10-17T04:28:10+00:00", "23:28:10"),
    # El evento de Loreto ya se mostraba correctamente.
    ("2026-0747", "2026-10-23T18:38:13+00:00", "13:38:13"),
    # Un evento vespertino que cruza medianoche UTC tampoco debe desplazarse.
    ("2026-0737", "2026-10-18T01:50:33+00:00", "20:50:33"),
])
def test_recent_preserves_true_local_calendar_day(code, utc_instant, local_hour):
    """La fecha y hora resultantes deben corresponder al origen publicado por IGP."""
    feature = _recent_report(
        code=code, timestamp_utc=utc_instant, hora_local=local_hour, place="IGP test",
    )
    item = normalize(feature, "recent")
    assert item["occurred_at"] == utc_instant


def test_recent_sorted_after_local_date_correction():
    """Loreto debe preceder Cusco, aunque ambos eventos estén el mismo día UTC."""
    features = [
        _recent_report(code="2026-0746", timestamp_utc="2026-10-23T04:25:24+00:00", hora_local="23:25:24", place="Cusco"),
        _recent_report(code="2026-0745", timestamp_utc="2026-10-21T03:12:48+00:00", hora_local="22:12:48", place="Vitor"),
        _recent_report(code="2026-0747", timestamp_utc="2026-10-23T18:38:13+00:00", hora_local="13:38:13", place="Loreto"),
    ]
    with httpx.Client(transport=httpx.MockTransport(lambda _: httpx.Response(200, json={"features": features}))) as client:
        records = query("recent", client=client)
    assert [r["external_id"] for r in records] == ["2026-0747", "2026-0746", "2026-0745"]

