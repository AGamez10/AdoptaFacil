// Module: M15 payments · direct collection · Contracts owner: @fabian
//
// Design: docs/pagos/mercadopago-oauth.md (ADR-PAG-003) on top of ADR-PAG-001.
//
// The vocabulary and the PURE policy that the gateway adapter must go through,
// so that no adapter can ever route a donor's money to an AdoptaFácil account
// (D1: sin custodia).
//
// Rules this file encodes (and the tests in test/payment-gateways.test.ts pin):
//   1. The collector (who receives the money) is ALWAYS the organization, with
//      its own Mercado Pago account. There is no "platform collects and pays
//      out later" mode: custody is not a mode.
//   2. AdoptaFácil takes NO per-transaction fee (0 %, owner's decision). There
//      is no split mode and no platform fee rate anywhere in the policy.
//   3. A gateway payment is accepted only if amount, currency and the receiving
//      account match what the server expected (PAY-003).
//
// Money is integer COP pesos. Browser-safe, dependency-free.

import type { PaymentCurrency } from './payments';

// ----------------------------------------------------------------------------
// Vocabulary
// ----------------------------------------------------------------------------

/**
 * Gateways an organization can connect. 2026-11-06 (owner's decision,
 * ADR-PAG-003): Mercado Pago is the only gateway, with each organization
 * connecting its OWN account through OAuth. A new gateway is added here and in
 * `GATEWAY_CATALOG` only by the owner's decision.
 */
export const GATEWAY_PROVIDERS = ['mercadopago'] as const;
export type GatewayProvider = (typeof GATEWAY_PROVIDERS)[number];

/**
 * How money moves. There is intentionally NO mode in which AdoptaFácil
 * receives a donation into its own account, and none that splits a fee.
 *  - `direct_to_org`: the charge is created with the organization's OWN OAuth
 *    token; the org is the merchant of record and receives the donation minus
 *    the fee its own Mercado Pago account is charged.
 */
export const COLLECTION_MODES = ['direct_to_org'] as const;
export type CollectionMode = (typeof COLLECTION_MODES)[number];

/** What the organization hands over to connect a gateway. */
export type GatewayCredentialKind =
  /** Revocable OAuth grant; the org never shares a password or secret. */
  'oauth';

/** Evidence status of a capability, as of the date in `checkedAt`. */
export type GatewayCapabilityStatus =
  /** Documented by the provider for Colombia. */
  | 'documented'
  /** Provider said in writing it is not available in Colombia. */
  | 'not_available';

export interface GatewayCapability {
  provider: GatewayProvider;
  mode: CollectionMode;
  credentialKind: GatewayCredentialKind;
  /** Can the server confirm the payment (signed webhook + read-back)? */
  verifiable: boolean;
  status: GatewayCapabilityStatus;
  /** UTC date (YYYY-MM-DD) the sources were read. */
  checkedAt: string;
  /** Primary sources (provider docs / written replies). */
  sources: readonly string[];
}

/**
 * What we know today. Documentation-as-data; it NEVER enables anything by
 * itself (see `planCollection`).
 */
export const GATEWAY_CATALOG: readonly GatewayCapability[] = [
  {
    provider: 'mercadopago',
    mode: 'direct_to_org',
    credentialKind: 'oauth',
    verifiable: true,
    // The org connects ITS account through OAuth; Checkout Pro preferences
    // are created with ITS access token, so the org is the collector. Signed
    // notification + read-back of the payment with the org's token.
    status: 'documented',
    checkedAt: '2026-11-06',
    sources: [
      'https://www.mercadopago.com.co/developers/es/docs/security/oauth/introduction',
      'https://www.mercadopago.com.co/developers/es/docs/checkout-pro/overview',
      'https://www.mercadopago.com.co/developers/es/docs/your-integrations/notifications/webhooks',
    ],
  },
];

// ----------------------------------------------------------------------------
// Policy: who may collect, and how
// ----------------------------------------------------------------------------

