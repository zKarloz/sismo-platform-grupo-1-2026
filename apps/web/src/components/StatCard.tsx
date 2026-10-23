/** Componente KPI: utiliza tokens semánticos, sin colores definidos localmente. */
import type { LucideIcon } from 'lucide-react';

type Props = { label: string; value: string; detail: string; icon: LucideIcon };

export default function StatCard({ label, value, detail, icon: Icon }: Props) {
  return (
    <div className="rounded-2xl border border-border-ui bg-panel p-5 shadow-sm transition-colors">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-muted">{label}</p>
        <span className="flex size-9 items-center justify-center rounded-lg bg-panel-alt text-muted">
          <Icon size={18} />
        </span>
      </div>
      <div className="mt-4 text-3xl font-semibold tracking-tight text-main">{value}</div>
      <p className="mt-1 text-xs text-soft">{detail}</p>
    </div>
  );
}
