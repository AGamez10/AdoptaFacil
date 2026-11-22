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
  type PublicNetworkOrganization,
} from '@adoptafacil/contracts';
import { cn } from '@adoptafacil/ui';
import { AnimalSpotlightCard } from '../../catalog/components/animal-spotlight-card';
import { ADOPT_BASE_PATH, buildAdoptPath } from '../../catalog/model/adopt-filters';
import { OfficialContactButtons } from '../../guide/components/official-contact-buttons';
import { officialWhatsappUrl } from '../../../lib/contact';
import { HOME_FAQ, publicAnimalPath } from '../../../seo/page-meta.js';
import { useFeature } from '../../../shell/capabilities/capabilities-context';
import type { CatalogSnapshot } from '../model/use-catalog-snapshot';
import { useAdoptionNetwork } from '../model/use-adoption-network';
import { HeroVisual } from './hero-visual';
import { useWhenIdle } from '../model/use-when-idle';
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
/** Página completa para organizaciones: propuesta, planes, plantillas y confianza. */
export const ORGANIZATIONS_PATH = '/para-organizaciones';
/** Anclas del índice de la landing. */
export const LANDING_WAITING_ID = 'te-esperan';
export const LANDING_STEPS_ID = 'como-adoptar';
export const LANDING_FAQ_ID = 'preguntas';

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
          text: 'Organizaciones verificadas, sin comisión',
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
      id={LANDING_WAITING_ID}
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

/** true cuando el elemento está a ~600 px de la pantalla (una sola vez).
 *  Ref de callback: la sección puede montarse después (cuando llega el
 *  catálogo) y aun así se observa. */
