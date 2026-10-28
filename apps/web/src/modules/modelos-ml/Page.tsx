/** ML IGP: experimentos versionados y comparación de métricas de validación 2024.
 * No publica modelos ni resultados sobre eventos futuros; 2025 permanece reservado.
 */
import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BarChart3, BrainCircuit, Download, Filter, FlaskConical, RefreshCw, ShieldAlert } from 'lucide-react';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import Modal from '../../components/ui/Modal';
import TablePagination, { type TablePageSize } from '../../components/ui/TablePagination';
import { getExperiments } from '../../services/ml';
import type { Experiment, ExperimentFilters, ExperimentList } from '../../types/ml';

type Tab = 'experimentos' | 'comparacion' | 'estimaciones';
const number = (value?: number | null) => value == null ? '—' : value.toFixed(3);
const date = (value: string) => new Date(value).toLocaleString('es-PE', { timeZone: 'America/Lima' });
const task = (row: Experiment) => row.task_type === 'classification' ? 'Clasificación' : 'Regresión';
const target = (value: string) => ({
  magnitude_observed: 'Magnitud observada', depth_observed: 'Profundidad observada',
  depth_class_observed: 'Clase de profundidad', magnitude_range_observed: 'Rango de magnitud',
} as Record<string, string>)[value] ?? value;
const metric = (row: Experiment | undefined, key: string): number | null => {
  const value = (row?.metrics as Record<string, unknown> | undefined)?.[key];
  return typeof value === 'number' ? value : null;
};
const knnNote = 'Se utilizaron dos clases de profundidad por la escasez de sismos profundos (>300 km). «No superficial» reúne eventos intermedios y profundos; no se eliminaron ni generaron registros artificiales.';

