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

import type { OrgThirdPartyConsentSummary } from './consents';
import type { LegalRepresentativeRole } from './org';

/** Estado de emisión de un reporte con firmas (ver `OrgReport.status`). */
export type OrgReportStatus = 'pending_signatures' | 'issued' | 'rejected';

export interface OrgReportApprovalInfo {
  role: LegalRepresentativeRole;
  decision: 'approved' | 'rejected';
  /** ISO-8601 UTC. */
  decidedAt: string;
}

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
   * Estado de emisión (aditivo): `issued` cuando están todas las aprobaciones
   * requeridas (o no se requiere ninguna); `pending_signatures` mientras falta
   * alguna; `rejected` si algún firmante lo rechazó. Un documento que no está
   * `issued` se descarga como BORRADOR, sin firmas y sin valor.
   */
  status?: OrgReportStatus;
  /** Decisiones ya registradas de los firmantes (aditivo). */
  approvals?: OrgReportApprovalInfo[];
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
  /** Política de firmas declarada por la organización (aditivo). */
  policies?: OrgReportPolicy[];
  /**
   * Cargo con el que la persona que consulta puede firmar: `legal_representative`
   * si es Owner, o el cargo de su designación vigente (aditivo).
   */
  mySignerRole?: LegalRepresentativeRole;
  /** false ⇒ los reportes salen sin firmas hasta que cada firmante apruebe. */
  signaturesEnabled?: boolean;
  /** Resumen de consentimientos de terceros (solo conteos, sin identidades). */
  thirdPartyConsent?: OrgThirdPartyConsentSummary;
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
  /** Estado de emisión (aditivo). */
  status?: OrgReportStatus;
  signers: Array<Pick<OrgReportSigner, 'role' | 'fullName'>>;
  rowCount: number;
  contentHash: string;
  createdAt: string;
}

// ----------------------------------------------------------------------------
// Firma con consentimiento: firmantes adicionales, política y decisión.
// ----------------------------------------------------------------------------

/** Cargos de firmante adicional que la organización puede vincular. */
export type AdditionalSignerRole = 'accountant' | 'fiscal_reviewer';

/** `POST /org/signers/invite` (solo Owner): invita por correo a un firmante. */
export interface InviteReportSignerInput {
  email: string;
  signerRole: AdditionalSignerRole;
}

/** Firmante adicional vinculado (o con invitación pendiente). */
export interface OrgSigner {
  id: string;
  role: AdditionalSignerRole;
  /** `invited` hasta que la persona acepta y crea su propia contraseña. */
  status: 'invited' | 'active' | 'revoked';
  email: string;
  displayName?: string;
  /** ISO-8601 UTC. */
  createdAt: string;
  revokedAt?: string;
}

/** Firmas que la organización declara exigidas por sus estatutos (por tipo). */
export interface OrgReportPolicy {
  kind: OrgReportKind;
  requiredRoles: LegalRepresentativeRole[];
}

/** `PUT /org/reports/policy` (solo Owner). El representante legal siempre firma. */
export type SetOrgReportPolicyInput = OrgReportPolicy;

/** `POST /org/reports/:id/decision` — solo el propio firmante. */
export interface DecideOrgReportInput {
  decision: 'approved' | 'rejected';
}

/** Documento por firmar en la bandeja del firmante. */
export interface OrgReportPendingSignature {
  report: OrgReport;
  /** Cargo con el que la persona debe firmar este documento. */
  role: LegalRepresentativeRole;
}

/** `POST /org/signers` (Owner): vincula al contador o revisor fiscal por su
 *  correo. No crea contraseña ni cuenta para iniciar sesión: cada documento le
 *  llega por correo con un enlace de un solo uso. Si ya hay alguien vigente en
 *  ese cargo, queda revocado (cambio de contador / revisor). */
export interface AddOrgSignerInput {
  email: string;
  fullName: string;
  role: AdditionalSignerRole;
  /** La organización declara que, según SUS estatutos, esta persona ocupa el
   *  cargo y está facultada para firmar. AdoptaFácil no lo valida: lo registra. */
  statutoryDeclaration: true;
}

/** Declaración de la organización al vincular un firmante (versionada: la
 *  versión y el texto quedan en la auditoría con fecha y usuario). */
export const SIGNER_DECLARATION_VERSION = '2026-10-31';
export const SIGNER_DECLARATION_TEXT =
  'Declaro, en nombre de la organización, que según nuestros estatutos esta persona ocupa ' +
  'el cargo indicado y está facultada para firmar nuestros documentos. La organización es ' +
  'responsable de esta designación; AdoptaFácil no verifica la facultad del firmante.';

/** Texto del consentimiento que acepta el firmante (versionado: la versión
 *  queda en la auditoría de cada aprobación). */
export const SIGNATURE_CONSENT_VERSION = '2026-10-30';
export const SIGNATURE_CONSENT_TEXT =
  'Autorizo que mi firma quede guardada cifrada en esta organización y que se estampe ' +
  'únicamente en los documentos que yo apruebe, uno por uno, desde el enlace que me llega ' +
  'por correo. Cada aprobación queda registrada con fecha, hora y la huella del documento.';

/** Lo que ve quien abre el enlace de firma (sin sesión). */
export interface SignatureRequestPreview {
  organizationName: string;
  role: AdditionalSignerRole | 'legal_representative';
  signerName: string;
  /** `true` la primera vez: aún no hay firma suya guardada en esta organización. */
  needsSignature: boolean;
  /** ISO-8601 UTC. */
  expiresAt: string;
  report: Pick<
    OrgReport,
    'kind' | 'code' | 'periodStart' | 'periodEnd' | 'legalEffect' | 'summary' | 'contentHash'
  >;
  consentText: string;
  consentVersion: string;
}

/** `POST /public/signature-requests/decision`. */
export interface DecideSignatureRequestInput {
  token: string;
  decision: 'approved' | 'rejected';
  /** Obligatorio para aprobar: acepta `consentText`. */
  consent?: boolean;
  /** Su número de documento: confirma que es la persona a quien se le pidió. */
  documentNumber: string;
  /** Solo la primera vez (`needsSignature`). */
  signature?: {
    fullName: string;
    documentType: 'cedula_ciudadania' | 'cedula_extranjeria' | 'pasaporte';
    position: string;
    signatureBase64: string;
    signatureContentType: string;
    /** `photo`: foto de la firma en papel blanco (se limpia el fondo). Por defecto `drawn`. */
    method?: 'drawn' | 'photo';
  };
}

export interface SignatureRequestDecisionResult {
  decision: 'approved' | 'rejected';
  /** Estado del documento después de tu decisión. */
  status: OrgReportStatus;
  code: string;
}
