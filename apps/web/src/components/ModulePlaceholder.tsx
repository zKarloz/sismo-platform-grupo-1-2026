/** Estado vacío de cada módulo: aplica automáticamente el tema activo. */
import { ArrowRight, Construction, Layers3 } from 'lucide-react';

type Props = { title: string; description: string; next: string };

export default function ModulePlaceholder({ title, description, next }: Props) {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-accent">Módulo preparado</p>
        <h1 className="text-3xl font-bold tracking-tight text-main">{title}</h1>
        <p className="max-w-2xl text-sm leading-6 text-muted">{description}</p>
      </div>
      <div className="rounded-2xl border border-border-ui bg-panel p-8 shadow-sm transition-colors sm:p-12">
        <div className="flex size-14 items-center justify-center rounded-2xl bg-accent-soft text-accent">
          <Construction size={25} />
        </div>
        <h2 className="mt-6 text-xl font-semibold text-main">Estructura lista para implementar</h2>
        <p className="mt-2 max-w-xl text-sm leading-6 text-muted">
          Esta pantalla pertenece a la Fase 1. No hay eventos ni indicadores de prueba; los datos se incorporarán desde fuentes reales cuando configuremos la ingesta.
        </p>
        <div className="mt-6 flex items-start gap-3 rounded-xl border border-border-ui bg-panel-alt p-4">
          <Layers3 size={18} className="mt-0.5 shrink-0 text-accent" />
          <div>
            <p className="text-sm font-semibold text-main">Próxima implementación</p>
            <p className="mt-1 text-sm text-muted">{next}</p>
          </div>
          <ArrowRight size={18} className="ml-auto shrink-0 text-soft" />
        </div>
      </div>
    </div>
  );
}
