"""Retención controlada de metadatos expirados (sin borrar auditoría).

Uso: python -m app.commands.prune_reports [--apply]
Por defecto hace únicamente un dry-run. El borrado deja resumen en audit_logs.
"""
import argparse
from datetime import datetime, timezone
from sqlalchemy import delete, func, select

from app.db.session import get_engine
from app.db.tables import report_exports, audit_logs


def main() -> None:
    parser=argparse.ArgumentParser(description='Retención de historial de reportes expirados')
    parser.add_argument('--apply',action='store_true',help='Ejecutar purga, no solo mostrar conteo')
    args=parser.parse_args()
    cutoff=datetime.now(timezone.utc)
    engine=get_engine()
    with engine.begin() as conn:
        amount=conn.execute(select(func.count()).select_from(report_exports)
                            .where(report_exports.c.expires_at < cutoff)).scalar_one()
        if args.apply and amount:
            conn.execute(delete(report_exports).where(report_exports.c.expires_at < cutoff))
            conn.execute(audit_logs.insert().values(
                action='report.history.pruned',entity_type='report_exports',
                after_json={'rows_deleted':amount,'cutoff_utc':cutoff.isoformat(),
                            'note':'Sólo metadatos, ningún dataset ni archivo'},result='success'))
    print({'dry_run':not args.apply,'expired_manifests':amount,
           'audit_logs_deleted':0,'datasets_modified':0})


if __name__=='__main__':
    main()
