import {
  useEffect,
  useId,
  useRef,
  useState,
  type ComponentType,
  type CSSProperties,
  type FormEvent,
  type ReactNode,
  type SVGProps,
} from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  LAUNCH_PRO_PROMO_MONTHS,
  PLAN_CATALOG,
  PLAN_KEYS,
  planHighlights,
  type PlanKey,
  type PublicAnimalSummary,
} from '@adoptafacil/contracts';
import { cn } from '@adoptafacil/ui';
import { AnimalSpotlightCard } from '../../catalog/components/animal-spotlight-card';
import { ADOPT_BASE_PATH, buildAdoptPath } from '../../catalog/model/adopt-filters';
import { OfficialContactButtons } from '../../guide/components/official-contact-buttons';
import { officialWhatsappUrl } from '../../../lib/contact';
import { HOME_FAQ, publicAnimalPath } from '../../../seo/page-meta.js';
import { useFeature } from '../../../shell/capabilities/capabilities-context';
import type { CatalogSnapshot } from '../model/use-catalog-snapshot';
import { HeroVisual } from './hero-visual';
import {
  BoneSticker,
  CatMascot,
  DogMascot,
  HeartSticker,
  PawStamp,
  Sparkle,
} from './illustrations';
import {
  IconArrowRight,
  IconChat,
  IconCheck,
  IconDocument,
  IconGlobe,
  IconHeart,
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

/** Ancla vieja del catálogo: `/#adoptar` ahora redirige a /adoptar. */
export const LANDING_CATALOG_ID = 'adoptar';
/** Ancla de la sección para organizaciones. */
export const LANDING_ORGS_ID = 'organizaciones';

function SectionHeading({
  eyebrow,
  title,
  id,
  children,
  tone = 'light',
  align = 'left',
}: {
  eyebrow: string;
  title: ReactNode;
  id: string;
  children?: ReactNode;
  tone?: 'light' | 'dark';
  align?: 'left' | 'center';
}) {
  return (
    <div
      className={cn(
        styles.heading,
        'af-reveal',
        tone === 'dark' && styles['heading--dark'],
        align === 'center' && styles['heading--center'],
      )}
    >
      <p className={styles.eyebrow}>{eyebrow}</p>
      <h2 id={id} className={styles.heading__title}>
        {title}
      </h2>
      {children && <p className={styles.heading__lead}>{children}</p>}
    </div>
  );
}

function pluralAnimals(total: number): string {
  return total === 1 ? 'animal espera hogar hoy' : 'animales esperan hogar hoy';
}

const HERO_SPECIES = { perros: 'dog', gatos: 'cat', todos: 'all' } as const;

/** Buscador del hero: especie + ciudad → listado con URL limpia (/adoptar/perros/bogota). */
function HeroSearch({ cities }: { cities: CatalogSnapshot['cities'] }) {
  const navigate = useNavigate();
  const cityId = useId();
  const [species, setSpecies] = useState<'perros' | 'gatos' | 'todos'>('perros');
  const [city, setCity] = useState('');

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    navigate(buildAdoptPath(HERO_SPECIES[species], city || null));
  };

  return (
    <form className={styles.search} onSubmit={onSubmit} role="search" aria-label="Buscar animales">
      <div className={styles.search__species} role="radiogroup" aria-label="¿A quién buscas?">
        {(
          [
            ['perros', 'Perros'],
            ['gatos', 'Gatos'],
            ['todos', 'Todos'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={species === value}
            className={styles.search__chip}
            onClick={() => setSpecies(value)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className={styles.search__row}>
        <label htmlFor={cityId} className="sr-only">
          Ciudad
        </label>
        <select
          id={cityId}
          className={styles.search__select}
          value={city}
          onChange={(event) => setCity(event.target.value)}
        >
          <option value="">Todo Colombia</option>
          {cities.map(({ city: name }) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        <button type="submit" className={styles.search__submit}>
          <IconSearch className={styles.search__icon} />
          <span>Buscar</span>
        </button>
      </div>
    </form>
  );
}

/** Collage del hero con tres animales REALES del catálogo; sin datos, la mascota. */
function HeroCollage({ animals }: { animals: PublicAnimalSummary[] }) {
  const withPhoto = animals.filter((animal) => animal.photoUrl).slice(0, 3);
  if (withPhoto.length === 0) {
    return (
      <div className={styles.collage} aria-hidden="true">
        <div className={styles.collage__blob} />
        <DogMascot className={styles.collage__mascot} />
        <CatMascot className={styles.collage__cat} />
        <Sparkle className={cn(styles.sticker, styles['sticker--sparkle'])} />
        <HeartSticker className={cn(styles.sticker, styles['sticker--heart'])} />
      </div>
    );
  }
  return (
    <div className={styles.collage} data-testid="hero-collage">
      <div className={styles.collage__blob} aria-hidden="true" />
      {withPhoto.map((animal, index) => (
        <Link
          key={animal.id}
          to={publicAnimalPath(animal.organization.slug, animal)}
          state={{ animal }}
          className={cn(styles.polaroid, styles[`polaroid--${index}`])}
        >
          <img
            src={animal.photoUrl}
            alt={`${animal.name}${animal.breed ? `, ${animal.breed}` : ''}`}
            className={styles.polaroid__photo}
            loading={index === 0 ? 'eager' : 'lazy'}
            decoding="async"
            {...(index === 0 ? { fetchpriority: 'high' } : {})}
          />
          <span className={styles.polaroid__label}>
            <strong>{animal.name}</strong>
            {animal.organization.city && <span> · {animal.organization.city}</span>}
          </span>
        </Link>
      ))}
      <Sparkle className={cn(styles.sticker, styles['sticker--sparkle'])} />
      <HeartSticker className={cn(styles.sticker, styles['sticker--heart'])} />
      <BoneSticker className={cn(styles.sticker, styles['sticker--bone'])} />
    </div>
  );
}

/** En celular el collage queda abajo: esta fila trae caras reales al primer pantallazo. */
function HeroAvatars({ animals, total }: { animals: PublicAnimalSummary[]; total: number }) {
  const faces = animals.filter((animal) => animal.photoUrl).slice(0, 4);
  if (faces.length === 0) return null;
  const named = faces.slice(0, 2).map((animal) => animal.name);
  const rest = Math.max(total - named.length, 0);
  return (
    <Link to={ADOPT_BASE_PATH} className={styles.avatars} data-testid="hero-avatars">
      <span className={styles.avatars__faces} aria-hidden="true">
        {faces.map((animal) => (
          <img key={animal.id} src={animal.photoUrl} alt="" className={styles.avatars__face} />
        ))}
      </span>
      <span className={styles.avatars__text}>
        <strong>{named.join(', ')}</strong>
        {rest > 0 ? ` y ${rest.toLocaleString('es-CO')} más te esperan` : ' te esperan'}
      </span>
    </Link>
  );
}

interface HeroPath {
  key: 'adoptar' | 'donar' | 'organizacion';
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
  title: string;
  text: string;
  to: string;
}

/**
 * Los tres caminos del primer pantallazo: quien llega quiere adoptar, quiere
 * ayudar con dinero o es una organización. Cada uno es una tarjeta grande con
 * verbo en primera persona, así se reconoce en un vistazo sin leer el resto.
 * "Donar" lleva al checkout solo con pagos encendidos; si no, a las campañas
 * y demás formas de ayudar de la misma página (nunca a un 404).
 */
function useHeroPaths(): HeroPath[] {
  const payments = useFeature('payments');
  return [
    {
      key: 'adoptar',
      Icon: IconPaw,
      title: 'Quiero adoptar',
      text: 'Perros y gatos de refugios de todo el país',
      to: ADOPT_BASE_PATH,
    },
    payments
      ? {
          key: 'donar',
          Icon: IconHeart,
          title: 'Quiero donar',
          text: 'Elige a quién ayudas y ve el desglose',
          to: '/donaciones',
        }
      : {
          key: 'donar',
          Icon: IconHeart,
          title: 'Quiero ayudar',
          text: 'Campañas con evidencia y otras formas',
          to: '#ayudar',
        },
    {
      key: 'organizacion',
      Icon: IconPeople,
      title: 'Soy una organización',
      text: 'Tu portal y tus adopciones, gratis',
      to: `#${LANDING_ORGS_ID}`,
    },
  ];
}

function HeroPaths() {
  const paths = useHeroPaths();
  return (
    <nav className={styles.paths} aria-label="¿Qué quieres hacer?">
      <p className={styles.paths__label}>¿Qué quieres hacer hoy?</p>
      <ul className={styles.paths__list}>
        {paths.map(({ key, Icon, title, text, to }) => {
          const content = (
            <>
              <span className={styles.path__icon} aria-hidden="true">
                <Icon />
              </span>
              <span className={styles.path__body}>
                <strong className={styles.path__title}>{title}</strong>
                <span className={styles.path__text}>{text}</span>
              </span>
              <IconArrowRight className={styles.path__arrow} aria-hidden="true" />
            </>
          );
          return (
            <li key={key} className={styles.path} data-path={key} data-testid={`hero-path-${key}`}>
              {to.startsWith('#') ? (
                <a href={to} className={styles.path__link}>
                  {content}
                </a>
              ) : (
                <Link to={to} className={styles.path__link}>
                  {content}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function LandingHero({ snapshot }: { snapshot: CatalogSnapshot }) {
  const { total, animals, cities } = snapshot;
  return (
    <section className={styles.hero} aria-labelledby="landing-hero-title">
      <div className={cn(styles.container, styles.hero__grid)}>
        <div className={styles.hero__copy}>
          <p className={styles.hero__eyebrow}>
            <PawStamp className={styles.hero__eyebrowIcon} />
            Adopción responsable en Colombia
          </p>
          <h1 id="landing-hero-title" className={styles.hero__title}>
            Adopta un amigo. <span className={styles.hero__accent}>Cambia dos vidas.</span>
          </h1>
          {/* Los tres caminos van justo bajo el titular: en un celular de 320 px
              caben en el primer pantallazo sin hacer scroll. */}
          <HeroPaths />
          <HeroAvatars animals={animals} total={total} />
          <p className={styles.hero__lead}>
            Refugios, fundaciones y rescatistas de todo Colombia en un solo lugar: adopta con
            contrato firmado, dona con desglose claro o suma gratis tu organización.
          </p>
          <HeroSearch cities={cities} />
          <ul className={styles.hero__facts} aria-label="En AdoptaFácil">
            {total > 0 && (
              <li data-testid="hero-live-total">
                <strong>{total.toLocaleString('es-CO')}</strong> {pluralAnimals(total)}
              </li>
            )}
            <li>
              <IconCheck className={styles.hero__factIcon} />
              Gratis para organizaciones
            </li>
            <li>
              <IconCheck className={styles.hero__factIcon} />
              Contrato firmado por ambas partes
            </li>
          </ul>
        </div>
        <HeroCollage animals={animals} />
      </div>
    </section>
  );
}

/** Fila deslizable con los animales más recientes (datos reales). */
export function WaitingAnimalsSection({ snapshot }: { snapshot: CatalogSnapshot }) {
  const animals = snapshot.animals.slice(0, 8);
  if (animals.length === 0) return null;
  return (
    <section
      className={cn(styles.section, styles['section--cream'], styles['section--tight-top'])}
      aria-labelledby="landing-waiting-title"
      data-testid="landing-waiting"
    >
      <div className={styles.container}>
        <div className={styles.rowHead}>
          <SectionHeading
            eyebrow="Recién llegados"
            title="Te están esperando"
            id="landing-waiting-title"
          />
          <Link to={ADOPT_BASE_PATH} className={styles.textLink}>
            Ver todos
            <IconArrowRight aria-hidden="true" />
          </Link>
        </div>
      </div>
      <ul className={styles.rail} aria-label="Animales en adopción recientes">
        {animals.map((animal) => (
          <li key={animal.id} className={styles.rail__item}>
            <AnimalSpotlightCard animal={animal} layout="rail" />
          </li>
        ))}
      </ul>
    </section>
  );
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/**
 * Cifra que cuenta desde cero cuando entra en pantalla (requestAnimationFrame,
 * ~1,2 s, solo cambia texto). El valor real está en el DOM desde el primer
 * render y para lectores de pantalla nunca cambia; sin IntersectionObserver o
 * con "reducir movimiento" se queda quieto.
 */
function CountUp({ value }: { value: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState(value);

  useEffect(() => {
    const node = ref.current;
    if (!node || prefersReducedMotion() || typeof IntersectionObserver !== 'function') {
      setShown(value);
      return;
    }
    let frame = 0;
    setShown(0);
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        observer.disconnect();
        const start = performance.now();
        const tick = (now: number) => {
          const t = Math.min((now - start) / 1200, 1);
          setShown(Math.round(value * (1 - (1 - t) ** 3)));
          if (t < 1) frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
      },
      { threshold: 0.6 },
    );
    observer.observe(node);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [value]);

  return (
    <>
      <span ref={ref} aria-hidden="true">
        {shown.toLocaleString('es-CO')}
      </span>
      <span className="sr-only">{value.toLocaleString('es-CO')}</span>
    </>
  );
}

/**
 * Cifras grandes de la red (solo con datos reales) junto al globo 3D, que
 * ilustra la red de organizaciones. Las cifras cuentan al entrar en pantalla y
 * las tarjetas y organizaciones aparecen escalonadas; todo con transform y
 * opacity, y quieto con "reducir movimiento".
 */
export function ImpactSection({ snapshot }: { snapshot: CatalogSnapshot }) {
  const { total, organizations, cities } = snapshot;
  if (total === 0) return null;
  const stats = [
    {
      Icon: IconPaw,
      value: total,
      label: total === 1 ? 'animal buscando hogar' : 'animales buscando hogar',
    },
    {
      Icon: IconPeople,
      value: organizations.length,
      label: organizations.length === 1 ? 'organización publicando' : 'organizaciones publicando',
    },
    { Icon: IconGlobe, value: cities.length, label: cities.length === 1 ? 'ciudad' : 'ciudades' },
  ].filter((stat) => stat.value > 0);
  return (
    <section
      className={cn(styles.section, styles['section--deep'], styles.impact)}
      aria-labelledby="landing-impact-title"
      data-testid="landing-impact"
    >
      <HeroVisual />
      <div className={cn(styles.container, styles.impact__inner)}>
        <p className={styles.live}>
          <span className={styles.live__dot} aria-hidden="true" />
          Catálogo en vivo
        </p>
        <SectionHeading
          tone="dark"
          eyebrow="Una red que crece"
          title="Rescatistas de todo el país, en un solo lugar."
          id="landing-impact-title"
        >
          Cada número sale del catálogo en vivo: nada inflado, nada inventado.
        </SectionHeading>
        <dl className={styles.stats}>
          {stats.map(({ Icon, value, label }) => (
            <div key={label} className={cn(styles.stat, 'af-reveal')}>
              <dt className={styles.stat__label}>
                <span className={styles.stat__icon} aria-hidden="true">
                  <Icon />
                </span>
                {label}
              </dt>
              <dd className={styles.stat__value}>
                <CountUp value={value} />
              </dd>
            </div>
          ))}
        </dl>
        {organizations.length > 0 && (
          <ul className={styles.orgs} aria-label="Organizaciones con animales publicados">
            {organizations.slice(0, 12).map((org, index) => (
              <li
                key={org.id}
                className={styles.orgs__item}
                style={{ '--i': index } as CSSProperties}
              >
                <Link to={`/o/${encodeURIComponent(org.slug)}`} className={styles.orgChip}>
                  {org.logoUrl ? (
                    <img
                      src={org.logoUrl}
                      alt=""
                      width={28}
                      height={28}
                      className={styles.orgChip__logo}
                      loading="lazy"
                    />
                  ) : (
                    <span className={styles.orgChip__initial} aria-hidden="true">
                      {org.name.charAt(0)}
                    </span>
                  )}
                  <span>
                    {org.name}
                    {org.city && <span className={styles.orgChip__city}> · {org.city}</span>}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <div className={styles.impact__actions}>
          <Link to={ADOPT_BASE_PATH} className={cn(styles.btn, styles['btn--light'])}>
            Ver los animales
            <IconArrowRight className={styles.btn__icon} />
          </Link>
          <Link to="/register" className={cn(styles.btn, styles['btn--ghostDark'])}>
            Sumar mi organización
          </Link>
        </div>
      </div>
    </section>
  );
}

const ADOPTION_STEPS = [
  {
    Icon: IconSearch,
    title: 'Explora',
    text: 'Filtra por especie y ciudad entre animales de varias organizaciones, con fotos y su historia.',
    tone: 'mint',
  },
  {
    Icon: IconChat,
    title: 'Solicita',
    text: 'Cuéntale a la organización cómo es tu hogar. Ella revisa tu solicitud y te responde.',
    tone: 'sun',
  },
  {
    Icon: IconSignature,
    title: 'Firma',
    text: 'Si es un sí, firman en línea el contrato de adopción, tú y la organización, y ambos pueden descargarlo.',
    tone: 'sky',
  },
  {
    Icon: IconHome,
    title: 'Acompaña',
    text: 'La organización hace seguimiento después de la adopción para que todo salga bien.',
    tone: 'coral',
  },
] as const;

export interface AdoptionStepsSectionProps {
  /** Fotos del banner que sube el PlatformAdmin en `/plataforma/banner` (S-15). */
  photos?: string[];
}

export function AdoptionStepsSection({ photos = [] }: AdoptionStepsSectionProps) {
  return (
    <section
      className={cn(styles.section, styles['section--cream'])}
      aria-labelledby="landing-steps-title"
    >
      <div className={styles.container}>
        <SectionHeading
          eyebrow="Para adoptantes"
          title="Así de fácil es adoptar"
          id="landing-steps-title"
          align="center"
        >
          Cuatro pasos, sin letra pequeña. Cada organización decide con quién se va cada animal.
        </SectionHeading>
        <ol className={styles.steps}>
          {ADOPTION_STEPS.map(({ Icon, title, text, tone }, index) => (
            <li key={title} className={cn(styles.step, 'af-reveal')} data-tone={tone}>
              <span className={styles.step__icon} aria-hidden="true">
                <Icon />
              </span>
              <span className={styles.step__number} aria-hidden="true">
                Paso {index + 1}
              </span>
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

/**
 * Comunidad: todo el ecosistema que rodea a una mascota (veterinarias,
 * peluquerías, paseadores, tiendas). Con el módulo `community` apagado se
 * anuncia como "muy pronto" y el único llamado es escribirnos por WhatsApp;
 * encendido, lleva al directorio (/servicios) y a publicar un negocio
 * (/mi-negocio).
 */
const ECOSYSTEM = [
  { title: 'Veterinarias', text: 'Consultas, vacunas y urgencias cerca de ti.', tone: 'mint' },
  { title: 'Peluquerías', text: 'Baño y corte para que luzca y se sienta bien.', tone: 'sun' },
  { title: 'Paseadores', text: 'Personas de confianza para los paseos diarios.', tone: 'sky' },
  { title: 'Tiendas', text: 'Alimento, camas y juguetes de negocios locales.', tone: 'coral' },
  { title: 'Adiestradores', text: 'Ayuda para la convivencia en casa.', tone: 'mint' },
  { title: 'Guarderías', text: 'Un lugar seguro cuando tienes que viajar.', tone: 'sun' },
] as const;

export function CommunitySection() {
  const communityOn = useFeature('community');
  return (
    <section
      className={cn(styles.section, styles['section--sky'])}
      aria-labelledby="landing-community-title"
      data-testid="landing-community"
    >
      <div className={cn(styles.container, styles.community)}>
        <div className={styles.community__copy}>
          <SectionHeading
            eyebrow={communityOn ? 'Comunidad' : 'Comunidad · muy pronto'}
            title="Todo el mundo de tu mascota, en un solo lugar."
            id="landing-community-title"
          >
            Después de adoptar empieza lo mejor. Estamos sumando a los negocios y profesionales que
            cuidan a los animales en Colombia, para que encuentres todo sin salir de AdoptaFácil.
          </SectionHeading>
          {communityOn ? (
            <div className={styles.community__actions}>
              <Link to="/servicios" className={cn(styles.btn, styles['btn--ink'])}>
                Ver servicios cerca de mí
                <IconArrowRight className={styles.btn__icon} />
              </Link>
              <Link to="/mi-negocio" className={cn(styles.btn, styles['btn--ghost'])}>
                Tengo un negocio para mascotas
              </Link>
            </div>
          ) : (
            <a
              href={officialWhatsappUrl(
                'Hola, tengo un negocio para mascotas y quiero aparecer en la comunidad de AdoptaFácil.',
              )}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(styles.btn, styles['btn--ink'])}
            >
              Tengo un negocio para mascotas
              <IconArrowRight className={styles.btn__icon} />
            </a>
          )}
        </div>
        <ul className={styles.ecosystem}>
          {ECOSYSTEM.map(({ title, text, tone }) => (
            <li key={title} className={cn(styles.eco, 'af-reveal')} data-tone={tone}>
              <h3 className={styles.eco__title}>{title}</h3>
              <p className={styles.eco__text}>{text}</p>
            </li>
          ))}
        </ul>
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

/**
 * Planes para organizaciones: precios, límites y lista salen del catálogo único
 * de `packages/contracts` (`PLAN_CATALOG`, `planHighlights`), el mismo que usa
 * "Plan y facturación" dentro del panel. Los planes de pago son opcionales.
 */
function planPrice(key: PlanKey): string {
  const plan = PLAN_CATALOG[key];
  if (plan.monthlyPriceCop === 0) return 'Gratis, siempre';
  return `$${plan.monthlyPriceCop.toLocaleString('es-CO')} al mes`;
}

export function ForOrganizationsSection() {
  return (
    <section
      id={LANDING_ORGS_ID}
      className={cn(styles.section, styles['section--ink'])}
      aria-labelledby="landing-orgs-title"
    >
      <div className={styles.container}>
        <div className={styles.orgsGrid}>
          <div>
            <SectionHeading
              tone="dark"
              eyebrow="Para refugios, fundaciones y rescatistas"
              title="Tu organización, con su casa digital y todo en orden."
              id="landing-orgs-title"
            >
              Empiezas gratis, con tu propio portal y todo lo necesario para adoptar con respaldo.
              Nuestro trabajo es que más personas conozcan a tus animales y te apoyen.
            </SectionHeading>
            <div className={styles.orgs__cta}>
              <Link to="/register" className={cn(styles.btn, styles['btn--primary'])}>
                Crear mi portal gratis
                <IconArrowRight className={styles.btn__icon} />
              </Link>
              <Link to="/login" className={cn(styles.btn, styles['btn--ghostDark'])}>
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
              <li key={title} className={cn(styles.feature, 'af-reveal')}>
                <span className={styles.feature__icon} aria-hidden="true">
                  <Icon />
                </span>
                <div>
                  <h3 className={styles.feature__title}>{title}</h3>
                  <p className={styles.feature__text}>{text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className={styles.plans} data-testid="landing-plans">
          <h3 className={styles.plans__title}>Planes para organizaciones</h3>
          <p className={styles.plans__lead}>
            Lo que protege al animal, al adoptante y la transparencia es gratis para siempre. Los
            planes de pago son opcionales: suman marca, alcance y comodidad. Al lanzar, cada
            organización tiene Pro gratis por {LAUNCH_PRO_PROMO_MONTHS} meses.
          </p>
          <ul className={styles.plans__grid}>
            {PLAN_KEYS.map((key) => (
              <li
                key={key}
                className={cn(styles.plan, 'af-reveal', key === 'free' && styles['plan--featured'])}
                data-testid={`plan-${key}`}
              >
                <p className={styles.plan__name}>{PLAN_CATALOG[key].name}</p>
                <p className={styles.plan__price}>{planPrice(key)}</p>
                {PLAN_CATALOG[key].monthlyPriceCop > 0 && (
                  <p className={styles.plan__note}>
                    Opcional · + IVA, o{' '}
                    {`$${PLAN_CATALOG[key].annualPriceCop.toLocaleString('es-CO')}`} al año
                  </p>
                )}
                <p className={styles.plan__tagline}>{PLAN_CATALOG[key].tagline}</p>
                <ul className={styles.plan__list}>
                  {planHighlights(key).map((item) => (
                    <li key={item.text}>
                      <IconCheck className={styles.plan__check} />
                      <span>
                        {item.text}
                        {!item.available && <span className={styles.plan__soon}>Próximamente</span>}
                      </span>
                    </li>
                  ))}
                </ul>
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
          align="center"
        />
        <ul className={styles.promises}>
          {PROMISES.map(({ Icon, title, text }) => (
            <li key={title} className={cn(styles.promise, 'af-reveal')}>
              <span className={styles.promise__icon} aria-hidden="true">
                <Icon />
              </span>
              <h3 className={styles.promise__title}>{title}</h3>
              <p className={styles.promise__text}>{text}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/**
 * Preguntas frecuentes (mismas que el JSON-LD `FAQPage` de la portada). Con
 * `<details>` nativo: se abre con teclado y lector de pantalla sin JavaScript.
 */
export function FaqSection() {
  return (
    <section
      className={cn(styles.section, styles['section--cream'])}
      aria-labelledby="landing-faq-title"
      data-testid="landing-faq"
    >
      <div className={cn(styles.container, styles.faq)}>
        <div>
          <SectionHeading
            eyebrow="Preguntas frecuentes"
            title="Lo que más nos preguntan"
            id="landing-faq-title"
          >
            ¿Te queda alguna duda? Escríbenos por WhatsApp o correo y te responde una persona del
            equipo.
          </SectionHeading>
          <OfficialContactButtons
            className={styles.faq__contact}
            whatsappMessage="Hola, tengo una pregunta sobre AdoptaFácil."
            emailSubject="Pregunta sobre AdoptaFácil"
          />
        </div>
        <div className={styles.faq__list}>
          {HOME_FAQ.map(({ q, a }) => (
            <details key={q} className={cn(styles.faq__item, 'af-reveal')}>
              <summary className={styles.faq__question}>
                <h3 className={styles.faq__questionText}>{q}</h3>
                <span className={styles.faq__toggle} aria-hidden="true" />
              </summary>
              <p className={styles.faq__answer}>{a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
