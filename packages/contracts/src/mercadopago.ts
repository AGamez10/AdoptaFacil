// Module: M15 payments · Mercado Pago (OAuth del refugio) · Contracts owner: @fabian
//
// Design: docs/pagos/mercadopago-oauth.md (ADR-PAG-003).
//
// ADDITIVE contract. Each organization connects ITS OWN Mercado Pago account
// through OAuth; donations are Checkout Pro preferences created WITH the
// organization's access token, so the organization is the collector (merchant
// of record) and the money never passes through AdoptaFácil. AdoptaFácil
// charges its plans with its OWN Mercado Pago account (subscriptions), which
// never touches a donation.
//
// The tokens themselves (`MercadoPagoCollectorCredentials` in `payments.ts`)
// are server-only and never appear in any view here.
//
// Browser-safe, dependency-free.

import type { PaymentStatus } from './payments';
import type { PlanKey } from './plans';

/** Lifecycle of a connected account. `needs_reconnect` = the token could not
 *  be renewed (revoked by the org in Mercado Pago, or expired): donations are
 *  blocked until an Owner/Administrator connects again. */
export const MERCADOPAGO_CONNECTION_STATUSES = ['active', 'needs_reconnect'] as const;
export type MercadoPagoConnectionStatus = (typeof MERCADOPAGO_CONNECTION_STATUSES)[number];

/** `GET /org/mercadopago/connect` — the URL the browser navigates to. */
export interface MercadoPagoConnectUrlView {
  authorizeUrl: string;
}

/** `GET /org/mercadopago/status`. Never carries a token. */
export interface MercadoPagoConnectStatusView {
  connected: boolean;
  status?: MercadoPagoConnectionStatus;
  /** The org's Mercado Pago user id (collector id). Not a secret: it lets the
   *  org check it connected the right account. */
  mpUserId?: string;
  /** `false` = test user/sandbox credentials. */
  liveMode?: boolean;
  connectedAt?: string;
  /** When the current access token expires (renewed automatically). */
  expiresAt?: string;
}

/** Query flag the API adds when it redirects back to the web after OAuth. */
export const MERCADOPAGO_CONNECT_RESULT_PARAM = 'mercadopago';
export type MercadoPagoConnectResult =
  'connected' | 'error' | 'denied' | 'already_linked' | 'expired';

/**
 * Payment `status` (GET /v1/payments/:id) → our status. Unknown ⇒ `pending`:
 * it never settles a donation, and the next notification decides.
 * Source: https://www.mercadopago.com.co/developers/es/reference/payments/_payments_id/get
 */
export function mercadoPagoPaymentStatus(raw: string | null | undefined): PaymentStatus {
  switch (raw) {
    case 'approved':
      return 'approved';
    case 'rejected':
      return 'declined';
    case 'cancelled':
    case 'refunded':
    case 'charged_back':
      return 'voided';
    default:
      // pending, in_process, authorized, in_mediation, unknown…
      return 'pending';
  }
}

/** Mercado Pago user ids are numeric. */
export const MERCADOPAGO_USER_ID_PATTERN = /^\d{1,20}$/;

/**
 * A notification's `data.id`: payments are numeric; preapprovals and
 * authorized payments are alphanumeric. Conservative superset, used before
 * putting the id in a URL path.
 */
export const MERCADOPAGO_RESOURCE_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * Hosts a Checkout Pro / subscription link may point to. The web only
 * navigates to a `paymentLinkUrl` on one of these (no open redirect).
 */
export const MERCADOPAGO_CHECKOUT_HOSTS = [
  'www.mercadopago.com.co',
  'mercadopago.com.co',
  'sandbox.mercadopago.com.co',
  'www.mercadopago.com',
  'sandbox.mercadopago.com',
] as const;

export function isMercadoPagoCheckoutUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  // Dependency-free (no `URL` global in this package's lib): https only, no
  // userinfo, no port, host exactly one of the allowed ones.
  const match = /^https:\/\/([a-z0-9.-]+)(?:[/?#]|$)/i.exec(url);
  if (!match) return false;
  return (MERCADOPAGO_CHECKOUT_HOSTS as readonly string[]).includes(match[1].toLowerCase());
}

// ----------------------------------------------------------------------------
// Plans: AdoptaFácil's own subscription billing (platform account)
// ----------------------------------------------------------------------------

/** `POST /org/plan/checkout` body (Owner/Administrator). Monthly only. */
export interface StartPlanCheckoutInput {
  plan: Exclude<PlanKey, 'free'>;
}

/** `POST /org/plan/checkout` — where to send the browser to authorize the
 *  monthly charge in Mercado Pago (AdoptaFácil's own account). */
export interface PlanCheckoutView {
  plan: Exclude<PlanKey, 'free'>;
  /** Monthly amount in COP, IVA included, after the founding discount. */
  monthlyAmountCop: number;
  checkoutUrl: string;
}

/**
 * `external_reference` of a plan subscription: `afplan:<orgId>:<plan>`.
 * Round-trips through Mercado Pago and back in the webhook read-back, so it
 * must be parseable without trusting anything else. The read-back is done
 * with the PLATFORM token: only AdoptaFácil's own preapprovals resolve.
 */
export function planSubscriptionReference(organizationId: string, plan: PlanKey): string {
  return `afplan:${organizationId}:${plan}`;
}

const PLAN_REFERENCE_PATTERN =
  /^afplan:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}):(crece|pro)$/i;

export function parsePlanSubscriptionReference(
  reference: string | null | undefined,
): { organizationId: string; plan: Exclude<PlanKey, 'free'> } | null {
  const match = PLAN_REFERENCE_PATTERN.exec(reference ?? '');
  if (!match) return null;
  return {
    organizationId: match[1].toLowerCase(),
    plan: match[2].toLowerCase() as Exclude<PlanKey, 'free'>,
  };
}

/**
 * Preapproval `status` → our subscription status. `authorized` is the only
 * one that activates a plan. Unknown ⇒ `null` (no change).
 */
export function mercadoPagoPreapprovalStatus(
  raw: string | null | undefined,
): 'active' | 'past_due' | 'canceled' | null {
  switch (raw) {
    case 'authorized':
      return 'active';
    case 'paused':
      return 'past_due';
    case 'cancelled':
      return 'canceled';
    default:
      return null; // pending: the payer has not authorized yet
  }
}

// ----------------------------------------------------------------------------
// Reconciliation: what each read-back payment leaves on record
// ----------------------------------------------------------------------------

/**
 * One Mercado Pago payment exactly as READ BACK with the organization's token
 * (never from the notification body). Stored per connected account so the
 * accounting ledger and the monthly reconciliation are built on what Mercado
 * Pago reported, without AdoptaFácil ever holding the money. No payer data.
 * Decimal amounts are strings (pesos, as Mercado Pago reports them).
 */
export interface MercadoPagoPaymentSnapshot {
  paymentId: string;
  collectorId: string;
  externalReference: string;
  status: string;
  statusDetail: string | null;
  currency: string;
  transactionAmount: string;
  /** `transaction_details.net_received_amount`. */
  netReceivedAmount: string | null;
  /** `fee_details` as reported (type, amount, fee_payer). */
  feeDetails: unknown[];
  paymentTypeId: string | null;
  paymentMethodId: string | null;
  dateApproved: string | null;
  moneyReleaseDate: string | null;
  /** `refunds` as reported (id, amount, date_created, status). */
  refunds: unknown[];
  transactionAmountRefunded: string | null;
}
