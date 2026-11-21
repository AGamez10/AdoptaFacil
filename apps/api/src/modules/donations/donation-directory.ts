import {
  FORMALIZATION_SEQUENCE,
  FormalizationState,
  isCapabilityEnabled,
  OrganizationCapability,
  STATE_REQUIRED_DOCUMENTS,
  type DonorBenefit,
  type PublicDonationOrganization,
} from '@adoptafacil/contracts';

/** Fila cruda de `public_donation_directory(int)` (ver la migración). */
export interface RawDirectoryOrganization {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  city: string | null;
  formalizationState: string;
  rteVigente: boolean;
  mercadoPagoConnected: boolean;
  validDocumentTypes: string[];
  lastExpenseOn: string | null;
  reviewAverage: number | string | null;
  reviewCount: number | string;
  activeCampaigns: number | string;
}

/** Cómo cobra la plataforma hoy (misma regla que `getOrganizationAvailability`). */
export interface DirectoryPaymentMode {
  /** Driver `mercadopago`: hace falta la cuenta del refugio conectada. */
  mercadopago: boolean;
  /** Driver distinto de `fake`: sin cobrador no hay cobro. */
  requiresCollector: boolean;
}

/** Ventana de "publica en qué usa las donaciones": un gasto en los últimos 120 días. */
export const EXPENSE_WINDOW_DAYS = 120;

const FORMAL_STATES = new Set<FormalizationState>([
  FormalizationState.Formalizada,
  FormalizationState.ESAL,
  FormalizationState.ESAL_RTE,
]);

function asState(value: string): FormalizationState {
  return (FORMALIZATION_SEQUENCE as readonly string[]).includes(value)
    ? (value as FormalizationState)
    : FormalizationState.Informal;
}

/** Nivel efectivo: una ESAL con RTE vencido cuenta como ESAL (igual que la matriz). */
export function effectiveLevel(state: FormalizationState, rteVigente: boolean): number {
  const effective =
    state === FormalizationState.ESAL_RTE && !rteVigente ? FormalizationState.ESAL : state;
  return FORMALIZATION_SEQUENCE.indexOf(effective);
}

export function donorBenefitFor(state: FormalizationState, rteVigente: boolean): DonorBenefit {
  if (isCapabilityEnabled(OrganizationCapability.DonationTaxCertificate, state, rteVigente)) {
    return 'tax_certificate';
  }
  if (
    isCapabilityEnabled(OrganizationCapability.DonationAccountingCertificate, state, rteVigente)
  ) {
    return 'accounting_certificate';
  }
  return 'receipt';
}

function daysBetween(isoDate: string, now: Date): number {
  const then = Date.parse(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(then)) return Number.POSITIVE_INFINITY;
  return (now.getTime() - then) / 86_400_000;
}

export function toDirectoryOrganization(
  raw: RawDirectoryOrganization,
  mode: DirectoryPaymentMode,
  now: Date,
): PublicDonationOrganization {
  const state = asState(raw.formalizationState);
  const rteVigente = state === FormalizationState.ESAL_RTE && raw.rteVigente === true;
  const required = STATE_REQUIRED_DOCUMENTS[state];
  const valid = new Set(raw.validDocumentTypes ?? []);
  const reviewCount = Number(raw.reviewCount) || 0;
  const reviewAverage =
    reviewCount > 0 && raw.reviewAverage !== null ? Number(raw.reviewAverage) : undefined;
  // Misma regla que `getOrganizationAvailability`: aprobada (ya filtrado en
  // SQL) + persona jurídica + cobrador según el driver activo.
  const formal = FORMAL_STATES.has(state);
  const canReceiveDonations = !formal
    ? false
    : mode.mercadopago
      ? raw.mercadoPagoConnected === true
      : !mode.requiresCollector;
  return {
    id: raw.id,
    name: raw.name,
    slug: raw.slug,
    logoUrl: raw.logoUrl ?? undefined,
    city: raw.city ?? undefined,
    formalizationState: state,
    rteVigente,
    donorBenefit: donorBenefitFor(state, rteVigente),
    verified: isCapabilityEnabled(OrganizationCapability.VerifiedBadge, state, rteVigente),
    canReceiveDonations,
    signals: {
      documentsUpToDate: required.length > 0 && required.every((type) => valid.has(type)),
      publishesExpenses:
        raw.lastExpenseOn !== null && daysBetween(raw.lastExpenseOn, now) <= EXPENSE_WINDOW_DAYS,
      lastExpenseOn: raw.lastExpenseOn ?? undefined,
      reviewAverage,
      reviewCount,
      activeCampaigns: Number(raw.activeCampaigns) || 0,
    },
  };
}

/**
 * Puntaje de diligencia DENTRO de un mismo nivel de formalización. Solo usa
 * señales públicas y verificables; ninguna pesa más que subir de nivel.
 * - documentos al día: 3
 * - publica sus gastos (libro público reciente): 3
 * - reseñas: promedio bayesiano (prior 3,5 con peso 3) escalado a 0–2
 * - campañas activas: 1 (tiene en qué recibir ayuda concreta)
 */
export function diligenceScore(org: PublicDonationOrganization): number {
  const { signals } = org;
  const prior = 3.5;
  const weight = 3;
  const bayes =
    signals.reviewCount > 0 && signals.reviewAverage !== undefined
      ? (prior * weight + signals.reviewAverage * signals.reviewCount) /
        (weight + signals.reviewCount)
      : prior;
  // 1 → 0 puntos, 5 → 2 puntos (sin reseñas queda en el punto neutro).
  const reviews = ((bayes - 1) / 4) * 2;
  return (
    (signals.documentsUpToDate ? 3 : 0) +
    (signals.publishesExpenses ? 3 : 0) +
    reviews +
    (signals.activeCampaigns > 0 ? 1 : 0)
  );
}

/**
 * Orden del directorio: (1) puede recibir donaciones ahora, (2) nivel de
 * formalización efectivo, (3) diligencia, (4) nombre (estable).
 */
export function rankDirectory(
  items: readonly PublicDonationOrganization[],
): PublicDonationOrganization[] {
  const scored = items.map((org) => ({
    org,
    level: effectiveLevel(org.formalizationState, org.rteVigente),
    score: diligenceScore(org),
  }));
  scored.sort(
    (a, b) =>
      Number(b.org.canReceiveDonations) - Number(a.org.canReceiveDonations) ||
      b.level - a.level ||
      b.score - a.score ||
      a.org.name.localeCompare(b.org.name, 'es') ||
      a.org.id.localeCompare(b.org.id),
  );
  return scored.map(({ org }) => org);
}
