/** Calidad IGP: snapshots inmutables y revisión humana autenticada/auditada. */
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { CheckCircle2, ClipboardCheck, Database, Download, Filter, RefreshCw, Search, ShieldAlert } from 'lucide-react';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import Modal from '../../components/ui/Modal';
import TablePagination, { type TablePageSize } from '../../components/ui/TablePagination';
import { peruDateFilters } from '../../lib/peruMonth';
import { getDatasetIntegrity, getDatasetPreview, getDatasets, getQuality, reviewDataset } from '../../services/quality';
import type { AnalyticsFilters } from '../../types/analytics';
import type { DatasetIntegrity, DatasetList, DatasetMetadata, DatasetPreview, QualityReport } from '../../types/quality';
import { useAuth } from '../../auth/AuthProvider';

type Tab = 'datasets' | 'calidad' | 'trazabilidad';
type FormFilters = { start: string; end: string; minMagnitude: string; maxMagnitude: string; minDepth: string; maxDepth: string };
const emptyForm: FormFilters = { start: '', end: '', minMagnitude: '', maxMagnitude: '', minDepth: '', maxDepth: '' };
const fieldClass = 'w-full min-w-0 rounded-lg border border-border-ui bg-page px-3 py-2 text-sm text-main focus-visible:outline-2 focus-visible:outline-accent';
const buttonClass = 'inline-flex items-center justify-center gap-2 rounded-lg border border-border-ui bg-panel px-3 py-2 text-sm font-medium text-main transition-colors hover:bg-panel-alt disabled:opacity-40';
const labels: Record<string, string> = {
  magnitude: 'Magnitud', depth_km: 'Profundidad', magnitude_type: 'Tipo de magnitud',
  place: 'Localidad', source_updated_at: 'Actualización del origen',
};
const fmt = (value?: string | null) => value ? new Date(value).toLocaleString('es-PE', {
  timeZone: 'America/Lima', dateStyle: 'short', timeStyle: 'medium',
}) : 'No disponible';

// Exporta exclusivamente valores ya entregados por FastAPI, no registros internos de Supabase.
function csvCell(value: unknown): string {
  const text = value == null ? '' : String(value);
  const safe = /^[=+@-]/.test(text) && typeof value === 'string' ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}
function downloadCsv(filename: string, rows: unknown[][]) {
  const content = '\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = filename;
  document.body.appendChild(anchor); anchor.click(); anchor.remove();
  URL.revokeObjectURL(url);
}

