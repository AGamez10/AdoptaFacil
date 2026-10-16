import { useEffect, useState } from 'react';
import {
  ServiceListingStatus,
  type ServiceListing,
  type ServiceListingsPage,
  type ServiceReview,
  type ServiceReviewsPage,
} from '@adoptafacil/contracts';
import { Badge, Button, EmptyState, Input, Skeleton, useToast } from '@adoptafacil/ui';
import { PageContainer, PageHeader } from '../../_layout';
import { useApiClient } from '../../../shell/api';
import { SERVICE_CATEGORY_SINGULAR, SERVICE_STATUS_LABELS } from '../model/directory-view';

type Decision = 'approve' | 'reject' | 'hide';
type Tab = 'services' | 'reviews';

/**
 * `/plataforma/servicios` (Comunidad): la plataforma aprueba, rechaza u oculta
 * perfiles del directorio y sus reseñas. Rechazar u ocultar pide motivo; cada
 * decisión queda auditada en el tenant del negocio.
 */
export function ServicesModerationPage() {
  const client = useApiClient();
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>('services');
  const [status, setStatus] = useState<ServiceListingStatus>(ServiceListingStatus.Pending);
  const [listings, setListings] = useState<ServiceListing[]>([]);
  const [reviews, setReviews] = useState<ServiceReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = async (): Promise<void> => {
    if (tab === 'services') {
      const page = await client.request<Partial<ServiceListingsPage<ServiceListing>>>(
        `/platform/community/services?status=${status}&limit=50`,
      );
      setListings(Array.isArray(page?.items) ? page.items : []);
    } else {
      const page = await client.request<Partial<ServiceReviewsPage<ServiceReview>>>(
        `/platform/community/service-reviews?status=${status}&limit=50`,
      );
      setReviews(Array.isArray(page?.items) ? page.items : []);
    }
  };

  useEffect(() => {
    let active = true;
    setLoading(true);
    void load()
      .catch(() => undefined)
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [client, tab, status]);

  const decide = async (id: string, decision: Decision): Promise<void> => {
    const reason = reasons[id]?.trim();
    if (decision !== 'approve' && !reason) {
      toast({ title: 'Escribe el motivo', variant: 'destructive' });
      return;
    }
    setBusy(id);
    try {
      const path =
        tab === 'services'
          ? `/platform/community/services/${id}/moderate`
          : `/platform/community/service-reviews/${id}/moderate`;
      await client.request(path, {
        method: 'PATCH',
        json: { decision, ...(reason ? { reason } : {}) },
      });
      await load();
    } catch (error) {
      toast({
        title: 'No se pudo aplicar la decisión',
        description: error instanceof Error ? error.message : undefined,
        variant: 'destructive',
      });
    } finally {
      setBusy(null);
    }
  };

  const actions = (id: string, current: string) => (
    <div className="flex flex-wrap items-center gap-2 pt-2">
      <Input
        aria-label="Motivo"
        placeholder="Motivo (obligatorio para rechazar u ocultar)"
        value={reasons[id] ?? ''}
        onChange={(event) => setReasons({ ...reasons, [id]: event.target.value })}
        className="min-w-56 flex-1"
      />
      {current !== 'approved' && (
        <Button disabled={busy === id} onClick={() => void decide(id, 'approve')}>
          Aprobar
        </Button>
      )}
      {current === 'pending' && (
        <Button variant="outline" disabled={busy === id} onClick={() => void decide(id, 'reject')}>
          Rechazar
        </Button>
      )}
      {current === 'approved' && (
        <Button variant="outline" disabled={busy === id} onClick={() => void decide(id, 'hide')}>
          Ocultar
        </Button>
      )}
    </div>
  );

  const tabClass = (active: boolean) =>
    `rounded-lg px-4 py-2 text-sm font-semibold ${active ? 'bg-primary text-primary-foreground' : 'bg-muted'}`;

  return (
    <PageContainer>
      <PageHeader
        title="Directorio de servicios"
        description="Revisa perfiles y reseñas antes de que aparezcan en público."
      />
      <div className="mb-4 flex flex-wrap gap-2">
        <button
          type="button"
          className={tabClass(tab === 'services')}
          onClick={() => setTab('services')}
        >
          Perfiles
        </button>
        <button
          type="button"
          className={tabClass(tab === 'reviews')}
          onClick={() => setTab('reviews')}
        >
          Reseñas
        </button>
        <select
          aria-label="Estado"
          value={status}
          onChange={(event) => setStatus(event.target.value as ServiceListingStatus)}
          className="rounded-lg border border-input bg-background px-3 py-2 text-sm"
        >
          {Object.values(ServiceListingStatus).map((value) => (
            <option key={value} value={value}>
              {SERVICE_STATUS_LABELS[value]}
            </option>
          ))}
        </select>
      </div>

      {loading && <Skeleton className="h-40 w-full" />}
      {!loading && tab === 'services' && listings.length === 0 && (
        <EmptyState title="Nada por revisar" />
      )}
      {!loading && tab === 'reviews' && reviews.length === 0 && (
        <EmptyState title="Nada por revisar" />
      )}

      {!loading && tab === 'services' && (
        <div className="space-y-3">
          {listings.map((listing) => (
            <article key={listing.id} className="rounded-2xl border border-border bg-card p-5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold uppercase text-muted-foreground">
                    {SERVICE_CATEGORY_SINGULAR[listing.category]} · {listing.city},{' '}
                    {listing.department}
                  </p>
                  <h3 className="text-lg font-bold">{listing.name}</h3>
                </div>
                <Badge variant="secondary">{SERVICE_STATUS_LABELS[listing.status]}</Badge>
              </div>
              {listing.description && <p className="mt-1 text-sm">{listing.description}</p>}
              <p className="mt-1 text-sm text-muted-foreground">
                {[listing.address, listing.whatsapp, listing.phone, listing.website, listing.email]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
              {actions(listing.id, listing.status)}
            </article>
          ))}
        </div>
      )}

      {!loading && tab === 'reviews' && (
        <div className="space-y-3">
          {reviews.map((review) => (
            <article key={review.id} className="rounded-2xl border border-border bg-card p-5">
              <p className="text-xs font-semibold uppercase text-muted-foreground">
                {review.listingName}
              </p>
              <p className="font-semibold">
                {'★'.repeat(review.rating)} · {review.authorName}
              </p>
              {review.comment && <p className="text-sm">{review.comment}</p>}
              {actions(review.id, review.status)}
            </article>
          ))}
        </div>
      )}
    </PageContainer>
  );
}
