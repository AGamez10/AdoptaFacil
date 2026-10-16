import { PLAN_CATALOG, type PlanKey } from '@adoptafacil/contracts';

/**
 * Cobro recurrente de los PLANES de AdoptaFácil con ePayco (ADR-PAG-002).
 *
 * Es ingreso propio de AdoptaFácil por el software: se cobra con la cuenta
 * ePayco de AdoptaFácil (`EPAYCO_PLATFORM_*`), nunca con la de un refugio, y
 * nunca toca una donación (D1, sin custodia).
 *
 * Alcance de esta pieza: el cliente HTTP y el mapeo plan → plan de ePayco. NO
 * está conectado todavía a `core/plans` (el flujo de compra del plan, la
 * tokenización de la tarjeta en el navegador y el webhook que activa la
 * suscripción van en el PR de planes). Apagado mientras nadie lo instancie.
 *
 * Endpoints: los de la API de recurrencia que usan los SDK oficiales de
 * ePayco (`api.secure.payco.co`). La documentación pública de planes no
 * publica las rutas (docs.epayco.com/docs/planes, 2026-10-15), así que
 * quedan en un solo lugar y TODO(client): verificar cada ruta y forma de
 * respuesta en el sandbox antes de encender el cobro.
 *
 * La tarjeta NUNCA llega a este servidor: el navegador la tokeniza con
 * ePayco y aquí solo entra el `tokenCard` opaco.
 */

export type EpaycoBillingFetch = typeof fetch;

export interface EpaycoBillingConfig {
  /** PUBLIC_KEY de la cuenta ePayco de AdoptaFácil. */
  publicKey: string;
  /** PRIVATE_KEY de la cuenta ePayco de AdoptaFácil. Secreto. */
  privateKey: string;
  /** `true` en sandbox. */
  test: boolean;
  /** Override para pruebas; por defecto la API de recurrencia. */
  baseUrl?: string;
}

/** Single place for the paths (TODO(client): verificar en sandbox). */
export const EPAYCO_RECURRING_PATHS = {
  login: '/v1/auth/login',
  createPlan: '/recurring/v1/plan/create',
  createCustomer: '/payment/v1/customer/create',
  createSubscription: '/recurring/v1/subscription/create',
  chargeSubscription: '/payment/v1/charge/subscription/create',
  cancelSubscription: '/recurring/v1/subscription/cancel',
} as const;

const DEFAULT_BASE_URL = 'https://api.secure.payco.co';

export type BillingInterval = 'month' | 'year';

/** Stable ePayco plan id for one of our plans: `af-crece-month`. */
export function epaycoPlanId(plan: PlanKey, interval: BillingInterval): string {
  return `af-${plan}-${interval}`;
}

export interface EpaycoPlanDefinition {
  id_plan: string;
  name: string;
  description: string;
  /** Integer COP pesos, IVA included (ePayco charges this exact amount). */
  amount: number;
  currency: 'cop';
  interval: BillingInterval;
  interval_count: 1;
  trial_days: number;
}

/**
 * What ePayco must charge for a paid plan. `ivaRate` comes from the plans
 * contract (PLAN_IVA_RATE, TODO(client) con el contador); `free` has no
 * ePayco plan and is refused.
 */
export function buildEpaycoPlan(
  plan: PlanKey,
  interval: BillingInterval,
  ivaRate: number,
  trialDays = 0,
): EpaycoPlanDefinition {
  const def = PLAN_CATALOG[plan];
  const base = interval === 'month' ? def.monthlyPriceCop : def.annualPriceCop;
  if (!Number.isInteger(base) || base <= 0) {
    throw new Error(`El plan "${plan}" no tiene precio: no se crea en ePayco.`);
  }
  if (!Number.isFinite(ivaRate) || ivaRate < 0 || ivaRate >= 1) {
    throw new Error('Tarifa de IVA inválida para el plan.');
  }
  return {
    id_plan: epaycoPlanId(plan, interval),
    name: `AdoptaFácil ${def.name}`,
    description: `Plan ${def.name} de AdoptaFácil (${interval === 'month' ? 'mensual' : 'anual'})`,
    amount: Math.floor(base * (1 + ivaRate) + 0.5),
    currency: 'cop',
    interval,
    interval_count: 1,
    trial_days: trialDays,
  };
}

