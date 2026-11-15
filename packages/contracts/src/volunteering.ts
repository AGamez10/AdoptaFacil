// Module: M08 volunteering · Contracts owner: @sebastian
//
// Volunteer opportunities + student social service (RF18/RF19, §10/§14 base
// document). An organization publishes opportunities; a Person (voluntario —
// same identity model as a sponsor/donor, cross-tenant, never an org member)
// enrolls, logs hours, and — once enough APPROVED hours accumulate — receives
// a certificate. All timestamps are ISO-8601 UTC (Colombia local time is a
// presentation concern only). Hours are fractional (e.g. 2.5) — not money, so
// the integer-COP convention does not apply here.

// `Paginated<T>` is already published (from `campaigns.ts`) and re-exported
// through the package barrel — consumers import it from `@adoptafacil/contracts`
// as usual; it is not redeclared here (a second declaration would collide at
// the barrel's `export *`, same reason `sponsorships.ts`/`org.ts` don't either).

// ============================================================================
// Volunteer opportunities (RF18)
// ============================================================================

/**
 * Lifecycle of an opportunity — CLOSED for now. `active` is the only state the
 * public listing ever shows. TODO(client): a richer lifecycle (draft, full)
 * is not defined by the base document; adding a value later is additive.
 */
export enum VolunteerOpportunityStatus {
  Active = 'active',
  Closed = 'closed',
  /** Cancelada por la organización (con motivo). Nunca se borra: sus
   *  inscripciones abiertas pasan a `cancelled` y cada persona recibe aviso.
   *  Solo se llega por `POST /volunteer-opportunities/:id/cancel`. */
  Cancelled = 'cancelled',
}

export interface VolunteerOpportunity {
  id: string;
  organizationId: string;
  title: string;
  description?: string;
  category: string;
  /** ISO-8601 UTC. */
  startDate: string;
  /** ISO-8601 UTC. */
  endDate: string;
  /** Cupo — max enrollments. `undefined` = no cap. */
  capacity?: number;
  location: string;
  requirements?: string;
  /** Whether this opportunity counts toward the mandatory student social
   *  service (RF19, Resolución 4210/1996 art. 6°) — set by the organization
   *  when publishing. Snapshotted onto each `VolunteerEnrollment` at signup
   *  time, so a later edit here never reclassifies an existing enrollment. */
  appliesToStudentService: boolean;
  status: VolunteerOpportunityStatus;
  /** Días de jornada que la organización habilita para registrar horas
   *  (`AAAA-MM-DD`, ordenados, todos dentro de `startDate`–`endDate`). Vacío o
   *  ausente = cualquier día de la convocatoria (convocatorias anteriores a
   *  esta regla). Ver {@link volunteerEnabledDays}. */
  sessionDates?: string[];
  /** ISO-8601 UTC. Solo en una jornada cancelada. */
  cancelledAt?: string;
  /** Motivo que la organización dio al cancelar (se avisó a los inscritos). */
  cancellationReason?: string;
  /** ISO-8601 UTC. */
  createdAt: string;
}

/** Public projection (portal, no session) — same fields, no internal id beyond
 *  the opportunity's own, plus the owning org's display name. */
export interface VolunteerOpportunityPublic {
  id: string;
  organizationId: string;
  organizationName: string;
  title: string;
  description?: string;
  category: string;
  startDate: string;
  endDate: string;
  capacity?: number;
  location: string;
  requirements?: string;
  appliesToStudentService: boolean;
  /** Ver {@link VolunteerOpportunity.sessionDates}. */
  sessionDates?: string[];
}

export interface CreateVolunteerOpportunityInput {
  title: string;
  description?: string;
  category: string;
  /** ISO-8601 UTC. */
  startDate: string;
  /** ISO-8601 UTC. */
  endDate: string;
  capacity?: number;
  location: string;
  requirements?: string;
  appliesToStudentService?: boolean;
  /** Días de jornada habilitados (`AAAA-MM-DD`), dentro de las fechas de la
   *  convocatoria. Ver {@link VolunteerOpportunity.sessionDates}. */
  sessionDates?: string[];
}

/** Patch an opportunity. All fields optional; only provided fields change. */
export interface UpdateVolunteerOpportunityInput {
  title?: string;
  description?: string;
  category?: string;
  startDate?: string;
  endDate?: string;
  capacity?: number;
  location?: string;
  requirements?: string;
  status?: VolunteerOpportunityStatus;
  /** Reemplaza la lista completa de días habilitados (`[]` = todos los días de
   *  la convocatoria). */
  sessionDates?: string[];
  /** Al REPROGRAMAR (cambian las fechas o los días de jornada): motivo opcional
   *  que va en el aviso a las personas inscritas. */
  rescheduleReason?: string;
}

