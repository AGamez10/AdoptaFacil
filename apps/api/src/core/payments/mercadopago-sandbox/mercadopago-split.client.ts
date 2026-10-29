import { createHmac, timingSafeEqual } from 'node:crypto';
import { MERCADOPAGO_API_BASE_URL, type MercadoPagoFetch } from './mercadopago-oauth.client';

/**
 * Prueba de concepto (sandbox) del split 1:1 de Mercado Pago — cobro y webhook.
 *
 * Diferencias con el adaptador retirado en 145df93:
 *  - Usa `POST /v1/payments` (Checkout API clásico) en vez de `POST /v1/orders`,
 *    porque `application_fee` es el campo de marketplace de `/v1/payments`.
 *  - La comisión de la plataforma la calculamos nosotros (4 % por defecto) y
 *    viaja como `application_fee`; Mercado Pago la descuenta del pago y la
 *    acredita a la cuenta dueña de la aplicación (la plataforma).
 *  - El pago se crea SIEMPRE con el access token OAuth del refugio (vendedor):
 *    el refugio es el collector y recibe el dinero en su cuenta (sin custodia,
 *    ADR-PAG-001). Nunca se cobra con el token de la plataforma.
 *
 * La firma del webhook (`x-signature: ts=…,v1=…`, HMAC-SHA256 del manifest
 * `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`) se conserva tal cual.
 *
 * NO está cableado al producto ni registrado como PaymentPort.
 */

/** Comisión de la plataforma por defecto: 4 %. */
export const DEFAULT_PLATFORM_FEE_RATE = 0.04;

/**
 * Comisión en pesos enteros (COP no usa centavos en Mercado Pago). Redondeo
 * hacia abajo para no cobrar nunca más del porcentaje anunciado.
 */
export function computeApplicationFee(
  amountCop: number,
  rate: number = DEFAULT_PLATFORM_FEE_RATE,
): number {
  if (!Number.isInteger(amountCop) || amountCop <= 0) {
    throw new Error('amountCop must be a positive integer number of pesos.');
  }
  if (!(rate >= 0 && rate < 1)) {
    throw new Error('rate must be in [0, 1).');
  }
  return Math.floor(amountCop * rate);
}

export interface SplitPaymentInput {
  /** Access token OAuth del refugio (vendedor). */
  sellerAccessToken: string;
  /** Monto total que paga el donante, en pesos enteros. */
  amountCop: number;
  /** Token de tarjeta generado con la public_key del vendedor. */
  cardToken: string;
  paymentMethodId: string;
  installments?: number;
  payerEmail: string;
  /** Nuestra referencia (`af-<idempotencyKey>`). */
  externalReference: string;
  idempotencyKey: string;
  description?: string;
  notificationUrl?: string;
  feeRate?: number;
  /** Solo diagnóstico: cobra sin `application_fee` para aislar si el rechazo es del split. */
  omitApplicationFee?: boolean;
}

/** Campos de `GET/POST /v1/payments` de los que dependemos. */
export interface MercadoPagoPayment {
  id: number | string;
  status?: string;
  status_detail?: string;
  external_reference?: string;
  transaction_amount?: number;
  currency_id?: string;
  collector_id?: number | string;
  live_mode?: boolean;
  fee_details?: Array<{ type?: string; amount?: number; fee_payer?: string }>;
  transaction_details?: { net_received_amount?: number };
}

export interface SplitPaymentResult {
  paymentId: string;
  status: string;
  statusDetail?: string;
  amountCop: number;
  applicationFeeCop: number;
  /** Comisión que Mercado Pago reporta como `application_fee`, si la reporta. */
  reportedApplicationFeeCop?: number;
  netReceivedCop?: number;
  collectorId?: string;
}

export class MercadoPagoApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** Código/mensaje de MP sin datos de la petición (útil para diagnóstico). */
    readonly mpMessage?: string,
  ) {
    super(message);
    this.name = 'MercadoPagoApiError';
  }
}

function reportedApplicationFee(payment: MercadoPagoPayment): number | undefined {
  return payment.fee_details?.find((f) => f.type === 'application_fee')?.amount;
}

async function readMpError(response: Response): Promise<string | undefined> {
  const body = (await response.json().catch(() => ({}))) as {
    message?: unknown;
    error?: unknown;
    cause?: Array<{ code?: unknown; description?: unknown }>;
  };
  const parts = [
    body.error,
    body.message,
    ...(body.cause ?? []).map((c) => `${c.code}:${c.description}`),
  ]
    .filter((p) => typeof p === 'string' && p.length > 0)
    .map(String);
  return parts.length > 0 ? parts.join(' | ') : undefined;
}

export class MercadoPagoSplitClient {
  private readonly baseUrl: string;

  constructor(
    private readonly options: { webhookSecret?: string; baseUrl?: string } = {},
    private readonly fetchFn: MercadoPagoFetch = globalThis.fetch.bind(globalThis),
  ) {
    this.baseUrl = (options.baseUrl ?? MERCADOPAGO_API_BASE_URL).replace(/\/$/, '');
  }

