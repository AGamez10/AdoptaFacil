import type { CoffeeLotStatus, CoffeeOrderStatus } from '@adoptafacil/contracts';

const pesos = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
});

/** `27999` → `$ 27.999` (pesos enteros, formato colombiano). */
export function formatCop(value: number): string {
  return pesos.format(value);
}

const colombiaDate = new Intl.DateTimeFormat('es-CO', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'America/Bogota',
});

/** ISO UTC → fecha y hora de Colombia (solo presentación). */
export function formatColombiaDateTime(iso: string): string {
  return colombiaDate.format(new Date(iso));
}

export const LOT_STATUS_LABEL: Record<CoffeeLotStatus, string> = {
  draft: 'Borrador',
  on_sale: 'A la venta',
  paused: 'En pausa',
  closed: 'Cerrado',
};

export const ORDER_STATUS_LABEL: Record<CoffeeOrderStatus, string> = {
  pending: 'Esperando pago',
  paid: 'Pagado',
  needs_refund: 'Devolver dinero',
  expired: 'Reserva vencida',
  rejected: 'Pago rechazado',
  cancelled: 'Cancelado',
  refunded: 'Devuelto',
};

/** Total de un pedido: bolsas × precio + envío. */
export function orderTotal(quantity: number, unitPriceCop: number, shippingFeeCop: number): number {
  return quantity * unitPriceCop + shippingFeeCop;
}
