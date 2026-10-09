import { useEffect, useRef, useState } from 'react';
import { canRunScene } from '../../../landing/components/hero-visual';
import type { ConstellationDensity } from '../../scene/paw-constellation';
import styles from './portal-templates.module.scss';

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/**
 * Lienzo de la plantilla Órbita. Primero pinta una huella estática en CSS (el
 * diseño completo sin WebGL); si el equipo lo permite, carga three.js en un
 * chunk aparte y monta la constelación encima. Pausa fuera de pantalla y con
 * la pestaña oculta; un solo cuadro con `prefers-reduced-motion`. Decorativo.
 */
export function ConstellationCanvas({ density }: { density: ConstellationDensity }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [mode, setMode] = useState<'fallback' | 'scene'>('fallback');

  useEffect(() => {
    if (!canRunScene()) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    let disposed = false;
    let visible = true;
    let handle: { setRunning(r: boolean): void; dispose(): void } | null = null;
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
    const color = getComputedStyle(canvas).getPropertyValue('--primary');

    import('../../scene/paw-constellation')
      .then(({ mountPawConstellation }) => {
        if (disposed) return;
        handle = mountPawConstellation(canvas, {
          density,
          color,
          staticFrame: prefersReducedMotion(),
        });
        setMode('scene');
        sync();
      })
      .catch(() => undefined);

    return () => {
      disposed = true;
      observer?.disconnect();
      document.removeEventListener('visibilitychange', sync);
      handle?.dispose();
    };
  }, [density]);

  return (
    <div className={styles.constellation} data-mode={mode} aria-hidden="true">
      <svg viewBox="0 0 48 48" className={styles.constellation__fallback} fill="currentColor">
        <ellipse cx="24" cy="31" rx="11" ry="9" />
        <ellipse cx="9" cy="21" rx="4.6" ry="6" />
        <ellipse cx="19" cy="12" rx="4.6" ry="6.4" />
        <ellipse cx="29" cy="12" rx="4.6" ry="6.4" />
        <ellipse cx="39" cy="21" rx="4.6" ry="6" />
      </svg>
      <canvas ref={canvasRef} className={styles.constellation__canvas} />
    </div>
  );
}
