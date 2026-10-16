import { createHash, timingSafeEqual } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  computeBreakdown,
  DIRECT_COLLECTION_RATES,
  epaycoStatusFromCode,
  parseEpaycoAmount,
  planCollection,
  type CollectionResult,
  type CreateCollectionInput,
  type CreatePayoutInput,
  type EpaycoCollectorCredentials,
  type NormalizedPayoutWebhookEvent,
  type NormalizedWebhookEvent,
  type PaymentPort,
  type PaymentStatus,
  type PayoutResult,
  type WebhookVerificationContext,
} from '@adoptafacil/contracts';
import type { Env } from '../../config/env.validation';

/** Injectable fetch surface so tests run with ZERO network. */
export type EpaycoFetch = typeof fetch;

/** Collection modes this adapter can run in (ADR-PAG-001). */
export type EpaycoCollectionMode = 'direct_to_org' | 'platform_split';

/**
 * ePayco's `invoice` is OUR reference and the donation's `collectionId`.
 * Kept short (32 chars) so it fits ePayco's invoice field.
 * TODO(client): confirmar en sandbox el largo máximo exacto de `invoice`.
 */
export const EPAYCO_INVOICE_MAX_LENGTH = 32;

/** `x_ref_payco` is numeric at ePayco; accept a conservative superset. */
const REF_PAYCO_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

/** Fields of a confirmation (form-urlencoded or JSON) this adapter reads. */
interface EpaycoConfirmation {
  x_ref_payco?: string;
  x_transaction_id?: string;
  x_amount?: string;
  x_currency_code?: string;
  x_id_invoice?: string;
  x_cust_id_cliente?: string;
  x_signature?: string;
}

/** Signing identity of the merchant that owns the transaction. */
interface EpaycoMerchant {
  custId: string;
  pKey: string;
  publicKey: string;
  privateKey: string;
}

/**
 * Build the stable reference sent as ePayco `invoice` and returned as
 * `collectionId`. Derived from the merchant's custId AND the caller's
 * idempotency key: the key is only unique per organization while
 * `donations.collection_id` is globally unique, and each organization has
 * its own custId, so two orgs that happen to reuse a key never collide.
 * Deterministic: a retry with the same key maps to the same reference.
 */
export function epaycoInvoiceFor(custId: string, idempotencyKey: string): string {
  const digest = createHash('sha256').update(`${custId}:${idempotencyKey}`).digest('hex');
  return `af-${digest}`.slice(0, EPAYCO_INVOICE_MAX_LENGTH);
}

/** `sha256(p_cust_id_cliente^p_key^x_ref_payco^x_transaction_id^x_amount^x_currency_code)`. */
export function epaycoConfirmationSignature(
  custId: string,
  pKey: string,
  body: Pick<
    EpaycoConfirmation,
    'x_ref_payco' | 'x_transaction_id' | 'x_amount' | 'x_currency_code'
  >,
): string {
  return createHash('sha256')
    .update(
      [
        custId,
        pKey,
        body.x_ref_payco ?? '',
        body.x_transaction_id ?? '',
        body.x_amount ?? '',
        body.x_currency_code ?? '',
      ].join('^'),
    )
    .digest('hex');
}

/** Constant-time hex comparison; different lengths are simply "invalid". */
function timingSafeEqualHex(computedHex: string, givenHex: string): boolean {
  if (!/^[0-9a-f]+$/i.test(givenHex)) {
    return false;
  }
  const computed = Buffer.from(computedHex, 'hex');
  const given = Buffer.from(givenHex.toLowerCase(), 'hex');
  if (computed.length !== given.length) {
    return false;
  }
  return timingSafeEqual(computed, given);
}

/** Read a scalar field as a trimmed string (numbers allowed); else undefined. */
function str(source: unknown, key: string): string | undefined {
  if (!source || typeof source !== 'object') return undefined;
  const value = (source as Record<string, unknown>)[key];
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed === '' ? undefined : trimmed;
  }
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return undefined;
}

