import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  SERVICE_CATEGORIES,
  type ServiceCategory,
  type ServiceListingPublic,
} from '@adoptafacil/contracts';
import { EmptyState, Skeleton } from '@adoptafacil/ui';
import { PublicFooter, PublicNavbar } from '../../../shell/layout';
import { listPublicServices } from '../api/public-services';
import { ServiceCard } from '../components/service-card';
import { SERVICE_CATEGORY_LABELS } from '../model/directory-view';

type ListState = 'loading' | 'ready' | 'error';
const PAGE_SIZE = 24;

/**
 * Directorio PÚBLICO de servicios del ecosistema animal (`/servicios`):
 * veterinarias, peluquerías, paseadores y tiendas revisados por la
 * plataforma. Sin sesión. Filtros en forma de píldoras y búsqueda por ciudad;
 * cada perfil enlaza a los animales en adopción de su ciudad.
 */
export function ServicesDirectoryPage() {
  const [items, setItems] = useState<ServiceListingPublic[]>([]);
  const [total, setTotal] = useState(0);
  const [state, setState] = useState<ListState>('loading');
  const [category, setCategory] = useState<ServiceCategory | 'all'>('all');
  const [cityInput, setCityInput] = useState('');
  const [city, setCity] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    setState('loading');
    listPublicServices({
      limit: PAGE_SIZE,
      offset: 0,
      ...(category !== 'all' ? { category } : {}),
      ...(city ? { city } : {}),
      signal: controller.signal,
    })
      .then((page) => {
        setItems(page.items);
        setTotal(page.total);
        setState('ready');
      })
      .catch(() => {
        if (!controller.signal.aborted) setState('error');
      });
    return () => controller.abort();
  }, [category, city]);

  const onSearch = (event: FormEvent) => {
    event.preventDefault();
    setCity(cityInput.trim());
  };

  const pill = (active: boolean) =>
    `inline-flex items-center gap-2 rounded-xl border-2 px-4 py-2 text-sm font-semibold transition ${
      active
        ? 'border-primary bg-primary/10 text-foreground'
        : 'border-border bg-card text-foreground hover:border-primary/60'
    }`;

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <PublicNavbar />

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
        <header className="mb-6 space-y-2">
          <p className="text-sm font-semibold uppercase tracking-wide text-primary">Comunidad</p>
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
            Todo lo que tu mascota necesita, cerca de ti
          </h1>
          <p className="max-w-2xl text-muted-foreground">
            Veterinarias, peluquerías, paseadores y tiendas revisados por AdoptaFácil. Cada visita
            ayuda a que más animales de los refugios encuentren hogar.
          </p>
        </header>

        <form
          onSubmit={onSearch}
          className="mb-4 flex max-w-xl overflow-hidden rounded-xl border-2 border-border bg-card focus-within:border-primary"
        >
          <label htmlFor="services-city" className="sr-only">
            Ciudad
          </label>
          <input
            id="services-city"
            value={cityInput}
            onChange={(event) => setCityInput(event.target.value)}
            placeholder="Escribe tu ciudad, por ejemplo Medellín"
            className="min-w-0 flex-1 bg-transparent px-4 py-3 text-base outline-none"
          />
          <button
            type="submit"
            className="bg-primary px-5 font-semibold text-primary-foreground hover:bg-primary/90"
          >
            Buscar
          </button>
        </form>

        <div className="mb-6 flex flex-wrap gap-2" role="group" aria-label="Tipo de servicio">
          <button
            type="button"
            onClick={() => setCategory('all')}
            aria-pressed={category === 'all'}
            className={pill(category === 'all')}
          >
            Todos
          </button>
          {SERVICE_CATEGORIES.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setCategory(value)}
              aria-pressed={category === value}
              className={pill(category === value)}
            >
              {category === value && (
                <span aria-hidden="true" className="h-2 w-2 rounded-full bg-primary" />
              )}
              {SERVICE_CATEGORY_LABELS[value]}
            </button>
          ))}
        </div>

        {state === 'ready' && (
          <p className="mb-4 text-sm text-muted-foreground" aria-live="polite">
            {total === 1 ? '1 servicio' : `${total} servicios`}
            {city ? ` en ${city}` : ''}
          </p>
        )}

        {state === 'loading' && <Skeleton className="h-72 w-full rounded-2xl" />}
        {state === 'error' && (
          <EmptyState title="No se pudo cargar" description="Inténtalo de nuevo más tarde." />
        )}
        {state === 'ready' && items.length === 0 && (
          <EmptyState
            title="Aún no hay servicios aquí"
            description="Prueba con otra ciudad u otro tipo de servicio."
          />
        )}
        {state === 'ready' && items.length > 0 && (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((service) => (
              <ServiceCard key={service.id} service={service} />
            ))}
          </div>
        )}

        <section className="mt-12 flex flex-col items-start gap-3 rounded-2xl bg-brand-teal/10 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-bold">¿Tienes un negocio para mascotas?</h2>
            <p className="text-sm text-muted-foreground">
              Publica tu perfil gratis. Lo revisamos antes de mostrarlo.
            </p>
          </div>
          <Link
            to="/mi-negocio"
            className="rounded-xl bg-primary px-5 py-3 font-semibold text-primary-foreground hover:bg-primary/90"
          >
            Publicar mi negocio
          </Link>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}
