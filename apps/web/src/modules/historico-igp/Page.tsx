/** Catálogo instrumental IGP 1960–2025: consulta bajo demanda, sin mezclar con Supabase.
 * Año completo es una acción rápida externa; los demás filtros usan Modal común.
 */
import {useEffect, useState, type FormEvent} from 'react';
import {Archive, ArrowUpRight, CalendarRange, Download, Filter, Info, RefreshCcw} from 'lucide-react';
import {useAuth} from '../../auth/AuthProvider';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import Modal from '../../components/ui/Modal';
import TablePagination, {type TablePageSize} from '../../components/ui/TablePagination';
import {readHistory, exportHistory, type HistoryFilters, type HistoryPage} from '../../services/igpHistory';

const control='w-full min-w-0 rounded-lg border border-border-ui bg-page px-3 py-2 text-sm text-main outline-none focus-visible:ring-2 focus-visible:ring-accent';
const field='space-y-1 text-xs font-medium text-muted';
const MIN_DATE='1960-01-01';
const MAX_DATE='2025-12-31';
const MIN_YEAR=1960;
const MAX_YEAR=2025;
type Draft={start:string;end:string;min_magnitude?:number;max_depth?:number;south?:number;west?:number;north?:number;east?:number};
const blank:Draft={start:'',end:''};
function toFilters(draft:Draft):HistoryFilters{
  // Ambos extremos son fechas UTC completas; el último día incluye microsegundos.
  return {start_at:`${draft.start}T00:00:00Z`,end_at:`${draft.end}T23:59:59.999999Z`,
    year_from:Number(draft.start.slice(0,4)),year_to:Number(draft.end.slice(0,4)),
    min_magnitude:draft.min_magnitude,max_depth:draft.max_depth,
    south:draft.south,west:draft.west,north:draft.north,east:draft.east};
}