  async createSplitPayment(input: SplitPaymentInput): Promise<SplitPaymentResult> {
    if (!input.sellerAccessToken) {
      throw new Error(
        "createSplitPayment requires the organization's OAuth access token; charging with the platform token is custody (ADR-PAG-001).",
      );
    }
    if (!input.cardToken || !input.paymentMethodId) {
      throw new Error(
        'createSplitPayment requires a tokenized card (cardToken + paymentMethodId).',
      );
    }
    const applicationFee = input.omitApplicationFee
      ? 0
      : computeApplicationFee(input.amountCop, input.feeRate);

    const body: Record<string, unknown> = {
      transaction_amount: input.amountCop,
      token: input.cardToken,
      payment_method_id: input.paymentMethodId,
      installments: input.installments ?? 1,
      payer: { email: input.payerEmail },
      external_reference: input.externalReference,
      description: input.description ?? 'Donación AdoptaFácil',
    };
    if (!input.omitApplicationFee) body.application_fee = applicationFee;
    if (input.notificationUrl) body.notification_url = input.notificationUrl;

    const response = await this.fetchFn(`${this.baseUrl}/v1/payments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${input.sellerAccessToken}`,
        'X-Idempotency-Key': input.idempotencyKey,
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const mpMessage = await readMpError(response);
      throw new MercadoPagoApiError(
        `MercadoPago payment create failed (${response.status})${mpMessage ? `: ${mpMessage}` : ''}`,
        response.status,
        mpMessage,
      );
    }
    const payment = (await response.json()) as MercadoPagoPayment;
    return {
      paymentId: String(payment.id),
      status: payment.status ?? 'unknown',
      statusDetail: payment.status_detail,
      amountCop: input.amountCop,
      applicationFeeCop: applicationFee,
      reportedApplicationFeeCop: reportedApplicationFee(payment),
      netReceivedCop: payment.transaction_details?.net_received_amount,
      collectorId: payment.collector_id !== undefined ? String(payment.collector_id) : undefined,
    };
  }

  async getPayment(paymentId: string, sellerAccessToken: string): Promise<MercadoPagoPayment> {
    const response = await this.fetchFn(
      `${this.baseUrl}/v1/payments/${encodeURIComponent(paymentId)}`,
      { headers: { Authorization: `Bearer ${sellerAccessToken}` } },
    );
    if (!response.ok) {
      throw new MercadoPagoApiError(
        `MercadoPago payment fetch failed (${response.status})`,
        response.status,
        await readMpError(response),
      );
    }
    return (await response.json()) as MercadoPagoPayment;
  }

  /**
   * Verifica la firma de una notificación de pago y lee el pago con el token
   * del refugio. Rechaza (lanza) ante firma inválida, ts vencido, pago de otra
   * cuenta o pago sin referencia. Nunca registra el secreto ni el HMAC.
   */
  async verifyWebhook(params: {
    signature: string | undefined;
    requestId: string | undefined;
    dataId: string | undefined;
    seller: { accessToken: string; userId: string };
    /** Tolerancia de reloj; por defecto 5 minutos. */
    maxAgeSeconds?: number;
    now?: Date;
  }): Promise<{ payment: MercadoPagoPayment; eventId: string }> {
    const secret = this.options.webhookSecret;
    const { ts, v1 } = parseSignatureHeader(params.signature);
    if (!ts || !v1 || !params.requestId || !params.dataId || !secret) {
      throw new Error(
        'MercadoPago webhook rejected: missing ts/v1/x-request-id/data.id/webhook secret.',
      );
    }
    if (
      !verifyWebhookSignature(secret, {
        dataId: params.dataId,
        requestId: params.requestId,
        ts,
        v1,
      })
    ) {
      throw new Error('MercadoPago webhook rejected: signature mismatch.');
    }
    const maxAge = params.maxAgeSeconds ?? 300;
    const nowSeconds = Math.floor((params.now ?? new Date()).getTime() / 1000);
    // MP envía `ts` en milisegundos en algunas notificaciones y en segundos en otras.
    const tsNum = Number(ts);
    const tsSeconds = tsNum > 1e12 ? Math.floor(tsNum / 1000) : tsNum;
    if (!Number.isFinite(tsSeconds) || Math.abs(nowSeconds - tsSeconds) > maxAge) {
      throw new Error('MercadoPago webhook rejected: stale timestamp.');
    }

    const payment = await this.getPayment(params.dataId, params.seller.accessToken);
    if (
      payment.collector_id !== undefined &&
      String(payment.collector_id) !== params.seller.userId
    ) {
      throw new Error('MercadoPago webhook rejected: payment belongs to another account.');
    }
    if (!payment.external_reference) {
      throw new Error('MercadoPago webhook rejected: payment has no external_reference.');
    }
    return { payment, eventId: `${payment.id}-${payment.status}` };
  }
}

/** Parsea `ts=1704908010,v1=618c853...`. */
export function parseSignatureHeader(signature: string | undefined): { ts?: string; v1?: string } {
  const result: { ts?: string; v1?: string } = {};
  for (const part of (signature ?? '').split(',')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (key === 'ts') result.ts = value;
    if (key === 'v1') result.v1 = value;
  }
  return result;
}

/** Manifest documentado por MP; los ids alfanuméricos van en minúscula. */
export function webhookManifest(dataId: string, requestId: string, ts: string): string {
  return `id:${dataId.toLowerCase()};request-id:${requestId};ts:${ts};`;
}

export function verifyWebhookSignature(
  secret: string,
  p: { dataId: string; requestId: string; ts: string; v1: string },
): boolean {
  const computed = Buffer.from(
    createHmac('sha256', secret)
      .update(webhookManifest(p.dataId, p.requestId, p.ts))
      .digest('hex'),
    'hex',
  );
  const given = Buffer.from(p.v1, 'hex');
  return computed.length === given.length && timingSafeEqual(computed, given);
}
