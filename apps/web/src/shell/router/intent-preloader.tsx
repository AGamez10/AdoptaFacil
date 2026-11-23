import { useEffect } from 'react';
import { matchPath } from 'react-router-dom';
import { preloadPage } from './lazy-page';

/** Cuánto debe quedarse el puntero sobre un enlace para contar como intención. */
export const HOVER_INTENT_MS = 80;

type Table = ReadonlyArray<readonly [pattern: string, page: unknown]>;

/** Pantalla diferida que sirve una ruta interna, o null. */
export function pageForHref(href: string, table: Table, origin: string): unknown {
  let url: URL;
  try {
    url = new URL(href, origin);
  } catch {
    return null;
  }
  if (url.origin !== origin) return null;
  for (const [pattern, page] of table) {
    if (matchPath(pattern, url.pathname)) return page;
  }
  return null;
}

function saveData(): boolean {
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  return connection?.saveData === true;
}

/**
 * Baja el archivo de la pantalla a la que la persona va a ir, un instante
 * antes del clic: al tocar el enlace (celular), al enfocarlo con el teclado o
 * al dejar el puntero encima (escritorio). Con "ahorro de datos" solo precarga
 * con el toque, que es casi seguro un clic. No pide datos a la API, solo el
 * código de la pantalla, que el navegador guarda en caché.
 */
export function IntentPreloader({ table }: { table: Table }) {
  useEffect(() => {
    const done = new Set<unknown>();
    let hoverTimer: number | undefined;

    const preloadFrom = (target: EventTarget | null) => {
      const anchor = target instanceof Element ? target.closest('a[href]') : null;
      if (!anchor) return;
      const page = pageForHref(anchor.getAttribute('href') ?? '', table, window.location.origin);
      if (!page || done.has(page)) return;
      done.add(page);
      preloadPage(page);
    };

    const onPointerOver = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse' || saveData()) return;
      window.clearTimeout(hoverTimer);
      const target = event.target;
      hoverTimer = window.setTimeout(() => preloadFrom(target), HOVER_INTENT_MS);
    };
    const onPointerOut = () => window.clearTimeout(hoverTimer);
    const onTouchOrPress = (event: Event) => preloadFrom(event.target);
    const onFocusIn = (event: FocusEvent) => {
      if (!saveData()) preloadFrom(event.target);
    };

    const passive = { passive: true, capture: true } as const;
    document.addEventListener('pointerover', onPointerOver, passive);
    document.addEventListener('pointerout', onPointerOut, passive);
    document.addEventListener('touchstart', onTouchOrPress, passive);
    document.addEventListener('pointerdown', onTouchOrPress, passive);
    document.addEventListener('focusin', onFocusIn, passive);
    return () => {
      window.clearTimeout(hoverTimer);
      document.removeEventListener('pointerover', onPointerOver, passive);
      document.removeEventListener('pointerout', onPointerOut, passive);
      document.removeEventListener('touchstart', onTouchOrPress, passive);
      document.removeEventListener('pointerdown', onTouchOrPress, passive);
      document.removeEventListener('focusin', onFocusIn, passive);
    };
  }, [table]);
  return null;
}