/** A confirmation arrives parsed (urlencoded/JSON) or, defensively, as a raw string. */
function readConfirmation(payload: unknown): EpaycoConfirmation {
  const source =
    typeof payload === 'string' ? Object.fromEntries(new URLSearchParams(payload)) : payload;
  return {
    x_ref_payco: str(source, 'x_ref_payco'),
    x_transaction_id: str(source, 'x_transaction_id'),
    x_amount: str(source, 'x_amount'),
    x_currency_code: str(source, 'x_currency_code'),
    x_id_invoice: str(source, 'x_id_invoice'),
    x_cust_id_cliente: str(source, 'x_cust_id_cliente'),
    x_signature: str(source, 'x_signature'),
  };
}

/** Best-effort, secret-free message from an ePayco error body (never the body itself). */
async function describeFailure(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as Record<string, unknown>;
    const message =
      str(body, 'textResponse') ?? str(body, 'message') ?? str(body, 'title_response');
    return message ? `: ${message.slice(0, 160)}` : '';
  } catch {
    return '';
  }
}

const NO_CUSTODY_ERROR =
  "EpaycoPaymentAdapter requires the organization's own ePayco keys (epaycoCollector). " +
  'Charging with the platform account is custody and is not allowed (ADR-PAG-001).';

/**
 * Real ePayco {@link PaymentPort} adapter (ADR-PAG-002, pasarela principal).
 *
 * Default mode `direct_to_org` (ADR-PAG-001, sin custodia): the checkout v2
 * session is created with the BENEFICIARY organization's own keys
 * (`input.epaycoCollector`, resolved and decrypted server-side by the caller),
 * so the organization is the merchant of record and the money lands in its own
 * ePayco balance. AdoptaFácil takes no per-transaction fee
 * (`DIRECT_COLLECTION_RATES`). There is no fallback to platform keys.
 *
 * Mode `platform_split` (ePayco "pagos divididos", AdoptaFácil as principal
 * merchant) is implemented but OFF: it runs only when
 * `EPAYCO_COLLECTION_MODE=platform_split` AND `planCollection` approves it
 * (written approval reference + valid fee rate). Otherwise every charge is
 * refused — it never degrades to custody.
 *
 * Confirmation: signature `x_signature` verified with the merchant's P_KEY,
 * merchant id checked, then the transaction is READ BACK from ePayco by
 * `x_ref_payco` and only the read-back values (status, amount, currency,
 * invoice, merchant) are trusted.
 *
 * Secrets (P_KEY, PRIVATE_KEY, the Apify token) are never logged, never put in
 * an error message, never returned.
 */
@Injectable()
export class EpaycoPaymentAdapter implements PaymentPort {
  private readonly logger = new Logger('EpaycoPaymentAdapter');
  private readonly apifyBaseUrl: string;
  private readonly secureBaseUrl: string;
  private readonly confirmationUrl: string;
  private readonly responseUrl: string;
  private readonly test: boolean;
  private readonly mode: EpaycoCollectionMode;
  private readonly splitApprovalRef: string | null;
  private readonly splitFeeRate: number;
  private readonly platform: Partial<EpaycoMerchant>;

  constructor(
    config: ConfigService<Env, true>,
    private readonly fetchFn: EpaycoFetch = globalThis.fetch.bind(globalThis),
  ) {
    const trim = (url: string) => url.replace(/\/+$/, '');
    this.apifyBaseUrl = trim(
      (config.get('EPAYCO_APIFY_BASE_URL', { infer: true }) as string | undefined) ??
        'https://apify.epayco.co',
    );
    this.secureBaseUrl = trim(
      (config.get('EPAYCO_SECURE_BASE_URL', { infer: true }) as string | undefined) ??
        'https://secure.epayco.co',
    );
    const apiBase = trim(
      (config.get('STORAGE_PUBLIC_BASE_URL', { infer: true }) as string | undefined) ??
        'http://localhost:3000',
    );
    const webBase = trim(
      (config.get('WEB_BASE_URL', { infer: true }) as string | undefined) ??
        'http://localhost:5173',
    );
    this.confirmationUrl =
      (config.get('EPAYCO_CONFIRMATION_URL', { infer: true }) as string | undefined) ??
      `${apiBase}/donations/webhook`;
    this.responseUrl =
      (config.get('EPAYCO_RESPONSE_URL', { infer: true }) as string | undefined) ??
      `${webBase}/donaciones/resultado`;
    this.test = config.get('EPAYCO_TEST', { infer: true }) === true;
    this.mode =
      (config.get('EPAYCO_COLLECTION_MODE', { infer: true }) as EpaycoCollectionMode | undefined) ??
      'direct_to_org';
    this.splitApprovalRef =
      (config.get('EPAYCO_SPLIT_APPROVAL_REF', { infer: true }) as string | undefined) ?? null;
    const rate = config.get('EPAYCO_SPLIT_FEE_RATE', { infer: true }) as number | undefined;
    this.splitFeeRate = rate === undefined ? Number.NaN : Number(rate);
    this.platform = {
      custId: config.get('EPAYCO_PLATFORM_CUST_ID', { infer: true }) as string | undefined,
      pKey: config.get('EPAYCO_PLATFORM_P_KEY', { infer: true }) as string | undefined,
      publicKey: config.get('EPAYCO_PLATFORM_PUBLIC_KEY', { infer: true }) as string | undefined,
      privateKey: config.get('EPAYCO_PLATFORM_PRIVATE_KEY', { infer: true }) as string | undefined,
    };
  }

