/** Historial legible: responsables, rol actual, acciones humanas y trazabilidad opcional. */
import { Fragment, useEffect, useState } from 'react';
import { Activity, BellRing, CheckCircle2, ChevronDown, Download, History, LockKeyhole, LogIn, RefreshCw, Search, Settings2, ShieldCheck, SlidersHorizontal, UsersRound, XCircle } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { apiAuthed } from '../../auth/api';
import { downloadAudit, getSystemSettings, saveSystemSetting } from '../../services/reports';
import type { SystemSettings } from '../../services/reports';
import { displayRole } from '../../lib/roleLabels';
import Modal from '../../components/ui/Modal';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import TablePagination from '../../components/ui/TablePagination';

type Details = Record<string, unknown> | null;
type Entry = {
  id: string;
  actor_id: string | null;
  actor_name: string | null;
  actor_role: string | null;
  subject_name: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  result: string;
  correlation_id: string | null;
  occurred_at: string;
  before_json: Details;
  after_json: Details;
};

type Category = 'accesos' | 'usuarios' | 'reglas' | 'alertas' | 'sistema';
const operations: Record<string, { title: string; category: Category; icon: LucideIcon }> = {
  'identity.session.started': { title: 'Inicio de sesión', category: 'accesos', icon: LogIn },
  'identity.user.invited': { title: 'Invitación de usuario creada', category: 'usuarios', icon: UsersRound },
  'identity.user.demo_created': { title: 'Cuenta de demostración creada', category: 'usuarios', icon: UsersRound },
  'identity.user.updated': { title: 'Permisos de usuario modificados', category: 'usuarios', icon: UsersRound },
  'alert.rule.created': { title: 'Regla de alertas creada', category: 'reglas', icon: Settings2 },
  'alert.smtp.test.requested': { title: 'Prueba de Gmail solicitada', category: 'sistema', icon: Activity },
  'alert.smtp.test.accepted': { title: 'Prueba de Gmail aceptada por SMTP', category: 'sistema', icon: CheckCircle2 },
  'alert.rule.activated': { title: 'Regla de alertas activada', category: 'reglas', icon: ShieldCheck },
  'alert.rule.disabled': { title: 'Regla de alertas desactivada', category: 'reglas', icon: Settings2 },
  'alert.generated': { title: 'Aviso informativo generado', category: 'alertas', icon: BellRing },
  'alert.approved': { title: 'Aviso aprobado', category: 'alertas', icon: CheckCircle2 },
  'alert.cancelled': { title: 'Aviso cancelado', category: 'alertas', icon: XCircle },
  'alert.delivery.sent': { title: 'Aviso publicado', category: 'alertas', icon: BellRing },
  'alert.delivery.failed': { title: 'Falló la publicación de un aviso', category: 'alertas', icon: XCircle },
  'alert.delivery.acknowledged': { title: 'Recepción de aviso confirmada', category: 'alertas', icon: CheckCircle2 },
  'notification.preference.updated': { title: 'Preferencias de correo actualizadas', category: 'usuarios', icon: Settings2 },
  'notification.delivery.sent': { title: 'Correo personal aceptado por SMTP', category: 'alertas', icon: CheckCircle2 },
  'report.export.generated': { title: 'Reporte descargado', category: 'sistema', icon: CheckCircle2 },
  'report.legacy_csv.generated': { title: 'Eventos CSV exportados', category: 'sistema', icon: CheckCircle2 },
  'audit.export.generated': { title: 'Historial de auditoría exportado', category: 'sistema', icon: ShieldCheck },
  'system.setting.changed': { title: 'Configuración operativa actualizada', category: 'sistema', icon: Settings2 },
  'report.history.pruned': { title: 'Retención de reportes aplicada', category: 'sistema', icon: History },
  'notification.delivery.failed': { title: 'Falló un correo personal', category: 'alertas', icon: XCircle },
};

const statusNames: Record<string, string> = {
  active: 'Activo', inactive: 'Inactivo', suspended: 'Suspendido',
  pending: 'Pendiente', approved: 'Aprobado', sent: 'Publicado',
  failed: 'Fallido', cancelled: 'Cancelado',
  in_app: 'Centro interno', email: 'Correo electrónico',
  success: 'Correcto', partial: 'Parcial',
  review: 'Revisión', high: 'Alta', informational: 'Informativa',
};

