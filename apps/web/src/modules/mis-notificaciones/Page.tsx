/** Suscripciones personales: diseño compacto, edición mediante modal y tabla paginada. */
import {useCallback, useEffect, useRef, useState} from 'react';
import type {FormEvent, ReactNode} from 'react';
import {BellRing, ChevronLeft, ChevronRight, Mail, Pencil, ShieldCheck, X} from 'lucide-react';
import {getHistory, getPreference, savePreference} from '../../services/personalNotifications';
import type {NotificationPreference, PersonalHistory, PersonalDelivery} from '../../services/personalNotifications';

const inputStyle = 'w-full rounded-lg border border-border-ui bg-page px-3 py-2 text-sm text-main';
const btnStyle = 'rounded-lg border border-border-ui px-3 py-2 text-sm text-main hover:bg-panel-alt disabled:opacity-40';
const emptyHistory: PersonalHistory = {items: [], page: 1, page_size: 10, total: 0, pages: 1};
const statusLabels: Record<PersonalDelivery['status'], string> = {
  pending: 'Pendiente', sending: 'Procesando', sent: 'Aceptado por SMTP',
  failed: 'Fallido', cancelled: 'Cancelado',
};

function Label({children, tone = 'neutral'}: {children: ReactNode; tone?: 'neutral'|'success'|'warning'}) {
  const classes = tone === 'success' ? 'border-emerald-300 text-emerald-700 dark:border-neutral-500 dark:text-neutral-200'
    : tone === 'warning' ? 'border-amber-300 text-amber-700 dark:border-neutral-500 dark:text-neutral-200'
    : 'border-border-ui text-muted';
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
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    cancelRef.current?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      // Mantener el foco dentro del diálogo para navegación accesible.
      if (event.key === 'Tab') {
        const dialog = document.getElementById('modal-preferencias');
        const candidates = Array.from(dialog?.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled])') ?? []);
        if (!candidates.length) return;
        const first = candidates[0], last = candidates[candidates.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);
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
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
    onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section id="modal-preferencias" role="dialog" aria-modal="true" aria-labelledby="titulo-preferencias"
      className="w-full max-w-lg rounded-xl border border-border-ui bg-panel p-5 shadow-2xl">
      <header className="flex items-start justify-between gap-2">
        <div><h2 id="titulo-preferencias" className="text-lg font-semibold text-main">Editar mis notificaciones</h2>
          <p className="mt-1 text-sm text-muted">Solo modifica las preferencias de tu cuenta.</p></div>
        <button type="button" aria-label="Cerrar" onClick={onClose} className={btnStyle}><X size={17}/></button>
      </header>
      <form onSubmit={event => void submit(event)} className="mt-5 space-y-5">
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
          <button ref={cancelRef} type="button" onClick={onClose} className={btnStyle}>Cancelar</button>
          <button type="submit" disabled={saving || (enabled && !pref.email_usable)}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-40 dark:text-neutral-900">
            {saving ? 'Guardando…' : 'Guardar preferencias'}
          </button>
        </div>
      </form>
    </section>
  </div>;
}

