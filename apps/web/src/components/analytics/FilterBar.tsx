/** Controles de filtros compartidos en modal; una sola fuente visible: IGP/CENSIS.
 * Fechas UTC inclusivas. El contexto se conserva al cambiar de módulo.
 */
import { useEffect, useState, type FormEvent } from 'react';
import { Download, Filter, RotateCcw, RefreshCw } from 'lucide-react';
import Modal from '../ui/Modal';
import { useAnalyticsFilters } from '../../hooks/useAnalyticsFilters';
import { downloadEventsCsv } from '../../services/analytics';
import { currentPeruMonth, peruDateFilters, withCurrentPeruMonth } from '../../lib/peruMonth';
import { PERU_DEPARTMENTS } from '../../lib/peruDepartments';

const IGP = 'IGP/CENSIS';
const fieldClass = 'w-full rounded-lg border border-border-ui bg-page px-3 py-2 text-sm text-main focus-visible:outline-2 focus-visible:outline-accent';

type DepartmentSelection = { value: string; onChange: (department: string) => void };
/** El selector administrativo se habilita solo en Mapa; el resto conserva filtros SQL compartidos. */
export default function FilterBar({ currentMonthDefault = false, departmentSelection }: {
  currentMonthDefault?: boolean;
  departmentSelection?: DepartmentSelection;
}) {
  const { filters, setFilters, refresh } = useAnalyticsFilters();
  const [open, setOpen] = useState(false);
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [minimum, setMinimum] = useState('');
  const [maximum, setMaximum] = useState('');
  const [minimumDepth, setMinimumDepth] = useState('');
  const [geoMode, setGeoMode] = useState<'none' | 'rectangle' | 'radius' | 'department'>('none');
  const [departmentCode, setDepartmentCode] = useState('');
  const [centerLat, setCenterLat] = useState('');
  const [centerLon, setCenterLon] = useState('');
  const [radiusKm, setRadiusKm] = useState('');
  const [minLat, setMinLat] = useState('');
  const [maxLat, setMaxLat] = useState('');
  const [minLon, setMinLon] = useState('');
  const [maxLon, setMaxLon] = useState('');
  const [maximumDepth, setMaximumDepth] = useState('');
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);

  // Sincronizar los borradores cuando otro módulo haya cambiado los filtros.
  useEffect(() => {
    if (!open) return;
    const effective = currentMonthDefault ? withCurrentPeruMonth(filters) : filters;
    setStart(effective.start_time?.slice(0, 10) ?? '');
    setEnd(effective.end_time?.slice(0, 10) ?? '');
    setMinimum(filters.min_magnitude == null ? '' : String(filters.min_magnitude));
    setMaximum(filters.max_magnitude == null ? '' : String(filters.max_magnitude));
    setMinimumDepth(filters.min_depth == null ? '' : String(filters.min_depth));
    setMaximumDepth(filters.max_depth == null ? '' : String(filters.max_depth));
    setGeoMode(departmentSelection?.value ? 'department' : filters.radius_km != null ? 'radius' : filters.min_lat != null ? 'rectangle' : 'none');
    setDepartmentCode(departmentSelection?.value ?? '');
    setCenterLat(filters.center_lat == null ? '' : String(filters.center_lat));
    setCenterLon(filters.center_lon == null ? '' : String(filters.center_lon));
    setRadiusKm(filters.radius_km == null ? '' : String(filters.radius_km));
    setMinLat(filters.min_lat == null ? '' : String(filters.min_lat));
    setMaxLat(filters.max_lat == null ? '' : String(filters.max_lat));
    setMinLon(filters.min_lon == null ? '' : String(filters.min_lon));
    setMaxLon(filters.max_lon == null ? '' : String(filters.max_lon));
    setError('');
    // Solo al abrir, no reescribir valores mientras el usuario edita el formulario.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (start && end && start > end) { setError('La fecha inicial no puede superar la fecha final.'); return; }
    if (minimum !== '' && maximum !== '' && Number(minimum) > Number(maximum)) { setError('El rango de magnitud no es válido.'); return; }
    if (minimumDepth !== '' && maximumDepth !== '' && Number(minimumDepth) > Number(maximumDepth)) { setError('El rango de profundidad no es válido.'); return; }
    const geo = [minLat, maxLat, minLon, maxLon];
    if (geoMode === 'rectangle' && geo.some(value => value !== '') && !geo.every(value => value !== '')) {
      setError('Para delimitar una zona debes indicar sus cuatro coordenadas.'); return;
    }
    if (geoMode === 'rectangle' && geo.every(value => value !== '')) {
      const [south, north, west, east] = geo.map(Number);
      if (south < -90 || north > 90 || west < -180 || east > 180 || south > north || west > east) {
        setError('Las coordenadas de la zona no forman un rectángulo válido.'); return;
      }
    }
    if (geoMode === 'rectangle' && !geo.every(value => value !== '')) {
      setError('Completa las cuatro coordenadas del rectángulo.'); return;
    }
    if (geoMode === 'radius') {
      const lat = Number(centerLat), lon = Number(centerLon), radius = Number(radiusKm);
      if (!centerLat || !centerLon || !radiusKm || !Number.isFinite(lat) || !Number.isFinite(lon)
          || !Number.isFinite(radius) || lat < -90 || lat > 90 || lon < -180 || lon > 180
          || radius < 1 || radius > 2000) {
        setError('Introduce un centro válido y un radio entre 1 y 2000 km.'); return;
      }
    }
    if (geoMode === 'department') {
      if (!departmentSelection || !PERU_DEPARTMENTS.some(([code]) => code === departmentCode)) {
        setError('Selecciona un departamento válido.'); return;
      }
    }
    // Primero limpiar el recorte del modo anterior; los departamentos usan su
    // geometría real en Mapa, no una caja presentada como límite administrativo.
    departmentSelection?.onChange(geoMode === 'department' ? departmentCode : '');
    setFilters({
      source: IGP,
      ...peruDateFilters(start, end),
      ...(minimum !== '' ? { min_magnitude: Number(minimum) } : {}),
      ...(maximum !== '' ? { max_magnitude: Number(maximum) } : {}),
      ...(minimumDepth !== '' ? { min_depth: Number(minimumDepth) } : {}),
      ...(maximumDepth !== '' ? { max_depth: Number(maximumDepth) } : {}),
      ...(geoMode === 'rectangle' && geo.every(value => value !== '') ? {
        min_lat: Number(minLat), max_lat: Number(maxLat),
        min_lon: Number(minLon), max_lon: Number(maxLon),
      } : {}),
      ...(geoMode === 'radius' ? {
        center_lat: Number(centerLat), center_lon: Number(centerLon), radius_km: Number(radiusKm),
      } : {}),
    });
    setOpen(false);
  }

  function reset() {
    setFilters({ source: IGP, ...(currentMonthDefault ? currentPeruMonth() : {}) });
    departmentSelection?.onChange('');
    setDepartmentCode(''); setGeoMode('none'); setCenterLat(''); setCenterLon(''); setRadiusKm('');
    setStart(''); setEnd(''); setMinimum(''); setMaximum(''); setMinimumDepth(''); setMaximumDepth(''); setMinLat(''); setMaxLat(''); setMinLon(''); setMaxLon(''); setError('');
    setOpen(false);
  }

  async function download() {
    setExporting(true); setError('');
    try {
      if (departmentSelection?.value) throw new Error('La exportación exacta por departamento aún no está habilitada. Limpia la selección departamental o utiliza coordenadas/radio.');
      await downloadEventsCsv(currentMonthDefault ? withCurrentPeruMonth(filters) : { ...filters, source: IGP });
    }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'No fue posible exportar'); }
    finally { setExporting(false); }
  }

  return <>
    <div className="flex flex-wrap items-center gap-2" aria-label="Acciones sobre los filtros">
      <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-2 rounded-lg border border-border-ui bg-panel px-3 py-2 text-sm font-medium text-main hover:bg-panel-alt">
        <Filter size={16} /> Filtros
      </button>
      <button type="button" onClick={refresh} className="inline-flex items-center gap-2 rounded-lg border border-border-ui bg-panel px-3 py-2 text-sm text-main hover:bg-panel-alt">
        <RefreshCw size={15}/> Actualizar
      </button>
      <button type="button" onClick={download} disabled={exporting || Boolean(departmentSelection?.value)} className="inline-flex items-center gap-2 rounded-lg border border-border-ui bg-panel px-3 py-2 text-sm text-main hover:bg-panel-alt disabled:opacity-40">
        <Download size={15}/> {exporting ? 'Exportando…' : 'CSV'}
      </button>
      {departmentSelection?.value && <span className="text-xs text-muted">CSV departamental pendiente de habilitación.</span>}
      {error && !open && <p role="alert" className="w-full text-sm text-rose-600 dark:text-rose-300">{error}</p>}
    </div>
    <Modal open={open} onClose={() => setOpen(false)} title="Filtros compartidos" description="Se aplican a los módulos analíticos. Fuente fija: IGP/CENSIS.">
      <form id="analytics-filter-form" onSubmit={apply} className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-sm text-muted">Desde (Perú)<input type="date" className={fieldClass} value={start} onChange={e => setStart(e.target.value)} /></label>
          <label className="space-y-1 text-sm text-muted">Hasta (Perú)<input type="date" className={fieldClass} value={end} onChange={e => setEnd(e.target.value)} /></label>
          <label className="space-y-1 text-sm text-muted">Magnitud mínima<input type="number" className={fieldClass} step="0.1" min="-3" max="12" value={minimum} onChange={e => setMinimum(e.target.value)} placeholder="Sin mínimo" /></label>
          <label className="space-y-1 text-sm text-muted">Magnitud máxima<input type="number" className={fieldClass} step="0.1" min="-3" max="12" value={maximum} onChange={e => setMaximum(e.target.value)} placeholder="Sin máximo" /></label>
          <label className="space-y-1 text-sm text-muted">Profundidad mínima (km)<input type="number" className={fieldClass} step="0.1" min="-20" max="1000" value={minimumDepth} onChange={e => setMinimumDepth(e.target.value)} placeholder="Sin mínimo" /></label>
          <label className="space-y-1 text-sm text-muted">Profundidad máxima (km)<input type="number" className={fieldClass} step="0.1" min="-20" max="1000" value={maximumDepth} onChange={e => setMaximumDepth(e.target.value)} placeholder="Sin máximo" /></label>
        </div>
        <details className="rounded-lg border border-border-ui bg-panel-alt px-3 py-3">
          <summary className="cursor-pointer text-sm font-semibold text-main">Zona geográfica (opcional)</summary>
          <p className="mt-2 text-xs text-muted">Selecciona una forma de búsqueda WGS84. El área indicada no representa daño, peligro ni intensidad sísmica.</p>
          <label className="mt-3 block space-y-1 text-sm text-muted">Tipo de área
            <select className={fieldClass} value={geoMode} onChange={event => setGeoMode(event.target.value as typeof geoMode)}>
              <option value="none">Todas las zonas</option>
              {departmentSelection && <option value="department">Departamento del Perú (selección sencilla)</option>}
              <option value="rectangle">Rectángulo por coordenadas</option>
              <option value="radius">Centro y radio (km)</option>
            </select>
          </label>
          {geoMode === 'department' && departmentSelection && <div className="mt-3 space-y-2">
            <label className="block space-y-1 text-sm text-muted">Departamento
              <select className={fieldClass} value={departmentCode} onChange={event => setDepartmentCode(event.target.value)}>
                <option value="">Selecciona un departamento…</option>
                {PERU_DEPARTMENTS.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
              </select>
            </label>
            <p className="text-xs text-muted">Solo para Mapa sísmico. Se filtrarán epicentros dentro de los límites administrativos referenciales de INGEMMET. Los sismos mar adentro no se asignan al departamento costero.</p>
          </div>}
          {geoMode === 'rectangle' && <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-sm text-muted">Latitud sur<input type="number" step="any" min="-90" max="90" className={fieldClass} value={minLat} onChange={e=>setMinLat(e.target.value)} placeholder="-20.345" /></label>
            <label className="space-y-1 text-sm text-muted">Latitud norte<input type="number" step="any" min="-90" max="90" className={fieldClass} value={maxLat} onChange={e=>setMaxLat(e.target.value)} placeholder="0.718" /></label>
            <label className="space-y-1 text-sm text-muted">Longitud oeste<input type="number" step="any" min="-180" max="180" className={fieldClass} value={minLon} onChange={e=>setMinLon(e.target.value)} placeholder="-88.096" /></label>
            <label className="space-y-1 text-sm text-muted">Longitud este<input type="number" step="any" min="-180" max="180" className={fieldClass} value={maxLon} onChange={e=>setMaxLon(e.target.value)} placeholder="-66.591" /></label>
          </div>}
          {geoMode === 'radius' && <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <label className="space-y-1 text-sm text-muted">Latitud central<input type="number" step="any" min="-90" max="90" className={fieldClass} value={centerLat} onChange={e=>setCenterLat(e.target.value)} placeholder="-12.04" /></label>
            <label className="space-y-1 text-sm text-muted">Longitud central<input type="number" step="any" min="-180" max="180" className={fieldClass} value={centerLon} onChange={e=>setCenterLon(e.target.value)} placeholder="-77.03" /></label>
            <label className="space-y-1 text-sm text-muted">Radio (km)<input type="number" step="1" min="1" max="2000" className={fieldClass} value={radiusKm} onChange={e=>setRadiusKm(e.target.value)} placeholder="100" /></label>
          </div>}
        </details>
        <p className="text-xs text-muted">Las fechas abarcan días completos de Perú (UTC-05). Dashboard y Mapa comparten los filtros aplicados.</p>
        {error && <p role="alert" className="text-sm text-rose-600 dark:text-rose-300">{error}</p>}
        <div className="flex flex-wrap justify-end gap-2 border-t border-border-ui pt-4">
          <button type="button" onClick={reset} className="inline-flex items-center gap-2 rounded-lg border border-border-ui px-3 py-2 text-sm text-main hover:bg-panel-alt"><RotateCcw size={15}/> Limpiar</button>
          <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-border-ui px-3 py-2 text-sm text-main hover:bg-panel-alt">Cancelar</button>
          <button type="submit" className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white dark:text-neutral-950">Aplicar filtros</button>
        </div>
      </form>
    </Modal>
  </>;
}
