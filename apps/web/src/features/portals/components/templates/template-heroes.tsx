import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { Link } from 'react-router-dom';
import type { AnimalSummary, PortalProfile, PortalTemplateOptions } from '@adoptafacil/contracts';
import { OrgTypeBadge } from '../org-type-badge';
import { initials, reviewedDocumentBadges } from '../portal-profile-section';
import {
  SEX_LABELS,
  SPECIES_LABELS,
  ageLabel,
  buildAdoptionRequestHref,
  publicAnimalDetailHref,
} from '../../model/animals-catalog';
import { ConstellationCanvas } from './constellation-canvas';
import styles from './portal-templates.module.scss';
import historias from './historias.module.scss';

/**
 * Héroes de las plantillas Editorial, Carnet e Impacto (Ola 3). Leen los
 * MISMOS datos públicos que la plantilla Clásica (`PortalProfileSection`):
 * perfil público, conteo real de animales y una muestra real del catálogo.
 * Ninguno inventa cifras ni muestra datos privados. Cada uno es el único h1
 * de la página y respeta `prefers-reduced-motion`.
 */
export interface TemplateHeroProps {
  profile: PortalProfile;
  slug: string;
  animalCount?: number;
  /** Muestra real del catálogo (primeros animales adoptables). */
  animals: AnimalSummary[];
  actions?: ReactNode;
  /** Ajustes de la plantilla ya resueltos (`resolveTemplateOptions`). */
  options?: PortalTemplateOptions;
}

const HEADING_ID = 'portal-profile-heading';

function locationOf(profile: PortalProfile): string {
  const loc = profile.organization.location;
  return [loc?.city, loc?.department].filter(Boolean).join(', ');
}

function animalsLabel(count: number): string {
  return count === 1 ? 'animal busca hogar' : 'animales buscan hogar';
}

function Seals({ profile, className }: { profile: PortalProfile; className?: string }) {
  const seals = reviewedDocumentBadges(profile.organization.verificationLevel?.criteria);
  if (seals.length === 0) return null;
  return (
    <ul className={className} aria-label="Documentos revisados por la plataforma">
      {seals.map((label) => (
        <li key={label}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
          {label}
        </li>
      ))}
    </ul>
  );
}

function Logo({ profile, className }: { profile: PortalProfile; className: string }) {
  const org = profile.organization;
  return org.logoUrl ? (
    <img src={org.logoUrl} alt={`Logo de ${org.name}`} className={className} />
  ) : (
    <span aria-hidden className={className} data-fallback="true">
      {initials(org.name)}
    </span>
  );
}

/** Huella decorativa (misma que el carnet del animal). */
function Paw({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden fill="currentColor">
      <ellipse cx="24" cy="31" rx="11" ry="9" />
      <ellipse cx="9" cy="21" rx="4.6" ry="6" />
      <ellipse cx="19" cy="12" rx="4.6" ry="6.4" />
      <ellipse cx="29" cy="12" rx="4.6" ry="6.4" />
      <ellipse cx="39" cy="21" rx="4.6" ry="6" />
    </svg>
  );
}

function animalHref(slug: string, animal: AnimalSummary): string {
  return publicAnimalDetailHref(slug, animal);
}