export interface CreateSubscriptionInput {
  planId: string;
  /** ePayco customer id returned by `createCustomer`. */
  customerId: string;
  /** Opaque card token created in the browser. */
  tokenCard: string;
  docType: 'CC' | 'CE' | 'NIT' | 'PPN' | 'TI';
  docNumber: string;
}

export interface EpaycoSubscriptionResult {
  subscriptionId: string;
  status: string;
}

export class EpaycoBillingError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'EpaycoBillingError';
  }
}

export class EpaycoBillingClient {
  private readonly baseUrl: string;

  constructor(
    private readonly config: EpaycoBillingConfig,
    private readonly fetchImpl: EpaycoBillingFetch = fetch,
  ) {
    if (!config.publicKey || !config.privateKey) {
      throw new Error('Faltan las llaves ePayco de AdoptaFácil para cobrar planes.');
    }
    this.baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
  }

  createPlan(plan: EpaycoPlanDefinition): Promise<unknown> {
    return this.call(EPAYCO_RECURRING_PATHS.createPlan, plan);
  }

  async createCustomer(input: {
    tokenCard: string;
    name: string;
    email: string;
  }): Promise<{ customerId: string }> {
    const body = await this.call(EPAYCO_RECURRING_PATHS.createCustomer, {
      token_card: input.tokenCard,
      name: input.name,
      email: input.email,
      default: true,
    });
    const customerId = pickString(body, ['data.customerId', 'data.customer_id', 'customerId']);
    if (!customerId) throw new EpaycoBillingError('ePayco no devolvió el cliente creado.', 502);
    return { customerId };
  }

  async createSubscription(input: CreateSubscriptionInput): Promise<EpaycoSubscriptionResult> {
    const body = await this.call(EPAYCO_RECURRING_PATHS.createSubscription, {
      id_plan: input.planId,
      customer: input.customerId,
      token_card: input.tokenCard,
      doc_type: input.docType,
      doc_number: input.docNumber,
    });
    const subscriptionId = pickString(body, ['id', 'data.id', 'data._id', 'subscription.id']);
    if (!subscriptionId) {
      throw new EpaycoBillingError('ePayco no devolvió la suscripción creada.', 502);
    }
    return { subscriptionId, status: pickString(body, ['status', 'data.status']) ?? 'pending' };
  }

  /** First charge right after subscribing (ePayco does not charge on create). */
  chargeSubscription(input: CreateSubscriptionInput): Promise<unknown> {
    return this.call(EPAYCO_RECURRING_PATHS.chargeSubscription, {
      id_plan: input.planId,
      customer: input.customerId,
      token_card: input.tokenCard,
      doc_type: input.docType,
      doc_number: input.docNumber,
    });
  }

  cancelSubscription(subscriptionId: string): Promise<unknown> {
    return this.call(EPAYCO_RECURRING_PATHS.cancelSubscription, { id: subscriptionId });
  }

  private async login(): Promise<string> {
    const res = await this.fetchImpl(`${this.baseUrl}${EPAYCO_RECURRING_PATHS.login}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        public_key: this.config.publicKey,
        private_key: this.config.privateKey,
      }),
    });
    if (!res.ok) throw new EpaycoBillingError('ePayco rechazó el inicio de sesión.', res.status);
    const body = (await res.json()) as unknown;
    const token = pickString(body, ['bearer_token', 'token', 'data.token']);
    if (!token) throw new EpaycoBillingError('ePayco no devolvió un token de sesión.', 502);
    return token;
  }

  private async call(path: string, payload: object): Promise<unknown> {
    const token = await this.login();
    const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ ...payload, test: this.config.test }),
    });
    const body = (await res.json().catch(() => null)) as unknown;
    // ePayco answers 200 with `status: false` on business errors.
    if (!res.ok || (isRecord(body) && body.status === false)) {
      throw new EpaycoBillingError(`ePayco rechazó ${path}.`, res.ok ? 422 : res.status);
    }
    return body;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function pickString(body: unknown, paths: readonly string[]): string | null {
  for (const path of paths) {
    let current: unknown = body;
    for (const key of path.split('.')) {
      current = isRecord(current) ? current[key] : undefined;
    }
    if (typeof current === 'string' && current.trim() !== '') return current;
    if (typeof current === 'number') return String(current);
  }
  return null;
}
