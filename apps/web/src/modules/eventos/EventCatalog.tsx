/** Eventos IGP/CENSIS persistidos: filtros reales de FastAPI y detalle con procedencia. */
import { Fragment, useEffect, useState, type FormEvent } from 'react';
import { Activity, ArrowUpRight, ChevronDown, Filter, MapPin, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import Modal from '../../components/ui/Modal';
import TablePagination, { type TablePageSize } from '../../components/ui/TablePagination';
import { getEvents, type EventFilters } from '../../services/seismic';
import type { EventPage, SeismicEvent } from '../../types/seismic';

const control = 'w-full min-w-0 rounded-lg border border-border-ui bg-page px-3 py-2 text-sm text-main outline-none focus-visible:ring-2 focus-visible:ring-accent';
const field = 'space-y-1 text-xs font-medium text-muted';
type Draft = {from:string; to:string; magnitude:string; minDepth:string; maxDepth:string; south:string; west:string; north:string; east:string};
const blank: Draft = {from:'',to:'',magnitude:'',minDepth:'',maxDepth:'',south:'',west:'',north:'',east:''};

const MONTH_NAMES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'] as const;

/** El mes de consulta es el de Perú, no el del navegador (puede estar en otro huso). */
function currentPeruMonth() {
  const parts = new Intl.DateTimeFormat('en-US', {timeZone:'America/Lima',year:'numeric',month:'numeric'})
    .formatToParts(new Date());
  const year = Number(parts.find(p=>p.type==='year')?.value ?? '2026');
  const month = Number(parts.find(p=>p.type==='month')?.value ?? '10');
  return {year, month};
}

/** Inicio de mes en Perú: UTC 05:00. El último segundo se incluye en la consulta. */
function monthTimeRange(year: number, month: number) {
  const start = new Date(Date.UTC(year,month-1,1,5,0,0));
  const next = new Date(Date.UTC(year,month,1,5,0,0));
  const last = new Date(next.getTime()-1);
  return {start_time:start.toISOString(),end_time:last.toISOString().replace('.999Z','.999999Z')};
}

/** Solo fichas oficiales individualizables: jamás reutilizar el portal general por fila. */
function individualIGPReport(externalId: string, sourceUrl: string): string | null {
  const match = /^(?:IGP\/CENSIS\/RS\s*)?(\d{4}-\d{4,6})$/i.exec(externalId.trim());
  if (match) return `https://ultimosismo.igp.gob.pe/evento/${match[1]}`;
  // Compatibilidad con registros legados cuyo ID no contiene el código pero la URL sí.
  try {
    const url = new URL(sourceUrl);
    if (url.protocol==='https:' && url.hostname==='ultimosismo.igp.gob.pe' &&
        /^\/evento\/\d{4}-\d{4,6}\/?$/.test(url.pathname)) {
      return `https://ultimosismo.igp.gob.pe${url.pathname.replace(/\/$/,'')}`;
    }
  } catch { /* URL de origen inválida: no construir vínculos falsos. */ }
  return null;
}
/** Presentación humana de la fecha UTC, sin modificar el instante original. */
function utcDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Sin fecha';
  const formatted = new Intl.DateTimeFormat('es-PE', {
    timeZone: 'UTC', day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).format(date);
  return `${formatted} UTC`;
}
/** Ocurrencia y recepción se muestran siempre en hora oficial de Perú. */
function peruDate(value?: string | null) {
  if (!value) return 'No disponible';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'No disponible' : date.toLocaleString('es-PE', {
    timeZone: 'America/Lima', day:'2-digit', month:'2-digit', year:'numeric',
    hour:'2-digit', minute:'2-digit', second:'2-digit', hour12: false,
  });
}
/** Estado del registro interno: no certifica un proceso de revisión realizado por el IGP. */
function reviewLabel(status: string) {
  if (status === 'unreviewed') return 'Sin revisión registrada';
  if (status === 'reviewed') return 'Revisión registrada';
  if (status === 'pending') return 'Revisión pendiente';
  return status?.trim() || 'No disponible';
}
/** Se pasa el evento real mediante React Router para localizarlo incluso fuera del mes del mapa. */
function mapLink(item: SeismicEvent) {
  return `/mapa-sismico?${new URLSearchParams({ igp_event: item.external_id }).toString()}`;
}
function hasMapLocation(item: SeismicEvent) {
  return Boolean(item.external_id && Number.isFinite(item.latitude) && Number.isFinite(item.longitude)
    && Math.abs(item.latitude) <= 90 && Math.abs(item.longitude) <= 180);
}
function mapNavigationState(item: SeismicEvent) {
  // Es el contrato de igpReport que el mapa ya utiliza para centrar y abrir el popup.
  return { igpReport: {
    external_id: item.external_id, occurred_at: item.occurred_at,
    latitude: item.latitude, longitude: item.longitude,
    magnitude: item.magnitude, magnitude_type: item.magnitude_type,
    depth_km: item.depth_km, place: item.place,
    source_name: item.source_name, source_url: item.source_url,
  } };
}
function EventDetails({item}: {item:SeismicEvent}) {
  // No repetir fecha UTC, magnitud, profundidad, ubicación ni enlace que ya están en la fila.
  const pairs = [
    ['ID interno', item.id],
    ['Fuente de datos', item.source_name],
    ['Ocurrencia (Perú)', peruDate(item.occurred_at)],
    ['Recepción en el sistema (Perú)', peruDate(item.received_at)],
    ['Latitud', item.latitude.toFixed(4)],
    ['Longitud', item.longitude.toFixed(4)],
    ['Estado de revisión', reviewLabel(item.review_status)],
    // source_updated_at es opcional. No mostrar un bloque vacío sin información.
    ...(item.source_updated_at ? [['Actualización de la fuente (Perú)', peruDate(item.source_updated_at)]] : []),
  ];
  return <div className="space-y-3 text-xs text-main">
    <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
      {pairs.map(([label,value])=><div key={label} className="min-w-0">
        <dt className="text-muted">{label}</dt><dd className="mt-1 break-words font-medium">{value}</dd>
      </div>)}
    </dl>
    <p className="text-muted">El estado de revisión describe el registro de la plataforma; no certifica una revisión del IGP.</p>
  </div>;
}

export default function EventCatalog() {
  const [draft,setDraft] = useState<Draft>(blank);
  const [clock] = useState(currentPeruMonth);
  // Cambia automáticamente de año en enero; en 2026 bloquea noviembre/diciembre hasta su fecha.
  const [selectedMonth,setSelectedMonth] = useState(clock.month);
  const [filters,setFilters] = useState<Omit<EventFilters,'page'|'page_size'>>({
    source:'IGP/CENSIS',...monthTimeRange(clock.year,clock.month),
  });
  const [customPeriod,setCustomPeriod] = useState(false);
  const [modal,setModal] = useState(false);
  const [page,setPage] = useState(1);
  const [pageSize,setPageSize] = useState<TablePageSize>(10);
  const [expanded,setExpanded] = useState<string|null>(null);
  const [result,setResult] = useState<EventPage|null>(null);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState('');
  const [filterError,setFilterError] = useState('');
  const [revision,setRevision] = useState(0);

  useEffect(()=>{
    const controller = new AbortController();
    setLoading(true);setError('');
    getEvents({...filters,page,page_size:pageSize},controller.signal)
      .then(data=>{if(!controller.signal.aborted)setResult(data);})
      .catch((cause:unknown)=>{if(!controller.signal.aborted)setError(cause instanceof Error?cause.message:'Error al consultar eventos');})
      .finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return ()=>controller.abort();
  },[filters,page,pageSize,revision]);
  const pages=Math.max(1,Math.ceil((result?.total??0)/pageSize));
  function change<K extends keyof Draft>(key:K, value:Draft[K]) {setDraft(old=>({...old,[key]:value}));setFilterError('');}
  function setQuickMonth(month: number) {
    if (!Number.isInteger(month)||month<1||month>12||month>clock.month) return;
    setSelectedMonth(month);
    setDraft(blank);
    setFilters({source:'IGP/CENSIS',...monthTimeRange(clock.year,month)});
    setCustomPeriod(false);setPage(1);setExpanded(null);setFilterError('');setModal(false);
  }
  function clearFilters() {setQuickMonth(selectedMonth);}
  function apply(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if(draft.from&&draft.to&&draft.from>draft.to){setFilterError('La fecha inicial no puede superar la fecha final.');return;}
    if(draft.minDepth!==''&&draft.maxDepth!==''&&Number(draft.minDepth)>Number(draft.maxDepth)){
      setFilterError('La profundidad mínima no puede superar a la máxima.');return;
    }
    const area=[draft.south,draft.west,draft.north,draft.east];
    if(area.some(x=>x!=='')&&area.some(x=>x==='')){setFilterError('Completa los cuatro límites de la zona o déjalos vacíos.');return;}
    if(area.every(x=>x!=='')&&(Number(draft.south)>Number(draft.north)||Number(draft.west)>Number(draft.east))){
      setFilterError('Los límites geográficos están invertidos.');return;
    }
    // Si solo cambia la magnitud, profundidad o zona, se conserva el mes rápido.
    // Las fechas específicas del modal son UTC; al definirlas sustituyen al período rápido.
    const dates=(!draft.from&&!draft.to)
      ? monthTimeRange(clock.year,selectedMonth)
      : {
          ...(draft.from?{start_time:`${draft.from}T00:00:00Z`}:{}),
          ...(draft.to?{end_time:`${draft.to}T23:59:59.999999Z`}:{}),
        };
    setFilters({source:'IGP/CENSIS',...dates,
      ...(draft.magnitude!==''?{min_magnitude:Number(draft.magnitude)}:{}),
      ...(draft.minDepth!==''?{min_depth:Number(draft.minDepth)}:{}),
      ...(draft.maxDepth!==''?{max_depth:Number(draft.maxDepth)}:{}),
      ...(draft.south!==''?{south:Number(draft.south),west:Number(draft.west),north:Number(draft.north),east:Number(draft.east)}:{}),
    });
    setCustomPeriod(true);setPage(1);setExpanded(null);setModal(false);
  }
  const hasFilters = customPeriod;
  const monthTitle = customPeriod ? 'Consulta con filtros avanzados' : `${MONTH_NAMES[selectedMonth-1]} de ${clock.year}`;
  return <div className="space-y-5">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><h2 className="text-lg font-semibold text-main">Catálogo de eventos registrados</h2>
        <p className="mt-1 text-xs text-muted">Fuente IGP/CENSIS · Eventos registrados por fecha de ocurrencia en Perú (UTC−05:00).</p></div>
      <div className="flex flex-wrap items-end gap-2">
        <label className="space-y-1 text-xs font-medium text-muted">Mes de consulta · {clock.year}
          <select aria-label="Filtro rápido de mes" className={control} value={customPeriod?'custom':String(selectedMonth)}
            onChange={event=>setQuickMonth(Number(event.target.value))}>
            {customPeriod&&<option value="custom" disabled>Período personalizado</option>}
            {MONTH_NAMES.map((name,index)=><option key={name} value={index+1} disabled={index+1>clock.month}>{name}</option>)}
          </select>
        </label>
        <button type="button" onClick={()=>setRevision(n=>n+1)} className="inline-flex items-center gap-2 rounded-lg border border-border-ui bg-panel px-3 py-2 text-sm text-main hover:bg-panel-alt"><RefreshCw size={16}/> Actualizar</button>
        <button type="button" onClick={()=>setModal(true)} className="inline-flex items-center gap-2 rounded-lg border border-border-ui bg-panel px-3 py-2 text-sm text-main hover:bg-panel-alt"><Filter size={16}/> Filtros{hasFilters?' · Activos':''}</button>
      </div>
    </div>
    <section className="overflow-hidden rounded-2xl border border-border-ui bg-panel">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-ui px-4 py-4">
        <div><h3 className="font-semibold text-main">Eventos registrados · {monthTitle}</h3>
          <p className="mt-1 text-xs text-muted">Solo una tabla · Selecciona otro mes o utiliza Filtros para buscar fechas específicas.</p></div>
        <span className="text-xs text-muted">{result?.total ?? '—'} eventos · IGP/CENSIS</span>
      </div>
      {error && <p role="alert" className="m-4 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900 dark:border-red-800 dark:bg-red-950/50 dark:text-red-200">{error}</p>}
      {loading?<LoadingSpinner label="Consultando eventos sísmicos…" />:result?.items.length?
        <div className="overflow-x-auto"><table className="w-full min-w-[1080px] text-left text-sm">
          <thead className="bg-panel-alt text-xs uppercase text-muted"><tr>
            <th className="px-3 py-3">Fecha UTC</th><th className="px-3 py-3">Magnitud</th>
            <th className="px-3 py-3">Profundidad</th><th className="px-3 py-3">Ubicación</th>
            <th className="px-3 py-3">ID IGP</th><th className="px-3 py-3">Reporte IGP</th>
            <th className="px-3 py-3">Ver en el mapa</th><th className="px-3 py-3 text-right">Detalles</th>
          </tr></thead><tbody className="divide-y divide-border-ui">
          {result.items.map(item=><Fragment key={item.id}>
            <tr className="hover:bg-panel-alt">
              <td className="whitespace-nowrap px-3 py-3 text-main" title={`Hora Perú: ${peruDate(item.occurred_at)}`}>{utcDate(item.occurred_at)}</td>
              <td className="px-3 py-3 font-semibold text-main">{item.magnitude?.toFixed(1)??'—'}</td>
              <td className="px-3 py-3 text-muted">{item.depth_km===null?'—':`${item.depth_km.toFixed(1)} km`}</td>
              <td className="max-w-64 px-3 py-3 text-main">{item.place??'Sin referencia'}</td>
              <td className="px-3 py-3 font-mono text-xs text-muted">{item.external_id}</td>
              <td className="px-3 py-3 text-xs">{individualIGPReport(item.external_id,item.source_url)
                ? <a href={individualIGPReport(item.external_id,item.source_url)!} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 whitespace-nowrap text-accent hover:underline">Ver reporte <ArrowUpRight size={13}/></a>
                : <span className="text-muted">Sin ficha individual</span>}</td>
              <td className="px-3 py-3 text-xs">{hasMapLocation(item)
                ? <Link to={mapLink(item)} state={mapNavigationState(item)}
                    title={`Centrar el epicentro de ${item.external_id} en el Mapa sísmico`}
                    className="inline-flex items-center gap-1 whitespace-nowrap text-accent hover:underline">
                    <MapPin size={14}/> Ver epicentro
                  </Link>
                : <span className="text-muted">Sin coordenadas</span>}</td>
              <td className="px-3 py-3 text-right"><button type="button" aria-expanded={expanded===item.id}
                aria-label={`Ver detalles de ${item.external_id}`} onClick={()=>setExpanded(id=>id===item.id?null:item.id)}
                className="rounded-md border border-border-ui p-1.5 text-main hover:bg-panel-alt">
                <ChevronDown size={17} className={`transition-transform ${expanded===item.id?'rotate-180':''}`}/></button></td>
            </tr>
            {expanded===item.id&&<tr className="bg-panel-alt/40"><td colSpan={8} className="px-4 py-4 sm:px-5"><EventDetails item={item}/></td></tr>}
          </Fragment>)}
          </tbody></table></div>
        :<div className="flex flex-col items-center gap-2 p-10 text-center"><Activity size={25} className="text-muted"/>
          <p className="text-sm font-medium text-main">No hay eventos IGP con estos filtros</p></div>}
      <TablePagination page={page} pages={pages} pageSize={pageSize} disabled={loading}
        onPageChange={n=>{setPage(n);setExpanded(null);}} onPageSizeChange={n=>{setPageSize(n);setPage(1);setExpanded(null);}} />
    </section>
    <p className="text-xs text-muted">Información de eventos registrados, no predictiva. El catálogo operativo y el histórico instrumental se consultan por separado.</p>
    <Modal open={modal} onClose={()=>setModal(false)} title="Filtros de eventos sísmicos" mobileSheet
      description="Aplica filtros sobre eventos IGP/CENSIS registrados. Fechas y coordenadas en UTC/WGS84."
      footer={<><button type="button" onClick={clearFilters} className="rounded-lg border border-border-ui px-4 py-2 text-sm text-main">Limpiar</button>
        <button type="submit" form="eventos-filtros" className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-semibold text-white dark:bg-neutral-100 dark:text-neutral-950">Aplicar filtros</button></>}>
      <form id="eventos-filtros" onSubmit={apply} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2"><label className={field}>Fecha inicial (UTC)
          <input type="date" className={control} value={draft.from} onChange={e=>change('from',e.target.value)}/></label>
          <label className={field}>Fecha final (UTC)
          <input type="date" className={control} value={draft.to} onChange={e=>change('to',e.target.value)}/></label></div>
        <div className="grid gap-3 sm:grid-cols-3"><label className={field}>Magnitud mínima
          <input type="number" step="0.1" min="-3" max="12" placeholder="Todas" className={control} value={draft.magnitude} onChange={e=>change('magnitude',e.target.value)}/></label>
          <label className={field}>Profundidad mínima (km)
          <input type="number" min="0" step="any" placeholder="Todas" className={control} value={draft.minDepth} onChange={e=>change('minDepth',e.target.value)}/></label>
          <label className={field}>Profundidad máxima (km)
          <input type="number" min="0" step="any" placeholder="Todas" className={control} value={draft.maxDepth} onChange={e=>change('maxDepth',e.target.value)}/></label></div>
        <div className="space-y-2"><p className="text-xs font-semibold text-main">Zona geográfica opcional (WGS84)</p>
          <p className="text-xs text-muted">Introduce los cuatro límites o deja todos vacíos.</p>
          <div className="grid gap-3 sm:grid-cols-2">{(['south','west','north','east'] as const).map(key=>
            <label key={key} className={field}>{({south:'Latitud sur',west:'Longitud oeste',north:'Latitud norte',east:'Longitud este'} as const)[key]}
              <input className={control} type="number" step="any" min={key==='south'||key==='north'?-90:-180} max={key==='south'||key==='north'?90:180}
                placeholder="Sin límite" value={draft[key]} onChange={e=>change(key,e.target.value)}/></label>)}</div></div>
        <p className="text-xs text-muted">Las fechas avanzadas son UTC. Al aplicar el modal sustituyen el mes rápido; «Limpiar» recupera el mes seleccionado. Proveedor permitido: IGP/CENSIS.</p>
        {filterError&&<p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900 dark:border-red-800 dark:bg-red-950/50 dark:text-red-200">{filterError}</p>}
      </form>
    </Modal>
  </div>;
}
