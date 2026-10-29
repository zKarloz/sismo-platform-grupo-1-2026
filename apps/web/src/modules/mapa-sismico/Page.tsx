/** Mapa exclusivo de sismos observados IGP/CENSIS.
 * El catálogo sincronizado alimenta el mapa mensual; los enlaces desde Dashboard
 * abren el popup del evento concreto, incluso si aún no entró a PostgreSQL.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Circle, CircleMarker, LayerGroup, LayersControl, MapContainer, Polygon, Popup, Rectangle, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import { useLocation, useSearchParams } from 'react-router-dom';
import L from 'leaflet';
import { CalendarClock, ExternalLink, Layers, List, MapPin, RefreshCw, X } from 'lucide-react';
import 'leaflet/dist/leaflet.css';
import './mapStyles.css';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import FilterBar from '../../components/analytics/FilterBar';
import AppliedFiltersAside from '../../components/analytics/AppliedFiltersAside';
import { useAnalyticsFilters } from '../../hooks/useAnalyticsFilters';
import { useIGPFeed } from '../../hooks/useIGPFeed';
import { getDashboardOperations, getMapEvents } from '../../services/analytics';
import { IGP_OFFICIAL_URL, peruDate } from '../../services/igp';
import { individualIGPReport } from '../../lib/igpReportUrl';
import { matchesPeruPeriod, withCurrentPeruMonth } from '../../lib/peruMonth';
import { clusterEpicenters, MAGNITUDE_COLORS, magnitudeColor, magnitudeRadius } from '../../lib/mapClusters';
import { departmentBounds, pointInDepartment, PERU_DEPARTMENTS, type DepartmentBoundary } from '../../lib/peruDepartments';
import { getDepartmentBoundary } from '../../services/departments';
import type { GeoDataset, GeoFeature } from '../../types/analytics';
import type { IGPEvent } from '../../types/igp';

/** Mostrar fechas del rango civil peruano sin convertirlas a otro huso. */
function civilDate(value?: string): string {
  return value ? `${value.slice(8, 10)}/${value.slice(5, 7)}/${value.slice(0, 4)}` : 'Sin límite';
}

/** El mapa solo ajusta todos los puntos cuando no hay un foco solicitado. */
function FitMarkers({ features, focused, loading, defaultCenter, defaultBounds }: {
  features: GeoFeature[];
  focused: boolean;
  loading: boolean;
  defaultCenter?: [number, number];
  defaultBounds?: [[number, number], [number, number]];
}) {
  const map = useMap();
  // Mantener el estado de foco al día sin usarlo como desencadenante del ajuste.
  // Cerrar un popup cambia focused, pero NO debe cambiar el zoom ni el centro.
  const focusedRef = useRef(focused);
  useEffect(() => { focusedRef.current = focused; });
  useEffect(() => {
    // Esperar la consulta completa: no volver a Perú mientras llegan los datos.
    if (loading || focusedRef.current) return;
    const valid = features
      .map(feature => feature.geometry.coordinates)
      .filter(([lon, lat]) => Number.isFinite(lon) && Number.isFinite(lat))
      .map(([lon, lat]) => [lat, lon] as L.LatLngTuple);
    if (valid.length === 0) {
      if (defaultBounds) map.fitBounds(defaultBounds, { maxZoom: 9 });
      else map.setView(defaultCenter ?? [-9.19, -75], defaultCenter ? 7 : 5);
      return;
    }
    if (valid.length === 1) map.setView(valid[0], 8);
    else map.fitBounds(L.latLngBounds(valid).pad(0.15), { maxZoom: 8 });
    // Sólo nuevas consultas y cambios geográficos justifican autoencuadrar.
    // No incluir focused: los popups no controlan el encuadre del mapa.
  }, [features, loading, map, defaultCenter?.[0], defaultCenter?.[1],
    defaultBounds?.[0][0], defaultBounds?.[0][1], defaultBounds?.[1][0], defaultBounds?.[1][1]]);
  return null;
}

