import {
  COFFEE_CODE_PATTERN,
  COFFEE_ORDER_REFERENCE_PATTERN,
  type CoffeeCampaignOption,
  type CoffeeCheckoutInput,
  type CoffeeCheckoutResult,
  type CoffeeDashboard,
  type CoffeeDeliveryView,
  type CoffeeOrderStatus,
  type CoffeeOrderView,
  type CreateCoffeeDeliveryInput,
  type CreateCoffeeLotInput,
  type CreateCoffeeProductInput,
  type CreateSensitiveActionInput,
  type PublicCoffeeCampaigns,
  type PublicCoffeeOffer,
  type PublicCoffeeOrderStatus,
  type UpdateCoffeeLotInput,
} from '@adoptafacil/contracts';
import type { ApiClient } from '../../../shell/api';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

/** Error de la API pública con su código de negocio (OUT_OF_STOCK, CAMPAIGN_CLOSED…). */
export class CoffeeApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly availableUnits?: number,
  ) {
    super(message);
  }
}

async function readJson<T>(response: Response): Promise<T> {
  if (response.ok) return (await response.json()) as T;
  const body = (await response.json().catch(() => null)) as {
    message?: string | string[];
    code?: string;
    availableUnits?: number;
  } | null;
  const message = Array.isArray(body?.message) ? body?.message[0] : body?.message;
  throw new CoffeeApiError(
    message ?? 'Algo salió mal. Inténtalo de nuevo.',
    response.status,
    body?.code,
    body?.availableUnits,
  );
}

/** `GET /public/coffee/:code` — `null` si el código no existe. `source=qr` cuenta el escaneo. */
export async function fetchCoffeeOffer(
  code: string,
  source: 'qr' | 'web',
): Promise<PublicCoffeeOffer | null> {
  if (!COFFEE_CODE_PATTERN.test(code)) return null;
  const response = await fetch(`${API_BASE}/public/coffee/${encodeURIComponent(code)}?o=${source}`);
  if (response.status === 404) return null;
  return readJson<PublicCoffeeOffer>(response);
}

export async function fetchCoffeeCampaigns(): Promise<CoffeeCampaignOption[]> {
  const response = await fetch(`${API_BASE}/public/coffee/campaigns`);
  return (await readJson<PublicCoffeeCampaigns>(response)).items;
}

export async function startCoffeeCheckout(
  code: string,
  input: CoffeeCheckoutInput,
): Promise<CoffeeCheckoutResult> {
  const response = await fetch(`${API_BASE}/public/coffee/${encodeURIComponent(code)}/checkout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return readJson<CoffeeCheckoutResult>(response);
}

export async function fetchCoffeeOrder(reference: string): Promise<PublicCoffeeOrderStatus | null> {
  if (!COFFEE_ORDER_REFERENCE_PATTERN.test(reference)) return null;
  const response = await fetch(`${API_BASE}/public/coffee/orders/${encodeURIComponent(reference)}`);
  if (response.status === 404) return null;
  return readJson<PublicCoffeeOrderStatus>(response);
}

/** Panel del equipo de plataforma. */
export function coffeeAdminApi(client: ApiClient) {
  const post = <T = void>(path: string, json: unknown = {}) =>
    client.request<T>(path, { method: 'POST', json });
  return {
    dashboard: () => client.request<CoffeeDashboard>('/platform/coffee'),
    campaigns: () => client.request<CoffeeCampaignOption[]>('/platform/coffee/campaigns'),
    createProduct: (input: CreateCoffeeProductInput) => post('/platform/coffee/products', input),
    createLot: (productId: string, input: CreateCoffeeLotInput) =>
      post(`/platform/coffee/products/${productId}/lots`, input),
    updateLot: (lotId: string, input: UpdateCoffeeLotInput) =>
      client.request<void>(`/platform/coffee/lots/${lotId}`, { method: 'PATCH', json: input }),
    setLotStatus: (lotId: string, action: 'pause' | 'resume' | 'close') =>
      post(`/platform/coffee/lots/${lotId}/${action}`),
    orders: (status?: CoffeeOrderStatus) =>
      client.request<CoffeeOrderView[]>(
        `/platform/coffee/orders${status ? `?status=${status}` : ''}`,
      ),
    markShipped: (orderId: string) => post(`/platform/coffee/orders/${orderId}/shipped`),
    deliveries: () => client.request<CoffeeDeliveryView[]>('/platform/coffee/deliveries'),
    createDelivery: (input: CreateCoffeeDeliveryInput) =>
      post('/platform/coffee/deliveries', input),
    requestApproval: (input: CreateSensitiveActionInput) =>
      post('/platform/workspace/approvals', input),
  };
}

export type CoffeeAdminApi = ReturnType<typeof coffeeAdminApi>;
