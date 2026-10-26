/** Gráficas descriptivas reutilizables; color principal tomado del tema semántico. */
import {
  Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer,
  Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis,
} from 'recharts';
import type { MagnitudeDistribution, ScatterDataset, TimeSeries } from '../../types/analytics';

const accent = 'var(--ui-accent)';
const muted = 'var(--ui-muted)';
const grid = 'var(--ui-border)';
const tooltipStyle = { backgroundColor: 'var(--ui-panel)', border: '1px solid var(--ui-border)', color: 'var(--ui-main)', borderRadius: 10, boxShadow: '0 8px 28px rgb(0 0 0 / 0.22)' };
const tooltipItemStyle = { color: 'var(--ui-main)' };
const tooltipLabelStyle = { color: 'var(--ui-main)', fontWeight: 600 };

function Empty({ text }: { text: string }) {
  return <div className="flex h-64 items-center justify-center rounded-xl border border-dashed border-border-ui text-center text-sm text-muted">{text}</div>;
}

export function SeriesChart({ data }: { data: TimeSeries | null }) {
  if (!data?.items.length) return <Empty text="No hay eventos para construir la serie temporal." />;
  return <div className="h-72 w-full" aria-label="Gráfico de eventos a lo largo del tiempo">
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data.items} margin={{ top: 12, right: 14, bottom: 8, left: -18 }}>
        <CartesianGrid stroke={grid} strokeDasharray="3 3" vertical={false}/>
        <XAxis dataKey="period" stroke={muted} tick={{ fontSize: 11 }} minTickGap={25}/>
        <YAxis allowDecimals={false} stroke={muted} tick={{ fontSize: 11 }} />
        <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} cursor={{ stroke: 'var(--ui-border)' }} formatter={(value) => [value, 'Eventos']} />
        <Line type="monotone" dataKey="count" name="Eventos" stroke={accent} strokeWidth={2.5} dot={data.items.length <= 25} activeDot={{ r: 5 }} />
      </LineChart>
    </ResponsiveContainer>
  </div>;
}

export function MagnitudesChart({ data }: { data: MagnitudeDistribution | null }) {
  if (!data?.total) return <Empty text="No hay eventos para calcular la distribución." />;
  return <div className="h-72 w-full" aria-label="Histograma de magnitudes">
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data.items} margin={{ top: 12, right: 10, bottom: 8, left: -18 }}>
        <CartesianGrid stroke={grid} strokeDasharray="3 3" vertical={false}/>
        <XAxis dataKey="range" stroke={muted} tick={{ fontSize: 11 }}/>
        <YAxis stroke={muted} tick={{ fontSize: 11 }} allowDecimals={false}/>
        <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} cursor={{ fill: 'var(--ui-panel-alt)', fillOpacity: 0.8 }} formatter={(value) => [value, 'Eventos']} />
        <Bar dataKey="count" fill={accent} radius={[4, 4, 0, 0]} maxBarSize={55}/>
      </BarChart>
    </ResponsiveContainer>
  </div>;
}

export function DepthScatterChart({ data }: { data: ScatterDataset | null }) {
  if (!data?.items.length) return <Empty text="No existen registros con magnitud y profundidad disponibles." />;
  return <div className="h-80 w-full" aria-label="Diagrama de dispersión de profundidad y magnitud">
    <ResponsiveContainer width="100%" height="100%">
      <ScatterChart margin={{ top: 16, right: 20, bottom: 14, left: 0 }}>
        <CartesianGrid stroke={grid} strokeDasharray="3 3" />
        <XAxis type="number" dataKey="depth_km" name="Profundidad" unit=" km" stroke={muted} tick={{ fontSize: 11 }} />
        <YAxis type="number" dataKey="magnitude" name="Magnitud" stroke={muted} tick={{ fontSize: 11 }} width={35}/>
        <ZAxis range={[50, 50]}/>
        <Tooltip cursor={{ strokeDasharray: '3 3' }} contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle}/>
        <Scatter data={data.items} fill={accent}/>
      </ScatterChart>
    </ResponsiveContainer>
  </div>;
}