// ---------------------------------------------------------------------------
// Editorial: portada de revista. Titular enorme a la izquierda, foto en arco a
// la derecha y una tira de tres animales reales como "en esta edición".
// ---------------------------------------------------------------------------
export function EditorialHero({
  profile,
  slug,
  animalCount,
  animals,
  actions,
  options = {},
}: TemplateHeroProps) {
  const org = profile.organization;
  const cover = org.coverPhotos?.[0];
  const location = locationOf(profile);
  const featured =
    options.showFeatured === false ? [] : animals.filter((a) => a.photoUrl).slice(0, 3);

  return (
    <section
      aria-labelledby={HEADING_ID}
      className={styles.editorial}
      data-testid="portal-hero-editorial"
    >
      <div className={styles.editorial__text}>
        <p className={styles.editorial__kicker}>
          <Logo profile={profile} className={styles.editorial__logo} />
          <span>{location || 'Colombia'}</span>
          <OrgTypeBadge organizationType={profile.organizationType} />
        </p>
        <h1 id={HEADING_ID} className={styles.editorial__name}>
          {org.name}
        </h1>
        {org.description && <p className={styles.editorial__lead}>{org.description}</p>}
        <dl className={styles.editorial__facts}>
          {typeof animalCount === 'number' && (
            <div data-testid="portal-animal-count">
              <dt>{animalsLabel(animalCount)}</dt>
              <dd>{animalCount}</dd>
            </div>
          )}
          {org.nit && (
            <div>
              <dt>NIT</dt>
              <dd className={styles.editorial__small}>{org.nit}</dd>
            </div>
          )}
        </dl>
        <Seals profile={profile} className={styles.seals} />
        {actions}
      </div>

      <div className={styles.editorial__media}>
        <div className={styles.editorial__arch} data-shape={options.photoShape ?? 'arco'}>
          {cover ? <img src={cover} alt="" /> : <div className={styles.editorial__archFallback} />}
        </div>
        {featured.length > 0 && (
          <div className={styles.editorial__strip}>
            <p>En esta edición</p>
            <ul>
              {featured.map((animal) => (
                <li key={animal.id}>
                  <Link to={animalHref(slug, animal)}>
                    <img src={animal.photoUrl} alt="" />
                    <span>{animal.name}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Carnet: la organización presentada como el carnet de identidad de sus
// animales (la pieza favorita de los usuarios): banda navy, huellas, foto
// enmarcada y una ficha de datos. Debajo, mini carnets de animales reales.
// ---------------------------------------------------------------------------
export function CarnetHero({
  profile,
  slug,
  animalCount,
  animals,
  actions,
  options = {},
}: TemplateHeroProps) {
  const org = profile.organization;
  const cover = org.coverPhotos?.[0];
  const location = locationOf(profile);
  const featured = options.showMinis === false ? [] : animals.slice(0, 4);

  return (
    <section
      aria-labelledby={HEADING_ID}
      className={styles.carnet}
      data-testid="portal-hero-carnet"
    >
      <div className={styles.carnet__card}>
        <Paw className={styles.carnet__paw1} />
        <Paw className={styles.carnet__paw2} />
        <header className={styles.carnet__band}>
          <Logo profile={profile} className={styles.carnet__logo} />
          <div>
            <p className={styles.carnet__eyebrow}>Ficha de la organización</p>
            <h1 id={HEADING_ID} className={styles.carnet__name}>
              {org.name}
            </h1>
          </div>
        </header>
        <div className={styles.carnet__body}>
          <div className={styles.carnet__photo}>
            {cover ? <img src={cover} alt="" /> : <Paw className={styles.carnet__photoPaw} />}
          </div>
          <div className={styles.carnet__data}>
            <dl>
              {profile.organizationType && (
                <div>
                  <dt>Tipo</dt>
                  <dd>
                    <OrgTypeBadge organizationType={profile.organizationType} />
                  </dd>
                </div>
              )}
              {location && (
                <div>
                  <dt>Ubicación</dt>
                  <dd>{location}</dd>
                </div>
              )}
              {typeof animalCount === 'number' && (
                <div data-testid="portal-animal-count">
                  <dt>En adopción</dt>
                  <dd>
                    <strong>{animalCount}</strong> {animalsLabel(animalCount)}
                  </dd>
                </div>
              )}
              {org.nit && (
                <div>
                  <dt>NIT</dt>
                  <dd>{org.nit}</dd>
                </div>
              )}
            </dl>
            {org.description && <p className={styles.carnet__about}>{org.description}</p>}
            <Seals profile={profile} className={styles.seals} />
            {actions}
          </div>
        </div>
      </div>

      {featured.length > 0 && (
        <ul className={styles.carnet__minis} aria-label="Algunos de nuestros animales">
          {featured.map((animal) => (
            <li key={animal.id}>
              <Link to={animalHref(slug, animal)} className={styles.mini}>
                <span className={styles.mini__photo}>
                  {animal.photoUrl ? <img src={animal.photoUrl} alt="" /> : <Paw />}
                </span>
                <span className={styles.mini__name}>{animal.name}</span>
                {animal.breed && <span className={styles.mini__meta}>{animal.breed}</span>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Impacto: oscura y tipográfica. El número real de animales que buscan hogar
// es el protagonista; debajo, una cinta en movimiento con sus caras.
// ---------------------------------------------------------------------------
export function ImpactoHero({
  profile,
  slug,
  animalCount,
  animals,
  actions,
  options = {},
}: TemplateHeroProps) {
  const org = profile.organization;
  const location = locationOf(profile);
  const ribbon = animals.filter((a) => a.photoUrl).slice(0, 8);
  const mosaic = options.showMosaic === false ? [] : ribbon.slice(0, 4);
  const hasCount = typeof animalCount === 'number' && animalCount > 0;

  return (
    <section
      aria-labelledby={HEADING_ID}
      className={styles.impacto}
      data-testid="portal-hero-impacto"
    >
      <div className={styles.impacto__glow} aria-hidden="true" />
      <div className={styles.impacto__inner}>
        <p className={styles.impacto__kicker}>
          <Logo profile={profile} className={styles.impacto__logo} />
          {location || 'Colombia'}
        </p>
        {hasCount ? (
          <p className={styles.impacto__count} data-testid="portal-animal-count">
            <span className={styles.impacto__number}>{animalCount}</span>
            <span className={styles.impacto__label}>{animalsLabel(animalCount)}</span>
          </p>
        ) : null}
        <h1 id={HEADING_ID} className={styles.impacto__name} data-big={!hasCount}>
          {hasCount ? <>con {org.name}</> : org.name}
        </h1>
        {org.description && <p className={styles.impacto__lead}>{org.description}</p>}
        <Seals profile={profile} className={styles.seals} />
        {actions}
      </div>

      {mosaic.length > 0 && (
        <div className={styles.impacto__mosaic} data-count={mosaic.length} aria-hidden="true">
          {mosaic.map((animal) => (
            <img key={animal.id} src={animal.photoUrl} alt="" />
          ))}
        </div>
      )}

      {ribbon.length > 0 && (
        <div
          className={styles.ribbon}
          aria-label="Animales que buscan hogar"
          role="region"
          data-motion={options.motion === false ? 'off' : 'on'}
        >
          <ul className={styles.ribbon__track}>
            {ribbon.map((animal) => (
              <li key={animal.id}>
                <Link to={animalHref(slug, animal)} className={styles.ribbon__chip}>
                  <img src={animal.photoUrl} alt="" />
                  {animal.name}
                </Link>
              </li>
            ))}
            {/* Copia decorativa para que la cinta sea continua. */}
            {ribbon.map((animal) => (
              <li key={`${animal.id}-copy`} aria-hidden="true">
                <span className={styles.ribbon__chip}>
                  <img src={animal.photoUrl} alt="" />
                  {animal.name}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Órbita: una constelación three.js que forma una huella detrás del nombre.
// Con el número real de animales (opcional) y sus fotos en una fila flotante.
// ---------------------------------------------------------------------------
export function OrbitaHero({
  profile,
  slug,
  animalCount,
  animals,
  actions,
  options = {},
}: TemplateHeroProps) {
  const org = profile.organization;
  const location = locationOf(profile);
  const faces = animals.filter((a) => a.photoUrl).slice(0, 5);
  const showCount =
    options.showCount !== false && typeof animalCount === 'number' && animalCount > 0;
  const density = (options.density as 'suave' | 'media' | 'intensa' | undefined) ?? 'media';

  return (
    <section
      aria-labelledby={HEADING_ID}
      className={styles.orbita}
      data-testid="portal-hero-orbita"
    >
      <ConstellationCanvas density={density} />
      <div className={styles.orbita__inner}>
        <p className={styles.orbita__kicker}>
          <Logo profile={profile} className={styles.orbita__logo} />
          {location || 'Colombia'}
        </p>
        <h1 id={HEADING_ID} className={styles.orbita__name}>
          {org.name}
        </h1>
        {org.description && <p className={styles.orbita__lead}>{org.description}</p>}
        {showCount && (
          <p className={styles.orbita__count} data-testid="portal-animal-count">
            <strong>{animalCount}</strong> {animalsLabel(animalCount)}
          </p>
        )}
        <Seals profile={profile} className={styles.seals} />
        {actions}
      </div>
      {faces.length > 0 && (
        <ul className={styles.orbita__faces} aria-label="Algunos de nuestros animales">
          {faces.map((animal, index) => (
            <li key={animal.id} style={{ ['--i' as string]: index }}>
              <Link to={animalHref(slug, animal)}>
                <img src={animal.photoUrl} alt="" />
                <span>{animal.name}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Historias (Pro): los animales a pantalla completa, uno por "historia", que
// se pasan con el dedo (scroll-snap nativo) o con flechas/teclado. La primera
// es la portada (video opcional de la organización), luego un animal real por
// historia y al final "Ver todos". Sin librería de carrusel.
// ---------------------------------------------------------------------------
export interface HistoriasHeroProps extends TemplateHeroProps {
  /** Video de portada ya resuelto por la API (público, de la propia org). */
  coverVideoUrl?: string;
  /** Lleva al catálogo completo (sección "Mascotas en adopción"). */
  onBrowseCatalog?: () => void;
}

/** Cada cuánto pasa sola la historia cuando `autoAdvance` está encendido. */
export const HISTORIAS_AUTO_MS = 6000;

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/** Sin video si el visitante pidió menos movimiento o ahorrar datos. */
function shouldPlayVideo(): boolean {
  if (prefersReducedMotion()) return false;
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  return connection?.saveData !== true;
}

export function HistoriasHero({
  profile,
  slug,
  animalCount,
  animals,
  actions,
  options = {},
  coverVideoUrl,
  onBrowseCatalog,
}: HistoriasHeroProps) {
  const org = profile.organization;
  const cover = org.coverPhotos?.[0];
  const location = locationOf(profile);
  const stories = animals.slice(0, 8);
  const total = stories.length + 2; // portada + animales + "ver todos"
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [playVideo, setPlayVideo] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);
  const autoAdvance = options.autoAdvance === true && !prefersReducedMotion();
  const totalAnimals = typeof animalCount === 'number' ? animalCount : stories.length;

  useEffect(() => {
    setPlayVideo(Boolean(coverVideoUrl) && shouldPlayVideo());
  }, [coverVideoUrl]);

  const goTo = useCallback(
    (next: number) => {
      const clamped = Math.max(0, Math.min(total - 1, next));
      setIndex(clamped);
      const track = trackRef.current;
      if (!track) return;
      const left = clamped * track.clientWidth;
      if (typeof track.scrollTo === 'function') {
        track.scrollTo({ left, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
      } else {
        track.scrollLeft = left;
      }
    },
    [total],
  );

  // El dedo mueve el scroll; el índice se lee de la posición.
  const onScroll = () => {
    const track = trackRef.current;
    if (!track || track.clientWidth === 0) return;
    const next = Math.round(track.scrollLeft / track.clientWidth);
    if (next !== index) setIndex(next);
  };

  useEffect(() => {
    if (!autoAdvance || paused) return;
    const timer = window.setTimeout(
      () => goTo(index + 1 >= total ? 0 : index + 1),
      HISTORIAS_AUTO_MS,
    );
    return () => window.clearTimeout(timer);
  }, [autoAdvance, paused, index, total, goTo]);

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      goTo(index + 1);
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      goTo(index - 1);
    }
  };

  const slideProps = (position: number, label: string) => ({
    className: historias.slide,
    role: 'group' as const,
    'aria-roledescription': 'historia',
    'aria-label': `${position + 1} de ${total}: ${label}`,
    // Solo la historia visible recibe foco y clics.
    ...(position === index ? {} : { inert: '' }),
  });

  return (
    <section
      aria-labelledby={HEADING_ID}
      aria-roledescription="carrusel"
      className={historias.historias}
      data-testid="portal-hero-historias"
      onKeyDown={onKeyDown}
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <ol className={historias.progress} aria-hidden="true">
        {Array.from({ length: total }, (_, position) => (
          <li
            key={position}
            data-state={position < index ? 'done' : position === index ? 'current' : 'next'}
            data-running={position === index && autoAdvance && !paused ? 'true' : undefined}
            style={{ ['--story-ms' as string]: `${HISTORIAS_AUTO_MS}ms` }}
          />
        ))}
      </ol>

      <div ref={trackRef} className={historias.track} onScroll={onScroll}>
        <article {...slideProps(0, 'portada')} data-kind="cover">
          <div className={historias.media}>
            {playVideo && coverVideoUrl ? (
              <video
                src={coverVideoUrl}
                poster={cover}
                autoPlay
                muted
                loop
                playsInline
                aria-hidden="true"
                data-testid="historias-cover-video"
              />
            ) : cover ? (
              <img src={cover} alt="" />
            ) : null}
          </div>
          <div className={historias.content}>
            <p className={historias.kicker}>
              <Logo profile={profile} className={historias.logo} />
              <span>{location || 'Colombia'}</span>
            </p>
            <h1 id={HEADING_ID} className={historias.name}>
              {org.name}
            </h1>
            {org.description && <p className={historias.lead}>{org.description}</p>}
            {typeof animalCount === 'number' && animalCount > 0 && (
              <p className={historias.count} data-testid="portal-animal-count">
                <strong>{animalCount}</strong> {animalsLabel(animalCount)}
              </p>
            )}
            <Seals profile={profile} className={historias.seals} />
            {actions}
          </div>
        </article>

        {stories.map((animal, i) => {
          const facts = [
            SPECIES_LABELS[animal.species],
            animal.breed,
            ageLabel(animal.computedAge),
            animal.sex !== 'unknown' ? SEX_LABELS[animal.sex] : undefined,
          ].filter(Boolean);
          return (
            <article key={animal.id} {...slideProps(i + 1, animal.name)} data-kind="animal">
              <div className={historias.media}>
                {animal.photoUrl ? (
                  <img src={animal.photoUrl} alt={`Foto de ${animal.name}`} loading="lazy" />
                ) : (
                  <Paw className={historias.paw} />
                )}
              </div>
              <div className={historias.content}>
                <p className={historias.kicker}>Busca hogar</p>
                <h2 className={historias.animalName}>{animal.name}</h2>
                {facts.length > 0 && <p className={historias.facts}>{facts.join(' · ')}</p>}
                <div className={historias.actions}>
                  <Link
                    to={buildAdoptionRequestHref(animal.organizationId, animal)}
                    className={historias.btnPrimary}
                  >
                    Quiero adoptar a {animal.name}
                  </Link>
                  <Link
                    to={publicAnimalDetailHref(slug, animal)}
                    state={{ animal }}
                    className={historias.btnGhost}
                  >
                    Ver ficha
                  </Link>
                </div>
              </div>
            </article>
          );
        })}

        <article {...slideProps(total - 1, 'ver todos')} data-kind="end">
          <div className={historias.media} />
          <div className={historias.content} data-align="center">
            <Paw className={historias.endPaw} />
            <h2 className={historias.animalName}>
              {totalAnimals > 0
                ? `Conoce a ${totalAnimals === 1 ? 'nuestro animal' : `los ${totalAnimals} animales`}`
                : 'Pronto tendremos animales en adopción'}
            </h2>
            {totalAnimals > 0 && (
              <a
                href="#portal-section-pets"
                className={historias.btnPrimary}
                onClick={(event) => {
                  if (!onBrowseCatalog) return;
                  event.preventDefault();
                  onBrowseCatalog();
                }}
              >
                Ver todos los animales
              </a>
            )}
          </div>
        </article>
      </div>

      <button
        type="button"
        className={historias.nav}
        data-side="prev"
        onClick={() => goTo(index - 1)}
        disabled={index === 0}
        aria-label="Historia anterior"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 5l-7 7 7 7" />
        </svg>
      </button>
      <button
        type="button"
        className={historias.nav}
        data-side="next"
        onClick={() => goTo(index + 1)}
        disabled={index === total - 1}
        aria-label="Historia siguiente"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </button>
      <p className="sr-only" aria-live={autoAdvance ? 'off' : 'polite'}>
        Historia {index + 1} de {total}
      </p>
    </section>
  );
}
