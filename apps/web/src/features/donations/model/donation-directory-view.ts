import {
  FormalizationState,
  type DonorBenefit,
  type PublicDonationOrganization,
} from '@adoptafacil/contracts';

/**
 * Presentación del directorio "Quiero donar". El ORDEN lo decide la API
 * (`rankDirectory`); aquí solo se agrupa por lo que gana el donante, se filtra
 * y se escriben los textos. Nada de esto inventa datos legales: cada sello sale
 * de la matriz de capacidades (`donorBenefit`, `verified`).
 */

export type DirectoryGroupKey = 'tax' | 'accounting' | 'formal' | 'unavailable';

export interface DirectoryGroup {
  key: DirectoryGroupKey;
  title: string;
  description: string;
  items: PublicDonationOrganization[];
}

const GROUP_COPY: Record<DirectoryGroupKey, { title: string; description: string }> = {
  tax: {
    title: 'Con certificado de beneficio tributario',
    description:
      'Entidades sin ánimo de lucro con Régimen Tributario Especial vigente. Su certificado te sirve para descontar parte de tu donación en la declaración de renta.',
  },
  accounting: {
    title: 'Con certificado de donación',
    description:
      'Entidades sin ánimo de lucro formalizadas. Te entregan certificado de donación como soporte contable, sin descuento tributario.',
  },
  formal: {
    title: 'Organizaciones formalizadas',
    description:
      'Personas jurídicas con RUT y Cámara de Comercio revisados por AdoptaFácil. Recibes comprobante de tu donación.',
  },
  unavailable: {
    title: 'Aún no reciben donaciones en línea',
    description:
      'Todavía están formalizándose o conectando su cuenta de cobro. Puedes conocerlas y ayudarlas de otras formas desde su portal.',
  },
};

export function groupKeyOf(org: PublicDonationOrganization): DirectoryGroupKey {
  if (!org.canReceiveDonations) return 'unavailable';
  if (org.donorBenefit === 'tax_certificate') return 'tax';
  if (org.donorBenefit === 'accounting_certificate') return 'accounting';
  return 'formal';
}

const GROUP_ORDER: DirectoryGroupKey[] = ['tax', 'accounting', 'formal', 'unavailable'];

/** Agrupa conservando el orden de la API dentro de cada grupo; omite los vacíos. */
export function groupDirectory(items: readonly PublicDonationOrganization[]): DirectoryGroup[] {
  const buckets = new Map<DirectoryGroupKey, PublicDonationOrganization[]>();
  for (const org of items) {
    const key = groupKeyOf(org);
    buckets.set(key, [...(buckets.get(key) ?? []), org]);
  }
  return GROUP_ORDER.filter((key) => buckets.has(key)).map((key) => ({
    key,
    ...GROUP_COPY[key],
    items: buckets.get(key) ?? [],
  }));
}

function normalize(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

export interface DirectoryFilter {
  query: string;
  /** Solo organizaciones cuyo certificado da beneficio tributario. */
  taxOnly: boolean;
}

export function filterDirectory(
  items: readonly PublicDonationOrganization[],
  { query, taxOnly }: DirectoryFilter,
): PublicDonationOrganization[] {
  const q = normalize(query);
  return items.filter(
    (org) =>
      (!taxOnly || (org.canReceiveDonations && org.donorBenefit === 'tax_certificate')) &&
      (!q || normalize(`${org.name} ${org.city ?? ''}`).includes(q)),
  );
}

export interface BenefitSeal {
  tone: 'gold' | 'mint' | 'neutral';
  title: string;
  detail: string;
}

export const BENEFIT_SEALS: Record<DonorBenefit, BenefitSeal> = {
  tax_certificate: {
    tone: 'gold',
    title: 'Certificado con beneficio tributario',
    detail: 'Puedes descontar el 25 % de tu donación en tu renta (art. 257 ET).',
  },
  accounting_certificate: {
    tone: 'mint',
    title: 'Certificado de donación',
    detail: 'Soporte contable de tu aporte. No da descuento tributario.',
  },
  receipt: {
    tone: 'neutral',
    title: 'Comprobante de donación',
    detail: 'Recibes comprobante por correo. No sirve para beneficio tributario.',
  },
};

/** Nombre del nivel para el donante (mismos nombres que el panel de la organización). */
export const LEVEL_NAMES: Record<FormalizationState, string> = {
  [FormalizationState.Informal]: 'Informal',
  [FormalizationState.EnProceso]: 'En proceso',
  [FormalizationState.Formalizada]: 'Formalizada',
  [FormalizationState.ESAL]: 'ESAL',
  [FormalizationState.ESAL_RTE]: 'ESAL con RTE',
};

export function levelName(
  org: Pick<PublicDonationOrganization, 'formalizationState' | 'rteVigente'>,
): string {
  // Un RTE vencido no se presenta como vigente (la matriz la trata como ESAL).
  if (org.formalizationState === FormalizationState.ESAL_RTE && !org.rteVigente) {
    return 'ESAL (RTE por renovar)';
  }
  return LEVEL_NAMES[org.formalizationState];
}

export interface DiligenceChip {
  key: string;
  label: string;
}

/** Señales de diligencia visibles en la tarjeta (solo las que la organización cumple). */
export function diligenceChips(org: PublicDonationOrganization): DiligenceChip[] {
  const chips: DiligenceChip[] = [];
  if (org.verified) chips.push({ key: 'verified', label: 'Verificada' });
  if (org.signals.documentsUpToDate) chips.push({ key: 'docs', label: 'Documentos al día' });
  if (org.signals.publishesExpenses) chips.push({ key: 'ledger', label: 'Publica sus gastos' });
  if (org.signals.reviewCount > 0 && org.signals.reviewAverage !== undefined) {
    const avg = org.signals.reviewAverage.toLocaleString('es-CO', {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    });
    const n = org.signals.reviewCount;
    chips.push({ key: 'reviews', label: `★ ${avg} · ${n} ${n === 1 ? 'reseña' : 'reseñas'}` });
  }
  if (org.signals.activeCampaigns > 0) {
    const n = org.signals.activeCampaigns;
    chips.push({
      key: 'campaigns',
      label: `${n} ${n === 1 ? 'campaña activa' : 'campañas activas'}`,
    });
  }
  return chips;
}

/** `/donaciones?...` con la organización elegida (mismo formato que el portal). */
export function donateHrefFor(org: PublicDonationOrganization): string {
  const params = new URLSearchParams({ organizationId: org.id, organizationName: org.name });
  params.set('organizationSlug', org.slug);
  if (org.logoUrl) params.set('organizationLogoUrl', org.logoUrl);
  if (org.city) params.set('organizationCity', org.city);
  return `/donaciones?${params.toString()}`;
}

/** Iniciales para el avatar cuando la organización no tiene logo. */
export function initialsOf(name: string): string {
  const words = name
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 || /^\p{Lu}/u.test(w));
  const picked = (words.length >= 2 ? [words[0], words[words.length - 1]] : words.slice(0, 1))
    .map((w) => w?.[0] ?? '')
    .join('');
  return picked.toUpperCase() || '·';
}
