"""Pruebas sin red ni credenciales, usando respuestas USGS simuladas."""

from datetime import datetime, timezone

import httpx
import pytest

from app.ingestion.usgs import USGSDataError, fetch_usgs_events, normalize_feature


def feature(event_id: str = "us123", *, updated: int = 1_760_000_050_000) -> dict:
    """Ejemplo mínimo de GeoJSON compatible con el contrato USGS."""
    return {
        "type": "Feature", "id": event_id,
        "geometry": {"type": "Point", "coordinates": [-77.1, -12.1, 35.2]},
        "properties": {
            "time": 1_760_000_000_000, "updated": updated, "mag": 4.3,
            "magType": "mb", "place": "Zona de prueba",
            "url": f"https://earthquake.usgs.gov/earthquakes/eventpage/{event_id}",
            "status": "reviewed",
        },
    }


def test_normalize_utc_and_geojson_coordinates() -> None:
    quake = normalize_feature(feature())
    assert quake.external_id == "us123"
    assert quake.longitude == -77.1
    assert quake.latitude == -12.1
    assert quake.depth_km == 35.2
    assert quake.magnitude == 4.3
    assert quake.magnitude_type == "mb"
    assert quake.review_status == "reviewed"
    assert quake.occurred_at.tzinfo == timezone.utc


def test_reject_invalid_geojson() -> None:
    invalid = feature()
    invalid["geometry"]["coordinates"] = [999, -12.1, 35.2]
    with pytest.raises(USGSDataError, match="longitud"):
        normalize_feature(invalid)


def test_pagination_and_no_duplicates() -> None:
    offsets = []

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.host == "earthquake.usgs.gov"
        assert request.url.params["eventtype"] == "earthquake"
        assert request.url.params["minlatitude"] == "-19.5"
        offset = int(request.url.params["offset"])
        offsets.append(offset)
        if offset == 1:
            data = [feature("us123"), feature("us456")]
        else:
            # El mismo evento revisado en otra página no se duplica.
            data = [feature("us123", updated=1_760_000_100_000)]
        return httpx.Response(200, json={"type": "FeatureCollection", "features": data})

    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        start = datetime(2025, 10, 12, tzinfo=timezone.utc)
        end = datetime(2025, 10, 14, tzinfo=timezone.utc)
        results = fetch_usgs_events(start, end, 2.5, page_size=2, client=client)
    assert offsets == [1, 3]
    assert len(results) == 2
    revised = next(v for v in results if v.external_id == "us123")
    assert revised.source_updated_at.timestamp() == 1_760_000_100


def test_no_data_204() -> None:
    with httpx.Client(transport=httpx.MockTransport(lambda _: httpx.Response(204))) as client:
        assert fetch_usgs_events(
            datetime(2026, 10, 1, tzinfo=timezone.utc),
            datetime(2026, 10, 2, tzinfo=timezone.utc), client=client,
        ) == []


def test_truncation_is_error_not_silent() -> None:
    with httpx.Client(transport=httpx.MockTransport(
        lambda _: httpx.Response(200, json={"features": [feature()]})
    )) as client:
        with pytest.raises(USGSDataError, match="máximo de páginas"):
            fetch_usgs_events(
                datetime(2026, 10, 1, tzinfo=timezone.utc),
                datetime(2026, 10, 2, tzinfo=timezone.utc),
                page_size=1, max_pages=1, client=client,
            )
