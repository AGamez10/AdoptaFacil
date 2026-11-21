import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { isMercadoPagoCheckoutUrl, type Donation } from '@adoptafacil/contracts';
import { Button, buttonVariants, cn, EmptyState, Skeleton, useToast } from '@adoptafacil/ui';
import { useApiClient } from '../../../shell/api';
import { isProfileGateCancelled, useProfileGate } from '../../auth/components/profile-gate';
import { useSession } from '../../../shell/auth';
import { PublicFooter, PublicNavbar } from '../../../shell/layout';
import { createDonation, fetchOrganizationDonationAvailability } from '../api/donations-api';
import { DonateForm, type DonateFormValues } from '../components/donate-form';
import { DonationsActivatingNotice } from '../components/donations-activating-notice';
import { BenefitSeal } from '../components/benefit-seal';
import { DonationDirectory } from '../components/donation-directory';
import { DonorAccountBenefits } from '../components/donor-account-benefits';
import { useDonationDirectory } from '../hooks/use-donation-directory';
import { diligenceChips, initialsOf, levelName } from '../model/donation-directory-view';
import { formatCop } from '../model/donation-breakdown-view';
import { isMercadoPagoProvider, onlinePaymentsEnabled } from '../../payments/lib/payment-provider';
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
 * requisito final del cliente: donar NUNCA exige cuenta ni login). Ve cuánto paga
 * antes de pagar (misma cuenta que el backend), puede donar de forma anónima
 * frente a la organización, y al confirmarse el pago (webhook) se emite un recibo
 * automático. Dato personal bajo Ley 1581.
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
  const profileGate = useProfileGate();

  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<Donation | null>(null);
  // Remounts <DonateForm> with fresh internal state ("Intentar de nuevo"
  // after a declined charge) — the form owns its own amount state, so a plain
  // re-render alone wouldn't reset it.
  const [formInstanceKey, setFormInstanceKey] = useState(0);
  // ADR-PAG-003: Mercado Pago — tras crear la donación se va a Checkout Pro
  // de la cuenta del refugio (`paymentLinkUrl`). `false` solo con el
  // interruptor de apagado (VITE_PAYMENT_PROVIDER=off): aviso tranquilo.
  const mercadopago = isMercadoPagoProvider();
  const online = onlinePaymentsEnabled();
  const [redirectingToMercadoPago, setRedirectingToMercadoPago] = useState<Donation | null>(null);
  // Solo se puede donar a una organización con su cuenta de Mercado Pago conectada.
  const [availability, setAvailability] = useState<
    'loading' | 'connected' | 'not-connected' | 'error'
  >('loading');
  const targetOrganizationId = target?.organizationId;
  // Nivel, sello de beneficio y señales de la organización elegida (mismo
  // directorio público, en caché). Solo presentación: si falla, no se muestra.
  const directory = useDonationDirectory(Boolean(targetOrganizationId));
  const directoryEntry =
    directory.status === 'ready'
      ? directory.items.find((org) => org.id === targetOrganizationId)
      : undefined;
  // "Intentar de nuevo" tras una falla al verificar (sin recargar la página).
  const [availabilityAttempt, setAvailabilityAttempt] = useState(0);

  useEffect(() => {
    if (!targetOrganizationId || !online) return;
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
  }, [targetOrganizationId, availabilityAttempt, online]);

  if (!target) {
    // "Quiero donar" sin organización elegida: el directorio de organizaciones,
    // primero las más formalizadas y diligentes (con o sin sesión).
    return (
      <div className={cn('flex min-h-screen flex-col text-foreground', styles.shell)}>
        <PublicNavbar />
        <main className="flex-1">
          <DonationDirectory hasSession={hasSession} userName={user?.name} />
        </main>
        <PublicFooter />
      </div>
    );
  }

  const donate = async ({
    intendedAmount,
    anonymous,
    guestPayer,
    legalAcceptances,
  }: DonateFormValues): Promise<void> => {
    setSubmitting(true);
    try {
      // Si faltan teléfono, documento o dirección, se piden en una ventana y la
      // MISMA donación sigue sola al guardarlos (misma clave de idempotencia:
      // el primer intento respondió 422 y no creó nada).
      const idempotencyKey = crypto.randomUUID();
      const donation = await profileGate.run(
        () =>
          createDonation(client, {
            organizationId: target.organizationId,
            ...(target.campaignId ? { concept: { kind: 'campaign', id: target.campaignId } } : {}),
            intendedAmount,
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
            idempotencyKey,
          }),
        'Para donar necesitamos tu teléfono, documento de identidad y dirección.',
      );
      if (mercadopago && isMercadoPagoCheckoutUrl(donation.paymentLinkUrl)) {
        // Navegación completa a Mercado Pago (solo a sus dominios: nunca un
        // redireccionamiento abierto). Vuelve a /donaciones/resultado.
        setRedirectingToMercadoPago(donation);
        window.location.assign(donation.paymentLinkUrl as string);
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
      // Cerró la ventana de datos sin guardar: no se envió nada.
      if (isProfileGateCancelled(error)) return;
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

  const campaignLabel =
    target.campaignId && target.campaignTitle ? target.campaignTitle : undefined;
  const benefit = directoryEntry?.canReceiveDonations ? directoryEntry.donorBenefit : undefined;
  const portalPath = target.organizationSlug
    ? `/o/${encodeURIComponent(target.organizationSlug)}`
    : undefined;

  return (
    <div className={cn('flex min-h-screen flex-col text-foreground', styles.shell)}>
      <PublicNavbar />
      <main className={cn('flex-1', styles.checkout)}>
        {profileGate.dialog}
        <div className={styles.checkout__inner}>
          <Link to="/donaciones" className={styles.back} data-testid="donation-change-org">
            <span aria-hidden>←</span> Elegir otra organización
          </Link>
          <div className={styles.layout}>
            <header className={styles.heading}>
              <p className={styles.eyebrow}>Donar</p>
              <h1 className={styles.title}>
                {campaignLabel
                  ? `Apoya la campaña «${campaignLabel}»`
                  : `Dona a ${target.organizationName}`}
              </h1>
              <p className={styles.lead}>
                Tú eliges el monto y pagas en Mercado Pago. AdoptaFácil no cobra comisión: el dinero
                llega completo a la cuenta de {target.organizationName}.
              </p>
            </header>

            <aside className={styles.summary} aria-label="Organización que recibe tu donación">
              <div className={styles['summary__org']}>
                {target.organizationLogoUrl ? (
                  <img
                    src={target.organizationLogoUrl}
                    alt=""
                    aria-hidden
                    data-testid="donation-org-logo"
                    className={styles['org-logo']}
                  />
                ) : (
                  <span
                    className={cn(styles['org-logo'], styles['org-logo--initials'])}
                    aria-hidden
                  >
                    {initialsOf(target.organizationName)}
                  </span>
                )}
                <div className={styles['summary__id']}>
                  <h2 className={styles['summary__name']}>{target.organizationName}</h2>
                  {/* F2-03: solo lo que ya viaja en el contrato público (mismo endpoint
                      que el portal /o/:slug consume) — el NIT es dato público una vez
                      formalizada la org, nunca se fabrica. */}
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
                  {directoryEntry && (
                    <p className={styles['summary__level']}>Nivel: {levelName(directoryEntry)}</p>
                  )}
                </div>
              </div>
              {benefit && <BenefitSeal benefit={benefit} />}
              {directoryEntry && diligenceChips(directoryEntry).length > 0 && (
                <ul className={styles.chips} aria-label="Señales de diligencia">
                  {diligenceChips(directoryEntry).map((chip) => (
                    <li key={chip.key} className={styles.chip}>
                      {chip.label}
                    </li>
                  ))}
                </ul>
              )}
              {portalPath && (
                <Link to={portalPath} className={styles['summary__portal']}>
                  Conoce su portal y su libro de transparencia
                </Link>
              )}
            </aside>

            <section className={styles.panel} aria-label="Tu donación">
              {hasSession && user?.name && (
                <p className={styles['donor-identity']} data-testid="donor-identity">
                  Donando como <span className={styles['donor-identity__name']}>{user.name}</span>
                  {user.email && ` (${user.email})`}
                </p>
              )}
              {redirectingToMercadoPago ? (
                <div className={styles.done} data-testid="mercadopago-redirecting">
                  <EmptyState
                    title="Te llevamos a Mercado Pago"
                    description={`Vas a pagar ${formatCop(redirectingToMercadoPago.amountCharged)} en la página segura de Mercado Pago, directo a la cuenta de ${target.organizationName}. Cuando Mercado Pago confirme el pago te enviaremos el recibo automático.`}
                  />
                  <a
                    href={redirectingToMercadoPago.paymentLinkUrl}
                    className={cn(buttonVariants({ variant: 'outline' }))}
                    data-testid="mercadopago-open-again"
                  >
                    Si no se abrió, toca aquí
                  </a>
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
                        {benefit === 'receipt'
                          ? 'Ver tu comprobante de donación'
                          : 'Ver tu certificado de donación'}
                      </Link>
                      <p className={styles['done__hint']}>
                        {benefit === 'tax_certificate'
                          ? 'Disponible al confirmarse tu pago. Te sirve para el descuento en tu declaración de renta.'
                          : benefit === 'accounting_certificate'
                            ? 'Disponible al confirmarse tu pago. Es soporte contable, sin descuento tributario.'
                            : benefit === 'receipt'
                              ? 'Disponible al confirmarse tu pago. No sirve para beneficio tributario.'
                              : 'Disponible una vez se confirme tu pago (organizaciones ESAL con RTE vigente).'}
                      </p>
                    </div>
                    {/* Checkout de invitado: la cuenta se ofrece DESPUÉS de donar, nunca
                        como precondición (requisito del cliente). Solo tiene sentido para
                        quien donó sin sesión — un donante ya autenticado no la necesita. */}
                    {!hasSession && (
                      <DonorAccountBenefits
                        title="Para tus próximas donaciones, crea tu cuenta gratis"
                        note="Esta donación la consultas con el enlace que te enviamos al correo."
                        returnTo="/mis-donaciones"
                      />
                    )}
                  </div>
                )
              ) : !online ? (
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
            </section>

            {!hasSession && !done && (
              <DonorAccountBenefits variant="compact" className={styles.account} />
            )}
          </div>
        </div>
      </main>
      <PublicFooter />
    </div>
  );
}
