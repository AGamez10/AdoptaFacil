// Module: M11 community · Negocios aliados
//
// Un negocio del ecosistema animal (veterinaria, peluquería, paseador, tienda)
// se vuelve ALIADO de la causa, no solo una vitrina:
//   - activa su PANEL DE NEGOCIO (cuenta de persona marcada como negocio, con
//     menú propio) y, si quiere, autoriza recibir ofertas comerciales de
//     AdoptaFácil (Ley 1581: autorización aparte y revocable);
//   - publica BENEFICIOS para quien adopta (moderados como los perfiles);
//   - acumula IMPACTO comprobable: aportes entregados a refugios por el Banco
//     de recursos y adoptantes que usaron su beneficio;
//   - recorre el CAMINO AL SELLO "Aliado de AdoptaFácil", que otorga la
//     plataforma cuando se cumplen los requisitos. El sello nunca se compra.
//
// Privacidad: el negocio nunca ve quién adoptó. Quien adopta muestra un código
// de 8 caracteres; al canjearlo el negocio solo sabe el beneficio, el nombre
// del animal y el mes de la adopción.

import type { ServiceCategory } from './community-directory';

/** Versión del texto de la autorización comercial que la persona aceptó. */
export const BUSINESS_COMMERCIAL_CONSENT_VERSION = '2026-11-23' as const;

/** Texto de la autorización comercial (se guarda su versión con la fecha). */
export const BUSINESS_COMMERCIAL_CONSENT_TEXT =
  'Autorizo a AdoptaFácil a enviarme por correo información sobre productos y servicios para mi negocio. Es opcional y puedo retirarla cuando quiera desde mi panel.';

/** Máximo de beneficios vigentes o en revisión por negocio. */
export const BUSINESS_MAX_BENEFITS = 3 as const;

export interface BusinessAccount {
  commercialConsent: boolean;
  commercialConsentAt?: string;
  createdAt: string;
}

export interface ActivateBusinessAccountInput {
  /** Autorización OPCIONAL para ofertas comerciales de AdoptaFácil. */
  commercialConsent: boolean;
}

export interface UpdateBusinessConsentInput {
  commercialConsent: boolean;
}

/** Impacto comprobable del negocio (lo confirman otros, no el negocio). */
export interface BusinessImpact {
  /** Aportes al Banco de recursos que la organización marcó como entregados. */
  contributionsDelivered: number;
  /** Organizaciones distintas que recibieron esos aportes. */
  sheltersSupported: number;
  /** Personas que adoptaron y usaron un beneficio del negocio. */
  adoptersBenefited: number;
  /** Beneficios publicados y vigentes hoy. */
  liveBenefits: number;
  /** Personas que guardaron un pase (solo el negocio y la plataforma lo ven). */
  passesIssued?: number;
}

/** Un paso del camino al sello "Aliado de AdoptaFácil". */
export interface AllyStep {
  key: 'profile_approved' | 'first_contribution' | 'benefit_live';
  done: boolean;
}

export interface AllyProgress {
  steps: AllyStep[];
  /** Cumple los requisitos: perfil aprobado + un aporte entregado o un beneficio vigente. */
  eligible: boolean;
  /** Ya tiene el sello (lo otorga la plataforma). */
  isAlly: boolean;
}

/** Lo que trae el panel del negocio en una sola llamada. */
export interface BusinessOverview {
  /** `null` si la cuenta todavía no activó su panel de negocio. */
  account: BusinessAccount | null;
  impact: BusinessImpact;
  ally: AllyProgress;
}

export enum BusinessBenefitStatus {
  Pending = 'pending',
  Approved = 'approved',
  Rejected = 'rejected',
  Hidden = 'hidden',
}

export interface BusinessBenefitInput {
  listingId: string;
  /** Ej.: "Primera consulta gratis para animales adoptados". 4–80. */
  title: string;
  description?: string;
  /** Condiciones: horarios, sedes, si aplica a una sola visita, etc. */
  terms?: string;
  /** Último día de vigencia (`YYYY-MM-DD`, hora Colombia). */
  validUntil?: string;
}