export default function HistoricoIGP() {
  const {profile}=useAuth();
  const canExport=profile?.role!=='solo_lectura';
  const [draft,setDraft]=useState<Draft>(blank);
  const [selectedYear,setSelectedYear]=useState('2025');
  const [filterOpen,setFilterOpen]=useState(false);
  const [formError,setFormError]=useState('');
  const [applied,setApplied]=useState<HistoryFilters|null>(null);
  const [page,setPage]=useState(1);
  const [pageSize,setPageSize]=useState<TablePageSize>(10);
  const [revision,setRevision]=useState(0);
  const [result,setResult]=useState<HistoryPage|null>(null);
  const [error,setError]=useState('');
  const [pending,setPending]=useState(false);
  const [exporting,setExporting]=useState('');

  // No consultar el catálogo completo al abrir la pestaña por primera vez.
  useEffect(()=>{
    if(!applied){setPending(false);return;}
    const controller=new AbortController();
    setPending(true);setError('');
    readHistory(applied,page,pageSize,controller.signal)
      .then(data=>{if(!controller.signal.aborted)setResult(data);})
      .catch((cause:unknown)=>{if(!controller.signal.aborted){setResult(null);setError(cause instanceof Error?cause.message:'No se pudo consultar el catálogo IGP');}})
      .finally(()=>{if(!controller.signal.aborted)setPending(false);});
    return ()=>controller.abort();
  },[applied,page,pageSize,revision]);

  function update<K extends keyof Draft>(key:K,value:Draft[K]) {
    // Editar el borrador no altera los resultados de la última consulta confirmada.
    setDraft(prev=>({...prev,[key]:value}));setFormError('');
  }
  function runYear() {
    const year=Number(selectedYear);
    if(!/^\d{4}$/.test(selectedYear)||!Number.isInteger(year)||year<MIN_YEAR||year>MAX_YEAR){
      setError('Selecciona un año válido entre 1960 y 2025.');return;
    }
    // Año completo significa consultar el año entero, sin arrastrar filtros antiguos.
    const dates:Draft={start:`${year}-01-01`,end:`${year}-12-31`};
    setDraft(dates);setApplied(toFilters(dates));setPage(1);setResult(null);setError('');setFormError('');
  }
  function consult(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if(!draft.start||!draft.end){setFormError('Selecciona ambas fechas (UTC).');return;}
    if(draft.start<MIN_DATE||draft.end>MAX_DATE||draft.start>draft.end){
      setFormError('El período debe estar entre 1960 y 2025 y las fechas deben estar ordenadas.');return;
    }
    const area=[draft.south,draft.west,draft.north,draft.east];
    if(area.some(v=>v!==undefined)&&area.some(v=>v===undefined)){
      setFormError('Completa los cuatro límites geográficos o déjalos vacíos.');return;
    }
    if(draft.south!==undefined&&draft.north!==undefined&&draft.west!==undefined&&draft.east!==undefined&&
       (draft.south>draft.north||draft.west>draft.east)){
      setFormError('Los límites geográficos están invertidos.');return;
    }
    setPage(1);setResult(null);setError('');setApplied(toFilters(draft));setFilterOpen(false);
  }
  function clearDraft() {
    // Limpiar los filtros también retira la selección activa sin consulta involuntaria.
    setDraft(blank);setApplied(null);setResult(null);setError('');setFormError('');setPage(1);setFilterOpen(false);
  }
  async function download(format:'csv'|'xlsx'|'pdf'){
    if(!applied||!result?.total)return;
    setError('');setExporting(format);
    try{await exportHistory(applied,format);}
    catch(cause){setError(cause instanceof Error?cause.message:'No se pudo descargar el archivo');}
    finally{setExporting('');}
  }
  const period=applied?`${applied.start_at?.slice(0,10)} — ${applied.end_at?.slice(0,10)} (días completos UTC)`:'';
  const filtersActive=applied&&[applied.min_magnitude,applied.max_depth,applied.south].some(v=>v!==undefined);
  return <div className="space-y-5">
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold text-main"><Archive size={20}/> Catálogo histórico IGP 1960–2025</h2>
        <p className="mt-1 max-w-3xl text-xs text-muted">Snapshot instrumental oficial de CENSIS. No forma parte de la ingesta operativa, las alertas ni los modelos entrenados.</p>
      </div>
      <button type="button" onClick={()=>setFilterOpen(true)} className="inline-flex items-center gap-2 rounded-lg border border-border-ui bg-panel px-3 py-2 text-sm text-main hover:bg-panel-alt">
        <Filter size={16}/> Filtros{filtersActive?' · Activos':''}
      </button>
    </header>
    <section className="rounded-xl border border-border-ui bg-panel p-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="w-full max-w-[240px] space-y-1 text-xs font-medium text-muted">Año completo (1960–2025)
          <input type="number" min={MIN_YEAR} max={MAX_YEAR} step={1} aria-label="Seleccionar año completo"
            className={control} value={selectedYear} onChange={e=>setSelectedYear(e.target.value)}/></label>
        <button type="button" onClick={runYear} disabled={pending} className="rounded-lg border border-border-ui bg-panel-alt px-4 py-2 text-sm font-semibold text-main hover:bg-page disabled:opacity-50">
          <CalendarRange size={16} className="mr-2 inline"/> Consultar año
        </button>
      </div>
      <p className="mt-2 text-xs text-muted">Consulta directamente el año completo, del 1 de enero al 31 de diciembre (UTC). Para fechas específicas y filtros adicionales utiliza «Filtros».</p>
    </section>
    {error&&<p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900 dark:border-red-800 dark:bg-red-950/50 dark:text-red-200">{error}</p>}
    {!applied&&<section className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border-ui bg-panel px-5 py-12 text-center">
      <CalendarRange size={30} className="text-muted"/>
      <h3 className="font-semibold text-main">Selecciona un año o período histórico</h3>
      <p className="max-w-md text-sm text-muted">El catálogo se consulta bajo demanda. El selector anual y el modal permiten definir el período antes de enviar la consulta.</p>
    </section>}
    {applied&&<section className="overflow-hidden rounded-xl border border-border-ui bg-panel">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border-ui px-4 py-4">
        <div><h3 className="font-semibold text-main">Resultados del catálogo</h3>
          <p className="mt-1 text-xs text-muted">{period}</p>
          <p className="mt-1 text-xs text-muted">{pending?'Consultando…':`${result?.total??'—'} coincidencias`}</p>
          <p className="mt-1 text-xs text-muted">Los IDs del catálogo histórico no son códigos de fichas individuales IGP.</p></div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={()=>{setResult(null);setRevision(n=>n+1);}} disabled={pending}
            className="inline-flex items-center gap-2 rounded-lg border border-border-ui px-3 py-2 text-xs text-main hover:bg-panel-alt disabled:opacity-40">
            <RefreshCcw size={15}/> Actualizar
          </button>
          {canExport&&!!result?.total&&!pending&&(['csv','xlsx','pdf'] as const).map(format=><button
            key={format} type="button" disabled={!!exporting||(format==='pdf'&&result.total>400)||(format!=='pdf'&&result.total>5000)}
            onClick={()=>void download(format)} className="inline-flex items-center gap-2 rounded-lg border border-border-ui px-3 py-2 text-xs font-semibold uppercase text-main hover:bg-panel-alt disabled:opacity-40">
            {exporting===format?<LoadingSpinner size="sm" variant="inline" label="Generando…"/>:<><Download size={15}/>{format}</>}
          </button>)}
        </div>
        {!!result?.total&&result.total>400&&<p className="w-full text-xs text-muted">PDF: máximo 400 registros; CSV/XLSX: máximo 5.000. Ajusta la consulta si supera estos límites.</p>}
      </div>
      {pending?<LoadingSpinner label="Consultando histórico IGP…"/>:
        result?.items.length?<div className="overflow-x-auto"><table className="w-full min-w-[1010px] text-left text-sm">
          <thead className="bg-panel-alt text-xs uppercase text-muted"><tr>
            {['Fecha UTC','Magnitud','Prof. km','Latitud','Longitud','Fuente','ID catálogo'].map(x=><th key={x} className="px-3 py-3">{x}</th>)}
          </tr></thead>
          <tbody className="divide-y divide-border-ui">{result.items.map(item=><tr key={item.id} className="hover:bg-panel-alt">
            <td className="whitespace-nowrap px-3 py-3 text-main">{item.fecha_utc.replace('+00:00','Z')}</td>
            <td className="px-3 py-3 font-semibold text-main">{item.magnitud.toFixed(1)}</td>
            <td className="px-3 py-3 text-muted">{item.profundidad_km.toFixed(1)}</td>
            <td className="px-3 py-3 text-muted">{item.latitud.toFixed(3)}</td>
            <td className="px-3 py-3 text-muted">{item.longitud.toFixed(3)}</td>
            <td className="px-3 py-3 text-main">IGP/CENSIS</td>
            <td className="px-3 py-3 font-mono text-xs text-muted">{item.id_origen}</td>
          </tr>)}</tbody>
        </table></div>
        :<p className="p-8 text-center text-sm text-muted">No hay registros para el período y los filtros seleccionados.</p>}
      <TablePagination page={page} pages={result?.pages??1} pageSize={pageSize} disabled={pending}
        onPageChange={n=>{setResult(null);setPage(n);}} onPageSizeChange={n=>{setResult(null);setPageSize(n);setPage(1);}}/>
    </section>}
    {result?.source&&applied&&<aside className="rounded-xl border border-border-ui bg-panel p-4 text-xs text-muted">
      <p className="mb-2 flex items-center gap-2 font-semibold text-main"><Info size={16}/> Procedencia y versión</p>
      <a href={result.source.resource_url} target="_blank" rel="noopener noreferrer" className="mb-2 inline-flex items-center gap-1 text-accent hover:underline">Ver fuente del catálogo histórico IGP <ArrowUpRight size={14}/></a>
      <p>IGP/CENSIS · Publicación: {result.source.published_at??'No declarada'} · Lectura: {new Date(result.source.retrieved_at).toLocaleString('es-PE',{timeZone:'America/Lima'})}</p>
      <p className="mt-1">Registros del archivo: {result.source.source_rows} · Inválidos: {result.source.invalid_rows} · {result.source.storage}</p>
      <p className="mt-1">{result.source.warning}</p>
      <p className="mt-1 break-all font-mono">SHA-256 normalizado: {result.source.snapshot_sha256}</p>
      {result.source.original_xlsx_sha256&&<p className="mt-1 break-all font-mono">SHA-256 del XLSX: {result.source.original_xlsx_sha256}</p>}
      {result.source.original_csv_sha256&&<p className="mt-1 break-all font-mono">SHA-256 del CSV: {result.source.original_csv_sha256}</p>}
      <p className="mt-2">Los identificadores históricos son referencias del catálogo, no fichas individuales. La cobertura instrumental es variable.</p>
    </aside>}
    <Modal open={filterOpen} title="Filtros del catálogo histórico" onClose={()=>setFilterOpen(false)} mobileSheet
      description="Personaliza el período y las condiciones de consulta del archivo 1960–2025."
      footer={<><button type="button" onClick={clearDraft} className="rounded-lg border border-border-ui px-4 py-2 text-sm text-main">Limpiar</button>
        <button type="submit" form="igp-history-filters" className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-semibold text-white dark:bg-neutral-100 dark:text-neutral-950">Consultar sismos</button></>}>
      <form id="igp-history-filters" className="space-y-4" onSubmit={consult}>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={field}>Fecha inicial (UTC)
            <input type="date" min={MIN_DATE} max={MAX_DATE} required className={control} value={draft.start} onChange={e=>update('start',e.target.value)}/></label>
          <label className={field}>Fecha final (UTC)
            <input type="date" min={MIN_DATE} max={MAX_DATE} required className={control} value={draft.end} onChange={e=>update('end',e.target.value)}/></label>
        </div>
        <p className="text-xs text-muted">Las fechas incluyen el día completo en UTC, desde 00:00:00 hasta 23:59:59.999999.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={field}>Magnitud mínima
            <input className={control} type="number" min="0" max="10" step="0.1" placeholder="Todas"
              value={draft.min_magnitude??''} onChange={e=>update('min_magnitude',e.target.value===''?undefined:Number(e.target.value))}/></label>
          <label className={field}>Profundidad máxima (km)
            <input className={control} type="number" min="0" max="900" step="any" placeholder="Todas"
              value={draft.max_depth??''} onChange={e=>update('max_depth',e.target.value===''?undefined:Number(e.target.value))}/></label>
        </div>
        <p className="text-xs font-semibold text-main">Zona geográfica opcional (WGS84)</p>
        <p className="text-xs text-muted">Si necesitas delimitar una zona, indica los cuatro límites.</p>
        <div className="grid gap-3 sm:grid-cols-2">{(['south','west','north','east'] as const).map(key=><label key={key} className={field}>
          {({south:'Latitud sur',west:'Longitud oeste',north:'Latitud norte',east:'Longitud este'} as const)[key]}
          <input className={control} type="number" step="any" min={key==='south'||key==='north'?-90:-180}
            max={key==='south'||key==='north'?90:180} placeholder="Sin límite"
            value={draft[key]??''} onChange={e=>update(key,e.target.value===''?undefined:Number(e.target.value))}/></label>)}</div>
        {formError&&<p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900 dark:border-red-800 dark:bg-red-950/50 dark:text-red-200">{formError}</p>}
      </form>
    </Modal>
  </div>;
}
