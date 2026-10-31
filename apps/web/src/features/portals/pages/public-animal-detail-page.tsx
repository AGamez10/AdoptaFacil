import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import type {
  AnimalSummary,
  OrganizationPublic,
  PublicAnimalSummary,
} from '@adoptafacil/contracts';
import { buttonVariants, cn, EmptyState, Skeleton } from '@adoptafacil/ui';
import {
  animalDescription,
  animalTitle,
  animalUrlSegment,
  parseAnimalUrlSegment,
  publicAnimalPath,
  SPECIES_PLURAL,
} from '../../../seo/page-meta.js';
import { breadcrumbLd, useSeo } from '../../../seo/seo';
import { PublicFooter, PublicNavbar } from '../../../shell/layout';
import { brandTokensToStyle } from '../../../shell/theme';
import { AnimalSpotlightCard } from '../../catalog/components/animal-spotlight-card';
import { ADOPT_BASE_PATH, buildAdoptPath } from '../../catalog/model/adopt-filters';
import { fetchPublicAnimal, fetchPublicAnimals } from '../api/public-animals';
import { AnimalDetailActions } from '../components/animal-detail-actions';
import {
  ageLabel,
  buildAdoptionRequestHref,
  isRecentlyPublished,
  SEX_LABELS,
  SIZE_LABELS,
  SPECIES_LABELS,
  STATUS_LABELS,
} from '../model/animals-catalog';
import { resolveOrgSubdomain } from '../model/subdomain';
import { isEngineTemplate, loadDesign } from '../templates/registry';
import type { TemplateDesign } from '../templates/engine/types';
import { usePublicTheme } from '../templates/use-public-theme';
import { useTemplateAssets } from '../templates/use-template-assets';
import { useGuideContext } from '../../guide/model/guide-context';
import styles from './public-animal-detail-page.module.scss';

const SIMILAR_MAX = 4;

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

type DetailState = 'loading' | 'ready' | 'not-found' | 'error';
type PublicOrgProfile = Pick<
  OrganizationPublic,
  'id' | 'name' | 'logoUrl' | 'description' | 'location' | 'nit' | 'whatsapp' | 'contactEmail'
>;

interface AnimalNavState {
  animal?: AnimalSummary | PublicAnimalSummary;
}

const ADOPTION_STEPS = [
  'Envías tu solicitud en línea, con tu cuenta.',
  'La organización te contacta y conoce tu hogar.',
  'Firman un contrato claro y empieza su nueva vida.',
];

/**
 * Detalle PÚBLICO de un animal adoptable en el portal `/o/:slug/animales/:animalId`
 * (§M14/M03). Sin autenticación y con SOLO campos públicos de `AnimalSummary` — nunca
 * expediente clínico, recordatorios ni documentos (superficie interna de M03). Al
 * navegar desde una tarjeta el animal llega por nav-state (sin refetch); en deep-link
 * se pide a `GET /public/organizations/:slug/animals/:ref`. La URL es
 * `/o/:slug/animales/<nombre>-<código público>`; un enlace viejo con el id interno
 * sigue funcionando y se reemplaza por la URL nueva (sin dejar el id en la barra).
 *
 * Rediseño 2026-10 (marca v3): foto grande, datos en fichas de color, tarjeta de la
 * organización, llamado principal fijo abajo en celular y "más animales" de la misma
 * organización. En el subdominio propio de una organización no se muestra el navbar
 * ni el pie de AdoptaFácil (es su casa digital, no la nuestra).
 *
 * El botón "Solicitar adopción" enlaza al flujo de T-028a (Persona autenticada). La
 * ruta destino está bajo `RequireAuth`: sin sesión, returnTo a login y regreso al
 * animal (deny-by-default); con sesión, entra directo.
 *
 * F-LANDING-02: un animal se alcanza tanto desde el portal general como desde el
 * portal de su organización — por eso ofrece "Volver al inicio" (siempre, sin fetch)
 * y "Ver {nombre real}" (best-effort; si el nombre no carga, no aparece).
 */
