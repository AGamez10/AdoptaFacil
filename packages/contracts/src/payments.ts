// Module: M15 payments · Contracts owner: @fabian
//
// PaymentPort (contract-first, Ola 2, T-040). Publishes ONLY the contract that the
// money engine exposes so the consumers (M06 campaigns, M07 sponsorships, M05
// donations, …) can build against a stable, simulable surface WITHOUT waiting for
// the real gateway adapter (that is M15 implementation, a later task).
//
// CLOSED decisions reflected here (do NOT reopen):
//   - Gateway: cobro directo a la organización con Mercado Pago y la cuenta
//     propia del refugio conectada por OAuth (ADR-PAG-003). NO split at
//     checkout — the port never models a split; `breakdown` is
//     informational/accounting only.
//   - Platform commission 0 % (owner's decision): AdoptaFácil takes nothing
//     from a donation. The gateway's own fee is set by Mercado Pago on the
//     organization's account and is never estimated here; the real fee and net
//     come from the read-back of the payment (`mercadopago_payments`).
//   - No custody: the money never passes through an AdoptaFácil account. COP only.
//
// This file is TYPES + a PURE breakdown function + a deterministic FAKE adapter
// (dev/test double, dependency-free, browser-safe). The DI token (PAYMENT_PORT),
// @Global module and binding live in core/ and are Sebastián's task — NOT here.
// Money is ALWAYS integer COP pesos (never float). RNF12: the breakdown is
// auditable and reconciles to the peso.

import type { MercadoPagoPaymentSnapshot } from './mercadopago';

/** Only currency in Ola 1. */
export type PaymentCurrency = 'COP';

/** Lifecycle of a collection (recaudo). */
export type PaymentStatus = 'pending' | 'approved' | 'declined' | 'voided' | 'error';

/** What the money is FOR (drives beneficiary/accounting; not a checkout split). */
export type PaymentConceptKind = 'organization' | 'animal' | 'campaign' | 'sponsorship';

export interface PaymentConcept {
  kind: PaymentConceptKind;
  /** Id of the org/animal/campaign this collection is attributed to. */
  id: string;
}

/** Minimal payer contact (Ley 1581: personal data — never logged in clear). */
export interface PaymentPayer {
  fullName?: string;
  email?: string;
  /** National id / NIT if provided (SARLAFT context; handled by M15, not the port). */
  documentId?: string;
}

/**
 * Itemized, auditable breakdown (RNF12). All amounts are integer COP pesos.
 * INVARIANT (holds to the peso, both modes):
 *   gross === net + platformFee + platformIva + gatewayFee + gatewayIva
 * `amountCharged` is what the payer's instrument is charged; in Ola 1 (no split,
 * no tips) it equals `gross`.
 */
export interface PaymentBreakdown {
  amountCharged: number;
  gross: number;
  platformFee: number;
  platformIva: number;
  gatewayFee: number;
  gatewayIva: number;
  net: number;
}

export interface CreateCollectionInput {
  /** Integer COP pesos that must REACH the beneficiary (net target). */
  intendedAmount: number;
  currency: PaymentCurrency;
  concept: PaymentConcept;
  payer?: PaymentPayer;
  /** Caller-supplied key: a retry with the same key must NOT double-charge. */
  idempotencyKey: string;
  /**
   * ADR-PAG-003 (Mercado Pago OAuth): the BENEFICIARY organization's own
   * access token, obtained through OAuth and decrypted SERVER-SIDE. Server-only:
   * never serialized, logged or audited. The Mercado Pago driver refuses to
   * charge without it (no fallback to the platform account: that is custody).
   */
  mercadopagoCollector?: MercadoPagoCollectorCredentials;
}

/**
 * The organization's own Mercado Pago grant (ADR-PAG-003). `userId` is the
 * collector id (not a secret); `accessToken` is, and is stored encrypted.
 */
export interface MercadoPagoCollectorCredentials {
  /** The organization id the grant belongs to (routes the notification). */
  organizationId: string;
  /** Mercado Pago user id of the organization (= `collector_id`). */
  userId: string;
  /** OAuth access token of the organization. Secret. */
  accessToken: string;
}

export interface CollectionResult {
  collectionId: string;
  status: PaymentStatus;
  breakdown: PaymentBreakdown;
  /**
   * URL where the payer completes the checkout (e.g. the link sent in a "tu
   * pago está listo" reminder for a recurring collection, T-057). Optional so
   * a caller reading data persisted before this field existed (or a future
   * adapter that genuinely has no separate checkout URL) never assumes it is
   * present.
   */
  paymentLinkUrl?: string;
}

/** Normalized, idempotent webhook event (dedup by `dedupKey`). */
export interface NormalizedWebhookEvent {
  eventId: string;
  collectionId: string;
  status: PaymentStatus;
  /** Stable key to dedup repeated deliveries of the same event. */
  dedupKey: string;
  /**
   * What the gateway reports was charged, read back from its API (integer COP
   * pesos). Optional/additive: the caller compares it with the stored
   * `amountCharged` and never settles a donation on a mismatch (PAY-003).
   */
  amountCharged?: number;
  /** Currency reported by the gateway, when it reports one. */
  currency?: string;
  /** Account that received the money, as established by the read-back. */
  receiverAccountId?: string;
  /** ADR-PAG-003: the full read-back of a Mercado Pago payment, for the
   *  per-account reconciliation record. Server-only. */
  mercadopagoPayment?: MercadoPagoPaymentSnapshot;
}

