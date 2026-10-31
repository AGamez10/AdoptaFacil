import { DATE_RULES, MAX_SERVICE_HOURS_PER_DAY } from '@adoptafacil/contracts';
import { z } from 'zod';
import { ruledDate } from '../../core/validation/date-rules';

/** Log a service-hours session against the caller's OWN accepted enrollment.
 *  `hours` is fractional (e.g. 2.5), POSITIVE — never money, so no
 *  integer-only rule applies here. */
export const logServiceHoursSchema = z
  .object({
    enrollmentId: z.string().guid(),
    date: ruledDate(DATE_RULES.serviceHoursDate),
    hours: z
      .number({ message: 'Las horas deben ser un número.' })
      .positive('Las horas deben ser más de 0.')
      .max(MAX_SERVICE_HOURS_PER_DAY, 'Una sesión no puede superar 24 horas.'),
    description: z.string().trim().min(1).max(1000),
  })
  .strict();

/** Owner/Administrator decision on a pending hours entry. `reason` is
 *  REQUIRED for `reject`. */
export const decideServiceHoursSchema = z
  .object({
    decision: z.enum(['approve', 'reject']),
    reason: z.string().trim().min(1).max(2000).optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.decision === 'approve' || (value.reason !== undefined && value.reason.length > 0),
    { message: 'A reason is required to reject a service-hours entry.', path: ['reason'] },
  );