/** Cancelar una jornada publicada. El motivo es obligatorio: se envía a cada
 *  persona con inscripción pendiente o aceptada. */
export interface CancelVolunteerOpportunityInput {
  reason: string;
}

/** Resultado de reprogramar o cancelar: a cuántas personas se avisó. */
export interface VolunteerOpportunityChangeResult {
  opportunity: VolunteerOpportunity;
  notifiedVolunteers: number;
}

// ============================================================================
// Enrollment (RF18) — a Person subscribes to an opportunity, cross-tenant
// (same technique as M07 sponsorships: the volunteer is never a member of the
// opportunity's organization).
// ============================================================================

/**
 * pending → accepted | rejected (organization decision); accepted → completed
 * (organization marks the engagement as finished). Terminal: rejected,
 * completed. Do NOT invent states outside RF18.
 */
export enum VolunteerEnrollmentStatus {
  Pending = 'pending',
  Accepted = 'accepted',
  Rejected = 'rejected',
  Completed = 'completed',
  /** La organización canceló la jornada (`rejectionReason` lleva el motivo). */
  Cancelled = 'cancelled',
}

export interface VolunteerEnrollment {
  id: string;
  organizationId: string;
  opportunityId: string;
  volunteerUserId: string;
  /** Snapshotted from `users` at enrollment time — the organization needs a
   *  name/contact to review who is applying (the volunteer is never one of
   *  its members, so a live join isn't possible without a cross-tenant
   *  lookup); same rationale as `AdoptionRequest.applicant`. */
  volunteerName: string;
  volunteerEmail: string;
  /** Snapshotted from the opportunity at enrollment time (see
   *  {@link VolunteerOpportunity.appliesToStudentService}). */
  appliesToStudentService: boolean;
  status: VolunteerEnrollmentStatus;
  /** Required when `status === 'rejected'`. */
  rejectionReason?: string;
  decidedByUserId?: string;
  /** ISO-8601 UTC. */
  decidedAt?: string;
  /** ISO-8601 UTC. */
  createdAt: string;

  // --- S-12 enrichment (FSD v3.5 Doc 8, additive) -----------------------------
  // Only meaningful when `appliesToStudentService` is true — captured at
  // enrollment (the volunteer's own identity context), not required upfront
  // (a minor may enroll before supplying guardian info); ISSUING a certificate
  // for a minor's student-service enrollment without guardian info is what
  // actually blocks (see VolunteerCertificatesService.issue).
  /** Declared by the volunteer at signup. */
  isMinor?: boolean;
  /** Required (enforced at certificate issuance, not at signup) when `isMinor`. */
  guardianName?: string;
  guardianDocument?: string;
  /** School the student attends, for the constancia (Doc 8). */
  schoolName?: string;
  /** Institutional agreement/convenio code with the school, if any. */
  schoolAgreementCode?: string;
}

/** "Mis inscripciones" projection (cross-tenant, by identity) — enriched with
 *  names a volunteer needs to recognize their own enrollment, resolved
 *  server-side (never trusted from the client). */
export interface VolunteerEnrollmentMine extends VolunteerEnrollment {
  organizationName: string;
  opportunityTitle: string;
  /** Fechas de la convocatoria y días habilitados, para que el voluntario solo
   *  elija días en los que puede registrar horas (la API aplica la misma regla). */
  opportunityStartDate?: string;
  opportunityEndDate?: string;
  sessionDates?: string[];
}

/** Enroll in an opportunity — any authenticated Person. The guardian/school
 *  fields only make sense when the opportunity `appliesToStudentService`; the
 *  frontend only asks for them in that case, but nothing here REQUIRES them —
 *  see {@link VolunteerEnrollment}'s enrichment doc comment for why. */
export interface CreateVolunteerEnrollmentInput {
  opportunityId: string;
  isMinor?: boolean;
  guardianName?: string;
  guardianDocument?: string;
  schoolName?: string;
  schoolAgreementCode?: string;
}

/** Owner/Administrator decision on a pending enrollment. `reason` is REQUIRED
 *  for `reject` (the API rejects with 400 otherwise) — same criterion as the
 *  platform document review queue. */
export type VolunteerEnrollmentDecision = 'accept' | 'reject';

