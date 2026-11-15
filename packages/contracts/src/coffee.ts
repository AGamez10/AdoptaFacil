// ============================================================================
// Café de AdoptaFácil: lotes con QR fijo, checkout con stock y aporte a campañas.
//
// AdoptaFácil compra café y lo revende con SU PROPIA cuenta de Mercado Pago
// (es su venta, no una donación). De cada bolsa pagada, AdoptaFácil aporta por
// voluntad propia el 20 % del margen bruto (precio de venta − precio de compra)
// a una campaña activa de una organización aprobada. El lote se publica con una
// campaña SUGERIDA; el comprador puede cambiarla por otra campaña activa antes
// de pagar. Cada bolsa conserva la campaña que tenía al pagarse.
//
// El QR impreso es uno por presentación (250 g, 450 g…) y no cambia nunca:
// `https://<dominio>/c/<código>` lleva al lote que está a la venta.
//
// Contrato aditivo. Montos en pesos enteros (COP). Fechas ISO-8601 UTC.
// ============================================================================

/** Código impreso en el QR: 8 caracteres sin 0/1/i/l/o (igual que el QR de las orgs). */
export const COFFEE_CODE_PATTERN = /^[a-hjkmnp-z2-9]{8}$/;

/** Referencia de un pedido (`external_reference` en Mercado Pago). */
export const COFFEE_ORDER_REFERENCE_PATTERN = /^cafe-[a-hjkmnp-z2-9]{24}$/;

/** Regla de aporte: 20 % del margen bruto, en puntos básicos. */
export const COFFEE_CONTRIBUTION_BPS = 2000;

/** Minutos que una bolsa queda apartada mientras el comprador paga. */
export const COFFEE_RESERVATION_MINUTES = 15;

/** Bolsas por pedido. */
export const COFFEE_MAX_UNITS_PER_ORDER = 10;

/** Dominio por defecto del QR impreso. */
export const COFFEE_DEFAULT_QR_DOMAIN = 'adoptafacil.org';

/**
 * Aporte por bolsa: 20 % de (venta − compra), redondeado al peso. Nunca
 * negativo: si se vende por debajo del costo no hay margen que aportar.
 */
export function coffeeContributionPerUnit(
  salePriceCop: number,
  unitCostCop: number,
  bps: number = COFFEE_CONTRIBUTION_BPS,
): number {
  const margin = salePriceCop - unitCostCop;
  if (!Number.isFinite(margin) || margin <= 0) return 0;
  return Math.round((margin * bps) / 10_000);
}

/** URL de una presentación (la que va escrita bajo el QR, para compararla). */
export function coffeeQrUrl(domain: string, code: string): string {
  return `https://${domain}/c/${code}`;
}

/** Lo que codifica el QR impreso: la misma URL marcada como escaneo (`?o=qr`). */
export function coffeeQrScanUrl(domain: string, code: string): string {
  return `${coffeeQrUrl(domain, code)}?o=qr`;
}

export const COFFEE_LOT_STATUSES = ['draft', 'on_sale', 'paused', 'closed'] as const;
export type CoffeeLotStatus = (typeof COFFEE_LOT_STATUSES)[number];

/**
 * `pending`: bolsa apartada mientras paga (hasta `reservedUntil`).
 * `paid`: pago aprobado; cuenta para stock y aporte.
 * `needs_refund`: el pago llegó cuando ya no había bolsas: se devuelve.
 * `expired` / `rejected` / `cancelled`: no se pagó; la bolsa se liberó.
 * `refunded`: devuelto o contracargo; no cuenta para el aporte.
 */
export const COFFEE_ORDER_STATUSES = [
  'pending',
  'paid',
  'needs_refund',
  'expired',
  'rejected',
  'cancelled',
  'refunded',
] as const;
export type CoffeeOrderStatus = (typeof COFFEE_ORDER_STATUSES)[number];

/** Campaña que puede recibir el aporte (activa, de una organización aprobada). */
export interface CoffeeCampaignOption {
  id: string;
  title: string;
  organizationName: string;
  /** ISO-8601 UTC. */
  deadline: string;
}

// ---------------------------------------------------------------------------
// Público (sin sesión)
// ---------------------------------------------------------------------------

/** `GET /public/coffee/:code` — lo que ve quien escanea el QR. */
export interface PublicCoffeeOffer {
  code: string;
  productName: string;
  presentationGrams: number;
  description: string | null;
  /** Lote a la venta; `null` si ninguno está a la venta ahora. */
  lot: {
    id: string;
    lotCode: string;
    salePriceCop: number;
    shippingFeeCop: number;
    /** Bolsas que se pueden comprar ya (stock − pagadas − apartadas). */
    availableUnits: number;
    contributionPerUnitCop: number;
    /** Campaña sugerida, si sigue activa. */
    suggestedCampaign: CoffeeCampaignOption | null;
  } | null;
  /** Totales públicos del programa de café (todas las presentaciones del equipo). */
  impact: {
    unitsSold: number;
    contributionCommittedCop: number;
    contributionDeliveredCop: number;
  };
}

