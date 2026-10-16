// Module: M15 payments · multi-gateway direct collection · Contracts owner: @fabian
//
// Design: docs/pagos/pasarelas-multiples.md (ADR-PAG-001).
//
// ADDITIVE contract. It does not touch the published `PaymentPort` in
// `payments.ts`; it adds the vocabulary and the PURE policy that every gateway
// adapter must go through, so that no adapter can ever route a donor's money to
// an AdoptaFácil account (D1: sin custodia).
//
// Rules this file encodes (and the tests in test/payment-gateways.test.ts pin):
//   1. The collector (who receives the money) is ALWAYS the organization. There
//      is no "platform collects and pays out later" mode: custody is not a mode.
//   2. AdoptaFácil takes a per-transaction fee ONLY when the gateway splits at
//      source (`platform_split`) AND a written provider approval reference is
//      configured. Otherwise the platform fee is 0 and revenue comes from plans.
//   3. A gateway payment is accepted only if amount, currency and the receiving
//      account match what the server expected (PAY-003).
//   4. `external_link` payments cannot be verified by the platform: they are
//      shown as "reportado por la organización", never as confirmed.
//
// Money is integer COP pesos. Browser-safe, dependency-free.

import type { PaymentCurrency } from './payments';

// ----------------------------------------------------------------------------
// Vocabulary
// ----------------------------------------------------------------------------

/**
 * Gateways an organization can connect. Since 2026-10-15 ePayco is the main
 * gateway (owner's decision, ADR-PAG-002); the order here is historical and
 * carries no meaning.
 */
export const GATEWAY_PROVIDERS = [
  'mercadopago',
  'wompi',
  'epayco',
  'bold',
  'external_link',
] as const;
export type GatewayProvider = (typeof GATEWAY_PROVIDERS)[number];

/**
 * How money moves. There is intentionally NO mode in which AdoptaFácil
 * receives a donation into its own account.
 *  - `direct_to_org`: the charge is created with the organization's OWN
 *    credentials (OAuth token or its merchant keys); the org is the merchant of
 *    record and receives 100 % minus its own gateway fees.
 *  - `platform_split`: the gateway itself splits at source; the org is still
 *    the collector and the platform fee is deducted by the gateway. Requires a
 *    written provider confirmation (D1/D2, §3.4).
 *  - `external_link`: the org's own payment link (Bold, Nequi, ePayco, a bank
 *    button…). AdoptaFácil only redirects; it cannot verify the payment.
 */
export const COLLECTION_MODES = ['direct_to_org', 'platform_split', 'external_link'] as const;
export type CollectionMode = (typeof COLLECTION_MODES)[number];

/** What the organization hands over to connect a gateway. */
export type GatewayCredentialKind =
  /** Revocable OAuth grant; the org never shares a password or secret. */
  | 'oauth'
  /** The org's own merchant keys (stored encrypted, AF-014). */
  | 'merchant_keys'
  /** Nothing secret: a public URL. */
  | 'none';

/** Evidence status of a capability, as of the date in `checkedAt`. */
export type GatewayCapabilityStatus =
  /** Documented by the provider for Colombia; still needs a sandbox test. */
  | 'documented'
  /** Documented somewhere but contradicted, or needs commercial activation:
   *  stays OFF until written confirmation. */
  | 'requires_written_confirmation'
  /** Provider said in writing it is not available in Colombia. */
  | 'not_available';

export interface GatewayCapability {
  provider: GatewayProvider;
  mode: CollectionMode;
  credentialKind: GatewayCredentialKind;
  /** Can the server confirm the payment (signed webhook + read-back)? */
  verifiable: boolean;
  /** Can the gateway deduct an AdoptaFácil fee at source? */
  platformFeeAtSource: boolean;
  status: GatewayCapabilityStatus;
  /** UTC date (YYYY-MM-DD) the sources were read. */
  checkedAt: string;
  /** Primary sources (provider docs / written replies). */
  sources: readonly string[];
}

/**
 * What we know today. This is documentation-as-data so the UI and the
 * superadmin can show it; it NEVER enables anything by itself (see
 * `planCollection`).
 */
