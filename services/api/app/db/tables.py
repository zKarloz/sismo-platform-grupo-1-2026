"""Tablas SQLAlchemy Core de la migración 001, sin crear ni modificar el esquema.

Usar exactamente los campos existentes en Supabase; las tablas restantes de la
migración (usuarios, reglas, alertas, auditoría) se implementarán por módulo.
"""

from sqlalchemy import (
    Column, DateTime, Float, ForeignKey, Integer, MetaData,
    String, Table, Text, UniqueConstraint, Uuid, text,
)

metadata = MetaData(schema="public")

sources = Table(
    "data_sources", metadata,
    Column("id", Uuid(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")),
    Column("name", Text, nullable=False),
    Column("organization", Text, nullable=False),
    Column("base_url", Text, nullable=False),
    Column("source_type", String, nullable=False),
    Column("status", String, nullable=False),
    Column("sync_interval_minutes", Integer),
    Column("license_notes", Text),
    Column("last_sync_at", DateTime(timezone=True)),
    Column("last_success_at", DateTime(timezone=True)),
    Column("created_at", DateTime(timezone=True)),
    Column("updated_at", DateTime(timezone=True)),
)

runs = Table(
    "ingestion_runs", metadata,
    Column("id", Uuid(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")),
    Column("source_id", Uuid(as_uuid=True), ForeignKey("public.data_sources.id"), nullable=False),
    Column("started_at", DateTime(timezone=True)),
    Column("finished_at", DateTime(timezone=True)),
    Column("status", String, nullable=False),
    Column("records_seen", Integer),
    Column("records_inserted", Integer),
    Column("records_updated", Integer),
    Column("error_summary", Text),
)

events = Table(
    "seismic_events", metadata,
    Column("id", Uuid(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")),
    Column("source_id", Uuid(as_uuid=True), ForeignKey("public.data_sources.id"), nullable=False),
    Column("external_id", Text, nullable=False),
    Column("occurred_at", DateTime(timezone=True), nullable=False),
    Column("latitude", Float, nullable=False),
    Column("longitude", Float, nullable=False),
    Column("magnitude", Float),
    Column("magnitude_type", Text),
    Column("depth_km", Float),
    Column("place", Text),
    Column("source_url", Text, nullable=False),
    Column("source_updated_at", DateTime(timezone=True)),
    Column("review_status", String, nullable=False),
    Column("received_at", DateTime(timezone=True)),
    Column("updated_at", DateTime(timezone=True)),
    UniqueConstraint("source_id", "external_id", name="seismic_events_source_external_uq"),
)

# Fase 5: metadatos de snapshots y copia inmutable de eventos; migración 002.
# El tipo genérico JSON es compatible con el JSONB declarado en PostgreSQL.
from sqlalchemy import JSON

datasets = Table(
    "datasets", metadata,
    Column("id", Uuid(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")),
    Column("name", Text, nullable=False),
    Column("version", Integer, nullable=False),
    Column("query_spec", JSON, nullable=False),
    Column("period_start", DateTime(timezone=True)),
    Column("period_end", DateTime(timezone=True)),
    Column("row_count", Integer, nullable=False),
    Column("quality_report", JSON, nullable=False),
    Column("content_sha256", Text, nullable=False),
    Column("created_at", DateTime(timezone=True)),
    UniqueConstraint("name", "version", name="datasets_name_version_uq"),
)

snapshot_rows = Table(
    "dataset_snapshots", metadata,
    Column("dataset_id", Uuid(as_uuid=True), ForeignKey("public.datasets.id"), primary_key=True),
    Column("position", Integer, primary_key=True),
    Column("event_id", Uuid(as_uuid=True), ForeignKey("public.seismic_events.id"), nullable=False),
    Column("record", JSON, nullable=False),
    UniqueConstraint("dataset_id", "event_id", name="dataset_snapshots_dataset_event_uq"),
)

# Captura IGP instrumental: filas históricas independientes de seismic_events.
# La tabla operativa sigue intacta; requiere migración IGP_HISTORICO_DATASETS_01.sql.
historical_snapshot_rows = Table(
    "igp_historical_dataset_snapshots", metadata,
    Column("dataset_id", Uuid(as_uuid=True), ForeignKey("public.datasets.id"), primary_key=True),
    Column("position", Integer, primary_key=True),
    Column("source_row", Integer, nullable=False),
    Column("split", Text, nullable=False),
    Column("record", JSON, nullable=False),
    UniqueConstraint("dataset_id", "source_row", name="igp_history_dataset_source_row_uq"),
)

# Fase 6: tabla append-only de experimentos retrospectivos (migración 003).
ml_experiments = Table(
    "ml_experiments", metadata,
    Column("id", Uuid(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")),
    Column("dataset_id", Uuid(as_uuid=True), ForeignKey("public.datasets.id"), nullable=False),
    Column("batch_id", Uuid(as_uuid=True), nullable=False),
    Column("task_type", Text, nullable=False),
    Column("algorithm", Text, nullable=False),
    Column("target_name", Text, nullable=False),
    Column("model_version", Text, nullable=False),
    Column("features", JSON, nullable=False),
    Column("params", JSON, nullable=False),
    Column("metrics", JSON, nullable=False),
    Column("validation_spec", JSON, nullable=False),
    Column("dataset_sha256", Text, nullable=False),
    Column("seed", Integer, nullable=False),
    Column("limitations", Text, nullable=False),
    Column("status", Text, nullable=False),
    Column("created_at", DateTime(timezone=True)),
)

# Fase 7 · extensiones no destructivas de las tablas de migración 001 / 004.
from sqlalchemy import Boolean, Numeric, SmallInteger

users = Table(
    'users', metadata,
    Column('id', Uuid(as_uuid=True), primary_key=True, server_default=text('gen_random_uuid()')),
    Column('auth_user_id', Uuid(as_uuid=True), unique=True),
    Column('full_name', Text, nullable=False),
    Column('email', Text, nullable=False),
    Column('role', Text, nullable=False),
    Column('status', Text, nullable=False),
    Column('last_login_at', DateTime(timezone=True)),
    Column('created_at', DateTime(timezone=True)),
    Column('updated_at', DateTime(timezone=True)),
)
alert_rules = Table(
    'alert_rules', metadata,
    Column('id', Uuid(as_uuid=True), primary_key=True, server_default=text('gen_random_uuid()')),
    Column('name', Text, nullable=False, unique=True),
    Column('min_magnitude', Numeric(4, 1), nullable=False),
    Column('max_depth_km', Numeric(7, 2)),
    Column('zone_spec', JSON, nullable=False),
    Column('severity', Text, nullable=False),
    Column('channel', Text, nullable=False),
    Column('cooldown_seconds', Integer, nullable=False),
    Column('enabled', Boolean, nullable=False),
    Column('requires_approval', Boolean, nullable=False),
    Column('created_by', Uuid(as_uuid=True), ForeignKey('public.users.id')),
    Column('created_at', DateTime(timezone=True)),
    Column('updated_at', DateTime(timezone=True)),
    Column('source_id', Uuid(as_uuid=True), ForeignKey('public.data_sources.id')),
    Column('destination_ref', Text),
    Column('template_title', Text),
    Column('template_body', Text),
    Column('start_hour_peru', SmallInteger),
    Column('end_hour_peru', SmallInteger),
    Column('activated_at', DateTime(timezone=True)),
)
alerts = Table(
    'alerts', metadata,
    Column('id', Uuid(as_uuid=True), primary_key=True, server_default=text('gen_random_uuid()')),
    Column('event_id', Uuid(as_uuid=True), ForeignKey('public.seismic_events.id'), nullable=False),
    Column('rule_id', Uuid(as_uuid=True), ForeignKey('public.alert_rules.id'), nullable=False),
    Column('severity', Text, nullable=False),
    Column('title', Text, nullable=False),
    Column('message', Text, nullable=False),
    Column('source_url', Text, nullable=False),
    Column('status', Text, nullable=False),
    Column('disclaimer', Text),
    Column('approved_by', Uuid(as_uuid=True), ForeignKey('public.users.id')),
    Column('approved_at', DateTime(timezone=True)),
    Column('created_at', DateTime(timezone=True)),
    UniqueConstraint('event_id', 'rule_id', name='alerts_event_rule_uq'),
)
deliveries = Table(
    'alert_deliveries', metadata,
    Column('id', Uuid(as_uuid=True), primary_key=True, server_default=text('gen_random_uuid()')),
    Column('alert_id', Uuid(as_uuid=True), ForeignKey('public.alerts.id'), nullable=False),
    Column('channel', Text, nullable=False),
    Column('destination_ref', Text, nullable=False),
    Column('status', Text, nullable=False),
    Column('attempts', Integer, nullable=False),
    Column('last_attempt_at', DateTime(timezone=True)),
    Column('next_attempt_at', DateTime(timezone=True)),
    Column('delivered_at', DateTime(timezone=True)),
    Column('acknowledged_at', DateTime(timezone=True)),
    Column('error_code', Text),
    Column('created_at', DateTime(timezone=True)),
    UniqueConstraint('alert_id','channel','destination_ref', name='alert_deliveries_unique'),
)
audit_logs = Table(
    'audit_logs', metadata,
    Column('id', Uuid(as_uuid=True), primary_key=True, server_default=text('gen_random_uuid()')),
    Column('actor_id', Uuid(as_uuid=True), ForeignKey('public.users.id')),
    Column('action', Text, nullable=False),
    Column('entity_type', Text, nullable=False),
    Column('entity_id', Uuid(as_uuid=True)),
    Column('before_json', JSON),
    Column('after_json', JSON),
    Column('result', Text, nullable=False),
    Column('correlation_id', Uuid(as_uuid=True)),
    Column('occurred_at', DateTime(timezone=True)),
)

# Preferencias personales de correo y entregas por usuario. Migración 006.
# No se mezclan con las reglas globales/alert_deliveries ni con ML.
notification_preferences = Table(
    'notification_preferences', metadata,
    Column('user_id', Uuid(as_uuid=True), ForeignKey('public.users.id'), primary_key=True),
    Column('enabled', Boolean, nullable=False),
    Column('source_id', Uuid(as_uuid=True), ForeignKey('public.data_sources.id'), nullable=False),
    Column('min_magnitude', Numeric(4, 1), nullable=False),
    Column('activated_at', DateTime(timezone=True)),
    Column('updated_at', DateTime(timezone=True)),
)
personal_deliveries = Table(
    'personal_notification_deliveries', metadata,
    Column('id', Uuid(as_uuid=True), primary_key=True, server_default=text('gen_random_uuid()')),
    Column('user_id', Uuid(as_uuid=True), ForeignKey('public.users.id'), nullable=False),
    Column('event_id', Uuid(as_uuid=True), ForeignKey('public.seismic_events.id'), nullable=False),
    Column('status', Text, nullable=False),
    Column('attempts', Integer, nullable=False),
    Column('created_at', DateTime(timezone=True)),
    Column('last_attempt_at', DateTime(timezone=True)),
    Column('next_attempt_at', DateTime(timezone=True)),
    Column('sent_at', DateTime(timezone=True)),
    Column('error_code', Text),
    UniqueConstraint('user_id', 'event_id', name='personal_notification_unique'),
)

# Fase 8: registro de descargas generado por servidor y parámetros no secretos.
report_exports = Table(
    'report_exports', metadata,
    Column('id', Uuid(as_uuid=True), primary_key=True, server_default=text('gen_random_uuid()')),
    Column('requester_id', Uuid(as_uuid=True), ForeignKey('public.users.id'), nullable=False),
    Column('report_name', Text, nullable=False),
    Column('report_type', Text, nullable=False),
    Column('file_format', Text, nullable=False),
    Column('filters', JSON, nullable=False),
    Column('cutoff_at', DateTime(timezone=True), nullable=False),
    Column('created_at', DateTime(timezone=True)),
    Column('status', Text, nullable=False),
    Column('row_count', Integer, nullable=False),
    Column('byte_count', Integer, nullable=False),
    Column('content_sha256', Text),
    Column('filename', Text),
    Column('temp_path', Text),
    Column('expires_at', DateTime(timezone=True)),
)
system_settings = Table(
    'system_settings', metadata,
    Column('key', Text, primary_key=True),
    Column('value_int', Integer, nullable=False),
    Column('updated_at', DateTime(timezone=True)),
    Column('updated_by', Uuid(as_uuid=True), ForeignKey('public.users.id')),
)
