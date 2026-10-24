// Module: core/plans (planes y suscripciones de organizaciones) · Contracts owner: @sebastian
//
// Monthly plans an ORGANIZATION pays to AdoptaFácil for the software. This is
// AdoptaFácil's own revenue (the org is the customer), so it never touches
// donations: donor → organization money keeps flowing through PaymentPort with
// the 4 % fee, and a subscription is billed separately (BillingPort, manual at
// first). Rule of the catalog: everything that protects the animal, the adopter
// or transparency (contract, follow-ups, audit, documents, donation receipts,
// collecting donations — also for informal rescuers) is FREE. Plans sell brand,
// reach and convenience — mainly the public portal (designs, seal, domain).
//
// Plan enforcement is behind `PLAN_ENFORCEMENT` (off by default): while it is
// off every organization is treated as `pro`, so nothing is gated until the
// owner decides to start charging.

/** Plan keys, cheapest first. The order is the upgrade order. */
export const PLAN_KEYS = ['free', 'crece', 'pro'] as const;
export type PlanKey = (typeof PLAN_KEYS)[number];

/** Boolean capabilities a plan may include. Only brand/reach/convenience
 *  features live here — never a safety, compliance or transparency feature. */
export const PLAN_CAPABILITIES = [
  /** All public-portal designs. Client decision (2026-10-16): every current
   *  design is free on every plan; future "super Pro" designs will be paid. */
  'portalAllDesigns',
  /** Premium ("super Pro") portal designs, the ones with `tier: 'paid'` in
   *  `PORTAL_TEMPLATES`. Client decision (2026-10-17): free for everyone during
   *  the launch promotion; afterwards they need a paid plan, and an org that
   *  stops paying falls back to a free design (its choice is kept, not erased). */
  'portalPremiumDesigns',
  /** Section order, typography, cover gallery or video on the portal. */
  'portalAdvancedCustomization',
  /** Hide the "Hecho con AdoptaFácil" seal on the portal. */
  'portalRemoveSeal',
  /** Own domain (www.mirefugio.org) for the portal. */
  'customDomain',
  /** Adopter/donor emails with the organization's own brand. */
  'brandedEmails',
  /** Export the organization's data to CSV/Excel. */
  'dataExport',
  /** Impact report PDF for donors and companies. */
  'impactReport',
  /** Corporate (B2B) sponsorship of the organization. */
  'corporateSponsorship',
  /** Priority WhatsApp support. */
  'prioritySupport',
] as const;
export type PlanCapability = (typeof PLAN_CAPABILITIES)[number];

/** Numeric limits per plan. `null` = unlimited. Limits are only checked when
 *  something is CREATED: a downgrade never deletes or hides existing data, the
 *  excess becomes read-only. */
export const PLAN_LIMITS = ['members', 'storageMb', 'portalDesigns'] as const;
export type PlanLimit = (typeof PLAN_LIMITS)[number];
export type PlanLimits = Record<PlanLimit, number | null>;

export interface PlanDefinition {
  key: PlanKey;
  /** Display name (Spanish, as shown to organizations). */
  name: string;
  /** One-line pitch for the plans screen. */
  tagline: string;
  /** Price in COP per month BEFORE IVA. Client decision (2026-10-22): these
   *  prices are published as OPTIONAL plans; the free plan stays free. */
  monthlyPriceCop: number;
  /** Price in COP per year BEFORE IVA (2 months free). */
  annualPriceCop: number;
  limits: PlanLimits;
  capabilities: Record<PlanCapability, boolean>;
}

const NONE: Record<PlanCapability, boolean> = {
  portalAllDesigns: false,
  portalPremiumDesigns: false,
  portalAdvancedCustomization: false,
  portalRemoveSeal: false,
  customDomain: false,
  brandedEmails: false,
  dataExport: false,
  impactReport: false,
  corporateSponsorship: false,
  prioritySupport: false,
};

/** The plan catalog: the single source of truth for the landing, the plans
 *  screen and the enforcement, so they never disagree. Paid plans are optional
 *  (client decision 2026-10-22); publishing a price never turns charging on —
 *  that is `PLAN_ENFORCEMENT` plus a manual or ePayco subscription. */
