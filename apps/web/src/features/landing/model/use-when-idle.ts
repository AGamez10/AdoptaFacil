import { useEffect, useState } from 'react';

/**
 * `true` cuando la página ya cargó y el navegador quedó libre (o tras
 * `fallbackMs` donde no existe `requestIdleCallback`, p. ej. Safari). Sirve
 * para pedir de antemano datos pequeños de secciones de más abajo: si llegan
 * antes de que la persona baje, la sección aparece completa y no empuja el
 * contenido mientras se lee (CLS).
 */
export function useWhenIdle(fallbackMs = 1500): boolean {
  const [idle, setIdle] = useState(false);
  useEffect(() => {
    const w = window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    if (typeof w.requestIdleCallback === 'function') {
      const id = w.requestIdleCallback(() => setIdle(true), { timeout: fallbackMs * 2 });
      return () => w.cancelIdleCallback?.(id);
    }
    const timer = window.setTimeout(() => setIdle(true), fallbackMs);
    return () => window.clearTimeout(timer);
  }, [fallbackMs]);
  return idle;
}
