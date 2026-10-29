/** ML IGP: experimentos versionados y comparación de métricas de validación 2024.
 * No publica modelos ni resultados sobre eventos futuros; 2025 solo se visualiza tras evaluación final.
 */
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, BarChart3, BrainCircuit, ChevronDown, Download, Filter, FlaskConical, Info, RefreshCw, ShieldAlert } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import Modal from '../../components/ui/Modal';
import TablePagination, { type TablePageSize } from '../../components/ui/TablePagination';
import { getExperiments, getRetrospectiveEstimateSummary, getRetrospectiveEstimates, getValidationPredictions, getFinalEvaluations } from '../../services/ml';
import type { Experiment, ExperimentFilters, ExperimentList, FinalEvaluationReport, EstimateList, EstimateSummary, PredictionList, RetrospectiveEstimate, ValidationPrediction } from '../../types/ml';

type Tab = 'experimentos' | 'comparacion' | 'estimaciones';
const number = (value?: number | null) => value == null ? '—' : value.toFixed(3);
const date = (value: string) => new Date(value).toLocaleString('es-PE', { timeZone: 'America/Lima' });
const task = (row: Experiment) => row.task_type === 'classification' ? 'Clasificación' : 'Regresión';
/** Etiquetas de interfaz: los identificadores técnicos originales permanecen intactos en DB y CSV. */
const algorithmName = (name: string) => ({
  'LinearRegression-simple': 'Regresión lineal simple',
  'LinearRegression-multiple': 'Regresión lineal múltiple',
  'KNN-binary-depth': 'KNN de profundidad',
  'RandomForest-magnitude': 'Bosque aleatorio (Random Forest)',
  'DummyRegressor-mean-magnitude': 'Referencia: magnitud promedio',
  'DummyRegressor-mean-depth': 'Referencia: profundidad promedio',
  'DummyClassifier-most_frequent-depth': 'Referencia: clase de profundidad más frecuente',
  'DummyClassifier-most_frequent-magnitude': 'Referencia: clase de magnitud más frecuente',
} as Record<string, string>)[name] ?? name.replace(/[-_]+/g, ' ');

const target = (value: string) => ({
  magnitude_observed: 'Magnitud observada', depth_observed: 'Profundidad observada',
  depth_class_observed: 'Clase de profundidad', magnitude_range_observed: 'Rango de magnitud',
} as Record<string, string>)[value] ?? value;
const metricFrom = (metrics: Experiment['metrics'] | undefined, key: string): number | null => {
  const value = (metrics as Record<string, unknown> | undefined)?.[key];
  return typeof value === 'number' ? value : null;
};
const metric = (row: Experiment | undefined, key: string): number | null => metricFrom(row?.metrics, key);
const knnNote = 'Se utilizaron dos clases de profundidad por la escasez de sismos profundos (>300 km). «No superficial» reúne eventos intermedios y profundos; no se eliminaron ni generaron registros artificiales.';

/** Los porcentajes solo representan proporciones de clasificación (F1, accuracy, etc.).
 * MAE/RMSE mantienen la escala del objetivo y R² permanece como coeficiente sin unidades.
 */