export default function Page() {
  const { profile } = useAuth();
  const canReview = profile?.role === 'administrador' || profile?.role === 'analista';
  const [tab, setTab] = useState<Tab>('datasets');
  const [filters, setFilters] = useState<AnalyticsFilters>({ source: 'IGP/CENSIS' });
  const [form, setForm] = useState<FormFilters>(emptyForm);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filterError, setFilterError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<TablePageSize>(5);
  const [quality, setQuality] = useState<QualityReport | null>(null);
  const [datasets, setDatasets] = useState<DatasetList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<DatasetMetadata | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [preview, setPreview] = useState<DatasetPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const [integrity, setIntegrity] = useState<DatasetIntegrity | null>(null);
  const [checking, setChecking] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewDecision, setReviewDecision] = useState<'approved' | 'rejected'>('approved');
  const [reviewNote, setReviewNote] = useState('');
  const [reviewError, setReviewError] = useState('');
  const [reviewSaving, setReviewSaving] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError('');
    Promise.all([getQuality(filters, controller.signal), getDatasets(page, pageSize, controller.signal)])
      .then(([q, ds]) => { if (!controller.signal.aborted) { setQuality(q); setDatasets(ds); } })
      .catch((reason: unknown) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'No se pudieron consultar los datos'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [filters, page, pageSize, refresh]);

  const loadPreview = useCallback((item: DatasetMetadata) => {
    setSelected(item); setPreview(null); setPreviewError(''); setPreviewOpen(true); setPreviewLoading(true);
    getDatasetPreview(item.id, 1, 5).then(setPreview)
      .catch((reason: unknown) => setPreviewError(reason instanceof Error ? reason.message : 'No disponible'))
      .finally(() => setPreviewLoading(false));
  }, []);

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (form.start && form.end && form.start > form.end) { setFilterError('La fecha inicial supera la final.'); return; }
    const minMag = form.minMagnitude === '' ? undefined : Number(form.minMagnitude);
    const maxMag = form.maxMagnitude === '' ? undefined : Number(form.maxMagnitude);
    const minDep = form.minDepth === '' ? undefined : Number(form.minDepth);
    const maxDep = form.maxDepth === '' ? undefined : Number(form.maxDepth);
    if ([minMag,maxMag,minDep,maxDep].some(x => x !== undefined && !Number.isFinite(x)) ||
        (minMag !== undefined && maxMag !== undefined && minMag > maxMag) ||
        (minDep !== undefined && maxDep !== undefined && minDep > maxDep)) {
      setFilterError('Revisa los rangos de magnitud y profundidad.'); return;
    }
    setFilters({ source: 'IGP/CENSIS', ...peruDateFilters(form.start, form.end),
      ...(minMag !== undefined ? { min_magnitude: minMag } : {}),
      ...(maxMag !== undefined ? { max_magnitude: maxMag } : {}),
      ...(minDep !== undefined ? { min_depth: minDep } : {}),
      ...(maxDep !== undefined ? { max_depth: maxDep } : {}),
    });
    setFiltersOpen(false); setFilterError('');
  }

  async function submitReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || !canReview || reviewSaving) return;
    if (reviewNote.trim().length < 15) {
      setReviewError('Explica la decisión con al menos 15 caracteres.'); return;
    }
    setReviewSaving(true); setReviewError('');
    try {
      const result = await reviewDataset(selected.id, reviewDecision, reviewNote.trim());
      // La respuesta del backend es definitiva y queda auditada en Supabase.
      setSelected(current => current && current.id === result.dataset_id ? {
        ...current, review_decision: result.decision, review_note: result.note,
        reviewed_at: result.reviewed_at, reviewer_name: result.reviewer_name,
      } : current);
      setReviewOpen(false);
      setIntegrity(null);
      setRefresh(value => value + 1);
    } catch (reason) {
      setReviewError(reason instanceof Error ? reason.message : 'No se pudo registrar la decisión');
    } finally { setReviewSaving(false); }
  }
  function openTrace(item: DatasetMetadata) {
    setSelected(item); setIntegrity(null); setTab('trazabilidad');
  }
  function checkIntegrity() {
    if (!selected) return;
    setChecking(true); setIntegrity(null);
    getDatasetIntegrity(selected.id).then(setIntegrity)
      .catch(() => setError('No fue posible comprobar la integridad del snapshot'))
      .finally(() => setChecking(false));
  }
  const pages = Math.max(1, Math.ceil((datasets?.total ?? 0) / pageSize));
  const qualityMissing = useMemo(() => quality ? Object.entries(quality.missing) : [], [quality]);
  function exportCsv() {
    if (tab === 'calidad' && quality) {
      downloadCsv('calidad_igp.csv', [
        ['Indicador', 'Valor', 'Fuente'],
        ['Eventos', quality.total, 'IGP/CENSIS'],
        ['Registros con magnitud y profundidad', quality.complete_magnitude_depth, 'IGP/CENSIS'],
        ['Duplicados', quality.duplicates_within_source, 'IGP/CENSIS'],
        ['Inconsistencias', quality.out_of_range_or_invalid, 'IGP/CENSIS'],
        ['Fechas futuras', quality.future_events, 'IGP/CENSIS'],
        ...qualityMissing.map(([key, value]) => [`Nulos: ${labels[key] ?? key}`, value, 'IGP/CENSIS']),
      ]);
    } else if (tab === 'datasets' && datasets) {
      // Exportación de la página visible; no afirmar que contiene otras páginas.
      downloadCsv('datasets_igp_pagina_actual.csv', [
        ['Dataset', 'Versión', 'Filas', 'Creación Perú', 'Estado de calidad', 'Revisión', 'SHA-256', 'Fuente'],
        ...datasets.items.map(item => [item.name, item.version, item.row_count, fmt(item.created_at), item.quality_report.status, item.review_decision ?? 'pending', item.content_sha256, 'IGP/CENSIS']),
      ]);
    } else if (tab === 'trazabilidad' && selected) {
      downloadCsv('trazabilidad_dataset_igp.csv', [
        ['Campo', 'Valor'], ['Dataset', selected.name], ['Versión', selected.version],
        ['Fuente', 'IGP/CENSIS'], ['Filas', selected.row_count],
        ['SHA-256', selected.content_sha256], ['Creación Perú', fmt(selected.created_at)],
        ['Especificación de captura', JSON.stringify(selected.query_spec)],
        ['Informe congelado', JSON.stringify(selected.quality_report)],
        ['Integridad comprobada', integrity?.verified == null ? 'No comprobada' : integrity.verified ? 'Sí' : 'No'],
        ['Revisión', selected.review_decision ?? 'Pendiente'], ['Responsable', selected.reviewer_name ?? '—'],
        ['Motivo de revisión', selected.review_note ?? '—'], ['Fecha de revisión', fmt(selected.reviewed_at)],
      ]);
    }
  }

  return <div className="space-y-5">
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="max-w-2xl">
        <h1 className="text-3xl font-bold text-main">Calidad y datasets</h1>
        <p className="mt-1 text-sm text-muted">Preparación y trazabilidad de eventos IGP/CENSIS. Los datasets antiguos de otras fuentes se conservan fuera del catálogo actual.</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setFiltersOpen(true)} className={buttonClass}><Filter size={16}/> Filtros</button>
        <button type="button" onClick={() => setRefresh(n => n + 1)} className={buttonClass}><RefreshCw size={16}/> Actualizar</button>
        <button type="button" disabled={loading || (tab === 'datasets' && !datasets) || (tab === 'calidad' && !quality) || (tab === 'trazabilidad' && !selected)} onClick={exportCsv} className={buttonClass}><Download size={16}/> CSV</button>
      </div>
    </header>

    <div role="tablist" aria-label="Secciones de Calidad y datasets" className="flex gap-5 border-b border-border-ui">
      {([['datasets', 'Datasets'], ['calidad', 'Calidad'], ['trazabilidad', 'Trazabilidad']] as const).map(([key, label]) =>
        <button key={key} type="button" role="tab" aria-selected={tab === key}
          onClick={() => setTab(key)}
          className={`border-b-2 px-1 py-3 text-sm font-medium transition-colors ${tab === key ? 'border-accent text-main' : 'border-transparent text-muted hover:text-main'}`}>{label}</button>)}
    </div>

    {error && <p role="alert" className="rounded-lg border border-rose-400 p-3 text-sm text-rose-600 dark:text-rose-300">{error}. Comprueba FastAPI y Supabase.</p>}
    {loading && <div className="rounded-xl border border-border-ui bg-panel p-8"><LoadingSpinner label="Consultando calidad y datasets IGP…" /></div>}

    {tab === 'datasets' && !loading && <section role="tabpanel" className="overflow-hidden rounded-2xl border border-border-ui bg-panel">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-4 sm:px-5">
        <div><h2 className="flex items-center gap-2 font-semibold text-main"><Database size={17}/> Datasets IGP versionados</h2>
          <p className="mt-1 text-xs text-muted">Snapshots inmutables creados desde la terminal autorizada. No se muestran versiones históricas USGS.</p></div>
        <span className="text-xs font-medium text-muted">{datasets?.total ?? 0} versiones IGP</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[650px] text-left text-sm">
          <thead className="border-y border-border-ui bg-panel-alt text-xs text-muted"><tr>
            {['Dataset', 'Versión', 'Registros', 'Calidad', 'Revisión', 'Creado (Perú)', 'Acciones'].map(column => <th key={column} scope="col" className="px-4 py-3 font-semibold">{column}</th>)}
          </tr></thead>
          <tbody className="divide-y divide-border-ui">
            {datasets?.items.map(item => <tr key={item.id}>
              <td className="px-4 py-3 font-medium text-main">{item.name}
                {item.query_spec.dataset_kind === 'igp_instrumental_xlsx' && <p className="mt-1 text-xs font-normal text-muted">Histórico instrumental · 2019–2024 · M ≥ 4.0</p>}
              </td>
              <td className="px-4 py-3 text-main">v{item.version}</td>
              <td className="px-4 py-3 tabular-nums text-main">{item.row_count.toLocaleString('es-PE')}</td>
              <td className="px-4 py-3 text-muted">{item.quality_report.status === 'review' ? 'Requiere revisión' : item.query_spec.dataset_kind === 'igp_instrumental_xlsx' && item.quality_report.essential_fields_missing === 0 ? 'Campos esenciales completos' : item.quality_report.status === 'missing_values' ? 'Con datos faltantes' : 'Sin hallazgos'}</td>
              <td className="px-4 py-3 text-muted">{item.review_decision === 'approved' ? 'Aprobado' : item.review_decision === 'rejected' ? 'Rechazado' : 'Pendiente'}</td>
              <td className="px-4 py-3 text-muted">{fmt(item.created_at)}</td>
              <td className="px-4 py-3"><div className="flex gap-2">
                <button type="button" onClick={() => loadPreview(item)} className="text-xs font-semibold text-main underline underline-offset-2 hover:text-accent">Vista previa</button>
                <button type="button" onClick={() => openTrace(item)} className="text-xs font-semibold text-main underline underline-offset-2 hover:text-accent">Trazabilidad</button>
              </div></td>
            </tr>)}
          </tbody>
        </table>
        {datasets?.items.length === 0 && <div className="p-6 text-sm text-muted">Todavía no existen datasets IGP. Las versiones USGS históricas permanecen guardadas; crea una versión nueva IGP desde el CLI cuando confirmemos el volumen de eventos disponibles.</div>}
      </div>
      <TablePagination page={page} pages={pages} pageSize={pageSize}
        onPageChange={setPage} onPageSizeChange={size => { setPage(1); setPageSize(size); }} disabled={loading}/>
    </section>}

    {tab === 'calidad' && !loading && quality && <section role="tabpanel" className="space-y-4">
      <p className="text-xs text-muted">Informe de todos los eventos IGP/CENSIS que cumplen los filtros actuales. La tabla de datasets versionados es independiente de esos filtros.</p>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {([['Eventos IGP analizados', quality.total], ['Magnitud y profundidad completas', quality.complete_magnitude_depth],
          ['Duplicados dentro de fuente', quality.duplicates_within_source], ['Registros incoherentes', quality.out_of_range_or_invalid + quality.future_events]] as const).map(([label, value]) =>
          <div key={label} className="rounded-2xl border border-border-ui bg-panel p-4"><p className="text-xs text-muted">{label}</p><p className="mt-2 text-2xl font-bold tabular-nums text-main">{value.toLocaleString('es-PE')}</p></div>)}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <article className="rounded-2xl border border-border-ui bg-panel p-5">
          <h2 className="flex items-center gap-2 font-semibold text-main">{quality.status === 'review' ? <ShieldAlert size={18} className="text-amber-600"/> : <CheckCircle2 size={18} className="text-emerald-600"/>} Informe de integridad</h2>
          <dl className="mt-4 space-y-3 text-sm">
            {([['Estado', quality.status === 'review' ? 'Requiere revisión' : quality.status === 'missing_values' ? 'Con datos faltantes' : 'Sin hallazgos'],
              ['Fechas futuras', quality.future_events], ['Rangos inválidos', quality.out_of_range_or_invalid],
              ['Primer evento', fmt(quality.min_occurred_at)], ['Último evento', fmt(quality.max_occurred_at)]] as const).map(([key,value]) =>
                <div key={key} className="flex justify-between gap-4"><dt className="text-muted">{key}</dt><dd className="text-right font-medium text-main">{value}</dd></div>)}
          </dl><p className="mt-4 text-xs text-soft">{quality.method}</p>
        </article>
        <article className="rounded-2xl border border-border-ui bg-panel p-5">
          <h2 className="font-semibold text-main">Datos faltantes por campo</h2>
          <div className="mt-4 space-y-4">{qualityMissing.map(([key, value]) => <div key={key}>
            <div className="mb-1 flex items-center justify-between text-xs"><span className="text-muted">{labels[key] ?? key}</span><span className="text-main">{value} / {quality.total}</span></div>
            <div className="h-2 overflow-hidden rounded-full bg-panel-alt"><div className="h-full rounded-full bg-accent" style={{ width: `${quality.total ? 100 * value / quality.total : 0}%` }}/></div>
          </div>)}</div>
        </article>
      </div>
    </section>}

    {tab === 'trazabilidad' && <section role="tabpanel" className="space-y-4">
      <div className="rounded-2xl border border-border-ui bg-panel p-5">
        <h2 className="flex items-center gap-2 font-semibold text-main"><ClipboardCheck size={18}/> Trazabilidad de datasets</h2>
        <p className="mt-2 text-sm text-muted">Selecciona una versión en la pestaña Datasets para inspeccionar su huella SHA-256, la captura y el informe congelado.</p>
        {!selected ? <p className="mt-4 text-sm text-muted">No se ha seleccionado un dataset IGP.</p> : <>
          <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
            <div><dt className="text-xs text-muted">Dataset</dt><dd className="mt-1 font-medium text-main">{selected.name} · v{selected.version}</dd></div>
            <div><dt className="text-xs text-muted">Fuente congelada</dt><dd className="mt-1 font-medium text-main">IGP/CENSIS</dd></div>
            <div><dt className="text-xs text-muted">Cantidad de registros</dt><dd className="mt-1 text-main">{selected.row_count.toLocaleString('es-PE')}</dd></div>
            <div><dt className="text-xs text-muted">Creación (Perú)</dt><dd className="mt-1 text-main">{fmt(selected.created_at)}</dd></div>
          </dl>
          {selected.query_spec.dataset_kind === 'igp_instrumental_xlsx' && <div className="mt-4 rounded-xl border border-border-ui bg-panel-alt p-3 text-sm text-main">
            <p className="font-semibold">Partición temporal del catálogo histórico</p>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              <p>Entrenamiento · 2019–2023: <strong>{selected.quality_report.by_split?.train?.toLocaleString('es-PE') ?? '—'} filas</strong></p>
              <p>Validación · 2024: <strong>{selected.quality_report.by_split?.validation?.toLocaleString('es-PE') ?? '—'} filas</strong></p>
            </div>
            <p className="mt-2 text-xs text-muted">2025 permanece reservado para la prueba final; no forma parte de esta versión. La columna de localidad y el tipo de magnitud no están presentes en el Excel.</p>
          </div>}
          <div className="mt-4 rounded-xl border border-border-ui bg-panel-alt p-3 text-sm">
            <p className="font-semibold text-main">Revisión del dataset: {selected.review_decision === 'approved' ? 'Aprobado' : selected.review_decision === 'rejected' ? 'Rechazado' : 'Pendiente'}</p>
            {selected.review_decision ? <>
              <p className="mt-1 text-muted">Responsable: {selected.reviewer_name ?? 'Usuario autorizado'} · {fmt(selected.reviewed_at)}</p>
              <p className="mt-2 whitespace-pre-wrap text-main">{selected.review_note}</p>
            </> : <p className="mt-1 text-muted">La revisión formal se registra una sola vez por versión, después de comprobar sus datos.</p>}
          </div>
          <p className="mt-4 break-all font-mono text-xs text-soft">SHA-256: {selected.content_sha256}</p>
          <div className="mt-4 flex flex-wrap gap-2"><button type="button" onClick={checkIntegrity} disabled={checking} className={buttonClass}><Search size={15}/>{checking ? 'Verificando…' : 'Verificar integridad'}</button>
            <button type="button" onClick={() => loadPreview(selected)} className={buttonClass}>Vista previa</button>
            {canReview && !selected.review_decision && selected.query_spec.dataset_kind === 'igp_instrumental_xlsx' && <button type="button" className={buttonClass} onClick={() => {
              setReviewDecision('approved'); setReviewNote(''); setReviewError(''); setReviewOpen(true);
            }}>Revisar dataset</button>}</div>
          {integrity && <p role="status" className={`mt-3 rounded-lg border p-3 text-sm ${integrity.verified ? 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200' : 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200'}`}>
            {integrity.verified ? 'Integridad verificada: SHA-256, número de filas y fuente IGP coinciden.' : 'Inconsistencia detectada: revisar hash, cantidad o procedencia de filas.'}
          </p>}
          <h3 className="mt-5 text-sm font-semibold text-main">Criterios de captura</h3>
          <pre className="mt-2 max-h-48 overflow-auto rounded-lg bg-panel-alt p-3 text-xs text-main">{JSON.stringify(selected.query_spec, null, 2)}</pre>
          <h3 className="mt-4 text-sm font-semibold text-main">Informe congelado</h3>
          <pre className="mt-2 max-h-48 overflow-auto rounded-lg bg-panel-alt p-3 text-xs text-main">{JSON.stringify(selected.quality_report, null, 2)}</pre>
        </>}
      </div>
      <p className="text-xs text-muted">La revisión no altera las filas ni las métricas ML. Una aprobación emitida ahora no supone que los modelos históricos se entrenaron después de ella.</p>
    </section>}

    <Modal open={reviewOpen} title="Revisión de dataset IGP" onClose={() => { if (!reviewSaving) setReviewOpen(false); }}
      description={selected ? `${selected.name} · v${selected.version} · decisión definitiva` : undefined}>
      <form onSubmit={submitReview} className="space-y-4">
        <p className="text-sm text-muted">La aprobación verifica de nuevo la integridad completa, la procedencia y la partición temporal. El rechazo registra la razón sin alterar el snapshot. La decisión no se puede editar; cualquier corrección exige una nueva versión.</p>
        <label className="block space-y-1 text-sm text-muted">Decisión
          <select className={fieldClass} value={reviewDecision} disabled={reviewSaving} onChange={event => setReviewDecision(event.target.value as 'approved' | 'rejected')}>
            <option value="approved">Aprobar dataset</option><option value="rejected">Rechazar dataset</option>
          </select>
        </label>
        <label className="block space-y-1 text-sm text-muted">Justificación
          <textarea className={fieldClass} value={reviewNote} onChange={event => setReviewNote(event.target.value)}
            minLength={15} maxLength={1000} required rows={3} disabled={reviewSaving}
            placeholder="Describe la revisión de integridad y las limitaciones conocidas" />
        </label>
        {reviewError && <p role="alert" className="text-sm text-rose-600 dark:text-rose-300">{reviewError}</p>}
        <div className="flex justify-end gap-2 border-t border-border-ui pt-3">
          <button type="button" className={buttonClass} disabled={reviewSaving} onClick={() => setReviewOpen(false)}>Cancelar</button>
          <button type="submit" disabled={reviewSaving} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40 dark:bg-slate-100 dark:text-slate-950">{reviewSaving ? 'Registrando…' : 'Confirmar decisión'}</button>
        </div>
      </form>
    </Modal>
    <Modal open={filtersOpen} title="Filtros" onClose={() => setFiltersOpen(false)}
      description="Se aplican únicamente al informe de calidad. Fuente fija: IGP/CENSIS.">
      <form id="quality-filters-form" className="space-y-4" onSubmit={applyFilters}>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-sm text-muted">Fecha inicial (Perú)<input type="date" value={form.start} onChange={e => setForm(p => ({...p, start:e.target.value}))} className={fieldClass}/></label>
          <label className="space-y-1 text-sm text-muted">Fecha final (Perú)<input type="date" value={form.end} onChange={e => setForm(p => ({...p, end:e.target.value}))} className={fieldClass}/></label>
          {([['minMagnitude', 'Magnitud mínima'], ['maxMagnitude', 'Magnitud máxima'],
            ['minDepth', 'Profundidad mínima (km)'], ['maxDepth', 'Profundidad máxima (km)']] as const).map(([key, label]) =>
              <label className="space-y-1 text-sm text-muted" key={key}>{label}<input type="number" step="0.1" value={form[key]} onChange={e => setForm(p => ({...p, [key]:e.target.value}))} className={fieldClass}/></label>)}
        </div>
        {filterError && <p role="alert" className="text-sm text-rose-600 dark:text-rose-300">{filterError}</p>}
        <div className="flex flex-wrap justify-end gap-2 border-t border-border-ui pt-4">
          <button type="button" className={buttonClass} onClick={() => { setForm(emptyForm); setFilters({source:'IGP/CENSIS'}); setFiltersOpen(false); setFilterError(''); }}>Limpiar</button>
          <button type="submit" className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-950 dark:hover:bg-white">Aplicar filtros</button>
        </div>
      </form>
    </Modal>
    <Modal open={previewOpen} title="Vista previa del dataset" description={selected ? `${selected.name} · v${selected.version} · primeros 5 registros congelados` : undefined} onClose={() => setPreviewOpen(false)}>
      {previewLoading ? <LoadingSpinner label="Consultando filas congeladas…"/> : previewError ? <p role="alert" className="text-sm text-rose-500">{previewError}</p> : <div className="space-y-3">
        {preview?.items.map(row => <div key={row.position} className="rounded-lg border border-border-ui bg-page p-3 text-sm">
          <p className="font-semibold text-main">#{row.position} · {row.external_id ?? 'Sin identificador'}</p>
          <p className="mt-1 text-muted">{fmt(row.occurred_at)} · Magnitud {row.magnitude ?? '—'} · Profundidad {row.depth_km == null ? '—' : `${row.depth_km} km`}</p>
          <p className="mt-1 text-muted">{row.split === 'train' ? 'Entrenamiento' : row.split === 'validation' ? 'Validación' : row.place ?? 'Localidad no registrada'}</p>
        </div>)}
        <p className="text-xs text-muted">Se muestran como máximo 5 filas de {preview?.total ?? 0}. La vista previa no modifica los registros.</p>
      </div>}
    </Modal>
  </div>;
}