export function PublicAnimalDetailPage() {
  const { slug, animalId: segment } = useParams<{ slug: string; animalId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const preloaded = (location.state as AnimalNavState | null)?.animal;
  const onOrgSubdomain = Boolean(
    resolveOrgSubdomain(
      window.location.hostname,
      import.meta.env.VITE_PORTAL_BASE_DOMAIN as string | undefined,
    ),
  );

  const [animal, setAnimal] = useState<AnimalSummary | null>(preloaded ?? null);
  const [state, setState] = useState<DetailState>(preloaded ? 'ready' : 'loading');
  const animalRef = useRef(animal);
  animalRef.current = animal;
  const [org, setOrg] = useState<PublicOrgProfile | null>(null);
  const [catalog, setCatalog] = useState<AnimalSummary[]>([]);

  // La ficha toma la temática de la plantilla de la organización (colores,
  // tipografía y decoración de su diseño). Sin plantilla de motor, se queda
  // con el diseño de la aplicación.
  const publicTheme = usePublicTheme(slug);
  const engine = isEngineTemplate(publicTheme.template) ? publicTheme.template : null;
  const [design, setDesign] = useState<TemplateDesign | null>(null);
  const themeStyle = useMemo(() => brandTokensToStyle(publicTheme.tokens), [publicTheme.tokens]);

  useEffect(() => {
    if (!engine) {
      setDesign(null);
      return;
    }
    let active = true;
    loadDesign(engine)
      .then((loaded) => {
        if (active) setDesign(loaded);
      })
      .catch(() => {
        if (active) setDesign(null);
      });
    return () => {
      active = false;
    };
  }, [engine]);
  useTemplateAssets(design);

  // Deep-link: una lectura del animal por su código (o id heredado). Antes se
  // buscaba dentro de las primeras 50 filas del catálogo y los animales más
  // viejos de una organización grande no cargaban.
  useEffect(() => {
    if (preloaded) return;
    const parsed = parseAnimalUrlSegment(segment);
    if (!slug || !parsed) {
      setState('not-found');
      return;
    }
    // Tras reemplazar un enlace viejo por la URL canónica, el animal ya está
    // cargado: no se vuelve a pedir ni se muestra el esqueleto otra vez.
    const current = animalRef.current;
    if (current && (current.publicCode === parsed.ref || current.id === parsed.ref)) return;
    const controller = new AbortController();
    setState('loading');
    fetchPublicAnimal(slug, parsed.ref, controller.signal)
      .then((found) => {
        setAnimal(found);
        setState(found ? 'ready' : 'not-found');
      })
      .catch(() => {
        if (!controller.signal.aborted) setState('error');
      });
    return () => controller.abort();
  }, [preloaded, slug, segment]);

  // "Más animales" de la organización: solo los primeros, nunca el catálogo entero.
  useEffect(() => {
    if (!slug) return;
    let active = true;
    fetchPublicAnimals({ slug, limit: SIMILAR_MAX + 1, offset: 0 })
      .then((page) => {
        if (active) setCatalog(page.items);
      })
      .catch(() => {
        // Best-effort: la sección simplemente no aparece.
      });
    return () => {
      active = false;
    };
  }, [slug]);

  // URL canónica: un enlace viejo (id) o con otro nombre se reemplaza por
  // /o/<org>/animales/<nombre>-<código> sin sumar una entrada al historial.
  useEffect(() => {
    if (!slug || !animal?.publicCode || !segment) return;
    if (segment.toLowerCase() !== animalUrlSegment(animal)) {
      navigate(publicAnimalPath(slug, animal), { replace: true, state: location.state });
    }
  }, [animal, slug, segment, navigate, location.state]);

  const others = useMemo(
    () => catalog.filter((a) => a.id !== animal?.id).slice(0, SIMILAR_MAX),
    [catalog, animal?.id],
  );

  useEffect(() => {
    if (!slug) return;
    let active = true;
    fetch(`${API_BASE}/public/organizations/${encodeURIComponent(slug)}`)
      .then((response) => (response.ok ? (response.json() as Promise<PublicOrgProfile>) : null))
      .then((body) => {
        if (active && body?.name) setOrg(body);
      })
      .catch(() => {
        // Best-effort: "Ver {org}" simply stays absent; "Volver al inicio" remains.
      });
    return () => {
      active = false;
    };
  }, [slug]);

  const orgName = org?.name ?? null;
  const city =
    (preloaded && 'organization' in preloaded ? preloaded.organization.city : undefined) ??
    org?.location?.city;

  useSeo({
    title: animal ? animalTitle(animal, city) : undefined,
    description: animal ? animalDescription(animal, orgName, city) : undefined,
    path: slug && animal ? publicAnimalPath(slug, animal) : undefined,
    image: animal?.photoUrl,
    noindex: state === 'not-found',
    jsonLd: animal
      ? [
          breadcrumbLd([
            { name: 'Inicio', path: '/' },
            { name: 'Adoptar', path: ADOPT_BASE_PATH },
            { name: SPECIES_PLURAL[animal.species], path: buildAdoptPath(animal.species) },
            { name: animal.name, path: publicAnimalPath(slug ?? '', animal) },
          ]),
        ]
      : [],
  });

  // Ayuda de la ficha: habla de este animal y su WhatsApp es el de la organización.
  useGuideContext(
    org && animal
      ? {
          kind: 'portal',
          organization: { name: org.name, whatsapp: org.whatsapp, contactEmail: org.contactEmail },
          animalName: animal.name,
        }
      : null,
  );

  // El llamado fijo de celular ocupa el borde inferior: el botón de Ayuda sube.
  useEffect(() => {
    if (state !== 'ready') return;
    const root = document.documentElement;
    root.style.setProperty('--af-bottom-bar', '5rem');
    return () => {
      root.style.removeProperty('--af-bottom-bar');
    };
  }, [state]);

  const age = animal ? ageLabel(animal.computedAge) : undefined;
  const facts = animal
    ? [
        { label: 'Especie', value: SPECIES_LABELS[animal.species], tone: 'mint' },
        { label: 'Sexo', value: SEX_LABELS[animal.sex], tone: 'sun' },
        { label: 'Tamaño', value: SIZE_LABELS[animal.size], tone: 'sky' },
        ...(age ? [{ label: 'Edad aproximada', value: age, tone: 'coral' }] : []),
      ]
    : [];

  const toCard = (item: AnimalSummary): PublicAnimalSummary | null =>
    slug && org
      ? {
          ...item,
          organization: {
            id: org.id,
            name: org.name,
            slug,
            logoUrl: org.logoUrl,
            city: org.location?.city,
          },
        }
      : null;
  const similar = others.map(toCard).filter((item): item is PublicAnimalSummary => item !== null);

  const page = (
    <main className={styles.page}>
      <div className={styles.container}>
        {/* F1-03+: botones SECUNDARIOS (outline): nunca compiten con "Solicitar adopción". */}
        <div className={styles.back}>
          <Link to="/" className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}>
            ← Volver al inicio
          </Link>
          {slug && orgName && (
            <Link
              to={`/o/${encodeURIComponent(slug)}`}
              className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
            >
              Ver {orgName}
            </Link>
          )}
          {!onOrgSubdomain && animal && (
            <Link to={buildAdoptPath(animal.species, city)} className={styles.backMore}>
              Más {SPECIES_LABELS[animal.species].toLowerCase()}s en adopción
              {city ? ` en ${city}` : ''}
            </Link>
          )}
        </div>

        {state === 'loading' && <Skeleton className="mt-6 h-96 w-full rounded-[2rem]" />}
        {state === 'not-found' && (
          <div className="mt-6">
            <EmptyState
              title="Animal no encontrado"
              description="Este animal ya no está disponible para adopción o el enlace no es válido."
            />
            {/* El QR del carnet de un animal adoptado sigue impreso: quien lo
                escanea llega a la organización en vez de a un callejón. */}
            {slug && (
              <div className="mt-4 flex justify-center">
                <Link
                  to={`/o/${encodeURIComponent(slug)}`}
                  className={cn(buttonVariants({ variant: 'outline' }))}
                  data-testid="animal-not-found-org-link"
                >
                  Conocer la organización y sus otros animales
                </Link>
              </div>
            )}
          </div>
        )}
        {state === 'error' && (
          <div className="mt-6">
            <EmptyState title="No se pudo cargar" description="Inténtalo de nuevo más tarde." />
          </div>
        )}

        {state === 'ready' && animal && (
          <article className={styles.detail} data-testid="public-animal-detail">
            <div className={styles.media}>
              {animal.photoUrl ? (
                <img
                  src={animal.photoUrl}
                  alt={`${animal.name}${animal.breed ? `, ${animal.breed}` : ''}`}
                  className={styles.media__photo}
                  {...{ fetchpriority: 'high' }}
                />
              ) : (
                <div className={styles.media__empty}>
                  <span>Sin foto todavía</span>
                </div>
              )}
              <div className={styles.media__badges}>
                {isRecentlyPublished(animal.createdAt) && (
                  <span className={styles.badge}>Nuevo</span>
                )}
                <span className={cn(styles.badge, styles['badge--glass'])}>
                  {STATUS_LABELS[animal.status]}
                </span>
              </div>
            </div>

            <div className={styles.info}>
              <h1 className={styles.name}>{animal.name}</h1>
              <p className={styles.subtitle}>
                {[animal.breed, city].filter(Boolean).join(' · ') ||
                  'Busca un hogar para toda la vida'}
              </p>

              <dl className={styles.facts}>
                {facts.map((fact) => (
                  <div key={fact.label} className={styles.fact} data-tone={fact.tone}>
                    <dt>{fact.label}</dt>
                    <dd>{fact.value}</dd>
                  </div>
                ))}
              </dl>

              <div className={styles.actions}>
                <AnimalDetailActions
                  animal={animal}
                  orgName={orgName ?? undefined}
                  donateOrganization={org ?? undefined}
                  layout="hero"
                />
              </div>

              {org && (
                <section className={styles.org} aria-label="Organización responsable">
                  {org.logoUrl ? (
                    <img src={org.logoUrl} alt="" className={styles.org__logo} />
                  ) : (
                    <span className={styles.org__logo} aria-hidden="true">
                      {org.name.charAt(0)}
                    </span>
                  )}
                  <div className={styles.org__body}>
                    <p className={styles.org__eyebrow}>Lo cuida</p>
                    <p className={styles.org__name}>{org.name}</p>
                    {org.location?.city && <p className={styles.org__meta}>{org.location.city}</p>}
                  </div>
                </section>
              )}

              <section className={styles.steps} aria-labelledby="adopt-steps-title">
                <h2 id="adopt-steps-title" className={styles.steps__title}>
                  Así es adoptar a {animal.name}
                </h2>
                <ol className={styles.steps__list}>
                  {ADOPTION_STEPS.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
              </section>
            </div>
          </article>
        )}

        {state === 'ready' && similar.length > 0 && (
          <section className={styles.similar} aria-labelledby="similar-title">
            <div className={styles.similar__head}>
              <h2 id="similar-title" className={styles.similar__title}>
                Más amigos de {orgName}
              </h2>
              {!onOrgSubdomain && (
                <Link to={ADOPT_BASE_PATH} className={styles.backMore}>
                  Ver todos los animales
                </Link>
              )}
            </div>
            <ul className={styles.similar__grid}>
              {similar.map((item) => (
                <li key={item.id}>
                  <AnimalSpotlightCard animal={item} />
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      {state === 'ready' && animal && (
        <div className={styles.stickyCta}>
          <div className={styles.stickyCta__text}>
            <strong>{animal.name}</strong>
            <span>te está esperando</span>
          </div>
          <Link
            to={buildAdoptionRequestHref(animal.organizationId, animal)}
            className={styles.stickyCta__button}
          >
            Solicitar adopción
          </Link>
        </div>
      )}
    </main>
  );

  const themed = design ? (
    <div
      className={`af-tpl tpl-${design.id}${design.kit ? ' kit' : ''}`}
      style={themeStyle}
      data-testid="animal-detail-template"
      data-template={design.id}
    >
      {/* La ficha se lee sobre su hoja clara (textos e iconos de la app). La
          plantilla pone el fondo, la tipografía y el acento alrededor. */}
      <div
        style={{
          background: 'var(--af-cream)',
          color: 'var(--af-ink)',
          borderRadius: 'clamp(16px, 2.4vw, 32px)',
          margin: 'clamp(8px, 2vw, 24px)',
          overflow: 'hidden',
          boxShadow: '0 24px 60px -30px rgb(0 0 0 / 0.5)',
        }}
      >
        {page}
      </div>
    </div>
  ) : (
    page
  );

  if (onOrgSubdomain) return themed;
  return (
    <div className="flex min-h-screen flex-col bg-[var(--af-cream)] text-[var(--af-ink)]">
      <PublicNavbar />
      <div className="flex-1">{themed}</div>
      <PublicFooter />
    </div>
  );
}
