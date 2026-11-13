import type { ServiceHours } from '@adoptafacil/contracts';
import {
  ServiceHoursStatus,
  VolunteerEnrollmentStatus,
  VolunteerOpportunityStatus,
} from '@adoptafacil/contracts';

/** Categoría es TEXTO LIBRE (RF18 no fija un catálogo cerrado, a diferencia
 *  de las campañas) — no hay un mapa de etiquetas que mantener aquí. */

export const OPPORTUNITY_STATUS_LABELS: Record<VolunteerOpportunityStatus, string> = {
  [VolunteerOpportunityStatus.Active]: 'Activa',
  [VolunteerOpportunityStatus.Closed]: 'Cerrada',
  [VolunteerOpportunityStatus.Cancelled]: 'Cancelada',
};

export function opportunityStatusVariant(
  status: VolunteerOpportunityStatus,
): 'success' | 'secondary' | 'destructive' {
  if (status === VolunteerOpportunityStatus.Cancelled) return 'destructive';
  return status === VolunteerOpportunityStatus.Active ? 'success' : 'secondary';
}

export const ENROLLMENT_STATUS_LABELS: Record<VolunteerEnrollmentStatus, string> = {
  [VolunteerEnrollmentStatus.Pending]: 'Pendiente',
  [VolunteerEnrollmentStatus.Accepted]: 'Aceptada',
  [VolunteerEnrollmentStatus.Rejected]: 'Rechazada',
  [VolunteerEnrollmentStatus.Completed]: 'Completada',
  [VolunteerEnrollmentStatus.Cancelled]: 'Jornada cancelada',
};

export function enrollmentStatusVariant(
  status: VolunteerEnrollmentStatus,
): 'success' | 'warning' | 'destructive' | 'secondary' {
  switch (status) {
    case VolunteerEnrollmentStatus.Pending:
      return 'warning';
    case VolunteerEnrollmentStatus.Accepted:
      return 'success';
    case VolunteerEnrollmentStatus.Rejected:
      return 'destructive';
    case VolunteerEnrollmentStatus.Completed:
    case VolunteerEnrollmentStatus.Cancelled:
      return 'secondary';
  }
}

export const HOURS_STATUS_LABELS: Record<ServiceHoursStatus, string> = {
  pending: 'Pendiente',
  approved: 'Aprobadas',
  rejected: 'Rechazadas',
};

export function hoursStatusVariant(
  status: ServiceHoursStatus,
): 'success' | 'warning' | 'destructive' {
  switch (status) {
    case 'pending':
      return 'warning';
    case 'approved':
      return 'success';
    case 'rejected':
      return 'destructive';
  }
}

/** Presenta un ISO-8601 UTC en hora Colombia (UTC en almacenamiento, CO en UI). */
export function formatBogota(isoUtc: string): string {
  const date = new Date(isoUtc);
  if (Number.isNaN(date.getTime())) return isoUtc;
  return new Intl.DateTimeFormat('es-CO', {
    timeZone: 'America/Bogota',
    dateStyle: 'medium',
  }).format(date);
}

/** "2.5 h" / "1 h" — nunca fabrica un plural incorrecto para 1. */
export function formatHours(hours: number): string {
  return `${hours} h`;
}

/**
 * Parsea las horas de una sesión: un número positivo, hasta 24h (mismo límite
 * que el backend, `service-hours.schemas.ts`), en cualquier otro caso `null`
 * (inválido) — para que el formulario valide exactamente lo mismo que la API,
 * en vez de reimplementar el chequeo con un criterio distinto.
 */
export function parseSessionHours(value: string): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 && parsed <= 24 ? parsed : null;
}

/**
 * Nuevo requerimiento (voluntariado): la organización solo puede emitir el
 * certificado cuando hay AL MENOS una hora registrada y NINGUNA sigue
 * `pending` — debe aprobar/rechazar todo primero. Mismo criterio que ya
 * aplica en el backend (`volunteer-certificate-eligibility.ts`), replicado
 * aquí para habilitar/deshabilitar el botón sin round-trip.
 */
export function canIssueCertificate(entries: ServiceHours[]): boolean {
  return entries.length > 0 && entries.every((entry) => entry.status !== 'pending');
}

/** Query de `/voluntariado` que señala una jornada concreta. */
export const OPPORTUNITY_QUERY_PARAM = 'oportunidad';

/** Enlace para inscribirse a una jornada desde fuera del panel (la landing).
 *  `/voluntariado` pide sesión y el inicio de sesión vuelve a esta misma ruta
 *  con su query intacta, así la jornada sigue señalada. */
export function volunteerSignupHref(id: string): string {
  return `/voluntariado?${OPPORTUNITY_QUERY_PARAM}=${encodeURIComponent(id)}`;
}

export interface HoursFormInput {
  /** Días en que se puede registrar; `null` = calendario libre (regla general). */
  allowedDays: string[] | null;
  date: string;
  hoursText: string;
  description: string;
}

/**
 * Valida el registro de horas y devuelve el PRIMER problema real, con su
 * propio mensaje (antes un único "Datos incompletos" tapaba la causa: p. ej.
 * que aún no había ningún día de jornada habilitado que ya hubiera ocurrido).
 */
export function hoursFormProblem(
  input: HoursFormInput,
): { title: string; description: string } | null {
  const { allowedDays, date, hoursText, description } = input;
  if (allowedDays !== null && allowedDays.length === 0) {
    return {
      title: 'Aún no puedes registrar horas',
      description:
        'Todavía no ha ocurrido ningún día de jornada habilitado. Podrás registrar tus horas el mismo día de la jornada o después.',
    };
  }
  if (!date) {
    return {
      title: 'Falta el día',
      description:
        allowedDays === null
          ? 'Elige la fecha de la sesión.'
          : 'Elige el día de la jornada en que trabajaste.',
    };
  }
  if (allowedDays !== null && !allowedDays.includes(date)) {
    return {
      title: 'Día no habilitado',
      description:
        'Solo puedes registrar horas en los días de jornada que habilitó la organización.',
    };
  }
  if (!hoursText.trim()) {
    return { title: 'Faltan las horas', description: 'Escribe cuántas horas trabajaste ese día.' };
  }
  if (parseSessionHours(hoursText) === null) {
    return {
      title: 'Horas no válidas',
      description:
        'Las horas deben ser un número mayor que 0 y de máximo 24 (por ejemplo 2 o 2.5).',
    };
  }
  if (!description.trim()) {
    return {
      title: 'Falta la descripción',
      description: 'Cuenta brevemente qué hiciste en la jornada.',
    };
  }
  return null;
}