export type CreateBusinessBenefitInput = BusinessBenefitInput;

export interface UpdateBusinessBenefitInput {
  title?: string;
  description?: string | null;
  terms?: string | null;
  validUntil?: string | null;
  /** Pausar o reanudar (no vuelve a revisión). */
  active?: boolean;
}

/** Beneficio visto por su negocio. */
export interface BusinessBenefit {
  id: string;
  listingId: string;
  title: string;
  description?: string;
  terms?: string;
  validUntil?: string;
  active: boolean;
  status: BusinessBenefitStatus;
  moderationReason?: string;
  createdAt: string;
  updatedAt: string;
}

/** Beneficio en público (solo aprobados, activos y vigentes). */
export interface BusinessBenefitPublic {
  id: string;
  listingId: string;
  title: string;
  description?: string;
  terms?: string;
  validUntil?: string;
}

/** Beneficio en la vitrina para quien adopta, con su negocio. */
export interface AdopterBenefitListing extends BusinessBenefitPublic {
  listingName: string;
  listingCategory: ServiceCategory;
  listingCity: string;
  listingDepartment: string;
  listingIsPartner: boolean;
}

export interface AdopterBenefitsPage {
  items: AdopterBenefitListing[];
  total: number;
  limit: number;
  offset: number;
}

export type BenefitPassStatus = 'issued' | 'redeemed';

/** Pase de quien adoptó: el código que muestra en el negocio. */
export interface BenefitPass {
  id: string;
  code: string;
  status: BenefitPassStatus;
  issuedAt: string;
  redeemedAt?: string;
  benefit: BusinessBenefitPublic;
  /** El beneficio sigue vigente (si no, el pase ya no se puede usar). */
  benefitLive: boolean;
  listingName: string;
  listingCategory: ServiceCategory;
  listingCity: string;
  listingAddress?: string;
  listingWhatsapp?: string;
  listingPhone?: string;
}

/** Lo que ve quien adopta en "Beneficios por adoptar". */
export interface AdopterBenefitStatus {
  /** Tiene al menos una adopción confirmada (entrega firmada). */
  eligible: boolean;
  /** Nombres de los animales adoptados (más reciente primero). */
  adoptedAnimals: string[];
  passes: BenefitPass[];
}

export interface RedeemBenefitPassInput {
  code: string;
}

/** Resultado de validar un código en el negocio. Sin datos de quien adoptó. */
export interface BenefitRedemption {
  result: 'redeemed' | 'already_redeemed';
  benefitTitle: string;
  animalName: string;
  /** `YYYY-MM` de la adopción (hora Colombia). */
  adoptedMonth: string;
  redeemedAt: string;
}

/** Canje en el historial del negocio. */
export interface BenefitRedemptionRecord {
  id: string;
  benefitTitle: string;
  animalName: string;
  redeemedAt: string;
}

/** Beneficio en la cola de moderación de la plataforma. */
export interface BusinessBenefitQueueItem extends BusinessBenefitPublic {
  listingName: string;
  listingCity: string;
  active: boolean;
  status: BusinessBenefitStatus;
  moderationReason?: string;
  updatedAt: string;
}

export interface BusinessBenefitsQueuePage {
  items: BusinessBenefitQueueItem[];
  total: number;
  limit: number;
  offset: number;
}

export interface ModerateBusinessBenefitInput {
  decision: 'approve' | 'reject' | 'hide';
  reason?: string;
}

/** Alfabeto de los códigos de pase: sin 0/O, 1/I/L para dictarlos sin error. */
export const BENEFIT_PASS_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ' as const;

/** Normaliza lo que escribe el negocio: mayúsculas, sin espacios ni guiones. */
export function normalizeBenefitPassCode(raw: string): string {
  return raw.toUpperCase().replace(/[^0-9A-Z]/g, '');
}

/** Formato para mostrar: `XXXX-XXXX`. */
export function formatBenefitPassCode(code: string): string {
  const clean = normalizeBenefitPassCode(code);
  return clean.length === 8 ? `${clean.slice(0, 4)}-${clean.slice(4)}` : clean;
}