function useNearViewport<T extends Element>(): [(node: T | null) => void, boolean] {
  const [node, setNode] = useState<T | null>(null);
  const [near, setNear] = useState(false);
  useEffect(() => {
    if (!node || near) return;
    if (typeof IntersectionObserver !== 'function') {
      setNear(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) setNear(true);
      },
      { rootMargin: '600px 0px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [node, near]);
  return [setNode, near];
}

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

/** Tarjeta de una organización de la red: fotos reales de sus animales,
 *  logo, ciudad y cuántos tiene en adopción (solo si el número es exacto). */
function NetworkOrgCard({ org, index }: { org: PublicNetworkOrganization; index: number }) {
  const photos = org.photos.slice(0, 3);
  return (
    <li className={styles.netCard__item} style={{ '--i': index } as CSSProperties}>
      <Link
        to={`/o/${encodeURIComponent(org.slug)}`}
        className={styles.netCard}
        data-testid="network-org"
      >
        <span className={styles.netCard__photos} aria-hidden="true">
          {photos.length > 0 ? (
            photos.map((src) => (
              <img
                key={src}
                src={src}
                alt=""
                width={96}
                height={96}
                loading="lazy"
                decoding="async"
              />
            ))
          ) : (
            <span className={styles.netCard__paws}>
              <IconPaw />
            </span>
          )}
        </span>
        <span className={styles.netCard__body}>
          {org.logoUrl ? (
            <img
              src={org.logoUrl}
              alt=""
              width={40}
              height={40}
              className={styles.netCard__logo}
              loading="lazy"
              decoding="async"
            />
          ) : (
            <span className={styles.netCard__initial} aria-hidden="true">
              {org.name.charAt(0)}
            </span>
          )}
          <span className={styles.netCard__text}>
            <strong className={styles.netCard__name}>{org.name}</strong>
            <span className={styles.netCard__meta}>
              {org.animals > 0
                ? `${org.animals.toLocaleString('es-CO')} ${plural(org.animals, 'animal', 'animales')} en adopción`
                : 'Animales en adopción'}
              {org.city && ` · ${org.city}`}
            </span>
          </span>
          <IconArrowRight className={styles.netCard__arrow} aria-hidden="true" />
        </span>
      </Link>
    </li>
  );
}

/**
 * "Rescatistas de todo el país": la red en cifras REALES de toda la red
 * (`GET /public/network`, pedido solo cuando la sección se acerca), tarjetas
 * por organización con fotos de sus animales, las ciudades como atajos al
 * listado y dos salidas claras: ver animales o unirse gratis. El globo 3D
 * sigue cargándose aparte y solo cerca de la pantalla.
 */
export function ImpactSection({ snapshot }: { snapshot: CatalogSnapshot }) {
  const [ref, near] = useNearViewport<HTMLElement>();
  // Se pide apenas la página queda libre (no al llegar a la sección): así las
  // tarjetas ya están cuando la persona baja y la sección no crece de golpe
  // empujando lo que está leyendo (antes: CLS 0,25 en celular, 0,42 escritorio).
  const idle = useWhenIdle();
  const network = useAdoptionNetwork(snapshot, near || idle);
  const { animals, organizations, cities, items } = network;
  if (animals === 0 && snapshot.total === 0) return null;
  const stats = [
    {
      Icon: IconPaw,
      value: animals,
      label: plural(animals, 'animal buscando hogar', 'animales buscando hogar'),
    },
    {
      Icon: IconPeople,
      value: organizations ?? 0,
      label: plural(organizations ?? 0, 'refugio o rescatista', 'refugios y rescatistas'),
    },
    {
      Icon: IconGlobe,
      value: cities.length,
      label: plural(cities.length, 'ciudad', 'ciudades'),
    },
  ].filter((stat) => stat.value > 0);
  return (
    <section
      ref={ref}
      id="red"
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
          Refugios, fundaciones y personas que rescatan publican aquí a sus animales. Cada número
          sale del catálogo en vivo: nada inflado, nada inventado.
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
      </div>

      {items.length > 0 && (
        <div className={cn(styles.container, styles.impact__inner, styles.impact__wide)}>
          <h3 className={styles.netTitle}>Conoce a quienes rescatan</h3>
          <ul className={styles.netGrid} aria-label="Organizaciones con animales publicados">
            {items.map((org, index) => (
              <NetworkOrgCard key={org.id} org={org} index={index} />
            ))}
            <li className={styles.netCard__item} style={{ '--i': items.length } as CSSProperties}>
              <Link to="/register" className={cn(styles.netCard, styles['netCard--join'])}>
                <span className={styles.netJoin__icon} aria-hidden="true">
                  <IconHeart />
                </span>
                <strong className={styles.netCard__name}>¿Rescatas animales?</strong>
                <span className={styles.netCard__meta}>
                  Crea tu portal gratis y que más personas los conozcan.
                </span>
                <span className={styles.netJoin__cta}>
                  Unirme gratis <IconArrowRight aria-hidden="true" />
                </span>
              </Link>
            </li>
          </ul>
        </div>
      )}

      <div className={cn(styles.container, styles.impact__inner, styles.impact__wide)}>
        {cities.length > 0 && (
          <div className={styles.netCities}>
            <p className={styles.netCities__label}>Busca cerca de ti</p>
            <ul className={styles.netCities__list} aria-label="Ciudades con animales en adopción">
              {cities.slice(0, 10).map(({ city, count }) => (
                <li key={city}>
                  <Link to={buildAdoptPath('all', city)} className={styles.netCity}>
                    {city}
                    <span className={styles.netCity__count}>{count.toLocaleString('es-CO')}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className={styles.impact__actions}>
          <Link to={ADOPT_BASE_PATH} className={cn(styles.btn, styles['btn--light'])}>
            Ver los animales
            <IconArrowRight className={styles.btn__icon} />
          </Link>
          <Link to="/register" className={cn(styles.btn, styles['btn--ghostDark'])}>
            Unirme gratis como rescatista
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
      id={LANDING_STEPS_ID}
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
      id="servicios"
      className={cn(styles.section, styles['section--sky'])}
      aria-labelledby="landing-community-title"
      data-testid="landing-community"
    >
      <div className={cn(styles.container, styles.community)}>
        <div className={styles.community__copy}>
          <SectionHeading
            eyebrow={
              communityOn ? 'Servicios para mascotas' : 'Servicios para mascotas · muy pronto'
            }
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

/** Ancla de los planes (landing y /para-organizaciones). */
export const LANDING_PLANS_ID = 'planes';

/** Registro de organización con el plan elegido (el pago se hace en el panel). */
export function planSignupPath(key: PlanKey): string {
  return key === 'free' ? '/register' : `/register?plan=${key}`;
}

/**
 * Tarjetas de planes con su acción: Gratis lleva al registro de organización;
 * Crece y Pro llevan al mismo registro con el plan elegido, y al terminar la
 * cuenta se abre "Plan y facturación" con ese plan para pagarlo con Mercado
 * Pago. Precios y listas del catálogo único (`PLAN_CATALOG`).
 */
export function PlansSection() {
  return (
    <section
      id={LANDING_PLANS_ID}
      className={cn(styles.section, styles['section--ink'])}
      aria-labelledby="landing-plans-title"
      data-testid="landing-plans"
    >
      <div className={styles.container}>
        <SectionHeading
          tone="dark"
          eyebrow="Planes para organizaciones"
          title="Empieza gratis. Crece cuando quieras."
          id="landing-plans-title"
        >
          Lo que protege al animal, al adoptante y la transparencia es gratis para siempre. Los
          planes de pago son opcionales: suman marca, alcance y comodidad. Al lanzar, cada
          organización tiene Pro gratis por {LAUNCH_PRO_PROMO_MONTHS} meses.
        </SectionHeading>
        <ul className={styles.plans__grid}>
          {PLAN_KEYS.map((key) => {
            const paid = PLAN_CATALOG[key].monthlyPriceCop > 0;
            return (
              <li
                key={key}
                className={cn(styles.plan, 'af-reveal', key === 'free' && styles['plan--featured'])}
                data-testid={`plan-${key}`}
              >
                {key === 'free' && (
                  <span className={styles.plan__flag}>Recomendado para empezar</span>
                )}
                <p className={styles.plan__name}>{PLAN_CATALOG[key].name}</p>
                <p className={styles.plan__price}>{planPrice(key)}</p>
                {paid && (
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
                <Link
                  to={planSignupPath(key)}
                  className={cn(
                    styles.btn,
                    paid ? styles['btn--light'] : styles['btn--ink'],
                    styles.plan__cta,
                  )}
                  data-testid={`plan-cta-${key}`}
                >
                  {paid ? `Elegir ${PLAN_CATALOG[key].name}` : 'Crear mi portal gratis'}
                  <IconArrowRight className={styles.btn__icon} />
                </Link>
              </li>
            );
          })}
        </ul>
        <p className={styles.plans__fine}>
          Primero creas tu cuenta de organización sin costo. Si elegiste Crece o Pro, al terminar te
          llevamos a &ldquo;Plan y facturación&rdquo; para pagarlo con Mercado Pago, y puedes
          cancelarlo cuando quieras.
        </p>
      </div>
    </section>
  );
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
      </div>
    </section>
  );
}

/**
 * Entrada para organizaciones en la landing: qué reciben, con alcance
 * nacional, y dos salidas (registrarse o ver los planes). Le siguen las
 * plantillas y los planes; el detalle completo vive en
 * {@link ORGANIZATIONS_PATH}.
 */
export function OrganizationsTeaserSection() {
  return (
    <section
      id={LANDING_ORGS_ID}
      className={cn(styles.section, styles['section--ink'])}
      aria-labelledby="landing-orgs-teaser-title"
      data-testid="landing-orgs-teaser"
    >
      <div className={cn(styles.container, styles.orgsGrid)}>
        <div>
          <SectionHeading
            tone="dark"
            eyebrow="Para refugios, fundaciones y rescatistas"
            title="Tu refugio, visible en todo el país. Gratis."
            id="landing-orgs-teaser-title"
          >
            Rescatistas de cualquier ciudad de Colombia ya publican aquí. Tu portal se ve desde
            cualquier lugar del mundo, con tus animales, tus adopciones con contrato y donaciones
            con desglose claro. Lo esencial es gratis para siempre.
          </SectionHeading>
          <div className={styles.orgs__cta}>
            <Link to="/register" className={cn(styles.btn, styles['btn--primary'])}>
              Crear mi portal gratis
              <IconArrowRight className={styles.btn__icon} />
            </Link>
            <a href={`#${LANDING_PLANS_ID}`} className={cn(styles.btn, styles['btn--ghostDark'])}>
              Ver planes
            </a>
          </div>
        </div>
        <ul className={styles.features}>
          {ORG_FEATURES.slice(0, 4).map(({ Icon, title, text }) => (
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
    <section id="confianza" className={styles.section} aria-labelledby="landing-promises-title">
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
      id={LANDING_FAQ_ID}
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
