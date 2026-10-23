/** Hook con estado explícito: comprobando, disponible, no disponible. */
import { useEffect, useState } from 'react';
import { getApiHealth } from '../services/health';

export type HealthStatus = 'checking' | 'online' | 'offline';

export function useApiHealth() {
  const [status, setStatus] = useState<HealthStatus>('checking');
  useEffect(() => {
    const controller = new AbortController();
    getApiHealth(controller.signal)
      .then(() => { if (!controller.signal.aborted) setStatus('online'); })
      .catch(() => { if (!controller.signal.aborted) setStatus('offline'); });
    return () => controller.abort();
  }, []);
  return status;
}
