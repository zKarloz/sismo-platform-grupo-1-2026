/** Fase 6: lectura de experimentos históricos; sin botones de predicción. */
import { useEffect, useMemo, useState } from 'react';
import { BarChart3, BrainCircuit, FlaskConical, RefreshCw, ShieldAlert } from 'lucide-react';
import { getExperiments } from '../../services/ml';
import type { ExperimentList } from '../../types/ml';

const formatted = (value: number | null | undefined) => value == null ? '—' : value.toFixed(3);
const local = (stamp: string) => new Date(stamp).toLocaleString('es-PE', { timeZone: 'America/Lima' });

export default function Page() {
  const [result, setResult] = useState<ExperimentList | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError('');
    getExperiments(controller.signal)
      .then((res) => { if (!controller.signal.aborted) setResult(res); })
      .catch((cause: unknown) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Error al leer experimentos'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [revision]);

  // Agrupar por corrida evita comparar modelos evaluados con cortes temporales distintos.
  const groups = useMemo(() => {
    const byBatch = new Map<string, NonNullable<ExperimentList['items']>>();
    for (const row of result?.items ?? []) byBatch.set(row.batch_id, [...(byBatch.get(row.batch_id) ?? []), row]);
    return Array.from(byBatch.entries());
  }, [result]);
  return <div className="space-y-6">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-accent">Fase 6 · Laboratorio retrospectivo</p>
        <h1 className="mt-2 text-3xl font-bold text-main">Modelos de Machine Learning</h1>
        <p className="mt-2 text-sm text-muted">Comparaciones reproducibles usando registros sísmicos ya observados y partición cronológica.</p>
      </div>
      <button type="button" onClick={() => setRevision(v => v+1)} className="inline-flex items-center gap-2 rounded-xl border border-border-ui bg-panel px-4 py-2 text-sm text-main hover:bg-panel-alt"><RefreshCw size={16}/> Actualizar</button>
    </header>
    <section className="flex gap-3 rounded-2xl border border-border-ui bg-panel p-4">
      <ShieldAlert className="shrink-0 text-accent" size={22}/>
      <div><h2 className="font-semibold text-main">Sin predicción ni alerta sísmica</h2>
      <p className="mt-1 text-sm text-muted">El modelo clasifica o ajusta medidas de eventos pasados. Los resultados no representan probabilidad de terremotos, riesgo futuro ni información oficial. La revisión científica sigue pendiente.</p></div>
    </section>
    {loading && <p className="rounded-xl border border-border-ui bg-panel p-5 text-sm text-muted">Consultando los experimentos...</p>}
    {error && <p role="alert" className="rounded-xl border border-rose-500 p-4 text-sm text-rose-600 dark:text-rose-300">{error}. Verifica la migración 003 y Render.</p>}
    {!loading && !error && (result?.total ?? 0) === 0 && <section className="rounded-2xl border border-border-ui bg-panel p-8 text-center">
      <FlaskConical size={32} className="mx-auto text-accent"/>
      <h2 className="mt-3 font-semibold text-main">Aún no hay experimentos</h2>
      <p className="mt-2 text-sm text-muted">Amplía el histórico, crea el dataset v2 y ejecuta primero <code>train_ml --check-only</code> desde Git Bash. No hay entrenamiento desde la web.</p>
    </section>}
    {groups.map(([batch, items]) => {
      const first = items[0];
      const val = first.validation_spec;
      return <section key={batch} className="overflow-hidden rounded-2xl border border-border-ui bg-panel">
        <div className="border-b border-border-ui p-5">
          <h2 className="flex items-center gap-2 font-semibold text-main"><BrainCircuit size={19} className="text-accent"/> {first.dataset_name} · v{first.dataset_version}</h2>
          <p className="mt-1 text-xs text-muted">Corrida: {batch} · {local(first.created_at)} · semilla {first.seed} · scikit-learn {val.sklearn_version}</p>
          <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted">
            <span className="rounded-lg bg-panel-alt px-3 py-2">Entrenamiento: {val.train_count} eventos · hasta {local(val.train_end)}</span>
            <span className="rounded-lg bg-panel-alt px-3 py-2">Prueba: {val.test_count} eventos · desde {local(val.test_start)}</span>
          </div>
          {val.warnings.length > 0 && <p className="mt-3 text-sm text-amber-600 dark:text-amber-300">Advertencias: {val.warnings.join('; ')}</p>}
        </div>
        <div className="overflow-x-auto p-5">
          <h3 className="mb-3 flex items-center gap-2 font-semibold text-main"><BarChart3 size={17}/> Métricas comparables dentro de la misma corrida</h3>
          <table className="w-full min-w-[620px] text-left text-sm">
            <thead className="border-b border-border-ui text-xs text-muted"><tr><th className="py-2 pr-3">Algoritmo</th><th className="py-2 pr-3">Tarea</th><th className="py-2 pr-3">Accuracy</th><th className="py-2 pr-3">Macro-F1</th><th className="py-2 pr-3">MAE</th><th className="py-2 pr-3">RMSE</th><th className="py-2">R²</th></tr></thead>
            <tbody>{items.map(item => <tr key={item.id} className="border-b border-border-ui/60 text-main"><td className="py-3 pr-3 font-medium">{item.algorithm}</td><td className="py-3 pr-3 text-muted">{item.task_type === 'classification' ? 'Clasificación' : 'Regresión'}</td><td className="py-3 pr-3">{formatted(item.metrics.accuracy)}</td><td className="py-3 pr-3">{formatted(item.metrics.macro_f1)}</td><td className="py-3 pr-3">{formatted(item.metrics.mae)}</td><td className="py-3 pr-3">{formatted(item.metrics.rmse)}</td><td className="py-3">{formatted(item.metrics.r2)}</td></tr>)}</tbody>
          </table>
          <p className="mt-3 text-xs text-soft">Accuracy/Macro-F1: clasificación de rangos observados. MAE/RMSE/R²: regresión didáctica de la magnitud reportada. No comparar estas métricas entre tareas distintas.</p>
        </div>
        <div className="border-t border-border-ui bg-panel-alt p-4 text-xs text-muted">
          <p className="font-semibold text-main">Limitaciones</p><p className="mt-1">{first.limitations}</p>
        </div>
      </section>;
    })}
  </div>;
}
