import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  computeBreakdown,
  isMercadoPagoCheckoutUrl,
  MERCADOPAGO_RESOURCE_ID_PATTERN,
  mercadoPagoPaymentStatus,
  planCollection,
  type CollectionResult,
  type CreateCollectionInput,
  type MercadoPagoCollectorCredentials,
  type MercadoPagoPaymentSnapshot,
  type NormalizedWebhookEvent,
  type PaymentPort,
  type PaymentStatus,
  type WebhookVerificationContext,
} from '@adoptafacil/contracts';
import type { Env } from '../../config/env.validation';
import { mercadoPagoTimeoutSignal } from './mercadopago-http';

/** Injectable fetch surface so tests run with ZERO network. */
export type MercadoPagoFetch = typeof fetch;

/** Our reference (`external_reference` = donation `collection_id`). */
export const MERCADOPAGO_REFERENCE_MAX_LENGTH = 32;

/** Prefix of every reference AdoptaFácil sends (`mercadoPagoReferenceFor`). */
export const MERCADOPAGO_REFERENCE_PREFIX = 'af-';

/** Payment search paging (monthly reconciliation). */
const SEARCH_PAGE_SIZE = 100;
const MAX_SEARCH_PAGES = 50;

/** Days a donation's Checkout Pro order stays payable (`expiration_time`, ISO 8601). */
const ORDER_TTL_DAYS = 3;

/**
 * Stable reference sent as `external_reference` and returned as
 * `collectionId`. Derived from the organization AND the caller's idempotency
 * key: the key is only unique per organization while `donations.collection_id`
 * is globally unique. Deterministic, so a retry maps to the same reference.
 */
