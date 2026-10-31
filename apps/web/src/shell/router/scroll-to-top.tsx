import { useLayoutEffect } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

/**
 * Cada página nueva empieza arriba. <BrowserRouter> no restaura el scroll
 * (eso solo lo hace el router de datos), así que al entrar a un módulo desde
 * el menú o la landing la página nueva abría a la altura de la anterior,
 * a veces en el pie.
 *
 * - Atrás/adelante (POP): no se toca; el navegador devuelve la posición.
 * - Con `#ancla`: la página que la recibe desplaza a su sección.
 */
export function ScrollToTop() {
  const { pathname, hash } = useLocation();
  const navigationType = useNavigationType();
  useLayoutEffect(() => {
    if (navigationType === 'POP' || hash) return;
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' as ScrollBehavior });
  }, [pathname, hash, navigationType]);
  return null;
}
