import { useEffect, useState } from 'react';
import type { VolunteerOpportunityPublic } from '@adoptafacil/contracts';
import { Skeleton } from '@adoptafacil/ui';
import { listPublicVolunteerOpportunities } from '../../volunteering/api/public-volunteering';
import { VolunteerOpportunityCard } from '../../volunteering/components/volunteer-opportunity-card';
import styles from '../styles/public-catalog.module.scss';

const PAGE_SIZE = 12;
const HEADING_ID = 'portal-section-volunteering';

type SectionState = 'loading' | 'ready' | 'error';

export interface PortalVolunteeringSectionProps {
  slug: string;
}

/**
 * Sección "Voluntariado" del portal público (RF18, M08). Mismo patrón que
 * `PortalCampaignsSection`: fetch por slug
 * (`GET /public/organizations/:slug/volunteer-opportunities`), `.items` ya
 * normalizado a `[]`, estado vacío explícito. Reutiliza la tarjeta de
 * `/voluntariados` para no divergir visualmente.
 */
export function PortalVolunteeringSection({ slug }: PortalVolunteeringSectionProps) {
  const [items, setItems] = useState<VolunteerOpportunityPublic[]>([]);
  const [state, setState] = useState<SectionState>('loading');

  useEffect(() => {
    let active = true;
    setState('loading');
    listPublicVolunteerOpportunities({ slug, limit: PAGE_SIZE, offset: 0 })
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
  }, [slug]);

  return (
    <section
      aria-labelledby={HEADING_ID}
      data-testid="portal-volunteering-section"
      className="space-y-3"
    >
      <h2 id={HEADING_ID} className={styles.heading} style={{ scrollMarginTop: '5rem' }}>
        Voluntariado
      </h2>
      {state === 'loading' && <Skeleton className="h-40 w-full" />}
      {state === 'error' && (
        <p className="text-sm text-muted-foreground">
          <span className="block font-medium text-foreground">No se pudo cargar</span>
          Inténtalo de nuevo más tarde.
        </p>
      )}
      {state === 'ready' && items.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Esta organización no tiene voluntariados abiertos por ahora.
        </p>
      )}
      {state === 'ready' && items.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          {items.map((opportunity) => (
            <VolunteerOpportunityCard key={opportunity.id} opportunity={opportunity} />
          ))}
        </div>
      )}
    </section>
  );
}
