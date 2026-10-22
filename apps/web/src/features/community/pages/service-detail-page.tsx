import { useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import type {
  PublicAnimalSummary,
  ServiceListingPublic,
  ServiceReviewPublic,
} from '@adoptafacil/contracts';
import { EmptyState, Skeleton, useToast } from '@adoptafacil/ui';
import { PublicFooter, PublicNavbar } from '../../../shell/layout';
import { useApiClient } from '../../../shell/api';
import { useSession } from '../../../shell/auth';
import { fetchGlobalPublicAnimals } from '../../catalog/api/public-animals';
import { AnimalSpotlightCard } from '../../catalog/components/animal-spotlight-card';
import { getPublicService, listPublicServiceReviews } from '../api/public-services';
import { CATEGORY_TONE, PartnerBadge } from '../components/service-card';
import {
  SERVICE_CATEGORY_SINGULAR,
  initials,
  ratingLabel,
  safeWebsiteHref,
  whatsappHref,
} from '../model/directory-view';

type LoadState = 'loading' | 'ready' | 'not-found' | 'error';

function Stars({ value }: { value: number }) {
  return (
    <span aria-label={`${value} de 5`} className="text-brand-gold">
      {'★'.repeat(value)}
      <span className="text-border">{'★'.repeat(5 - value)}</span>
    </span>
  );
}

/**
 * Perfil PÚBLICO de un servicio (`/servicios/:id`): contacto directo, reseñas
 * aprobadas, formulario de reseña para quien tiene sesión y, debajo, los
 * animales en adopción de la misma ciudad: así cada visita a un negocio
 * también lleva tráfico a los refugios.
 */
export function ServiceDetailPage() {
  const { id = '' } = useParams<{ id: string }>();
  const client = useApiClient();
  const { status: sessionStatus } = useSession();
  const { toast } = useToast();
  const [service, setService] = useState<ServiceListingPublic | null>(null);
  const [reviews, setReviews] = useState<ServiceReviewPublic[]>([]);
  const [animals, setAnimals] = useState<PublicAnimalSummary[]>([]);
  const [state, setState] = useState<LoadState>('loading');
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setState('loading');
    void (async () => {
      try {
        const found = await getPublicService(id, controller.signal);
        if (!found) {
          setState('not-found');
          return;
        }
        setService(found);
        setState('ready');
        const [page, nearby] = await Promise.all([
          listPublicServiceReviews(id, controller.signal).catch(() => null),
          fetchGlobalPublicAnimals({ city: found.city, limit: 4, signal: controller.signal }).catch(
            () => null,
          ),
        ]);
        if (page) setReviews(page.items);
        if (nearby) setAnimals(nearby.data);
      } catch {
        if (!controller.signal.aborted) setState('error');
      }
    })();
    return () => controller.abort();
  }, [id]);

  const onReview = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      await client.request(`/community/services/${encodeURIComponent(id)}/reviews`, {
        method: 'POST',
        json: { rating, ...(comment.trim() ? { comment: comment.trim() } : {}) },
      });
      setSent(true);
      toast({ title: 'Reseña enviada', description: 'Se publicará cuando la revisemos.' });
    } catch (error) {
      toast({
        title: 'No se pudo enviar la reseña',
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const whatsapp = whatsappHref(service?.whatsapp);
  const website = safeWebsiteHref(service?.website);

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <PublicNavbar />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6">
        <Link to="/servicios" className="text-sm font-semibold text-primary hover:underline">
          ← Volver al directorio
        </Link>

        {state === 'loading' && <Skeleton className="mt-4 h-72 w-full rounded-2xl" />}
        {state === 'not-found' && (
          <EmptyState
            title="Este perfil no está disponible"
            description="Puede estar en revisión o haber sido retirado."
          />
        )}
        {state === 'error' && (
          <EmptyState title="No se pudo cargar" description="Inténtalo de nuevo más tarde." />
        )}

        {state === 'ready' && service && (
          <div className="mt-4 space-y-8">
            <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
              <div className={`flex items-center gap-4 p-6 ${CATEGORY_TONE[service.category]}`}>
                <span
                  aria-hidden="true"
                  className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-card text-2xl font-bold shadow-sm"
                >
                  {initials(service.name)}
                </span>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide">
                    {SERVICE_CATEGORY_SINGULAR[service.category]} · {service.city},{' '}
                    {service.department}
                  </p>
                  <h1 className="text-2xl font-extrabold text-foreground sm:text-3xl">
                    {service.name}
                  </h1>
                  {service.isPartner && <PartnerBadge className="mt-1" />}
                  <p className="text-sm text-foreground/80">
                    {ratingLabel(service.ratingAverage, service.ratingCount)}
                  </p>
                </div>
              </div>
              <div className="grid gap-6 p-6 md:grid-cols-[2fr_1fr]">
                <div className="space-y-2">
                  {service.description && (
                    <p className="whitespace-pre-line">{service.description}</p>
                  )}
                  {service.address && (
                    <p className="text-sm text-muted-foreground">Dirección: {service.address}</p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    AdoptaFácil revisa los perfiles antes de publicarlos, pero no presta ni
                    garantiza estos servicios. El acuerdo es directamente con el negocio.
                  </p>
                </div>
                <div className="flex flex-col gap-2">
                  {whatsapp && (
                    <a
                      href={whatsapp}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-xl bg-primary px-4 py-3 text-center font-semibold text-primary-foreground hover:bg-primary/90"
                    >
                      Escribir por WhatsApp
                    </a>
                  )}
                  {service.phone && (
                    <a
                      href={`tel:${service.phone.replace(/[^\d+]/g, '')}`}
                      className="rounded-xl border-2 border-primary px-4 py-3 text-center font-semibold text-primary"
                    >
                      Llamar {service.phone}
                    </a>
                  )}
                  {website && (
                    <a
                      href={website}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      className="rounded-xl border-2 border-border px-4 py-3 text-center font-semibold"
                    >
                      Visitar sitio web
                    </a>
                  )}
                  {service.email && (
                    <a
                      href={`mailto:${service.email}`}
                      className="text-center text-sm text-primary hover:underline"
                    >
                      {service.email}
                    </a>
                  )}
                </div>
              </div>
            </section>

            <section aria-labelledby="nearby-animals">
              <div className="mb-3 flex items-end justify-between gap-2">
                <h2 id="nearby-animals" className="text-xl font-bold">
                  Animales en adopción en {service.city}
                </h2>
                <Link to="/" className="text-sm font-semibold text-primary hover:underline">
                  Ver todos
                </Link>
              </div>
              {animals.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Por ahora no hay animales publicados en esta ciudad.
                </p>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {animals.map((animal) => (
                    <AnimalSpotlightCard key={animal.id} animal={animal} />
                  ))}
                </div>
              )}
            </section>

            <section aria-labelledby="service-reviews" className="space-y-4">
              <h2 id="service-reviews" className="text-xl font-bold">
                Reseñas
              </h2>
              {reviews.length === 0 && (
                <p className="text-sm text-muted-foreground">Todavía no hay reseñas publicadas.</p>
              )}
              <ul className="space-y-3">
                {reviews.map((review) => (
                  <li key={review.id} className="rounded-xl border border-border bg-card p-4">
                    <p className="text-sm">
                      <Stars value={review.rating} />{' '}
                      <span className="font-semibold">{review.authorName}</span>
                    </p>
                    {review.comment && <p className="mt-1 text-sm">{review.comment}</p>}
                  </li>
                ))}
              </ul>

              {sessionStatus === 'authenticated' && !sent && (
                <form
                  onSubmit={onReview}
                  className="space-y-3 rounded-xl border border-border bg-card p-4"
                >
                  <fieldset>
                    <legend className="mb-1 text-sm font-semibold">Tu calificación</legend>
                    <div className="flex gap-1">
                      {[1, 2, 3, 4, 5].map((value) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => setRating(value)}
                          aria-pressed={rating === value}
                          aria-label={`${value} de 5`}
                          className={`text-2xl ${value <= rating ? 'text-brand-gold' : 'text-border'}`}
                        >
                          ★
                        </button>
                      ))}
                    </div>
                  </fieldset>
                  <label className="block text-sm font-semibold" htmlFor="review-comment">
                    Comentario (opcional)
                  </label>
                  <textarea
                    id="review-comment"
                    value={comment}
                    maxLength={1000}
                    onChange={(event) => setComment(event.target.value)}
                    className="min-h-24 w-full rounded-lg border border-input bg-background p-3 text-sm"
                    placeholder="Cuéntale a la comunidad cómo te fue. No incluyas datos personales."
                  />
                  <button
                    type="submit"
                    disabled={submitting}
                    className="rounded-xl bg-primary px-5 py-2 font-semibold text-primary-foreground disabled:opacity-60"
                  >
                    Enviar reseña
                  </button>
                </form>
              )}
              {sent && (
                <p className="text-sm text-muted-foreground">
                  Gracias. Tu reseña se publicará cuando la revisemos.
                </p>
              )}
              {sessionStatus === 'unauthenticated' && (
                <p className="text-sm">
                  <Link to="/login" className="font-semibold text-primary hover:underline">
                    Inicia sesión
                  </Link>{' '}
                  para dejar una reseña.
                </p>
              )}
            </section>
          </div>
        )}
      </main>
      <PublicFooter />
    </div>
  );
}
