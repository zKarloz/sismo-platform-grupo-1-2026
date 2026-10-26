/** Fase 8: reportes privados con modal, filtros, tags y tabla paginada. */
import { useCallback, useEffect, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { BarChart3, CalendarClock, ChevronLeft, ChevronRight, Download, FileSpreadsheet,
  FileText, FileType2, Filter, LockKeyhole, Plus, RefreshCw, Settings2, ShieldCheck, X } from 'lucide-react';
import { useAuth } from '../../auth/AuthProvider';
import { downloadAudit, downloadReport, getReportHistory, getReportOptions,
  getSystemSettings, saveSystemSetting } from '../../services/reports';
import type { ReportFormat, ReportHistory, ReportOptions, ReportPayload, ReportRecord, ReportType, SystemSettings } from '../../services/reports';

const panel='rounded-xl border border-border-ui bg-panel';
const control='w-full rounded-lg border border-border-ui bg-page px-3 py-2.5 text-sm text-main outline-none focus:ring-2 focus:ring-accent';
const formats:Record<ReportFormat,{label:string;icon:typeof FileText}>={
  csv:{label:'CSV',icon:FileText},xlsx:{label:'Excel',icon:FileSpreadsheet},pdf:{label:'PDF',icon:FileType2},
};
const prettyDate=(value:string)=>new Date(value).toLocaleString('es-PE',{
  timeZone:'America/Lima',dateStyle:'medium',timeStyle:'short'});
const defaultReport:ReportPayload={kind:'events',format:'pdf',name:'',source:''};

/** Diálogo ligero: información concentrada en modales, no en filas expandidas. */
function Dialog({title,onClose,children}:{title:string;onClose:()=>void;children:ReactNode}) {
  useEffect(()=>{const press=(event:KeyboardEvent)=>{if(event.key==='Escape')onClose();};
    window.addEventListener('keydown',press);return()=>window.removeEventListener('keydown',press);},[onClose]);
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4" role="presentation"
    onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}>
    <section className={`${panel} max-h-[90vh] w-full max-w-2xl overflow-y-auto p-5 shadow-2xl`} role="dialog" aria-modal="true" aria-label={title}>
      <header className="mb-5 flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-main">{title}</h2>
        <button type="button" onClick={onClose} aria-label="Cerrar ventana" className="rounded-lg p-2 text-muted hover:bg-panel-alt"><X size={18}/></button>
      </header>{children}
    </section>
  </div>;
}

