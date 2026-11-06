import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  computeBreakdown,
  DIRECT_COLLECTION_RATES,
  isMercadoPagoCheckoutUrl,
  MERCADOPAGO_RESOURCE_ID_PATTERN,
  mercadoPagoPaymentStatus,
  planCollection,
  type CollectionResult,
  type CreateCollectionInput,
  type CreatePayoutInput,
  type MercadoPagoCollectorCredentials,
  type MercadoPagoPaymentSnapshot,
  type NormalizedPayoutWebhookEvent,
  type NormalizedWebhookEvent,
  type PaymentPort,
  type PaymentStatus,
  type PayoutResult,
  type WebhookVerificationContext,
} from '@adoptafacil/contracts';
import type { Env } from '../../config/env.validation';
import { mercadoPagoTimeoutSignal } from './mercadopago-http';

/** Injectable fetch surface so tests run with ZERO network. */
export type MercadoPagoFetch = typeof fetch;

/** Our reference (`external_reference` = donation `collection_id`). */
export const MERCADOPAGO_REFERENCE_MAX_LENGTH = 32;

/** Hours a donation's Checkout Pro link stays payable. */
const PREFERENCE_TTL_HOURS = 72;

/**
 * Stable reference sent as `external_reference` and returned as
 * `collectionId`. Derived from the organization AND the caller's idempotency
 * key: the key is only unique per organization while `donations.collection_id`
 * is globally unique. Deterministic, so a retry maps to the same reference.
 */
export function mercadoPagoReferenceFor(organizationId: string, idempotencyKey: string): string {
  const digest = createHash('sha256').update(`${organizationId}:${idempotencyKey}`).digest('hex');
  return `af-${digest}`.slice(0, MERCADOPAGO_REFERENCE_MAX_LENGTH);
}

/** `x-signature: ts=…,v1=…` → its parts (either may be missing). */
export function parseMercadoPagoSignature(header: string | undefined): {
  ts?: string;
  v1?: string;
} {
  const result: { ts?: string; v1?: string } = {};
  for (const part of (header ?? '').split(',')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (key === 'ts') result.ts = value;
    if (key === 'v1') result.v1 = value;
  }
  return result;
}

/**
 * Mercado Pago's documented manifest: `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`
 * (alphanumeric ids lowercased), HMAC-SHA256 with the application's secret.
 * https://www.mercadopago.com.co/developers/es/docs/your-integrations/notifications/webhooks
 */
