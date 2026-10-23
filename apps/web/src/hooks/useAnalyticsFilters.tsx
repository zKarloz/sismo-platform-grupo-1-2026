/** Filtros compartidos: AppLayout preserva el estado entre dashboard, mapa y análisis. */
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import type { AnalyticsFilters } from '../types/analytics';

interface AnalyticsContextValue {
  filters: AnalyticsFilters;
  setFilters: (next: AnalyticsFilters) => void;
  revision: number;
  refresh: () => void;
}

const AnalyticsContext = createContext<AnalyticsContextValue | undefined>(undefined);

export function AnalyticsProvider({ children }: { children: ReactNode }) {
  const [filters, setFilters] = useState<AnalyticsFilters>({ source: 'USGS' });
  const [revision, setRevision] = useState(0);
  const value = useMemo(() => ({ filters, setFilters, revision, refresh: () => setRevision(n => n + 1) }), [filters, revision]);
  return <AnalyticsContext.Provider value={value}>{children}</AnalyticsContext.Provider>;
}

export function useAnalyticsFilters(): AnalyticsContextValue {
  const context = useContext(AnalyticsContext);
  if (!context) throw new Error('AnalyticsProvider debe envolver el módulo');
  return context;
}