export function mercadoPagoReferenceFor(organizationId: string, idempotencyKey: string): string {
  const digest = createHash('sha256').update(`${organizationId}:${idempotencyKey}`).digest('hex');
  return `${MERCADOPAGO_REFERENCE_PREFIX}${digest}`.slice(0, MERCADOPAGO_REFERENCE_MAX_LENGTH);
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

/**
 * Orders API (Checkout Pro) `status` → our {@link PaymentStatus}. Only a
 * `processed` order approves; anything unknown or in flight stays `pending`
 * (it never settles a donation, the next notification decides).
 */
export function mercadoPagoOrderStatus(raw: unknown): PaymentStatus {
  switch (raw) {
    case 'processed':
      return 'approved';
    case 'failed':
      return 'declined';
    case 'canceled':
    case 'refunded':
    case 'charged_back':
      return 'voided';
    default:
      // created, action_required, at_processing, expired, unknown…
      return 'pending';
  }
}

/** The order's status in the legacy payment vocabulary kept by the ledger. */
function ledgerStatusOf(raw: unknown): string {
  switch (raw) {
    case 'processed':
      return 'approved';
    case 'failed':
      return 'rejected';
    case 'canceled':
      return 'cancelled';
    case 'refunded':
    case 'charged_back':
      return raw;
    default:
      return 'pending';
  }
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
 * AdoptaFácil takes no per-transaction fee (0 %, owner's decision). There is no fallback to a platform
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
  /** Secret of the Orders application's webhook (falls back to the shared one). */
  private readonly ordersWebhookSecret: string | undefined;
  private readonly test: boolean;

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
    this.ordersWebhookSecret =
      (config.get('MERCADOPAGO_ORDERS_WEBHOOK_SECRET', { infer: true }) as string | undefined) ??
      this.webhookSecret;
    this.test = config.get('MERCADOPAGO_TEST', { infer: true }) === true;
  }

  /** Where Mercado Pago notifies payments of THIS organization. */
  notificationUrlFor(organizationId: string): string {
    return `${this.apiPublicBase}/donations/webhook/mercadopago/${organizationId}?source_news=webhooks`;
  }

  /** Direct collection to the org, decided ONLY by `planCollection`. */
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
      { enabledModes: ['direct_to_org'] },
    );
    if (!decision.ok || decision.plan.collector !== 'organization') {
      throw new Error(
        'MercadoPagoPaymentAdapter: direct collection refused. No charge was created.',
      );
    }
  }

  /**
   * Create a Checkout Pro ORDER (`POST /v1/orders`) with the ORG's token.
   * `collectionId` = our `external_reference` (known before payment); the
   * payer is sent to `checkout_url` (Mercado Pago's hosted checkout: card, PSE,
   * Efecty…, whatever the org's account offers).
   *
   * Orders has no per-order notification URL: notifications arrive at the
   * single URL configured on the application (`POST /donations/webhook/
   * mercadopago`), and the organization is resolved from `external_reference`.
   */
  async createCollection(input: CreateCollectionInput): Promise<CollectionResult> {
    const collector = input.mercadopagoCollector;
    if (!collector?.accessToken || !collector.userId || !collector.organizationId) {
      throw new Error(NO_CUSTODY_ERROR);
    }
    this.assertDirectCollection(collector);

    const breakdown = computeBreakdown(input.intendedAmount);
    const reference = mercadoPagoReferenceFor(collector.organizationId, input.idempotencyKey);
    const back = new URL(`${this.webBase}/donaciones/resultado`);
    back.searchParams.set('reference', reference);
    const backUrl = back.toString();
    // Orders amounts are decimal strings ("1000.00").
    const amount = breakdown.amountCharged.toFixed(2);

    const body: Record<string, unknown> = {
      type: 'online',
      processing_mode: 'manual',
      total_amount: amount,
      external_reference: reference,
      items: [{ title: 'Donación', unit_price: amount, quantity: 1 }],
      config: {
        online: {
          success_url: backUrl,
          pending_url: backUrl,
          failure_url: backUrl,
          auto_return: 'approved',
        },
      },
      expiration_time: `P${ORDER_TTL_DAYS}D`,
    };
    // Nothing personal beyond what the payer gave.
    if (input.payer?.email) body.payer = { email: input.payer.email };

    const response = await this.fetchFn(`${this.baseUrl}/v1/orders`, {
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
      throw new Error(`Mercado Pago order create failed (${response.status})`);
    }
    const order = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    const link = order?.checkout_url as string | undefined;
    if (!order?.id || !isMercadoPagoCheckoutUrl(link)) {
      throw new Error('Mercado Pago order create returned no usable checkout link');
    }
    this.logger.log(`order created reference=${reference} test=${this.test}`);

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
    const isOrder = mercadoPagoNotificationType(payload, context?.query) === 'order';
    assertMercadoPagoSignature(
      isOrder ? this.ordersWebhookSecret : this.webhookSecret,
      signature,
      context?.headers?.['x-request-id'],
      dataId,
    );
    if (isOrder) {
      return this.readBackOrder(collector, dataId as string);
    }

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
    return this.normalizeReadBack(payment, collector.userId, dataId as string);
  }

  /**
   * Orders notification: the order is READ BACK with the org's own token
   * (`GET /v1/orders/{id}`), so an order of another account is not readable
   * (404) and is rejected; only the read-back values are trusted, never the
   * notification body.
   */
  private async readBackOrder(
    collector: MercadoPagoCollectorCredentials,
    orderId: string,
  ): Promise<NormalizedWebhookEvent> {
    const response = await this.fetchFn(
      `${this.baseUrl}/v1/orders/${encodeURIComponent(orderId)}`,
      {
        headers: { Authorization: `Bearer ${collector.accessToken}`, Accept: 'application/json' },
        signal: mercadoPagoTimeoutSignal(),
      },
    );
    if (!response.ok) {
      throw new Error(`Mercado Pago order read-back failed (${response.status})`);
    }
    const order = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    return this.normalizeOrder(order, collector.userId, orderId);
  }

  /**
   * Trust checks + normalization of an ORDER read back with the org's token.
   * Throws when it is of the other mode (sandbox vs. production, when the order
   * reports it) or carries no reference. Amounts here are decimal strings.
   */
  private normalizeOrder(
    order: Record<string, unknown> | null,
    collectorId: string,
    fallbackId: string,
  ): NormalizedWebhookEvent {
    if (typeof order?.live_mode === 'boolean' && order.live_mode !== !this.test) {
      throw new Error(
        'Mercado Pago webhook rejected: order live_mode does not match MERCADOPAGO_TEST.',
      );
    }
    const reference = typeof order?.external_reference === 'string' ? order.external_reference : '';
    if (!reference) {
      throw new Error('Mercado Pago webhook rejected: order has no external_reference.');
    }

    const transactions = (order?.transactions ?? {}) as { payments?: unknown };
    const payments = (Array.isArray(transactions.payments) ? transactions.payments : []) as Array<
      Record<string, unknown>
    >;
    // The payment that settled the order, else the latest attempt.
    const payment = payments.find((p) => p?.status === 'processed') ?? payments.at(-1);

    let status = mercadoPagoOrderStatus(order?.status);
    const totalAmount = integerAmount(order?.total_amount);
    // An approval needs the order to be paid in full.
    if (
      status === 'approved' &&
      order?.total_paid_amount !== undefined &&
      integerAmount(order.total_paid_amount) !== totalAmount
    ) {
      status = 'pending';
    }
    const orderId = String(order?.id ?? fallbackId);
    const paymentId = String(payment?.id ?? orderId);
    const paymentMethod = (payment?.payment_method ?? {}) as Record<string, unknown>;
    const currency = typeof order?.currency === 'string' ? order.currency : 'COP';
    // Fees, net received and refunds are not part of the order read-back: the
    // creation breakdown stays (see `applyMercadoPagoSettledBreakdown`).
    const snapshot = mercadoPagoPaymentSnapshot(
      {
        status: ledgerStatusOf(order?.status),
        status_detail: payment?.status_detail ?? order?.status_detail,
        currency_id: currency,
        transaction_amount: payment?.paid_amount ?? payment?.amount ?? order?.total_amount,
        payment_type_id: paymentMethod.type,
        payment_method_id: paymentMethod.id,
      },
      paymentId,
      collectorId,
      reference,
    );
    return {
      eventId: orderId,
      collectionId: reference,
      status,
      dedupKey: `mercadopago:${orderId}:${status}`,
      amountCharged: totalAmount,
      currency,
      // Established by the read-back with the org's own token.
      receiverAccountId: collectorId,
      mercadopagoPayment: snapshot,
    };
  }

  /**
   * Trust checks + normalization of a payment READ BACK with the org's own
   * token (shared by the signed notification and the monthly re-read). Throws
   * when the payment is of another collector, of the other mode (sandbox vs.
   * production) or carries no reference.
   */
  private normalizeReadBack(
    payment: Record<string, unknown> | null,
    expectedCollectorId: string,
    fallbackId: string,
  ): NormalizedWebhookEvent {
    const collectorId =
      payment?.collector_id !== undefined && payment?.collector_id !== null
        ? String(payment.collector_id)
        : undefined;
    if (collectorId !== expectedCollectorId) {
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
    const paymentId = String(payment?.id ?? fallbackId);
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

  /**
   * Monthly reconciliation (sección 2A): re-read, with the ORG's own token,
   * every payment of its account created in [from, to) and keep only the ones
   * AdoptaFácil originated (`external_reference` with our `af-` prefix).
   * Read-only: it never creates, refunds or moves money. Each result passes
   * the same trust checks as a signed notification (collector + live_mode).
   * Bounded: at most {@link MAX_SEARCH_PAGES} pages of 100.
   */
  async searchOrganizationPayments(
    collector: MercadoPagoCollectorCredentials,
    from: Date,
    to: Date,
  ): Promise<NormalizedWebhookEvent[]> {
    if (!collector?.accessToken || !collector.userId) {
      throw new Error(NO_CUSTODY_ERROR);
    }
    const out: NormalizedWebhookEvent[] = [];
    for (let page = 0; page < MAX_SEARCH_PAGES; page++) {
      const url = new URL(`${this.baseUrl}/v1/payments/search`);
      url.searchParams.set('sort', 'date_created');
      url.searchParams.set('criteria', 'asc');
      url.searchParams.set('range', 'date_created');
      url.searchParams.set('begin_date', from.toISOString());
      url.searchParams.set('end_date', new Date(to.getTime() - 1).toISOString());
      url.searchParams.set('limit', String(SEARCH_PAGE_SIZE));
      url.searchParams.set('offset', String(page * SEARCH_PAGE_SIZE));
      const response = await this.fetchFn(url.toString(), {
        headers: { Authorization: `Bearer ${collector.accessToken}`, Accept: 'application/json' },
        signal: mercadoPagoTimeoutSignal(),
      });
      if (!response.ok) {
        throw new Error(`Mercado Pago payment search failed (${response.status})`);
      }
      const body = (await response.json().catch(() => null)) as {
        results?: Array<Record<string, unknown>>;
        paging?: { total?: number };
      } | null;
      const results = Array.isArray(body?.results) ? body.results : [];
      for (const payment of results) {
        const reference = payment?.external_reference;
        if (typeof reference !== 'string' || !reference.startsWith(MERCADOPAGO_REFERENCE_PREFIX)) {
          continue; // not a donation originated in AdoptaFácil: never stored
        }
        try {
          out.push(this.normalizeReadBack(payment, collector.userId, String(payment.id ?? '')));
        } catch {
          // another collector / other mode: ignored, never settles anything
        }
      }
      const total = typeof body?.paging?.total === 'number' ? body.paging.total : 0;
      if (results.length < SEARCH_PAGE_SIZE || (page + 1) * SEARCH_PAGE_SIZE >= total) break;
    }
    return out;
  }
}
