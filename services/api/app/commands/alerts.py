"""CLI privado de la Fase 7. No registrar credenciales ni enviar correos por defecto.

Ejemplos detallados en docs/FASE_7.md. Los comandos requieren DATABASE_URL
privado. --actor-email registra identidad DECLARADA, no autenticación formal.
"""
from __future__ import annotations

import argparse
import json
from uuid import UUID

from sqlalchemy.exc import SQLAlchemyError

from app.alerts.service import (
    bootstrap_user, create_rule, activate_rule, simulate, evaluate,
    review, dispatch, acknowledge,
)
from app.db.session import get_engine


def main() -> None:
    parser = argparse.ArgumentParser(description='Avisos informativos por sismos ya reportados')
    sub = parser.add_subparsers(dest='cmd', required=True)

    bootstrap = sub.add_parser('bootstrap-operator', help='Crear usuario interno por operador de BD')
    bootstrap.add_argument('--email', required=True)
    bootstrap.add_argument('--name', required=True)

    create = sub.add_parser('create-rule', help='Crear regla DESACTIVADA')
    create.add_argument('--actor-email', required=True)
    create.add_argument('--name', required=True)
    create.add_argument('--min-magnitude', type=float, required=True)
    create.add_argument('--source', default='IGP/CENSIS')
    create.add_argument('--zone', default='{"min_lat":-19.5,"max_lat":0.5,"min_lon":-84,"max_lon":-68}')
    create.add_argument('--severity', choices=['info', 'review', 'high'], default='info')
    create.add_argument('--channel', choices=['in_app', 'email'], default='in_app')
    create.add_argument('--destination')
    create.add_argument('--max-depth-km', type=float)
    create.add_argument('--cooldown-seconds', type=int, default=1800)
    create.add_argument('--start-hour-peru', type=int)
    create.add_argument('--end-hour-peru', type=int)
    create.add_argument('--no-approval', action='store_true', help='Solo para in_app; nunca para email')
    create.add_argument('--title-template', default='Sismo registrado: M {magnitude}')
    create.add_argument('--body-template', default='Sismo M {magnitude} en {place}, profundidad {depth_km} km, {occurred_at}. Fuente: {source_url}')

    enable = sub.add_parser('activate-rule', help='Habilitar regla desde AHORA; no reprocesar histórico')
    enable.add_argument('--id', type=UUID, required=True)
    enable.add_argument('--actor-email', required=True)
    disable = sub.add_parser('disable-rule')
    disable.add_argument('--id', type=UUID, required=True)
    disable.add_argument('--actor-email', required=True)

    test = sub.add_parser('simulate', help='Simulación sin persistencia ni envíos')
    test.add_argument('--rule-id', type=UUID, required=True)
    test.add_argument('--event-id', type=UUID, required=True)

    sub.add_parser('evaluate', help='Crear avisos sobre eventos reales recientes')
    approve = sub.add_parser('approve', help='Revisión humana desde CLI privado')
    approve.add_argument('--id', type=UUID, required=True)
    approve.add_argument('--actor-email', required=True)
    cancel = sub.add_parser('cancel')
    cancel.add_argument('--id', type=UUID, required=True)
    cancel.add_argument('--actor-email', required=True)

    send = sub.add_parser('dispatch', help='Publicar in_app; email requiere --send-email')
    send.add_argument('--send-email', action='store_true')
    ack = sub.add_parser('ack', help='Acuse del operador, no lectura del destinatario')
    ack.add_argument('--delivery-id', type=UUID, required=True)
    ack.add_argument('--actor-email', required=True)

    args = parser.parse_args()
    try:
        engine = get_engine()
        if args.cmd == 'bootstrap-operator':
            outcome = {'operator_id': str(bootstrap_user(engine, email=args.email, name=args.name))}
        elif args.cmd == 'create-rule':
            outcome = {'rule_id': str(create_rule(
                engine, actor_email=args.actor_email, name=args.name,
                min_magnitude=args.min_magnitude, zone=json.loads(args.zone),
                source=args.source, channel=args.channel,
                destination=args.destination, severity=args.severity,
                max_depth_km=args.max_depth_km, cooldown_seconds=args.cooldown_seconds,
                requires_approval=not args.no_approval,
                start_hour_peru=args.start_hour_peru, end_hour_peru=args.end_hour_peru,
                title=args.title_template, body=args.body_template,
            )), 'enabled': False}
        elif args.cmd in ('activate-rule', 'disable-rule'):
            activate_rule(engine, rule_id=args.id, actor_email=args.actor_email,
                          enabled=args.cmd == 'activate-rule')
            outcome = {'ok': True, 'enabled': args.cmd == 'activate-rule'}
        elif args.cmd == 'simulate':
            outcome = simulate(engine, rule_id=args.rule_id, event_id=args.event_id)
        elif args.cmd == 'evaluate':
            outcome = evaluate(engine)
        elif args.cmd in ('approve', 'cancel'):
            review(engine, alert_id=args.id, actor_email=args.actor_email, approve=args.cmd == 'approve')
            outcome = {'ok': True, 'status': 'approved' if args.cmd == 'approve' else 'cancelled'}
        elif args.cmd == 'dispatch':
            outcome = dispatch(engine, send_email=args.send_email)
        elif args.cmd == 'ack':
            acknowledge(engine, delivery_id=args.delivery_id, actor_email=args.actor_email)
            outcome = {'ok': True}
        else:
            raise ValueError('Comando desconocido')
        print(json.dumps(outcome, indent=2, ensure_ascii=False))
    except (ValueError, RuntimeError, json.JSONDecodeError) as exc:
        # No imprimir traceback SQL ni URL de conexión (puede contener password).
        parser.exit(1, f'ERROR: {type(exc).__name__}: {exc}\n')
    except SQLAlchemyError:
        parser.exit(1, 'ERROR: Falló la operación en Supabase. Revisar la migración 004 y la conectividad.\n')


if __name__ == '__main__':
    main()