export default function MisNotificacionesPage() {
  const [pref, setPref] = useState<NotificationPreference | null>(null);
  const [history, setHistory] = useState<PersonalHistory>(emptyHistory);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [modal, setModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const reload = useCallback(async () => {
    const [p, h] = await Promise.all([getPreference(), getHistory(page, pageSize)]);
    setPref(p); setHistory(h);
  }, [page, pageSize]);
  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([getPreference(), getHistory(page, pageSize)]).then(([p, h]) => {
      if (active) { setPref(p); setHistory(h); setError(''); }
    }).catch(cause => {
      if (active) setError(cause instanceof Error ? cause.message : 'No se pudieron consultar las notificaciones');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [page, pageSize]);

  return <div className="space-y-5">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div><div className="mb-2 flex items-center gap-2 text-muted"><BellRing size={19}/> Preferencias personales</div>
        <h1 className="text-2xl font-bold text-main">Mis notificaciones</h1>
        <p className="mt-1 text-sm text-muted">Avisos informativos del IGP recibidos por correo, según tus preferencias.</p></div>
      <button type="button" className={btnStyle} onClick={() => void reload().catch(() => setError('No se pudo actualizar'))}>
        Actualizar historial</button>
    </header>
    {error && <p role="alert" className="rounded-lg border border-rose-300 p-3 text-sm text-rose-600">{error}</p>}
    {notice && <p role="status" className="rounded-lg border border-emerald-300 p-3 text-sm text-emerald-700 dark:text-neutral-100">{notice}</p>}
    <section className="rounded-xl border border-border-ui bg-panel p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2"><h2 className="flex items-center gap-2 font-semibold text-main"><Mail size={18}/> Correo personal</h2>
          {pref && <><p className="break-all text-sm text-muted">{pref.email}</p>
            <div className="flex flex-wrap gap-2"><Label tone={pref.enabled ? 'success' : 'neutral'}>{pref.enabled ? 'Suscrito' : 'Desactivado'}</Label>
              <Label>IGP/CENSIS</Label><Label>Magnitud ≥ {pref.min_magnitude.toFixed(1)}</Label></div>
            <p className="text-xs text-muted">Activo desde: <DatePeru value={pref.activated_at}/></p></>}
        </div>
        <button type="button" disabled={!pref} onClick={() => setModal(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-40 dark:text-neutral-900"><Pencil size={16}/> Editar</button>
      </div>
      <p className="mt-4 flex items-start gap-2 rounded-lg bg-panel-alt p-3 text-xs text-muted"><ShieldCheck size={18} className="shrink-0"/>
        El historial indica si el servidor SMTP aceptó el envío, no garantiza que el destinatario lo haya leído. La frecuencia depende de GitHub Actions y de la configuración privada del canal de correo.</p>
    </section>
    <section className="overflow-hidden rounded-xl border border-border-ui bg-panel">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-ui p-4">
        <h2 className="font-semibold text-main">Historial de mis envíos <span className="text-sm font-normal text-muted">({history.total})</span></h2>
        <label className="flex items-center gap-2 text-sm text-muted">Por página
          <select aria-label="Registros por página" className={inputStyle} value={pageSize}
            onChange={event => { setPageSize(Number(event.target.value)); setPage(1); }}>
            {[10,20,50].map(n => <option value={n} key={n}>{n}</option>)}
          </select></label>
      </div>
      <div className="overflow-x-auto"><table className="w-full min-w-[660px] text-left text-sm">
        <thead className="bg-panel-alt text-muted"><tr><th className="px-4 py-3">Evento</th>
          <th className="px-4 py-3">Ocurrencia (Perú)</th><th className="px-4 py-3">Estado</th>
          <th className="px-4 py-3">Intentos</th><th className="px-4 py-3">Envío</th></tr></thead>
        <tbody>
          {history.items.map(item => <tr key={item.id} className="border-t border-border-ui">
            <td className="px-4 py-3"><span className="font-medium text-main">M {item.magnitude?.toFixed(1) ?? '—'}</span>
              <span className="ml-2 text-muted">{item.place ?? 'Sin ubicación'}</span></td>
            <td className="px-4 py-3 text-muted"><DatePeru value={item.occurred_at}/></td>
            <td className="px-4 py-3"><Label tone={item.status === 'sent' ? 'success' : item.status === 'failed' ? 'warning' : 'neutral'}>{statusLabels[item.status]}</Label></td>
            <td className="px-4 py-3 text-muted">{item.attempts} / 3</td>
            <td className="px-4 py-3 text-muted"><DatePeru value={item.sent_at}/></td>
          </tr>)}
          {!loading && history.items.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-muted">Todavía no hay envíos. Es normal antes de recibir un nuevo sismo que cumpla tu preferencia.</td></tr>}
          {loading && <tr><td colSpan={5} className="p-8 text-center text-muted">Cargando historial…</td></tr>}
        </tbody></table></div>
      <footer className="flex items-center justify-between gap-2 border-t border-border-ui p-4 text-sm text-muted">
        <span>Mostrando {history.total ? (history.page - 1) * history.page_size + 1 : 0}–{Math.min(history.total, history.page * history.page_size)} de {history.total}</span>
        <div className="flex items-center gap-2"><button type="button" className={btnStyle} aria-label="Página anterior" disabled={page <= 1 || loading} onClick={() => setPage(x => Math.max(1, x-1))}><ChevronLeft size={16}/></button>
          <span>{page} / {history.pages}</span>
          <button type="button" className={btnStyle} aria-label="Página siguiente" disabled={page >= history.pages || loading} onClick={() => setPage(x => x+1)}><ChevronRight size={16}/></button></div>
      </footer>
    </section>
    {modal && pref && <SettingsModal pref={pref} onClose={() => setModal(false)}
      onSaved={next => {setPref(next); setModal(false); setPage(1);
        setNotice('Preferencia guardada. Solo se evaluarán sismos recibidos desde la activación.');
        void reload().catch(() => setError('No se pudo actualizar el historial'));
      }}/>} 
  </div>;
}