export const GATEWAY_CATALOG: readonly GatewayCapability[] = [
  {
    provider: 'mercadopago',
    mode: 'direct_to_org',
    credentialKind: 'oauth',
    verifiable: true,
    platformFeeAtSource: false,
    status: 'documented',
    checkedAt: '2026-10-08',
    sources: [
      'https://www.mercadopago.com.co/developers/es/docs/split-payments/split-1-1/integration-configuration/integrate-marketplace',
    ],
  },
  {
    provider: 'mercadopago',
    mode: 'platform_split',
    credentialKind: 'oauth',
    verifiable: true,
    platformFeeAtSource: true,
    // Public page lists Colombia; MP support replied in writing (2026-10-01)
    // that Split 1:1 is not active for MCO. Written reply wins until MP says
    // otherwise in writing.
    status: 'not_available',
    checkedAt: '2026-10-08',
    sources: [
      'https://www.mercadopago.com.co/developers/es/docs/split-payments/landing',
      'ticket de soporte Mercado Pago, respuesta del 2026-10-01 (App ID 1063908913630070)',
    ],
  },
  {
    provider: 'wompi',
    mode: 'direct_to_org',
    credentialKind: 'merchant_keys',
    verifiable: true,
    platformFeeAtSource: false,
    status: 'documented',
    checkedAt: '2026-10-08',
    sources: ['https://docs.wompi.co/en/docs/colombia/inicio-rapido/'],
  },
  {
    provider: 'epayco',
    mode: 'direct_to_org',
    credentialKind: 'merchant_keys',
    verifiable: true,
    platformFeeAtSource: false,
    // The org's own ePayco account (persona natural or jurídica): checkout v2
    // session created with ITS keys, confirmation signed with ITS P_KEY and
    // read back from ePayco. The money lands in the org's ePayco balance.
    status: 'documented',
    checkedAt: '2026-10-15',
    sources: [
      'https://docs.epayco.com/docs/checkout-implementacion',
      'https://docs.epayco.com/docs/checkout-respuesta-y-confirmacion',
    ],
  },
  {
    provider: 'epayco',
    mode: 'platform_split',
    credentialKind: 'merchant_keys',
    verifiable: true,
    platformFeeAtSource: true,
    // "Pagos divididos": aggregator/gateway models only, enabled by ePayco on
    // request; receivers must be validated ePayco merchants. In the aggregator
    // model the transaction is in the PRINCIPAL's name (AdoptaFácil) and the
    // dispersion runs from its account: legal review required (ADR-PAG-002).
    status: 'requires_written_confirmation',
    checkedAt: '2026-10-15',
    sources: [
      'https://docs.epayco.com/docs/split-descripcion',
      'https://epayco.com/pagos-divididos/',
    ],
  },
  {
    provider: 'bold',
    mode: 'external_link',
    credentialKind: 'none',
    verifiable: false,
    platformFeeAtSource: false,
    status: 'documented',
    checkedAt: '2026-10-08',
    sources: ['https://developers.bold.co/pagos-en-linea/llaves-de-integracion'],
  },
  {
    provider: 'external_link',
    mode: 'external_link',
    credentialKind: 'none',
    verifiable: false,
    platformFeeAtSource: false,
    status: 'documented',
    checkedAt: '2026-10-08',
    sources: [],
  },
];

// ----------------------------------------------------------------------------
// Policy: who may collect, how, and with which platform fee
// ----------------------------------------------------------------------------

/** A gateway connection owned by ONE organization (tenant-scoped, RLS). */
export interface OrgGatewayConnection {
  organizationId: string;
  provider: GatewayProvider;
  mode: CollectionMode;
  status: 'active' | 'revoked' | 'pending';
  /**
   * Opaque id of the org's account AT the gateway (MP user id, Wompi merchant
   * id…). Used to check that a confirmed payment landed in the org's account.
   * Never a secret.
   */
  gatewayAccountId: string | null;
}

/** Server-side configuration (env/config, never from the client). */
export interface CollectionPolicy {
  /** Modes switched on for this environment. Empty = payments off. */
  enabledModes: readonly CollectionMode[];
  /** Per-transaction AdoptaFácil fee for `platform_split` (e.g. 0.04). */
  splitPlatformFeeRate: number;
  /**
   * Written provider approval for `platform_split` (ticket/contract ref).
   * Without it, `platform_split` is refused even if enabled.
   */
  splitApprovalRef: string | null;
}

export interface CollectionPlan {
  provider: GatewayProvider;
  mode: CollectionMode;
  /** Always the organization: custody is not representable. */
  collector: 'organization';
  /** 0 unless the gateway deducts it at source with written approval. */
  platformFeeRate: number;
  /** false ⇒ the UI must say "reportado por la organización". */
  verifiable: boolean;
}

export type CollectionRefusal =
  | 'payments_disabled'
  | 'no_active_connection'
  | 'connection_of_other_org'
  | 'mode_disabled'
  | 'mode_not_supported_by_provider'
  | 'split_without_written_approval'
  | 'invalid_fee_rate';

export type CollectionDecision =
  { ok: true; plan: CollectionPlan } | { ok: false; reason: CollectionRefusal };

function capabilityFor(
  provider: GatewayProvider,
  mode: CollectionMode,
): GatewayCapability | undefined {
  return GATEWAY_CATALOG.find((c) => c.provider === provider && c.mode === mode);
}

/**
 * Decide whether `organizationId` may collect through `connection`, and how.
 * Pure and deterministic: the API calls it before creating any checkout, and
 * the web may call it to explain why the "Donar" button is hidden.
 */
export function planCollection(
  organizationId: string,
  connection: OrgGatewayConnection | null,
  policy: CollectionPolicy,
): CollectionDecision {
  if (policy.enabledModes.length === 0) return { ok: false, reason: 'payments_disabled' };
  if (!connection || connection.status !== 'active') {
    return { ok: false, reason: 'no_active_connection' };
  }
  if (connection.organizationId !== organizationId) {
    return { ok: false, reason: 'connection_of_other_org' };
  }
  if (!policy.enabledModes.includes(connection.mode)) return { ok: false, reason: 'mode_disabled' };

  const capability = capabilityFor(connection.provider, connection.mode);
  if (!capability || capability.status === 'not_available') {
    return { ok: false, reason: 'mode_not_supported_by_provider' };
  }

  let platformFeeRate = 0;
  if (connection.mode === 'platform_split') {
    if (!policy.splitApprovalRef || policy.splitApprovalRef.trim() === '') {
      return { ok: false, reason: 'split_without_written_approval' };
    }
    const rate = policy.splitPlatformFeeRate;
    if (!Number.isFinite(rate) || rate < 0 || rate >= 1) {
      return { ok: false, reason: 'invalid_fee_rate' };
    }
    platformFeeRate = rate;
  }

  return {
    ok: true,
    plan: {
      provider: connection.provider,
      mode: connection.mode,
      collector: 'organization',
      platformFeeRate,
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
