import { useEffect, useState, type ComponentType, type SVGProps } from 'react';
import { Link } from 'react-router-dom';
import type { CampaignPublic } from '@adoptafacil/contracts';
import { cn } from '@adoptafacil/ui';
import { useFeature } from '../../../shell/capabilities';
import { listPublicCampaigns } from '../../campaigns/api/public-campaigns';
import { CampaignCard } from '../../campaigns/components/campaign-card';
import {
  IconArrowRight,
  IconBox,
  IconHeart,
  IconMegaphone,
  IconPaw,
  IconSpark,
} from './landing-icons';
import styles from './commerce.module.scss';

/** Ancla de "Formas de ayudar" (la usa el hero). */
export const LANDING_HELP_ID = 'ayudar';

interface HelpWay {
  key: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
  title: string;
  text: string;
  cta: string;
  to: string;
  tone: 'teal' | 'gold' | 'coral' | 'navy';
}

/**
 * Las formas de ayudar que el producto puede cumplir HOY: adoptar y apoyar
 * campañas siempre; donar y el banco de recursos solo con su módulo encendido
 * (Ola 1, R1-1). Nunca se promete un botón que lleve a un 404.
 */
export function useHelpWays(): HelpWay[] {
  const payments = useFeature('payments');
  const resources = useFeature('resources');
  return [
    {
      key: 'adoptar',
      Icon: IconPaw,
      title: 'Adopta',
      text: 'Conoce su historia, solicita en línea y firma un contrato claro con la organización.',
      cta: 'Ver animales',
      to: '/#adoptar',
      tone: 'teal',
    },
    ...(payments
      ? [
          {
            key: 'donar',
            Icon: IconHeart,
            title: 'Dona',
            text: 'Elige la organización, mira el desglose antes de pagar y guarda tu comprobante.',
            cta: 'Donar ahora',
            to: '/donaciones',
            tone: 'coral' as const,
          },
        ]
      : []),
    {
      key: 'campanas',
      Icon: IconMegaphone,
      title: 'Apoya una campaña',
      text: 'Cirugías, alimento, esterilizaciones: metas concretas con evidencia de en qué se usó la ayuda.',
      cta: 'Ver campañas',
      to: '/campanas',
      tone: 'gold',
    },
    ...(resources
      ? [
          {
            key: 'recursos',
            Icon: IconBox,
            title: 'Comparte recursos',
            text: 'Ofrece lo que te sobra (cobijas, guacales, alimento) a quien lo necesita hoy.',
            cta: 'Ir al banco de recursos',
            to: '/recursos',
            tone: 'navy' as const,
          },
        ]
      : []),
  ];
}

/** Bloque "Hay muchas formas de ayudar": una tarjeta grande por camino. */
export function WaysToHelpSection() {
  const ways = useHelpWays();
  return (
    <section
      id={LANDING_HELP_ID}
      className={styles.ways}
      aria-labelledby="landing-ways-title"
      data-testid="landing-ways"
    >
      <div className={styles.container}>
        <div className={styles.head}>
          <p className={styles.eyebrow}>Elige cómo ayudar</p>
          <h2 id="landing-ways-title" className={styles.head__title}>
            Hay más de una forma de cambiar una vida.
          </h2>
        </div>
        <ul className={styles.ways__grid} data-count={ways.length}>
          {ways.map(({ key, Icon, title, text, cta, to, tone }) => (
            <li key={key} className={styles.way} data-tone={tone} data-testid={`way-${key}`}>
              <span className={styles.way__icon} aria-hidden="true">
                <Icon />
              </span>
              <h3 className={styles.way__title}>{title}</h3>
              <p className={styles.way__text}>{text}</p>
              <Link to={to} className={styles.way__cta}>
                {cta}
                <IconArrowRight aria-hidden="true" />
              </Link>
            </li>
          ))}
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
            <li key={campaign.id}>
              <CampaignCard campaign={campaign} />
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
        <div className={styles.final__card}>
          <IconSpark className={styles.final__spark} aria-hidden="true" />
          <h2 id="landing-final-title" className={styles.final__title}>
            Alguien te está esperando.
          </h2>
          <p className={styles.final__text}>
            Mira los animales que buscan hogar hoy o abre la casa digital de tu organización en
            minutos.
          </p>
          <div className={styles.final__actions}>
            <a href="#adoptar" className={cn(styles.btn, styles['btn--light'])}>
              Conocer animales
              <IconArrowRight aria-hidden="true" />
            </a>
            <Link to="/register" className={cn(styles.btn, styles['btn--ghost'])}>
              Registrar mi organización
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
