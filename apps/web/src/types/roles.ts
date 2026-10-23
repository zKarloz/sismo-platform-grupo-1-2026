/** Roles del MVP: definición compartible, NO sustituye autorización en FastAPI. */
export type UserRole = 'administrador' | 'analista' | 'operador_alertas' | 'auditor' | 'solo_lectura';