export const PLAN_CATALOG: Record<PlanKey, PlanDefinition> = {
  free: {
    key: 'free',
    name: 'Gratis',
    tagline: 'Todo para rescatar, adoptar y recaudar, con un portal público propio.',
    monthlyPriceCop: 0,
    annualPriceCop: 0,
    limits: { members: 3, storageMb: 1024, portalDesigns: 5 },
    capabilities: { ...NONE, portalAllDesigns: true },
  },
  crece: {
    key: 'crece',
    name: 'Crece',
    tagline: 'Un portal que se ve tuyo: sin sello y con tu marca en los correos.',
    monthlyPriceCop: 39_000,
    annualPriceCop: 390_000,
    limits: { members: 10, storageMb: 10 * 1024, portalDesigns: 5 },
    capabilities: {
      ...NONE,
      portalAllDesigns: true,
      portalPremiumDesigns: true,
      portalAdvancedCustomization: true,
      portalRemoveSeal: true,
      brandedEmails: true,
      dataExport: true,
      impactReport: true,
    },
  },
  pro: {
    key: 'pro',
    name: 'Pro',
    tagline: 'Tu propio dominio, reportes para empresas y soporte prioritario.',
    monthlyPriceCop: 79_000,
    annualPriceCop: 790_000,
    limits: { members: null, storageMb: 50 * 1024, portalDesigns: 5 },
    capabilities: {
      portalAllDesigns: true,
      portalPremiumDesigns: true,
      portalAdvancedCustomization: true,
      portalRemoveSeal: true,
      customDomain: true,
      brandedEmails: true,
      dataExport: true,
      impactReport: true,
      corporateSponsorship: true,
      prioritySupport: true,
    },
  },
};

/**
 * How each capability is described to organizations, and whether it already
 * works today. `available: false` = sold in the plan but still being built: the
 * landing and the plans screen show it as "próximamente", so no page promises
 * something the product does not do yet (Estatuto del Consumidor, publicidad).
 */
export const PLAN_CAPABILITY_INFO: Record<PlanCapability, { label: string; available: boolean }> = {
  portalAllDesigns: { label: 'Todos los diseños de portal público', available: true },
  portalPremiumDesigns: {
    label: 'Plantillas Pro del portal (como Historias, con video)',
    available: true,
  },
  portalAdvancedCustomization: {
    label: 'Personalización avanzada del portal',
    available: true,
  },
  portalRemoveSeal: {
    label: 'Portal sin el sello "Hecho con AdoptaFácil"',
    available: true,
  },
  customDomain: { label: 'Dominio propio (www.turefugio.org)', available: false },
  brandedEmails: { label: 'Correos a adoptantes y donantes con tu marca', available: true },
  dataExport: { label: 'Exportar tus datos a Excel', available: true },
  impactReport: { label: 'Reporte de impacto en PDF para donantes', available: true },
  corporateSponsorship: { label: 'Patrocinio de empresas', available: false },
  prioritySupport: { label: 'Soporte prioritario por WhatsApp', available: true },
};

/**
 * Correos con la marca de la organización por mes calendario (UTC), por plan.
 * Pasado el tope el correo SIGUE saliendo, con la marca de AdoptaFácil: un
 * límite comercial nunca detiene un recibo, un contrato o un seguimiento.
 * Propuesta del 2026-10-23 (Crece 5.000 y Pro 20.000), ajustable aquí.
 * TODO(client): confirmar los topes.
 */
export const BRANDED_EMAIL_MONTHLY_LIMIT: Record<PlanKey, number> = {
  free: 0,
  crece: 5_000,
  pro: 20_000,
};

/** Included in every plan, free too: what protects the animal, the adopter and
 *  transparency is never sold. */
export const PLAN_ALWAYS_INCLUDED = [
  'Portal público en tu subdominio, con tu logo',
  'Animales ilimitados con ficha clínica',
  'Adopciones con contrato y seguimiento',
  'Recaudo de donaciones, también si aún no estás formalizado',
  'Comprobantes de donación y documentos de la organización',
] as const;

export const PLAN_LIMIT_LABELS: Record<PlanLimit, string> = {
  members: 'Miembros del equipo',
  storageMb: 'Almacenamiento',
  portalDesigns: 'Diseños de portal',
};

/** "Sin límite", "1 GB", "512 MB" or the plain number. */
export function formatPlanLimit(limit: PlanLimit, value: number | null): string {
  if (value === null) return 'Sin límite';
  if (limit === 'storageMb') {
    return value >= 1024 ? `${Math.round((value / 1024) * 10) / 10} GB` : `${value} MB`;
  }
  return String(value);
}