  /**
   * Platform fee rate allowed for this charge, decided ONLY by
   * `planCollection` (contracts). Direct mode ⇒ 0. Split mode ⇒ the approved
   * rate, or a thrown error when the policy refuses (fails closed).
   * The custId stands in for the organization id: the caller already resolved
   * these keys from that organization's own row under its RLS context.
   */
  private planFeeRate(collector: EpaycoCollectorCredentials): number {
    const decision = planCollection(
      collector.custId,
      {
        organizationId: collector.custId,
        provider: 'epayco',
        mode: this.mode,
        status: 'active',
        gatewayAccountId: collector.custId,
      },
      {
        enabledModes: [this.mode],
        splitPlatformFeeRate: this.splitFeeRate,
        splitApprovalRef: this.splitApprovalRef,
      },
    );
    if (!decision.ok) {
      throw new Error(
        `EpaycoPaymentAdapter: collection mode ${this.mode} refused by planCollection ` +
          `(${decision.reason}). No charge was created.`,
      );
    }
    return decision.plan.platformFeeRate;
  }

  /** Platform keys, all four required in split mode (never logged). */
  private requirePlatformMerchant(): EpaycoMerchant {
    const { custId, pKey, publicKey, privateKey } = this.platform;
    if (!custId || !pKey || !publicKey || !privateKey) {
      throw new Error(
        'EpaycoPaymentAdapter: platform_split requires EPAYCO_PLATFORM_* keys. No charge was created.',
      );
    }
    return { custId, pKey, publicKey, privateKey };
  }

