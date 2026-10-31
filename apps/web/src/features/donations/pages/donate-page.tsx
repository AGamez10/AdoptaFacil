import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import type { Donation } from '@adoptafacil/contracts';
import {
  Button,
  buttonVariants,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  cn,
  EmptyState,
  Skeleton,
  useToast,
} from '@adoptafacil/ui';
import { PageContainer, PageHeader } from '../../_layout';
import { isIncompleteProfileError, useApiClient } from '../../../shell/api';
import { useSession } from '../../../shell/auth';
import { PublicFooter, PublicNavbar } from '../../../shell/layout';
import { FormAlert } from '../../auth/components/form-alert';
import { createDonation, fetchOrganizationDonationAvailability } from '../api/donations-api';
import { DonateForm, type DonateFormValues } from '../components/donate-form';
import { DonationsActivatingNotice } from '../components/donations-activating-notice';
import { formatCop } from '../model/donation-breakdown-view';
import { isEpaycoProvider } from '../../payments/lib/payment-provider';
import { openEpaycoCheckout } from '../../payments/lib/epayco-checkout';
import { useNoIndex } from '../../../seo/seo';
import styles from './donate-page.module.scss';

interface DonationTarget {
  organizationId: string;
  organizationName: string;
  /** F2-03: presentación únicamente — vienen de `OrganizationPublic` vía
   *  `buildDonateHref` (portal, T-050/F2-03), nunca refetcheados aquí. */
  organizationLogoUrl?: string;
  organizationCity?: string;
  organizationNit?: string;
  /** Slug del portal público (`/o/<slug>`), para ofrecer alternativas si la
   *  organización aún no recibe donaciones en línea. Solo navegación. */
  organizationSlug?: string;
  /** Donación a UNA campaña de la organización (botón "Donar a esta campaña"
   *  o el QR fijo apuntando a una campaña). Viaja como `concept`; la API
   *  rechaza una campaña que no sea de la organización o no esté activa. */
  campaignId?: string;
  campaignTitle?: string;
}

/**
 * Resolve the beneficiary org from navigation state or query params. In the finished
 * flow this comes from the PUBLIC org portal (§M14, `/o/:slug` → "Donar"); until that
 * link exists, the page consumes whatever the caller passed. Never fabricates data.
 */
function useDonationTarget(): DonationTarget | null {
  const location = useLocation();
  const [params] = useSearchParams();
  return useMemo(() => {
    const state = (location.state as { target?: DonationTarget } | null)?.target;
    if (state?.organizationId && state.organizationName) return state;

    const organizationId = params.get('organizationId');
    const organizationName = params.get('organizationName');
    if (organizationId && organizationName) {
      return {
        organizationId,
        organizationName,
        organizationLogoUrl: params.get('organizationLogoUrl') ?? undefined,
        organizationCity: params.get('organizationCity') ?? undefined,
        organizationNit: params.get('organizationNit') ?? undefined,
        organizationSlug: params.get('organizationSlug') ?? undefined,
        campaignId: params.get('campaignId') ?? undefined,
        campaignTitle: params.get('campaignTitle') ?? undefined,
      };
    }
    return null;
  }, [location.state, params]);
}

/**
 * `/donaciones` — donación a una organización (§M05, P1 + checkout de INVITADO,
 * requisito final del cliente: donar NUNCA exige cuenta ni login). Ve el desglose
 * transparente antes de pagar (misma cuenta que el backend), puede marcar
 * "cubro la comisión" y la donación anónima frente a la organización, y al
 * confirmarse el pago (webhook) se emite un recibo automático. Dato personal
 * bajo Ley 1581.
 *
 * SEAM resuelto: la ruta vive FUERA de `<RequireAuth>`/`<AppLayout>` (ver
 * routes.tsx) — esta página arma su propio chrome público (mismo patrón que
 * `PublicCampaignsPage`) y lee `useSession()` directamente para decidir si
 * prellena la identidad del donante (con sesión) o pide nombre+correo
 * (invitado). `POST /donations` acepta ambos casos (`OptionalJwtAuthGuard`).
 */