export interface PlanHighlight {
  text: string;
  /** False while the feature is still being built ("próximamente"). */
  available: boolean;
}

/**
 * Short list of what a plan adds, derived from {@link PLAN_CATALOG} so the
 * landing cannot drift from the plans screen: the free plan lists what is
 * always included plus its limits; a paid plan lists "todo lo del plan
 * anterior", what it adds over that plan, and its limits.
 */
export function planHighlights(key: PlanKey): PlanHighlight[] {
  const plan = PLAN_CATALOG[key];
  const index = PLAN_KEYS.indexOf(key);
  const previous = index > 0 ? PLAN_CATALOG[PLAN_KEYS[index - 1]] : null;
  const members =
    plan.limits.members === null
      ? 'Equipo sin límite de personas'
      : `Hasta ${plan.limits.members} personas del equipo`;
  const storage = `${formatPlanLimit('storageMb', plan.limits.storageMb)} para fotos y documentos`;
  if (!previous) {
    return [
      ...PLAN_ALWAYS_INCLUDED.slice(0, 4).map((text) => ({ text, available: true })),
      { text: members, available: true },
      { text: storage, available: true },
    ];
  }
  const added = PLAN_CAPABILITIES.filter(
    (capability) => plan.capabilities[capability] && !previous.capabilities[capability],
  ).map((capability) => ({
    text: PLAN_CAPABILITY_INFO[capability].label,
    available: PLAN_CAPABILITY_INFO[capability].available,
  }));
  return [
    { text: `Todo lo del plan ${previous.name}`, available: true },
    ...added,
    { text: members, available: true },
    { text: storage, available: true },
  ];
}

/**
 * Promoción de lanzamiento (decisión del cliente, 2026-10-16): toda organización
 * tiene Pro gratis durante estos meses desde el lanzamiento. Mientras
 * `PLAN_ENFORCEMENT` esté apagado todas tienen Pro sin vencimiento; al
 * encenderlo, cada organización arranca en `trialing` con
 * `currentPeriodEnd` = fecha de lanzamiento + estos meses.
 */
export const LAUNCH_PRO_PROMO_MONTHS = 3;

/**
 * Last instant of the launch promotion: `launchDate` + {@link LAUNCH_PRO_PROMO_MONTHS}
 * calendar months (UTC). The launch date is the server setting `PLAN_LAUNCH_DATE`.
 */
export function launchPromoEnd(launchDate: Date): Date {
  const end = new Date(launchDate.getTime());
  end.setUTCMonth(end.getUTCMonth() + LAUNCH_PRO_PROMO_MONTHS);
  return end;
}

/** IVA rate applied on top of the plan price (the subscription is a taxed
 *  service of AdoptaFácil). TODO(client): confirmar con el contador. */
export const PLAN_IVA_RATE = 0.19;

/** Days a lapsed paid plan keeps working before falling back to `free`. */
export const PLAN_GRACE_DAYS = 15;

export const SUBSCRIPTION_STATUSES = ['trialing', 'active', 'past_due', 'canceled'] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

/** How the subscription is collected. `manual` = payment link/transfer to
 *  AdoptaFácil's own account + electronic invoice, activated by the platform.
 *  `epayco` = recurring charge with ePayco on AdoptaFácil's OWN merchant
 *  account (ADR-PAG-002): it is AdoptaFácil's revenue for the software, so it
 *  never touches a donation. */
export const BILLING_PROVIDERS = ['manual', 'epayco'] as const;
export type BillingProvider = (typeof BILLING_PROVIDERS)[number];

/** The stored subscription of one organization (at most one per org). */
export interface OrganizationSubscription {
  organizationId: string;
  plan: PlanKey;
  status: SubscriptionStatus;
  /** ISO-8601 UTC. End of the paid/trial period; `null` = open-ended. */
  currentPeriodEnd: string | null;
  provider: BillingProvider;
  /** Free-text reference of the payment (invoice number, transfer id). */
  providerReference: string | null;
  /** Founding-price discount for pilot shelters (0–100). */
  discountPercent: number;
  updatedAt: string;
}

