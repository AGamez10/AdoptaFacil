import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
  isMercadoPagoCheckoutUrl,
  type SponsorshipPlanPublic,
  type SponsorshipPublicSummary,
} from '@adoptafacil/contracts';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Skeleton,
} from '@adoptafacil/ui';
import { PageContainer, PageHeader } from '../../_layout';
import { ApiError, isIncompleteProfileError, useApiClient } from '../../../shell/api';
import { onlinePaymentsEnabled } from '../../payments/lib/payment-provider';
import { fetchAnimalSponsorshipSummary } from '../api/public-sponsorships';
import { subscribeToPlan } from '../api/sponsorships-api';
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
 * Pago (PAY-001, ADR-PAG-003): "Apadrinar" crea el apadrinamiento y lleva al
 * padrino a pagar el primer mes en Mercado Pago, en la cuenta de la
 * ORGANIZACIÓN (AdoptaFácil no recibe ese dinero). Cada mes siguiente se paga
 * desde "Mis apadrinamientos" con "Pagar este mes". Con la pasarela apagada
 * (`VITE_PAYMENT_PROVIDER=off`) se muestra un aviso tranquilo.
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
              {onlinePaymentsEnabled() ? (
                <SponsorCheckout
                  plans={summary.activePlans}
                  animalLabel={animalLabel}
                  organizationName={target.organizationName}
                />
              ) : (
                <div data-testid="sponsorship-online-soon">
                  <EmptyState
                    title="Pronto podrás apadrinar con pago en línea"
                    description={`Estamos preparando el pago mensual en línea para que apadrinar a ${animalLabel} sea tan fácil como donar. Mientras tanto, puedes donar a ${target.organizationName ?? 'la organización'} desde su portal.`}
                  />
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </PageContainer>
  );
}

/**
 * "Apadrinar": crea el apadrinamiento y abre el pago del primer mes. El dinero
 * va a la cuenta de Mercado Pago de la organización; los meses siguientes se
 * pagan desde "Mis apadrinamientos".
 */
function SponsorCheckout({
  plans,
  animalLabel,
  organizationName,
}: {
  plans: SponsorshipPlanPublic[];
  animalLabel: string;
  organizationName?: string;
}) {
  const client = useApiClient();
  const navigate = useNavigate();
  const location = useLocation();
  const [busyPlan, setBusyPlan] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<'approved' | 'pending' | null>(null);
  const organization = organizationName ?? 'la organización';

  const sponsor = async (plan: SponsorshipPlanPublic) => {
    setBusyPlan(plan.id);
    setError(null);
    try {
      const sponsorship = await subscribeToPlan(client, { planId: plan.id });
      if (isMercadoPagoCheckoutUrl(sponsorship.firstPaymentLinkUrl)) {
        // Solo a dominios de Mercado Pago (nunca un redireccionamiento abierto).
        window.location.assign(sponsorship.firstPaymentLinkUrl as string);
        return;
      }
      setDone(sponsorship.firstPaymentStatus === 'approved' ? 'approved' : 'pending');
    } catch (failure) {
      if (isIncompleteProfileError(failure)) {
        navigate('/perfil/completar', {
          state: {
            from: location,
            reason:
              'Antes de apadrinar necesitamos tu teléfono, documento de identidad y dirección.',
          },
        });
        return;
      }
      setError(
        ApiError.is(failure) && failure.status >= 400 && failure.status < 600 && failure.message
          ? failure.message
          : 'No pudimos abrir el pago. Inténtalo de nuevo en un momento.',
      );
    } finally {
      setBusyPlan(null);
    }
  };

  if (done) {
    return (
      <div className={styles.checkout} data-testid="sponsorship-done">
        <p className={styles.checkout__title}>
          {done === 'approved'
            ? `¡Gracias! Desde hoy apadrinas a ${animalLabel}.`
            : `Tu apadrinamiento de ${animalLabel} quedó registrado.`}
        </p>
        <p className={styles.hint}>
          {done === 'approved'
            ? 'Te enviamos la bienvenida por correo.'
            : 'Cuando el pago se confirme te avisamos por correo.'}{' '}
          Cada mes lo pagas desde <Link to="/apadrinar">Mis apadrinamientos</Link>.
        </p>
      </div>
    );
  }

  return (
    <div className={styles.checkout} data-testid="sponsorship-checkout">
      <p className={styles.hint}>
        Pagas el primer mes ahora en Mercado Pago y el dinero llega directo a {organization}. Cada
        mes te avisamos para pagar el siguiente desde &quot;Mis apadrinamientos&quot;; puedes
        dejarlo cuando quieras.
      </p>
      <div className={styles.checkout__actions}>
        {plans.map((plan) => (
          <Button
            key={plan.id}
            onClick={() => void sponsor(plan)}
            disabled={busyPlan !== null}
            data-testid={`sponsor-plan-${plan.id}`}
          >
            {busyPlan === plan.id
              ? 'Abriendo Mercado Pago…'
              : `Apadrinar por ${formatCop(plan.amount)} al mes`}
          </Button>
        ))}
      </div>
      {error && (
        <p className={styles['hint--error']} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