/**
 * Transport-level context a webhook verifier may need BESIDES the raw body and
 * the signature header (MercadoPago, T-0xx/Fase 1): its `x-signature` scheme
 * needs `x-request-id` and the `data.id` query param to build the manifest, and
 * it does NOT include the payment status in the body — the verifier must fetch
 * it separately. Optional/aditive so a driver that doesn't need it (the fake
 * adapter) simply ignores it.
 */
export interface WebhookVerificationContext {
  headers?: Record<string, string | undefined>;
  query?: Record<string, string | undefined>;
  /** ADR-PAG-003: Mercado Pago grant of the organization that owns the payment. */
  mercadopagoCollector?: MercadoPagoCollectorCredentials;
}

/**
 * The money-engine port (hexagonal). Ola 1 binds a simulable adapter; the real
 * MercadoPago adapter arrives behind this SAME interface (M15/Ola 2 implementation).
 * Idempotency, retries and reconciliation live in M15; the port only exposes the
 * operations (and accepts the idempotency key).
 */
export interface PaymentPort {
  /** Start a collection (checkout). Returns the auditable breakdown. */
  createCollection(input: CreateCollectionInput): Promise<CollectionResult>;
  /** Current status of a collection. */
  getCollectionStatus(collectionId: string): Promise<PaymentStatus>;
  /**
   * Verify a gateway webhook signature and normalize it to a dedup-able event.
   * ASYNC: MercadoPago's webhook body carries only an id (never the payment
   * status), so a compliant verifier must make a separate API call to resolve
   * the actual status before returning. `context` carries the transport
   * details (headers/query) a given driver's signature scheme needs beyond
   * the raw body + signature header.
   */
  verifyAndNormalizeWebhook(
    payload: unknown,
    signature: string,
    context?: WebhookVerificationContext,
  ): Promise<NormalizedWebhookEvent>;
}

// ============================================================================
// Pure breakdown (RNF12) — the SINGLE source of the donation amounts, reusable by
// the port, the checkout UI and the receipt (misma cuenta).
// ============================================================================

/**
 * Breakdown of a direct collection (ADR-PAG-001/003). The donor pays exactly
 * the amount they chose and it lands in the organization's own Mercado Pago
 * account. AdoptaFácil takes NO fee (0 %, owner's decision) and invents no
 * gateway fee: Mercado Pago charges its own rate to the organization's account,
 * and the real fee/net are read back from the payment afterwards. So every
 * fee is 0 and `net === gross === amountCharged === intendedAmount`.
 *
 * @param intendedAmount integer COP pesos the donor gives (> 0).
 */
export function computeBreakdown(intendedAmount: number): PaymentBreakdown {
  if (!Number.isInteger(intendedAmount) || intendedAmount <= 0) {
    throw new RangeError('intendedAmount must be a positive integer number of COP pesos');
  }
  return {
    amountCharged: intendedAmount,
    gross: intendedAmount,
    platformFee: 0,
    platformIva: 0,
    gatewayFee: 0,
    gatewayIva: 0,
    net: intendedAmount,
  };
}

// ============================================================================
// FakePaymentAdapter — deterministic, dependency-free, browser-safe test double.
// Ola 1 dev/test only. The REAL MercadoPago adapter is M15 implementation. If the daily
// decides the fake lives in core/ with the other stubs, this can move there
// unchanged — it depends only on this file's types + computeBreakdown.
// ============================================================================

/** Dependency-free deterministic string hash (djb2) → positive hex; no node/crypto. */
function stableHash(input: string): string {
  let hash = 5381;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 33) ^ input.charCodeAt(i);
  }
  // >>> 0 makes it an unsigned 32-bit int, stable across runs and environments.
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/** Shape a fake webhook payload is expected to carry (all optional/best-effort). */
interface FakeWebhookPayload {
  collectionId?: string;
  status?: PaymentStatus;
  eventId?: string;
}

/**
 * Deterministic {@link PaymentPort} for development and tests: no network, no
 * randomness, no clock. The same `idempotencyKey` always yields the same ids and
 * result (ids are DERIVED from the key, so no state is needed). Collections settle
 * as `approved`.
 */
export class FakePaymentAdapter implements PaymentPort {
  static readonly PROVIDER = 'fake-local';

  async createCollection(input: CreateCollectionInput): Promise<CollectionResult> {
    // Network-free and deterministic: this double never calls a gateway.
    const collectionId = `fake-col-${stableHash(input.idempotencyKey)}`;
    return {
      collectionId,
      status: 'approved',
      breakdown: computeBreakdown(input.intendedAmount),
      paymentLinkUrl: `https://fake-checkout.local/l/${collectionId}`,
    };
  }

  async getCollectionStatus(_collectionId: string): Promise<PaymentStatus> {
    return 'approved';
  }

  async verifyAndNormalizeWebhook(
    payload: unknown,
    _signature: string,
    _context?: WebhookVerificationContext,
  ): Promise<NormalizedWebhookEvent> {
    const body = (payload ?? {}) as FakeWebhookPayload;
    const collectionId = body.collectionId ?? 'fake-col-unknown';
    const eventId = body.eventId ?? `fake-evt-${stableHash(collectionId)}`;
    return {
      eventId,
      collectionId,
      status: body.status ?? 'approved',
      dedupKey: eventId,
    };
  }
}
