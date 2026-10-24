/** Etiquetas exclusivamente visuales: FastAPI mantiene la autorización RBAC. */
import type { Role } from '../auth/AuthProvider';

export const roleLabels: Record<Role, string> = {
  administrador: 'Administrador',
  analista: 'Analista',
  operador_alertas: 'Operador de alertas',
  auditor: 'Auditor',
  solo_lectura: 'Solo lectura',
};

export function displayRole(role: string | null | undefined): string {
  if (!role) return 'Sin rol disponible';
  return roleLabels[role as Role] ?? 'Rol no reconocido';
}
