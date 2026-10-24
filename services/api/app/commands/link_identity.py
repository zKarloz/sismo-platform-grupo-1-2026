"""Alta explícita de cuenta local vinculada al UUID verificado de Supabase Auth.

Privado, requiere DATABASE_URL. Nunca recibe ni almacena contraseñas.
"""
import argparse
import json
import re
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.exc import SQLAlchemyError, IntegrityError

from app.auth.security import ROLES
from app.db.session import get_engine
from app.db.tables import users, audit_logs


def link_user(engine, *, auth_id: UUID, email: str, name: str, role: str = 'solo_lectura') -> UUID:
    """Solo un operador con credenciales PostgreSQL puede otorgar roles."""
    if role not in ROLES or not re.fullmatch(r'[^@\s]+@[^@\s]+\.[^@\s]+', email):
        raise ValueError('Rol o correo inválido')
    if not name.strip() or len(name) > 160:
        raise ValueError('Nombre inválido')
    with engine.begin() as conn:
        existing_by_auth = conn.execute(select(users.c.id).where(users.c.auth_user_id == auth_id)).scalar_one_or_none()
        if existing_by_auth:
            raise ValueError('El UUID Auth ya está vinculado')
        local = conn.execute(select(users.c.id, users.c.auth_user_id)
                             .where(func.lower(users.c.email) == email.lower())).first()
        if local:
            if local.auth_user_id is not None:
                raise ValueError('Este correo ya está vinculado a otra identidad')
            conn.execute(users.update().where(users.c.id == local.id).values(
                auth_user_id=auth_id, full_name=name.strip(), role=role, status='active'))
            user_id = local.id
        else:
            user_id = conn.execute(users.insert().values(
                auth_user_id=auth_id, email=email.lower(), full_name=name.strip(),
                role=role, status='active').returning(users.c.id)).scalar_one()
        conn.execute(audit_logs.insert().values(
            actor_id=None, action='identity.linked.by_db_operator', entity_type='users',
            entity_id=user_id, result='success', after_json={'role': role, 'method': 'private_cli'},
        ))
        return user_id


def main() -> None:
    parser = argparse.ArgumentParser(description='Vincular usuario Supabase Auth desde entorno confiable')
    parser.add_argument('--auth-id', required=True, type=UUID, help='Auth > Users > User UID')
    parser.add_argument('--email', required=True, help='Correo confirmado de Auth')
    parser.add_argument('--name', required=True)
    parser.add_argument('--role', choices=sorted(ROLES), default='solo_lectura')
    args = parser.parse_args()
    try:
        result = link_user(get_engine(), auth_id=args.auth_id,
                           email=args.email, name=args.name, role=args.role)
        print(json.dumps({'user_id': str(result), 'role': args.role, 'linked': True}))
    except (ValueError, IntegrityError):
        parser.exit(1, 'ERROR: vínculo inválido, duplicado o migración pendiente.\n')
    except SQLAlchemyError:
        parser.exit(1, 'ERROR: fallo de BD; revisar DATABASE_URL y migración 005.\n')


if __name__ == '__main__':
    main()
