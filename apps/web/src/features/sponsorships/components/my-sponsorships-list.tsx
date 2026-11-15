import { useEffect, useState } from 'react';
import {
  isMercadoPagoCheckoutUrl,
  SponsorshipPaymentStatus,
  SponsorshipStatus,
  type Sponsorship,
} from '@adoptafacil/contracts';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Skeleton } from '@adoptafacil/ui';
import { ApiError, useApiClient } from '../../../shell/api';
import { onlinePaymentsEnabled } from '../../payments/lib/payment-provider';
import {
  listMySponsorships,
  paySponsorshipMonth,
  retrySponsorshipPayment,
} from '../api/sponsorships-api';
import {
  formatBogota,
  formatCop,
  isBillingFailureSuspension,
  isPaymentAtRisk,
  normalizeSponsorships,
  SPONSORSHIP_PERIODICITY_LABELS,
  SPONSORSHIP_STATUS_LABELS,
  sponsorshipStatusVariant,
} from '../model/sponsorships-view';
import styles from './my-sponsorships-list.module.scss';

/**
 * "Mis apadrinamientos" (S2-03) — historial de apadrinamientos de la Persona
 * autenticada, vía `GET /sponsorships/mine` (cross-tenant por identidad, S2-03
 * — mismo patrón que `MyDonationsList`/`GET /donations/mine`, T-064).
 *
 * ⚠️ Hallazgo (S2-03, encontrado en verificación visual): el historial de
 * estado (`GET /sponsorships/:id/history`) está gateado a Owner/Administrator/
 * ReadOnlyAuditor (`SponsorshipsController.VIEW_ROLES`) — el propio padrino NO
 * puede verlo (403/tenant mismatch). El Prompt Spec condicionaba el historial a
 * "si el endpoint ya las expone"; como NO lo expone para el padrino, se omite
 * aquí en vez de mostrar un botón que siempre falla. Documentado en el reporte
 * de cierre — requeriría OTRO endpoint nuevo tipo `sponsorship_history_for_sponsor`,
 * mismo patrón que `sponsorships_for_sponsor`, no agregado sin acordarlo antes.
 *
 * Pago mensual (PAY-001): "Pagar este mes" abre en Mercado Pago el mes que
 * está abierto, en la cuenta de la ORGANIZACIÓN; "Ponerme al día" reactiva un
 * apadrinamiento suspendido por impago. Con la pasarela apagada se muestra un
 * aviso tranquilo en vez de un botón que no funciona.
 */
export function MySponsorshipsList() {
  const client = useApiClient();
  const [sponsorships, setSponsorships] = useState<Sponsorship[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const body = await listMySponsorships(client);
        if (active) setSponsorships(normalizeSponsorships(body));
      } catch {
        if (active) setError(true);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [client]);

  const online = onlinePaymentsEnabled();

  if (loading) return <Skeleton className="h-64 w-full" />;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Mis apadrinamientos</CardTitle>
      </CardHeader>
      <CardContent>
        {error && (
          <p className={styles['hint--error']}>
            No se pudieron cargar tus apadrinamientos. Inténtalo de nuevo más tarde.
          </p>
        )}
        {!error && sponsorships.length === 0 && (
          <p className={styles.hint}>
            Aún no apadrinas a ningún animal. Entra al detalle de un animal en el portal público de
            una organización para apadrinarlo.
          </p>
        )}
        {!error && sponsorships.length > 0 && (
          <ul className="space-y-3">
            {sponsorships.map((sponsorship) => (
              <li key={sponsorship.id} className={styles.row} data-foco={sponsorship.id}>
                <div className={styles.row__top}>
                  <span className={styles.row__name}>
                    {sponsorship.animalName ?? sponsorship.animalId}
                  </span>
                  <Badge variant={sponsorshipStatusVariant(sponsorship.status)}>
                    {SPONSORSHIP_STATUS_LABELS[sponsorship.status]}
                  </Badge>
                  <span className={styles.row__meta}>
                    {sponsorship.organizationName ?? sponsorship.organizationId}
                  </span>
                  {sponsorship.planAmount !== undefined && (
                    <span className={styles.row__amount}>
                      {formatCop(sponsorship.planAmount)}
                      {sponsorship.planPeriodicity &&
                        ` / ${SPONSORSHIP_PERIODICITY_LABELS[sponsorship.planPeriodicity].toLowerCase()}`}
                    </span>
                  )}
                </div>
                <p className={styles.row__sub}>
                  Desde {formatBogota(sponsorship.startedAt)}
                  {sponsorship.planName ? ` · ${sponsorship.planName}` : ''}
                </p>
                {isPaymentAtRisk(sponsorship) && (
                  <p className={styles['hint--error']}>
                    Pago pendiente — intento {sponsorship.currentPeriodAttemptCount} de 3. Si no se
                    confirma pronto, el apadrinamiento se suspenderá.
                  </p>
                )}
                {online && isMonthOpen(sponsorship) && (
                  <PayButton
                    label="Pagar este mes"
                    testId="sponsorship-pay-month"
                    open={() =>
                      paySponsorshipMonth(client, sponsorship.id).then((v) => v.checkoutUrl)
                    }
                  />
                )}
                {isBillingFailureSuspension(sponsorship) &&
                  (online ? (
                    <div className={styles['recovery']} data-testid="sponsorship-retry">
                      <p className={styles['hint--error']}>Suspendido por pago fallido.</p>
                      <PayButton
                        label="Ponerme al día"
                        testId="sponsorship-retry-pay"
                        open={() =>
                          retrySponsorshipPayment(client, sponsorship.id).then(
                            (payment) => payment.attempts.at(-1)?.paymentLinkUrl,
                          )
                        }
                      />
                    </div>
                  ) : (
                    <div className={styles['recovery']} data-testid="sponsorship-retry-soon">
                      <p className={styles['hint--error']}>Suspendido por pago fallido.</p>
                      <p className={styles.hint}>
                        Pronto podrás ponerte al día con pago en línea desde aquí. Te avisaremos por
                        correo cuando esté disponible.
                      </p>
                    </div>
                  ))}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/** Activo con el mes abierto y sin pagar: se ofrece "Pagar este mes". */
function isMonthOpen(sponsorship: Sponsorship): boolean {
  return (
    sponsorship.status === SponsorshipStatus.Active &&
    sponsorship.currentPeriodStatus === SponsorshipPaymentStatus.Pending
  );
}

/** Abre el pago en Mercado Pago (solo a sus dominios) o dice por qué no se pudo. */
function PayButton({
  label,
  testId,
  open,
}: {
  label: string;
  testId: string;
  open: () => Promise<string | undefined>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pay = async () => {
    setBusy(true);
    setError(null);
    try {
      const url = await open();
      if (isMercadoPagoCheckoutUrl(url)) {
        window.location.assign(url as string);
        return;
      }
      setError('Este mes ya quedó registrado. Si no se confirma, te avisamos por correo.');
    } catch (failure) {
      setError(
        ApiError.is(failure) && failure.message
          ? failure.message
          : 'No pudimos abrir el pago. Inténtalo de nuevo en un momento.',
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className={styles.pay}>
      <Button size="sm" onClick={() => void pay()} disabled={busy} data-testid={testId}>
        {busy ? 'Abriendo Mercado Pago…' : label}
      </Button>
      {error && (
        <p className={styles.hint} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
