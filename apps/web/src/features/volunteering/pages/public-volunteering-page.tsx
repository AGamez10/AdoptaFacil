import { useEffect, useState } from 'react';
import type { VolunteerOpportunityPublic } from '@adoptafacil/contracts';
import { EmptyState, Skeleton } from '@adoptafacil/ui';
import { PublicFooter, PublicNavbar } from '../../../shell/layout';
import { listPublicVolunteerOpportunities } from '../api/public-volunteering';
import { VolunteerOpportunityCard } from '../components/volunteer-opportunity-card';

type ListState = 'loading' | 'ready' | 'error';
// Tope del backend (`public_volunteer_opportunities` acota a 50).
const PAGE_SIZE = 50;

/**
 * Portal PÚBLICO de voluntariado (RF18, M08) en `/voluntariados`. Sin
 * autenticación, mismo patrón que `/campanas`: lista las oportunidades ACTIVAS
 * de todas las organizaciones (`GET /public/volunteer-opportunities`), para
 * dar exposición a refugios de todo el país. Inscribirse sigue exigiendo
 * cuenta: la tarjeta lleva a `/voluntariado` (bajo `RequireAuth`), que NO es
 * esta pantalla.
 */
export function PublicVolunteeringPage() {
  const [items, setItems] = useState<VolunteerOpportunityPublic[]>([]);
  const [state, setState] = useState<ListState>('loading');

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

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <PublicNavbar />

      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10 sm:px-6">
        <header className="mb-8 space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Voluntariados</h1>
          <p className="text-sm text-muted-foreground">
            Súmate a las jornadas de las organizaciones de protección animal del país.
          </p>
        </header>

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
              <VolunteerOpportunityCard key={opportunity.id} opportunity={opportunity} />
            ))}
          </div>
        )}
      </main>

      <PublicFooter />
    </div>
  );
}
