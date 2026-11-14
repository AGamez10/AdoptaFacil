import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';

/** Parámetro de la URL con el que un aviso apunta a UN elemento de la pantalla. */
export const FOCUS_PARAM = 'foco';

const HIGHLIGHT_CLASSES = ['ring-2', 'ring-primary', 'ring-offset-2', 'rounded-md'];
const HIGHLIGHT_MS = 4000;

/**
 * Llegar desde un aviso ("Ver →") directo a lo que hay que atender: si la URL
 * trae `?foco=<id>`, cuando la lista ya cargó (`ready`) se desplaza hasta el
 * elemento marcado con `data-focus-id="<id>"` y lo resalta unos segundos.
 * Devuelve el id apuntado para que la pantalla pueda, además, abrir ese
 * elemento (por ejemplo desplegar las horas por aprobar).
 */
export function useFocusTarget(ready: boolean): string | null {
  const [params] = useSearchParams();
  const target = params.get(FOCUS_PARAM);
  useEffect(() => {
    if (!ready || !target) return;
    // Espera a que React pinte lo que `target` pueda abrir.
    const timer = window.setTimeout(() => {
      const node = document.querySelector<HTMLElement>(`[data-focus-id="${CSS.escape(target)}"]`);
      if (!node) return;
      node.scrollIntoView({ behavior: 'smooth', block: 'center' });
      node.classList.add(...HIGHLIGHT_CLASSES);
      window.setTimeout(() => node.classList.remove(...HIGHLIGHT_CLASSES), HIGHLIGHT_MS);
    }, 150);
    return () => window.clearTimeout(timer);
  }, [ready, target]);
  return target;
}
