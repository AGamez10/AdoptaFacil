import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { VolunteerOpportunityPublic } from '@adoptafacil/contracts';
import { EmptyState, Skeleton } from '@adoptafacil/ui';
import { PublicFooter, PublicNavbar, PublicPageBody, PublicPageHero } from '../../../shell/layout';
import { listPublicVolunteerOpportunities } from '../api/public-volunteering';
import { VolunteerOpportunityCard } from '../components/volunteer-opportunity-card';
import { OPPORTUNITY_QUERY_PARAM } from '../model/volunteering-view';

type ListState = 'loading' | 'ready' | 'error';
// Tope del backend (`public_volunteer_opportunities` acota a 50).
const PAGE_SIZE = 50;

/**
 * Portal PÚBLICO de voluntariado (RF18, M08) en `/voluntariados`. Sin
 * autenticación, mismo patrón que `/campanas`: lista las oportunidades ACTIVAS
 * de todas las organizaciones (`GET /public/volunteer-opportunities`), para
 * dar exposición a refugios de todo el país. Mirar no pide cuenta; solo
 * «Quiero participar» la pide (`/voluntariado`, bajo `RequireAuth`) y vuelve
 * a esa jornada. `?oportunidad=<id>` resalta la jornada elegida en la landing.
 */
export function PublicVolunteeringPage() {
  const [items, setItems] = useState<VolunteerOpportunityPublic[]>([]);
  const [state, setState] = useState<ListState>('loading');
  const [search] = useSearchParams();
  const highlightedId = search.get(OPPORTUNITY_QUERY_PARAM);

  useEffect(() => {
    let active = true;
    setState('loading');
    listPublicVolunteerOpportunities({ limit: PAGE_SIZE, offset: 0 })
      .then((page) => {
        if (!active) return;
        setItems(page.items);
        setState('ready');
      })
      .catch(() => {
        if (active) setState('error');
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (state !== 'ready' || !highlightedId) return;
    document
      .getElementById(`oportunidad-${highlightedId}`)
      ?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
  }, [state, highlightedId]);

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <PublicNavbar />

      <main className="flex-1">
        <PublicPageHero
          eyebrow="Dona tu tiempo"
          tone="mint"
          title="Voluntariados"
          lead="Súmate a las jornadas de las organizaciones de protección animal del país."
        />
        <PublicPageBody>
          {state === 'loading' && <Skeleton className="h-64 w-full" />}
          {state === 'error' && (
            <EmptyState title="No se pudo cargar" description="Inténtalo de nuevo más tarde." />
          )}
          {state === 'ready' && items.length === 0 && (
            <EmptyState
              title="Sin voluntariados abiertos"
              description="No hay voluntariados abiertos ahora. Vuelve pronto."
            />
          )}
          {state === 'ready' && items.length > 0 && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((opportunity) => (
                <VolunteerOpportunityCard
                  key={opportunity.id}
                  opportunity={opportunity}
                  highlighted={opportunity.id === highlightedId}
                />
              ))}
            </div>
          )}
        </PublicPageBody>
      </main>

      <PublicFooter />
    </div>
  );
}
