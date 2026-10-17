import { useEffect, useId, useMemo, useState, type ReactNode } from 'react';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import type { AnimalSex, AnimalSize } from '@adoptafacil/contracts';
import { cn } from '@adoptafacil/ui';
import { PublicFooter, PublicNavbar } from '../../../shell/layout';
import { adoptDescription } from '../../../seo/page-meta.js';
import { breadcrumbLd, itemListLd, useSeo } from '../../../seo/seo';
import { CatMascot, DogMascot } from '../../landing/components/illustrations';
import landing from '../../landing/components/landing.module.scss';
import {
  publicAnimalDetailHref,
  SEX_LABELS,
  SIZE_LABELS,
} from '../../portals/model/animals-catalog';
import { AnimalSpotlightCard } from '../components/animal-spotlight-card';
import { ColombiaMap, type CityCount } from '../components/colombia-map';
import {
  AGE_GROUP_LABELS,
  SORT_LABELS,
  adoptTitle,
  applyAdoptFilters,
  buildAdoptPath,
  citySlug,
  speciesFromSlug,
  type AdoptFilters,
  type AgeGroup,
  type SortKey,
} from '../model/adopt-filters';
import { useAdoptableAnimals } from '../model/use-adoptable-animals';
import styles from './adopt-page.module.scss';

const PAGE_STEP = 24;

const SPECIES_TABS = [
  { key: 'all', label: 'Todos' },
  { key: 'dog', label: 'Perros' },
  { key: 'cat', label: 'Gatos' },
  { key: 'other', label: 'Otros' },
] as const;

const SIZE_KEYS = Object.keys(SIZE_LABELS) as AnimalSize[];
const SEX_KEYS = (Object.keys(SEX_LABELS) as AnimalSex[]).filter((key) => key !== 'unknown');
const AGE_KEYS = Object.keys(AGE_GROUP_LABELS) as AgeGroup[];
const SORT_KEYS = Object.keys(SORT_LABELS) as SortKey[];

function pickKey<T extends string>(value: string | null, keys: readonly T[]): T | null {
  return value && (keys as readonly string[]).includes(value) ? (value as T) : null;
}

