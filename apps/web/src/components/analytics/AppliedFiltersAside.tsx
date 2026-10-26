/** Contexto del gráfico o mapa: fechas, filtros, tamaño de muestra y procedencia. */
import { CalendarRange, Database, MapPin, SlidersHorizontal } from 'lucide-react';
import type { AnalyticsFilters } from '../../types/analytics';

type Props = {
  filters: AnalyticsFilters;
  sampleSize?: number | null;
  geoDescription?: string;
  lastSync?: string | null;
};

function dateLabel(value: string | undefined) { return value ? value.slice(0, 10).split('-').reverse().join('/') : 'Sin límite'; }
function range(min: number | undefined, max: number | undefined, unit = '') {
  if (min === undefined && max === undefined) return 'Todos';
  return `${min === undefined ? '—' : min}${unit} a ${max === undefined ? '—' : max}${unit}`;
}
function geoLabel(filters: AnalyticsFilters) {
  if (filters.radius_km != null) return `Radio ${filters.radius_km} km desde ${filters.center_lat}, ${filters.center_lon}`;
  if ([filters.min_lat, filters.max_lat, filters.min_lon, filters.max_lon].some(value => value === undefined)) return 'Sin restricción';
  return `Lat. ${filters.min_lat} a ${filters.max_lat}; lon. ${filters.min_lon} a ${filters.max_lon}`;
}
function datetime(value?: string | null) {
  if (!value) return 'No disponible';
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? 'No disponible' : new Date(ms).toLocaleString('es-PE', { timeZone: 'America/Lima', dateStyle: 'short', timeStyle: 'short' });
}

export default function AppliedFiltersAside({ filters, sampleSize, lastSync, geoDescription }: Props) {
  return <aside aria-label="Contexto y filtros de la visualización" className="min-w-0 rounded-2xl border border-border-ui bg-panel p-4 xl:w-[244px] xl:shrink-0">
    <div className="flex items-center gap-2 text-sm font-semibold text-main"><SlidersHorizontal size={16} className="text-accent"/> Filtros aplicados</div>
    <dl className="mt-4 space-y-4 text-sm">
      <div><dt className="flex items-center gap-1.5 text-xs text-muted"><CalendarRange size={13}/> Período (Perú)</dt><dd className="mt-1 font-medium text-main">{dateLabel(filters.start_time)} – {dateLabel(filters.end_time)}</dd></div>
      <div><dt className="flex items-center gap-1.5 text-xs text-muted"><MapPin size={13}/> Región / zona</dt><dd className="mt-1 text-main">{geoDescription ?? geoLabel(filters)}</dd></div>
      <div><dt className="text-xs text-muted">Magnitud</dt><dd className="mt-1 text-main">{range(filters.min_magnitude, filters.max_magnitude)}</dd></div>
      <div><dt className="text-xs text-muted">Profundidad</dt><dd className="mt-1 text-main">{range(filters.min_depth, filters.max_depth, ' km')}</dd></div>
      <div><dt className="flex items-center gap-1.5 text-xs text-muted"><Database size={13}/> Fuente</dt><dd className="mt-1 font-medium text-main">IGP/CENSIS</dd></div>
    </dl>
    <div className="mt-4 border-t border-border-ui pt-4 text-xs text-muted">
      <p>Tamaño de la muestra: <strong className="text-main">{sampleSize == null ? '—' : sampleSize.toLocaleString('es-PE')}</strong></p>
      <p className="mt-2">Última ingesta IGP:</p>
      <p className="mt-1 font-medium text-main">{datetime(lastSync)}</p>
      <p className="mt-2 text-soft">El catálogo almacenado no equivale a la totalidad de sismos publicados por el IGP.</p>
    </div>
  </aside>;
}