/** `GET /org/plan` — what the organization's Owner/Administrator sees. */
export interface OrganizationPlanView {
  /** Whether plans are enforced at all (PLAN_ENFORCEMENT). When false every
   *  organization gets `pro` and nothing is charged. */
  enforced: boolean;
  /** The plan that is in effect right now (after expiry and grace rules). */
  effectivePlan: PlanKey;
  /** The stored subscription, or null when the org never had one (= free). */
  subscription: OrganizationSubscription | null;
  /** When the effective paid plan falls back to free if not renewed (ISO). */
  graceEndsAt: string | null;
  /** End of the launch promotion (Pro for free) while it applies to this org
   *  (no paid subscription yet), ISO-8601 UTC; absent/null otherwise. */
  launchPromoEndsAt?: string | null;
  limits: PlanLimits;
  capabilities: Record<PlanCapability, boolean>;
  /** `storageMb`: espacio usado en MB (redondeado hacia arriba), cuando el
   *  almacenamiento sabe medirlo. */
  usage: {
    members: number;
    storageMb?: number;
    /** Correos con la marca enviados este mes (UTC) y el tope del plan
     *  ({@link BRANDED_EMAIL_MONTHLY_LIMIT}); ausente si el plan no los incluye. */
    brandedEmails?: { sent: number; limit: number };
  };
  catalog: PlanDefinition[];
}

/** `PUT /platform/organizations/:id/plan` (PlatformAdmin/PlatformSuperAdmin):
 *  activate, extend or cancel an organization's plan after a manual payment. */
export interface AssignOrganizationPlanInput {
  plan: PlanKey;
  status: SubscriptionStatus;
  /** ISO-8601 date-time; required for every status but `canceled`. */
  currentPeriodEnd?: string | null;
  providerReference?: string | null;
  discountPercent?: number;
}

/** 403 body when a request needs a plan the organization does not have. */
export const PLAN_REQUIRED_CODE = 'PLAN_REQUIRED';
export interface PlanRequiredError {
  code: typeof PLAN_REQUIRED_CODE;
  capability?: PlanCapability;
  limit?: PlanLimit;
  requiredPlan: PlanKey;
  message: string;
}

/** Whether `plan` includes `capability`. */
export function planIncludes(plan: PlanKey, capability: PlanCapability): boolean {
  return PLAN_CATALOG[plan].capabilities[capability];
}

/** The cheapest plan that includes `capability`. */
export function minimumPlanFor(capability: PlanCapability): PlanKey {
  return PLAN_KEYS.find((key) => planIncludes(key, capability)) ?? 'pro';
}

/** The cheapest plan whose `limit` admits `needed` (null limit = unlimited). */
export function minimumPlanForLimit(limit: PlanLimit, needed: number): PlanKey {
  return (
    PLAN_KEYS.find((key) => {
      const max = PLAN_CATALOG[key].limits[limit];
      return max === null || needed <= max;
    }) ?? 'pro'
  );
}

/** Monthly price including IVA, rounded to whole pesos. */
export function priceWithIva(priceCop: number): number {
  return Math.round(priceCop * (1 + PLAN_IVA_RATE));
}

/** Last instant a lapsed paid plan still works. */
export function graceEnd(currentPeriodEnd: Date): Date {
  return new Date(currentPeriodEnd.getTime() + PLAN_GRACE_DAYS * 24 * 60 * 60 * 1000);
}

/**
 * The plan in effect for an organization at `now`:
 * - enforcement off → `pro` (nothing is gated);
 * - no subscription and the launch promotion still running (`promoEndsAt`) → `pro`;
 * - no subscription or `canceled` → `free`;
 * - otherwise the subscribed plan until `currentPeriodEnd` + grace days, then
 *   `free`. An open-ended period (`null`) never lapses.
 */
export function resolveEffectivePlan(
  subscription: Pick<OrganizationSubscription, 'plan' | 'status' | 'currentPeriodEnd'> | null,
  now: Date,
  enforced: boolean,
  promoEndsAt?: Date | null,
): PlanKey {
  if (!enforced) return 'pro';
  if (!subscription && promoEndsAt && now.getTime() <= promoEndsAt.getTime()) return 'pro';
  if (!subscription || subscription.status === 'canceled') return 'free';
  if (subscription.currentPeriodEnd === null) return subscription.plan;
  const end = new Date(subscription.currentPeriodEnd);
  return now.getTime() <= graceEnd(end).getTime() ? subscription.plan : 'free';
}