const percent = (value?: number | null) => value == null ? '—'
  : `${(value * 100).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
const primaryValue = (value: number | null | undefined, regression: boolean, unit = '') =>
  regression ? `${number(value)}${value == null ? '' : unit}` : percent(value);
const favorableChange = (value: number | null, regression: boolean, unit: string) => {
  if (value === null) return '—';
  const sign = value > 0 ? '+' : '';
  return regression ? `${sign}${number(value)}${unit}`
    : `${sign}${(value * 100).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} pp`;
};

const metricHelp = {
  mae: 'Error absoluto medio entre valor observado y estimado. Cuanto menor, mejor. Conserva las unidades del objetivo: magnitud (M) o profundidad (km).',
  rmse: 'Raíz del error cuadrático medio. Penaliza más los errores grandes; cuanto menor, mejor. Tiene las mismas unidades que el objetivo.',
  r2: 'Coeficiente de determinación R². Se muestra como número, no porcentaje. Un valor próximo a 1 indica mejor ajuste; puede ser negativo.',
  macro_f1: 'F1 macro: promedio del F1 de cada clase, dándoles igual importancia. Se expresa en porcentaje; cuanto mayor, mejor.',
  accuracy: 'Porcentaje de eventos clasificados correctamente entre todos los evaluados. Puede ser engañoso con clases desbalanceadas.',
  precision: 'Precisión: de los eventos asignados a una clase, porcentaje que realmente pertenece a esa clase.',
  recall: 'Recall: de los eventos que realmente pertenecen a una clase, porcentaje que el modelo identificó.',
  f1: 'F1 por clase: equilibrio entre precisión y recall. Se expresa como porcentaje; cuanto mayor, mejor.',
} as const;
type MetricHelpKey = keyof typeof metricHelp;

/** Tarjeta informativa accesible al clic, fuera del contenedor de tabla desplazable.
 * El portal evita que la tarjeta quede cortada en pantallas pequeñas.
 */
function MetricInfo({ metricKey }: { metricKey: MetricHelpKey }) {
  const [open, setOpen] = useState(false);
  const [point, setPoint] = useState({ left: 0, top: 0 });
  const trigger = useRef<HTMLButtonElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const infoId = useId();
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      const node = event.target as Node;
      if (!trigger.current?.contains(node) && !card.current?.contains(node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    const dismiss = () => setOpen(false);
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    window.addEventListener('resize', dismiss);
    window.addEventListener('scroll', dismiss, true);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
      window.removeEventListener('resize', dismiss);
      window.removeEventListener('scroll', dismiss, true);
    };
  }, [open]);
  const toggle = () => {
    if (!open && trigger.current) {
      const rect = trigger.current.getBoundingClientRect();
      const width = Math.min(288, window.innerWidth - 24);
      setPoint({
        left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)),
        top: rect.bottom + 145 > window.innerHeight ? Math.max(12, rect.top - 145) : rect.bottom + 8,
      });
    }
    setOpen(value => !value);
  };
  return <span className="inline-flex items-center align-middle">
    <button ref={trigger} type="button" onClick={toggle} aria-label={`Información de ${metricKey === 'macro_f1' ? 'F1 macro' : metricKey.toUpperCase()}`}
      aria-expanded={open} aria-controls={open ? infoId : undefined}
      className="ml-1 inline-flex rounded-full p-0.5 text-muted hover:bg-panel-alt hover:text-main focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
      <Info size={14} aria-hidden="true" />
    </button>
    {open && createPortal(<div ref={card} id={infoId} role="tooltip"
      style={{ top: point.top, left: point.left }}
      className="fixed z-[9999] w-72 max-w-[calc(100vw-24px)] rounded-xl border border-border-ui bg-panel p-3 text-left text-xs font-normal leading-5 text-main shadow-xl">
      {metricHelp[metricKey]}
    </div>, document.body)}
  </span>;
}

/** Mantiene el mismo ancho y separación a ambos lados de TODAS las columnas.
 * El mínimo permite que «Ver gráfico» no se parta incluso en pantallas estrechas.
 */
function ComparisonColumns() {
  return <colgroup>
    <col className="w-[19%]" /><col className="w-[14%]" /><col className="w-[9%]" />
    <col className="w-[10%]" /><col className="w-[13%]" /><col className="w-[10%]" />
    <col className="w-[15%]" /><col className="w-[10%]" />
  </colgroup>;
}
function ComparisonHeader() {
  return <thead className="bg-panel-alt text-xs text-muted"><tr>
    <th className="px-4 py-3 text-left">Algoritmo</th>
    <th className="px-4 py-3 text-left">Objetivo</th>
    <th className="px-4 py-3 text-left">Métrica</th>
    <th className="px-4 py-3 text-right">Baseline</th>
    <th className="px-4 py-3 text-right">Resultado del modelo</th>
    <th className="px-4 py-3 text-right">Mejora</th>
    <th className="px-4 py-3 text-left">Métrica adicional</th>
    <th className="px-4 py-3 text-left">Detalle</th>
  </tr></thead>;
}

/** Tooltip con tokens de tema del proyecto, no el fondo claro por defecto de Recharts.
 * La fecha se formatea en hora de Perú y conserva contraste en modo oscuro.
 */
function ComparisonTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: readonly { name?: string; value?: number | string; color?: string }[];
  label?: string | number;
}) {
  if (!active || !payload?.length) return null;
  const value = String(label ?? '');
  const isDate = /^\d{4}-\d{2}-\d{2}T/.test(value);
  return <div className="pointer-events-none rounded-xl border border-border-ui bg-panel p-3 text-xs text-main shadow-xl">
    <p className="mb-2 font-semibold text-main">{isDate ? `Fecha y hora: ${date(value)}` : value}</p>
    {payload.map((entry, index) => <p key={`${entry.name ?? 'dato'}-${index}`} className="mt-1 text-main">
      <span className="mr-1 inline-block h-2 w-2 rounded-full" style={{ backgroundColor: entry.color ?? 'var(--ui-accent)' }} />
      {entry.name ?? 'Valor'}: <strong className="tabular-nums">{typeof entry.value === 'number' ? number(entry.value) : String(entry.value ?? '—')}</strong>
    </p>)}
  </div>;
}

/** Las matrices de 2024 y 2025 se obtienen de métricas persistidas, sin simular filas. */
function ClassificationEvidence({ metrics, period }: { metrics: Experiment['metrics'] | undefined; period: 2024 | 2025 }) {
  if (!metrics?.confusion_matrix?.length) return <p className="text-xs text-muted">No hay matriz de confusión registrada para {period}.</p>;
  return <div className="space-y-4">
    <div className="overflow-x-auto ui-thin-scrollbar">
      <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-main"><BarChart3 size={16} /> Matriz de confusión · {period}</h3>
      <p className="mb-3 text-xs text-muted">Filas: clase real · Columnas: clase estimada. Evaluación retrospectiva IGP.</p>
      <table className="w-full text-sm text-main">
        <thead><tr><th className="p-2 text-left">Real / Estimada</th>{metrics.labels?.map(label => <th key={label} className="p-2 text-center text-xs">{label}</th>)}</tr></thead>
        <tbody>{metrics.confusion_matrix.map((row, i) => <tr key={i} className="border-t border-border-ui"><th className="p-2 text-left text-xs">{metrics.labels?.[i]}</th>{row.map((cell, j) => <td key={j} className="p-2 text-center tabular-nums">{cell}</td>)}</tr>)}</tbody>
      </table>
    </div>
    {metrics.per_class && <section className="space-y-2">
      <h3 className="text-sm font-semibold text-main">Métricas por clase · {period}</h3>
      <div className="overflow-x-auto ui-thin-scrollbar"><table className="w-full text-left text-sm text-main">
        <thead><tr className="border-b border-border-ui text-xs text-muted"><th className="p-2">Clase observada</th><th className="p-2">Precisión<MetricInfo metricKey="precision" /></th><th className="p-2">Recall<MetricInfo metricKey="recall" /></th><th className="p-2">F1<MetricInfo metricKey="f1" /></th></tr></thead>
        <tbody>{(metrics.labels ?? []).map(label => {
          const values = metrics.per_class?.[label];
          if (!values || typeof values === 'number') return null;
          return <tr key={label} className="border-b border-border-ui/50"><th className="p-2 font-medium">{label}</th><td className="p-2 tabular-nums">{percent(values.precision)}</td><td className="p-2 tabular-nums">{percent(values.recall)}</td><td className="p-2 tabular-nums">{percent(values['f1-score'])}</td></tr>;
        })}</tbody>
      </table></div>
    </section>}
  </div>;
}

/** Compara un modelo únicamente con el baseline de su mismo objetivo.
 * MAE es mejor si disminuye; F1 macro es mejor si aumenta.
 * Las unidades no se mezclan entre experimentos.
 */
function comparisonScore(model: Experiment, reference?: Experiment) {
  const regression = model.task_type === 'regression';
  const key = regression ? 'mae' : 'macro_f1';
  const observed = metric(model, key);
  const expected = metric(reference, key);
  const gain = observed === null || expected === null ? null
    : regression ? expected - observed : observed - expected;
  const unit = regression && model.target_name === 'depth_observed' ? ' km'
    : regression ? ' M' : '';
  return { label: regression ? 'MAE' : 'F1 macro', unit, observed, expected, gain };
}


/** CSV del resumen agregado: una línea por modelo, sin confundir con 2.224 sismos. */
function exportEstimateSummaryCsv(summary: EstimateSummary) {
  const values = [['modelo', 'objetivo', 'tipo', 'estimaciones', 'metrica', 'valor'],
  ...summary.models.map(row => [row.algorithm, row.target_name, row.task_type,
  row.total, row.primary_metric, row.primary_value])];
  const csv = values.map(line => line.map(value => {
    const clean = String(value ?? '').replaceAll('"', '""');
    return `"${typeof value === 'string' && /^[\s]*[=+@-]/.test(clean) ? "'" + clean : clean}"`;
  }).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url;
  link.download = 'estimaciones-igp-2024-resumen.csv'; link.click();
  URL.revokeObjectURL(url);
}

/** CSV limitado a la página de estimaciones verificadas recibida desde FastAPI.
 * Nunca exporta una probabilidad, banda estadística o aprobación no registrada.
 */
