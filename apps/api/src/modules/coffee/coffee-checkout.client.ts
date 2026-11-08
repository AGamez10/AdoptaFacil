import { Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MERCADOPAGO_RESOURCE_ID_PATTERN, isMercadoPagoCheckoutUrl } from '@adoptafacil/contracts';
import type { Env } from '../../config/env.validation';
import { mercadoPagoTimeoutSignal } from '../../core/payments/mercadopago-http';

export type CoffeeCheckoutFetch = typeof fetch;

/** A payment as read back with AdoptaFácil's own token (never the payer). */
export interface CoffeePaymentReadBack {
  id: string;
  status: string | null;
  externalReference: string | null;
  /** Integer COP; NaN when not an integer (never matches a total). */
  amount: number;
  currency: string | null;
  liveMode: boolean | null;
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null;
}

function integer(value: unknown): number {
  const n = typeof value === 'string' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) && Number.isInteger(n) ? n : Number.NaN;
}

/**
 * Checkout Pro with AdoptaFácil's OWN Mercado Pago account
 * (`MERCADOPAGO_PLATFORM_ACCESS_TOKEN`): the coffee is AdoptaFácil's sale, not
 * a donation, so it is charged like the plans and never with an
 * organization's token. Transport only; never logs the token.
 * Source: https://www.mercadopago.com.co/developers/es/reference/preferences/_checkout_preferences/post
 */
@Injectable()
export class CoffeeCheckoutClient {
  private readonly baseUrl: string;
  private readonly token: string | undefined;
  private readonly test: boolean;
  private readonly statementDescriptor: string | undefined;

  constructor(
    config: ConfigService<Env, true>,
    @Optional()
    private readonly fetchFn: CoffeeCheckoutFetch = globalThis.fetch.bind(globalThis),
  ) {
    this.baseUrl = (
      (config.get('MERCADOPAGO_BASE_URL', { infer: true }) as string | undefined) ??
      'https://api.mercadopago.com'
    ).replace(/\/+$/, '');
    this.token = config.get('MERCADOPAGO_PLATFORM_ACCESS_TOKEN', { infer: true }) as
      string | undefined;
    this.test = config.get('MERCADOPAGO_TEST', { infer: true }) === true;
    this.statementDescriptor = config.get('MERCADOPAGO_STATEMENT_DESCRIPTOR', { infer: true }) as
      string | undefined;
  }

  isConfigured(): boolean {
    return Boolean(this.token);
  }

  /** `true` when this deployment charges in sandbox. */
  isTest(): boolean {
    return this.test;
  }

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    if (!this.token) throw new Error('Coffee checkout is not configured');
    return { Authorization: `Bearer ${this.token}`, Accept: 'application/json', ...extra };
  }

  /**
   * Preference for one order. It expires with the reservation, and cash
   * methods (Efecty, bank tickets) are excluded: they are paid days later,
   * long after the 15-minute reservation.
   */
  async createPreference(input: {
    reference: string;
    title: string;
    quantity: number;
    unitPriceCop: number;
    shippingFeeCop: number;
    payerEmail: string;
    payerName: string;
    notificationUrl: string;
    backUrl: string;
    expiresAt: Date;
  }): Promise<{ id: string; checkoutUrl: string }> {
    const items: Record<string, unknown>[] = [
      {
        id: 'coffee',
        title: input.title,
        category_id: 'food',
        quantity: input.quantity,
        currency_id: 'COP',
        unit_price: input.unitPriceCop,
      },
    ];
    if (input.shippingFeeCop > 0) {
      items.push({
        id: 'shipping',
        title: 'Envío',
        quantity: 1,
        currency_id: 'COP',
        unit_price: input.shippingFeeCop,
      });
    }
    const body: Record<string, unknown> = {
      items,
      external_reference: input.reference,
      notification_url: input.notificationUrl,
      back_urls: { success: input.backUrl, pending: input.backUrl, failure: input.backUrl },
      auto_return: 'approved',
      binary_mode: true,
      expires: true,
      expiration_date_to: input.expiresAt.toISOString(),
      date_of_expiration: input.expiresAt.toISOString(),
      payment_methods: {
        excluded_payment_types: [{ id: 'ticket' }, { id: 'atm' }],
      },
      payer: { email: input.payerEmail, name: input.payerName },
      metadata: { kind: 'coffee' },
    };
    if (this.statementDescriptor) body.statement_descriptor = this.statementDescriptor;

    const response = await this.fetchFn(`${this.baseUrl}/checkout/preferences`, {
      method: 'POST',
      headers: this.headers({
        'Content-Type': 'application/json',
        'X-Idempotency-Key': input.reference,
      }),
      body: JSON.stringify(body),
      signal: mercadoPagoTimeoutSignal(),
    });
    if (!response.ok) {
      throw new Error(`Mercado Pago preference create failed (${response.status})`);
    }
    const pref = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    const link = str(this.test ? (pref?.sandbox_init_point ?? pref?.init_point) : pref?.init_point);
    if (!str(pref?.id) || !isMercadoPagoCheckoutUrl(link)) {
      throw new Error('Mercado Pago preference create returned no usable checkout link');
    }
    return { id: str(pref?.id) as string, checkoutUrl: link as string };
  }

  /** Read a payment back with AdoptaFácil's token (a payment of another
   *  account is not readable with it). */
  async getPayment(id: string): Promise<CoffeePaymentReadBack> {
    if (!MERCADOPAGO_RESOURCE_ID_PATTERN.test(id)) {
      throw new Error('Mercado Pago payment id has an invalid format');
    }
    const response = await this.fetchFn(`${this.baseUrl}/v1/payments/${encodeURIComponent(id)}`, {
      headers: this.headers(),
      signal: mercadoPagoTimeoutSignal(),
    });
    if (!response.ok) {
      throw new Error(`Mercado Pago payment read-back failed (${response.status})`);
    }
    const b = ((await response.json().catch(() => null)) ?? {}) as Record<string, unknown>;
    return {
      id: String(b.id ?? id),
      status: str(b.status),
      externalReference: str(b.external_reference),
      amount: integer(b.transaction_amount),
      currency: str(b.currency_id),
      liveMode: typeof b.live_mode === 'boolean' ? b.live_mode : null,
    };
  }
}