/** `GET /public/coffee/campaigns` — campañas que el comprador puede elegir. */
export interface PublicCoffeeCampaigns {
  items: CoffeeCampaignOption[];
}

export interface CoffeeBuyerInput {
  fullName: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  department: string;
}

/** `POST /public/coffee/:code/checkout`. */
export interface CoffeeCheckoutInput {
  lotId: string;
  quantity: number;
  campaignId: string;
  buyer: CoffeeBuyerInput;
  /** Autorización de tratamiento de datos (Ley 1581): debe ser `true`. */
  acceptPrivacy: true;
}

export interface CoffeeCheckoutResult {
  reference: string;
  /** Checkout de Mercado Pago (cuenta de AdoptaFácil). */
  checkoutUrl: string;
  /** ISO-8601 UTC: hasta cuándo están apartadas las bolsas. */
  reservedUntil: string;
  totalCop: number;
}

/** `GET /public/coffee/orders/:reference` — estado sin datos personales. */
export interface PublicCoffeeOrderStatus {
  reference: string;
  status: CoffeeOrderStatus;
  productName: string;
  lotCode: string;
  quantity: number;
  totalCop: number;
  campaignTitle: string;
  organizationName: string;
  contributionTotalCop: number;
}

// ---------------------------------------------------------------------------
// Panel del equipo de plataforma
// ---------------------------------------------------------------------------

export interface CoffeeLotView {
  id: string;
  productId: string;
  lotCode: string;
  status: CoffeeLotStatus;
  salePriceCop: number;
  unitCostCop: number;
  shippingFeeCop: number;
  stockUnits: number;
  contributionBps: number;
  contributionPerUnitCop: number;
  defaultCampaignId: string | null;
  defaultCampaignTitle: string | null;
  unitsSold: number;
  unitsReserved: number;
  availableUnits: number;
  revenueCop: number;
  contributionCommittedCop: number;
  /** Hay una aprobación pendiente para publicarlo o cambiar su campaña. */
  pendingApproval: 'coffee.lot_publish' | 'coffee.lot_campaign' | null;
  publishedAt: string | null;
  createdAt: string;
}

export interface CoffeeProductView {
  id: string;
  code: string;
  name: string;
  presentationGrams: number;
  description: string | null;
  qrDomain: string;
  qrUrl: string;
  isActive: boolean;
  /** Visitas a la página del producto en los últimos 30 días. */
  visitsLast30Days: { qr: number; web: number };
  visitsTotal: { qr: number; web: number };
  lots: CoffeeLotView[];
}

export interface CoffeeCampaignBalance {
  campaignId: string;
  campaignTitle: string;
  organizationName: string;
  committedCop: number;
  deliveredCop: number;
  pendingCop: number;
}

export interface CoffeeDashboard {
  products: CoffeeProductView[];
  campaigns: CoffeeCampaignBalance[];
  /** Dominios permitidos para imprimir el QR. */
  qrDomains: string[];
  checkoutEnabled: boolean;
}

export interface CoffeeOrderView {
  id: string;
  reference: string;
  status: CoffeeOrderStatus;
  productName: string;
  lotCode: string;
  quantity: number;
  unitPriceCop: number;
  shippingFeeCop: number;
  totalCop: number;
  contributionTotalCop: number;
  campaignTitle: string;
  organizationName: string;
  buyer: CoffeeBuyerInput;
  createdAt: string;
  paidAt: string | null;
  shippedAt: string | null;
  receiptSentAt: string | null;
}

export interface CreateCoffeeProductInput {
  name: string;
  presentationGrams: number;
  description?: string;
  qrDomain: string;
}

export interface CreateCoffeeLotInput {
  lotCode: string;
  salePriceCop: number;
  unitCostCop: number;
  shippingFeeCop: number;
  stockUnits: number;
  defaultCampaignId: string;
}

/** Borrador: todo editable. A la venta: solo el stock (nunca por debajo de lo vendido). */
export type UpdateCoffeeLotInput = Partial<CreateCoffeeLotInput>;

export interface CreateCoffeeDeliveryInput {
  campaignId: string;
  amountCop: number;
  /** YYYY-MM-DD (día en Colombia en que se entregó). */
  deliveredOn: string;
  /** Soporte: número de transacción, comprobante, enlace. */
  evidence: string;
}

export interface CoffeeDeliveryView {
  id: string;
  campaignId: string;
  campaignTitle: string;
  amountCop: number;
  deliveredOn: string;
  evidence: string;
  createdAt: string;
}

/** Payloads de la doble aprobación (platform-workspace). */
export interface CoffeeLotPublishPayload {
  lotId: string;
  /** Lo que el aprobador ve y aprueba; si el lote cambió, la aprobación falla. */
  salePriceCop: number;
  unitCostCop: number;
  shippingFeeCop: number;
  stockUnits: number;
  defaultCampaignId: string;
}

export interface CoffeeLotCampaignPayload {
  lotId: string;
  campaignId: string;
}
