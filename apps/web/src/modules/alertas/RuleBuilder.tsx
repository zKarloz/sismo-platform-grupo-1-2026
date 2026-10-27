/** Constructor de reglas: solo Administrador. Guardado siempre desactivado. */
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import {useState} from 'react';
import type {FormEvent} from 'react';
import {Info, ShieldCheck} from 'lucide-react';
import {createAlertRule} from '../../services/alerts';
import type {CreateRulePayload} from '../../services/alerts';

const PERU_BBOX = {min_lat:-19.5,max_lat:0.5,min_lon:-84,max_lon:-68};
const TITLE = 'Sismo registrado: M {magnitude}';
const BODY = 'IGP/CENSIS reportó un sismo de magnitud {magnitude} en {place} el {occurred_at}. Profundidad: {depth_km} km. Fuente: {source_url}';
const inputClass = 'w-full rounded-lg border border-border-ui bg-panel px-3 py-2 text-sm text-main focus:outline-none focus:ring-2 focus:ring-accent/30';

export default function RuleBuilder({onCreated}:{onCreated:()=>void}) {
  const [name, setName] = useState('');
  const [magnitude, setMagnitude] = useState('3.5');
  const [channel, setChannel] = useState<'email' | 'in_app'>('in_app');
  const [destination, setDestination] = useState('');
  const [severity,setSeverity] = useState<'info' | 'review' | 'high'>('review');
  const [requiresApproval,setRequiresApproval] = useState(true);
  const [depth,setDepth] = useState('');
  const [cooldown,setCooldown] = useState('30');
  const [bbox,setBbox] = useState(PERU_BBOX);
  const [startHour,setStartHour] = useState('');
  const [endHour,setEndHour] = useState('');
  const [title,setTitle] = useState(TITLE);
  const [body,setBody] = useState(BODY);
  const [busy,setBusy] = useState(false);
  const [message,setMessage] = useState('');
  const [error,setError] = useState('');

  const submit = async (event:FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');setMessage('');
    const min_magnitude = Number(magnitude);
    const cooldownMin = Number(cooldown);
    if (name.trim().length < 3 || !Number.isFinite(min_magnitude) || min_magnitude < 0 || min_magnitude > 10) {
      setError('Indica un nombre de al menos 3 caracteres y magnitud entre 0 y 10.'); return;
    }
    if (!Number.isFinite(cooldownMin) || cooldownMin < 0 || cooldownMin > 1440) {
      setError('El cooldown debe estar entre 0 y 1440 minutos.'); return;
    }
    if (channel === 'email' && !/^[^@\s,;<>]+@[^@\s,;<>]+\.[^@\s,;<>]+$/.test(destination.trim())) {
      setError('Indica un solo correo destinatario válido.');return;
    }
    if ((startHour === '') !== (endHour === '')) {
      setError('Selecciona ambas horas o deja las dos vacías.');return;
    }
    const payload:CreateRulePayload = {
      name:name.trim(), min_magnitude, source:'IGP/CENSIS', channel,
      destination: channel === 'email' ? destination.trim() : null,
      severity, requires_approval: channel === 'email' || severity !== 'info' || requiresApproval,
      max_depth_km: depth.trim() === '' ? null : Number(depth),
      cooldown_seconds:cooldownMin * 60, zone_spec:bbox,
      start_hour_peru:startHour === '' ? null : Number(startHour),
      end_hour_peru:endHour === '' ? null : Number(endHour),
      template_title:title,template_body:body,
    };
    try {
      setBusy(true);
      const created = await createAlertRule(payload);
      setMessage(`Regla creada como DESACTIVADA (${created.rule_id}). Revísala y actívala cuando corresponda.`);
      setName('');setDestination('');onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar la regla.');
    } finally {setBusy(false);}
  };

  // La apertura/cierre pertenece al modal común; aquí solo vive el formulario.
  return <form onSubmit={e=>void submit(e)} className="min-w-0 space-y-4">
      <p className="text-sm text-muted">Personaliza la magnitud mínima y el canal. Solo un Administrador puede crear o activar reglas.</p>
      <div className="grid min-w-0 gap-4 sm:grid-cols-2">
        <label className="block text-xs font-semibold text-main">Nombre de la regla
          <input required minLength={3} maxLength={120} className={`${inputClass} mt-1`} placeholder="Ej. Avisos por correo M3.5" value={name} onChange={e=>setName(e.target.value)}/>
        </label>
        <label className="block text-xs font-semibold text-main">Magnitud mínima
          <input required type="number" step="0.1" min="0" max="10" className={`${inputClass} mt-1`} value={magnitude} onChange={e=>setMagnitude(e.target.value)}/>
        </label>
        <label className="block text-xs font-semibold text-main">Fuente verificable
          <select disabled className={`${inputClass} mt-1 opacity-75`} value="IGP/CENSIS"><option value="IGP/CENSIS">IGP/CENSIS (Perú)</option></select>
        </label>
        <label className="block text-xs font-semibold text-main">Canal
          <select className={`${inputClass} mt-1`} value={channel} onChange={e=>{setChannel(e.target.value as 'email'|'in_app');setRequiresApproval(true);}}>
            <option value="in_app">Centro interno</option><option value="email">Correo electrónico</option>
          </select>
        </label>
        <label className="block text-xs font-semibold text-main">Prioridad operativa
          <select className={`${inputClass} mt-1`} value={severity} onChange={e=>setSeverity(e.target.value as 'info'|'review'|'high')}>
            <option value="info">Informativa</option><option value="review">Revisión</option><option value="high">Alta (no equivale a peligro oficial)</option>
          </select>
        </label>
        <label className="block text-xs font-semibold text-main">Cooldown (minutos)
          <input required type="number" min="0" max="1440" step="1" className={`${inputClass} mt-1`} value={cooldown} onChange={e=>setCooldown(e.target.value)}/>
        </label>
      </div>
      {channel==='email' && <label className="block text-xs font-semibold text-main">Destinatario de los avisos
        <input required type="email" maxLength={254} autoComplete="email" className={`${inputClass} mt-1`} value={destination} onChange={e=>setDestination(e.target.value)} placeholder="persona@gmail.com"/>
        <span className="mt-1 block font-normal text-muted">El destinatario debe consentir estos avisos. Solo recibirán correo los mensajes revisados y aprobados.</span>
      </label>}
      <label className="inline-flex items-start gap-2 text-sm text-main">
        <input type="checkbox" className="mt-1" checked={channel==='email'||severity!=='info'||requiresApproval}
          disabled={channel==='email'||severity!=='info'} onChange={e=>setRequiresApproval(e.target.checked)}/>
        Exigir aprobación humana {channel==='email' && '(obligatoria en correo)'}
      </label>
      <details className="rounded-lg border border-border-ui bg-panel-alt p-4">
        <summary className="cursor-pointer text-sm font-semibold text-main">Configuración avanzada: profundidad, zona y plantilla</summary>
        <div className="mt-4 space-y-4">
          <label className="block text-xs font-semibold text-main">Profundidad máxima opcional (km)
            <input type="number" min="0" max="1000" step="0.1" className={`${inputClass} mt-1`} value={depth} onChange={e=>setDepth(e.target.value)} placeholder="Cualquier profundidad"/>
          </label>
          <p className="text-xs text-muted"><Info size={13} className="mr-1 inline"/>La zona se define mediante un rectángulo geográfico; NO equivale a la frontera oficial del Perú.</p>
          <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
            {(['min_lat','max_lat','min_lon','max_lon'] as const).map(key=><label key={key} className="text-xs font-semibold text-main">{key.replace('_',' ').toUpperCase()}
              <input type="number" step="0.01" min={key.endsWith('lat')?'-90':'-180'} max={key.endsWith('lat')?'90':'180'} className={`${inputClass} mt-1`} value={bbox[key]} onChange={e=>setBbox(v=>({...v,[key]:Number(e.target.value)}))}/>
            </label>)}
          </div>
          <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="text-xs font-semibold text-main">Hora inicio (Perú)
              <select value={startHour} onChange={e=>setStartHour(e.target.value)} className={`${inputClass} mt-1`}><option value="">Todo el día</option>{Array.from({length:24},(_,i)=><option key={i} value={i}>{String(i).padStart(2,'0')}:00</option>)}</select>
            </label>
            <label className="text-xs font-semibold text-main">Hora fin exclusiva (Perú)
              <select value={endHour} onChange={e=>setEndHour(e.target.value)} className={`${inputClass} mt-1`}><option value="">Todo el día</option>{Array.from({length:24},(_,i)=><option key={i} value={i+1}>{String(i+1).padStart(2,'0')}:00</option>)}</select>
            </label>
          </div>
          <label className="block text-xs font-semibold text-main">Título del aviso
            <input className={`${inputClass} mt-1`} maxLength={1000} required value={title} onChange={e=>setTitle(e.target.value)}/>
          </label>
          <label className="block text-xs font-semibold text-main">Plantilla del mensaje
            <textarea className={`${inputClass} mt-1`} rows={3} required maxLength={1000} value={body} onChange={e=>setBody(e.target.value)}/>
          </label>
          <p className="text-xs text-muted">Marcadores permitidos: {'{magnitude}'}, {'{place}'}, {'{occurred_at}'}, {'{depth_km}'}, {'{source_name}'}, {'{source_url}'}.</p>
        </div>
      </details>
      {error && <p role="alert" className="rounded-lg border border-rose-400 p-3 text-sm text-rose-600 dark:text-rose-300">{error}</p>}
      {message && <p role="status" className="rounded-lg border border-border-ui bg-panel-alt p-3 text-sm text-main">{message}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <button disabled={busy} type="submit" className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? <LoadingSpinner size="sm" variant="inline" label="Guardando…" /> : <><ShieldCheck size={16}/>Crear regla desactivada</>}</button>
        <span className="text-xs text-muted">No activa reglas ni genera avisos históricos.</span>
      </div>
  </form>;
}
