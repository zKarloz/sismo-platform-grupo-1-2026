/** Suscripciones personales: diseño compacto, edición mediante modal y tabla paginada. */
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import Modal from '../../components/ui/Modal';
import {useEffect, useState} from 'react';
import type {FormEvent, ReactNode} from 'react';
import {Mail, Pencil, RefreshCw, ShieldCheck} from 'lucide-react';
import TablePagination, {type TablePageSize} from '../../components/ui/TablePagination';
import {getHistory, getPreference, savePreference} from '../../services/personalNotifications';
import type {NotificationPreference, PersonalHistory, PersonalDelivery} from '../../services/personalNotifications';

const btnStyle = 'rounded-lg border border-border-ui px-3 py-2 text-sm text-main hover:bg-panel-alt disabled:opacity-40';
const emptyHistory: PersonalHistory = {items: [], page: 1, page_size: 5, total: 0, pages: 1};
const statusLabels: Record<PersonalDelivery['status'], string> = {
  pending: 'Pendiente', sending: 'Procesando', sent: 'Aceptado por SMTP',
  failed: 'Fallido', cancelled: 'Cancelado',
};

function Label({children, tone = 'neutral'}: {children: ReactNode; tone?: 'neutral'|'success'|'warning'|'danger'}) {
  // Conservar la paleta global: solo los estados reciben color semántico.
  const classes = tone === 'success'
    ? 'border-emerald-400/60 bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
    : tone === 'warning'
      ? 'border-amber-400/60 bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-300'
      : tone === 'danger'
        ? 'border-red-400/60 bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300'
        : 'border-border-ui bg-panel-alt text-muted';
  return <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${classes}`}>{children}</span>;
}

function DatePeru({value}: {value: string | null}) {
  if (!value) return <span>—</span>;
  const formatted = new Intl.DateTimeFormat('es-PE', {
    dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Lima',
  }).format(new Date(value));
  return <span>{formatted}</span>;
}

function SettingsModal({pref, onClose, onSaved}: {
  pref: NotificationPreference; onClose: () => void;
  onSaved: (value: NotificationPreference) => void;
}) {
  const [enabled, setEnabled] = useState(pref.enabled);
  const [magnitude, setMagnitude] = useState(pref.min_magnitude);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(''); setSaving(true);
    try {
      const next = await savePreference(enabled, magnitude);
      onSaved(next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo guardar');
    } finally { setSaving(false); }
  }
  // Evita cerrar el diálogo mientras se guarda la preferencia.
  return <Modal open title="Editar mis notificaciones"
    description="Solo modifica las preferencias de tu cuenta."
    onClose={() => { if (!saving) onClose(); }}>
      <form onSubmit={event => void submit(event)} className="space-y-5">
        <label className="flex items-start justify-between gap-3 rounded-lg border border-border-ui p-3">
          <span><span className="block text-sm font-medium text-main">Recibir correos IGP</span>
            <span className="mt-1 block text-xs text-muted">Activación voluntaria, desactivada por defecto.</span></span>
          <input type="checkbox" className="mt-1 size-4 accent-cyan-700" checked={enabled}
            disabled={!pref.email_usable} onChange={event => setEnabled(event.target.checked)}/>
        </label>
        <div>
          <label htmlFor="umbral-personal" className="mb-2 flex justify-between text-sm font-medium text-main">
            Magnitud mínima <strong>M {magnitude.toFixed(1)}</strong>
          </label>
          <input id="umbral-personal" type="range" min="2" max="9" step="0.1" value={magnitude}
            onChange={event => setMagnitude(Number(event.target.value))} className="w-full accent-cyan-700"/>
          <p className="mt-1 text-xs text-muted">Es un filtro de notificación, no una medida automática de peligrosidad.</p>
        </div>
        <p className="rounded-lg bg-panel-alt p-3 text-xs text-muted">Si cambias el umbral o vuelves a activar los avisos, los sismos recibidos anteriormente no generarán correos retroactivos. Solo se consideran eventos reportados recientemente.</p>
        {!pref.email_usable && <p role="alert" className="text-sm text-amber-600">La cuenta necesita una dirección de correo real para activar envíos.</p>}
        {error && <p role="alert" className="text-sm text-rose-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" disabled={saving} onClick={onClose} className={btnStyle}>Cancelar</button>
          <button type="submit" disabled={saving || (enabled && !pref.email_usable)}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-40 dark:text-neutral-900">
            {saving ? <LoadingSpinner size="sm" variant="inline" label="Guardando…" /> : 'Guardar preferencias'}
          </button>
        </div>
      </form>
  </Modal>;
}

export default function MisNotificacionesPage() {
  const [tab, setTab] = useState<'preferencias' | 'historial'>('preferencias');
  const [pref, setPref] = useState<NotificationPreference | null>(null);
  const [history, setHistory] = useState<PersonalHistory>(emptyHistory);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<TablePageSize>(5);
  const [modal, setModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [revision, setRevision] = useState(0);

  // Cada pestaña consulta solamente los datos que necesita.
  useEffect(() => {
    let active = true;
    setLoading(true); setError('');
    const request = tab === 'preferencias'
      ? getPreference().then(value => {if (active) setPref(value);})
      : getHistory(page, pageSize).then(value => {if (active) setHistory(value);});
    void request.catch((cause: unknown) => {
      if (active) setError(cause instanceof Error ? cause.message : 'No se pudo consultar la información');
    }).finally(() => {if (active) setLoading(false);});
    return () => {active = false;};
  }, [tab, page, pageSize, revision]);

  const refresh = () => setRevision(value => value + 1);
  return <main className="space-y-5">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-3xl font-bold text-main">Mis notificaciones</h1>
        <p className="mt-1 text-sm text-muted">Configura los avisos por correo IGP/CENSIS y consulta los envíos asociados a tu cuenta.</p>
      </div>
      <button type="button" className={btnStyle + ' inline-flex items-center gap-2'} onClick={refresh}>
        <RefreshCw size={16}/> Actualizar
      </button>
    </header>
    {/* Estilo de pestañas subrayadas, igual que Fuentes de datos. */}
    <div role="tablist" aria-label="Apartados de mis notificaciones" className="flex flex-wrap gap-1 border-b border-border-ui">
      {([{id:'preferencias',label:'Preferencias'}, {id:'historial',label:'Historial'}] as const).map(option =>
        <button key={option.id} id={`notificaciones-tab-${option.id}`} type="button" role="tab"
          aria-controls={`notificaciones-panel-${option.id}`} aria-selected={tab === option.id}
          onClick={() => setTab(option.id)}
          className={`px-3 py-2.5 text-sm font-semibold transition-colors sm:px-4 ${tab === option.id
            ? 'border-b-2 border-accent text-main' : 'text-muted hover:text-main'}`}>
          {option.label}
        </button>)}
    </div>
    {error && <p role="alert" className="rounded-lg border border-red-300 p-3 text-sm text-red-700 dark:text-red-300">{error}</p>}
    {notice && <p role="status" className="rounded-lg border border-emerald-400/50 bg-emerald-100 p-3 text-sm text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">{notice}</p>}

    {tab === 'preferencias' && <section id="notificaciones-panel-preferencias" role="tabpanel" aria-labelledby="notificaciones-tab-preferencias" aria-label="Preferencias" className="rounded-xl border border-border-ui bg-panel p-5">
      {loading ? <LoadingSpinner label="Cargando preferencias…"/> : <>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-2">
            <p className="flex items-center gap-2 font-semibold text-main"><Mail size={18}/> Correo personal</p>
            {pref && <>
              <p className="break-all text-sm text-muted">{pref.email}</p>
              <div className="flex flex-wrap gap-2">
                <Label tone={pref.enabled ? 'success' : 'danger'}>{pref.enabled ? 'Suscrito' : 'Desactivado'}</Label>
                <Label>IGP/CENSIS</Label><Label>Magnitud ≥ {pref.min_magnitude.toFixed(1)}</Label>
              </div>
              <p className="text-xs text-muted">Activo desde: <DatePeru value={pref.activated_at}/></p>
            </>}
          </div>
          <button type="button" disabled={!pref} onClick={() => setModal(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-40 dark:text-neutral-900"><Pencil size={16}/> Editar</button>
        </div>
        <p className="mt-4 flex items-start gap-2 rounded-lg bg-panel-alt p-3 text-xs text-muted"><ShieldCheck size={18} className="shrink-0"/>
          El estado «Aceptado por SMTP» no garantiza la lectura. El envío depende de las reglas de consentimiento y la programación operativa.</p>
      </>}
    </section>}

    {tab === 'historial' && <section id="notificaciones-panel-historial" role="tabpanel" aria-labelledby="notificaciones-tab-historial" aria-label="Historial" className="overflow-hidden rounded-xl border border-border-ui bg-panel">
      <div className="overflow-x-auto"><table className="w-full min-w-[660px] text-left text-sm">
        <thead className="bg-panel-alt text-muted"><tr><th className="px-4 py-3">Evento</th>
          <th className="px-4 py-3">Ocurrencia (Perú)</th><th className="px-4 py-3">Estado</th>
          <th className="px-4 py-3">Intentos</th><th className="px-4 py-3">Envío</th></tr></thead>
        <tbody>
          {!loading && history.items.map(item => <tr key={item.id} className="border-t border-border-ui">
            <td className="px-4 py-3"><span className="font-medium text-main">M {item.magnitude?.toFixed(1) ?? '—'}</span>
              <span className="ml-2 text-muted">{item.place ?? 'Sin ubicación'}</span></td>
            <td className="px-4 py-3 text-muted"><DatePeru value={item.occurred_at}/></td>
            <td className="px-4 py-3"><Label tone={item.status === 'sent' ? 'success'
              : item.status === 'failed' ? 'danger'
              : item.status === 'pending' || item.status === 'sending' ? 'warning' : 'neutral'}>
              {statusLabels[item.status]}</Label></td>
            <td className="px-4 py-3 text-muted">{item.attempts} / 3</td>
            <td className="px-4 py-3 text-muted"><DatePeru value={item.sent_at}/></td>
          </tr>)}
          {!loading && history.items.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-muted">Aún no existen envíos para tu cuenta.</td></tr>}
          {loading && <tr><td colSpan={5}><LoadingSpinner label="Cargando historial…"/></td></tr>}
        </tbody>
      </table></div>
      <TablePagination page={page} pages={history.pages} pageSize={pageSize} disabled={loading}
        onPageChange={setPage} onPageSizeChange={size => {setPageSize(size);setPage(1);}}/>
    </section>}
    {modal && pref && <SettingsModal pref={pref} onClose={() => setModal(false)}
      onSaved={next => {
        setPref(next); setModal(false); setPage(1);
        setNotice('Preferencia guardada. Solo se evaluarán sismos recibidos desde la activación.');
        refresh();
      }}/>} 
  </main>;
}
