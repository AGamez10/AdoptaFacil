import { Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MERCADOPAGO_RESOURCE_ID_PATTERN, isMercadoPagoCheckoutUrl } from '@adoptafacil/contracts';
import type { Env } from '../../config/env.validation';
import { mercadoPagoTimeoutSignal } from './mercadopago-http';

/** Injectable fetch surface so tests run with ZERO network. */
export type MercadoPagoBillingFetch = typeof fetch;

/** A subscription (preapproval) as read back from Mercado Pago. */
export interface MercadoPagoPreapproval {
  id: string;
  status: string | null;
  externalReference: string | null;
  /** Monthly amount; NaN when not an integer (never matches a price). */
  amount: number;
  currency: string | null;
  frequency: number | null;
  frequencyType: string | null;
  nextPaymentDate: Date | null;
  initPoint: string | null;
}

/** A monthly charge of a subscription, as read back. */
export interface MercadoPagoAuthorizedPayment {
  id: string;
  preapprovalId: string | null;
  /** `payment.status` (approved, rejected…) when present, else the top status. */
  paymentStatus: string | null;
  amount: number;
  currency: string | null;
  /** When the charge was made (debit date, or creation as fallback). */
  chargedAt: Date | null;
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null;
}

function date(value: unknown): Date | null {
  if (typeof value !== 'string') return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function integer(value: unknown): number {
  const n = typeof value === 'string' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) && Number.isInteger(n) ? n : Number.NaN;
}

/**
 * Mercado Pago Subscriptions with AdoptaFácil's OWN account (ADR-PAG-003):
 * the plans are AdoptaFácil's revenue for the software, so they are charged
 * with the PLATFORM token (`MERCADOPAGO_PLATFORM_ACCESS_TOKEN`) and never
 * touch a donation. Transport only; never logs the token.
 * Source: https://www.mercadopago.com.co/developers/es/reference/subscriptions/_preapproval/post
 */
@Injectable()
export class MercadoPagoBillingClient {
  private readonly baseUrl: string;
  private readonly token: string | undefined;
  private readonly test: boolean;

  constructor(
    config: ConfigService<Env, true>,
    @Optional()
    private readonly fetchFn: MercadoPagoBillingFetch = globalThis.fetch.bind(globalThis),
  ) {
    this.baseUrl = (
      (config.get('MERCADOPAGO_BASE_URL', { infer: true }) as string | undefined) ??
      'https://api.mercadopago.com'
    ).replace(/\/+$/, '');
    this.token = config.get('MERCADOPAGO_PLATFORM_ACCESS_TOKEN', { infer: true }) as
      string | undefined;
    this.test = config.get('MERCADOPAGO_TEST', { infer: true }) === true;
  }

  isConfigured(): boolean {
    return Boolean(this.token);
  }

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    if (!this.token) {
      throw new Error('Mercado Pago platform billing is not configured');
    }
    return { Authorization: `Bearer ${this.token}`, Accept: 'application/json', ...extra };
  }

  /** Create a pending monthly subscription the payer authorizes on Mercado Pago. */
  async createMonthlySubscription(input: {
    reason: string;
    externalReference: string;
    payerEmail: string;
    amountCop: number;
    backUrl: string;
    idempotencyKey: string;
  }): Promise<{ id: string; checkoutUrl: string }> {
    const response = await this.fetchFn(`${this.baseUrl}/preapproval`, {
      method: 'POST',
      headers: this.headers({
        'Content-Type': 'application/json',
        'X-Idempotency-Key': input.idempotencyKey,
      }),
      body: JSON.stringify({
        reason: input.reason,
        external_reference: input.externalReference,
        payer_email: input.payerEmail,
        back_url: input.backUrl,
        status: 'pending',
        auto_recurring: {
          frequency: 1,
          frequency_type: 'months',
          transaction_amount: input.amountCop,
          currency_id: 'COP',
        },
      }),
      signal: mercadoPagoTimeoutSignal(),
    });
    if (!response.ok) {
      throw new Error(`Mercado Pago preapproval create failed (${response.status})`);
    }
    const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    const id = str(body?.id);
    const link = str(this.test ? (body?.sandbox_init_point ?? body?.init_point) : body?.init_point);
    if (!id || !isMercadoPagoCheckoutUrl(link)) {
      throw new Error('Mercado Pago preapproval create returned no usable checkout link');
    }
    return { id, checkoutUrl: link as string };
  }

  async getPreapproval(id: string): Promise<MercadoPagoPreapproval> {
    if (!MERCADOPAGO_RESOURCE_ID_PATTERN.test(id)) {
      throw new Error('Mercado Pago preapproval id has an invalid format');
    }
    const response = await this.fetchFn(`${this.baseUrl}/preapproval/${encodeURIComponent(id)}`, {
      headers: this.headers(),
      signal: mercadoPagoTimeoutSignal(),
    });
    if (!response.ok) {
      throw new Error(`Mercado Pago preapproval read-back failed (${response.status})`);
    }
    const b = ((await response.json().catch(() => null)) ?? {}) as Record<string, unknown>;
    const recurring = (b.auto_recurring ?? {}) as Record<string, unknown>;
    return {
      id: str(b.id) ?? id,
      status: str(b.status),
      externalReference: str(b.external_reference),
      amount: integer(recurring.transaction_amount),
      currency: str(recurring.currency_id),
      frequency: typeof recurring.frequency === 'number' ? recurring.frequency : null,
      frequencyType: str(recurring.frequency_type),
      nextPaymentDate: date(b.next_payment_date),
      initPoint: str(b.init_point),
    };
  }

  async getAuthorizedPayment(id: string): Promise<MercadoPagoAuthorizedPayment> {
    if (!MERCADOPAGO_RESOURCE_ID_PATTERN.test(id)) {
      throw new Error('Mercado Pago authorized payment id has an invalid format');
    }
    const response = await this.fetchFn(
      `${this.baseUrl}/authorized_payments/${encodeURIComponent(id)}`,
      { headers: this.headers(), signal: mercadoPagoTimeoutSignal() },
    );
    if (!response.ok) {
      throw new Error(`Mercado Pago authorized payment read-back failed (${response.status})`);
    }
    const b = ((await response.json().catch(() => null)) ?? {}) as Record<string, unknown>;
    const payment = (b.payment ?? {}) as Record<string, unknown>;
    return {
      id: String(b.id ?? id),
      preapprovalId: str(b.preapproval_id),
      paymentStatus: str(payment.status) ?? str(b.status),
      amount: integer(b.transaction_amount),
      currency: str(b.currency_id),
      chargedAt: date(b.debit_date) ?? date(b.date_created),
    };
  }
}