function BuildReport({options,onClose,onCreated}:{options:ReportOptions;onClose:()=>void;onCreated:()=>void}) {
  const [form,setForm]=useState<ReportPayload>({...defaultReport,kind:options.types[0].id});
  const [error,setError]=useState('');const [success,setSuccess]=useState('');const [pending,setPending]=useState(false);
  const update=<K extends keyof ReportPayload>(key:K,value:ReportPayload[K])=>setForm(old=>({...old,[key]:value}));
  const supportedGeo=form.kind==='events'||form.kind==='alerts';
  async function send(event:FormEvent) {
    event.preventDefault();setPending(true);setError('');setSuccess('');
    try {
      const payload:ReportPayload={kind:form.kind,format:form.format,name:form.name?.trim(),
        ...(form.kind!=='sources'&&form.start_at?{start_at:new Date(form.start_at).toISOString()}:{}),
        ...(form.kind!=='sources'&&form.end_at?{end_at:new Date(form.end_at).toISOString()}:{}),
        ...(['events','alerts','sources'].includes(form.kind)&&form.source?{source:form.source}:{}),
        ...(supportedGeo&&form.min_magnitude!==undefined?{min_magnitude:form.min_magnitude}:{}),
        ...(supportedGeo&&form.south!==undefined&&form.north!==undefined&&form.west!==undefined&&form.east!==undefined?
          {south:form.south,north:form.north,west:form.west,east:form.east}:{})};
      await downloadReport(payload);onCreated();
      setSuccess('Descarga iniciada. Puedes cambiar solo el formato y descargar nuevamente con los mismos filtros.');
    } catch(cause) {setError(cause instanceof Error?cause.message:'No se pudo generar el reporte');}
    finally {setPending(false);}
  }
  return <form onSubmit={e=>void send(e)} className="space-y-4">
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="space-y-1 text-xs font-semibold text-muted">Tipo de reporte
        <select className={control} value={form.kind} onChange={e=>{const kind=e.target.value as ReportType;
          setForm(old=>({...old,kind,source:'',min_magnitude:undefined,south:undefined,north:undefined,west:undefined,east:undefined}));}}>
          {options.types.map(k=><option value={k.id} key={k.id}>{k.name}</option>)}
        </select>
      </label>
      <label className="space-y-1 text-xs font-semibold text-muted">Formato
        <select className={control} value={form.format} onChange={e=>update('format',e.target.value as ReportFormat)}>
          {Object.entries(formats).map(([key,entry])=><option key={key} value={key}>{entry.label}</option>)}
        </select>
      </label>
    </div>
    <label className="block space-y-1 text-xs font-semibold text-muted">Nombre del informe
      <input className={control} maxLength={100} value={form.name ?? ''} placeholder="Por ejemplo: Sismos del mes"
        onChange={e=>update('name',e.target.value)}/>
    </label>
    {form.kind!=='sources'&&<div className="grid gap-4 sm:grid-cols-2">
      <label className="space-y-1 text-xs font-semibold text-muted">Desde (hora local)
        <input type="datetime-local" className={control} value={form.start_at ?? ''} onChange={e=>update('start_at',e.target.value)}/>
      </label>
      <label className="space-y-1 text-xs font-semibold text-muted">Hasta (hora local)
        <input type="datetime-local" className={control} value={form.end_at ?? ''} onChange={e=>update('end_at',e.target.value)}/>
      </label>
    </div>}
    {['events','alerts','sources'].includes(form.kind)&&<label className="block space-y-1 text-xs font-semibold text-muted">Fuente de datos
      <select className={control} value={form.source ?? ''} onChange={e=>update('source',e.target.value)}>
        <option value="">Todas las fuentes (sin combinar IDs)</option>
        <option value="IGP/CENSIS">IGP/CENSIS</option><option value="USGS">USGS</option>
      </select>
    </label>}
    {supportedGeo&&<div className="space-y-3 rounded-lg border border-border-ui bg-panel-alt p-3">
      <label className="block space-y-1 text-xs font-semibold text-muted">Magnitud mínima (opcional)
        <input className={control} type="number" min="-3" max="12" step="0.1" placeholder="Sin umbral"
          value={form.min_magnitude ?? ''} onChange={e=>update('min_magnitude',e.target.value?Number(e.target.value):undefined)}/>
      </label>
      <details className="text-sm text-main"><summary className="cursor-pointer font-semibold">Zona rectangular (opcional)</summary>
        <p className="mt-2 text-xs text-muted">Introduce los cuatro límites para filtrar por coordenadas. No sustituye un polígono geográfico.</p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {(['south','west','north','east'] as const).map(key=><label key={key} className="text-xs text-muted">{({south:'Sur',west:'Oeste',north:'Norte',east:'Este'} as const)[key]}
            <input type="number" className={control} step="any" value={form[key] ?? ''}
              onChange={e=>update(key,e.target.value?Number(e.target.value):undefined)}/></label>)}
        </div>
      </details>
    </div>}
    <p className="text-xs text-muted">Los datos de IGP y USGS mantienen su procedencia. Los informes ML son retrospectivos, no predicciones.</p>
    {error&&<p role="alert" className="rounded-lg border border-rose-400 px-3 py-2 text-sm text-rose-600">{error}</p>}
    {success&&<p role="status" className="rounded-lg border border-emerald-400 px-3 py-2 text-sm text-emerald-700">{success}</p>}
    <div className="flex justify-end gap-2 border-t border-border-ui pt-4">
      <button type="button" onClick={onClose} className="rounded-lg border border-border-ui px-4 py-2 text-sm text-main">Cancelar</button>
      <button disabled={pending} className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
        <Download size={16}/>{pending?'Generando…':'Generar y descargar'}</button>
    </div>
  </form>;
}