export interface DecideVolunteerEnrollmentInput {
  decision: VolunteerEnrollmentDecision;
  reason?: string;
}

// ============================================================================
// Service hours (RF18/RF19) — logged by the volunteer against their OWN
// accepted enrollment; only APPROVED hours ever count as "horas efectivas".
// ============================================================================

export type ServiceHoursStatus = 'pending' | 'approved' | 'rejected';

export interface ServiceHours {
  id: string;
  organizationId: string;
  enrollmentId: string;
  volunteerUserId: string;
  /** ISO-8601 UTC — the date the session took place. */
  date: string;
  /** Fractional hours (e.g. 2.5), > 0. */
  hours: number;
  description: string;
  status: ServiceHoursStatus;
  /** Required when `status === 'rejected'`. */
  rejectionReason?: string;
  decidedByUserId?: string;
  /** ISO-8601 UTC. */
  decidedAt?: string;
  /** ISO-8601 UTC. */
  createdAt: string;
  /** Fotos de la jornada adjuntas a esta sesión (solo metadatos; los bytes se
   *  descargan por su propio endpoint). */
  photos?: ServiceHoursPhoto[];
}

/** Foto de la jornada que el voluntario adjunta a UNA sesión de horas. Privada:
 *  la ve la organización (y entra a su reporte), nunca el público. */
export interface ServiceHoursPhoto {
  id: string;
  serviceHoursId: string;
  contentType: string;
  sizeBytes: number;
  /** ISO-8601 UTC. */
  createdAt: string;
}

/** Máximo de fotos por sesión de horas. */
export const SERVICE_HOURS_MAX_PHOTOS = 4;

/** Máximo de días de jornada que una convocatoria puede habilitar. */
export const MAX_VOLUNTEER_SESSION_DATES = 366;

/**
 * Días en los que un voluntario puede registrar horas: los días de jornada que
 * habilitó la organización (o, si no habilitó ninguno, todos los de la
 * convocatoria), siempre dentro de `startDate`–`endDate` y nunca posteriores a
 * `today` (`AAAA-MM-DD`, hora de Colombia). La API aplica exactamente esta
 * regla en la base de datos (`create_service_hours`).
 */
