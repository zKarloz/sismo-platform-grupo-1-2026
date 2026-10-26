"""Pruebas IGP 2026: paginación, fechas, enlaces, seguridad y modo dry-run."""
from datetime import datetime, timezone
import httpx
import pytest

from app.igp.client import IGPUnavailable, official_report_url, normalize
from app.igp.year2026 import fetch_igp_year_2026
from app.commands import backfill_igp_2026


def feature(code: str, objectid: int, *, valid=True):
    attrs = {
        "objectid": objectid, "code": code,
        "fechaevento": int(datetime(2026, 10, 24, 18, tzinfo=timezone.utc).timestamp() * 1000) if valid else None,
        "hora": "13:00:00", "lat": -12.0, "lon": -77.0,
        "prof": 30, "magnitud": 3.6, "ref": "Lima",
    }
    return {"attributes": attrs}


def test_individual_official_links_and_safe_fallback():
    assert official_report_url("2026-0647") == "https://ultimosismo.igp.gob.pe/evento/2026-0647"
    assert official_report_url("../../evil") == "https://ultimosismo.igp.gob.pe/productos/reportes-sismicos"
    assert normalize(feature("2026-0647", 12), "recent")["source_url"].endswith("/evento/2026-0647")
    assert normalize(feature("2026-0647", 12), "recent")["occurred_at"] == "2026-10-24T18:00:00+00:00"


def test_year2026_paged_without_silent_truncation():
    requests = []
    responses = [
        [feature("2026-0001", 1), feature("2026-0002", 2, valid=False)],
        [feature("2026-0003", 3)],
    ]
    def handler(request):
        requests.append(request)
        assert request.url.params["where"] == "code LIKE '2026-%'"
        assert request.url.params["orderByFields"] == "objectid ASC"
        offset = int(request.url.params["resultOffset"])
        return httpx.Response(200, json={"features": responses[offset // 2]})
    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        result = fetch_igp_year_2026(page_size=2, client=client)
    assert [r["external_id"] for r in result] == ["2026-0001", "2026-0003"]
    assert result.total == 3
    assert len(result.skipped) == 1
    assert [int(r.url.params["resultOffset"]) for r in requests] == [0, 2]


def test_year_repeated_page_rejected():
    with httpx.Client(transport=httpx.MockTransport(
        lambda _: httpx.Response(200, json={"features": [feature("2026-0001", 1)]})
    )) as client:
        with pytest.raises(IGPUnavailable, match="max_pages"):
            fetch_igp_year_2026(page_size=1, max_pages=1, client=client)
    # Una página duplicada se detecta antes de dar el backfill por completo.
    with httpx.Client(transport=httpx.MockTransport(
        lambda _: httpx.Response(200, json={"features": [feature("2026-0001", 1)]})
    )) as client:
        with pytest.raises(IGPUnavailable, match="repetida"):
            fetch_igp_year_2026(page_size=1, max_pages=3, client=client)


def test_dry_run_never_writes(monkeypatch):
    from app.igp.client import IGPQueryResult
    monkeypatch.setattr(backfill_igp_2026, "fetch_igp_year_2026", lambda **kwargs:
        IGPQueryResult([{"external_id": "2026-0001"}], total=2, skipped=["2026-0002: Fecha inválida"]))
    monkeypatch.setattr(backfill_igp_2026, "sync_igp", lambda **kwargs:
        pytest.fail("dry-run jamás debe escribir a Supabase"))
    result = backfill_igp_2026.run(apply=False)
    assert result == {"year": 2026, "seen": 2, "valid": 1, "skipped": 1, "mode": "dry_run"}


def test_apply_batches_keep_skipped_counts(monkeypatch):
    from app.igp.client import IGPQueryResult
    from types import SimpleNamespace
    from uuid import uuid4
    data = IGPQueryResult([
        {"external_id": f"2026-{i:04d}"} for i in range(5)
    ], total=6, skipped=["2026-0006: Fecha inválida"])
    monkeypatch.setattr(backfill_igp_2026, "fetch_igp_year_2026", lambda **kwargs: data)
    seen=[]
    def fake_sync(*, limit, fetch):
        rows = fetch(limit)
        seen.append(rows)
        return SimpleNamespace(inserted=len(rows), updated=0, unchanged=0, run_id=uuid4())
    monkeypatch.setattr(backfill_igp_2026, "sync_igp", fake_sync)
    result=backfill_igp_2026.run(apply=True, page_size=2)
    assert (result["inserted"], result["skipped"], result["status"]) == (5, 1, "partial")
    assert len(seen)==3 and seen[-1].total==2 and len(seen[-1].skipped)==1