/** Misma ficha al pulsar un epicentro y al abrirlo desde Últimos reportes. */
function Epicenter({ feature, focused, liveFallback, autoZoom = false, onClose }: {
  feature: GeoFeature;
  focused: boolean;
  liveFallback: boolean;
  /** Solo enlaces procedentes del Dashboard deben cambiar el zoom. */
  autoZoom?: boolean;
  onClose?: () => void;
}) {
  const map = useMap();
  const markerRef = useRef<L.CircleMarker | null>(null);
  const [longitude, latitude] = feature.geometry.coordinates;
  const event = feature.properties;
  // Enlazar solo reportes individuales IGP identificados de forma válida.
  const reportUrl = individualIGPReport(event.external_id, event.source_url);

  useEffect(() => {
    if (!focused || !markerRef.current) return;
    // Usamos la propia capa Leaflet para abrir exactamente el mismo Popup.
    if (autoZoom) map.setView([latitude, longitude], Math.max(map.getZoom(), 9), { animate: false });
    // Abrir la ficha sin cambiar el nivel de zoom en selecciones del clúster.
    markerRef.current.openPopup();
  }, [focused, autoZoom, latitude, longitude, map]);

  const color = magnitudeColor(event.magnitude);

  useEffect(() => {
    // SVG aplica antes las reglas CSS que los atributos stroke/fill de Leaflet.
    // El estilo del marcador debe prevalecer sobre los temas claro y oscuro.
    const path = markerRef.current?.getElement();
    // getElement() devuelve Element; solo aplicar estilos DOM a elementos SVG.
    if (path instanceof SVGElement) {
      path.style.stroke = color;
      path.style.fill = color;
    }
  }, [color]);

  return <CircleMarker ref={markerRef} center={[latitude, longitude]}
    radius={magnitudeRadius(event.magnitude)}
    // El color lo decide cada evento, no el tema ni el color de los clústeres.
    pathOptions={{ className: 'sismo-point', color, fillColor: color, weight: focused ? 3 : 2, fillOpacity: 0.95, opacity: 1 }}
    eventHandlers={onClose ? { popupclose: onClose } : undefined}>
    <Popup className="sismo-event-popup sismo-epicenter-popup" minWidth={180} maxWidth={340} autoPan>
      <div className="space-y-1 text-sm">
        <strong>{event.place || 'Ubicación no publicada'}</strong>
        <p className="flex items-center gap-2">Magnitud:
          <span aria-hidden="true" className="inline-block h-3 w-3 rounded-full border" style={{ backgroundColor: color, borderColor: color }} />
          {event.magnitude == null ? 'Sin dato' : `${event.magnitude.toFixed(1)} ${event.magnitude_type ?? ''}`}
        </p>
        <p>Profundidad: {event.depth_km == null ? 'Sin dato' : `${event.depth_km.toFixed(1)} km`}</p>
        <p>Latitud: {latitude.toFixed(5)} · Longitud: {longitude.toFixed(5)}</p>
        <p>Fecha/hora Perú: {peruDate(event.occurred_at, true)}</p>
        <p>Fuente: IGP/CENSIS</p>
        {liveFallback && <p>Reporte IGP en vivo, pendiente de confirmar su presencia en el catálogo sincronizado.</p>}
        {reportUrl && <a href={reportUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-accent hover:underline">Ver reporte específico IGP <ExternalLink size={12}/></a>}
      </div>
    </Popup>
  </CircleMarker>;
}

/** El código oficial permite emparejar los reportes en vivo con los persistidos. */
function asLiveFeature(event: IGPEvent): GeoFeature {
  return {
    type: 'Feature', id: `igp-live-${event.external_id}`,
    geometry: { type: 'Point', coordinates: [event.longitude, event.latitude] },
    properties: {
      external_id: event.external_id, occurred_at: event.occurred_at,
      magnitude: event.magnitude, magnitude_type: event.magnitude_type,
      depth_km: event.depth_km, place: event.place,
      source_url: event.source_url, source_name: event.source_name,
    },
  };
}

/** Lista de agrupaciones estable: la grilla solo depende de eventos y zoom.
 * Los círculos numerados abren un Popup real (pane superior de Leaflet),
 * mientras los epicentros individuales mantienen su ficha por clic.
 */
function ClusteredMarkers({ features, selectedId, dashboardTargetId, onSelect, onPopupClose }: {
  features: GeoFeature[];
  selectedId: string | null;
  dashboardTargetId: string | null;
  onSelect: (externalId: string) => void;
  onPopupClose: (externalId: string) => void;
}) {
  const map = useMap();
  const [zoom, setZoom] = useState(map.getZoom());
  const pendingFocus = useRef<(() => void) | null>(null);
  useMapEvents({ zoomend: () => setZoom(map.getZoom()) });

  // La grilla se calcula con píxeles globales, no con el origen de la vista.
  // Seleccionar un epicentro no cambia los integrantes ni los recuentos.
  const clusters = useMemo(() => clusterEpicenters(
    features,
    (latitude, longitude) => map.project([latitude, longitude], zoom),
    58,
  ), [features, map, zoom]);
  const selectedFeature = selectedId
    ? features.find(feature => feature.properties.external_id === selectedId)
    : undefined;
  const selectedInGroup = Boolean(selectedFeature && clusters.some(cluster =>
    cluster.events.length > 1 && cluster.events.some(event => event.id === selectedFeature.id)));

  useEffect(() => () => {
    // Evitar que un flyTo todavía activo seleccione un sismo tras desmontar.
    if (pendingFocus.current) map.off('moveend', pendingFocus.current);
  }, [map]);

  function selectEventFromGroup(feature: GeoFeature) {
    const [longitude, latitude] = feature.geometry.coordinates;
    const target = L.latLng(latitude, longitude);
    const focusZoom = Math.min(map.getMaxZoom(), Math.max(map.getZoom() + 3, 12));

    // Cerramos la lista y enfocamos por ID, jamás por cercanía de coordenadas.
    map.closePopup();
    if (pendingFocus.current) {
      map.off('moveend', pendingFocus.current);
      pendingFocus.current = null;
    }
    map.stop();

    const finish = () => {
      pendingFocus.current = null;
      onSelect(feature.properties.external_id);
    };
    // En zoom máximo o epicentros exactamente superpuestos no siempre hay
    // movimiento; en ese caso seleccionamos sin esperar un moveend inexistente.
    if (map.getZoom() === focusZoom && map.getCenter().distanceTo(target) < 1) {
      finish();
      return;
    }
    pendingFocus.current = finish;
    map.once('moveend', finish);
    map.flyTo(target, focusZoom, { duration: 0.6, animate: true });
  }

  return <>
    {clusters.map(cluster => cluster.events.length === 1
      ? <Epicenter key={cluster.key} feature={cluster.events[0]}
        focused={cluster.events[0].properties.external_id === selectedId}
        autoZoom={cluster.events[0].properties.external_id === dashboardTargetId}
        onClose={cluster.events[0].properties.external_id === selectedId
          ? () => onPopupClose(cluster.events[0].properties.external_id) : undefined}
        liveFallback={cluster.events[0].id.startsWith('igp-live-')} />
      : <CircleMarker key={cluster.key} center={[cluster.latitude, cluster.longitude]}
        radius={19} pathOptions={{ className: 'sismo-cluster-circle', color: '#155e75', fillColor: '#155e75', weight: 2, fillOpacity: 0.9 }}>
        {/* La etiqueta permanente solo muestra el número, nunca el resumen.
              Popup utiliza leaflet-popup-pane, por encima de tooltip-pane. */}
        <Tooltip permanent direction="center" opacity={1} className="sismo-cluster-label">
          <span className="sismo-cluster-count">{cluster.events.length}</span>
        </Tooltip>
        <Popup className="sismo-event-popup sismo-cluster-popup" minWidth={180} maxWidth={340} autoPan>
          <div className="sismo-cluster-detail"
            ref={node => { if (node) L.DomEvent.disableScrollPropagation(node); }}
            onWheel={event => event.stopPropagation()}
            aria-label={`Detalle de ${cluster.events.length} epicentros próximos`}>
            <strong className="sismo-cluster-title">{cluster.events.length} epicentros próximos</strong>
            <p className="sismo-cluster-description">Agrupación visual; no representa una zona de impacto.</p>
            <ul className="sismo-cluster-events" aria-label="Sismos del agrupamiento">
              {cluster.events.map(event => <li key={event.id}>
                <button type="button" className="sismo-cluster-event"
                  onClick={mouseEvent => { mouseEvent.stopPropagation(); selectEventFromGroup(event); }}>
                  <span aria-hidden="true" className="sismo-cluster-event-dot"
                    style={{ backgroundColor: magnitudeColor(event.properties.magnitude) }} />
                  <span>{peruDate(event.properties.occurred_at, true)} · M{event.properties.magnitude?.toFixed(1) ?? '—'}</span>
                </button>
              </li>)}
            </ul>
            <p className="sismo-cluster-help">Selecciona un evento para acercar el mapa y abrir sus detalles.</p>
          </div>
        </Popup>
      </CircleMarker>)}
    {/* El foco manual aparece a zoom de detalle. Al alejar por debajo de 12,
        se oculta para que ninguna marca extra tape el contador del grupo.
        Los enlaces desde Dashboard siguen mostrando siempre su sismo. */}
    {selectedFeature && selectedInGroup && (zoom >= 12 || selectedId === dashboardTargetId) && <Epicenter key={`selected:${selectedFeature.id}`}
      feature={selectedFeature} focused autoZoom={selectedId === dashboardTargetId}
      liveFallback={selectedFeature.id.startsWith('igp-live-')}
      onClose={() => onPopupClose(selectedFeature.properties.external_id)} />}
  </>;
}

/** Semáforo fijo por magnitud; no utiliza colores dinámicos del tema UI. */
function MagnitudeLegend() {
  const entries = [
    { label: 'M < 4.5', color: MAGNITUDE_COLORS.low },
    { label: 'M 4.5–5.9', color: MAGNITUDE_COLORS.medium },
    { label: 'M > 5.9', color: MAGNITUDE_COLORS.high },
    { label: 'Sin dato', color: MAGNITUDE_COLORS.unknown },
  ];
  return <div className="border-b border-border-ui bg-panel-alt px-4 py-3 text-xs text-main" aria-label="Leyenda de magnitudes observadas">
    <p className="mb-2 font-semibold">Leyenda por magnitud</p>
    <div className="flex flex-wrap gap-x-5 gap-y-2">
      {entries.map(entry => <div key={entry.label} className="flex items-center gap-2">
        <span className="inline-block h-4 w-4 shrink-0 rounded-full border-2"
          style={{ backgroundColor: entry.color, borderColor: entry.color }} />
        <span>{entry.label}</span>
      </div>)}
    </div>
    <p className="mt-2 text-[10px] text-muted">Los colores identifican rangos de magnitud, no daños o intensidad. Los círculos numerados indican cantidad de epicentros.</p>
  </div>;
}

/** Nombre de capa activa de Leaflet; OpenStreetMap solo proporciona el fondo. */
function ActiveLayerTracker({ onChange }: { onChange: (name: string) => void }) {
  useMapEvents({ baselayerchange: event => onChange(event.name) });
  return null;
}

/** Libera el foco inicial cuando la persona empieza a explorar el mapa.
 * Se usan eventos reales del usuario, no `zoomstart` / `moveend`, porque
 * setView/flyTo del propio mapa también emiten esos eventos programáticamente.
 * Las interacciones dentro del popup se dejan a `popupclose` (botón X).
 */
function ReleaseFocusOnInteraction({ active, onRelease }: {
  active: boolean;
  onRelease: () => void;
}) {
  const map = useMap();
  const current = useRef({ active, onRelease });
  useEffect(() => { current.current = { active, onRelease }; }, [active, onRelease]);

  useEffect(() => {
    const container = map.getContainer();
    const release = () => {
      if (!current.current.active) return;
      // Una rueda o gesto táctil puede disparar varios eventos seguidos.
      current.current.active = false;
      current.current.onRelease();
    };
    const onPointerDown = (event: PointerEvent) => {
      // No interrumpir enlaces ni controles de la ficha abierta; X genera popupclose.
      if (event.target instanceof Element && event.target.closest('.leaflet-popup')) return;
      release();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      // Zoom y desplazamiento mediante teclado (incluido Escape).
      if (['+', '=', '-', '_', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Escape'].includes(event.key)) release();
    };
    // Captura: los controles de zoom de Leaflet detienen la propagación del clic.
    container.addEventListener('pointerdown', onPointerDown, true);
    container.addEventListener('wheel', release, { capture: true, passive: true });
    container.addEventListener('keydown', onKeyDown, true);
    return () => {
      container.removeEventListener('pointerdown', onPointerDown, true);
      container.removeEventListener('wheel', release, true);
      container.removeEventListener('keydown', onKeyDown, true);
    };
  }, [map]);
  return null;
}

/** Mosaicos raster de MapTiler para Leaflet.
 * La clave es PUBLICA y se restringe por origen HTTP en MapTiler.
 * Si no existe, OpenStreetMap y la capa sin fondo siguen disponibles.
 * No usar mosaicos de Google Maps sin su API/licencia oficial.
 */
const MAPTILER_KEY = String(import.meta.env.VITE_MAPTILER_KEY ?? '').trim();
const MAPTILER_ATTRIBUTION =
  '<a href="https://www.maptiler.com/copyright/" target="_blank" rel="noopener noreferrer">&copy; MapTiler</a> ' +
  '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">&copy; OpenStreetMap contributors</a>';

/** Una sola URL de mapas para los estilos opcionales claro/oscuro/satelital. */
function mapTilerRaster(style: 'dataviz-light' | 'dataviz-dark' | 'satellite-v4', extension: 'png' | 'jpg'): string {
  return `https://api.maptiler.com/maps/${style}/256/{z}/{x}/{y}.${extension}?key=${encodeURIComponent(MAPTILER_KEY)}`;
}

function localDateTime(utc: string | null): string {
  if (!utc || Number.isNaN(Date.parse(utc))) return 'No disponible';
  return new Date(utc).toLocaleString('es-PE', {
    timeZone: 'America/Lima', dateStyle: 'short', timeStyle: 'short',
  });
}

export default function Page() {
  const { filters, revision, refresh } = useAnalyticsFilters();
  const effectiveFilters = useMemo(() => withCurrentPeruMonth(filters), [filters, revision]);
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const targetId = params.get('igp_event');
  const igpTarget = useIGPFeed('recent', Boolean(targetId));
  const [dataset, setDataset] = useState<GeoDataset | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [layerName, setLayerName] = useState('OpenStreetMap');
  const [department, setDepartment] = useState('');
  const [boundary, setBoundary] = useState<DepartmentBoundary | null>(null);
  const [boundaryError, setBoundaryError] = useState('');
  const [loadingBoundary, setLoadingBoundary] = useState(false);
  const departmentName = PERU_DEPARTMENTS.find(([code]) => code === department)?.[1];
  // Obtiene la geometría referencial desde el snapshot local del backend.
  // Si falta cartografía válida, no reemplazamos el polígono por un rectángulo.
  useEffect(() => {
    const controller = new AbortController();
    setBoundary(null); setBoundaryError('');
    if (!department) { setLoadingBoundary(false); return () => controller.abort(); }
    setLoadingBoundary(true);
    getDepartmentBoundary(department, controller.signal)
      .then(value => {
        // Verifica que el servicio tenga coordenadas utilizables antes de mostrarlas.
        departmentBounds(value);
        if (!controller.signal.aborted) setBoundary(value);
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setBoundaryError(reason instanceof Error ? reason.message : 'Error de límites');
      })
      .finally(() => { if (!controller.signal.aborted) setLoadingBoundary(false); });
    return () => controller.abort();
  }, [department]);
  // Reducir el universo consultado con una caja de SQL, luego recortar por el
  // polígono auténtico, con islas y huecos, antes de dibujar los puntos.
  const departmentQueryFilters = useMemo(() => {
    if (!department || !boundary || boundary.department !== department) return effectiveFilters;
    // Un departamento sustituye otros recortes geográficos; jamás enviar
    // radio + rectángulo simultáneamente al backend (sería HTTP 422).
    const { min_lat: _a, max_lat: _b, min_lon: _c, max_lon: _d,
      center_lat: _e, center_lon: _f, radius_km: _g, ...otherFilters } = effectiveFilters;
    void [_a, _b, _c, _d, _e, _f, _g];
    return { ...otherFilters, ...departmentBounds(boundary) };
  }, [effectiveFilters, department, boundary]);
  const [lastConsultation, setLastConsultation] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [manualFocusId, setManualFocusId] = useState<string | null>(null);
  const [accessiblePage, setAccessiblePage] = useState(1);
  const selectedId = manualFocusId ?? targetId;
  // Mantener el ID vigente incluso durante cierres de popups disparados por Leaflet.
  // Así, cerrar una ficha antigua no cancela la nueva selección del usuario.
  const selectedIdRef = useRef<string | null>(selectedId);
  useEffect(() => { selectedIdRef.current = selectedId; }, [selectedId]);
  const previousTargetRef = useRef(targetId);
  const isRadial = effectiveFilters.radius_km != null && effectiveFilters.center_lat != null && effectiveFilters.center_lon != null;
  const isRectangular = effectiveFilters.min_lat != null && effectiveFilters.max_lat != null
    && effectiveFilters.min_lon != null && effectiveFilters.max_lon != null;

  // La hora del proveedor no está disponible como SLA: mostramos ingesta real.
  useEffect(() => {
    const controller = new AbortController();
    getDashboardOperations(controller.signal)
      .then(data => { if (!controller.signal.aborted) setLastSync(data.last_success_at); })
      .catch(() => { if (!controller.signal.aborted) setLastSync(null); });
    return () => controller.abort();
  }, [revision]);

  // Una sola fuente visible: catálogo IGP persistido y filtrado por mes peruano.
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(''); setDataset(null);
    if (department && (!boundary || boundary.department !== department)) {
      setLoading(false);
      return () => controller.abort();
    }
    getMapEvents(departmentQueryFilters, controller.signal)
      .then(data => { if (!controller.signal.aborted) { setDataset(data); setLastConsultation(new Date().toISOString()); } })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'No se pudo consultar el mapa');
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [departmentQueryFilters, revision, department, boundary]);

  // react-router conserva el reporte pulsado durante la transición. Si el IGP
  // cambia su listado reciente durante la navegación, ese dato sigue disponible.
  const selectedLive = useMemo(() => {
    const candidate = (location.state as { igpReport?: IGPEvent } | null)?.igpReport;
    if (candidate && candidate.external_id === targetId && Number.isFinite(candidate.latitude) && Number.isFinite(candidate.longitude)) return candidate;
    return (igpTarget.data?.items ?? []).find(item => item.external_id === targetId && Number.isFinite(item.latitude) && Number.isFinite(item.longitude));
  }, [location.state, igpTarget.data, targetId]);
  // Conjunto estable para el autoencuadre: no depende del ID seleccionado.
  // Abrir/cerrar fichas o volver desde el Dashboard no puede reajustar el zoom.
  const catalogFeatures = useMemo(() => (dataset?.features ?? []).filter(feature =>
    Number.isFinite(feature.geometry.coordinates[0]) &&
    Number.isFinite(feature.geometry.coordinates[1]) &&
    matchesPeruPeriod(feature.properties.occurred_at, effectiveFilters) &&
    (!department || (boundary !== null && pointInDepartment(feature.geometry.coordinates, boundary)))),
    [dataset, effectiveFilters, department, boundary]);
  const { features, fallback, displayedCatalog } = useMemo(() => {
    const exists = Boolean(targetId && catalogFeatures.some(feature => feature.properties.external_id === targetId));
    // El enlace IGP en vivo no modifica el conjunto usado para autoencuadrar.
    const extra = targetId && !exists && selectedLive ? [asLiveFeature(selectedLive)] : [];
    return { features: [...catalogFeatures, ...extra], fallback: extra.length > 0, displayedCatalog: catalogFeatures.length };
  }, [catalogFeatures, targetId, selectedLive]);
  const focused = Boolean(selectedId && features.some(feature => feature.properties.external_id === selectedId));
  const listPageSize = 18;
  const totalAccessiblePages = Math.max(1, Math.ceil(features.length / listPageSize));
  const accessibleFeatures = features.slice((accessiblePage - 1) * listPageSize, accessiblePage * listPageSize);
  useEffect(() => setAccessiblePage(1), [effectiveFilters, dataset]);
  // Reiniciar un foco manual solamente al recibir OTRO enlace entrante.
  // Al borrar igp_event no debemos anular una nueva selección del mapa.
  useEffect(() => {
    if (targetId && previousTargetRef.current !== targetId) {
      selectedIdRef.current = targetId;
      setManualFocusId(null);
    }
    previousTargetRef.current = targetId;
  }, [targetId]);
  const unresolved = Boolean(targetId && !focused && !loading && !igpTarget.loading);

  /** Retira el ID de la URL; evita que el popup anterior reaparezca al navegar. */
  function removeUrlTarget() {
    if (!targetId) return;
    const next = new URLSearchParams(params);
    next.delete('igp_event');
    setParams(next, { replace: true });
  }

  function clearFocus() {
    selectedIdRef.current = null;
    setManualFocusId(null);
    removeUrlTarget();
  }

  /** El popupclose de un epicentro viejo no debe cerrar el nuevo. */
  function handlePopupClose(externalId: string) {
    if (selectedIdRef.current === externalId) clearFocus();
  }

  /** Una nueva elección sustituye al destino que venía en el enlace. */
  function selectEpicenter(externalId: string) {
    selectedIdRef.current = externalId;
    setManualFocusId(externalId);
    removeUrlTarget();
  }

  return <div className="space-y-5">
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-3xl font-bold text-main">Mapa sísmico</h1>
        <p className="mt-1 text-sm text-muted">Mes actual de Perú por defecto. Cambia el período o la zona desde los mismos filtros del Dashboard.</p>
      </div>
      <FilterBar currentMonthDefault departmentSelection={{ value: department, onChange: setDepartment }} />
    </header>

    {boundaryError && <p role="alert" className="rounded-lg border border-rose-400 p-3 text-sm text-rose-600 dark:text-rose-300">
      {boundaryError}. No se aplicará un filtro departamental aproximado. Prueba otra vez o utiliza el filtro por radio.
    </p>}
    {error && <p role="alert" className="rounded-lg border border-rose-400 p-3 text-sm text-rose-600 dark:text-rose-300">{error}. Comprueba FastAPI y Supabase.</p>}
    {targetId && <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border-ui bg-panel-alt p-3 text-sm text-main">
      <div>
        <strong>Epicentro seleccionado: {targetId}</strong>
        {focused && <p className="mt-1 text-xs text-muted">Se ha centrado el mapa y abierto su ficha automáticamente.{fallback ? ' El reporte en vivo todavía no aparece entre los puntos consultados.' : ''}</p>}
        {igpTarget.loading && !focused && <LoadingSpinner variant="inline" size="sm" label="Localizando reporte en IGP…" className="mt-1" />}
        {unresolved && <p role="status" className="mt-1 text-xs text-muted">No se encontró este ID en el catálogo filtrado ni en los reportes recientes del IGP. Prueba ampliar las fechas o actualizar la fuente.</p>}
      </div>
      <button type="button" onClick={clearFocus} className="inline-flex items-center gap-1.5 rounded-lg border border-border-ui bg-panel px-3 py-2 text-xs font-medium text-main hover:bg-page"><X size={14} /> Quitar selección</button>
    </div>}

    {department && <p className="rounded-lg border border-border-ui bg-panel-alt p-3 text-sm text-main">
      Departamento: <strong>{departmentName}</strong> · {loadingBoundary ? 'Consultando límites referenciales…' : boundary ? 'Filtro por polígono administrativo referencial aplicado' : 'Esperando límites'}.
      {' '}Solo se consideran epicentros situados dentro del polígono terrestre; un sismo frente a la costa puede quedar fuera.
    </p>}
    <p role="status" className="flex flex-wrap items-center gap-2 text-xs text-muted">
      <span className="rounded-md border border-border-ui bg-panel px-2.5 py-1.5 text-main">
        Período IGP: {civilDate(effectiveFilters.start_time)} – {civilDate(effectiveFilters.end_time)} (Perú)
      </span>
      <span>«Limpiar» en los filtros restablece el mes actual.</span>
    </p>

    <section aria-label="Mapa y filtros aplicados" className="flex flex-col gap-4 xl:flex-row">
      <article className="min-w-0 flex-1 overflow-hidden rounded-2xl border border-border-ui bg-panel shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-ui p-4">
          <div>
            <h2 className="flex items-center gap-2 font-semibold text-main"><MapPin size={17} className="text-accent" /> Epicentros IGP/CENSIS</h2>
            <p className="mt-1 text-xs text-muted">Catálogo sincronizado · Fecha civil de Perú · Fuente exclusiva IGP</p>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted">
            {loadingBoundary ? 'Consultando límite…' : loading ? 'Consultando…' : department ? `${displayedCatalog} epicentros dentro de ${departmentName ?? department}` : `${displayedCatalog} de ${dataset?.total ?? 0} eventos del período`}
            <button type="button" onClick={() => { refresh(); if (targetId) igpTarget.refresh(); }}
              className="inline-flex items-center gap-1 rounded-lg border border-border-ui px-2 py-1.5 text-main hover:bg-panel-alt" aria-label="Actualizar mapa IGP"><RefreshCw size={13} /> Actualizar</button>
          </div>
        </div>
        {department && dataset?.truncated && <p role="status" className="border-b border-border-ui bg-panel-alt px-4 py-2 text-sm text-main">El área del departamento devuelve más de 1.000 eventos en el período; acota las fechas para obtener un recorte completo.</p>}
        {dataset?.truncated && <p className="border-b border-border-ui bg-panel-alt px-4 py-2 text-sm text-main">Se muestran los {dataset.returned} epicentros más recientes del período; ajusta los filtros para consultar otros.</p>}
        {fallback && <p className="border-b border-border-ui bg-panel-alt px-4 py-2 text-xs text-main">El punto seleccionado procede de IGP en vivo y no se agrega al recuento del catálogo mensual. Si está fuera del período filtrado, solo se muestra por haberlo seleccionado explícitamente.</p>}
        {/* Las capas de Leaflet pueden usar z-index >= 1000. Aislarlas dentro de
            esta superficie impide que tapen el modal compartido y el sidebar móvil. */}
        <div className="relative isolate z-0 h-[540px] w-full bg-panel-alt">
          <MapContainer center={[-9.19, -75]} zoom={5} scrollWheelZoom={true} wheelDebounceTime={65}
            className="sismo-leaflet-map relative isolate z-0 h-full w-full"
            style={{ height: '100%', width: '100%', isolation: 'isolate', zIndex: 0, background: 'var(--ui-panel-alt)' }}>
            <LayersControl position="topright">
              <LayersControl.BaseLayer checked name="OpenStreetMap">
                <TileLayer className="sismo-base-tiles" url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>' maxZoom={17} />
              </LayersControl.BaseLayer>
              {/* MapTiler utiliza los mismos datos IGP y capas Leaflet existentes;
                  únicamente cambia el fondo. La clave debe estar autorizada para
                  localhost y el dominio de Vercel antes de activar estos estilos. */}
              {MAPTILER_KEY && <LayersControl.BaseLayer name="Claro (MapTiler)">
                <TileLayer className="sismo-base-tiles" url={mapTilerRaster('dataviz-light', 'png')}
                  attribution={MAPTILER_ATTRIBUTION} maxZoom={19} />
              </LayersControl.BaseLayer>}
              {MAPTILER_KEY && <LayersControl.BaseLayer name="Oscuro (MapTiler)">
                <TileLayer className="sismo-base-tiles" url={mapTilerRaster('dataviz-dark', 'png')}
                  attribution={MAPTILER_ATTRIBUTION} maxZoom={19} />
              </LayersControl.BaseLayer>}
              {MAPTILER_KEY && <LayersControl.BaseLayer name="Satélite (MapTiler)">
                <TileLayer className="sismo-base-tiles" url={mapTilerRaster('satellite-v4', 'jpg')}
                  attribution={MAPTILER_ATTRIBUTION} maxZoom={19} />
              </LayersControl.BaseLayer>}
              <LayersControl.BaseLayer name="Sin mapa base">
                <LayerGroup />
              </LayersControl.BaseLayer>
            </LayersControl>
            <ActiveLayerTracker onChange={setLayerName} />
            <ReleaseFocusOnInteraction active={Boolean(selectedId)} onRelease={clearFocus} />
            {boundary && department && boundary.department === department && boundary.features.flatMap((feature, fi) => {
              const polygons = feature.geometry.type === 'Polygon'
                ? [feature.geometry.coordinates] : feature.geometry.coordinates;
              return polygons.map((polygon, pi) => <Polygon key={`department-${fi}-${pi}`}
                positions={polygon.map(ring => ring.map(([lon, lat]) => [lat, lon] as [number, number]))}
                pathOptions={{ color: '#0891b2', weight: 2, dashArray: '5 4', fillOpacity: 0.03 }} />);
            })}
            {isRadial && <Circle center={[effectiveFilters.center_lat!, effectiveFilters.center_lon!]}
              radius={effectiveFilters.radius_km! * 1000}
              pathOptions={{ color: '#0891b2', weight: 2, dashArray: '6 5', fillOpacity: 0.04 }} />}
            {isRectangular && <Rectangle
              bounds={[[effectiveFilters.min_lat!, effectiveFilters.min_lon!], [effectiveFilters.max_lat!, effectiveFilters.max_lon!]]}
              pathOptions={{ color: '#0891b2', weight: 2, dashArray: '6 5', fillOpacity: 0.04 }} />}
            <FitMarkers features={catalogFeatures} focused={focused} loading={loading}
              defaultCenter={isRadial ? [effectiveFilters.center_lat!, effectiveFilters.center_lon!] : undefined}
              defaultBounds={department && boundary ? (() => {
                const bounds = departmentBounds(boundary);
                return [[bounds.min_lat, bounds.min_lon], [bounds.max_lat, bounds.max_lon]] as [[number, number], [number, number]];
              })() : isRectangular ? [
                [effectiveFilters.min_lat!, effectiveFilters.min_lon!],
                [effectiveFilters.max_lat!, effectiveFilters.max_lon!],
              ] : undefined} />
            <ClusteredMarkers features={features} selectedId={selectedId} dashboardTargetId={targetId}
              onSelect={selectEpicenter} onPopupClose={handlePopupClose} />
          </MapContainer>
          {/* El plan Free de MapTiler exige, además de la atribución de Leaflet,
              un logotipo enlazado mientras se utilice cualquiera de sus capas. */}
          {MAPTILER_KEY && layerName.endsWith('(MapTiler)') &&
            <a className="absolute bottom-6 left-2 z-[500] inline-flex rounded-sm bg-white/90 px-1 py-0.5 shadow-sm"
              href="https://www.maptiler.com" target="_blank" rel="noopener noreferrer"
              aria-label="MapTiler — proveedor del mapa base">
              <img src="https://api.maptiler.com/resources/logo.svg" alt="MapTiler"
                className="h-5 w-auto max-w-[100px]" loading="lazy" />
            </a>}
          {(loading || loadingBoundary) && !error && !boundaryError && <LoadingSpinner variant="overlay" label="Cargando epicentros…" />}
          {!loading && features.length === 0 && !error && !boundaryError && !loadingBoundary && <div className="pointer-events-none absolute left-1/2 top-4 z-10 w-max max-w-[90%] -translate-x-1/2 rounded-lg bg-panel p-3 text-center text-sm text-main shadow-lg">No hay epicentros para los filtros actuales.</div>}
        </div>
        <MagnitudeLegend />
        <div className="flex flex-wrap items-center gap-4 px-4 py-3 text-xs text-muted">
          <span className="inline-flex items-center gap-1"><Layers size={13} /> Capa activa: {layerName}</span>
          {!MAPTILER_KEY && <span className="text-muted" title="Configura VITE_MAPTILER_KEY para activar Claro, Oscuro y Satélite">
            Estilos opcionales: configura MapTiler para habilitar claro, oscuro y satélite.
          </span>}
          <span className="inline-flex items-center gap-1"><CalendarClock size={13} /> Consulta: {localDateTime(lastConsultation)}</span>
          <span>Última ingesta IGP: {localDateTime(lastSync)}</span>
          <span>El color indica el rango de magnitud, no el peligro ni la intensidad; el tamaño es secundario.</span>
          <span>Grupos numerados: clic o toque para abrir la lista; seleccionar un evento acerca el mapa.</span>
          <span>Rueda sobre el mapa: zoom · Fuera del mapa: desplazamiento de página.</span>
          <span>Solo epicentros, sin zonas estimadas de impacto.</span>
          <a href={IGP_OFFICIAL_URL} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">Fuente oficial IGP</a>
        </div>
      </article>
      <AppliedFiltersAside filters={effectiveFilters} sampleSize={department ? displayedCatalog : dataset?.total}
        lastSync={lastSync} geoDescription={department ? `${departmentName} (límite referencial; epicentros terrestres)` : undefined} />
    </section>
    <details className="rounded-xl border border-border-ui bg-panel p-4 text-main">
      <summary className="flex cursor-pointer items-center gap-2 text-sm font-semibold"><List size={16} /> Lista accesible de epicentros ({features.length})</summary>
      <p className="mt-2 text-xs text-muted">Selecciona un evento para centrar el mapa y abrir la misma ficha de detalles. Los registros se presentan por fecha.</p>
      <ol className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {accessibleFeatures.map(feature => <li key={feature.id}>
          <button type="button" onClick={() => selectEpicenter(feature.properties.external_id)}
            className="w-full rounded-lg border border-border-ui bg-panel-alt p-2 text-left text-xs text-main hover:border-accent focus-visible:outline-2 focus-visible:outline-accent">
            <span className="block font-semibold">M{feature.properties.magnitude?.toFixed(1) ?? '—'} · {peruDate(feature.properties.occurred_at, true)}</span>
            <span className="mt-1 block text-muted">{feature.properties.place || 'Sin ubicación publicada'}</span>
          </button>
        </li>)}
      </ol>
      {accessibleFeatures.length === 0 && <p className="mt-2 text-sm text-muted">No hay registros en el período seleccionado.</p>}
      {features.length > 0 && <nav aria-label="Páginas de epicentros" className="mt-3 flex items-center justify-between gap-2 text-xs">
        <button type="button" disabled={accessiblePage === 1}
          onClick={() => setAccessiblePage(n => Math.max(1, n - 1))}
          className="rounded-lg border border-border-ui px-3 py-2 disabled:opacity-40">Anterior</button>
        <span>Página {accessiblePage} de {totalAccessiblePages}</span>
        <button type="button" disabled={accessiblePage >= totalAccessiblePages}
          onClick={() => setAccessiblePage(n => Math.min(totalAccessiblePages, n + 1))}
          className="rounded-lg border border-border-ui px-3 py-2 disabled:opacity-40">Siguiente</button>
      </nav>}
    </details>
  </div>;
}