function SettingsDialog({onClose,editable}:{onClose:()=>void;editable:boolean}) {
  const [settings,setSettings]=useState<SystemSettings|null>(null);
  const [error,setError]=useState('');const [busy,setBusy]=useState('');
  const load=useCallback(()=>{void getSystemSettings().then(setSettings).catch(err=>setError(String(err)));},[]);
  useEffect(()=>load(),[load]);
  const labels:Record<string,string>={max_report_rows:'Filas máximas por informe',
    report_history_days:'Retención del historial de reportes (días)',
    audit_retention_days:'Política documental de auditoría (días)'};
  async function save(key:string,value:number) {setBusy(key);setError('');
    try {await saveSystemSetting(key,value);load();}
    catch(e) {setError(e instanceof Error?e.message:'No se pudo actualizar');}
    finally {setBusy('');}}
  return <Dialog title="Configuración y retención" onClose={onClose}>
    {!settings?<p className="text-muted">Cargando configuración…</p>:<div className="space-y-4">
      {Object.entries(settings.values).map(([key,current])=><SettingRow key={key} title={labels[key] ?? key}
        value={current} editable={editable} saving={busy===key} onSave={value=>void save(key,value)}/>)}
      <p className="rounded-lg bg-panel-alt p-3 text-xs text-muted">{settings.note} La retención del historial requiere purga privada controlada. Los PDF/CSV/XLSX no se almacenan en el servidor.</p>
    </div>}
    {error&&<p role="alert" className="mt-3 text-sm text-rose-600">{error}</p>}
  </Dialog>;
}
function SettingRow({title,value,editable,saving,onSave}:{title:string;value:number;editable:boolean;saving:boolean;onSave:(value:number)=>void}){
  const [draft,setDraft]=useState(value);
  useEffect(()=>setDraft(value),[value]);
  return <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border-ui p-3">
    <span className="text-sm font-medium text-main">{title}</span>
    <div className="flex items-center gap-2">
      <input type="number" className={`${control} w-28`} value={draft} disabled={!editable||saving}
        onChange={e=>setDraft(Number(e.target.value))} aria-label={title}/>
      {editable&&<button type="button" disabled={saving||draft===value} onClick={()=>onSave(draft)}
        className="rounded-lg border border-border-ui px-3 py-2 text-sm text-main disabled:opacity-40">Guardar</button>}
    </div>
  </div>;
}

