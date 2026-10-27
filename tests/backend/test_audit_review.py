"""Regresiones de filtros y privacidad, sin conexión a PostgreSQL real."""
from datetime import date

import pytest
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.dialects import postgresql

from app.audit.filters import audit_join, audit_conditions, sanitized_json
from app.db.tables import audit_logs


def test_conditions_escape_literal_search_and_apply_matching_categories():
    relation, actor, subject = audit_join()
    filters = audit_conditions('Ana_%', 'usuarios', 'success', None, None, actor, subject)
    statement = select(audit_logs.c.id).select_from(relation).where(*filters)
    compiled = statement.compile(dialect=postgresql.dialect())
    sql = str(compiled)
    # La entrada del usuario se trata como parámetro, jamás como SQL interpolado.
    assert 'Ana_%' not in sql
    assert any('Ana\\_\\%' in str(value) for value in compiled.params.values())
    assert 'identity.user.' in str(compiled.params)
    assert 'audit_logs.result' in sql


def test_peru_dates_generate_utc_bounds_including_end_day():
    _, actor, subject = audit_join()
    conditions = audit_conditions('', 'todos', 'todos', date(2026, 10, 26), date(2026, 10, 26), actor, subject)
    query = select(audit_logs.c.id).where(*conditions)
    params = query.compile(dialect=postgresql.dialect()).params
    utc_dates = [v.isoformat() for v in params.values() if hasattr(v, 'isoformat')]
    assert '2026-10-26T05:00:00+00:00' in utc_dates
    assert '2026-10-27T05:00:00+00:00' in utc_dates


def test_inverted_peru_dates_rejected():
    _, actor, subject = audit_join()
    with pytest.raises(HTTPException) as err:
        audit_conditions('', 'todos', 'todos', date(2026, 10, 27), date(2026, 10, 26), actor, subject)
    assert err.value.status_code == 422


def test_json_redaction_recursive_and_preserves_non_secret_changes():
    value = {'role':'analista', 'access_token':'abc', 'deep':{'smtp_password':'clave', 'status':'active'},
             'records':[{'api_key':'hidden'}, {'enabled':True}]}
    safe = sanitized_json(value)
    assert safe['role'] == 'analista'
    assert safe['access_token'] == '[REDACTADO]'
    assert safe['deep']['smtp_password'] == '[REDACTADO]'
    assert safe['records'][0]['api_key'] == '[REDACTADO]'
    assert safe['records'][1]['enabled'] is True