export function volunteerEnabledDays(
  opportunity: { startDate: string; endDate: string; sessionDates?: string[] },
  today: string,
): string[] {
  const start = opportunity.startDate.slice(0, 10);
  const end = opportunity.endDate.slice(0, 10);
  const last = end < today ? end : today;
  if (opportunity.sessionDates && opportunity.sessionDates.length > 0) {
    return [...new Set(opportunity.sessionDates)]
      .filter((day) => day >= start && day <= last)
      .sort();
  }
  const days: string[] = [];
  const cursor = new Date(`${start}T00:00:00Z`);
  while (days.length <= MAX_VOLUNTEER_SESSION_DATES) {
    const day = cursor.toISOString().slice(0, 10);
    if (day > last) break;
    days.push(day);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

export interface LogServiceHoursInput {
  enrollmentId: string;
  /** ISO-8601 UTC. */
  date: string;
  /** Fractional hours, > 0. */
  hours: number;
  description: string;
}

export type ServiceHoursDecision = 'approve' | 'reject';

export interface DecideServiceHoursInput {
  decision: ServiceHoursDecision;
  reason?: string;
}

// ============================================================================
// Certificate (RF18/RF19) — issued explicitly by the organization for ONE
// enrollment, reflecting ONLY approved hours. Never auto-issued: the base
// document does not define a trigger for automatic issuance, and RF19's "no
// se certifican horas parciales" invariant means the org must consciously
// close the books on that enrollment's hours before issuing.
// ============================================================================

/**
 * Minimum effective hours for the student social service certificate (RF19,
 * Resolución 4210/1996 art. 6°). The base document fixes 80h as the legal
 * default, but a specific school/organization agreement could differ —
 * TODO(client): expose this as a per-organization override if that need
 * materializes; today it is a single server-side configurable default (see
 * `apps/api/src/modules/volunteering/student-service-hours.ts`), not a value
 * baked into this contract.
 */
export const DEFAULT_STUDENT_SERVICE_MIN_HOURS = 80;

/**
 * One day's session in the certificate's bitácora (FSD v3.5 Doc 8) — SNAPSHOTTED
 * at issuance from the enrollment's APPROVED `ServiceHours` rows (never a
 * separate capture: the task explicitly prefers deriving from data that
 * already exists over duplicating entry). `supervisorName` is resolved
 * server-side from the approving staff member's `decidedByUserId`; absent if
 * that lookup fails for any reason (never blocks issuance over a display detail).
 */
export interface VolunteerCertificateBitacoraEntry {
  /** ISO-8601 UTC. */
  date: string;
  hours: number;
  /** The session's own `ServiceHours.description`, doubling as "actividad". */
  description: string;
  supervisorName?: string;
}

export interface VolunteerCertificate {
  id: string;
  organizationId: string;
  enrollmentId: string;
  volunteerUserId: string;
  /** Snapshotted at issuance — never affected by a later name change. */
  volunteerName: string;
  organizationName: string;
  opportunityTitle: string;
  /** Sum of APPROVED hours at issuance time — never includes pending/rejected. */
  totalApprovedHours: number;
  /** ISO-8601 UTC — the opportunity's own date range. */
  periodStart: string;
  /** ISO-8601 UTC. */
  periodEnd: string;
  appliesToStudentService: boolean;
  issuedByUserId: string;
  /** ISO-8601 UTC. */
  issuedAt: string;

  // --- S-12 enrichment (FSD v3.5 Doc 8, additive) -----------------------------
  /** Snapshotted from the enrollment at issuance time — see
   *  {@link VolunteerEnrollment.guardianName}. Present only when the
   *  enrollment was a minor's student-service engagement. */
  guardianName?: string;
  guardianDocument?: string;
  schoolName?: string;
  schoolAgreementCode?: string;
  /** Day-by-day log of every APPROVED session, oldest first — see
   *  {@link VolunteerCertificateBitacoraEntry}. Empty array (never absent) when
   *  there are no approved sessions, though issuance itself already requires
   *  approved hours to exist. */
  bitacora: VolunteerCertificateBitacoraEntry[];
  /** Quién firmó por la organización AL EMITIR (congelado). Ausente solo en
   *  certificados emitidos antes de este control: esos se muestran sin firma. */
  signerFullName?: string;
  signerPosition?: string;
  /** true: ESAL formalizada, firma su representante legal. false: grupo
   *  informal o en proceso, firma su responsable. */
  signerIsLegalRepresentative?: boolean;
  /** Código público para verificar el certificado en `/verificar/<código>`. */
  verificationCode?: string;
}

// ============================================================================
// Certificado: código público, plantillas y verificación sin sesión.
// ============================================================================

/** Código público de un certificado de voluntariado: `VOL-XXXXXXXX-XXXXXXXX`. */
export const VOLUNTEER_CERTIFICATE_CODE_PATTERN = /^VOL-[0-9A-F]{8}-[0-9A-F]{8}$/;

export function isVolunteerCertificateCode(value: string): boolean {
  return VOLUNTEER_CERTIFICATE_CODE_PATTERN.test(value.trim().toUpperCase());
}

/** Diseños del PDF del certificado. El contenido y los datos verificables son
 *  los mismos; cambia solo la presentación. */
export const VOLUNTEER_CERTIFICATE_TEMPLATES = ['huellitas', 'clasica'] as const;
export type VolunteerCertificateTemplate = (typeof VOLUNTEER_CERTIFICATE_TEMPLATES)[number];
export const DEFAULT_VOLUNTEER_CERTIFICATE_TEMPLATE: VolunteerCertificateTemplate = 'huellitas';

export const VOLUNTEER_CERTIFICATE_TEMPLATE_LABELS: Record<VolunteerCertificateTemplate, string> = {
  huellitas: 'Huellitas (cálida, con colores de refugio)',
  clasica: 'Clásica (formal, para colegios y empresas)',
};

/** Lo que cualquiera ve al verificar un certificado por su código (sin
 *  sesión). Solo lo que ya está impreso en el documento: nunca correo,
 *  documento de identidad ni datos del acudiente. */
export interface VolunteerCertificateVerification {
  verificationCode: string;
  volunteerName: string;
  organizationName: string;
  opportunityTitle: string;
  totalApprovedHours: number;
  /** Número de sesiones aprobadas en la bitácora. */
  sessions: number;
  /** ISO-8601 UTC. */
  periodStart: string;
  /** ISO-8601 UTC. */
  periodEnd: string;
  /** ISO-8601 UTC. */
  issuedAt: string;
  appliesToStudentService: boolean;
  schoolName?: string;
  signerFullName?: string;
  signerPosition?: string;
  signerIsLegalRepresentative?: boolean;
}
