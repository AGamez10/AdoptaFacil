// ============================================================================
// Funciones por estado formal + verificación automática de documentos (M01).
// Contrato aditivo: no cambia ninguna forma publicada. La matriz vive aquí
// (no en la API) para que la web muestre lo mismo que la API exige.
// Fundamento y puntos para abogado/contador: docs/legal/estados-formales-y-funciones.md
// ============================================================================

import { DocumentType, FormalizationState, FORMALIZATION_SEQUENCE } from './org';

/**
 * Funciones de la organización cuyo permiso depende de su estado formal ante
 * la ley colombiana. Valores estables: no renombrar.
 */
export enum OrganizationCapability {
  /** Portal público, fichas de animales y catálogo. */
  PublicPortal = 'public_portal',
  /** Proceso de adopción con contrato firmado entre las partes. */
  AdoptionContracts = 'adoption_contracts',
  /** Recibir donaciones en dinero en la cuenta propia de la organización. */
  ReceiveDonations = 'receive_donations',
  /** Campañas de recaudo con meta pública. */
  FundraisingCampaigns = 'fundraising_campaigns',
  /** Apadrinamientos (aportes recurrentes). */
  Sponsorships = 'sponsorships',
  /** Comprobante de donación SIN efecto legal ni tributario. */
  DonationReceipt = 'donation_receipt',
  /** Certificado de donación como soporte contable, SIN descuento tributario. */
  DonationAccountingCertificate = 'donation_accounting_certificate',
  /** Certificado de donación CON efecto tributario (arts. 125-3 y 257 ET). */
  DonationTaxCertificate = 'donation_tax_certificate',
  /** Constancia de horas de voluntariado (sin efecto legal). */
  VolunteerConstancy = 'volunteer_constancy',
  /** Vender productos en la tienda. */
  MarketplaceSales = 'marketplace_sales',
  /** Sello "Verificada" y NIT visibles en el portal. */
  VerifiedBadge = 'verified_badge',
}

/** Alcance legal de lo que la función produce, para decirlo sin letra pequeña. */
export type CapabilityLegalEffect = 'none' | 'accounting' | 'tax';

/** Quién debe validar la regla antes del lanzamiento con dinero real. */
export type CapabilityReviewer = 'abogado' | 'contador';

export interface CapabilityRule {
  capability: OrganizationCapability;
  /** Primer estado que la habilita (y todos los superiores). */
  minState: FormalizationState;
  /** Si existe, último estado en que aplica (p. ej. el soporte contable sin
   *  descuento lo reemplaza el certificado tributario en ESAL_RTE). */
  maxState?: FormalizationState;
  legalEffect: CapabilityLegalEffect;
  /** Texto corto para la organización: qué es y por qué ese estado. */
  description: string;
  /** Fundamento citado (artículo/norma). */
  basis: string;
  /** Revisión profesional pendiente: TODO(client) hasta que la firmen. */
  pendingReview: CapabilityReviewer[];
}

const S = FormalizationState;
const C = OrganizationCapability;

/**
 * Matriz estado → funciones. Fuente única; la API la aplica y la web la muestra.
 * TODO(client): validada por abogado y contador antes de recaudar dinero real
 * (ver `pendingReview` de cada regla).
 */