/** Describe campos habituales sin exponer objetos JSON en la vista normal. */
function prettyValue(key: string, value: unknown): string {
  if (value === null || value === undefined) return 'Sin dato';
  if (typeof value === 'boolean') return value ? 'Sí' : 'No';
  if (key === 'role' && typeof value === 'string') return displayRole(value);
  if (typeof value === 'string') return statusNames[value] ?? value;
  if (typeof value === 'number') return String(value);
  return 'Valor estructurado';
}
const fieldNames: Record<string, string> = {
  role: 'Rol', status: 'Estado', enabled: 'Activada',
  source: 'Fuente', channel: 'Canal', attempts: 'Intentos', min_magnitude: 'Magnitud mínima',
  severity: 'Prioridad', requires_approval: 'Requiere aprobación',
};

function describe(entry: Entry): string {
  const before = entry.before_json ?? {};
  const after = entry.after_json ?? {};
  if (entry.action === 'identity.session.started') return 'Acceso autenticado mediante Supabase Auth.';
  if (entry.action === 'identity.user.invited') return 'Se creó una invitación y se vinculó la nueva cuenta al rol asignado.';
  if (entry.action === 'identity.user.demo_created') return 'Se registró una cuenta ficticia de demostración autorizada.';
  if (entry.action === 'identity.user.updated') {
    const changes = Object.keys(after).filter((key) => key in fieldNames && before[key] !== after[key])
      .map((key) => `${fieldNames[key]}: ${prettyValue(key, before[key])} → ${prettyValue(key, after[key])}`);
    return changes.length ? changes.join(' · ') : 'Se actualizaron los permisos de una cuenta.';
  }
  if (entry.action === 'report.export.generated') return 'Un usuario autorizado generó un informe con fecha de corte y huella digital.';
  if (entry.action === 'system.setting.changed') return 'Se actualizó un parámetro operativo no secreto.';
  if (entry.action === 'audit.export.generated') return 'Se exportó una copia controlada del historial de auditoría.';
  if (entry.action === 'report.history.pruned') return 'Se purgaron metadatos vencidos de exportaciones; se conserva esta bitácora.';
  if (entry.action === 'alert.smtp.test.requested') return 'Un Administrador solicitó una prueba técnica de Gmail. No se guardan credenciales.';
  if (entry.action === 'alert.smtp.test.accepted') return 'Gmail aceptó el mensaje de prueba; no es una alerta sísmica.';
  if (entry.action === 'alert.rule.created') {
    const source = typeof after.source === 'string' ? after.source : null;
    const channel = after.channel ? prettyValue('channel', after.channel) : null;
    return [source && `Fuente ${source}`, channel && `Canal ${channel}`].filter(Boolean).join(' · ') || 'Nueva regla configurada, inicialmente desactivada.';
  }
  if (entry.action === 'alert.rule.activated') return 'La regla quedó habilitada para evaluar eventos nuevos.';
  if (entry.action === 'alert.rule.disabled') return 'Se suspendió la evaluación de la regla.';
  if (entry.action === 'alert.generated') return 'Un evento registrado cumplió las condiciones de una regla.';
  if (entry.action === 'alert.approved') return 'Se autorizó la publicación del aviso.';
  if (entry.action === 'alert.cancelled') return 'El aviso fue cancelado y no se publicará.';
  if (entry.action === 'alert.delivery.sent') return 'La publicación del aviso quedó registrada.';
  if (entry.action === 'alert.delivery.failed') return 'Hubo un problema en un intento de publicación.';
  if (entry.action === 'alert.delivery.acknowledged') return 'Un operador registró un acuse del aviso.';
  if (entry.action === 'notification.preference.updated') return 'La persona actualizó su suscripción de avisos por correo y el umbral elegido.';
  if (entry.action === 'notification.delivery.sent') return 'El proveedor SMTP aceptó un correo personal sobre un sismo IGP ya publicado.';
  if (entry.action === 'notification.delivery.failed') return 'Falló un intento de envío personal; se aplicarán reintentos limitados.';
  return 'Operación registrada en la bitácora del sistema.';
}

function formatDate(date: string): string {
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return 'Fecha no disponible';
  return `${parsed.toLocaleString('es-PE', {
    timeZone: 'America/Lima', day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  })} · hora de Perú`;
}