function exportEstimateCsv(items: RetrospectiveEstimate[]) {
  const header = ['experimento', 'dataset', 'version', 'modelo', 'objetivo', 'fila_excel',
    'fecha_evento_utc', 'latitud', 'longitud', 'observado', 'estimado', 'error_observado',
    'revision', 'registrado_experimento', 'advertencia'];
  const rows = items.map(item => [item.experiment_id, item.dataset_name, item.dataset_version,
  item.algorithm, item.target_name, item.source_row, item.occurred_at, item.latitude,
  item.longitude, item.actual_value, item.predicted_value, item.absolute_error,
    'Sin revisión registrada', item.experiment_registered_at, item.warning]);
  const csv = [header, ...rows].map(line => line.map(value => {
    const clean = String(value ?? '').replaceAll('"', '""');
    // Impide interpretar como fórmula un campo procedente de un dataset externo.
    const preventFormula = typeof value === 'string' && /^[\s]*[=+@-]/.test(clean);
    return `"${preventFormula ? "'" + clean : clean}"`;
  }).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url;
  link.download = 'estimaciones-retrospectivas-igp-2024-pagina.csv'; link.click();
  URL.revokeObjectURL(url);
}

/** Exporta únicamente las filas visibles y sus métricas, sin prometer el histórico completo. */
function exportCsv(items: Experiment[]) {
  const header = ['dataset', 'version', 'ejecucion_id', 'algoritmo', 'objetivo', 'tipo', 'mae', 'rmse', 'r2', 'accuracy', 'f1_macro', 'fecha'];
  const rows = items.map(item => [item.dataset_name, item.dataset_version, item.batch_id, item.algorithm,
  item.target_name, item.task_type, item.metrics.mae, item.metrics.rmse, item.metrics.r2,
  item.metrics.accuracy, item.metrics.macro_f1, item.created_at]);
  const csv = [header, ...rows].map(values => values.map(value => `"${String(value ?? '').replaceAll('"', '""')}"`).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = 'modelos-ml-igp-pagina.csv'; link.click();
  URL.revokeObjectURL(url);
}

/** En la vista 2025 el CSV incluye SOLO las métricas finales realmente persistidas.
 * Nunca exporta por error los pares de validación 2024 como si fueran 2025.
 */
function exportFinalMetricsCsv(model: NonNullable<FinalEvaluationReport['models']>[number],
  reference: NonNullable<FinalEvaluationReport['models']>[number], batchId: string) {
  const keys = ['mae', 'rmse', 'r2', 'accuracy', 'macro_f1'] as const;
  const rows = [['periodo', 'batch_id', 'algoritmo', 'metrica', 'baseline', 'modelo'],
  ...keys.filter(key => typeof model.metrics[key] === 'number')
    .map(key => ['2025', batchId, model.algorithm, key, reference.metrics[key] ?? '', model.metrics[key] ?? ''])];
  const csv = rows.map(cells => cells.map(cell => `"${String(cell).replaceAll('"', '""')}"`).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url;
  link.download = 'evaluacion-final-igp-2025-metricas.csv'; link.click();
  URL.revokeObjectURL(url);
}

/** CSV de todos los pares observados de un único experimento, no métricas globales. */
function exportPredictionCsv(rows: ValidationPrediction[], experimentId: string) {
  const values = [['experimento_id', 'fila_excel', 'fecha_utc', 'observado', 'estimado', 'particion'],
  ...rows.map(row => [experimentId, row.source_row, row.occurred_at,
    row.actual_value, row.predicted_value, 'validation_2024'])];
  const csv = values.map(line => line.map(v => `"${String(v).replaceAll('"', '""')}"`).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url;
  link.download = `validacion-igp-2024-${experimentId}.csv`; link.click();
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
  // Período del único detalle gráfico visible; 2025 usa solo métricas finales ya registradas.
  const [graphPeriod, setGraphPeriod] = useState<2024 | 2025>(2024);
  const graphDetailRef = useRef<HTMLDivElement>(null);
  /** Selección desde cualquiera de las tablas; lleva al gráfico correspondiente. */
  const selectGraph = (modelId: string, period: 2024 | 2025) => {
    setChosenModel(modelId); setGraphPeriod(period);
    window.requestAnimationFrame(() => graphDetailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  // Métricas de 2025: carga de solo lectura, exclusivamente tras una evaluación final autorizada.
  const [finalReport, setFinalReport] = useState<FinalEvaluationReport | null>(null);
  const [finalLoading, setFinalLoading] = useState(false);
  const [finalError, setFinalError] = useState('');
  const [predictionResult, setPredictionResult] = useState<PredictionList | null>(null);
  const [predictionError, setPredictionError] = useState('');
  const [predictionLoading, setPredictionLoading] = useState(false);
  // Estimaciones 6.7: se leen desde la tabla ya existente, sin publicar ni aprobar.
  // El resumen usa todos los registros que cumplen los filtros, no solo cinco filas.
  const [estimateSummary, setEstimateSummary] = useState<EstimateSummary | null>(null);
  const [summaryError, setSummaryError] = useState('');
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [estimateModelId, setEstimateModelId] = useState('');
  // La tabla extensa permanece cerrada por defecto; se consulta a demanda.
  const [showEstimateRows, setShowEstimateRows] = useState(false);
  const [estimates, setEstimates] = useState<EstimateList | null>(null);
  const [estimateLoading, setEstimateLoading] = useState(false);
  const [estimateError, setEstimateError] = useState('');
  const [estimatePage, setEstimatePage] = useState(1);
  const [estimatePageSize, setEstimatePageSize] = useState<TablePageSize>(5);
  const [estimateDetail, setEstimateDetail] = useState<RetrospectiveEstimate | null>(null);
  // El detalle de 556 filas se abre a voluntad; las métricas y gráficos siguen visibles.
  const [showPredictionRows, setShowPredictionRows] = useState(false);
  const [predictionPage, setPredictionPage] = useState(1);
  const [predictionPageSize, setPredictionPageSize] = useState<TablePageSize>(10);
  useEffect(() => {
    const controller = new AbortController();
    if (tab === 'estimaciones') { setLoading(false); setError(''); return () => controller.abort(); }
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

  // Un único resumen por filtros; al cambiar filtros se descarta el modelo anterior.
  useEffect(() => {
    if (tab !== 'estimaciones') return;
    const controller = new AbortController();
    setEstimateSummary(null); setSummaryError(''); setSummaryLoading(true);
    getRetrospectiveEstimateSummary(controller.signal, filters)
      .then(data => { if (!controller.signal.aborted) setEstimateSummary(data); })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setSummaryError(
          cause instanceof Error ? cause.message : 'No se pudo consultar el resumen');
      })
      .finally(() => { if (!controller.signal.aborted) setSummaryLoading(false); });
    return () => controller.abort();
  }, [tab, filters, revision]);

  // Detalle optativo: la paginación y selección de modelo se validan en FastAPI.
  useEffect(() => {
    if (tab !== 'estimaciones' || !showEstimateRows) return;
    const controller = new AbortController();
    setEstimateLoading(true); setEstimates(null); setEstimateError('');
    getRetrospectiveEstimates(controller.signal, {
      ...filters, experimentId: estimateModelId,
      page: estimatePage, pageSize: estimatePageSize,
    }).then(data => { if (!controller.signal.aborted) setEstimates(data); })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) {
          setEstimates(null);
          setEstimateError(reason instanceof Error ? reason.message : 'No se pudieron obtener las estimaciones');
        }
      })
      .finally(() => { if (!controller.signal.aborted) setEstimateLoading(false); });
    return () => controller.abort();
  }, [tab, showEstimateRows, filters, estimateModelId, estimatePage, estimatePageSize, revision]);

  // Comparar únicamente resultados de una misma ejecución; cada objetivo tiene su baseline.
  const batches = useMemo(() => {
    const entries = new Map<string, Experiment[]>();
    for (const item of comparison?.items ?? []) entries.set(item.batch_id, [...(entries.get(item.batch_id) ?? []), item]);
    return [...entries];
  }, [comparison]);
  const currentBatch = batches.find(([id]) => id === chosenBatch) ?? batches[0];
  const models = (currentBatch?.[1] ?? []).filter(item => item.params.baseline !== true);
  const currentModel = models.find(item => item.id === chosenModel) ?? models[0];
  const baseline = currentBatch?.[1]?.find(item => item.target_name === currentModel?.target_name && item.params.baseline === true);
  const modelId = tab === 'comparacion' ? currentModel?.id : undefined;
  const finalBatchId = tab === 'comparacion' ? currentBatch?.[0] : undefined;
  useEffect(() => {
    if (!finalBatchId) { setFinalReport(null); setFinalError(''); return; }
    const controller = new AbortController();
    setFinalReport(null); setFinalError(''); setFinalLoading(true);
    getFinalEvaluations(finalBatchId, controller.signal)
      .then(data => { if (!controller.signal.aborted) setFinalReport(data.items[0] ?? null); })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setFinalError(reason instanceof Error ? reason.message : 'No se pudo leer la prueba final');
      }).finally(() => { if (!controller.signal.aborted) setFinalLoading(false); });
    return () => controller.abort();
  }, [finalBatchId, revision]);
  // Evitar leer `.models` antes de que llegue la respuesta final de 2025.
  const finalModel = finalReport && finalReport.batch_id === finalBatchId
    ? finalReport.models.find(item => item.algorithm === currentModel?.algorithm) : undefined;
  const finalBaseline = finalReport && finalReport.batch_id === finalBatchId
    ? finalReport.models.find(item => item.algorithm === baseline?.algorithm) : undefined;
  const chartMetrics = graphPeriod === 2025 ? finalModel?.metrics : currentModel?.metrics;
  const chartBaselineMetrics = graphPeriod === 2025 ? finalBaseline?.metrics : baseline?.metrics;
  const finalRegressionBars = (['mae', 'rmse'] as const).flatMap(key => {
    const measured = finalModel?.metrics[key];
    const reference = finalBaseline?.metrics[key];
    return typeof measured === 'number' && typeof reference === 'number'
      ? [{ metric: key.toUpperCase(), referencia: reference, modelo: measured }] : [];
  });
  // La consulta de pares está ligada al ID actual: no mostrar filas de otro modelo.
  useEffect(() => {
    if (!modelId) { setPredictionResult(null); setPredictionError(''); return; }
    const controller = new AbortController();
    setPredictionResult(null); setPredictionError(''); setPredictionLoading(true);
    setPredictionPage(1);
    getValidationPredictions(modelId, controller.signal)
      .then(data => { if (!controller.signal.aborted) setPredictionResult(data); })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setPredictionError(
          reason instanceof Error ? reason.message : 'No se pudieron cargar las predicciones');
      })
      .finally(() => { if (!controller.signal.aborted) setPredictionLoading(false); });
    return () => controller.abort();
  }, [modelId, revision]);
  // No leer `.items` hasta confirmar que la respuesta existe y corresponde al modelo seleccionado.
  useEffect(() => { setShowPredictionRows(false); setPredictionPage(1); }, [modelId]);
  const predictionRows = predictionResult && predictionResult.experiment_id === modelId
    ? predictionResult.items
    : [];
  // Para evitar sobrecargar el gráfico se representa una muestra uniforme,
  // pero los 556 pares íntegros permanecen disponibles en tabla y CSV.
  const lines = currentModel?.task_type === 'regression' && predictionRows.length > 0
    ? predictionRows.filter((_, index) => index % Math.max(1, Math.ceil(predictionRows.length / 120)) === 0)
      .map(row => ({ date: row.occurred_at, real: Number(row.actual_value), estimated: Number(row.predicted_value) }))
    : (currentModel?.metrics.real_vs_estimated ?? []);
  // Un CSV de Comparación siempre corresponde a los pares del modelo elegido.
  // Si están cargando o no existen, no exportamos por error la tabla de experimentos.
  const canExport = !loading && (
    (tab === 'experimentos' && Boolean(result?.items.length)) ||
    (tab === 'comparacion' && (graphPeriod === 2025
      ? Boolean(finalReport && finalModel && finalBaseline)
      : !predictionLoading && predictionRows.length > 0)) ||
    (tab === 'estimaciones' && !estimateLoading && !estimateError && !summaryLoading && !summaryError &&
      (showEstimateRows ? Boolean(estimates?.items.length) : Boolean(estimateSummary?.models.length)))
  );

  return <div className="space-y-5">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-3xl font-bold text-main">Modelos ML</h1>
        <p className="mt-2 text-sm text-muted">Experimentos retrospectivos con catálogo IGP/CENSIS y validación de 2024 y prueba final independiente de 2025.</p>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <button type="button" onClick={() => { setDraft(filters); setFilterOpen(true); }} className="inline-flex items-center gap-2 rounded-xl border border-border-ui bg-panel px-3 py-2 text-sm text-main hover:bg-panel-alt"><Filter size={16} /> Filtros</button>
        <button type="button" onClick={() => setRevision(value => value + 1)} className="inline-flex items-center gap-2 rounded-xl border border-border-ui bg-panel px-3 py-2 text-sm text-main hover:bg-panel-alt"><RefreshCw size={16} /> Actualizar</button>
        <button type="button" disabled={!canExport}
          onClick={() => {
            if (tab === 'comparacion' && graphPeriod === 2025 && finalReport && finalModel && finalBaseline) {
              exportFinalMetricsCsv(finalModel, finalBaseline, finalReport.batch_id);
            } else if (tab === 'comparacion' && graphPeriod === 2024 && currentModel && predictionRows.length > 0) {
              exportPredictionCsv(predictionRows, currentModel.id);
            } else if (tab === 'experimentos') {
              exportCsv(result?.items ?? []);
            } else if (tab === 'estimaciones' && !estimateLoading && !estimateError && !summaryError) {
              if (showEstimateRows && estimates) exportEstimateCsv(estimates.items);
              else if (estimateSummary) exportEstimateSummaryCsv(estimateSummary);
            }
          }} className="inline-flex items-center gap-2 rounded-xl border border-border-ui bg-panel px-3 py-2 text-sm text-main hover:bg-panel-alt disabled:opacity-40"><Download size={16} /> CSV</button>
      </div>
    </header>

    <section className="flex gap-3 rounded-xl border border-border-ui bg-panel px-4 py-3">
      <ShieldAlert size={20} className="mt-0.5 shrink-0 text-accent" />
      <p className="text-sm text-muted"><strong className="text-main">Estimaciones experimentales, no predicciones sísmicas.</strong> Los modelos explican características de eventos ya observados; no anticipan terremotos ni generan alertas oficiales. El año 2025 pertenece a una prueba final independiente; solo se muestra cuando esté registrada.</p>
    </section>

    <nav className="flex gap-6 border-b border-border-ui" aria-label="Secciones de Modelos ML">
      {([['experimentos', 'Experimentos'], ['comparacion', 'Comparación'], ['estimaciones', 'Estimaciones']] as const).map(([key, label]) =>
        <button key={key} type="button" onClick={() => setTab(key)} className={`border-b-2 pb-3 text-sm font-medium ${tab === key ? 'border-accent text-main' : 'border-transparent text-muted hover:text-main'}`}>{label}</button>
      )}
    </nav>

    {loading && <div className="rounded-xl border border-border-ui bg-panel"><LoadingSpinner label="Consultando experimentos IGP…" /></div>}
    {error && <p role="alert" className="rounded-xl border border-rose-500 p-4 text-sm text-rose-600 dark:text-rose-300">{error}. Comprueba la migración ML y el despliegue de FastAPI.</p>}
    {!loading && !error && tab === 'experimentos' && <section className="overflow-hidden rounded-xl border border-border-ui bg-panel">
      {!result?.items.length ? <div className="p-8 text-center"><FlaskConical size={28} className="mx-auto text-accent" /><p className="mt-3 font-semibold text-main">Todavía no hay experimentos IGP registrados</p><p className="mt-2 text-sm text-muted">Valida primero el snapshot y entrena desde la CLI autorizada. Los experimentos USGS antiguos permanecen archivados.</p></div>
        : <div className="overflow-x-auto p-4 ui-thin-scrollbar"><table className="w-full min-w-[750px] text-left text-sm">
          <thead className="border-b border-border-ui text-xs text-muted"><tr><th className="py-3 pr-3">Algoritmo</th><th className="py-3 pr-3">Objetivo</th><th className="py-3 pr-3">Muestra</th><th className="py-3 pr-3">F1 macro</th><th className="py-3 pr-3">MAE</th><th className="py-3 pr-3">RMSE</th><th className="py-3 pr-3">R²</th><th className="py-3">Registro</th></tr></thead>
          <tbody>{result.items.map(row => <tr key={row.id} className="border-b border-border-ui/60 text-main"><td className="py-3 pr-3"><span className="font-medium">{algorithmName(row.algorithm)}</span>{row.params.baseline === true && <span className="ml-2 text-xs text-muted">Baseline</span>}</td><td className="py-3 pr-3">{target(row.target_name)}</td><td className="py-3 pr-3 text-muted">{task(row)}</td><td className="py-3 pr-3 tabular-nums">{percent(row.metrics.macro_f1)}</td><td className="py-3 pr-3 tabular-nums">{number(row.metrics.mae)}</td><td className="py-3 pr-3 tabular-nums">{number(row.metrics.rmse)}</td><td className="py-3 pr-3 tabular-nums">{number(row.metrics.r2)}</td><td className="py-3 text-xs text-muted">{date(row.created_at)}</td></tr>)}</tbody>
        </table></div>}
      <TablePagination page={page} pageSize={pageSize} pages={Math.ceil((result?.total ?? 0) / pageSize)} onPageChange={setPage} onPageSizeChange={value => { setPage(1); setPageSize(value); }} disabled={loading} />
    </section>}

    {!loading && !error && tab === 'comparacion' && (batches.length === 0 ?
      <div className="rounded-xl border border-border-ui bg-panel p-8 text-center text-sm text-muted">No hay comparaciones IGP. Primero ejecuta los experimentos autorizados.</div>
      : <section className="space-y-5 rounded-xl border border-border-ui bg-panel p-5">
        {comparison && comparison.total > 100 && <p className="text-xs text-amber-600 dark:text-amber-300">Se muestran las primeras 100 entradas. Filtra por dataset o ejecución para comparar un lote completo.</p>}
        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-1 text-sm text-muted">Ejecución del experimento
            <select className="block w-full rounded-lg border border-border-ui bg-page p-2 text-main" value={currentBatch?.[0] ?? ''} onChange={e => { setChosenBatch(e.target.value); setChosenModel(''); }}>
              {batches.map(([id, rows]) => <option key={id} value={id}>{rows[0].dataset_name} v{rows[0].dataset_version} · {date(rows[0].created_at)}</option>)}
            </select>
          </label>
          <label className="space-y-1 text-sm text-muted">Modelo (un gráfico a la vez)
            <select className="block w-full rounded-lg border border-border-ui bg-page p-2 text-main" value={currentModel?.id ?? ''} onChange={e => setChosenModel(e.target.value)}>
              {models.map(model => <option key={model.id} value={model.id}>{algorithmName(model.algorithm)} · {target(model.target_name)}</option>)}
            </select>
          </label>
        </div>
        {/* Ambas tablas comparten exactamente columnas, ancho y orden; solo cambia el año. */}
        <section className="space-y-2">
          <h2 className="text-base font-semibold text-main">Comparación de modelos · Validación IGP 2024</h2>
          <p className="text-xs text-muted">Resultados usados para seleccionar la configuración de cada modelo. Las diferencias se calculan frente a su propio baseline, sin comparar objetivos distintos.</p>
          <div className="overflow-x-auto rounded-lg border border-border-ui ui-thin-scrollbar">
            <table className="w-full min-w-[1320px] table-fixed text-sm text-main">
              <ComparisonColumns /><ComparisonHeader />
              <tbody>{models.map(model => {
                const reference = currentBatch?.[1].find(item => item.target_name === model.target_name && item.params.baseline === true);
                const score = comparisonScore(model, reference);
                const classification = model.task_type === 'classification';
                return <tr key={model.id} className={`border-t border-border-ui/60 ${model.id === currentModel?.id ? 'bg-panel-alt/60' : ''}`}>
                  <th scope="row" className="px-4 py-3 text-left font-medium break-words">{algorithmName(model.algorithm)}</th>
                  <td className="px-4 py-3 text-muted">{target(model.target_name)}</td>
                  <td className="px-4 py-3">{score.label}<MetricInfo metricKey={classification ? 'macro_f1' : 'mae'} /></td>
                  <td className="px-4 py-3 text-right tabular-nums">{primaryValue(score.expected, !classification, score.unit)}</td>
                  <td className="px-4 py-3 text-right tabular-nums font-medium">{primaryValue(score.observed, !classification, score.unit)}</td>
                  <td className={`px-4 py-3 text-right font-medium tabular-nums ${score.gain !== null && score.gain > 0 ? 'text-emerald-700 dark:text-emerald-300' : score.gain !== null && score.gain < 0 ? 'text-rose-700 dark:text-rose-300' : 'text-muted'}`}>
                    {favorableChange(score.gain, !classification, score.unit)}
                  </td>
                  <td className="px-4 py-3 text-xs tabular-nums text-muted">
                    {classification ? 'Accuracy' : 'R²'}<MetricInfo metricKey={classification ? 'accuracy' : 'r2'} />
                    <span className="mt-1 block whitespace-nowrap">{classification ? percent(metric(reference, 'accuracy')) : number(metric(reference, 'r2'))} → {classification ? percent(metric(model, 'accuracy')) : number(metric(model, 'r2'))}</span>
                  </td>
                  <td className="px-4 py-3"><button type="button" aria-label={`Ver gráfico de ${algorithmName(model.algorithm)} en 2024`} onClick={() => selectGraph(model.id, 2024)} className="whitespace-nowrap rounded-lg border border-border-ui bg-panel px-2 py-1.5 text-xs text-main hover:bg-panel-alt">Ver gráfico</button></td>
                </tr>;
              })}</tbody>
            </table>
          </div>
        </section>
        {/* 2025 es una evaluación FINAL almacenada; no se usan sus resultados para ajustar modelos. */}
        <section className="space-y-3">
          <h2 className="text-base font-semibold text-main">Comparación de modelos · Prueba final independiente · IGP 2025</h2>
          {finalLoading ? <p className="text-sm text-muted">Consultando resultados finales…</p>
            : finalError ? <p role="status" className="text-sm text-amber-600 dark:text-amber-300">No se pudo verificar la evaluación final: {finalError}</p>
              : finalReport ? <>
                <p className="text-xs text-muted">{finalReport.test_count} sismos de 2025 · Desarrollo: {finalReport.development_count} registros de 2019–2024 · Evaluación única registrada el {date(finalReport.evaluated_at)}. No representa pronósticos de futuros terremotos.</p>
                <div className="overflow-x-auto rounded-lg border border-border-ui ui-thin-scrollbar">
                  <table className="w-full min-w-[1320px] table-fixed text-sm text-main">
                    <ComparisonColumns /><ComparisonHeader />
                    <tbody>{models.map(model => {
                      const main = finalReport.models.find(item => item.algorithm === model.algorithm);
                      const reference = currentBatch?.[1].find(item => item.target_name === model.target_name && item.params.baseline === true);
                      const dummy = finalReport.models.find(item => item.algorithm === reference?.algorithm);
                      const regression = model.task_type === 'regression';
                      const score = comparisonScore(model, reference);
                      const baselineValue = regression ? dummy?.metrics.mae : dummy?.metrics.macro_f1;
                      const modelValue = regression ? main?.metrics.mae : main?.metrics.macro_f1;
                      const gain = baselineValue == null || modelValue == null ? null : regression ? baselineValue - modelValue : modelValue - baselineValue;
                      return <tr key={model.id} className="border-t border-border-ui/60">
                        <th scope="row" className="px-4 py-3 text-left font-medium break-words">{algorithmName(model.algorithm)}</th>
                        <td className="px-4 py-3 text-muted">{target(model.target_name)}</td>
                        <td className="px-4 py-3">{score.label}<MetricInfo metricKey={regression ? 'mae' : 'macro_f1'} /></td>
                        <td className="px-4 py-3 text-right tabular-nums">{primaryValue(baselineValue, regression, score.unit)}</td>
                        <td className="px-4 py-3 text-right font-medium tabular-nums">{primaryValue(modelValue, regression, score.unit)}</td>
                        <td className={`px-4 py-3 text-right font-medium tabular-nums ${gain !== null && gain > 0 ? 'text-emerald-700 dark:text-emerald-300' : gain !== null && gain < 0 ? 'text-rose-700 dark:text-rose-300' : 'text-muted'}`}>
                          {favorableChange(gain, regression, score.unit)}
                        </td>
                        <td className="px-4 py-3 text-xs tabular-nums text-muted">
                          {regression ? 'R²' : 'Accuracy'}<MetricInfo metricKey={regression ? 'r2' : 'accuracy'} />
                          <span className="mt-1 block whitespace-nowrap">{regression ? number(dummy?.metrics.r2) : percent(dummy?.metrics.accuracy)} → {regression ? number(main?.metrics.r2) : percent(main?.metrics.accuracy)}</span>
                        </td>
                        <td className="px-4 py-3"><button type="button" disabled={!main} aria-label={`Ver gráfico de ${algorithmName(model.algorithm)} en 2025`}
                          onClick={() => selectGraph(model.id, 2025)}
                          className="whitespace-nowrap rounded-lg border border-border-ui bg-panel px-2 py-1.5 text-xs text-main hover:bg-panel-alt disabled:opacity-40">Ver gráfico</button></td>
                      </tr>;
                    })}</tbody>
                  </table>
                </div>
              </> : <p className="text-sm text-muted">Aún no existe una evaluación final registrada para esta ejecución. Se mostrará aquí después de aprobar el dataset y ejecutar la prueba final una sola vez.</p>}
        </section>
        {currentModel && <>
          <div ref={graphDetailRef} className="flex scroll-mt-8 flex-wrap items-center justify-between gap-3 border-t border-border-ui pt-4">
            <h3 className="text-sm font-semibold text-main">Detalle de {algorithmName(currentModel.algorithm)} · {graphPeriod === 2024 ? 'Validación IGP 2024' : 'Prueba final IGP 2025'}</h3>
            <div className="inline-flex rounded-lg border border-border-ui bg-panel-alt p-1" role="group" aria-label="Período del gráfico">
              <button type="button" aria-pressed={graphPeriod === 2024} onClick={() => setGraphPeriod(2024)} className={`rounded-md px-3 py-1.5 text-xs ${graphPeriod === 2024 ? 'bg-panel font-semibold text-main shadow-sm' : 'text-muted hover:text-main'}`}>Validación 2024</button>
              <button type="button" aria-pressed={graphPeriod === 2025} disabled={!finalModel} onClick={() => setGraphPeriod(2025)} className={`rounded-md px-3 py-1.5 text-xs disabled:opacity-40 ${graphPeriod === 2025 ? 'bg-panel font-semibold text-main shadow-sm' : 'text-muted hover:text-main'}`}>Prueba final 2025</button>
            </div>
          </div>
          {graphPeriod === 2025 && <p className="text-xs text-muted">Los gráficos de 2025 usan exclusivamente métricas y matrices finales ya registradas. No se almacenaron pares por evento para trazar una curva real–estimada en 2025; no se repite la evaluación.</p>}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {(currentModel.task_type === 'regression' ? [['MAE', 'mae'], ['RMSE', 'rmse'], ['R²', 'r2']] : [['Accuracy', 'accuracy'], ['F1 macro', 'macro_f1']]).map(([label, key]) =>
              <div key={key} className="rounded-lg bg-panel-alt p-3"><p className="flex items-center text-xs text-muted">{label}<MetricInfo metricKey={key as MetricHelpKey} /></p><p className="mt-1 text-lg font-semibold tabular-nums text-main">{key === 'accuracy' || key === 'macro_f1' ? percent(metricFrom(chartMetrics, key)) : `${number(metricFrom(chartMetrics, key))}${key !== 'r2' && metricFrom(chartMetrics, key) !== null ? currentModel.target_name === 'depth_observed' ? ' km' : ' M' : ''}`}</p><p className="text-xs text-muted">Baseline: {key === 'accuracy' || key === 'macro_f1' ? percent(metricFrom(chartBaselineMetrics, key)) : number(metricFrom(chartBaselineMetrics, key))}</p></div>
            )}
          </div>
          {graphPeriod === 2024 && predictionLoading && <p className="text-xs text-muted">Cargando pares de validación 2024…</p>}
          {graphPeriod === 2024 && predictionError && <p role="status" className="text-xs text-amber-600 dark:text-amber-300">No hay pares completos disponibles ({predictionError}). Se mantienen las métricas, la matriz y la muestra de regresión guardadas originalmente.</p>}
          {graphPeriod === 2024 && currentModel.task_type === 'regression' && lines.length > 0 && <p className="text-xs text-muted">Serie de eventos de 2024 por fecha UTC, hasta 120 puntos visualizados. {predictionRows.length ? `${predictionRows.length} pares observados/estimados disponibles en tabla y CSV.` : 'Muestra original almacenada en métricas; recupera todos los pares con la CLI.'}</p>}
          {graphPeriod === 2024 && currentModel.task_type === 'regression' && lines.length > 0 && <div className="h-72 w-full" role="img" aria-label="Serie real frente a estimada, validación 2024"><ResponsiveContainer width="100%" height="100%"><LineChart data={lines} margin={{ top: 12, right: 16, bottom: 4, left: 0 }}><CartesianGrid strokeDasharray="3 3" opacity={0.2} /><XAxis dataKey="date" hide /><YAxis width={55} domain={['auto', 'auto']} stroke="var(--ui-muted)" /><Tooltip content={<ComparisonTooltip />} /><Legend /><Line dataKey="real" name="Real (2024)" dot={false} stroke="#3b82f6" strokeWidth={2} /><Line dataKey="estimated" name="Estimada (2024)" dot={false} stroke="#f59e0b" strokeWidth={2} /></LineChart></ResponsiveContainer></div>}
          {graphPeriod === 2025 && currentModel.task_type === 'regression' && (finalLoading ? <p className="text-sm text-muted">Cargando métricas finales de 2025…</p> : finalRegressionBars.length > 0 ? <div className="space-y-2">
            <p className="text-xs text-muted">Comparación de MAE y RMSE finales, referencia frente a modelo. Unidades: {currentModel.target_name === 'depth_observed' ? 'km' : 'magnitud M'}. Menor es mejor.</p>
            <div className="h-72 w-full" role="img" aria-label="Gráfico de errores agregados de prueba final 2025">
              <ResponsiveContainer width="100%" height="100%"><BarChart data={finalRegressionBars} margin={{ top: 12, right: 16, bottom: 4, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} /><XAxis dataKey="metric" stroke="var(--ui-muted)" /><YAxis width={55} stroke="var(--ui-muted)" />
                <Tooltip content={<ComparisonTooltip />} /><Legend />
                <Bar name="Baseline" dataKey="referencia" fill="#64748b" radius={[4, 4, 0, 0]} />
                <Bar name="Modelo" dataKey="modelo" fill="#0e7490" radius={[4, 4, 0, 0]} />
              </BarChart></ResponsiveContainer>
            </div>
          </div> : <p className="text-sm text-muted">Las métricas finales para este modelo aún no están disponibles.</p>)}
          {currentModel.task_type === 'classification' && (graphPeriod === 2024 || finalModel) && <ClassificationEvidence metrics={chartMetrics} period={graphPeriod} />}
          {graphPeriod === 2024 && predictionRows.length > 0 && <section className="space-y-3 border-t border-border-ui pt-4">
            <button type="button" aria-expanded={showPredictionRows} onClick={() => setShowPredictionRows(value => !value)}
              className="flex w-full items-center justify-between gap-3 rounded-lg border border-border-ui bg-panel-alt px-4 py-3 text-left text-sm font-semibold text-main hover:bg-page">
              <span>Trazabilidad por sismo · Validación 2024 <span className="font-normal text-muted">({predictionRows.length} registros)</span></span>
              <ChevronDown size={18} aria-hidden="true" className={`shrink-0 transition-transform ${showPredictionRows ? 'rotate-180' : ''}`} />
            </button>
            {showPredictionRows && <>
              <p className="text-xs text-muted">{predictionRows.length} registros IGP asociados a este experimento; CSV descarga todos. No incluye 2025.</p>
              <div className="overflow-x-auto ui-thin-scrollbar"><table className="w-full min-w-[550px] text-left text-sm text-main">
                <thead><tr className="border-b border-border-ui text-xs text-muted"><th className="p-2">Fila</th><th className="p-2">Fecha UTC</th><th className="p-2">Observado</th><th className="p-2">Estimado</th><th className="p-2">Resultado</th></tr></thead>
                <tbody>{predictionRows.slice((predictionPage - 1) * predictionPageSize, predictionPage * predictionPageSize).map(row => {
                  const isRegression = currentModel.task_type === 'regression';
                  const observed = row.actual_value;
                  const estimated = row.predicted_value;
                  return <tr key={row.source_row} className="border-b border-border-ui/50">
                    <td className="p-2 tabular-nums">{row.source_row}</td>
                    <td className="p-2 text-xs">{row.occurred_at.replace('T', ' ').slice(0, 19)} UTC</td>
                    <td className="p-2">{isRegression ? number(Number(observed)) : observed}</td>
                    <td className="p-2">{isRegression ? number(Number(estimated)) : estimated}</td>
                    <td className="p-2">{isRegression ? `Error ${number(Math.abs(Number(observed) - Number(estimated)))}` : observed === estimated ? 'Acierto' : 'Error'}</td>
                  </tr>;
                })}</tbody>
              </table></div>
              <TablePagination page={predictionPage} pageSize={predictionPageSize}
                pages={Math.ceil(predictionRows.length / predictionPageSize)} onPageChange={setPredictionPage}
                onPageSizeChange={size => { setPredictionPage(1); setPredictionPageSize(size); }} />
            </>}
          </section>}
          {currentModel.target_name === 'depth_class_observed' && <div className="flex gap-2 rounded-lg bg-panel-alt p-3 text-sm text-muted"><AlertTriangle size={18} className="shrink-0" /><p>{knnNote}</p></div>}
          <div className="border-t border-border-ui pt-4 text-xs text-muted"><p>Entrenamiento: {currentModel.validation_spec.train_count} registros, hasta {date(currentModel.validation_spec.train_end)} · Validación: {currentModel.validation_spec.validation_count} registros, hasta {date(currentModel.validation_spec.validation_end ?? '')}. Prueba 2025: {finalReport ? 'evaluada de forma independiente' : 'pendiente y reservada'}.</p><p className="mt-2">{currentModel.limitations}</p></div>
        </>}
      </section>)}

    {tab === 'estimaciones' && <section className="space-y-4 rounded-xl border border-border-ui bg-panel p-5">
      <div className="flex items-start gap-3">
        <BrainCircuit size={20} className="mt-0.5 shrink-0 text-accent" />
        <div className="space-y-1">
          <h2 className="font-semibold text-main">Estimaciones retrospectivas · Validación 2024</h2>
          <p className="text-sm text-muted">Estos valores fueron calculados para sismos ya ocurridos; se comparan contra sus observaciones reales. Solo modelos IGP, sin baselines. No son pronósticos, no están aprobados ni se envían al Centro de alertas.</p>
          <p className="text-xs text-muted">La diferencia o acierto observado no constituye un intervalo de predicción ni una probabilidad calibrada. No hay fecha individual de cálculo ni revisión formal registradas.</p>
        </div>
      </div>
      {summaryLoading && <LoadingSpinner label="Calculando resumen de todas las estimaciones IGP…" />}
      {summaryError && <p role="alert" className="rounded-lg border border-rose-500/50 p-4 text-sm text-rose-600 dark:text-rose-300">{summaryError}. Comprueba la ruta /ml/estimates/summary.</p>}
      {!summaryLoading && !summaryError && estimateSummary && <>
        <div className="grid gap-3 sm:grid-cols-3">
          {([['Sismos únicos', estimateSummary.unique_events], ['Modelos evaluados', estimateSummary.total_models],
          ['Estimaciones retrospectivas', estimateSummary.total_estimates]] as const).map(([label, value]) =>
            <div key={label} className="rounded-lg bg-panel-alt p-4">
              <p className="text-xs text-muted">{label}</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-main">{value.toLocaleString('es-PE')}</p>
            </div>)}
        </div>
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-main">Resumen por modelo</h3>
          <p className="text-xs text-muted">Cada sismo puede aparecer una vez por modelo. Las métricas son de validación 2024 y no representan capacidad de pronóstico.</p>
          <div className="overflow-x-auto rounded-lg border border-border-ui ui-thin-scrollbar">
            <table className="w-full min-w-[560px] text-left text-sm text-main">
              <thead className="bg-panel-alt text-xs text-muted"><tr><th className="p-3">Modelo</th><th className="p-3">Objetivo</th><th className="p-3">Estimaciones</th><th className="p-3">Métrica validación</th><th className="p-3">Detalle</th></tr></thead>
              <tbody>{estimateSummary.models.map(model => <tr key={model.experiment_id} className="border-t border-border-ui/60">
                <td className="p-3 font-medium">{algorithmName(model.algorithm)}</td>
                <td className="p-3 text-xs text-muted">{target(model.target_name)}</td>
                <td className="p-3 tabular-nums">{model.total}</td>
                <td className="p-3 tabular-nums">{model.primary_metric === 'mae' ? 'MAE' : 'F1 macro'}: {model.primary_metric === 'mae' ? number(model.primary_value) : percent(model.primary_value)}</td>
                <td className="p-3"><button type="button" className="rounded-lg border border-border-ui px-3 py-1.5 text-xs hover:bg-panel-alt" onClick={() => {
                  setEstimateModelId(model.experiment_id); setEstimatePage(1); setShowEstimateRows(true);
                }}>Ver registros</button></td>
              </tr>)}</tbody>
            </table>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-ui pt-3">
          <p className="text-xs text-muted">No es necesario revisar las {estimateSummary.total_estimates.toLocaleString('es-PE')} filas individualmente; el detalle queda disponible para auditoría.</p>
          <button type="button" onClick={() => { setShowEstimateRows(value => !value); setEstimatePage(1); }}
            className="rounded-lg border border-border-ui px-3 py-2 text-sm text-main hover:bg-panel-alt">
            {showEstimateRows ? 'Ocultar detalle' : 'Explorar registros'}
          </button>
        </div>
      </>}
      {showEstimateRows && estimateSummary && <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="text-sm text-muted">Modelo en detalle
          <select className="ml-2 rounded-lg border border-border-ui bg-page p-2 text-main" value={estimateModelId}
            onChange={event => { setEstimateModelId(event.target.value); setEstimatePage(1); }}>
            <option value="">Todos los modelos</option>
            {estimateSummary.models.map(model => <option key={model.experiment_id} value={model.experiment_id}>{algorithmName(model.algorithm)}</option>)}
          </select>
        </label>
        <p className="text-xs text-muted">CSV exporta solo la página visible del detalle.</p>
      </div>}
      {showEstimateRows && estimateLoading && <LoadingSpinner label="Cargando estimaciones retrospectivas IGP…" />}
      {showEstimateRows && estimateError && <p role="alert" className="rounded-lg border border-rose-500/50 p-4 text-sm text-rose-600 dark:text-rose-300">{estimateError}. Comprueba que el backend tenga la ruta /ml/estimates.</p>}
      {showEstimateRows && !estimateLoading && !estimateError && !estimates?.items.length && <p className="rounded-lg bg-panel-alt p-6 text-center text-sm text-muted">Todavía no hay estimaciones retrospectivas IGP verificadas. Revisa la carga de predicciones de validación 2024.</p>}
      {showEstimateRows && !estimateLoading && !estimateError && Boolean(estimates?.items.length) && <>
        <p className="text-xs text-muted">{estimates?.total ?? 0} resultados retrospectivos sin revisar · CSV: únicamente la página visible · 2025 reservado.</p>
        <div className="overflow-x-auto rounded-lg border border-border-ui ui-thin-scrollbar">
          <table className="w-full min-w-[840px] text-left text-sm text-main">
            <thead className="bg-panel-alt text-xs text-muted"><tr><th className="p-3">Modelo</th><th className="p-3">Sismo 2024 (UTC)</th><th className="p-3">Ubicación (coordenadas)</th><th className="p-3">Observado</th><th className="p-3">Estimado</th><th className="p-3">Error / acierto</th><th className="p-3">Revisión</th><th className="p-3">Acción</th></tr></thead>
            <tbody>{estimates?.items.map(item => <tr key={`${item.experiment_id}-${item.source_row}`} className="border-t border-border-ui/70">
              <td className="p-3"><span className="font-medium">{algorithmName(item.algorithm)}</span><p className="mt-1 text-xs text-muted">{target(item.target_name)}</p></td>
              <td className="p-3 tabular-nums text-xs">{item.occurred_at.slice(0, 10)}<p className="mt-1 text-muted">Fila {item.source_row}</p></td>
              <td className="p-3 tabular-nums text-xs">{item.latitude == null || item.longitude == null ? 'Sin coordenadas' : `${Number(item.latitude).toFixed(3)}, ${Number(item.longitude).toFixed(3)}`}</td>
              <td className="p-3 tabular-nums">{item.task_type === 'regression' ? number(Number(item.actual_value)) : item.actual_value}</td>
              <td className="p-3 tabular-nums">{item.task_type === 'regression' ? number(Number(item.predicted_value)) : item.predicted_value}</td>
              <td className="p-3 text-xs">{item.task_type === 'regression' ? `Error observado: ${number(item.absolute_error)}` : item.correct_classification ? 'Clase correcta' : 'Clase incorrecta'}</td>
              <td className="p-3 text-xs text-muted">Sin revisar</td>
              <td className="p-3"><button type="button" onClick={() => setEstimateDetail(item)} className="rounded-lg border border-border-ui px-3 py-1.5 text-xs hover:bg-panel-alt">Detalles</button></td>
            </tr>)}</tbody>
          </table>
        </div>
      </>}
      {showEstimateRows && <TablePagination page={estimatePage} pageSize={estimatePageSize}
        pages={Math.ceil((estimates?.total ?? 0) / estimatePageSize)}
        onPageChange={setEstimatePage}
        onPageSizeChange={size => { setEstimatePage(1); setEstimatePageSize(size); }}
        disabled={estimateLoading} />}
    </section>}

    <Modal open={estimateDetail !== null} title="Detalle de estimación experimental" onClose={() => setEstimateDetail(null)}>
      {estimateDetail && <div className="space-y-3 text-sm text-main">
        <p className="rounded-lg bg-panel-alt p-3 text-xs text-muted"><strong className="text-main">Validación retrospectiva, sin revisión registrada.</strong> No se publica ni activa alertas oficiales.</p>
        <dl className="grid gap-3 sm:grid-cols-2">
          <div><dt className="text-xs text-muted">Modelo y versión</dt><dd className="font-medium">{algorithmName(estimateDetail.algorithm)} · {estimateDetail.model_version}</dd></div>
          <div><dt className="text-xs text-muted">Dataset</dt><dd>{estimateDetail.dataset_name} · v{estimateDetail.dataset_version}</dd></div>
          <div><dt className="text-xs text-muted">Fecha del sismo (UTC)</dt><dd>{estimateDetail.occurred_at.replace('T', ' ').slice(0, 19)}</dd></div>
          <div><dt className="text-xs text-muted">Ubicación</dt><dd>{estimateDetail.latitude ?? '—'}, {estimateDetail.longitude ?? '—'} (lat/lon)</dd></div>
          <div><dt className="text-xs text-muted">Indicador</dt><dd>{target(estimateDetail.target_name)}</dd></div>
          <div><dt className="text-xs text-muted">Fila de origen</dt><dd>{estimateDetail.source_row}</dd></div>
          <div><dt className="text-xs text-muted">Observado</dt><dd>{estimateDetail.actual_value}</dd></div>
          <div><dt className="text-xs text-muted">Estimado</dt><dd>{estimateDetail.predicted_value}</dd></div>
          <div><dt className="text-xs text-muted">Fecha de registro del experimento</dt><dd>{estimateDetail.experiment_registered_at ? date(estimateDetail.experiment_registered_at) : 'No registrada'}</dd></div>
          <div><dt className="text-xs text-muted">Fecha de cálculo individual</dt><dd>No registrada</dd></div>
          <div><dt className="text-xs text-muted">Intervalo / probabilidad</dt><dd>No calibrado ni disponible</dd></div>
          <div><dt className="text-xs text-muted">Estado de revisión</dt><dd>Sin revisión registrada</dd></div>
        </dl>
        <p className="rounded-lg bg-panel-alt p-3 text-xs text-muted">{estimateDetail.uncertainty_note}. {estimateDetail.warning}</p>
        <p className="text-xs text-muted">Limitaciones: {estimateDetail.limitations}</p>
      </div>}
    </Modal>

    <Modal open={filterOpen} title="Filtros" onClose={() => setFilterOpen(false)} footer={<><button type="button" className="rounded-lg border border-border-ui px-4 py-2 text-sm text-main" onClick={() => { setFilters({}); setDraft({}); setPage(1); setEstimatePage(1); setEstimateModelId(''); setFilterOpen(false); }}>Limpiar</button><button type="button" className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white" onClick={() => { setFilters(draft); setPage(1); setEstimatePage(1); setEstimateModelId(''); setFilterOpen(false); }}>Aplicar</button></>}>
      <div className="space-y-4">
        <label className="block text-sm text-muted">Tipo de experimento
          <select className="mt-1 w-full rounded-lg border border-border-ui bg-page p-2 text-main" value={draft.taskType ?? ''} onChange={e => setDraft(v => ({ ...v, taskType: e.target.value as ExperimentFilters['taskType'] }))}><option value="">Todos</option><option value="regression">Regresión</option><option value="classification">Clasificación</option></select>
        </label>
        <label className="block text-sm text-muted">ID de dataset (opcional)
          <input className="mt-1 w-full rounded-lg border border-border-ui bg-page p-2 text-main" placeholder="UUID del snapshot IGP" value={draft.datasetId ?? ''} onChange={e => setDraft(v => ({ ...v, datasetId: e.target.value.trim() }))} />
        </label>
        <label className="block text-sm text-muted">ID de ejecución (opcional)
          <input className="mt-1 w-full rounded-lg border border-border-ui bg-page p-2 text-main" placeholder="UUID de la ejecución" value={draft.batchId ?? ''} onChange={e => setDraft(v => ({ ...v, batchId: e.target.value.trim() }))} />
        </label>
      </div>
    </Modal>
  </div>;
}
