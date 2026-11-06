import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatDayEs, type VolunteerOpportunityPublic } from '@adoptafacil/contracts';
import { Skeleton } from '@adoptafacil/ui';
import { fetchPublicOrgVolunteering } from '../api/public-volunteering';
import { volunteerSignupHref } from '../../volunteering/model/volunteering-view';
import { formatBogota } from '../../volunteering/model/volunteering-view';
import styles from '../styles/public-catalog.module.scss';

const HEADING_ID = 'portal-section-volunteering';

/**
 * "Voluntariado" del portal público clásico: las convocatorias abiertas que
 * publica la organización, con sus días de jornada y el botón para
 * inscribirse. Sin voluntariados abiertos la sección no se monta (igual que
 * "Campaña activa").
 */
export function PortalVolunteeringSection({ slug }: { slug: string }) {
  const [items, setItems] = useState<VolunteerOpportunityPublic[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    const controller = new AbortController();
    setState('loading');
    fetchPublicOrgVolunteering({ slug, signal: controller.signal })
      .then((list) => {
        setItems(list);
        setState('ready');
      })
      .catch(() => {
        if (!controller.signal.aborted) setState('error');
      });
    return () => controller.abort();
  }, [slug]);

  if ((state === 'ready' && items.length === 0) || state === 'error') return null;

  return (
    <section
      id={HEADING_ID}
      aria-labelledby={`${HEADING_ID}-title`}
      data-testid="portal-volunteering-section"
      className="space-y-3"
      style={{ scrollMarginTop: '5rem' }}
    >
      <h2
        id={`${HEADING_ID}-title`}
        className={styles.heading}
        style={{ fontSize: 'var(--fs-h3)' }}
      >
        Voluntariado
      </h2>
      {state === 'loading' && <Skeleton className="h-32 w-full" />}
      {state === 'ready' && (
        <ul className="flex flex-col gap-3">
          {items.map((v) => (
            <li key={v.id} className="space-y-1.5 rounded-2xl border bg-card p-4 text-sm">
              <p className="font-semibold text-foreground">{v.title}</p>
              <p className="text-xs text-muted-foreground">
                {formatBogota(v.startDate)} – {formatBogota(v.endDate)} · {v.location}
              </p>
              {v.sessionDates && v.sessionDates.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  Jornadas: {v.sessionDates.slice(0, 4).map(formatDayEs).join(' · ')}
                  {v.sessionDates.length > 4 ? ` y ${v.sessionDates.length - 4} más` : ''}
                </p>
              )}
              {v.appliesToStudentService && (
                <p className="text-xs font-medium text-primary">Servicio social estudiantil</p>
              )}
              <Link
                to={volunteerSignupHref(v.id)}
                className="inline-block pt-1 text-sm font-semibold text-primary underline-offset-4 hover:underline"
              >
                Inscribirme
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