/** A gateway connection owned by ONE organization (tenant-scoped, RLS). */
export interface OrgGatewayConnection {
  organizationId: string;
  provider: GatewayProvider;
  mode: CollectionMode;
  status: 'active' | 'revoked' | 'pending';
  /**
   * Opaque id of the org's account AT the gateway (the Mercado Pago user id).
   * Used to check that a confirmed payment landed in the org's account. Never
   * a secret.
   */
  gatewayAccountId: string | null;
}

/** Server-side configuration (env/config, never from the client). */
export interface CollectionPolicy {
  /** Modes switched on for this environment. Empty = payments off. */
  enabledModes: readonly CollectionMode[];
}

export interface CollectionPlan {
  provider: GatewayProvider;
  mode: CollectionMode;
  /** Always the organization: custody is not representable. */
  collector: 'organization';
  /** false ⇒ the payment cannot be confirmed by the platform. */
  verifiable: boolean;
}

export type CollectionRefusal =
  | 'payments_disabled'
  | 'no_active_connection'
  | 'connection_of_other_org'
  | 'mode_disabled'
  | 'mode_not_supported_by_provider';

export type CollectionDecision =
  { ok: true; plan: CollectionPlan } | { ok: false; reason: CollectionRefusal };

/**
 * Decide whether `organizationId` may collect through `connection`, and how.
 * Pure and deterministic: the API calls it before creating any checkout.
 * `catalog` defaults to `GATEWAY_CATALOG`.
 */
export function planCollection(
  organizationId: string,
  connection: OrgGatewayConnection | null,
  policy: CollectionPolicy,
  catalog: readonly GatewayCapability[] = GATEWAY_CATALOG,
): CollectionDecision {
  if (policy.enabledModes.length === 0) return { ok: false, reason: 'payments_disabled' };
  if (!connection || connection.status !== 'active') {
    return { ok: false, reason: 'no_active_connection' };
  }
  if (connection.organizationId !== organizationId) {
    return { ok: false, reason: 'connection_of_other_org' };
  }
  if (!policy.enabledModes.includes(connection.mode)) return { ok: false, reason: 'mode_disabled' };

  const capability = catalog.find(
    (c) => c.provider === connection.provider && c.mode === connection.mode,
  );
  if (!capability || capability.status === 'not_available') {
    return { ok: false, reason: 'mode_not_supported_by_provider' };
  }

  return {
    ok: true,
    plan: {
      provider: connection.provider,
      mode: connection.mode,
      collector: 'organization',
      verifiable: capability.verifiable,
    },
  };
}

// ----------------------------------------------------------------------------
// Confirmation: a gateway event is trusted only if it matches what we expected
// ----------------------------------------------------------------------------

/** What the server recorded when it created the checkout. */
export interface ExpectedGatewayPayment {
  /** Integer COP pesos the payer is charged. */
  amountCharged: number;
  currency: PaymentCurrency;
  /** The org's `gatewayAccountId` at checkout time. */
  receiverAccountId: string;
  /** Our reference sent to the gateway (idempotency/external reference). */
  reference: string;
}

/** What the adapter READ BACK from the gateway API (never from the webhook body alone). */
export interface GatewayPaymentSnapshot {
  status: 'approved' | 'pending' | 'declined' | 'refunded' | 'charged_back' | 'error';
  /** Integer COP pesos actually charged. */
  amount: number;
  currency: string;
  /** Account that received the money, as reported by the gateway. */
  receiverAccountId: string;
  reference: string;
}

export type PaymentMismatch = 'amount' | 'currency' | 'receiver' | 'reference';

/**
 * PAY-003: compare the read-back payment with what we expected. Any mismatch
 * must move the donation to a review state and raise an alert, never approve.
 * A `receiver` mismatch is the custody tripwire: money landed somewhere other
 * than the organization's own account.
 */
export function findPaymentMismatches(
  expected: ExpectedGatewayPayment,
  actual: GatewayPaymentSnapshot,
): PaymentMismatch[] {
  const out: PaymentMismatch[] = [];
  if (actual.reference !== expected.reference) out.push('reference');
  if (!Number.isInteger(actual.amount) || actual.amount !== expected.amountCharged)
    out.push('amount');
  if (actual.currency !== expected.currency) out.push('currency');
  if (actual.receiverAccountId !== expected.receiverAccountId) out.push('receiver');
  return out;
}
