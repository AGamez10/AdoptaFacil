import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { COOKIE_CONSENT_CHANGE_EVENT, readCookieConsent } from '../../../shell/consent';
import { useFeaturedCoffeeHref } from '../model/use-featured-coffee';
import { IconArrowRight } from './landing-icons';
import { LANDING_COFFEE_ID } from './landing-showcase';
import styles from './coffee-teaser.module.scss';

/** Se muestra una vez por sesión. */
const SEEN_KEY = 'af_coffee_teaser_seen';
/** Aparece poco después de entrar (sin competir con el titular)… */
export const COFFEE_TEASER_DELAY_MS = 1800;
/** …y se va solo si la persona no lo toca. */
export const COFFEE_TEASER_VISIBLE_MS = 9000;

function alreadySeen(): boolean {
  try {
    return window.sessionStorage.getItem(SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

function markSeen(): void {
  try {
    window.sessionStorage.setItem(SEEN_KEY, '1');
  } catch {
    // Sin almacenamiento (modo privado): simplemente puede volver a salir.
  }
}

/**
 * Aviso flotante del café al inicio de la landing: aparece, cuenta que cada
 * compra sostiene AdoptaFácil gratis para las fundaciones y se va solo. Nunca
 * tapa el aviso de cookies (espera a que la persona decida), no roba el foco,
 * se pausa mientras el puntero o el foco están encima y respeta "reducir
 * movimiento". Con un café a la venta, el botón abre la compra; si no, lleva
 * a la sección del café.
 */
export function CoffeeTeaser() {
  const [phase, setPhase] = useState<'idle' | 'shown' | 'leaving' | 'done'>('idle');
  const [paused, setPaused] = useState(false);
  const [consented, setConsented] = useState(() => readCookieConsent() !== null);
  const buyHref = useFeaturedCoffeeHref(phase !== 'done');
  const hideTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (consented) return;
    const onChange = () => setConsented(true);
    window.addEventListener(COOKIE_CONSENT_CHANGE_EVENT, onChange);
    return () => window.removeEventListener(COOKIE_CONSENT_CHANGE_EVENT, onChange);
  }, [consented]);

  useEffect(() => {
    if (!consented || phase !== 'idle') return;
    if (alreadySeen()) {
      setPhase('done');
      return;
    }
    const id = window.setTimeout(() => {
      markSeen();
      setPhase('shown');
    }, COFFEE_TEASER_DELAY_MS);
    return () => window.clearTimeout(id);
  }, [consented, phase]);

  useEffect(() => {
    if (phase !== 'shown' || paused) return;
    hideTimer.current = window.setTimeout(() => setPhase('leaving'), COFFEE_TEASER_VISIBLE_MS);
    return () => window.clearTimeout(hideTimer.current);
  }, [phase, paused]);

  if (phase === 'idle' || phase === 'done') return null;

  const close = () => setPhase('leaving');
  const to = buyHref ?? `/#${LANDING_COFFEE_ID}`;

  return (
    <aside
      className={styles.teaser}
      data-phase={phase}
      data-paused={paused}
      aria-label="Café San Pedro"
      data-testid="coffee-teaser"
      onAnimationEnd={(event) => {
        if (event.target === event.currentTarget && phase === 'leaving') setPhase('done');
      }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <img
        src="/landing/cafe-san-pedro-192.webp"
        alt=""
        width={96}
        height={96}
        decoding="async"
        className={styles.teaser__art}
      />
      <div className={styles.teaser__body}>
        <p className={styles.teaser__title}>Un café que mantiene esto gratis</p>
        <p className={styles.teaser__text}>
          Cada bolsa sostiene AdoptaFácil gratis para refugios y fundaciones, y apoya una campaña.
        </p>
        <Link
          to={to}
          className={styles.teaser__cta}
          onClick={() => setPhase('done')}
          data-testid="coffee-teaser-cta"
        >
          {buyHref ? 'Comprar café' : 'Conocer el café'}
          <IconArrowRight aria-hidden="true" />
        </Link>
      </div>
      <button
        type="button"
        className={styles.teaser__close}
        onClick={close}
        aria-label="Cerrar aviso del café"
      >
        ×
      </button>
      <span className={styles.teaser__timer} aria-hidden="true" />
    </aside>
  );
}
