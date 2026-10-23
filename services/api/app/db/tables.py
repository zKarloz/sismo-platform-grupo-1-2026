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