export const CAPABILITY_RULES: readonly CapabilityRule[] = [
  {
    capability: C.PublicPortal,
    minState: S.Informal,
    legalEffect: 'none',
    description: 'Portal público, fichas de animales y solicitudes de adopción.',
    basis: 'Sin requisito legal de forma; la plataforma aprueba la cuenta.',
    pendingReview: [],
  },
  {
    capability: C.AdoptionContracts,
    minState: S.Informal,
    legalEffect: 'none',
    description:
      'Contrato de adopción. Si la organización es informal lo firma la persona responsable a su nombre.',
    basis: 'Contrato entre particulares (Código Civil, arts. 1495 y 1502).',
    pendingReview: ['abogado'],
  },
  {
    capability: C.ReceiveDonations,
    minState: S.Informal,
    legalEffect: 'none',
    description:
      'Recibir donaciones en la cuenta propia. Si es informal, el dinero llega a la persona responsable.',
    basis:
      'Decisión de producto: los informales sí recaudan. Para una persona natural la donación es ingreso propio (ET art. 302).',
    pendingReview: ['abogado', 'contador'],
  },
  {
    capability: C.FundraisingCampaigns,
    minState: S.Informal,
    legalEffect: 'none',
    description: 'Campañas con meta pública y avance visible.',
    basis: 'Igual que recibir donaciones; transparencia del avance en el portal.',
    pendingReview: ['abogado'],
  },
  {
    capability: C.Sponsorships,
    minState: S.Informal,
    legalEffect: 'none',
    description: 'Apadrinamientos con aporte recurrente.',
    basis: 'Igual que recibir donaciones.',
    pendingReview: ['abogado'],
  },
  {
    capability: C.DonationReceipt,
    minState: S.Informal,
    legalEffect: 'none',
    description:
      'Comprobante de donación que dice expresamente que no sirve para beneficio tributario.',
    basis: 'Constancia privada; no es el certificado del art. 125-3 ET.',
    pendingReview: ['abogado'],
  },
  {
    capability: C.VolunteerConstancy,
    minState: S.Informal,
    legalEffect: 'none',
    description: 'Constancia de horas de voluntariado.',
    basis: 'Constancia privada (Ley 720 de 2001 reconoce el voluntariado).',
    pendingReview: ['abogado'],
  },
  {
    capability: C.VerifiedBadge,
    minState: S.Formalizada,
    legalEffect: 'none',
    description: 'Sello "Verificada" y NIT visibles en el portal.',
    basis: 'RUT y certificado de Cámara de Comercio revisados por la plataforma.',
    pendingReview: [],
  },
  {
    capability: C.MarketplaceSales,
    minState: S.Formalizada,
    legalEffect: 'accounting',
    description: 'Vender productos en la tienda.',
    basis: 'Quien vende de forma habitual debe tener RUT y facturar (ET arts. 555-2 y 615).',
    pendingReview: ['contador'],
  },
  {
    capability: C.DonationAccountingCertificate,
    minState: S.ESAL,
    maxState: S.ESAL,
    legalEffect: 'accounting',
    description:
      'Certificado de donación como soporte contable. No da descuento tributario porque la ESAL no está en el RTE.',
    basis: 'El descuento del art. 257 ET exige entidad calificada en el RTE.',
    pendingReview: ['contador'],
  },
  {
    capability: C.DonationTaxCertificate,
    minState: S.ESAL_RTE,
    legalEffect: 'tax',
    description:
      'Certificado de donación con efecto tributario: el donante puede descontar el 25 % en su renta.',
    basis:
      'ET arts. 125-1, 125-2, 125-3 y 257; DUR 1625 de 2016 art. 1.2.1.4.3 (firma de contador o revisor fiscal).',
    pendingReview: ['contador'],
  },
];

/** Documentos que la plataforma debe tener APROBADOS para reconocer cada estado.
 *  Igual al bloqueo de la API (`TRANSITION_REQUIREMENTS` y
 *  `PLATFORM_TRANSITION_EVIDENCE`). La cédula del representante legal se pide,
 *  pero no bloquea. TODO(client): confirmar con abogado. */
export const STATE_REQUIRED_DOCUMENTS: Readonly<
  Record<FormalizationState, readonly DocumentType[]>
> = {
  [S.Informal]: [],
  [S.EnProceso]: [],
  [S.Formalizada]: [DocumentType.Rut, DocumentType.ExistenceRepresentationCertificate],
  [S.ESAL]: [DocumentType.ExistenceRepresentationCertificate],
  [S.ESAL_RTE]: [DocumentType.Rut],
};

export interface CapabilityDecision {
  capability: OrganizationCapability;
  enabled: boolean;
  legalEffect: CapabilityLegalEffect;
  description: string;
  basis: string;
  /** Estado desde el que se habilita (para "lo desbloqueas en…"). */
  unlocksAt: FormalizationState;
  pendingReview: CapabilityReviewer[];
}

/** `GET /org/capabilities`: lo que la organización puede hacer hoy y lo que
 *  desbloquea en el siguiente estado. */
export interface OrganizationCapabilities {
  state: FormalizationState;
  rteVigente: boolean;
  capabilities: CapabilityDecision[];
  next?: {
    state: FormalizationState;
    unlocks: OrganizationCapability[];
    requiredDocuments: DocumentType[];
  };
}

function rank(state: FormalizationState): number {
  return FORMALIZATION_SEQUENCE.indexOf(state);
}

/**
 * ¿Está habilitada la función para este estado? ESAL_RTE solo cuenta si el RTE
 * está vigente: si la ESAL no actualizó su registro, se trata como ESAL.
 */
export function isCapabilityEnabled(
  capability: OrganizationCapability,
  state: FormalizationState,
  rteVigente: boolean,
): boolean {
  const rule = CAPABILITY_RULES.find((r) => r.capability === capability);
  if (!rule) return false; // deny-by-default
  const effective = state === S.ESAL_RTE && !rteVigente ? S.ESAL : state;
  const current = rank(effective);
  if (current < 0) return false;
  if (current < rank(rule.minState)) return false;
  if (rule.maxState !== undefined && current > rank(rule.maxState)) return false;
  return true;
}

