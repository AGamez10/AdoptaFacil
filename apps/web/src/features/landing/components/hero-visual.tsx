import { useEffect, useRef, useState } from 'react';
import styles from './hero-visual.module.scss';

type Mode = 'fallback' | 'loading' | 'scene';

/** ¿Vale la pena cargar WebGL? Sin soporte, con "ahorro de datos" o en equipos
 *  muy modestos se queda el fondo estático (que ya es el diseño completo). */
export function canRunScene(): boolean {
  if (typeof window === 'undefined' || typeof WebGLRenderingContext === 'undefined') return false;
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  if (connection?.saveData) return false;
  if ((navigator.hardwareConcurrency ?? 4) < 3) return false;
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

    setMode('loading');
    const cancelIdle = whenIdle(() => {
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

    return () => {
      disposed = true;
      cancelIdle();
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
