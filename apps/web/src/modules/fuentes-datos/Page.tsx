/** Estado real del conector USGS y trazabilidad de sincronizaciones. */
import { useEffect, useState } from 'react';
import { Database, RefreshCw } from 'lucide-react';
import { getSources } from '../../services/seismic';
import type { DataSource } from '../../types/seismic';

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleString('es-PE', { timeZone: 'America/Lima' }) : 'Sin sincronización';
}

export default function Page() {
  const [items, setItems] = useState<DataSource[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    getSources(controller.signal)
      .then(data => { setItems(data.items); setError(''); })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Error al consultar las fuentes');
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [revision]);
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-accent">Ingesta · Fuentes</p><h1 className="mt-2 text-3xl font-bold text-main">Fuentes de datos</h1><p className="mt-2 text-sm text-muted">Estado de conectores y última ejecución registrada en Supabase.</p></div>
        <button type="button" onClick={() => setRevision(n => n + 1)} className="inline-flex items-center gap-2 rounded-lg border border-border-ui bg-panel px-3 py-2 text-sm text-main hover:bg-panel-alt"><RefreshCw size={16}/> Actualizar</button>
      </div>
      {error && <p role="alert" className="rounded-lg border border-rose-300 p-3 text-sm text-rose-700 dark:text-rose-300">{error}. Verifica la conexión de FastAPI.</p>}
      {loading ? <div className="rounded-2xl border border-border-ui bg-panel p-8 text-muted">Consultando fuentes...</div>
        : items.length === 0 ? <div className="rounded-2xl border border-border-ui bg-panel p-10 text-center text-muted"><Database className="mx-auto mb-3"/>No hay fuentes registradas. Ejecuta el comando de sincronización USGS.</div>
        : <div className="grid gap-4 lg:grid-cols-2">{items.map(source => (
          <article key={source.id} className="space-y-4 rounded-2xl border border-border-ui bg-panel p-5">
            <div className="flex items-start justify-between gap-2"><div className="flex items-center gap-3"><span className="rounded-xl bg-panel-alt p-2 text-accent"><Database size={19}/></span><div><h2 className="font-semibold text-main">{source.name}</h2><p className="text-xs text-muted">{source.organization}</p></div></div><span className="rounded-full border border-border-ui bg-panel-alt px-2 py-1 text-xs text-main">{source.status}</span></div>
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div><dt className="text-xs text-muted">Última sincronización</dt><dd className="mt-1 text-main">{formatDate(source.last_sync_at)}</dd></div>
              <div><dt className="text-xs text-muted">Última correcta</dt><dd className="mt-1 text-main">{formatDate(source.last_success_at)}</dd></div>
              <div><dt className="text-xs text-muted">Última ejecución</dt><dd className="mt-1 text-main">{source.last_run?.status ?? 'Sin ejecuciones'}</dd></div>
              <div><dt className="text-xs text-muted">Vistos / nuevos / actualizados</dt><dd className="mt-1 text-main">{source.last_run ? `${source.last_run.records_seen} / ${source.last_run.records_inserted} / ${source.last_run.records_updated}` : '—'}</dd></div>
            </dl>
            {source.last_run?.error_summary && <p className="rounded-lg bg-panel-alt p-3 text-xs text-muted">{source.last_run.error_summary}</p>}
            <p className="text-xs text-soft">{source.license_notes ?? 'Condiciones de uso pendientes de documentar.'}</p>
          </article>
        ))}</div>}
      <p className="text-xs text-soft">La sincronización es manual desde Git Bash hasta implementar autenticación y tareas programadas. El estado “active” indica conector operativo, no monitoreo continuo garantizado.</p>
    </div>
  );
}
