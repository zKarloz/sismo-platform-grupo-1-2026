/** Panel Gmail: prueba efímera, sin persistencia de contraseña en React/backend/BD. */
import {useEffect, useState} from 'react';
import type {FormEvent} from 'react';
import {ExternalLink, LockKeyhole, MailCheck, ShieldAlert} from 'lucide-react';
import {getSmtpStatus, sendGmailTechnicalTest} from '../../services/alerts';

export default function SmtpSettingsPanel({recipient}:{recipient:string}) {
  const [gmail,setGmail] = useState('');
  const [password,setPassword] = useState('');
  const [showForm,setShowForm] = useState(false);
  const [busy,setBusy] = useState(false);
  const [serverReady,setServerReady] = useState<boolean|null>(null);
  const [error,setError] = useState('');
  const [result,setResult] = useState('');

  useEffect(()=>{
    void getSmtpStatus().then(s=>setServerReady(s.configured)).catch(()=>setServerReady(null));
  },[]);
  const submit = async (event:FormEvent<HTMLFormElement>) => {
    event.preventDefault();setError('');setResult('');setBusy(true);
    try {
      const response = await sendGmailTechnicalTest(gmail.trim(),password);
      setResult(response.accepted_by_smtp ? 'Gmail aceptó el correo de PRUEBA. Comprueba tu bandeja y spam.' : 'La prueba no se completó.');
    } catch(e) {setError(e instanceof Error?e.message:'No se pudo enviar el correo de prueba.');}
    finally {setBusy(false);setPassword('');}
  };
  return <section className="rounded-xl border border-border-ui bg-panel p-5" aria-label="Configuración Gmail SMTP">
    <h2 className="flex items-center gap-2 text-lg font-semibold text-main"><MailCheck size={19} className="text-accent"/> Correo electrónico (Gmail SMTP)</h2>
    <p className="mt-2 text-sm text-muted">Envía una prueba de configuración antes de utilizar reglas por correo. El sistema no solicita tu contraseña habitual de Google.</p>
    <ol className="mt-4 list-inside list-decimal space-y-1.5 text-sm text-main">
      <li>Activa la <a className="inline-flex items-center gap-1 text-accent underline" target="_blank" rel="noreferrer" href="https://myaccount.google.com/security">verificación en dos pasos <ExternalLink size={13}/></a> de tu cuenta Gmail.</li>
      <li>Genera una <a className="inline-flex items-center gap-1 text-accent underline" target="_blank" rel="noreferrer" href="https://myaccount.google.com/apppasswords">contraseña de aplicación <ExternalLink size={13}/></a> de Google (16 caracteres).</li>
      <li>Utiliza la prueba opcional; su correo se enviará solo a tu cuenta autenticada.</li>
    </ol>
    <div className="mt-4 rounded-lg border border-border-ui bg-panel-alt p-3 text-sm text-main">
      <p className="font-semibold">Configuración operativa en Render</p>
      <p className="mt-1 text-xs text-muted">{serverReady===null?'Estado no disponible':serverReady?'Variables SMTP presentes en el servidor (entrega no verificada)':'Variables SMTP incompletas en Render o backend local'}. La prueba web no guarda claves: para el envío operativo, configura ALERT_SMTP_HOST, ALERT_SMTP_PORT, ALERT_SMTP_USER, ALERT_SMTP_FROM y ALERT_SMTP_PASSWORD como variables privadas del backend.</p>
      <p className="mt-1 text-xs text-muted">El envío operativo sigue siendo manual y requiere aprobación. No coloques ninguna de esas claves en Vercel ni en variables VITE_*.</p>
    </div>
    <button className="mt-4 rounded-lg border border-border-ui bg-panel-alt px-4 py-2 text-sm font-medium text-main hover:opacity-80" type="button" onClick={()=>{setShowForm(v=>!v);setPassword('');setError('');}} aria-expanded={showForm}>
      {showForm?'Ocultar prueba SMTP':'Probar mi Gmail desde la web (opcional)'}
    </button>
    {showForm && <form onSubmit={e=>void submit(e)} className="mt-4 space-y-3 rounded-lg border border-border-ui p-4">
      <p className="flex items-start gap-2 text-xs text-muted"><LockKeyhole size={16} className="shrink-0"/>La contraseña se envía directamente a FastAPI por HTTPS para una sola prueba y se descarta; no queda guardada en el navegador ni la base de datos. Usa esta opción únicamente en una red y dispositivo confiables.</p>
      <label className="block text-xs font-semibold text-main">Cuenta Gmail remitente
        <input type="email" required autoComplete="email" maxLength={254} className="mt-1 w-full rounded-lg border border-border-ui bg-panel px-3 py-2 text-sm text-main" value={gmail} onChange={e=>setGmail(e.target.value)} placeholder="remitente@gmail.com"/>
      </label>
      <label className="block text-xs font-semibold text-main">Contraseña de aplicación de Gmail (no la habitual)
        <input type="password" required minLength={16} maxLength={32} autoComplete="off" className="mt-1 w-full rounded-lg border border-border-ui bg-panel px-3 py-2 text-sm text-main" value={password} onChange={e=>setPassword(e.target.value)} placeholder="16 caracteres"/>
      </label>
      <p className="text-xs text-muted">Destinatario de esta prueba: <span className="font-semibold text-main">{recipient}</span>. Máximo tres intentos cada 15 minutos.</p>
      {error && <p className="text-sm text-rose-600 dark:text-rose-300" role="alert">{error}</p>}
      {result && <p className="text-sm text-main" role="status">{result}</p>}
      <button disabled={busy} type="submit" className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy?'Comprobando SMTP...':'Enviar correo de prueba'}</button>
    </form>}
    <p className="mt-3 flex items-start gap-2 text-xs text-muted"><ShieldAlert size={16} className="shrink-0"/>Esto no genera una alerta sísmica, no modifica reglas y no garantiza la entrega final a bandeja de entrada.</p>
  </section>;
}
