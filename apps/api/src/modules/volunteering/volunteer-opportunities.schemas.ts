import { z } from 'zod';
import {
  DATE_RULES,
  isCalendarDate,
  MAX_VOLUNTEER_SESSION_DATES,
  VolunteerOpportunityStatus,
} from '@adoptafacil/contracts';
import { ruledDate } from '../../core/validation/date-rules';

const startDate = ruledDate(DATE_RULES.opportunityStart);

/** Días de jornada habilitados para registrar horas (`AAAA-MM-DD`). Que caigan
 *  dentro de las fechas de la convocatoria lo revisa el servicio (al editar,
 *  las fechas pueden venir de lo ya guardado). */
const sessionDates = z
  .array(
    z
      .string()
      .refine(isCalendarDate, { message: 'Cada día de jornada debe ser una fecha válida.' }),
  )
  .max(MAX_VOLUNTEER_SESSION_DATES, 'Demasiados días de jornada.');
/** Al editar, el fin puede quedar en el pasado (cerrar una convocatoria vieja). */
const endDateOnUpdate = ruledDate({ ...DATE_RULES.opportunityEnd, notPast: false });

/** Publish an opportunity (Owner/Administrator). `.strict()` rejects unknown
 *  keys. `endDate` must be after `startDate` (enforced here, not just by DB
 *  column order). */
export const createVolunteerOpportunitySchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(5000).optional(),
    category: z.string().trim().min(1).max(100),
    startDate,
    endDate: ruledDate(DATE_RULES.opportunityEnd),
    capacity: z.number().int().positive().optional(),
    location: z.string().trim().min(1).max(300),
    requirements: z.string().trim().max(2000).optional(),
    appliesToStudentService: z.boolean().optional(),
    sessionDates: sessionDates.optional(),
  })
  .strict()
  .refine((value) => new Date(value.endDate).getTime() > new Date(value.startDate).getTime(), {
    message: 'La fecha de fin debe ser posterior a la fecha de inicio.',
    path: ['endDate'],
  });

/** Patch an opportunity. All fields optional; only provided fields change. */
export const updateVolunteerOpportunitySchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(5000).optional(),
    category: z.string().trim().min(1).max(100).optional(),
    startDate: startDate.optional(),
    endDate: endDateOnUpdate.optional(),
    capacity: z.number().int().positive().optional(),
    location: z.string().trim().min(1).max(300).optional(),
    requirements: z.string().trim().max(2000).optional(),
    // Cancelar tiene su propia acción (con motivo y aviso a los inscritos).
    status: z
      .enum([VolunteerOpportunityStatus.Active, VolunteerOpportunityStatus.Closed])
      .optional(),
    sessionDates: sessionDates.optional(),
    rescheduleReason: z.string().trim().max(500).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided.',
  });

/** Cancelar una jornada: el motivo es obligatorio (se envía a los inscritos). */
export const cancelVolunteerOpportunitySchema = z
  .object({
    reason: z
      .string({ message: 'Escribe el motivo de la cancelación.' })
      .trim()
      .min(5, 'Escribe el motivo de la cancelación (al menos 5 caracteres).')
      .max(500, 'El motivo puede tener hasta 500 caracteres.'),
  })
  .strict();
