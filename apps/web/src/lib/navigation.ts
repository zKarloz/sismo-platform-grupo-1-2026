/** Catálogo único de módulos de navegación, compartido por sidebar y UX. */
import type { LucideIcon } from 'lucide-react';
import { Activity, Bell, ChartNoAxesCombined, ShieldCheck, ClipboardList, Database, FileBarChart, History, LayoutDashboard, MapPinned, UsersRound } from 'lucide-react';

export type NavItem = { label: string; path: string; icon: LucideIcon; section: 'general' | 'gestion' };

export const navigation: NavItem[] = [
  { label: 'Dashboard', path: '/', icon: LayoutDashboard, section: 'general' },
  { label: 'Eventos sísmicos', path: '/eventos', icon: Activity, section: 'general' },
  { label: 'Mapa sísmico', path: '/mapa-sismico', icon: MapPinned, section: 'general' },
  { label: 'Análisis histórico', path: '/analisis', icon: ChartNoAxesCombined, section: 'general' },
  { label: 'Calidad y datasets', path: '/calidad-datos', icon: ShieldCheck, section: 'general' },
  { label: 'Modelos ML', path: '/modelos-ml', icon: Database, section: 'general' },
  { label: 'Alertas internas', path: '/alertas', icon: Bell, section: 'gestion' },
  { label: 'Fuentes de datos', path: '/fuentes-datos', icon: ClipboardList, section: 'gestion' },
  { label: 'Reportes', path: '/reportes', icon: FileBarChart, section: 'gestion' },
  { label: 'Usuarios y roles', path: '/usuarios-roles', icon: UsersRound, section: 'gestion' },
  { label: 'Auditoría', path: '/auditoria', icon: History, section: 'gestion' },
];