/** Exporta únicamente las filas visibles y sus métricas, sin prometer el histórico completo. */
function exportCsv(items: Experiment[]) {
  const header = ['dataset', 'version', 'corrida', 'algoritmo', 'objetivo', 'tipo', 'mae', 'rmse', 'r2', 'accuracy', 'f1_macro', 'fecha'];
  const rows = items.map(item => [item.dataset_name, item.dataset_version, item.batch_id, item.algorithm,
    item.target_name, item.task_type, item.metrics.mae, item.metrics.rmse, item.metrics.r2,
    item.metrics.accuracy, item.metrics.macro_f1, item.created_at]);
  const csv = [header, ...rows].map(values => values.map(value => `"${String(value ?? '').replaceAll('"', '""')}"`).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = 'modelos-ml-igp-pagina.csv'; link.click();
  URL.revokeObjectURL(url);
}

export default function Page() {
  const [tab, setTab] = useState<Tab>('experimentos');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<TablePageSize>(5);
  const [filters, setFilters] = useState<ExperimentFilters>({});
  const [draft, setDraft] = useState<ExperimentFilters>({});
  const [filterOpen, setFilterOpen] = useState(false);
  const [result, setResult] = useState<ExperimentList | null>(null);
  const [comparison, setComparison] = useState<ExperimentList | null>(null);
  const [chosenBatch, setChosenBatch] = useState('');
  const [chosenModel, setChosenModel] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError('');
    const request = tab === 'comparacion'
      ? getExperiments(controller.signal, { ...filters, page: 1, pageSize: 100 })
      : getExperiments(controller.signal, { ...filters, page, pageSize });
    request.then(data => {
      if (controller.signal.aborted) return;
      if (tab === 'comparacion') setComparison(data); else setResult(data);
    }).catch((cause: unknown) => {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'No se pudieron leer los experimentos');
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [tab, page, pageSize, filters, revision]);

  // Comparar únicamente resultados de una misma corrida; cada objetivo tiene su baseline.
  const batches = useMemo(() => {
    const entries = new Map<string, Experiment[]>();
    for (const item of comparison?.items ?? []) entries.set(item.batch_id, [...(entries.get(item.batch_id) ?? []), item]);
    return [...entries];
  }, [comparison]);
  const currentBatch = batches.find(([id]) => id === chosenBatch) ?? batches[0];
  const models = (currentBatch?.[1] ?? []).filter(item => !item.params.baseline);
  const currentModel = models.find(item => item.id === chosenModel) ?? models[0];
  const baseline = currentBatch?.[1]?.find(item => item.target_name === currentModel?.target_name && item.params.baseline);
  const lines = currentModel?.metrics.real_vs_estimated ?? [];
  const current = tab === 'comparacion' ? comparison : tab === 'estimaciones' ? null : result;

  return <div className="space-y-5">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-3xl font-bold text-main">Modelos ML</h1>
        <p className="mt-2 text-sm text-muted">Experimentos retrospectivos con catálogo IGP/CENSIS y validación temporal de 2024.</p>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <button type="button" onClick={() => { setDraft(filters); setFilterOpen(true); }} className="inline-flex items-center gap-2 rounded-xl border border-border-ui bg-panel px-3 py-2 text-sm text-main hover:bg-panel-alt"><Filter size={16}/> Filtros</button>
        <button type="button" onClick={() => setRevision(value => value + 1)} className="inline-flex items-center gap-2 rounded-xl border border-border-ui bg-panel px-3 py-2 text-sm text-main hover:bg-panel-alt"><RefreshCw size={16}/> Actualizar</button>
        <button type="button" disabled={!current?.items.length} onClick={() => exportCsv(current?.items ?? [])} className="inline-flex items-center gap-2 rounded-xl border border-border-ui bg-panel px-3 py-2 text-sm text-main hover:bg-panel-alt disabled:opacity-40"><Download size={16}/> CSV</button>
      </div>
    </header>

    <section className="flex gap-3 rounded-xl border border-border-ui bg-panel px-4 py-3">
      <ShieldAlert size={20} className="mt-0.5 shrink-0 text-accent"/>
      <p className="text-sm text-muted"><strong className="text-main">Estimaciones experimentales, no predicciones sísmicas.</strong> Los modelos explican características de eventos ya observados; no anticipan terremotos ni generan alertas oficiales. El año 2025 está reservado para prueba final.</p>
    </section>

    <nav className="flex gap-6 border-b border-border-ui" aria-label="Secciones de Modelos ML">
      {([['experimentos', 'Experimentos'], ['comparacion', 'Comparación'], ['estimaciones', 'Estimaciones']] as const).map(([key, label]) =>
        <button key={key} type="button" onClick={() => setTab(key)} className={`border-b-2 pb-3 text-sm font-medium ${tab === key ? 'border-accent text-main' : 'border-transparent text-muted hover:text-main'}`}>{label}</button>
      )}
    </nav>

    {loading && <div className="rounded-xl border border-border-ui bg-panel"><LoadingSpinner label="Consultando experimentos IGP…" /></div>}
    {error && <p role="alert" className="rounded-xl border border-rose-500 p-4 text-sm text-rose-600 dark:text-rose-300">{error}. Comprueba la migración ML y el despliegue de FastAPI.</p>}
    {!loading && !error && tab === 'experimentos' && <section className="overflow-hidden rounded-xl border border-border-ui bg-panel">
      {!result?.items.length ? <div className="p-8 text-center"><FlaskConical size={28} className="mx-auto text-accent"/><p className="mt-3 font-semibold text-main">Todavía no hay experimentos IGP registrados</p><p className="mt-2 text-sm text-muted">Valida primero el snapshot y entrena desde la CLI autorizada. Los experimentos USGS antiguos permanecen archivados.</p></div>
        : <div className="overflow-x-auto p-4"><table className="w-full min-w-[750px] text-left text-sm">
          <thead className="border-b border-border-ui text-xs text-muted"><tr><th className="py-3 pr-3">Algoritmo</th><th className="py-3 pr-3">Objetivo</th><th className="py-3 pr-3">Muestra</th><th className="py-3 pr-3">F1 macro</th><th className="py-3 pr-3">MAE</th><th className="py-3 pr-3">RMSE</th><th className="py-3 pr-3">R²</th><th className="py-3">Registro</th></tr></thead>
          <tbody>{result.items.map(row => <tr key={row.id} className="border-b border-border-ui/60 text-main"><td className="py-3 pr-3"><span className="font-medium">{row.algorithm}</span>{row.params.baseline && <span className="ml-2 text-xs text-muted">Baseline</span>}</td><td className="py-3 pr-3">{target(row.target_name)}</td><td className="py-3 pr-3 text-muted">{task(row)}</td><td className="py-3 pr-3 tabular-nums">{number(row.metrics.macro_f1)}</td><td className="py-3 pr-3 tabular-nums">{number(row.metrics.mae)}</td><td className="py-3 pr-3 tabular-nums">{number(row.metrics.rmse)}</td><td className="py-3 pr-3 tabular-nums">{number(row.metrics.r2)}</td><td className="py-3 text-xs text-muted">{date(row.created_at)}</td></tr>)}</tbody>
        </table></div>}
      <TablePagination page={page} pageSize={pageSize} pages={Math.ceil((result?.total ?? 0) / pageSize)} onPageChange={setPage} onPageSizeChange={value => { setPage(1); setPageSize(value); }} disabled={loading}/>
    </section>}

    {!loading && !error && tab === 'comparacion' && (batches.length === 0 ?
      <div className="rounded-xl border border-border-ui bg-panel p-8 text-center text-sm text-muted">No hay comparaciones IGP. Primero ejecuta los experimentos autorizados.</div>
      : <section className="space-y-5 rounded-xl border border-border-ui bg-panel p-5">
        {comparison && comparison.total > 100 && <p className="text-xs text-amber-600 dark:text-amber-300">Se muestran las primeras 100 entradas. Filtra por dataset o corrida para comparar un lote completo.</p>}
        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-1 text-sm text-muted">Corrida
            <select className="block w-full rounded-lg border border-border-ui bg-page p-2 text-main" value={currentBatch?.[0] ?? ''} onChange={e => { setChosenBatch(e.target.value); setChosenModel(''); }}>
              {batches.map(([id, rows]) => <option key={id} value={id}>{rows[0].dataset_name} v{rows[0].dataset_version} · {date(rows[0].created_at)}</option>)}
            </select>
          </label>
          <label className="space-y-1 text-sm text-muted">Modelo (un gráfico a la vez)
            <select className="block w-full rounded-lg border border-border-ui bg-page p-2 text-main" value={currentModel?.id ?? ''} onChange={e => setChosenModel(e.target.value)}>
              {models.map(model => <option key={model.id} value={model.id}>{model.algorithm} · {target(model.target_name)}</option>)}
            </select>
          </label>
        </div>
        {currentModel && <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {(currentModel.task_type === 'regression' ? [['MAE', 'mae'], ['RMSE', 'rmse'], ['R²', 'r2']] : [['Accuracy', 'accuracy'], ['F1 macro', 'macro_f1']]).map(([label, key]) =>
              <div key={key} className="rounded-lg bg-panel-alt p-3"><p className="text-xs text-muted">{label}</p><p className="mt-1 text-lg font-semibold tabular-nums text-main">{number(metric(currentModel, key))}</p><p className="text-xs text-muted">Baseline: {number(metric(baseline, key))}</p></div>
            )}
          </div>
          {currentModel.task_type === 'regression' && lines.length > 0 && <div className="h-72 w-full" role="img" aria-label="Serie real frente a estimada, validación 2024"><ResponsiveContainer width="100%" height="100%"><LineChart data={lines} margin={{ top: 12, right: 16, bottom: 4, left: 0 }}><CartesianGrid strokeDasharray="3 3" opacity={0.2}/><XAxis dataKey="date" hide/><YAxis width={55} domain={['auto', 'auto']}/><Tooltip labelFormatter={value => date(String(value))}/><Legend/><Line dataKey="real" name="Real (2024)" dot={false} stroke="#3b82f6" strokeWidth={2}/><Line dataKey="estimated" name="Estimada (2024)" dot={false} stroke="#f59e0b" strokeWidth={2}/></LineChart></ResponsiveContainer></div>}
          {currentModel.task_type === 'classification' && currentModel.metrics.confusion_matrix && <div className="overflow-x-auto"><h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-main"><BarChart3 size={16}/> Matriz de confusión · validación 2024</h3><p className="mb-3 text-xs text-muted">Filas: clase real · Columnas: clase estimada. Etiquetas experimentales.</p><table className="w-full text-sm text-main"><thead><tr><th className="p-2 text-left">Real / Estimada</th>{currentModel.metrics.labels?.map(label => <th key={label} className="p-2 text-center text-xs">{label}</th>)}</tr></thead><tbody>{currentModel.metrics.confusion_matrix.map((row, i) => <tr key={i} className="border-t border-border-ui"><th className="p-2 text-left text-xs">{currentModel.metrics.labels?.[i]}</th>{row.map((cell, j) => <td key={j} className="p-2 text-center tabular-nums">{cell}</td>)}</tr>)}</tbody></table></div>}
          {currentModel.target_name === 'depth_class_observed' && <div className="flex gap-2 rounded-lg bg-panel-alt p-3 text-sm text-muted"><AlertTriangle size={18} className="shrink-0"/><p>{knnNote}</p></div>}
          <div className="border-t border-border-ui pt-4 text-xs text-muted"><p>Entrenamiento: {currentModel.validation_spec.train_count} registros, hasta {date(currentModel.validation_spec.train_end)} · Validación: {currentModel.validation_spec.validation_count} registros, hasta {date(currentModel.validation_spec.validation_end ?? '')}. Prueba 2025: reservada.</p><p className="mt-2">{currentModel.limitations}</p></div>
        </>}
      </section>)}

    {!loading && !error && tab === 'estimaciones' && <section className="rounded-xl border border-border-ui bg-panel p-6"><div className="flex items-center gap-2"><BrainCircuit size={20} className="text-accent"/><h2 className="font-semibold text-main">Estimaciones experimentales</h2></div><p className="mt-3 text-sm text-muted">La publicación de estimaciones con incertidumbre y revisión (sección 6.7) aún no está habilitada. No existen estimaciones ni probabilidades oficiales generadas desde esta pantalla.</p><p className="mt-2 text-sm text-muted">Los valores comparados en la pestaña anterior corresponden solamente a medidas ya observadas en 2024.</p></section>}

    <Modal open={filterOpen} title="Filtros" onClose={() => setFilterOpen(false)} footer={<><button type="button" className="rounded-lg border border-border-ui px-4 py-2 text-sm text-main" onClick={() => { setFilters({}); setDraft({}); setPage(1); setFilterOpen(false); }}>Limpiar</button><button type="button" className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white" onClick={() => { setFilters(draft); setPage(1); setFilterOpen(false); }}>Aplicar</button></>}>
      <div className="space-y-4">
        <label className="block text-sm text-muted">Tipo de experimento
          <select className="mt-1 w-full rounded-lg border border-border-ui bg-page p-2 text-main" value={draft.taskType ?? ''} onChange={e => setDraft(v => ({ ...v, taskType: e.target.value as ExperimentFilters['taskType'] }))}><option value="">Todos</option><option value="regression">Regresión</option><option value="classification">Clasificación</option></select>
        </label>
        <label className="block text-sm text-muted">ID de dataset (opcional)
          <input className="mt-1 w-full rounded-lg border border-border-ui bg-page p-2 text-main" placeholder="UUID del snapshot IGP" value={draft.datasetId ?? ''} onChange={e => setDraft(v => ({ ...v, datasetId: e.target.value.trim() }))}/>
        </label>
        <label className="block text-sm text-muted">ID de corrida (opcional)
          <input className="mt-1 w-full rounded-lg border border-border-ui bg-page p-2 text-main" placeholder="UUID de la ejecución" value={draft.batchId ?? ''} onChange={e => setDraft(v => ({ ...v, batchId: e.target.value.trim() }))}/>
        </label>
      </div>
    </Modal>
  </div>;
}
