// Module: reports (M13 · reportes de la organización) — contrato aditivo.
//
// Reportes que el dueño de un refugio genera desde su panel con un clic:
//   - `donations`: informe de donaciones recibidas en un período.
//   - `social_service`: reporte de horas de voluntariado / servicio social
//     estudiantil (Resolución 4210 de 1996) en un período, para enviar a los
//     colegios.
// Cada reporte generado queda SELLADO (folio verificable + SHA-256 del
// contenido) y es inmutable; generarlo otra vez con los mismos datos devuelve
// el MISMO folio (idempotente), nunca un duplicado.

import type { LegalRepresentativeRole } from './org';

export type OrgReportKind = 'donations' | 'social_service';

/**
 * Qué valor tiene el documento según el nivel de formalidad de la
 * organización y las firmas registradas:
 *   - `informative`: comprobante informativo SIN efecto legal ni tributario
 *     (organización informal o en proceso, o sin firma del representante legal).
 *   - `signed`: firmado por el representante legal de una organización
 *     formalizada (constituida). Sirve como soporte de rendición de cuentas.
 *   - `certified`: solo para donaciones de una ESAL con RTE vigente, firmado
 *     por el representante legal Y por revisor fiscal o contador (art. 125-2
 *     del Estatuto Tributario exige la firma de uno de los dos).
 */
export type OrgReportLegalEffect = 'informative' | 'signed' | 'certified';

/** Filtros opcionales del reporte de servicio social. */
export interface SocialServiceReportFilters {
  /** Solo inscripciones marcadas como servicio social estudiantil. */
  studentServiceOnly?: boolean;
  /** Solo estudiantes de esta institución educativa (texto exacto). */
  schoolName?: string;
}

export interface GenerateOrgReportInput {
  kind: OrgReportKind;
  /** Fecha inicial INCLUSIVA, `YYYY-MM-DD`, en hora de Colombia. */
  periodStart: string;
  /** Fecha final INCLUSIVA, `YYYY-MM-DD`, en hora de Colombia. */
  periodEnd: string;
  /** Solo para `social_service`. */
  filters?: SocialServiceReportFilters;
  /**
   * Firmantes que deben aparecer en el documento, entre los que la
   * organización ya registró. Si se omite se aplica la política por defecto
   * (representante legal + revisor fiscal o, en su defecto, contador para
   * donaciones; representante legal para servicio social). TODO(client): los
   * estatutos de cada organización pueden exigir otros firmantes.
   */
  signerRoles?: LegalRepresentativeRole[];
}

/** Firmante sellado en el reporte (nunca la imagen ni el documento). */
export interface OrgReportSigner {
  role: LegalRepresentativeRole;
  fullName: string;
  position: string;
}

export interface OrgReportSummary {
  /** Filas del reporte (donaciones o inscripciones). */
  rowCount: number;
  /** Donaciones: total neto recibido (COP). Servicio social: no aplica. */
  netTotal?: number;
  /** Donaciones: total cobrado a los donantes (COP). */
  grossTotal?: number;
  /** Servicio social: horas aprobadas en el período. */
  approvedHours?: number;
  /** Servicio social: número de voluntarios / estudiantes. */
  volunteers?: number;
}

/** Un reporte generado (metadatos; el PDF y el Excel se descargan aparte). */
export interface OrgReport {
  id: string;
  organizationId: string;
  kind: OrgReportKind;
  /** Folio verificable públicamente, p. ej. `ADF-REP-2026-7K3QW9XM`. */
  code: string;
  periodStart: string;
  periodEnd: string;
  filters: SocialServiceReportFilters;
  legalEffect: OrgReportLegalEffect;
  signers: OrgReportSigner[];
  summary: OrgReportSummary;
  /** SHA-256 hex del contenido sellado. */
  contentHash: string;
  generatedByUserId: string;
  createdAt: string;
  /**
   * `true` cuando la generación reutilizó un reporte idéntico ya existente
   * (mismos datos ⇒ mismo folio). Solo viaja en la respuesta de `POST`.
   */
  reused?: boolean;
}

/** Estado de una firma para la pantalla de reportes. */
export interface OrgReportSignerReadiness {
  role: LegalRepresentativeRole;
  registered: boolean;
  fullName?: string;
  position?: string;
}

/**
 * Lo que la pantalla de reportes necesita para guiar al usuario ANTES de
 * generar: qué valor tendrá cada documento, qué firmas faltan y qué hacer.
 */
export interface OrgReportsReadiness {
  /** false ⇒ los reportes salen sin firmas hasta que cada firmante apruebe. */
  signaturesEnabled?: boolean;
  formalizationState: string;
  /** Valor que tendrá HOY un informe de donaciones con la política por defecto. */
  donationsLegalEffect: OrgReportLegalEffect;
  /** Valor que tendrá HOY un reporte de servicio social. */
  socialServiceLegalEffect: OrgReportLegalEffect;
  signers: OrgReportSignerReadiness[];
  /** Pasos concretos para subir de nivel (texto listo para mostrar). */
  nextSteps: string[];
  /** Instituciones educativas presentes en las inscripciones (para filtrar). */
  schools: string[];
  /** Mínimo de horas del servicio social estudiantil (80 por defecto). */
  studentServiceMinHours: number;
}

/** Verificación PÚBLICA de un reporte por folio — sin datos personales. */
export interface OrgReportVerification {
  code: string;
  kind: OrgReportKind;
  organizationName: string;
  periodStart: string;
  periodEnd: string;
  legalEffect: OrgReportLegalEffect;
  signers: Array<Pick<OrgReportSigner, 'role' | 'fullName'>>;
  rowCount: number;
  contentHash: string;
  createdAt: string;
}
