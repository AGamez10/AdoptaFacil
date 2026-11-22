import { startTransition, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Router, type FutureConfig } from 'react-router-dom';
import {
  Action,
  createBrowserHistory,
  type BrowserHistory,
  type Location,
} from '@remix-run/router';

type Update = Parameters<Parameters<BrowserHistory['listen']>[0]>[0];

/**
 * Lo mismo que <BrowserRouter>, pero el cambio de pantalla se anima con la API
 * de View Transitions del navegador (mejora progresiva):
 *
 * - Avanzar (enlace, botón) desliza la página nueva desde la derecha; volver
 *   (atrás del navegador) la trae desde la izquierda. La barra superior, el
 *   menú lateral y los avisos fijos tienen nombre propio en el CSS, así que no
 *   se mueven: solo cambia el contenido.
 * - Sin soporte, con "reducir movimiento", con la pestaña oculta, cuando solo
 *   cambian los filtros (`?…`/`#…`) o cuando el navegador ya animó el gesto de
 *   volver (Safari en iPhone), la pantalla cambia al instante como siempre.
 *
 * La pantalla nueva se pinta con `startTransition` (igual que el
 * `v7_startTransition` que ya usábamos). Si tarda (su archivo aún no llega),
 * la animación no espera más de `MAX_WAIT_MS`: nunca congela la página.
 */
export const MAX_WAIT_MS = 300;

export type NavDirection = 'forward' | 'backward';

interface ViewTransitionLike {
  finished: Promise<void>;
  skipTransition?: () => void;
}
type StartViewTransition = (
  arg: (() => Promise<void> | void) | { update: () => Promise<void> | void; types?: string[] },
) => ViewTransitionLike;

function startViewTransitionFn(): StartViewTransition | null {
  if (typeof document === 'undefined') return null;
  const doc = document as Document & { startViewTransition?: StartViewTransition };
  return typeof doc.startViewTransition === 'function'
    ? doc.startViewTransition.bind(document)
    : null;
}

/** `startViewTransition({ types })` existe desde Chrome 125 / Safari 18.2 / Firefox 147. */
function supportsTransitionTypes(): boolean {
  const VT = (globalThis as { ViewTransition?: { prototype: object } }).ViewTransition;
  return !!VT && 'types' in VT.prototype;
}

function prefersReducedMotion(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/** Qué cambio de URL merece animación y en qué sentido; null = al instante. */
export function transitionDirection(
  from: Pick<Location, 'pathname'>,
  update: { action: Action; location: Pick<Location, 'pathname'> },
): NavDirection | null {
  // Filtros, paginación y anclas cambian la búsqueda o el hash, no la pantalla.
  if (from.pathname === update.location.pathname) return null;
  if (update.action === Action.Pop) return 'backward';
  if (update.action === Action.Push) return 'forward';
  // REPLACE: redirecciones (p. ej. al ingresar); la pantalla cambia sin teatro.
  return null;
}

export interface ViewTransitionRouterProps {
  children?: ReactNode;
  future?: Partial<FutureConfig>;
}

export function ViewTransitionRouter({ children, future }: ViewTransitionRouterProps) {
  const historyRef = useRef<BrowserHistory | null>(null);
  historyRef.current ??= createBrowserHistory({ v5Compat: true });
  const history = historyRef.current;

  const [state, setState] = useState<{ action: Action; location: Location }>(() => ({
    action: history.action,
    location: history.location,
  }));
  const currentRef = useRef(state.location);
  currentRef.current = state.location;
  /** Termina el `update` de la transición en curso cuando React ya pintó. */
  const commitRef = useRef<(() => void) | null>(null);

  useLayoutEffect(() => {
    // Safari (iOS) y Chrome (Android) animan ellos mismos el gesto de volver;
    // repetirlo encima se ve doble. El evento `popstate` llega antes que el
    // aviso del historial porque se escucha en captura y se registra primero.
    let uaAnimatedPop = false;
    const onPopState = (event: PopStateEvent) => {
      uaAnimatedPop =
        (event as PopStateEvent & { hasUAVisualTransition?: boolean }).hasUAVisualTransition ===
        true;
    };
    window.addEventListener('popstate', onPopState, { capture: true });

    const unlisten = history.listen((update: Update) => {
      const apply = () => startTransition(() => setState(update));
      const direction = transitionDirection(currentRef.current, update);
      const start = startViewTransitionFn();
      const skip =
        !direction ||
        !start ||
        document.visibilityState !== 'visible' ||
        prefersReducedMotion() ||
        (update.action === Action.Pop && uaAnimatedPop);
      uaAnimatedPop = false;
      if (skip) {
        commitRef.current?.();
        apply();
        return;
      }

      const root = document.documentElement;
      const updateDom = () =>
        new Promise<void>((resolve) => {
          const timer = window.setTimeout(done, MAX_WAIT_MS);
          function done() {
            window.clearTimeout(timer);
            if (commitRef.current === done) commitRef.current = null;
            resolve();
          }
          commitRef.current?.();
          commitRef.current = done;
          apply();
        });

      let transition: ViewTransitionLike;
      if (supportsTransitionTypes()) {
        transition = start({ update: updateDom, types: [direction] });
      } else {
        // Navegadores con View Transitions pero sin `types`: el sentido va en
        // un atributo que el CSS también entiende.
        root.dataset.navDirection = direction;
        transition = start(updateDom);
      }
      transition.finished.finally(() => {
        if (root.dataset.navDirection === direction) delete root.dataset.navDirection;
      });
    });

    return () => {
      window.removeEventListener('popstate', onPopState, { capture: true });
      unlisten();
    };
  }, [history]);

  // Ya se pintó la pantalla nueva: la transición puede tomar su foto final.
  useLayoutEffect(() => {
    commitRef.current?.();
  }, [state]);

  return (
    <Router
      location={state.location}
      navigationType={state.action}
      navigator={history}
      future={future}
    >
      {children}
    </Router>
  );
}
