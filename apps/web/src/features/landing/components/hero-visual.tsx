import { useEffect, useRef, useState } from 'react';
import styles from './hero-visual.module.scss';

type Mode = 'fallback' | 'loading' | 'scene';

/** ¿Vale la pena cargar WebGL? Sin soporte, con "ahorro de datos" o en equipos
 *  muy modestos se queda el fondo estático (que ya es el diseño completo). */
export function canRunScene(): boolean {
  if (typeof window === 'undefined' || typeof WebGLRenderingContext === 'undefined') return false;
  const nav = navigator as Navigator & {
    connection?: { saveData?: boolean; effectiveType?: string };
    deviceMemory?: number;
  };
  if (nav.connection?.saveData) return false;
  // Red lenta (2G/3G) o equipo de gama baja (poca RAM o pocos núcleos): fondo estático.
  if (/(^|-)2g$|^3g$/.test(nav.connection?.effectiveType ?? '')) return false;
  if ((nav.deviceMemory ?? 8) < 4) return false;
  if ((navigator.hardwareConcurrency ?? 4) < 4) return false;
  try {
    const probe = document.createElement('canvas');
    return Boolean(probe.getContext('webgl2') ?? probe.getContext('webgl'));
  } catch {
    return false;
  }
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/** Espera a que el navegador esté libre: el LCP es el titular, nunca la escena. */
function whenIdle(callback: () => void): () => void {
  const w = window as Window & {
    requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
    cancelIdleCallback?: (id: number) => void;
  };
  if (w.requestIdleCallback) {
    const id = w.requestIdleCallback(callback, { timeout: 1500 });
    return () => w.cancelIdleCallback?.(id);
  }
  const id = window.setTimeout(callback, 300);
  return () => window.clearTimeout(id);
}

/**
 * Visual del hero (F4). Siempre pinta primero un fondo estático en CSS (puntos
 * y halo) que ya funciona como diseño final; si el equipo lo permite, carga
 * three.js en un chunk aparte cuando el navegador está ocioso y monta encima
 * la esfera de la red. Con `prefers-reduced-motion` se dibuja un solo cuadro
 * quieto. La animación se pausa fuera de pantalla y con la pestaña oculta.
 * Es decorativa: `aria-hidden`, sin texto ni datos.
 */
export function HeroVisual() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [mode, setMode] = useState<Mode>('fallback');

  useEffect(() => {
    if (!canRunScene()) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    let disposed = false;
    let handle: { setRunning(r: boolean): void; dispose(): void } | null = null;
    let visible = true;
    const staticFrame = prefersReducedMotion();

    const sync = () => handle?.setRunning(visible && document.visibilityState === 'visible');
    const observer =
      typeof IntersectionObserver === 'function'
        ? new IntersectionObserver(([entry]) => {
            visible = Boolean(entry?.isIntersecting);
            sync();
          })
        : null;
    observer?.observe(canvas);
    document.addEventListener('visibilitychange', sync);

    let cancelIdle = () => {};
    const load = () => {
      setMode('loading');
      cancelIdle = whenIdle(() => {
        import('../scene/network-globe')
          .then(({ mountNetworkGlobe }) => {
            if (disposed) return;
            handle = mountNetworkGlobe(canvas, { staticFrame });
            setMode('scene');
            sync();
          })
          .catch(() => {
            if (!disposed) setMode('fallback');
          });
      });
    };
    // three.js pesa ~125 KB: se baja solo cuando la sección se acerca a la
    // pantalla (antes del primer cuadro visible), no en la primera carga.
    const near =
      typeof IntersectionObserver === 'function'
        ? new IntersectionObserver(
            ([entry]) => {
              if (!entry?.isIntersecting) return;
              near?.disconnect();
              load();
            },
            { rootMargin: '600px 0px' },
          )
        : null;
    if (near) near.observe(canvas);
    else load();

    return () => {
      disposed = true;
      cancelIdle();
      near?.disconnect();
      observer?.disconnect();
      document.removeEventListener('visibilitychange', sync);
      handle?.dispose();
    };
  }, []);

  return (
    <div className={styles.visual} aria-hidden="true" data-mode={mode} data-testid="hero-visual">
      <div className={styles.visual__fallback} />
      <canvas ref={canvasRef} className={styles.visual__canvas} />
    </div>
  );
}
