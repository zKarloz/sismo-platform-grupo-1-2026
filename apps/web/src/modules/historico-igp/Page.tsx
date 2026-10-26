/** Explorador IGP histórico: nunca insertar estos resultados en alertas operativas. */
import {useEffect,useState,type FormEvent} from 'react';
import {Archive,ArrowUpRight,CalendarRange,ChevronLeft,ChevronRight,Download,Filter,Info,RefreshCcw} from 'lucide-react';
import {useAuth} from '../../auth/AuthProvider';
import {readHistory,exportHistory,type HistoryFilters,type HistoryPage} from '../../services/igpHistory';

const control='w-full rounded-lg border border-border-ui bg-page px-3 py-2 text-sm text-main outline-none focus-visible:ring-2 focus-visible:ring-accent';
const initial:HistoryFilters={year_from:2020,year_to:2025};

export default function Page(){
  const {profile}=useAuth();
  const [draft,setDraft]=useState<HistoryFilters>(initial);
  const [filters,setFilters]=useState<HistoryFilters>(initial);
  const [page,setPage]=useState(1);
  const [revision,setRevision]=useState(0);
  const [result,setResult]=useState<HistoryPage|null>(null);
  const [error,setError]=useState('');const [pending,setPending]=useState(true);
  const [exporting,setExporting]=useState('');
  const [boundsOpen,setBoundsOpen]=useState(false);
  const canExport=profile?.role!=='solo_lectura';
  const update=<K extends keyof HistoryFilters>(key:K,value:HistoryFilters[K])=>setDraft(old=>({...old,[key]:value}));
  useEffect(()=>{
    const controller=new AbortController();
    setPending(true);setError('');
    readHistory(filters,page,controller.signal).then(data=>setResult(data)).catch((cause:unknown)=>{
      if(!controller.signal.aborted)setError(cause instanceof Error?cause.message:'No se pudo consultar el IGP');
    }).finally(()=>{if(!controller.signal.aborted)setPending(false)});
    return()=>controller.abort();
  },[filters,page,revision]);
  function apply(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(draft.year_from>draft.year_to){setError('El año inicial no puede superar al final');return;}
    const bounds=[draft.south,draft.west,draft.north,draft.east];
    if(bounds.some(v=>v!==undefined)&&bounds.some(v=>v===undefined)){
      setError('Completa los cuatro límites de la zona o déjalos vacíos');return;
    }
    setPage(1);setFilters({...draft});
  }
  async function download(format:'csv'|'xlsx'|'pdf'){
    setError('');setExporting(format);
    try{await exportHistory(filters,format)}
    catch(cause){setError(cause instanceof Error?cause.message:'Error al descargar');}
    finally{setExporting('')}
  }
  return <main className="space-y-5">
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div><p className="text-xs font-bold uppercase tracking-[.18em] text-accent">Fuente oficial · Catálogo instrumental</p>
        <h1 className="mt-2 flex items-center gap-2 text-3xl font-bold text-main"><Archive size={28}/> Histórico IGP 1960–2025</h1>
        <p className="mt-2 max-w-3xl text-sm text-muted">Consulta el catálogo público bajo demanda. No se almacena en Supabase, no alimenta modelos ya entrenados ni genera alertas retrospectivas.</p>
      </div>
      <button type="button" onClick={()=>setRevision(x=>x+1)} className="inline-flex items-center gap-2 rounded-lg border border-border-ui px-3 py-2 text-sm text-main hover:bg-panel-alt"><RefreshCcw size={16}/> Actualizar vista</button>
    </header>
    <form onSubmit={apply} className="rounded-xl border border-border-ui bg-panel p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-main"><CalendarRange size={17}/> Filtros del catálogo</div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="space-y-1 text-xs font-medium text-muted">Año inicial
          <input className={control} type="number" min="1960" max="2025" required value={draft.year_from} onChange={e=>update('year_from',Number(e.target.value))}/></label>
        <label className="space-y-1 text-xs font-medium text-muted">Año final
          <input className={control} type="number" min="1960" max="2025" required value={draft.year_to} onChange={e=>update('year_to',Number(e.target.value))}/></label>
        <label className="space-y-1 text-xs font-medium text-muted">Magnitud mínima (opcional)
          <input className={control} type="number" step="0.1" min="0" max="10" placeholder="Todas" value={draft.min_magnitude??''}
            onChange={e=>update('min_magnitude',e.target.value===''?undefined:Number(e.target.value))}/></label>
        <label className="space-y-1 text-xs font-medium text-muted">Profundidad máxima (km)
          <input className={control} type="number" step="1" min="0" max="900" placeholder="Todas" value={draft.max_depth??''}
            onChange={e=>update('max_depth',e.target.value===''?undefined:Number(e.target.value))}/></label>
      </div>
      <details open={boundsOpen} onToggle={e=>setBoundsOpen(e.currentTarget.open)} className="mt-3 text-sm text-main">
        <summary className="cursor-pointer font-medium">Zona geográfica (rectángulo opcional)</summary>
        <p className="mt-2 text-xs text-muted">Coordenadas WGS84. Un rectángulo alrededor de Perú incluye áreas marítimas y países vecinos.</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-4">
          {(['south','west','north','east'] as const).map(k=><label key={k} className="space-y-1 text-xs text-muted">
            {({south:'Latitud sur',west:'Longitud oeste',north:'Latitud norte',east:'Longitud este'} as const)[k]}
            <input className={control} type="number" step="any" placeholder="Sin límite" value={draft[k]??''}
              onChange={e=>update(k,e.target.value===''?undefined:Number(e.target.value))}/>
          </label>)}
        </div>
        <button type="button" onClick={()=>setDraft(old=>({...old,south:undefined,west:undefined,north:undefined,east:undefined}))}
          className="mt-2 text-xs text-accent hover:underline">Limpiar zona</button>
      </details>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <span className="text-xs text-muted">El año es UTC. Modificar filtros no altera reportes anteriores.</span>
        <button className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white dark:text-neutral-950"><Filter size={16}/> Consultar</button>
      </div>
    </form>
    {error&&<p role="alert" className="rounded-lg border border-rose-300 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">{error}</p>}
    <section className="overflow-hidden rounded-xl border border-border-ui bg-panel">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-border-ui px-4 py-4">
        <div><h2 className="font-semibold text-main">Resultados del catálogo</h2>
          <p className="mt-1 text-xs text-muted">{result?.total??'—'} coincidencias · {pending?'Consultando…':`Página ${page} de ${result?.pages??1}`}</p></div>
        {canExport&&<div className="flex flex-wrap gap-2">
          {(['csv','xlsx','pdf'] as const).map(format=><button key={format} type="button" disabled={!!exporting||pending||!result?.total}
            onClick={()=>void download(format)} className="inline-flex items-center gap-2 rounded-lg border border-border-ui px-3 py-2 text-xs font-semibold uppercase text-main hover:bg-panel-alt disabled:opacity-40">
            <Download size={15}/>{exporting===format?'Generando…':format}</button>)}
        </div>}
      </div>
      {pending?<p className="p-8 text-center text-sm text-muted">Consultando recurso histórico oficial… La primera lectura puede demorar.</p>
        :result?.items.length?<div className="overflow-x-auto"><table className="w-full min-w-[1070px] text-left text-sm">
          <thead className="bg-panel-alt text-xs uppercase text-muted"><tr>
            {['Fecha UTC','Magnitud','Prof. km','Latitud','Longitud','Fuente','ID catálogo','Origen oficial'].map(h=><th className="px-3 py-3" key={h}>{h}</th>)}
          </tr></thead>
          <tbody className="divide-y divide-border-ui">{result.items.map(row=><tr key={row.id} className="hover:bg-panel-alt">
            <td className="whitespace-nowrap px-3 py-3 text-main">{row.fecha_utc.replace('+00:00','Z')}</td>
            <td className="px-3 py-3 font-semibold text-main">{row.magnitud.toFixed(1)}</td>
            <td className="px-3 py-3 text-muted">{row.profundidad_km.toFixed(1)}</td>
            <td className="px-3 py-3 text-muted">{row.latitud.toFixed(3)}</td>
            <td className="px-3 py-3 text-muted">{row.longitud.toFixed(3)}</td>
            <td className="px-3 py-3"><span className="rounded-md border border-border-ui bg-panel-alt px-2 py-1 text-xs">IGP histórico</span></td>
            <td className="px-3 py-3 font-mono text-xs text-muted">{row.id_origen}</td>
            <td className="px-3 py-3"><a href={row.url_origen} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-accent hover:underline">Catálogo oficial <ArrowUpRight size={14}/></a></td>
          </tr>)}</tbody>
        </table></div>:<p className="p-8 text-center text-sm text-muted">Sin registros para estos filtros; prueba otro año o magnitud.</p>}
      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border-ui px-4 py-3 text-sm text-muted">
        <span>Mostrando {result?.items.length??0} de {result?.total??0}</span>
        <div className="flex gap-2">
          <button aria-label="Página anterior" disabled={pending||page<=1} onClick={()=>setPage(x=>Math.max(1,x-1))} className="rounded-lg border border-border-ui p-2 disabled:opacity-40"><ChevronLeft size={16}/></button>
          <span className="px-2 py-2">{page} / {result?.pages??1}</span>
          <button aria-label="Página siguiente" disabled={pending||page>=(result?.pages??1)} onClick={()=>setPage(x=>x+1)} className="rounded-lg border border-border-ui p-2 disabled:opacity-40"><ChevronRight size={16}/></button>
        </div>
      </footer>
    </section>
    {result?.source&&<aside className="rounded-xl border border-border-ui bg-panel p-4 text-xs text-muted">
      <p className="mb-2 flex items-center gap-2 font-semibold text-main"><Info size={16}/> Procedencia y versión</p>
      <p>IGP/CENSIS · Publicación: {result.source.published_at??'No declarada para la exportación XLSX'} · {['official_csv_snapshot','censis_xlsx_snapshot'].includes(result.source.source_mode??'')?'Lectura del snapshot local':'Consulta al proveedor'}: {new Date(result.source.retrieved_at).toLocaleString('es-PE',{timeZone:'America/Lima'})}</p>
      <p className="mt-1">Registros del archivo: {result.source.source_rows} · Registros no válidos: {result.source.invalid_rows} · <span className={result.source.stale?'font-semibold text-amber-700':'text-muted'}>{result.source.stale?'Caché de respaldo':['official_csv_snapshot','censis_xlsx_snapshot'].includes(result.source.source_mode??'')?'Snapshot oficial local':'Caché temporal vigente'}</span></p>
      <p className="mt-1">{result.source.storage}. {result.source.warning}</p>
      <p className="mt-1 break-all font-mono">SHA-256 de versión normalizada: {result.source.snapshot_sha256}</p>
      {result.source.original_csv_sha256&&<p className="mt-1 break-all font-mono">SHA-256 del CSV oficial: {result.source.original_csv_sha256}</p>}
      {result.source.original_xlsx_sha256&&<p className="mt-1 break-all font-mono">SHA-256 del XLSX CENSIS: {result.source.original_xlsx_sha256}</p>}
      <p className="mt-2">Sin códigos individuales de ficha CENSIS en el XLSX; el ID indica la fila de la versión XLSX (o el ordinal del CSV, según fuente), no un identificador oficial del evento. Mayor cobertura instrumental en épocas recientes no indica necesariamente aumento de actividad sísmica.</p>
    </aside>}
  </main>;
}
