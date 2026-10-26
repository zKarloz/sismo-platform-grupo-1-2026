"""Pruebas del respaldo CSV oficial, sin red ni cambios de base de datos."""
from __future__ import annotations

from hashlib import sha256
import pytest

from app.igp import history_catalog as catalog
from app.routes.igp_history import source_info

CSV_HEADER = 'ID,FECHA_UTC,HORA_UTC,LATITUD,LONGITUD,PROFUNDIDAD,MAGNITUD,FECHA_CORTE\n'
CSV_EVENT = '0,20240305,12345,-12.3,-77.1,33,4.5,20260528\n'


def test_local_csv_snapshot_has_provenance_and_valid_date(tmp_path, monkeypatch):
    source = tmp_path / 'igp_catalogo_1960_2025.csv'
    data = (CSV_HEADER + CSV_EVENT).encode('utf-8')
    source.write_bytes(data)
    monkeypatch.setenv('IGP_HISTORY_CSV_PATH', str(source))
    result = catalog._read_source()
    assert result.source_mode == 'official_csv_snapshot'
    assert result.total_source == 1 and result.skipped == 0
    assert result.csv_sha256 == sha256(data).hexdigest()
    assert result.events[0]['fecha_utc'] == '2024-03-05T01:23:45+00:00'
    info = source_info(result)
    assert info['source_mode'] == 'official_csv_snapshot'
    assert 'no es la fecha de publicación' in info['warning']


def test_local_csv_semicolon_and_bom(tmp_path, monkeypatch):
    source = tmp_path / 'sismos.csv'
    source.write_text((CSV_HEADER + CSV_EVENT).replace(',', ';'), encoding='utf-8-sig')
    monkeypatch.setenv('IGP_HISTORY_CSV_PATH', str(source))
    assert len(catalog._read_source().events) == 1


@pytest.mark.parametrize('invalid',[b'ID,NOMBRE\n1,mal\n', b'', b'<html>error</html>'])
def test_invalid_download_is_not_treated_as_catalog(tmp_path, monkeypatch, invalid):
    source = tmp_path / 'catalog.csv'
    source.write_bytes(invalid)
    monkeypatch.setenv('IGP_HISTORY_CSV_PATH', str(source))
    with pytest.raises(catalog.CatalogError):
        catalog._read_source()


def test_explicit_missing_csv_is_not_silently_ignored(tmp_path, monkeypatch):
    monkeypatch.setenv('IGP_HISTORY_CSV_PATH', str(tmp_path / 'missing.csv'))
    with pytest.raises(catalog.CatalogError, match='No se encontró'):
        catalog._read_source()


def test_snapshot_cannot_truncate_rows_silently(tmp_path, monkeypatch):
    source = tmp_path / 'catalog.csv'
    source.write_text(CSV_HEADER + CSV_EVENT * 2, encoding='utf-8')
    monkeypatch.setenv('IGP_HISTORY_CSV_PATH', str(source))
    with pytest.raises(catalog.CatalogError, match='duplicados'):
        catalog._read_source()


def test_cli_retains_snapshot_metadata(tmp_path, monkeypatch, capsys):
    from app.commands import check_igp_history
    source = tmp_path / 'catalog.csv'
    source.write_text(CSV_HEADER + CSV_EVENT, encoding='utf-8')
    monkeypatch.setenv('IGP_HISTORY_CSV_PATH', str(source))
    monkeypatch.setattr(catalog, '_cache', None)
    monkeypatch.setattr("sys.argv", ["check_igp_history", "--year", "2024"])
    assert check_igp_history.main() == 0
    output = capsys.readouterr().out
    assert 'official_csv_snapshot' in output
    assert 'original_csv_sha256' in output
