/** Consulta al IGP al abrir la vista y cada 5 minutos mientras siga montada.
 * FastAPI dispone de caché propia (120 s); el refresco del navegador no implica
 * nuevos eventos ni publicación instantánea en la fuente oficial.
 */
import { useCallback, useEffect, useState } from 'react';
import { getIGPFeed } from '../services/igp';
import type { IGPFeed, IGPFeedKind } from '../types/igp';

export function useIGPFeed(feed: IGPFeedKind, enabled = true) {
  const [data, setData] = useState<IGPFeed | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision(value => value + 1), []);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    setLoading(true);
    setError('');
    getIGPFeed(feed, controller.signal)
      .then(result => { if (!controller.signal.aborted) setData(result); })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) {
          setData(null); // No mostrar registros antiguos como si fueran actuales.
          setError(cause instanceof Error ? cause.message : 'IGP no disponible');
        }
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [feed, enabled, revision]);

  useEffect(() => {
    if (!enabled) return;
    const timer = window.setInterval(refresh, 5 * 60_000);
    // Al regresar a la pestaña, solicitar información nuevamente.
    const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [enabled, refresh]);

  return { data, loading, error, refresh };
}