/** Proyección completa para la organización. */
export function computeOrganizationCapabilities(
  state: FormalizationState,
  rteVigente: boolean,
): OrganizationCapabilities {
  const capabilities = CAPABILITY_RULES.map((rule) => ({
    capability: rule.capability,
    enabled: isCapabilityEnabled(rule.capability, state, rteVigente),
    legalEffect: rule.legalEffect,
    description: rule.description,
    basis: rule.basis,
    unlocksAt: rule.minState,
    pendingReview: [...rule.pendingReview],
  }));
  const nextState = FORMALIZATION_SEQUENCE[rank(state) + 1];
  if (!nextState) return { state, rteVigente, capabilities };
  const unlocks = CAPABILITY_RULES.filter(
    (rule) =>
      !isCapabilityEnabled(rule.capability, state, rteVigente) &&
      isCapabilityEnabled(rule.capability, nextState, true),
  ).map((rule) => rule.capability);
  return {
    state,
    rteVigente,
    capabilities,
    next: {
      state: nextState,
      unlocks,
      requiredDocuments: [...STATE_REQUIRED_DOCUMENTS[nextState]],
    },
  };
}

/** 403 cuando una acción exige un estado formal que la organización aún no
 *  tiene. La web lo reconoce por `code` y ofrece el camino para avanzar. */
export const FORMALIZATION_REQUIRED_CODE = 'FORMALIZATION_REQUIRED';
export interface FormalizationRequiredError {
  code: typeof FORMALIZATION_REQUIRED_CODE;
  capability: OrganizationCapability;
  /** Estado actual de la organización. */
  currentState: FormalizationState;
  /** Primer estado que habilita la función. */
  requiredState: FormalizationState;
  /** Documentos que la plataforma debe aprobar para llegar a ese estado. */
  requiredDocuments: DocumentType[];
  message: string;
}

const STATE_DISPLAY: Record<FormalizationState, string> = {
  [S.Informal]: 'Informal',
  [S.EnProceso]: 'En proceso',
  [S.Formalizada]: 'Formalizada',
  [S.ESAL]: 'ESAL',
  [S.ESAL_RTE]: 'ESAL con RTE',
};

/** Cuerpo del 403 `FORMALIZATION_REQUIRED` para una función bloqueada: el
 *  mismo texto en la API y en la web. */
export function formalizationRequiredError(
  capability: OrganizationCapability,
  currentState: FormalizationState,
): FormalizationRequiredError {
  const rule = CAPABILITY_RULES.find((r) => r.capability === capability);
  const requiredState = rule?.minState ?? S.ESAL_RTE;
  return {
    code: FORMALIZATION_REQUIRED_CODE,
    capability,
    currentState,
    requiredState,
    requiredDocuments: [...STATE_REQUIRED_DOCUMENTS[requiredState]],
    message:
      `Esta función se desbloquea cuando tu organización avance a ${STATE_DISPLAY[requiredState]}. ` +
      'Sube tus documentos en Documentos y el equipo de AdoptaFácil los revisa.',
  };
}

// ============================================================================
// Verificación automática de documentos (lectura en el servidor + chequeos).
// La máquina propone; una persona de plataforma decide. Nunca aprueba sola.
// ============================================================================

export type VerificationCheckResult = 'pass' | 'warn' | 'fail' | 'unknown';

export interface ExtractedDocumentField {
  key: string;
  label: string;
  value: string;
}

export interface DocumentVerificationCheck {
  id: string;
  label: string;
  result: VerificationCheckResult;
  detail: string;
}

/** Qué se le sugiere al revisor. `manual` = no se pudo leer el archivo. */
export type DocumentVerificationSuggestion = 'approve' | 'observe' | 'manual';

/** Enlaces oficiales para confirmar a mano lo que la lectura no puede probar. */
export interface OfficialLookupLink {
  label: string;
  url: string;
}

/** `GET /platform/documents/:id/verification`. */
export interface DocumentVerificationReport {
  documentId: string;
  organizationId: string;
  type: DocumentType;
  /** `pdf_text` = texto del PDF leído en el servidor; `none` = no legible
   *  (escaneo o imagen): revisión manual. */
  method: 'pdf_text' | 'none';
  fields: ExtractedDocumentField[];
  checks: DocumentVerificationCheck[];
  suggestion: DocumentVerificationSuggestion;
  /** Motivo prellenado para observar, listo para enviar a la organización. */
  suggestedNote?: string;
  /** Estado formal que el documento respaldaría al aprobarse, si es superior
   *  al actual (p. ej. RUT con responsabilidad 04 → ESAL_RTE). */
  suggestedState?: FormalizationState;
  /** Estado formal actual de la organización, para ofrecer solo el paso siguiente. */
  currentState?: FormalizationState;
  links: OfficialLookupLink[];
}

/** `GET /org/documents/:id/prefill`: datos leídos del RUT o del certificado de
 *  Cámara que la organización subió, para llenar su perfil con un clic. La
 *  plataforma no guarda nada aquí: la organización decide si los usa. */
export interface DocumentPrefill {
  documentId: string;
  /** `false` si el archivo no tiene texto legible (escaneo o foto). */
  readable: boolean;
  /** "900123456-8", solo si el dígito de verificación es correcto. */
  nit?: string;
  legalName?: string;
}
