import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { CampaignPublic } from '@adoptafacil/contracts';
import { cn } from '@adoptafacil/ui';
import { usePublicModules } from '../../../shell/layout/public-nav-model';
import { listPublicCampaigns } from '../../campaigns/api/public-campaigns';
import { CampaignCard } from '../../campaigns/components/campaign-card';
import { CatMascot, DogMascot, Sparkle } from './illustrations';
import { IconArrowRight } from './landing-icons';
import styles from './commerce.module.scss';

/** Ancla de "Formas de ayudar" (la usa el hero). */
export const LANDING_HELP_ID = 'ayudar';

/**
 * "Todo AdoptaFácil": cada módulo público en una cuadrícula tipo bento, con la
 * misma lista y los mismos grupos del menú (`usePublicModules`), así lo que
 * ves en el menú y en la página nunca se contradice. Los módulos apagados se
 * muestran como "muy pronto", sin enlace: nunca un botón que lleve a un 404.
 * Colores institucionales del logo: azul noche y verde azulado.
 */
export function WaysToHelpSection() {
  const groups = usePublicModules();
  const byKey = new Map(groups.flatMap((group) => group.modules).map((m) => [m.key, m]));
  const adopt = byKey.get('adoptar');
  const tiles = groups
    .filter((group) => group.key === 'ayudar' || group.key === 'comunidad')
    .flatMap((group) => group.modules.map((module) => ({ ...module, group: group.label })));

  return (
    <section
      id={LANDING_HELP_ID}
      className={styles.ways}
      aria-labelledby="landing-ways-title"
      data-testid="landing-ways"
    >
      <div className={styles.container}>
        <div className={cn(styles.head, 'af-reveal')}>
          <p className={styles.eyebrow}>Todo AdoptaFácil</p>
          <h2 id="landing-ways-title" className={styles.head__title}>
            Hay más de una forma de cambiar una vida.
          </h2>
          <p className={styles.head__lead}>
            Adoptar, donar, apoyar campañas, compartir recursos o encontrar quién cuide a tu
            mascota: todo en un mismo lugar, con las mismas reglas claras.
          </p>
        </div>
        <ul className={styles.bento}>
          {adopt && (
            <li
              className={cn(styles.tile, styles['tile--hero'], 'af-reveal')}
              data-testid="way-adoptar"
            >
              <Link to={adopt.to} className={styles.tile__link}>
                <DogMascot className={styles.tile__art} />
                <span className={styles.tile__icon} aria-hidden="true">
                  <adopt.Icon />
                </span>
                <span className={styles.tile__group}>Adoptar</span>
                <strong className={styles.tile__title}>Encuentra a quien te espera</strong>
                <span className={styles.tile__text}>
                  Conoce su historia, solicita en línea y firma un contrato claro con la
                  organización.
                </span>
                <span className={styles.tile__cta}>
                  Ver animales
                  <IconArrowRight aria-hidden="true" />
                </span>
              </Link>
            </li>
          )}
          {tiles.map((module) => {
            const body = (
              <>
                <span className={styles.tile__icon} aria-hidden="true">
                  <module.Icon />
                </span>
                <span className={styles.tile__group}>{module.group}</span>
                <strong className={styles.tile__title}>{module.label}</strong>
                <span className={styles.tile__text}>{module.description}</span>
                {module.enabled ? (
                  <IconArrowRight className={styles.tile__arrow} aria-hidden="true" />
                ) : (
                  <span className={styles.tile__soon}>Muy pronto</span>
                )}
              </>
            );
            return (
              <li
                key={module.key}
                className={cn(styles.tile, 'af-reveal', !module.enabled && styles['tile--soon'])}
                data-testid={module.enabled ? `way-${module.key}` : `way-soon-${module.key}`}
              >
                {module.enabled ? (
                  <Link to={module.to} className={styles.tile__link}>
                    {body}
                  </Link>
                ) : (
                  <div className={styles.tile__link}>{body}</div>
                )}
              </li>
            );
          })}
          <li
            className={cn(styles.tile, styles['tile--org'], 'af-reveal')}
            data-testid="way-organizaciones"
          >
            <a href="#organizaciones" className={styles.tile__link}>
              <CatMascot className={styles.tile__art} />
              <span className={styles.tile__group}>Organizaciones</span>
              <strong className={styles.tile__title}>
                ¿Rescatas animales? Tu casa digital es gratis.
              </strong>
              <span className={styles.tile__text}>
                Portal propio, animales con ficha clínica y adopciones con contrato y seguimiento.
              </span>
              <span className={styles.tile__cta}>
                Conocer cómo funciona
                <IconArrowRight aria-hidden="true" />
              </span>
            </a>
          </li>
        </ul>
      </div>
    </section>
  );
}

/** Campañas activas reales (`GET /public/campaigns`). Sin campañas, la sección
 *  no se monta: nunca un bloque vacío en la página de entrada. */
export function ActiveCampaignsSection() {
  const [items, setItems] = useState<CampaignPublic[]>([]);
  useEffect(() => {
    const controller = new AbortController();
    listPublicCampaigns({ limit: 3, signal: controller.signal })
      .then((page) => setItems(page.items.slice(0, 3)))
      .catch(() => {
        // Best-effort: sin datos la sección simplemente no aparece.
      });
    return () => controller.abort();
  }, []);

  if (items.length === 0) return null;

  return (
    <section
      className={styles.campaigns}
      aria-labelledby="landing-campaigns-title"
      data-testid="landing-campaigns"
    >
      <div className={styles.container}>
        <div className={cn(styles.head, styles['head--row'])}>
          <div>
            <p className={styles.eyebrow}>Necesitan tu apoyo hoy</p>
            <h2 id="landing-campaigns-title" className={styles.head__title}>
              Campañas activas
            </h2>
          </div>
          <Link to="/campanas" className={styles.link}>
            Ver todas las campañas
            <IconArrowRight aria-hidden="true" />
          </Link>
        </div>
        <ul className={styles.campaigns__grid}>
          {items.map((campaign) => (
            <li key={campaign.id} className="af-reveal">
              <CampaignCard campaign={campaign} variant="brand" />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/** Cierre con las dos decisiones principales de la página. */
export function FinalCtaSection() {
  return (
    <section className={styles.final} aria-labelledby="landing-final-title">
      <div className={styles.container}>
        <div className={cn(styles.final__card, 'af-reveal')}>
          <div className={styles.final__art} aria-hidden="true">
            <DogMascot className={styles.final__dog} />
            <CatMascot className={styles.final__cat} />
            <Sparkle className={styles.final__spark} />
          </div>
          <h2 id="landing-final-title" className={styles.final__title}>
            Alguien te está esperando.
          </h2>
          <p className={styles.final__text}>
            Mira los animales que buscan hogar hoy o abre la casa digital de tu organización en
            minutos.
          </p>
          <div className={styles.final__actions}>
            <Link to="/adoptar" className={cn(styles.btn, styles['btn--ink'])}>
              Conocer animales
              <IconArrowRight aria-hidden="true" />
            </Link>
            <Link to="/register" className={cn(styles.btn, styles['btn--ghost'])}>
              Registrar mi organización
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
