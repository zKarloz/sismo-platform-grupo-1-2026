"""CLI para evaluar preferencias y enviar email, no existe endpoint público de envío."""
import argparse
import json

from sqlalchemy.exc import SQLAlchemyError
from app.db.session import get_engine
from app.notifications.service import dispatch, evaluate


def main():
    parser = argparse.ArgumentParser(description='Notificaciones individuales opt-in')
    parser.add_argument('action', choices=['evaluate', 'dispatch'])
    parser.add_argument('--send-email', action='store_true',
                        help='Habilitar explícitamente el envío SMTP real')
    args = parser.parse_args()
    try:
        engine = get_engine()
        result = evaluate(engine) if args.action == 'evaluate' else dispatch(
            engine, send_email=args.send_email)
        print(json.dumps(result, ensure_ascii=False, indent=2))
    except (ValueError, RuntimeError, SQLAlchemyError):
        parser.exit(1, 'ERROR: No se pudo procesar las notificaciones. Revisa la configuración privada y migración 006.\n')


if __name__ == '__main__':
    main()