  /** `POST /login` (Basic PUBLIC_KEY:PRIVATE_KEY) → bearer token. Fails closed. */
  private async login(merchant: Pick<EpaycoMerchant, 'publicKey' | 'privateKey'>): Promise<string> {
    const basic = Buffer.from(`${merchant.publicKey}:${merchant.privateKey}`, 'utf8').toString(
      'base64',
    );
    const response = await this.fetchFn(`${this.apifyBaseUrl}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Basic ${basic}` },
    });
    if (!response.ok) {
      throw new Error(`ePayco login failed (${response.status})`);
    }
    const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    const token = str(body, 'token') ?? str(body?.data, 'token');
    if (!token) {
      throw new Error('ePayco login returned no token');
    }
    return token;
  }

  /**
   * Create an ePayco checkout v2 session. `collectionId` = our `invoice`
   * (stable, known before payment, see {@link epaycoInvoiceFor}); the browser
   * opens `checkoutSessionId` with checkout-v2.js. The amount is the
   * breakdown's `amountCharged` (computed HERE, single source).
   */
  async createCollection(input: CreateCollectionInput): Promise<CollectionResult> {
    const collector = input.epaycoCollector;
    if (!collector?.custId || !collector.pKey || !collector.publicKey || !collector.privateKey) {
      throw new Error(NO_CUSTODY_ERROR);
    }

    const platformRate = this.planFeeRate(collector);
    const breakdown = computeBreakdown(
      input.intendedAmount,
      input.commissionPayer,
      this.mode === 'platform_split' ? { platformRate } : DIRECT_COLLECTION_RATES,
    );
    const reference = epaycoInvoiceFor(collector.custId, input.idempotencyKey);

    // Direct: the org's own keys create the session (org = merchant of record).
    // Split: the PLATFORM is the principal merchant and ePayco divides at
    // source towards the org (only reachable after planCollection approved).
    const sessionMerchant =
      this.mode === 'platform_split' ? this.requirePlatformMerchant() : collector;
    const token = await this.login(sessionMerchant);

    const responseUrl = new URL(this.responseUrl);
    responseUrl.searchParams.set('reference', reference);

    const body: Record<string, unknown> = {
      checkout_version: '2',
      name: 'Donación',
      description: `Donación vía AdoptaFácil (${input.concept.kind})`,
      invoice: reference,
      currency: 'COP',
      amount: breakdown.amountCharged,
      country: 'CO',
      lang: 'ES',
      test: this.test,
      confirmation: this.confirmationUrl,
      response: responseUrl.toString(),
      method: 'POST',
      // extra1/extra2: what the money is for (never personal data).
      extras: { extra1: input.concept.id, extra2: input.concept.kind },
    };
    if (input.payer?.email || input.payer?.fullName) {
      body.billing = {
        ...(input.payer.email ? { email: input.payer.email } : {}),
        ...(input.payer.fullName ? { name: input.payer.fullName } : {}),
      };
    }
    if (this.mode === 'platform_split') {
      const feePercent = Math.round(platformRate * 10_000) / 100;
      // TODO(client): verificar en sandbox con ePayco la semántica exacta de
      // cada campo del receptor (¿`amount` es el % que recibe el comercio o el
      // total?, ¿`fee` lo cobra el principal?, ¿`taxBase`/`tax` en 0?).
      body.splitPayment = {
        type: 'percentage',
        receivers: [
          {
            merchantId: collector.custId,
            amount: String(Math.round((100 - feePercent) * 100) / 100),
            taxBase: '0',
            tax: '0',
            fee: String(feePercent),
          },
        ],
      };
    }

    const response = await this.fetchFn(`${this.apifyBaseUrl}/payment/session/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw new Error(
        `ePayco session create failed (${response.status})${await describeFailure(response)}`,
      );
    }
    const resBody = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    const sessionId = str(resBody?.data, 'sessionId') ?? str(resBody, 'sessionId');
    if (!sessionId || resBody?.success === false) {
      throw new Error('ePayco session create returned no sessionId');
    }
    this.logger.log(`session created reference=${reference} mode=${this.mode} test=${this.test}`);

    return {
      collectionId: reference,
      status: 'pending',
      breakdown,
      checkoutSessionId: sessionId,
    };
  }

  /** `GET /validation/v1/reference/:ref` — public read-back by ePayco ref. */
  private async readBack(refPayco: string): Promise<Record<string, unknown>> {
    if (!REF_PAYCO_PATTERN.test(refPayco)) {
      throw new Error('ePayco reference has an invalid format');
    }
    const response = await this.fetchFn(
      `${this.secureBaseUrl}/validation/v1/reference/${encodeURIComponent(refPayco)}`,
      { headers: { Accept: 'application/json' } },
    );
    if (!response.ok) {
      throw new Error(`ePayco read-back failed (${response.status})`);
    }
    const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    const data = body?.data;
    if (!data || typeof data !== 'object' || body?.success === false) {
      throw new Error('ePayco read-back returned no transaction');
    }
    return data as Record<string, unknown>;
  }

  /**
   * Only meaningful with an ePayco `ref_payco`: our own `collectionId` (the
   * invoice) cannot be looked up without the merchant's keys, and the only
   * caller (the sponsorship poller) never runs with this driver because
   * sponsorships fail closed without a collector.
   */
  async getCollectionStatus(collectionId: string): Promise<PaymentStatus> {
    if (!REF_PAYCO_PATTERN.test(collectionId) || collectionId.startsWith('af-')) {
      throw new Error(
        'EpaycoPaymentAdapter.getCollectionStatus needs an ePayco ref_payco; the confirmation ' +
          'webhook is the settlement path for our own references.',
      );
    }
    const data = await this.readBack(collectionId);
    return epaycoStatusFromCode(
      str(data, 'x_cod_transaction_state') ?? str(data, 'x_cod_response'),
    );
  }

  /**
   * Verify an ePayco confirmation and normalize it. Throws on ANY failure
   * (missing keys/fields, bad signature, wrong merchant, read-back failure,
   * invoice mismatch); the caller answers 403 and never settles.
   */
  async verifyAndNormalizeWebhook(
    payload: unknown,
    signature: string,
    context?: WebhookVerificationContext,
  ): Promise<NormalizedWebhookEvent> {
    const org = context?.epaycoCollector;
    if (!org?.custId || !org.pKey) {
      throw new Error('ePayco webhook rejected: no connected organization for this payment.');
    }
    // The merchant that signs is the one that owns the transaction: the org
    // in direct mode, the platform (principal) in split mode.
    const signer = this.mode === 'platform_split' ? this.requirePlatformMerchant() : org;

    const body = readConfirmation(payload);
    const given = body.x_signature ?? (signature || undefined);
    if (
      !body.x_ref_payco ||
      !body.x_transaction_id ||
      !body.x_amount ||
      !body.x_currency_code ||
      !body.x_cust_id_cliente ||
      !given
    ) {
      throw new Error('ePayco webhook rejected: missing confirmation fields.');
    }
    if (body.x_cust_id_cliente !== signer.custId) {
      throw new Error('ePayco webhook rejected: confirmation belongs to another merchant.');
    }
    const computed = epaycoConfirmationSignature(signer.custId, signer.pKey, body);
    if (!timingSafeEqualHex(computed, given)) {
      throw new Error('ePayco webhook rejected: signature mismatch.');
    }

    // Trust only what ePayco itself reports for this reference.
    const tx = await this.readBack(body.x_ref_payco);
    const readRef = str(tx, 'x_ref_payco');
    if (readRef !== undefined && readRef !== body.x_ref_payco) {
      throw new Error('ePayco webhook rejected: read-back reference differs.');
    }
    const invoice = str(tx, 'x_id_invoice');
    if (!invoice) {
      throw new Error('ePayco webhook rejected: read-back has no invoice.');
    }
    if (body.x_id_invoice !== undefined && body.x_id_invoice !== invoice) {
      throw new Error('ePayco webhook rejected: invoice differs from the read-back.');
    }
    // TODO(client): verificar en sandbox que la validación por referencia
    // siempre devuelve `x_cust_id_cliente`; mientras tanto falla cerrado.
    const readCustId = str(tx, 'x_cust_id_cliente');
    if (readCustId !== signer.custId) {
      throw new Error('ePayco webhook rejected: read-back merchant differs.');
    }

    const status = epaycoStatusFromCode(
      str(tx, 'x_cod_transaction_state') ?? str(tx, 'x_cod_response'),
    );
    const rawAmount = str(tx, 'x_amount');
    // A non-integer/unknown amount must never match a stored integer: NaN
    // makes the caller record an amount mismatch instead of settling.
    const amountCharged = parseEpaycoAmount(rawAmount) ?? Number.NaN;
    const currency = str(tx, 'x_currency_code') ?? '';

    return {
      eventId: body.x_ref_payco,
      collectionId: invoice,
      status,
      dedupKey: `epayco:${body.x_ref_payco}:${status}`,
      amountCharged,
      currency,
      // Direct: the merchant that ePayco reports (== the org's custId).
      // Split: TODO(client) — the read-back names the principal; the
      // receiver is the org that was set as split receiver at checkout.
      receiverAccountId: this.mode === 'platform_split' ? org.custId : readCustId,
    };
  }

  /** No custody: ePayco settles to the organization's own balance. */
  async createPayout(_input: CreatePayoutInput): Promise<PayoutResult> {
    throw new Error(
      'EpaycoPaymentAdapter.createPayout is not supported: AdoptaFácil never holds donations ' +
        '(ADR-PAG-001); ePayco settles to the organization directly.',
    );
  }

  /** See {@link createPayout}. */
  async verifyAndNormalizePayoutWebhook(
    _payload: unknown,
    _signature: string,
    _context?: WebhookVerificationContext,
  ): Promise<NormalizedPayoutWebhookEvent> {
    throw new Error(
      'EpaycoPaymentAdapter.verifyAndNormalizePayoutWebhook is not supported: no payouts ' +
        '(ADR-PAG-001).',
    );
  }
}
