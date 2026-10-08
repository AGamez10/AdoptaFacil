import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@adoptafacil/ui';
import { fetchGlobalPublicAnimals } from '../../catalog/api/public-animals';
import { OfficialContactButtons } from '../../guide/components/official-contact-buttons';
import { HeroVisual } from './hero-visual';
import {
  IconArrowRight,
  IconChat,
  IconDocument,
  IconGlobe,
  IconHome,
  IconLock,
  IconMegaphone,
  IconPaw,
  IconPeople,
  IconSearch,
  IconShield,
  IconSignature,
} from './landing-icons';
import styles from './landing.module.scss';

/** Ancla del catálogo (lo usan el hero, el navbar y el asistente). */
export const LANDING_CATALOG_ID = 'adoptar';
/** Ancla de la sección para organizaciones. */
export const LANDING_ORGS_ID = 'organizaciones';

/** Total REAL de animales publicados (`GET /public/animals`): nunca una cifra inventada. */
function useAdoptableTotal(): number | null {
  const [total, setTotal] = useState<number | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetchGlobalPublicAnimals({ limit: 1, signal: controller.signal })
      .then((page) => setTotal(page.total))
      .catch(() => {
        // Sin dato no se muestra nada (nunca un número de relleno).
      });
    return () => controller.abort();
  }, []);
  return total;
}

function SectionHeading({
  eyebrow,
  title,
  id,
  children,
  tone = 'light',
}: {
  eyebrow: string;
  title: string;
  id: string;
  children?: ReactNode;
  tone?: 'light' | 'dark';
}) {
  return (
    <div className={cn(styles.heading, tone === 'dark' && styles['heading--dark'])}>
      <p className={styles.eyebrow}>{eyebrow}</p>
      <h2 id={id} className={styles.heading__title}>
        {title}
      </h2>
      {children && <p className={styles.heading__lead}>{children}</p>}
    </div>
  );
}

export function LandingHero() {
  const total = useAdoptableTotal();
  return (
    <section className={styles.hero} aria-labelledby="landing-hero-title">
      <HeroVisual />
      <div className={styles.hero__inner}>
        <p className={styles.hero__eyebrow}>
          <span className={styles.hero__dot} aria-hidden="true" />
          Adopción responsable en Colombia
        </p>
        <h1 id="landing-hero-title" className={styles.hero__title}>
          Adoptar bien empieza <span className={styles.hero__accent}>por confiar.</span>
        </h1>
        <p className={styles.hero__lead}>
          Conoce animales de refugios, fundaciones y rescatistas de todo el país, solicita su
          adopción en línea y firma un contrato claro con la organización. Mirar es libre: solo te
          pedimos una cuenta para adoptar.
        </p>
        <div className={styles.hero__actions}>
          <a href={`#${LANDING_CATALOG_ID}`} className={cn(styles.btn, styles['btn--primary'])}>
            Conocer animales en adopción
            <IconArrowRight className={styles.btn__icon} />
          </a>
          <Link to="/register" className={cn(styles.btn, styles['btn--ghost'])}>
            Registrar mi organización
          </Link>
        </div>
        <ul className={styles.hero__facts} aria-label="En AdoptaFácil">
          {typeof total === 'number' && total > 0 && (
            <li data-testid="hero-live-total">
              <strong>{total.toLocaleString('es-CO')}</strong>{' '}
              {total === 1 ? 'animal espera hogar hoy' : 'animales esperan hogar hoy'}
            </li>
          )}
          <li>
            <strong>Gratis</strong> para organizaciones
          </li>
          <li>
            <strong>Contrato</strong> firmado por ambas partes
          </li>
        </ul>
      </div>
    </section>
  );
}

const ADOPTION_STEPS = [
  {
    Icon: IconSearch,
    title: 'Explora',
    text: 'Filtra por especie y ciudad entre animales de varias organizaciones, con fotos y su historia.',
  },
  {
    Icon: IconChat,
    title: 'Solicita',
    text: 'Cuéntale a la organización cómo es tu hogar. Ella revisa tu solicitud y te responde.',
  },
  {
    Icon: IconSignature,
    title: 'Firma',
    text: 'Si es un sí, firman en línea el contrato de adopción, tú y la organización, y ambos pueden descargarlo.',
  },
  {
    Icon: IconHome,
    title: 'Acompaña',
    text: 'La organización hace seguimiento después de la adopción para que todo salga bien.',
  },
] as const;

export interface AdoptionStepsSectionProps {
  /** Fotos del banner que sube el PlatformAdmin en `/plataforma/banner` (S-15). */
  photos?: string[];
}

