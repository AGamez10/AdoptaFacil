import { useEffect } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';

/**
 * Enlaces profundos de los avisos: `?foco=<id>` lleva a la pantalla donde se
 * atiende y resalta ESE ítem (la oferta, las horas, la donación…). Cada
 * pantalla marca sus filas con `data-foco="<id>"`; las que necesitan abrir algo
 * antes (p. ej. "Ver horas") leen además su propio parámetro.
 */
export const FOCUS_PARAM = 'foco';

/** Atributo que marca una fila como destino posible de `?foco=`. */
export const focusAttr = (id: string): { 'data-foco': string } => ({ 'data-foco': id });

/** El id que el aviso pidió enfocar, o null. */
export function useFocusParam(name: string = FOCUS_PARAM): string | null {
  const [params] = useSearchParams();
  const value = params.get(name);
  return value && /^[A-Za-z0-9_-]{1,80}$/.test(value) ? value : null;
}

const WAIT_MS = 10_000;
const HIGHLIGHT_MS = 4_000;

/**
 * Montado una vez en el encabezado: cuando la URL trae `?foco=`, espera a que la
 * fila aparezca (las pantallas cargan datos), la lleva al centro y la resalta
 * unos segundos. Sin la fila (ya no existe o el rol no la ve) no hace nada.
 */
export function FocusScroller() {
  const location = useLocation();
  const focusId = useFocusParam();

  useEffect(() => {
    if (!focusId || typeof document === 'undefined') return;
    const selector = `[data-foco="${focusId}"]`;
    let done = false;
    let clearTimer: number | undefined;

    const tryFocus = (): boolean => {
      const element = document.querySelector<HTMLElement>(selector);
      if (!element) return false;
      done = true;
      element.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
      element.setAttribute('data-foco-activo', '');
      clearTimer = window.setTimeout(
        () => element.removeAttribute('data-foco-activo'),
        HIGHLIGHT_MS,
      );
      return true;
    };

    if (tryFocus()) return () => window.clearTimeout(clearTimer);
    const observer = new MutationObserver(() => {
      if (!done && tryFocus()) observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    const giveUp = window.setTimeout(() => observer.disconnect(), WAIT_MS);
    return () => {
      observer.disconnect();
      window.clearTimeout(giveUp);
      window.clearTimeout(clearTimer);
    };
  }, [focusId, location.pathname]);

  return null;
}