export default function Page() {
  const {profile}=useAuth();
  const [options,setOptions]=useState<ReportOptions|null>(null);
  const [history,setHistory]=useState<ReportHistory|null>(null);
  const [page,setPage]=useState(1);const [tick,setTick]=useState(0);
  const [modal,setModal]=useState<'new'|'settings'|null>(null);
  const [selectedReport,setSelectedReport]=useState<ReportRecord|null>(null);
  const [error,setError]=useState('');const [busy,setBusy]=useState(false);
  const isAdmin=profile?.role==='administrador';
  const canAudit=isAdmin||profile?.role==='auditor';
  useEffect(()=>{let active=true;
    void getReportOptions().then(data=>{if(active){setOptions(data);setError('');}})
      .catch(e=>{if(active)setError(e instanceof Error?e.message:'Error al consultar permisos');});
    return()=>{active=false};},[]);
  useEffect(()=>{let active=true;
    void getReportHistory(page).then(data=>{if(active){setHistory(data);setError('');}})
      .catch(e=>{if(active)setError(e instanceof Error?e.message:'Error en historial');});
    return()=>{active=false};},[page,tick]);
  const refresh=()=>{setTick(i=>i+1);};
  const exportAudit=async()=>{setBusy(true);setError('');
    try{await downloadAudit();refresh();}
    catch(e){setError(e instanceof Error?e.message:'No se pudo exportar auditoría');}
    finally{setBusy(false);}};
  return <main className="space-y-5">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div><p className="text-xs font-bold uppercase tracking-widest text-accent">Administración · Fase 8</p>
        <h1 className="mt-2 flex items-center gap-2 text-3xl font-bold text-main"><BarChart3 size={27}/> Reportes</h1>
        <p className="mt-2 text-sm text-muted">Exportaciones auditadas, filtros reproducibles y fecha de corte UTC.</p></div>
      <div className="flex flex-wrap gap-2">
        <button className="inline-flex items-center gap-2 rounded-lg border border-border-ui bg-panel px-3 py-2 text-sm text-main" onClick={refresh}><RefreshCw size={16}/>Actualizar</button>
        {canAudit&&<button className="inline-flex items-center gap-2 rounded-lg border border-border-ui bg-panel px-3 py-2 text-sm text-main" onClick={()=>setModal('settings')}><Settings2 size={16}/>Configuración</button>}
        {canAudit&&<button disabled={busy} className="inline-flex items-center gap-2 rounded-lg border border-border-ui bg-panel px-3 py-2 text-sm text-main" onClick={()=>void exportAudit()}><ShieldCheck size={16}/>Exportar auditoría</button>}
        {options&&options.types.length>0&&<button className="inline-flex items-center gap-2 rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-white" onClick={()=>setModal('new')}><Plus size={16}/>Nuevo reporte</button>}
      </div>
    </header>
    <div className={`${panel} flex flex-wrap items-center gap-3 p-4 text-sm text-muted`}>
      <LockKeyhole size={18}/><span>Las descargas usan tu sesión y permisos. Los archivos no se guardan en enlaces públicos ni pueden volver a descargarse desde el historial.</span>
    </div>
    {error&&<p role="alert" className="rounded-lg border border-rose-400 p-3 text-sm text-rose-600">{error}</p>}
    <section className="grid gap-3 sm:grid-cols-3">
      <div className={`${panel} p-4`}><div className="flex items-center gap-2 text-xs text-muted"><FileText size={15}/>Reportes registrados</div>
        <p className="mt-2 text-2xl font-bold text-main">{history?.total ?? '—'}</p></div>
      <div className={`${panel} p-4`}><div className="flex items-center gap-2 text-xs text-muted"><Filter size={15}/>Tipos habilitados</div>
        <p className="mt-2 text-2xl font-bold text-main">{options?.types.length ?? '—'}</p></div>
      <div className={`${panel} p-4`}><div className="flex items-center gap-2 text-xs text-muted"><CalendarClock size={15}/>Fecha de corte</div>
        <p className="mt-2 text-sm font-semibold text-main">Cada generación · UTC</p></div>
    </section>
    <section className={`${panel} overflow-hidden`}>
      <div className="border-b border-border-ui p-4"><h2 className="font-semibold text-main">Historial de exportaciones</h2>
        <p className="mt-1 text-xs text-muted">SHA-256, solicitante, filtros y fecha de corte guardados para verificación posterior.</p></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[820px] text-left text-sm">
        <thead className="bg-panel-alt text-muted"><tr>{['Informe','Solicitante','Formato','Filas','Fecha de corte','Estado'].map(text=><th key={text} className="px-4 py-3 font-semibold">{text}</th>)}</tr></thead>
        <tbody>{history?.items.map(record=><tr key={record.id} className="border-t border-border-ui text-main">
          <td className="px-4 py-3"><div className="font-medium">{record.report_name}</div><div className="mt-1 text-xs text-muted" title={record.content_sha256}>SHA-256: {record.content_sha256?.slice(0,14)}…</div><button type="button" onClick={()=>setSelectedReport(record)} className="mt-2 text-xs font-semibold text-accent underline underline-offset-2">Ver filtros aplicados</button></td>
          <td className="px-4 py-3">{record.solicitante}</td>
          <td className="px-4 py-3"><span className="rounded-md border border-border-ui bg-panel-alt px-2 py-1 text-xs font-semibold">{record.file_format.toUpperCase()}</span></td>
          <td className="px-4 py-3 tabular-nums">{record.row_count}</td>
          <td className="px-4 py-3 text-xs">{prettyDate(record.cutoff_at)}</td>
          <td className="px-4 py-3"><span className="rounded-md border border-emerald-300 px-2 py-1 text-xs text-emerald-600">Generado</span></td>
        </tr>)}
          {!history?.items.length&&<tr><td className="px-4 py-10 text-center text-muted" colSpan={6}>Sin reportes generados todavía.</td></tr>}
        </tbody></table></div>
      <footer className="flex items-center justify-between border-t border-border-ui p-4 text-sm text-muted">
        <span>Página {page} de {history?.pages??1} · {history?.total??0} registros</span>
        <div className="flex gap-2"><button disabled={page<=1} onClick={()=>setPage(v=>v-1)} aria-label="Página anterior" className="rounded-lg border border-border-ui p-2 disabled:opacity-30"><ChevronLeft size={17}/></button>
          <button disabled={!history||page>=history.pages} onClick={()=>setPage(v=>v+1)} aria-label="Página siguiente" className="rounded-lg border border-border-ui p-2 disabled:opacity-30"><ChevronRight size={17}/></button></div>
      </footer>
    </section>
    {options&&modal==='new'&&<Dialog title="Generar reporte" onClose={()=>setModal(null)}><BuildReport options={options}
      onClose={()=>setModal(null)} onCreated={()=>{setPage(1);refresh();}}/></Dialog>}
    {modal==='settings'&&canAudit&&<SettingsDialog editable={isAdmin} onClose={()=>setModal(null)}/>}
    {selectedReport&&<Dialog title="Filtros del reporte generado" onClose={()=>setSelectedReport(null)}>
      <div className="space-y-3 text-sm text-main">
        <p className="font-semibold">{selectedReport.report_name}</p>
        <p className="text-muted">Este historial muestra los parámetros reales enviados al backend, no solo el título escrito al generar el archivo.</p>
        <dl className="grid grid-cols-[minmax(100px,1fr)_2fr] gap-x-4 gap-y-3 rounded-lg border border-border-ui p-3">
          <dt className="text-muted">Tipo</dt><dd>{selectedReport.report_type}</dd>
          <dt className="text-muted">Formato</dt><dd>{selectedReport.file_format.toUpperCase()}</dd>
          <dt className="text-muted">Registros</dt><dd>{selectedReport.row_count}</dd>
          <dt className="text-muted">Fuente</dt><dd>{String(selectedReport.filters.source || 'Todas las fuentes')}</dd>
          <dt className="text-muted">Desde (Perú)</dt><dd>{selectedReport.filters.start_at ? prettyDate(String(selectedReport.filters.start_at)) : 'Sin límite'}</dd>
          <dt className="text-muted">Hasta (Perú)</dt><dd>{selectedReport.filters.end_at ? prettyDate(String(selectedReport.filters.end_at)) : 'Sin límite'}</dd>
          <dt className="text-muted">Magnitud mínima</dt><dd>{String(selectedReport.filters.min_magnitude ?? 'Sin umbral')}</dd>
          <dt className="text-muted">Zona</dt><dd>{(['south','west','north','east'] as const).every(k=>selectedReport.filters[k]!==undefined)
            ? `Sur ${selectedReport.filters.south}, Oeste ${selectedReport.filters.west}, Norte ${selectedReport.filters.north}, Este ${selectedReport.filters.east}` : 'Sin filtro geográfico'}</dd>
          <dt className="text-muted">Corte (Perú)</dt><dd>{prettyDate(selectedReport.cutoff_at)}</dd>
        </dl>
        <p className="text-xs text-muted">El catálogo USGS puede incluir eventos de países vecinos en su cobertura rectangular. IGP y USGS no se mezclan como un conteo nacional único.</p>
      </div>
    </Dialog>}
  </main>;
}