/** Normaliza el resultado sin confundir "parcial" con un fallo confirmado. */
function resultDisplay(result: string): {label:string; className:string; icon:LucideIcon} {
  if (result === 'success') return {label:'Correcto',className:'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300',icon:CheckCircle2};
  if (['failed','failure','error'].includes(result)) return {label:'Fallido',className:'border-rose-500/30 bg-rose-500/10 text-rose-700 dark:bg-rose-400/15 dark:text-rose-300',icon:XCircle};
  return {label: statusNames[result] ?? 'Registrado',className:'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300',icon:Activity};
}

type AuditResponse = {items:Entry[];total:number;page:number;pages:number;page_size:number;summary:{correctos:number;fallidos:number}};
type FilterCategory = Category | 'todos';
type FilterResult = 'todos' | 'success' | 'failed' | 'partial';
const control = 'rounded-lg border border-border-ui bg-page px-3 py-2 text-sm text-main outline-none focus-visible:ring-2 focus-visible:ring-accent';

export default function Page() {
  const [tab,setTab] = useState<'historial'|'configuracion'>('historial');
  const [items,setItems] = useState<Entry[]>([]);
  const [total,setTotal] = useState(0);
  const [pages,setPages] = useState(1);
  const [summary,setSummary] = useState({correctos:0,fallidos:0});
  const [error,setError] = useState('');
  const [loading,setLoading] = useState(true);
  const [search,setSearch] = useState('');
  const [query,setQuery] = useState('');
  const [category,setCategory] = useState<FilterCategory>('todos');
  const [result,setResult] = useState<FilterResult>('todos');
  // Los filtros se editan en borrador dentro del modal, sin consultar hasta Aplicar.
  const [filtersOpen,setFiltersOpen] = useState(false);
  const [draftCategory,setDraftCategory] = useState<FilterCategory>('todos');
  const [draftResult,setDraftResult] = useState<FilterResult>('todos');
  const [draftStartDate,setDraftStartDate] = useState('');
  const [draftEndDate,setDraftEndDate] = useState('');
  const [startDate,setStartDate] = useState('');
  const [endDate,setEndDate] = useState('');
  const [page,setPage] = useState(1);
  const [pageSize,setPageSize] = useState<5|10|20>(10);
  const [openId,setOpenId] = useState<string|null>(null);
  const [tick,setTick] = useState(0);
  const [exporting,setExporting] = useState(false);
  const [settings,setSettings] = useState<SystemSettings|null>(null);
  const [settingsError,setSettingsError] = useState('');
  const [settingsSaving,setSettingsSaving] = useState(false);
  const [retentionDraft,setRetentionDraft] = useState(365);
  const [settingsTick,setSettingsTick] = useState(0);

  // Retrasar búsquedas durante la escritura para evitar consultas innecesarias.
  useEffect(()=>{const id=window.setTimeout(()=>setQuery(search.trim()),300);return ()=>window.clearTimeout(id);},[search]);
  const dateInvalid = Boolean(startDate && endDate && startDate > endDate);
  useEffect(()=>{
    if(dateInvalid || tab!=='historial') return;
    let alive=true;
    setLoading(true);
    const params = new URLSearchParams({page:String(page),page_size:String(pageSize)});
    if(query) params.set('q',query);
    if(category!=='todos') params.set('category',category);
    if(result!=='todos') params.set('result',result);
    if(startDate) params.set('start_date',startDate);
    if(endDate) params.set('end_date',endDate);
    void apiAuthed<AuditResponse>(`/api/v1/admin/audit?${params.toString()}`)
      .then(data=>{if(alive){setItems(data.items);setTotal(data.total);setPages(data.pages);setSummary(data.summary);setError('');}})
      .catch((cause:unknown)=>{if(alive){setItems([]);setError(cause instanceof Error?cause.message:'No se pudo consultar auditoría');}})
      .finally(()=>{if(alive)setLoading(false);});
    return ()=>{alive=false;};
  },[page,pageSize,query,category,result,startDate,endDate,tick,tab,dateInvalid]);

  useEffect(()=>{
    if(tab!=='configuracion') return;
    let alive=true;
    void getSystemSettings().then(data=>{if(alive){setSettings(data);setRetentionDraft(data.values.audit_retention_days ?? 365);setSettingsError('');}})
      .catch((cause:unknown)=>{if(alive)setSettingsError(cause instanceof Error?cause.message:'Configuración no disponible');});
    return ()=>{alive=false;};
  },[tab,settingsTick]);

  function resetToFirst(){setPage(1);setOpenId(null);}
  const activeFilterCount = Number(category!=='todos') + Number(result!=='todos') + Number(Boolean(startDate)) + Number(Boolean(endDate));
  const draftDateInvalid = Boolean(draftStartDate && draftEndDate && draftStartDate>draftEndDate);

  function openFilters(){
    // Cada apertura parte de los filtros aplicados, descartando cambios cancelados.
    setDraftCategory(category);
    setDraftResult(result);
    setDraftStartDate(startDate);
    setDraftEndDate(endDate);
    setFiltersOpen(true);
  }
  function applyFilters(){
    // Evitar enviar a FastAPI un rango inválido (HTTP 422).
    if(draftDateInvalid) return;
    setCategory(draftCategory);
    setResult(draftResult);
    setStartDate(draftStartDate);
    setEndDate(draftEndDate);
    resetToFirst();
    setFiltersOpen(false);
  }
  function clearDraftFilters(){
    // Limpiar solo el formulario; los cambios no se ejecutan hasta Aplicar.
    setDraftCategory('todos');
    setDraftResult('todos');
    setDraftStartDate('');
    setDraftEndDate('');
  }

  async function exportEntries(){
    setExporting(true);setError('');
    try {
      // Mismos filtros SQL que la tabla, sin duplicar el endpoint existente.
      await downloadAudit({q:query,category,result,start_date:startDate,end_date:endDate});
      setTick(x=>x+1);
    } catch(cause) {setError(cause instanceof Error?cause.message:'No se pudo exportar');}
    finally {setExporting(false);}
  }
  async function saveRetention(){
    setSettingsSaving(true);setSettingsError('');
    try {
      await saveSystemSetting('audit_retention_days',retentionDraft);
      setSettingsTick(x=>x+1);
      setTick(x=>x+1);
    } catch(cause) {setSettingsError(cause instanceof Error?cause.message:'No se pudo actualizar la retención');}
    finally {setSettingsSaving(false);}
  }

  return <section className="space-y-5">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="flex items-center gap-2 text-3xl font-bold text-main"><History size={27} aria-hidden="true"/>Auditoría</h1>
        <p className="mt-2 text-sm text-muted">Consulta las actividades, responsables y cambios registrados en el sistema.</p>
      </div>
      <button type="button" onClick={()=>setTick(x=>x+1)} disabled={loading}
        className="inline-flex items-center gap-2 rounded-lg border border-border-ui bg-panel px-3 py-2 text-sm text-main hover:bg-panel-alt disabled:opacity-50">
        <RefreshCw size={16} aria-hidden="true"/>Actualizar
      </button>
    </header>

    <div className="grid grid-cols-3 gap-2 sm:gap-3" aria-label="Resumen de auditoría filtrado">
      <div className="rounded-xl border border-border-ui bg-panel p-3 sm:p-4"><p className="flex items-center gap-1 text-xs text-muted"><History size={14}/>Registros</p><p className="mt-2 text-2xl font-bold tabular-nums text-main">{loading?'—':total}</p></div>
      <div className="rounded-xl border border-border-ui bg-panel p-3 sm:p-4"><p className="flex items-center gap-1 text-xs text-muted"><CheckCircle2 size={14} className="text-emerald-600 dark:text-emerald-300"/>Correctos</p><p className="mt-2 text-2xl font-bold tabular-nums text-emerald-700 dark:text-emerald-300">{loading?'—':summary.correctos}</p></div>
      <div className="rounded-xl border border-border-ui bg-panel p-3 sm:p-4"><p className="flex items-center gap-1 text-xs text-muted"><XCircle size={14} className="text-rose-600 dark:text-rose-300"/>Fallidos</p><p className="mt-2 text-2xl font-bold tabular-nums text-rose-700 dark:text-rose-300">{loading?'—':summary.fallidos}</p></div>
    </div>

    <div className="flex gap-1 border-b border-border-ui" role="tablist" aria-label="Auditoría">
      {(['historial','configuracion'] as const).map(value=><button key={value} type="button" role="tab" aria-selected={tab===value}
        onClick={()=>setTab(value)} className={`px-4 py-2.5 text-sm font-semibold transition-colors ${tab===value?'border-b-2 border-accent text-main':'text-muted hover:text-main'}`}>
        {value==='historial'?'Historial':'Configuración'}</button>)}
    </div>

    {tab==='historial' ? <div role="tabpanel" className="overflow-hidden rounded-xl border border-border-ui bg-panel">
      <div className="space-y-3 p-4">
        {/* Barra unificada: la búsqueda y la exportación conservan los filtros aplicados. */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">Buscar por usuario, acción o entidad</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={16}/>
            <input className={`${control} w-full pl-10`} placeholder="Buscar usuario, acción o entidad…" value={search}
              onChange={event=>{setSearch(event.target.value);resetToFirst();}} maxLength={100}/>
          </label>
          <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
            <button type="button" onClick={openFilters} aria-haspopup="dialog"
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-border-ui bg-panel px-3 py-2 text-sm font-medium text-main hover:bg-panel-alt focus-visible:outline-2 focus-visible:outline-accent">
              <SlidersHorizontal size={16} aria-hidden="true"/>Filtros
              {activeFilterCount>0&&<span className="rounded-full border border-border-ui bg-panel-alt px-1.5 text-xs tabular-nums" aria-label={`${activeFilterCount} filtros activos`}>{activeFilterCount}</span>}
            </button>
            <button type="button" disabled={exporting||loading||dateInvalid||search.trim()!==query}
              onClick={()=>void exportEntries()}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-border-ui bg-panel px-3 py-2 text-sm font-medium text-main hover:bg-panel-alt disabled:opacity-40">
              {exporting ? <LoadingSpinner variant="inline" size="sm" label="Exportando…" /> : <><Download size={16} aria-hidden="true"/>Exportar auditoría</>}
            </button>
          </div>
        </div>
        <p className="text-xs text-muted" role="status">{loading?'Consultando registros…':`${total} registros coinciden con los filtros`}</p>
        {dateInvalid&&<p role="alert" className="text-sm text-rose-700 dark:text-rose-300">La fecha inicial no puede ser posterior a la fecha final.</p>}
        {error&&<p role="alert" className="rounded-lg border border-rose-400 p-3 text-sm text-rose-700 dark:text-rose-300">{error}</p>}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-panel-alt text-muted"><tr>
            <th scope="col" className="px-4 py-3 font-semibold">Actividad</th>
            <th scope="col" className="px-4 py-3 font-semibold">Responsable</th>
            <th scope="col" className="px-4 py-3 font-semibold">Fecha (Perú)</th>
            <th scope="col" className="px-4 py-3 font-semibold">Resultado</th>
            <th scope="col" className="px-4 py-3 font-semibold"><span className="sr-only">Detalle</span></th>
          </tr></thead>
          <tbody>
            {!loading && !dateInvalid && !error && items.map(item=>{
              const operation=operations[item.action]??{title:'Actividad del sistema',category:'sistema',icon:Activity};
              const Icon=operation.icon;
              const status=resultDisplay(item.result);
              const StateIcon=status.icon;
              const expanded=openId===item.id;
              return <Fragment key={item.id}>
                <tr className="border-t border-border-ui text-main">
                  <td className="px-4 py-3"><span className="flex items-center gap-2 font-medium"><Icon size={16} className="shrink-0 text-accent"/>{operation.title}</span>
                    <p className="mt-1 text-xs text-muted">{describe(item)}</p></td>
                  <td className="px-4 py-3"><p className="font-medium">{item.actor_id?(item.actor_name??'Usuario no disponible'):'Sistema automatizado'}</p>
                    <p className="mt-1 text-xs text-muted">{item.actor_id?displayRole(item.actor_role??undefined):'Proceso automático'}</p></td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-muted"><time dateTime={item.occurred_at}>{formatDate(item.occurred_at)}</time></td>
                  <td className="px-4 py-3"><span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs font-semibold ${status.className}`}><StateIcon size={13}/>{status.label}</span></td>
                  <td className="px-4 py-3"><button type="button" aria-expanded={expanded}
                    aria-label={`${expanded?'Ocultar':'Mostrar'} detalles de ${operation.title}`}
                    onClick={()=>setOpenId(expanded?null:item.id)} className="rounded-lg p-2 hover:bg-panel-alt focus-visible:outline-2 focus-visible:outline-accent">
                    {/* Mantener el mismo SVG permite animar tanto la apertura como el cierre.
                         Cerrado: abajo (0°); abierto: arriba (180°). */}
                    <ChevronDown size={17} aria-hidden="true"
                       className={`transition-transform duration-200 ease-in-out motion-reduce:transition-none ${expanded?'rotate-180':'rotate-0'}`}/>
                   </button></td>
                </tr>
                {expanded&&<tr className="border-t border-border-ui bg-panel-alt/60"><td colSpan={5} className="px-4 py-4">
                  <div className="grid gap-3 text-xs text-main md:grid-cols-2">
                    <div className="space-y-1"><p><strong>Acción:</strong> {item.action}</p><p><strong>Entidad:</strong> {item.entity_type}</p>
                      <p className="break-all"><strong>ID de entidad:</strong> {item.entity_id??'No aplica'}</p>
                      <p className="break-all"><strong>ID de registro:</strong> {item.id}</p></div>
                    <div className="space-y-1"><p><strong>Fecha UTC:</strong> {new Date(item.occurred_at).toISOString()}</p>
                      <p className="break-all"><strong>Correlación:</strong> {item.correlation_id??'No proporcionada'}</p>
                      {item.subject_name&&<p><strong>Cuenta afectada:</strong> {item.subject_name}</p>}
                      <p><strong>Resultado original:</strong> {item.result}</p></div>
                  </div>
                  {(item.before_json||item.after_json)&&<div className="mt-3 grid gap-3 md:grid-cols-2">
                    {(['before_json','after_json'] as const).map(key=><div key={key} className="min-w-0 rounded-lg border border-border-ui bg-panel p-3">
                      <p className="mb-2 text-xs font-semibold text-main">{key==='before_json'?'Antes':'Después'}</p>
                      <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words text-xs text-muted">{JSON.stringify(item[key]??{},null,2)}</pre>
                    </div>)}
                  </div>}
                </td></tr>}
              </Fragment>;
            })}
            {!loading && !dateInvalid && !error && items.length===0&&<tr><td colSpan={5} className="px-4 py-12 text-center text-sm text-muted">No hay registros para los filtros seleccionados.</td></tr>}
            {loading&&<tr><td colSpan={5} className="px-4 py-4"><LoadingSpinner label="Cargando registros…" /></td></tr>}
          </tbody>
        </table>
      </div>
      <TablePagination page={page} pages={pages} pageSize={pageSize}
        disabled={loading||dateInvalid}
        onPageChange={nextPage => { setPage(nextPage); setOpenId(null); }}
        onPageSizeChange={size => { setPageSize(size); resetToFirst(); }}/>
      <p className="border-t border-border-ui px-4 py-3 text-xs text-soft">El rol mostrado es el actual, no necesariamente el vigente cuando ocurrió la acción. Las fechas visibles están en hora de Perú; el detalle conserva UTC. CSV limitado a 5.000 registros por descarga.</p>
    </div> : <div role="tabpanel" className="space-y-4 rounded-xl border border-border-ui bg-panel p-5">
      {settingsError&&<p role="alert" className="text-sm text-rose-700 dark:text-rose-300">{settingsError}</p>}
      {!settings ? (!settingsError ? <LoadingSpinner label="Consultando parámetros operativos…" /> : null) : <>
        <div className="flex flex-wrap items-end justify-between gap-3 rounded-lg border border-border-ui bg-panel-alt p-4">
          <div><label htmlFor="audit-retention" className="block text-sm font-semibold text-main">Conservación mínima (días)</label>
            <p className="mt-1 text-xs text-muted">Política entre 365 y 3650 días; no activa borrado automático.</p></div>
          <div className="flex items-center gap-2">
            <input id="audit-retention" type="number" min={365} max={3650} step={1} value={retentionDraft}
              onChange={event=>setRetentionDraft(Number(event.target.value))} disabled={!settings.editable||settingsSaving}
              className={`${control} w-28`} />
            {settings.editable&&<button type="button" disabled={settingsSaving||retentionDraft===(settings.values.audit_retention_days??365)||!Number.isInteger(retentionDraft)||retentionDraft<365||retentionDraft>3650}
              onClick={()=>void saveRetention()} className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white dark:text-slate-950 disabled:opacity-40">{settingsSaving ? <LoadingSpinner variant="inline" size="sm" label="Guardando…" /> : 'Guardar'}</button>}
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-border-ui p-4"><p className="flex items-center gap-2 text-sm font-semibold text-main"><ShieldCheck size={17} className="text-emerald-600 dark:text-emerald-300"/>Historial protegido</p><p className="mt-2 text-xs text-muted">La migración SQL define protección ante cambios y eliminaciones. Verifica su aplicación en PostgreSQL.</p></div>
          <div className="rounded-lg border border-border-ui p-4"><p className="flex items-center gap-2 text-sm font-semibold text-main"><LockKeyhole size={17}/>Direcciones IP</p><p className="mt-2 text-xs text-muted">No se recopilan en la política actual. No se almacena información de autenticación secreta.</p></div>
        </div>
        <p className="text-xs text-muted">{settings.note} Los cambios de parámetros quedan registrados en la bitácora. {settings.editable?'Tu cuenta puede administrar la retención.':'Tu rol permite consultar, pero no modificar, la configuración.'}</p>
      </>}
    </div>}

    {/* En teléfonos se muestra como panel inferior; los demás módulos mantienen su modal habitual. */}
    <Modal open={filtersOpen} title="Filtros" mobileSheet onClose={()=>setFiltersOpen(false)}
      description="Selecciona los criterios y pulsa Aplicar filtros para actualizar el historial."
      footer={<div className="grid w-full min-w-0 grid-cols-2 gap-2 sm:flex sm:items-center sm:justify-end">
        {/* En móvil: Limpiar ocupa una fila y las acciones van debajo sin desbordarse. */}
        <button type="button" onClick={clearDraftFilters}
          className="col-span-2 rounded-lg border border-border-ui px-3 py-2 text-sm text-main hover:bg-panel-alt sm:mr-auto">Limpiar</button>
        <button type="button" onClick={()=>setFiltersOpen(false)}
          className="min-w-0 rounded-lg border border-border-ui px-3 py-2 text-sm text-main hover:bg-panel-alt">Cancelar</button>
        <button type="button" onClick={applyFilters} disabled={draftDateInvalid}
          className="min-w-0 rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-white dark:text-slate-950 disabled:cursor-not-allowed disabled:opacity-40 sm:px-4">Aplicar filtros</button>
      </div>}>
      <div className="min-w-0 max-w-full space-y-4">
        <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="min-w-0 space-y-1.5 text-sm font-medium text-main" htmlFor="audit-filter-category">
            <span className="block">Categoría</span>
            <select id="audit-filter-category" className={`${control} block w-full min-w-0 max-w-full`} value={draftCategory}
              onChange={event=>setDraftCategory(event.target.value as FilterCategory)}>
              <option value="todos">Todas las categorías</option><option value="accesos">Accesos</option>
              <option value="usuarios">Usuarios</option><option value="reglas">Reglas</option>
              <option value="alertas">Alertas</option><option value="sistema">Sistema y reportes</option>
            </select>
          </label>
          <label className="min-w-0 space-y-1.5 text-sm font-medium text-main" htmlFor="audit-filter-result">
            <span className="block">Resultado</span>
            <select id="audit-filter-result" className={`${control} block w-full min-w-0 max-w-full`} value={draftResult}
              onChange={event=>setDraftResult(event.target.value as FilterResult)}>
              <option value="todos">Todos los resultados</option><option value="success">Correctos</option>
              <option value="failed">Fallidos</option><option value="partial">Parciales</option>
            </select>
          </label>
        </div>
        <fieldset className="min-w-0 max-w-full rounded-lg border border-border-ui p-3 sm:p-4">
          <legend className="px-1 text-sm font-semibold text-main">Rango de fechas (Perú)</legend>
          <p className="mb-3 text-xs text-muted">Deja las fechas vacías para consultar todos los días.</p>
          <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="min-w-0 space-y-1.5 text-sm text-main" htmlFor="audit-filter-start">
              <span className="block">Desde</span>
              <input id="audit-filter-start" type="date" className={`${control} block w-full min-w-0 max-w-full`} value={draftStartDate}
                onChange={event=>setDraftStartDate(event.target.value)}/>
            </label>
            <label className="min-w-0 space-y-1.5 text-sm text-main" htmlFor="audit-filter-end">
              <span className="block">Hasta</span>
              <input id="audit-filter-end" type="date" className={`${control} block w-full min-w-0 max-w-full`} value={draftEndDate}
                onChange={event=>setDraftEndDate(event.target.value)}/>
            </label>
          </div>
          {draftDateInvalid&&<p role="alert" className="mt-3 text-sm text-rose-700 dark:text-rose-300">La fecha inicial no puede ser posterior a la fecha final.</p>}
        </fieldset>
      </div>
    </Modal>
  </section>;
}
