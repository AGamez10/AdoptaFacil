import { useEffect, useState } from 'react';
import type { VolunteerOpportunityPublic } from '@adoptafacil/contracts';
import { Link } from 'react-router-dom';
import { Skeleton } from '@adoptafacil/ui';
import { fetchPublicOrgVolunteering } from '../api/public-volunteering';
import { volunteerSignupHref } from '../../volunteering/model/volunteering-view';
import styles from '../styles/public-catalog.module.scss';

const PAGE_SIZE = 12;
const HEADING_ID = 'portal-section-volunteering';

const SHORT_DATE = new Intl.DateTimeFormat('es-CO', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
});

function shortDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : SHORT_DATE.format(date);
}

export interface PortalVolunteeringSectionProps {
  slug: string;
}

/**
 * Sección "Voluntariado" del portal público de la organización. Muestra SOLO
 * las jornadas abiertas de esa organización (el backend ya filtra activas y
 * vigentes). Si no hay jornadas, la sección no se monta: nunca un bloque vacío.
 */
export function PortalVolunteeringSection({ slug }: PortalVolunteeringSectionProps) {
  const [items, setItems] = useState<VolunteerOpportunityPublic[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    const controller = new AbortController();
    setState('loading');
    fetchPublicOrgVolunteering({ slug, limit: PAGE_SIZE, offset: 0, signal: controller.signal })
      .then((page) => {
        if (controller.signal.aborted) return;
        setItems(page.items);
        setState('ready');
      })
      .catch(() => {
        if (!controller.signal.aborted) setState('error');
      });
    return () => controller.abort();
  }, [slug]);

  if (state === 'ready' && items.length === 0) return null;

  return (
    <section
      aria-labelledby={HEADING_ID}
      data-testid="portal-volunteering-section"
      className="space-y-3"
    >
      <h2 id={HEADING_ID} className={styles.heading} style={{ fontSize: 'var(--fs-h3)' }}>
        Voluntariado
      </h2>
      {state === 'loading' && <Skeleton className="h-32 w-full" />}
      {state === 'error' && (
        <p className="text-sm text-muted-foreground">
          <span className="block font-medium text-foreground">No se pudo cargar</span>
          Inténtalo de nuevo más tarde.
        </p>
      )}
      {state === 'ready' && items.length > 0 && (
        <ul className="flex flex-col gap-3">
          {items.map((opportunity) => (
            <li key={opportunity.id} className="rounded-lg border p-4">
              <Link to={volunteerSignupHref(opportunity.id)} className="block space-y-1">
                <span className="text-xs font-medium text-muted-foreground">
                  {opportunity.appliesToStudentService ? 'Servicio social' : opportunity.category}
                </span>
                <span className="block font-semibold text-foreground">{opportunity.title}</span>
                <span className="block text-sm text-muted-foreground">
                  {opportunity.location} · {shortDate(opportunity.startDate)} al{' '}
                  {shortDate(opportunity.endDate)}
                  {typeof opportunity.capacity === 'number'
                    ? ` · ${opportunity.capacity} cupos`
                    : ''}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
