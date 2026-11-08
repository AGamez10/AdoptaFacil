import { useEffect, useMemo, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import type { SponsorshipPublicSummary } from '@adoptafacil/contracts';
import { Card, CardContent, CardHeader, CardTitle, EmptyState, Skeleton } from '@adoptafacil/ui';
import { PageContainer, PageHeader } from '../../_layout';
import { fetchAnimalSponsorshipSummary } from '../api/public-sponsorships';
import { formatCop, SPONSORSHIP_PERIODICITY_LABELS } from '../model/sponsorships-view';
import { MySponsorshipsList } from '../components/my-sponsorships-list';
import styles from './sponsor-page.module.scss';

interface SponsorTarget {
  animalId: string;
  /** Opcionales: quien enlaza aquí (p. ej. el detalle público de un animal, §M14)
   *  puede pasarlos para una mejor presentación; sin ellos, se muestra el id
   *  corto en vez de fabricar un nombre (mismo criterio que donations). */
  animalName?: string;
  organizationName?: string;
}

/** Resuelve el animal objetivo desde nav-state o query param (mismo patrón que
 *  `useDonationTarget` en donations/pages/donate-page.tsx). */
function useSponsorTarget(): SponsorTarget | null {
  const location = useLocation();
  const [params] = useSearchParams();
  return useMemo(() => {
    const state = (location.state as { target?: SponsorTarget } | null)?.target;
    if (state?.animalId) return state;

    const animalId = params.get('animalId');
    if (!animalId) return null;
    return {
      animalId,
      animalName: params.get('animalName') ?? undefined,
      organizationName: params.get('organizationName') ?? undefined,
    };
  }, [location.state, params]);
}

type SummaryState = 'loading' | 'ready' | 'error';

/**
 * `/apadrinar` (S2-03, RF17) — apadrinar un animal (plan mensual único, §6
 * Consolidación Ola 2) o, sin animal objetivo, "Mis apadrinamientos" (mismo
 * doble-propósito que `/donaciones`). El punto de entrada real (botón en el
 * detalle público de un animal) es de `features/portals`.
 *
 * Mercado Pago retirado (2026-10-17): el cobro del apadrinamiento usaba su
 * Card Payment Brick y hoy no hay pasarela con cobro recurrente para
 * apadrinamientos. En vez de un flujo roto, la página muestra los planes
 * y un aviso tranquilo ("Pronto podrás apadrinar con pago en línea"). La API
 * (`POST /sponsorships`) no cambia; solo la web deja de ofrecer el cobro.
 */
export function SponsorPage() {
  const target = useSponsorTarget();

  const [summary, setSummary] = useState<SponsorshipPublicSummary | null>(null);
  const [summaryState, setSummaryState] = useState<SummaryState>('loading');

  useEffect(() => {
    if (!target) return;
    let active = true;
    setSummaryState('loading');
    fetchAnimalSponsorshipSummary(target.animalId)
      .then((result) => {
        if (active) {
          setSummary(result);
          setSummaryState('ready');
        }
      })
      .catch(() => {
        if (active) setSummaryState('error');
      });
    return () => {
      active = false;
    };
  }, [target]);

  if (!target) {
    return (
      <PageContainer>
        <PageHeader
          title="Mis apadrinamientos"
          description="Historial de tus apadrinamientos. Para apadrinar, entra al detalle de un animal en el portal público de una organización."
        />
        <MySponsorshipsList />
      </PageContainer>
    );
  }

  const animalLabel = target.animalName ?? target.animalId;

  return (
    <PageContainer>
      <PageHeader
        title="Apadrinar"
        description={`Tu apadrinamiento mensual para ${animalLabel}.`}
      />
      <Card>
        <CardHeader>
          <CardTitle>{animalLabel}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {summaryState === 'loading' && <Skeleton className="h-32 w-full" />}
          {summaryState === 'error' && (
            <p className={styles['hint--error']}>
              No se pudo cargar la información de apadrinamiento. Inténtalo de nuevo más tarde.
            </p>
          )}
          {summaryState === 'ready' && summary && summary.activePlans.length === 0 && (
            <p className={styles.hint}>
              Este animal no tiene un plan de apadrinamiento activo por ahora.
            </p>
          )}
          {summaryState === 'ready' && summary && summary.activePlans.length > 0 && (
            <div className="space-y-3">
              <p className={styles.hint}>
                {summary.activeSponsorCount === 1
                  ? 'Ya tiene 1 padrino activo.'
                  : `Ya tiene ${summary.activeSponsorCount} padrinos activos.`}
              </p>
              <ul className={styles.plans}>
                {summary.activePlans.map((plan) => (
                  <li key={plan.id} className={styles['plan-row']}>
                    <div>
                      <p className={styles['plan-row__name']}>{plan.name}</p>
                      <p className={styles['plan-row__meta']}>
                        {formatCop(plan.amount)} /{' '}
                        {SPONSORSHIP_PERIODICITY_LABELS[plan.periodicity].toLowerCase()}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
              <div data-testid="sponsorship-online-soon">
                <EmptyState
                  title="Pronto podrás apadrinar con pago en línea"
                  description={`Estamos preparando el pago mensual en línea para que apadrinar a ${animalLabel} sea tan fácil como donar. Mientras tanto, puedes donar a ${target.organizationName ?? 'la organización'} desde su portal.`}
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </PageContainer>
  );
}