export function DonatePage() {
  useNoIndex();
  const client = useApiClient();
  const { status, user } = useSession();
  const hasSession = status === 'authenticated';
  const { toast } = useToast();
  const target = useDonationTarget();
  const location = useLocation();
  const navigate = useNavigate();

  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<Donation | null>(null);
  // Remounts <DonateForm> with fresh internal state ("Intentar de nuevo"
  // after a declined charge) — the form owns its own amount state, so a plain
  // re-render alone wouldn't reset it.
  const [formInstanceKey, setFormInstanceKey] = useState(0);
  // ADR-PAG-002: ePayco es la única pasarela — tras crear la donación se abre
  // su checkout con la sesión que devolvió la API. `false` solo con el
  // interruptor de apagado (VITE_PAYMENT_PROVIDER=off): aviso tranquilo.
  const epayco = isEpaycoProvider();
  const [epaycoCheckout, setEpaycoCheckout] = useState<{
    donation: Donation;
    sessionId: string;
    test: boolean;
    status: 'opening' | 'open' | 'error';
  } | null>(null);
  // Solo se puede donar a una organización con su cuenta ePayco conectada.
  const [availability, setAvailability] = useState<
    'loading' | 'connected' | 'not-connected' | 'error'
  >('loading');
  const targetOrganizationId = target?.organizationId;
  // "Intentar de nuevo" tras una falla al verificar (sin recargar la página).
  const [availabilityAttempt, setAvailabilityAttempt] = useState(0);

  useEffect(() => {
    if (!targetOrganizationId || !epayco) return;
    let active = true;
    setAvailability('loading');
    fetchOrganizationDonationAvailability(targetOrganizationId)
      .then((result) => {
        if (active) setAvailability(result.canReceiveDonations ? 'connected' : 'not-connected');
      })
      .catch(() => {
        if (active) setAvailability('error');
      });
    return () => {
      active = false;
    };
  }, [targetOrganizationId, availabilityAttempt, epayco]);

  if (!target) {
    // Sin organización objetivo y CON sesión: el historial vive en `/mis-donaciones`
    // (dentro del shell, con menú) — esta ruta es pública y no lo tiene.
    if (hasSession) return <Navigate to="/mis-donaciones" replace />;

    // Sin sesión: aviso honesto (`GET /donations/mine` es solo autenticado). Iniciar
    // una donación NUEVA solo ocurre desde el portal público de una organización.
    return (
      <div className="flex min-h-screen flex-col bg-background text-foreground">
        <PublicNavbar />
        <main className="flex-1">
          <PageContainer>
            <PageHeader
              title="Donaciones"
              description="Entra al portal público de una organización para donar — no necesitas una cuenta."
            />
            <EmptyState
              title="Aún no elegiste a quién donar"
              description="Explora el catálogo general o el portal de una organización y usa su botón “Donar”."
            />
            <p className={styles['done__hint']}>
              ¿Ya donaste antes con una cuenta?{' '}
              <Link to="/login" className="underline">
                Inicia sesión
              </Link>{' '}
              para ver tu historial.
            </p>
          </PageContainer>
        </main>
        <PublicFooter />
      </div>
    );
  }

  const launchEpaycoCheckout = async (donation: Donation, sessionId: string, test: boolean) => {
    setEpaycoCheckout({ donation, sessionId, test, status: 'opening' });
    try {
      await openEpaycoCheckout({ sessionId, test });
      setEpaycoCheckout({ donation, sessionId, test, status: 'open' });
    } catch {
      setEpaycoCheckout({ donation, sessionId, test, status: 'error' });
      toast({
        title: 'No se pudo abrir la pasarela de ePayco',
        description: 'Revisa tu conexión e inténtalo de nuevo. No se te ha cobrado nada.',
        variant: 'destructive',
      });
    }
  };

  const donate = async ({
    intendedAmount,
    commissionPayer,
    anonymous,
    guestPayer,
    legalAcceptances,
  }: DonateFormValues): Promise<void> => {
    setSubmitting(true);
    try {
      const donation = await createDonation(client, {
        organizationId: target.organizationId,
        ...(target.campaignId ? { concept: { kind: 'campaign', id: target.campaignId } } : {}),
        intendedAmount,
        commissionPayer,
        anonymous,
        // Con sesión: se prellena del donante autenticado (como antes). Sin
        // sesión (invitado): viene del propio formulario, requerido allí.
        payer: hasSession
          ? user?.email
            ? { fullName: user.name, email: user.email }
            : undefined
          : guestPayer,
        // Invitado: prueba de su aceptación de términos y datos (Ley 1581).
        legalAcceptances,
        // Idempotencia: el servidor deduplica por (org, key); una clave por intento.
        idempotencyKey: crypto.randomUUID(),
      });
      if (epayco && donation.checkoutSessionId) {
        await launchEpaycoCheckout(
          donation,
          donation.checkoutSessionId,
          donation.checkoutTest === true,
        );
        return;
      }
      setDone(donation);
      toast(
        donation.status === 'approved'
          ? {
              title: '¡Pago aprobado!',
              description: 'Te enviaremos el recibo automático por correo.',
            }
          : donation.status === 'declined'
            ? {
                title: 'Pago rechazado',
                description:
                  'Tu banco o la pasarela de pagos rechazaron el pago. Puedes intentarlo de nuevo.',
                variant: 'destructive',
              }
            : {
                title: 'Donación registrada',
                description:
                  'Estamos confirmando tu pago. Te enviaremos el recibo automático al aprobarse.',
              },
      );
    } catch (error) {
      // T-Google-SignIn (business rule #3): donating requires a complete
      // profile (phone/documentId/address) — send the person to complete it,
      // then let them retry the donation themselves from where they left off.
      if (isIncompleteProfileError(error)) {
        navigate('/perfil/completar', {
          state: {
            from: location,
            reason: 'Antes de donar necesitamos tu teléfono, documento de identidad y dirección.',
          },
        });
        return;
      }
      toast({
        title: 'No se pudo procesar la donación',
        description: 'Inténtalo de nuevo en un momento.',
        variant: 'destructive',
      });
      // Re-throw so the caller knows the donation failed (DonateForm swallows
      // it after this toast; nothing else retries automatically).
      throw error;
    } finally {
      setSubmitting(false);
    }
  };

  const retryDonation = () => {
    setDone(null);
    setFormInstanceKey((k) => k + 1);
  };

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <PublicNavbar />
      <main className="flex-1">
        <PageContainer>
          <PageHeader
            title="Donar"
            description={
              target.campaignId && target.campaignTitle
                ? `Tu aporte para la campaña «${target.campaignTitle}» de ${target.organizationName}.`
                : `Tu aporte para ${target.organizationName}.`
            }
          />
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {target.organizationLogoUrl && (
                  <img
                    src={target.organizationLogoUrl}
                    alt=""
                    aria-hidden
                    data-testid="donation-org-logo"
                    className={styles['org-logo']}
                  />
                )}
                {target.organizationName}
              </CardTitle>
              {/* F2-03: solo lo que ya viaja en el contrato público (mismo endpoint
                  que el portal /o/:slug consume) — el NIT es dato público una vez
                  formalizada la org, nunca se fabrica ni se muestra el de muestra
                  del certificado (RF14, congelado, no se toca aquí). */}
              {(target.organizationCity || target.organizationNit) && (
                <p className={styles['org-meta']} data-testid="donation-org-meta">
                  {[
                    target.organizationCity,
                    target.organizationNit && `NIT ${target.organizationNit}`,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              )}
            </CardHeader>
            <CardContent>
              {hasSession && user?.name && (
                <p className={styles['donor-identity']} data-testid="donor-identity">
                  Donando como <span className={styles['donor-identity__name']}>{user.name}</span>
                  {user.email && ` (${user.email})`}
                </p>
              )}
              {epaycoCheckout ? (
                <div className={styles.done} data-testid="epayco-checkout-panel">
                  {epaycoCheckout.status === 'opening' ? (
                    <p className={styles['done__hint']} data-testid="epayco-checkout-opening">
                      Abriendo la pasarela segura de ePayco…
                    </p>
                  ) : epaycoCheckout.status === 'error' ? (
                    <FormAlert variant="error">
                      <span data-testid="epayco-checkout-error">
                        No pudimos cargar la pasarela de pagos de ePayco. Revisa tu conexión (o
                        desactiva el bloqueador de anuncios) e inténtalo de nuevo. Tu donación quedó
                        registrada como pendiente: no se te ha cobrado nada.
                      </span>
                    </FormAlert>
                  ) : (
                    <EmptyState
                      title="Completa tu pago en ePayco"
                      description={`Abrimos la ventana segura de ePayco para pagar ${formatCop(epaycoCheckout.donation.amountCharged)} con los medios que tenga habilitados ${target.organizationName}. Cuando ePayco confirme el pago te enviaremos el recibo automático.`}
                    />
                  )}
                  {epaycoCheckout.status !== 'opening' && (
                    <Button
                      variant={epaycoCheckout.status === 'error' ? 'default' : 'outline'}
                      onClick={() =>
                        void launchEpaycoCheckout(
                          epaycoCheckout.donation,
                          epaycoCheckout.sessionId,
                          epaycoCheckout.test,
                        )
                      }
                      data-testid="epayco-checkout-reopen"
                    >
                      {epaycoCheckout.status === 'error'
                        ? 'Reintentar abrir el pago'
                        : 'Abrir de nuevo la ventana de pago'}
                    </Button>
                  )}
                </div>
              ) : done ? (
                done.status === 'declined' ? (
                  // A declined charge is a SUCCESSFUL API call (the request
                  // itself succeeded; the gateway rejected the payment) — no
                  // certificate/account CTA, just an honest message + a way
                  // to try again.
                  <div className={styles.done} data-testid="donation-declined">
                    <EmptyState
                      title="Tu pago no fue aprobado"
                      description="Tu banco o la pasarela de pagos rechazaron el pago. Puedes intentarlo de nuevo con otro medio de pago."
                    />
                    <Button onClick={retryDonation} data-testid="donation-retry-card">
                      Intentar de nuevo
                    </Button>
                  </div>
                ) : (
                  <div className={styles.done}>
                    <EmptyState
                      title="¡Gracias por tu donación!"
                      description={
                        done.status === 'approved'
                          ? `Tu pago de ${formatCop(done.amountCharged)} fue aprobado. Te enviaremos el recibo automático por correo.`
                          : `Registramos tu donación de ${formatCop(done.amountCharged)}. Cuando el pago se confirme, te emitiremos el recibo automáticamente.`
                      }
                    />
                    {/* Empalme al certificado REAL (§M05/RF14, F-3): solo un ENLACE, la
                        lógica de donación no cambia. Lleva únicamente el id de la
                        donación — el certificado se lee del backend, no se reconstruye
                        desde nav-state. */}
                    <div className={styles['done__cert']}>
                      <Link
                        to="/certificado"
                        state={{ donationId: done.id }}
                        className={cn(buttonVariants())}
                        data-testid="view-certificate-cta"
                      >
                        Ver tu certificado de donación
                      </Link>
                      <p className={styles['done__hint']}>
                        Disponible una vez se confirme tu pago (organizaciones ESAL con RTE
                        vigente).
                      </p>
                    </div>
                    {/* Checkout de invitado: la cuenta se ofrece DESPUÉS de donar, nunca
                        como precondición (requisito del cliente). Solo tiene sentido para
                        quien donó sin sesión — un donante ya autenticado no la necesita. */}
                    {!hasSession && (
                      <div className={styles['done__cert']}>
                        <p className={styles['done__hint']}>
                          ¿Quieres crear una cuenta gratuita en AdoptaFácil para consultar tu
                          historial de donaciones?
                        </p>
                        <Link
                          to="/register"
                          className={cn(buttonVariants({ variant: 'outline' }))}
                          data-testid="create-account-cta"
                        >
                          Crear cuenta gratuita
                        </Link>
                      </div>
                    )}
                  </div>
                )
              ) : !epayco ? (
                // Interruptor de apagado (VITE_PAYMENT_PROVIDER=off): nunca un
                // flujo roto, un aviso tranquilo y otras formas de ayudar.
                <div className={styles.done} data-testid="donation-online-off">
                  <EmptyState
                    title="Pronto podrás donar en línea"
                    description={`Las donaciones en línea están pausadas por ahora. Mientras tanto puedes apoyar a ${target.organizationName} desde su portal.`}
                  />
                  {target.organizationSlug && (
                    <Link
                      to={`/o/${encodeURIComponent(target.organizationSlug)}`}
                      className={cn(buttonVariants({ variant: 'outline' }))}
                    >
                      Ver el portal de {target.organizationName}
                    </Link>
                  )}
                </div>
              ) : availability === 'loading' ? (
                <Skeleton className="h-48 w-full" data-testid="donation-availability-loading" />
              ) : availability === 'not-connected' ? (
                // Nunca un error para el donante: un mensaje cálido y otras
                // formas reales de ayudar (aplica con cualquier pasarela).
                <DonationsActivatingNotice
                  data-testid="donation-org-not-connected"
                  organizationName={target.organizationName}
                  portalPath={
                    target.organizationSlug
                      ? `/o/${encodeURIComponent(target.organizationSlug)}`
                      : undefined
                  }
                />
              ) : availability === 'error' ? (
                <div className={styles.done} data-testid="donation-availability-error">
                  <EmptyState
                    title="Estamos teniendo problemas para cargar la donación"
                    description={`No pudimos confirmar en este momento si ${target.organizationName} ya recibe donaciones en línea. Revisa tu conexión e inténtalo de nuevo; no se te ha cobrado nada.`}
                  />
                  <Button onClick={() => setAvailabilityAttempt((n) => n + 1)}>
                    Intentar de nuevo
                  </Button>
                </div>
              ) : (
                <DonateForm
                  key={formInstanceKey}
                  organizationName={target.organizationName}
                  submitting={submitting}
                  hasSession={hasSession}
                  onDonate={donate}
                />
              )}
            </CardContent>
          </Card>
        </PageContainer>
      </main>
      <PublicFooter />
    </div>
  );
}
