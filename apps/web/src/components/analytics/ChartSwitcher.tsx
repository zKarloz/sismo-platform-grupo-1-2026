/** Selector de una sola visualización; patrón compartido para módulos analíticos. */
export type ChartChoice<T extends string> = { id: T; label: string };

type Props<T extends string> = {
  choices: readonly ChartChoice<T>[];
  value: T;
  onChange: (value: T) => void;
};

export default function ChartSwitcher<T extends string>({ choices, value, onChange }: Props<T>) {
  return <label className="flex flex-wrap items-center gap-2 text-sm text-muted">
    <span className="font-medium">Visualización</span>
    <select aria-label="Seleccionar gráfico" value={value}
      onChange={event => onChange(event.target.value as T)}
      className="min-w-48 rounded-lg border border-border-ui bg-page px-3 py-2 text-sm font-medium text-main outline-offset-2 focus-visible:outline-2 focus-visible:outline-accent">
      {choices.map(choice => <option key={choice.id} value={choice.id}>{choice.label}</option>)}
    </select>
  </label>;
}