export function mercadoPagoSignatureV1(
  secret: string,
  dataId: string,
  requestId: string,
  ts: string,
): string {
  const manifest = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${ts};`;
  return createHmac('sha256', secret).update(manifest).digest('hex');
}

/** Constant-time hex comparison; different lengths are simply "invalid". */
function timingSafeEqualHex(computedHex: string, givenHex: string): boolean {
  if (!/^[0-9a-f]+$/i.test(givenHex)) return false;
  const computed = Buffer.from(computedHex, 'hex');
  const given = Buffer.from(givenHex.toLowerCase(), 'hex');
  if (computed.length !== given.length) return false;
  return timingSafeEqual(computed, given);
}

/**
 * Verify a notification's `x-signature` (throws on any failure). Shared by
 * the donations webhook (org-owned payments) and the plans webhook
 * (AdoptaFácil's own subscriptions): both are notifications of the same
 * application, signed with the same secret.
 */
export function assertMercadoPagoSignature(
  secret: string | undefined,
  signatureHeader: string | undefined,
  requestId: string | undefined,
  dataId: string | undefined,
): void {
  const { ts, v1 } = parseMercadoPagoSignature(signatureHeader);
  if (!secret || !ts || !v1 || !requestId || !dataId) {
    throw new Error('Mercado Pago notification rejected: missing signature parts.');
  }
  // AF-032: never log the secret nor the computed HMAC.
  if (!timingSafeEqualHex(mercadoPagoSignatureV1(secret, dataId, requestId, ts), v1)) {
    throw new Error('Mercado Pago notification rejected: signature mismatch.');
  }
}

/** `data.id` of a notification: query (`data.id`) first, then the body. */
export function mercadoPagoNotificationDataId(
  payload: unknown,
  query?: Record<string, string | undefined>,
): string | undefined {
  const fromQuery = query?.['data.id'] ?? query?.id;
  const data = (payload as { data?: { id?: unknown } } | null)?.data;
  const fromBody =
    typeof data?.id === 'string' || typeof data?.id === 'number' ? String(data.id) : undefined;
  const id = fromQuery ?? fromBody;
  return id && MERCADOPAGO_RESOURCE_ID_PATTERN.test(id) ? id : undefined;
}

/** `type` of a notification (`payment`, `subscription_preapproval`, …). */
export function mercadoPagoNotificationType(
  payload: unknown,
  query?: Record<string, string | undefined>,
): string | undefined {
  const body = (payload ?? {}) as { type?: unknown; topic?: unknown };
  const value = query?.type ?? query?.topic ?? body.type ?? body.topic;
  return typeof value === 'string' ? value : undefined;
}

/** Amount as integer COP; anything else becomes NaN (never matches). */
function integerAmount(value: unknown): number {
  const n = typeof value === 'string' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) && Number.isInteger(n) ? n : Number.NaN;
}

/** Decimal as reported, kept as a string (never rounded here). */
function decimalString(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'string' && /^-?\d+(\.\d+)?$/.test(value)) return value;
  return null;
}

function optionalString(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null;
}

/**
 * Reconciliation record of a read-back payment (ADR-PAG-003). Only what the
 * ledger needs: ids, status, amounts, fees, dates, method and refunds — never
 * the payer (name, email, document, card).
 */
export function mercadoPagoPaymentSnapshot(
  payment: Record<string, unknown>,
  paymentId: string,
  collectorId: string,
  reference: string,
): MercadoPagoPaymentSnapshot {
  const details = (payment.transaction_details ?? {}) as Record<string, unknown>;
  const fees = Array.isArray(payment.fee_details) ? payment.fee_details : [];
  const refunds = Array.isArray(payment.refunds) ? payment.refunds : [];
  return {
    paymentId,
    collectorId,
    externalReference: reference,
    status: optionalString(payment.status) ?? 'unknown',
    statusDetail: optionalString(payment.status_detail),
    currency: optionalString(payment.currency_id) ?? '',
    transactionAmount: decimalString(payment.transaction_amount) ?? '0',
    netReceivedAmount: decimalString(details.net_received_amount),
    feeDetails: fees.map((f: Record<string, unknown>) => ({
      type: optionalString(f?.type),
      amount: decimalString(f?.amount),
      fee_payer: optionalString(f?.fee_payer),
    })),
    paymentTypeId: optionalString(payment.payment_type_id),
    paymentMethodId: optionalString(payment.payment_method_id),
    dateApproved: optionalString(payment.date_approved),
    moneyReleaseDate: optionalString(payment.money_release_date),
    refunds: refunds.map((r: Record<string, unknown>) => ({
      id: r?.id === undefined ? null : String(r.id),
      amount: decimalString(r?.amount),
      status: optionalString(r?.status),
      date_created: optionalString(r?.date_created),
    })),
    transactionAmountRefunded: decimalString(payment.transaction_amount_refunded),
  };
}

const NO_CUSTODY_ERROR =
  "MercadoPagoPaymentAdapter requires the organization's own Mercado Pago grant " +
  '(mercadopagoCollector). Charging with the platform account is custody and is not ' +
  'allowed (ADR-PAG-001).';

/**
 * Real Mercado Pago {@link PaymentPort} adapter (ADR-PAG-003): Checkout Pro
 * with the BENEFICIARY organization's OAuth token. The org is the collector
 * (merchant of record), the money lands in ITS Mercado Pago account and
 * AdoptaFácil takes no per-transaction fee (split 1:1 is not available in
 * Colombia; `planCollection` refuses it). There is no fallback to a platform
 * token: without the org's grant nothing is charged.
 *
 * Settlement: a notification is accepted only if its `x-signature` verifies
 * with the application's secret AND the payment, READ BACK with the org's
 * own token, belongs to that org (`collector_id`). Only read-back values
 * (status, amount, currency, reference) are trusted.
 *
 * Secrets (tokens, webhook secret) are never logged nor put in an error.
 */
@Injectable()
export class MercadoPagoPaymentAdapter implements PaymentPort {
  private readonly logger = new Logger('MercadoPagoPaymentAdapter');
  private readonly baseUrl: string;
  private readonly apiPublicBase: string;
  private readonly webBase: string;
  private readonly webhookSecret: string | undefined;
  private readonly test: boolean;
  private readonly statementDescriptor: string | undefined;

  constructor(
    config: ConfigService<Env, true>,
    private readonly fetchFn: MercadoPagoFetch = globalThis.fetch.bind(globalThis),
  ) {
    const trim = (url: string) => url.replace(/\/+$/, '');
    this.baseUrl = trim(
      (config.get('MERCADOPAGO_BASE_URL', { infer: true }) as string | undefined) ??
        'https://api.mercadopago.com',
    );
    this.apiPublicBase = trim(
      (config.get('API_PUBLIC_BASE_URL', { infer: true }) as string | undefined) ??
        (config.get('STORAGE_PUBLIC_BASE_URL', { infer: true }) as string | undefined) ??
        'http://localhost:3000',
    );
    this.webBase = trim(
      (config.get('WEB_BASE_URL', { infer: true }) as string | undefined) ??
        'http://localhost:5173',
    );
    this.webhookSecret = config.get('MERCADOPAGO_WEBHOOK_SECRET', { infer: true }) as
      string | undefined;
    this.test = config.get('MERCADOPAGO_TEST', { infer: true }) === true;
    this.statementDescriptor = config.get('MERCADOPAGO_STATEMENT_DESCRIPTOR', { infer: true }) as
      string | undefined;
  }

  /** Where Mercado Pago notifies payments of THIS organization. */
  notificationUrlFor(organizationId: string): string {
    return `${this.apiPublicBase}/donations/webhook/mercadopago/${organizationId}?source_news=webhooks`;
  }

  /** Platform fee for this charge, decided ONLY by `planCollection` ⇒ 0. */
  private assertDirectCollection(collector: MercadoPagoCollectorCredentials): void {
    const decision = planCollection(
      collector.organizationId,
      {
        organizationId: collector.organizationId,
        provider: 'mercadopago',
        mode: 'direct_to_org',
        status: 'active',
        gatewayAccountId: collector.userId,
      },
      { enabledModes: ['direct_to_org'], splitPlatformFeeRate: 0, splitApprovalRef: null },
    );
    if (!decision.ok || decision.plan.platformFeeRate !== 0) {
      throw new Error(
        'MercadoPagoPaymentAdapter: direct collection refused. No charge was created.',
      );
    }
  }

  /**
   * Create a Checkout Pro preference with the ORG's token. `collectionId` =
   * our `external_reference` (known before payment); the payer is sent to
   * `paymentLinkUrl` (Mercado Pago's hosted checkout: card, PSE, Efecty…,
   * whatever the org's account offers).
   */
  async createCollection(input: CreateCollectionInput): Promise<CollectionResult> {
    const collector = input.mercadopagoCollector;
    if (!collector?.accessToken || !collector.userId || !collector.organizationId) {
      throw new Error(NO_CUSTODY_ERROR);
    }
    this.assertDirectCollection(collector);

    const breakdown = computeBreakdown(
      input.intendedAmount,
      input.commissionPayer,
      DIRECT_COLLECTION_RATES,
    );
    const reference = mercadoPagoReferenceFor(collector.organizationId, input.idempotencyKey);
    const back = new URL(`${this.webBase}/donaciones/resultado`);
    back.searchParams.set('reference', reference);
    const backUrl = back.toString();
    const expiresAt = new Date(Date.now() + PREFERENCE_TTL_HOURS * 60 * 60 * 1000);

    const body: Record<string, unknown> = {
      items: [
        {
          id: input.concept.kind,
          title: 'Donación',
          description: `Donación vía AdoptaFácil (${input.concept.kind})`,
          category_id: 'donations',
          quantity: 1,
          currency_id: 'COP',
          unit_price: breakdown.amountCharged,
        },
      ],
      external_reference: reference,
      notification_url: this.notificationUrlFor(collector.organizationId),
      back_urls: { success: backUrl, pending: backUrl, failure: backUrl },
      auto_return: 'approved',
      expires: true,
      expiration_date_to: expiresAt.toISOString(),
      // What the money is for (never personal data).
      metadata: { concept_kind: input.concept.kind, concept_id: input.concept.id },
    };
    if (this.statementDescriptor) body.statement_descriptor = this.statementDescriptor;
    if (input.payer?.email || input.payer?.fullName) {
      body.payer = {
        ...(input.payer.email ? { email: input.payer.email } : {}),
        ...(input.payer.fullName ? { name: input.payer.fullName } : {}),
      };
    }

    const response = await this.fetchFn(`${this.baseUrl}/checkout/preferences`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${collector.accessToken}`,
        'X-Idempotency-Key': reference,
      },
      body: JSON.stringify(body),
      signal: mercadoPagoTimeoutSignal(),
    });
    if (!response.ok) {
      throw new Error(`Mercado Pago preference create failed (${response.status})`);
    }
    const pref = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    const link = (this.test ? pref?.sandbox_init_point : pref?.init_point) as string | undefined;
    if (!pref?.id || !isMercadoPagoCheckoutUrl(link)) {
      throw new Error('Mercado Pago preference create returned no usable checkout link');
    }
    if (pref.collector_id !== undefined && String(pref.collector_id) !== collector.userId) {
      throw new Error('Mercado Pago preference belongs to another collector');
    }
    this.logger.log(`preference created reference=${reference} test=${this.test}`);

    return { collectionId: reference, status: 'pending', breakdown, paymentLinkUrl: link };
  }

  /** Needs the org's token, which the port signature does not carry: the
   *  signed notification is the settlement path for Mercado Pago. */
  async getCollectionStatus(_collectionId: string): Promise<PaymentStatus> {
    throw new Error(
      'MercadoPagoPaymentAdapter.getCollectionStatus is not supported: the signed notification ' +
        "read back with the organization's token is the settlement path.",
    );
  }

  /**
   * Verify a `payment` notification and normalize it. Throws on ANY failure
   * (missing grant, bad signature, read-back failure, other collector, no
   * reference); the caller answers 403 and never settles.
   */
  async verifyAndNormalizeWebhook(
    payload: unknown,
    signature: string,
    context?: WebhookVerificationContext,
  ): Promise<NormalizedWebhookEvent> {
    const collector = context?.mercadopagoCollector;
    if (!collector?.accessToken || !collector.userId) {
      throw new Error('Mercado Pago webhook rejected: no connected organization for this payment.');
    }
    const dataId = mercadoPagoNotificationDataId(payload, context?.query);
    assertMercadoPagoSignature(
      this.webhookSecret,
      signature,
      context?.headers?.['x-request-id'],
      dataId,
    );

    // Trust only what Mercado Pago reports, read with the ORG's own token: a
    // payment of another account is not readable with it (404) and is rejected.
    const response = await this.fetchFn(
      `${this.baseUrl}/v1/payments/${encodeURIComponent(dataId as string)}`,
      {
        headers: { Authorization: `Bearer ${collector.accessToken}`, Accept: 'application/json' },
        signal: mercadoPagoTimeoutSignal(),
      },
    );
    if (!response.ok) {
      throw new Error(`Mercado Pago payment read-back failed (${response.status})`);
    }
    const payment = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    const collectorId =
      payment?.collector_id !== undefined && payment?.collector_id !== null
        ? String(payment.collector_id)
        : undefined;
    if (collectorId !== collector.userId) {
      throw new Error('Mercado Pago webhook rejected: payment belongs to another collector.');
    }
    // A sandbox (test user) payment must never settle a real donation, nor a
    // real payment a sandbox one: `live_mode` has to match this deployment.
    if (payment?.live_mode !== !this.test) {
      throw new Error(
        'Mercado Pago webhook rejected: payment live_mode does not match MERCADOPAGO_TEST.',
      );
    }
    const reference =
      typeof payment?.external_reference === 'string' ? payment.external_reference : '';
    if (!reference) {
      throw new Error('Mercado Pago webhook rejected: payment has no external_reference.');
    }

    const status = mercadoPagoPaymentStatus(
      typeof payment?.status === 'string' ? payment.status : undefined,
    );
    const paymentId = String(payment?.id ?? dataId);
    const snapshot = mercadoPagoPaymentSnapshot(payment ?? {}, paymentId, collectorId, reference);
    return {
      eventId: paymentId,
      collectionId: reference,
      status,
      dedupKey: `mercadopago:${paymentId}:${status}`,
      amountCharged: integerAmount(payment?.transaction_amount),
      currency: typeof payment?.currency_id === 'string' ? payment.currency_id : '',
      receiverAccountId: collectorId,
      mercadopagoPayment: snapshot,
    };
  }

  /** No custody: Mercado Pago settles to the organization's own account. */
  async createPayout(_input: CreatePayoutInput): Promise<PayoutResult> {
    throw new Error(
      'MercadoPagoPaymentAdapter.createPayout is not supported: AdoptaFácil never holds ' +
        'donations (ADR-PAG-001).',
    );
  }

  /** See {@link createPayout}. */
  async verifyAndNormalizePayoutWebhook(
    _payload: unknown,
    _signature: string,
    _context?: WebhookVerificationContext,
  ): Promise<NormalizedPayoutWebhookEvent> {
    throw new Error(
      'MercadoPagoPaymentAdapter.verifyAndNormalizePayoutWebhook is not supported: no payouts.',
    );
  }
}
