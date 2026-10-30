import { useEffect, useState, type ComponentType, type SVGProps } from 'react';
import { Link } from 'react-router-dom';
import type {
  CampaignPublic,
  ResourceNeedPublic,
  VolunteerOpportunityPublic,
} from '@adoptafacil/contracts';
import { cn } from '@adoptafacil/ui';
import { useFeature } from '../../../shell/capabilities';
import { listPublicCampaigns } from '../../campaigns/api/public-campaigns';
import { CampaignCard } from '../../campaigns/components/campaign-card';
import { listPublicNeeds } from '../../resources/api/public-resources';
import {
  CATEGORY_LABELS as RESOURCE_CATEGORY_LABELS,
  progressPercent,
  publicResourceNeedHref,
} from '../../resources/model/resources-view';
import { listPublicOpportunities } from '../../volunteering/api/public-volunteering';
import { formatBogota, volunteerSignupHref } from '../../volunteering/model/volunteering-view';
import { BoneSticker, CatMascot, DogMascot, HeartSticker, Sparkle } from './illustrations';
import { IconArrowRight, IconBox, IconHeart, IconMegaphone, IconPaw } from './landing-icons';
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
      to: '/adoptar',
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

/** Ilustración de cada bloque de color (decorativa). */
function WayArt({ tone }: { tone: HelpWay['tone'] }) {
  if (tone === 'teal') return <DogMascot className={styles.way__art} />;
  if (tone === 'gold') return <CatMascot className={styles.way__art} />;
  if (tone === 'coral') return <HeartSticker className={styles.way__art} color="#ff7a59" />;
  return <BoneSticker className={styles.way__art} color="#ffffff" />;
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
              <WayArt tone={tone} />
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
              <CampaignCard campaign={campaign} variant="brand" />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/** "12 oct 2026" o "12 oct 2026 – 14 oct 2026", siempre en hora Colombia. */
function dateRange(startIso: string, endIso: string): string {
  const start = formatBogota(startIso);
  const end = formatBogota(endIso);
  return start === end ? start : `${start} – ${end}`;
}

/** Jornadas de voluntariado abiertas (`GET /public/volunteer-opportunities`):
 *  solo activas y que aún no terminan, de organizaciones aprobadas. Sin
 *  jornadas, la sección no se monta. */
export function OpenVolunteeringSection() {
  const [items, setItems] = useState<VolunteerOpportunityPublic[]>([]);
  useEffect(() => {
    const controller = new AbortController();
    listPublicOpportunities({ limit: 3, signal: controller.signal })
      .then((page) => setItems(page.items.slice(0, 3)))
      .catch(() => {
        // Best-effort: sin datos la sección simplemente no aparece.
      });
    return () => controller.abort();
  }, []);

  if (items.length === 0) return null;

  return (
    <section
      className={cn(styles.campaigns, styles['campaigns--paper'])}
      aria-labelledby="landing-volunteering-title"
      data-testid="landing-volunteering"
    >
      <div className={styles.container}>
        <div className={cn(styles.head, styles['head--row'])}>
          <div>
            <p className={styles.eyebrow}>Dona tu tiempo</p>
            <h2 id="landing-volunteering-title" className={styles.head__title}>
              Jornadas de voluntariado
            </h2>
          </div>
          <Link to="/voluntariado" className={styles.link}>
            Ver todas las jornadas
            <IconArrowRight aria-hidden="true" />
          </Link>
        </div>
        <ul className={styles.campaigns__grid}>
          {items.map((item) => (
            <li key={item.id}>
              <article className={styles.item} data-tone="sky" data-testid="volunteering-card">
                <div className={styles.item__top}>
                  <span className={styles.item__tag}>{item.category}</span>
                  <span className={styles.item__org}>{item.organizationName}</span>
                </div>
                <h3 className={styles.item__title}>{item.title}</h3>
                {item.description && <p className={styles.item__text}>{item.description}</p>}
                <dl className={styles.item__facts}>
                  <div>
                    <dt>Cuándo</dt>
                    <dd>{dateRange(item.startDate, item.endDate)}</dd>
                  </div>
                  <div>
                    <dt>Dónde</dt>
                    <dd>{item.location}</dd>
                  </div>
                  {typeof item.capacity === 'number' && (
                    <div>
                      <dt>Cupos</dt>
                      <dd>{item.capacity}</dd>
                    </div>
                  )}
                </dl>
                <div className={styles.item__foot}>
                  {item.appliesToStudentService ? (
                    <span className={styles.item__note}>Cuenta como servicio social</span>
                  ) : (
                    <span />
                  )}
                  <Link to={volunteerSignupHref(item.id)} className={styles.item__cta}>
                    Quiero participar
                  </Link>
                </div>
              </article>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/** Necesidades del banco de recursos que aún aceptan ayuda
 *  (`GET /public/resources/needs`). Solo con el módulo encendido (con él
 *  apagado la API responde 404) y solo si hay necesidades publicadas. */
export function ResourceNeedsSection() {
  const enabled = useFeature('resources');
  const [items, setItems] = useState<ResourceNeedPublic[]>([]);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    listPublicNeeds({ limit: 3, signal: controller.signal })
      .then((page) => setItems(page.items.slice(0, 3)))
      .catch(() => {
        // Best-effort: sin datos la sección simplemente no aparece.
      });
    return () => controller.abort();
  }, [enabled]);

  if (!enabled || items.length === 0) return null;

  return (
    <section
      className={styles.campaigns}
      aria-labelledby="landing-needs-title"
      data-testid="landing-needs"
    >
      <div className={styles.container}>
        <div className={cn(styles.head, styles['head--row'])}>
          <div>
            <p className={styles.eyebrow}>Banco de recursos</p>
            <h2 id="landing-needs-title" className={styles.head__title}>
              Lo que necesitan hoy
            </h2>
          </div>
          <Link to="/recursos" className={styles.link}>
            Ver todas las necesidades
            <IconArrowRight aria-hidden="true" />
          </Link>
        </div>
        <ul className={styles.campaigns__grid}>
          {items.map((need) => {
            const pct = progressPercent(need.progress);
            const href = publicResourceNeedHref(need.id);
            return (
              <li key={need.id}>
                <article className={styles.item} data-tone="sun" data-testid="need-card">
                  <div className={styles.item__top}>
                    <span className={styles.item__tag}>
                      {RESOURCE_CATEGORY_LABELS[need.category] ?? need.category}
                    </span>
                    <span className={styles.item__org}>{need.organizationName}</span>
                  </div>
                  <h3 className={styles.item__title}>
                    <Link to={href} state={{ need }}>
                      {need.title}
                    </Link>
                  </h3>
                  {need.description && <p className={styles.item__text}>{need.description}</p>}
                  <div className={styles.item__progress}>
                    <div
                      className={styles.item__bar}
                      role="progressbar"
                      aria-label={`Avance de ${need.title}`}
                      aria-valuenow={pct}
                      aria-valuemin={0}
                      aria-valuemax={100}
                    >
                      <div style={{ width: `${pct}%` }} />
                    </div>
                    <p>
                      <strong>
                        {need.quantityFulfilled} de {need.quantityNeeded}
                      </strong>{' '}
                      {need.unit} · {pct}%
                    </p>
                  </div>
                  <div className={styles.item__foot}>
                    <span />
                    <Link to={href} state={{ need }} className={styles.item__cta}>
                      Quiero ayudar
                    </Link>
                  </div>
                </article>
              </li>
            );
          })}
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