export function AdoptionStepsSection({ photos = [] }: AdoptionStepsSectionProps) {
  return (
    <section className={styles.section} aria-labelledby="landing-steps-title">
      <div className={styles.container}>
        <SectionHeading
          eyebrow="Para adoptantes"
          title="Así funciona adoptar"
          id="landing-steps-title"
        >
          Cuatro pasos, sin letra pequeña. Cada organización decide con quién se va cada animal.
        </SectionHeading>
        <ol className={styles.steps}>
          {ADOPTION_STEPS.map(({ Icon, title, text }, index) => (
            <li key={title} className={styles.step}>
              <span className={styles.step__number} aria-hidden="true">
                {String(index + 1).padStart(2, '0')}
              </span>
              <Icon className={styles.step__icon} />
              <h3 className={styles.step__title}>{title}</h3>
              <p className={styles.step__text}>{text}</p>
            </li>
          ))}
        </ol>
        {photos.length > 0 && (
          <div className={styles.photos} data-testid="landing-banner-photos">
            {photos.slice(0, 4).map((src) => (
              <img key={src} src={src} alt="" loading="lazy" className={styles.photos__item} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

const ORG_FEATURES = [
  {
    Icon: IconGlobe,
    title: 'Tu propia página',
    text: 'Un portal público con tu logo y tus colores, en tu subdominio, que muestra solo lo que decides publicar.',
  },
  {
    Icon: IconPaw,
    title: 'Animales y expediente',
    text: 'Fichas con fotos para el catálogo y un expediente clínico privado que solo ve tu equipo.',
  },
  {
    Icon: IconSignature,
    title: 'Adopciones con contrato',
    text: 'Recibe solicitudes, avanza cada caso en un tablero y firma el contrato en línea con el adoptante.',
  },
  {
    Icon: IconMegaphone,
    title: 'Campañas con evidencia',
    text: 'Cuenta qué necesitas y muestra con soportes en qué se usó la ayuda que recibiste.',
  },
  {
    Icon: IconDocument,
    title: 'Documentos en orden',
    text: 'Sube RUT, cámara de comercio y estatutos; nuestro equipo los revisa y te dice qué falta.',
  },
  {
    Icon: IconHome,
    title: 'Recordatorios clínicos',
    text: 'Vacunas, desparasitaciones y controles programados, para que ningún animal se quede sin su cita.',
  },
] as const;

export function ForOrganizationsSection() {
  return (
    <section
      id={LANDING_ORGS_ID}
      className={cn(styles.section, styles['section--dark'])}
      aria-labelledby="landing-orgs-title"
    >
      <div className={styles.container}>
        <div className={styles.orgs}>
          <div>
            <SectionHeading
              tone="dark"
              eyebrow="Para refugios, fundaciones y rescatistas"
              title="Tu organización, con su casa digital y la operación en orden."
              id="landing-orgs-title"
            >
              AdoptaFácil es gratis para las organizaciones. Te damos las herramientas para mostrar
              tu trabajo, adoptar con respaldo y rendir cuentas.
            </SectionHeading>
            <div className={styles.orgs__cta}>
              <Link to="/register" className={cn(styles.btn, styles['btn--primary'])}>
                Registrar mi organización
                <IconArrowRight className={styles.btn__icon} />
              </Link>
              <Link to="/login" className={cn(styles.btn, styles['btn--ghost'])}>
                Ya tengo cuenta
              </Link>
            </div>
            <aside className={styles.helpCard} aria-labelledby="landing-help-title">
              <h3 id="landing-help-title" className={styles.helpCard__title}>
                ¿Aún no tienes RUT o cámara de comercio?
              </h3>
              <p className={styles.helpCard__text}>
                No te detengas por eso. Puedes registrarte igual y te explicamos el paso a paso para
                formalizarte. Escríbenos y una persona del equipo te acompaña.
              </p>
              <OfficialContactButtons
                tone="dark"
                whatsappMessage="Hola, quiero registrar mi organización en AdoptaFácil y necesito ayuda con los documentos."
                emailSubject="Ayuda para registrar mi organización"
              />
            </aside>
          </div>
          <ul className={styles.features}>
            {ORG_FEATURES.map(({ Icon, title, text }) => (
              <li key={title} className={styles.feature}>
                <Icon className={styles.feature__icon} />
                <div>
                  <h3 className={styles.feature__title}>{title}</h3>
                  <p className={styles.feature__text}>{text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

const PROMISES = [
  {
    Icon: IconLock,
    title: 'Lo privado se queda privado',
    text: 'El expediente clínico, los documentos legales y los datos de quien adopta nunca aparecen en páginas públicas.',
  },
  {
    Icon: IconShield,
    title: 'Cada organización en su espacio',
    text: 'La información de una organización está separada de las demás desde la base de datos, no solo en la pantalla.',
  },
  {
    Icon: IconPeople,
    title: 'Personas reales detrás',
    text: 'Si algo no está claro, escríbenos por WhatsApp o correo y te responde alguien del equipo.',
  },
] as const;

export function PromisesSection() {
  return (
    <section className={styles.section} aria-labelledby="landing-promises-title">
      <div className={styles.container}>
        <SectionHeading
          eyebrow="Confianza"
          title="Lo que cuidamos por ti"
          id="landing-promises-title"
        />
        <ul className={styles.promises}>
          {PROMISES.map(({ Icon, title, text }) => (
            <li key={title} className={styles.promise}>
              <Icon className={styles.promise__icon} />
              <h3 className={styles.promise__title}>{title}</h3>
              <p className={styles.promise__text}>{text}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