/** "santa-marta" → "Santa Marta" mientras llegan los datos con el nombre real. */
function titleFromSlug(slug: string): string {
  return slug
    .split('-')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function pluralAnimals(count: number): string {
  return count === 1 ? '1 animal espera hogar' : `${count} animales esperan hogar`;
}

/**
 * Listado público de animales en adopción (rediseño 2026-10), con URLs limpias
 * por especie y ciudad (`/adoptar/perros/bogota`). Filtros a la vista, mapa de
 * Colombia con las ciudades que tienen animales y tarjetas grandes con foto.
 * Todo sale de `GET /public/animals`; los filtros de tamaño, sexo y edad
 * viajan en la URL para poder compartir la búsqueda.
 */
export function AdoptPage() {
  const { especie, ciudad } = useParams();
  const species = speciesFromSlug(especie);
  if (species === null) return <Navigate to="/adoptar" replace />;
  return <AdoptListing species={species} citySlugParam={ciudad ?? null} />;
}

function AdoptListing({
  species,
  citySlugParam,
}: {
  species: AdoptFilters['species'];
  citySlugParam: string | null;
}) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { status, animals, total } = useAdoptableAnimals(species);
  const [visible, setVisible] = useState(PAGE_STEP);
  const [showMap, setShowMap] = useState(false);
  const [query, setQuery] = useState(searchParams.get('q') ?? '');
  const ids = { search: useId(), size: useId(), sex: useId(), age: useId(), sort: useId() };

  const cities = useMemo<CityCount[]>(() => {
    const counts = new Map<string, CityCount>();
    for (const animal of animals) {
      const city = animal.organization.city;
      if (!city) continue;
      const key = citySlug(city);
      const entry = counts.get(key);
      if (entry) entry.count += 1;
      else counts.set(key, { city, count: 1 });
    }
    return [...counts.values()].sort((a, b) => b.count - a.count || a.city.localeCompare(b.city));
  }, [animals]);

  const city = citySlugParam
    ? (cities.find((entry) => citySlug(entry.city) === citySlugParam)?.city ??
      titleFromSlug(citySlugParam))
    : null;

  const filters: AdoptFilters = {
    species,
    city,
    size: pickKey(searchParams.get('tamano'), SIZE_KEYS),
    sex: pickKey(searchParams.get('sexo'), SEX_KEYS),
    age: pickKey(searchParams.get('edad'), AGE_KEYS),
    query: searchParams.get('q') ?? '',
    sort: pickKey(searchParams.get('orden'), SORT_KEYS) ?? 'recientes',
  };
  const results = useMemo(
    () => applyAdoptFilters(animals, filters),
    [animals, species, city, searchParams],
  );

  const title = adoptTitle(species, city);
  const canonicalPath = buildAdoptPath(species, city);

  // Al cambiar de especie o ciudad, vuelve a la primera tanda de tarjetas.
  useEffect(() => setVisible(PAGE_STEP), [species, citySlugParam, searchParams]);

  // La búsqueda libre se escribe en la URL con una pausa corta.
  useEffect(() => {
    const handle = window.setTimeout(() => {
      if ((searchParams.get('q') ?? '') === query.trim()) return;
      setParam('q', query.trim() || null);
    }, 250);
    return () => window.clearTimeout(handle);
  }, [query]);

  function setParam(key: string, value: string | null) {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    setSearchParams(next, { replace: true });
  }

  const search = searchParams.toString() ? `?${searchParams.toString()}` : '';
  const goTo = (nextSpecies: AdoptFilters['species'], nextCity: string | null) =>
    navigate(`${buildAdoptPath(nextSpecies, nextCity)}${search}`);

  const extraFilters = ['tamano', 'sexo', 'edad', 'q'].filter((key) => searchParams.get(key));
  const hasFilters = extraFilters.length > 0 || Boolean(city);
  const incomplete = status === 'ready' && total > animals.length;

  const crumbs = [
    { label: 'Inicio', to: '/' },
    { label: 'Adoptar', to: '/adoptar' },
    ...(species !== 'all'
      ? [
          {
            label: SPECIES_TABS.find((tab) => tab.key === species)?.label ?? '',
            to: buildAdoptPath(species),
          },
        ]
      : []),
    ...(city ? [{ label: city, to: buildAdoptPath(species, city) }] : []),
  ];

  useSeo({
    title,
    description: adoptDescription(species, city, status === 'ready' ? results.length : null),
    path: canonicalPath,
    // Las combinaciones de filtros extra no son páginas propias para buscadores.
    noindex: extraFilters.length > 0 || (status === 'ready' && results.length === 0),
    jsonLd: [
      breadcrumbLd(crumbs.map((crumb) => ({ name: crumb.label, path: crumb.to }))),
      itemListLd(
        results.slice(0, 24).map((animal) => ({
          name: animal.name,
          path: publicAnimalDetailHref(animal.organization.slug, animal.id),
          image: animal.photoUrl,
        })),
      ),
    ],
  });

  return (
    <div className="flex min-h-screen flex-col bg-[var(--af-cream)] text-[var(--af-ink)]">
      <PublicNavbar />
      <main className="flex-1" id="contenido">
        <header className={styles.head}>
          <div className={landing.container}>
            <nav aria-label="Ruta de navegación">
              <ol className={styles.crumbs}>
                {crumbs.map((crumb, index) => (
                  <li key={crumb.to}>
                    {index === crumbs.length - 1 ? (
                      <span aria-current="page">{crumb.label}</span>
                    ) : (
                      <Link to={crumb.to}>{crumb.label}</Link>
                    )}
                  </li>
                ))}
              </ol>
            </nav>
            <h1 className={styles.title}>{title}</h1>
            <p className={styles.lead} data-testid="adopt-count" aria-live="polite">
              {status === 'loading' && 'Buscando animales…'}
              {status === 'error' && 'No pudimos cargar los animales en este momento.'}
              {status === 'ready' &&
                `${pluralAnimals(results.length)}${city ? ` en ${city}` : ''}.`}
            </p>
            <div className={styles.tabs} role="tablist" aria-label="Especie">
              {SPECIES_TABS.map((tab) => (
                <Link
                  key={tab.key}
                  role="tab"
                  aria-selected={species === tab.key}
                  to={`${buildAdoptPath(tab.key, city)}${search}`}
                  className={cn(styles.tab, species === tab.key && styles['tab--active'])}
                >
                  {tab.label}
                </Link>
              ))}
            </div>
          </div>
        </header>

        <div className={styles.filtersBar}>
          <div className={cn(landing.container, styles.filters)} role="search">
            <label htmlFor={ids.search} className="sr-only">
              Buscar por nombre, raza u organización
            </label>
            <input
              id={ids.search}
              type="search"
              className={cn(styles.field, styles['field--search'])}
              placeholder="Nombre, raza u organización"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <FilterSelect
              id={ids.size}
              label="Tamaño"
              value={filters.size}
              options={SIZE_KEYS.map((key) => [key, SIZE_LABELS[key]])}
              onChange={(value) => setParam('tamano', value)}
            />
            <FilterSelect
              id={ids.sex}
              label="Sexo"
              value={filters.sex}
              options={SEX_KEYS.map((key) => [key, SEX_LABELS[key]])}
              onChange={(value) => setParam('sexo', value)}
            />
            <FilterSelect
              id={ids.age}
              label="Edad"
              value={filters.age}
              options={AGE_KEYS.map((key) => [key, AGE_GROUP_LABELS[key]])}
              onChange={(value) => setParam('edad', value)}
            />
            <FilterSelect
              id={ids.sort}
              label="Ordenar"
              value={filters.sort}
              options={SORT_KEYS.map((key) => [key, SORT_LABELS[key]])}
              onChange={(value) => setParam('orden', value === 'recientes' ? null : value)}
              required
            />
            {hasFilters && (
              <button
                type="button"
                className={styles.clear}
                onClick={() => {
                  setQuery('');
                  navigate(buildAdoptPath(species));
                }}
              >
                Quitar filtros
              </button>
            )}
          </div>
        </div>

        <div className={cn(landing.container, styles.layout)}>
          <aside className={styles.side} aria-label="Ciudades">
            <button
              type="button"
              className={styles.mapToggle}
              aria-expanded={showMap}
              onClick={() => setShowMap((value) => !value)}
            >
              {showMap ? 'Ocultar mapa' : 'Ver ciudades en el mapa'}
            </button>
            <div className={cn(styles.mapCard, showMap && styles['mapCard--open'])}>
              <h2 className={styles.mapCard__title}>¿Dónde están?</h2>
              {status === 'ready' && cities.length > 0 ? (
                <ColombiaMap
                  cities={cities}
                  selectedCity={city}
                  onSelectCity={(next) => goTo(species, next)}
                />
              ) : (
                <p className={styles.muted}>
                  {status === 'loading'
                    ? 'Cargando ciudades…'
                    : 'Aún no hay ciudades para mostrar.'}
                </p>
              )}
            </div>
          </aside>

          <section className={styles.results} aria-label="Resultados">
            {status === 'loading' && (
              <ul className={styles.grid} aria-hidden="true">
                {Array.from({ length: 6 }, (_, index) => (
                  <li key={index} className={styles.skeleton} />
                ))}
              </ul>
            )}

            {status === 'error' && (
              <EmptyMessage
                title="Algo falló al cargar"
                text="Revisa tu conexión y vuelve a intentarlo en un momento."
                action={
                  <button
                    type="button"
                    className={cn(landing.btn, landing['btn--ink'])}
                    onClick={() => window.location.reload()}
                  >
                    Reintentar
                  </button>
                }
              />
            )}

            {status === 'ready' && results.length === 0 && (
              <EmptyMessage
                title={
                  hasFilters
                    ? 'No encontramos animales con esos filtros'
                    : 'Aún no hay animales aquí'
                }
                text={
                  hasFilters
                    ? 'Prueba con otra ciudad o quita algún filtro. Cada semana llegan nuevos.'
                    : 'Las organizaciones publican nuevos animales cada semana. Vuelve pronto.'
                }
                action={
                  hasFilters ? (
                    <Link
                      to={buildAdoptPath(species)}
                      className={cn(landing.btn, landing['btn--ink'])}
                    >
                      Ver todos
                    </Link>
                  ) : (
                    <Link to="/campanas" className={cn(landing.btn, landing['btn--ink'])}>
                      Ver campañas activas
                    </Link>
                  )
                }
              />
            )}

            {status === 'ready' && results.length > 0 && (
              <>
                <ul className={styles.grid} data-testid="adopt-results">
                  {results.slice(0, visible).map((animal, index) => (
                    <li key={animal.id}>
                      <AnimalSpotlightCard animal={animal} priority={index === 0} />
                    </li>
                  ))}
                </ul>
                {visible < results.length && (
                  <div className={styles.more}>
                    <button
                      type="button"
                      className={cn(landing.btn, landing['btn--ghost'])}
                      onClick={() => setVisible((value) => value + PAGE_STEP)}
                    >
                      Ver más animales ({results.length - visible})
                    </button>
                  </div>
                )}
                {incomplete && (
                  <p className={styles.muted}>
                    Mostramos los {animals.length} publicados más recientes de {total}. Usa los
                    filtros para encontrar el resto.
                  </p>
                )}
              </>
            )}
          </section>
        </div>
      </main>
      <PublicFooter />
    </div>
  );
}

function FilterSelect<T extends string>({
  id,
  label,
  value,
  options,
  onChange,
  required = false,
}: {
  id: string;
  label: string;
  value: T | null;
  options: [T, string][];
  onChange: (value: T | null) => void;
  required?: boolean;
}) {
  return (
    <div className={styles.select}>
      <label htmlFor={id} className={styles.select__label}>
        {label}
      </label>
      <select
        id={id}
        className={cn(styles.field, value && !required && styles['field--active'])}
        value={value ?? ''}
        onChange={(event) => onChange((event.target.value || null) as T | null)}
      >
        {!required && <option value="">Cualquiera</option>}
        {options.map(([key, text]) => (
          <option key={key} value={key}>
            {text}
          </option>
        ))}
      </select>
    </div>
  );
}

function EmptyMessage({ title, text, action }: { title: string; text: string; action: ReactNode }) {
  return (
    <div className={styles.empty} data-testid="adopt-empty">
      <div className={styles.empty__art} aria-hidden="true">
        <DogMascot className={styles.empty__dog} />
        <CatMascot className={styles.empty__cat} />
      </div>
      <h2 className={styles.empty__title}>{title}</h2>
      <p className={styles.empty__text}>{text}</p>
      {action}
    </div>
  );
}
