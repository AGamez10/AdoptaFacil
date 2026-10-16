import { useId, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { PublicAnimalSummary } from '@adoptafacil/contracts';
import { PLAN_CATALOG } from '@adoptafacil/contracts';
import { cn } from '@adoptafacil/ui';
import { AnimalSpotlightCard } from '../../catalog/components/animal-spotlight-card';
import { OfficialContactButtons } from '../../guide/components/official-contact-buttons';
import { officialWhatsappUrl } from '../../../lib/contact';
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

/** Ancla del catálogo (la usan el hero, el navbar y el asistente). */
export const LANDING_CATALOG_ID = 'adoptar';
/** Ancla de la sección para organizaciones. */
export const LANDING_ORGS_ID = 'organizaciones';

/** Especie en la URL pública (`?especie=perros`), en palabras de la gente. */
export const SPECIES_QUERY: Record<string, 'dog' | 'cat'> = { perros: 'dog', gatos: 'cat' };

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

/** Buscador del hero: especie + ciudad → catálogo filtrado. */
function HeroSearch({ cities }: { cities: CatalogSnapshot['cities'] }) {
  const navigate = useNavigate();
  const cityId = useId();
  const [species, setSpecies] = useState<'perros' | 'gatos' | 'todos'>('perros');
  const [city, setCity] = useState('');

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const params = new URLSearchParams();
    if (species !== 'todos') params.set('especie', species);
    if (city) params.set('ciudad', city);
    const qs = params.toString();
    navigate(`/${qs ? `?${qs}` : ''}#${LANDING_CATALOG_ID}`);
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
          to={`/o/${encodeURIComponent(animal.organization.slug)}/animales/${encodeURIComponent(animal.id)}`}
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
    <a href={`#${LANDING_CATALOG_ID}`} className={styles.avatars} data-testid="hero-avatars">
      <span className={styles.avatars__faces} aria-hidden="true">
        {faces.map((animal) => (
          <img key={animal.id} src={animal.photoUrl} alt="" className={styles.avatars__face} />
        ))}
      </span>
      <span className={styles.avatars__text}>
        <strong>{named.join(', ')}</strong>
        {rest > 0 ? ` y ${rest.toLocaleString('es-CO')} más te esperan` : ' te esperan'}
      </span>
    </a>
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
          <HeroAvatars animals={animals} total={total} />
          <p className={styles.hero__lead}>
            Perros y gatos de refugios, fundaciones y rescatistas de todo Colombia te están
            esperando. Conoce su historia, solicita en línea y firma un contrato claro.
          </p>
          <div className={styles.hero__actions}>
            <a href={`#${LANDING_CATALOG_ID}`} className={cn(styles.btn, styles['btn--primary'])}>
              Quiero adoptar
              <IconArrowRight className={styles.btn__icon} />
            </a>
            <a href="#ayudar" className={cn(styles.btn, styles['btn--ghost'])}>
              Otras formas de ayudar
            </a>
          </div>
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
          <a href={`#${LANDING_CATALOG_ID}`} className={styles.textLink}>
            Ver todos
            <IconArrowRight aria-hidden="true" />
          </a>
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

/**
 * Cifras grandes de la red (solo con datos reales) junto al globo 3D, que
 * ahora ilustra la red de organizaciones en vez de ocupar el primer pantallazo.
 */
export function ImpactSection({ snapshot }: { snapshot: CatalogSnapshot }) {
  const { total, organizations, cities } = snapshot;
  if (total === 0) return null;
  const stats = [
    { value: total, label: total === 1 ? 'animal buscando hogar' : 'animales buscando hogar' },
    {
      value: organizations.length,
      label: organizations.length === 1 ? 'organización publicando' : 'organizaciones publicando',
    },
    { value: cities.length, label: cities.length === 1 ? 'ciudad' : 'ciudades' },
  ].filter((stat) => stat.value > 0);
  return (
    <section
      className={cn(styles.section, styles['section--deep'], styles.impact)}
      aria-labelledby="landing-impact-title"
      data-testid="landing-impact"
    >
      <HeroVisual />
      <div className={cn(styles.container, styles.impact__inner)}>
        <SectionHeading
          tone="dark"
          eyebrow="Una red que crece"
          title="Rescatistas de todo el país, en un solo lugar."
          id="landing-impact-title"
        >
          Cada número sale del catálogo en vivo: nada inflado, nada inventado.
        </SectionHeading>
        <dl className={styles.stats}>
          {stats.map((stat) => (
            <div key={stat.label} className={styles.stat}>
              <dt className={styles.stat__label}>{stat.label}</dt>
              <dd className={styles.stat__value}>{stat.value.toLocaleString('es-CO')}</dd>
            </div>
          ))}
        </dl>
        {organizations.length > 0 && (
          <ul className={styles.orgs} aria-label="Organizaciones con animales publicados">
            {organizations.slice(0, 12).map((org) => (
              <li key={org.id}>
                <Link to={`/o/${encodeURIComponent(org.slug)}`} className={styles.orgChip}>
                  {org.logoUrl ? (
                    <img src={org.logoUrl} alt="" className={styles.orgChip__logo} loading="lazy" />
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
            <li key={title} className={styles.step} data-tone={tone}>
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
 * peluquerías, paseadores, tiendas). Aún no está construido, así que se
 * anuncia como "muy pronto" y el único llamado es escribirnos por WhatsApp.
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
  return (
    <section
      className={cn(styles.section, styles['section--sky'])}
      aria-labelledby="landing-community-title"
      data-testid="landing-community"
    >
      <div className={cn(styles.container, styles.community)}>
        <div className={styles.community__copy}>
          <SectionHeading
            eyebrow="Comunidad · muy pronto"
            title="Todo el mundo de tu mascota, en un solo lugar."
            id="landing-community-title"
          >
            Después de adoptar empieza lo mejor. Estamos sumando a los negocios y profesionales que
            cuidan a los animales en Colombia, para que encuentres todo sin salir de AdoptaFácil.
          </SectionHeading>
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
        </div>
        <ul className={styles.ecosystem}>
          {ECOSYSTEM.map(({ title, text, tone }) => (
            <li key={title} className={styles.eco} data-tone={tone}>
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
 * Planes para organizaciones (catálogo real de `packages/contracts`). Los
 * precios de Crece y Pro están por validar con los refugios del piloto
 * (TODO(client) en `plans.ts`), así que aquí no se publican todavía.
 */
const SHOW_PAID_PRICES = false;

const PLAN_HIGHLIGHTS: Record<keyof typeof PLAN_CATALOG, string[]> = {
  free: [
    'Portal público con tu logo',
    'Animales, adopciones y contrato en línea',
    'Campañas y recaudo de donaciones',
    'Hasta 3 personas del equipo',
  ],
  crece: [
    'Todo lo del plan Gratis',
    'Los 4 diseños de portal, sin sello',
    'Correos con tu marca',
    'Reporte de impacto y exportar datos',
  ],
  pro: [
    'Todo lo del plan Crece',
    'Tu propio dominio',
    'Apadrinamiento de empresas',
    'Soporte prioritario por WhatsApp',
  ],
};

function planPrice(key: keyof typeof PLAN_CATALOG): string {
  const plan = PLAN_CATALOG[key];
  if (plan.monthlyPriceCop === 0) return 'Gratis, siempre';
  if (!SHOW_PAID_PRICES) return 'Muy pronto';
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
              <li key={title} className={styles.feature}>
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
            planes suman marca, alcance y comodidad.
          </p>
          <ul className={styles.plans__grid}>
            {(['free', 'crece', 'pro'] as const).map((key) => (
              <li
                key={key}
                className={cn(styles.plan, key === 'free' && styles['plan--featured'])}
                data-testid={`plan-${key}`}
              >
                <p className={styles.plan__name}>{PLAN_CATALOG[key].name}</p>
                <p className={styles.plan__price}>{planPrice(key)}</p>
                <p className={styles.plan__tagline}>{PLAN_CATALOG[key].tagline}</p>
                <ul className={styles.plan__list}>
                  {PLAN_HIGHLIGHTS[key].map((item) => (
                    <li key={item}>
                      <IconCheck className={styles.plan__check} />
                      {item}
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
            <li key={title} className={styles.promise}>
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
