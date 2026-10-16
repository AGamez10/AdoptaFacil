import { z } from 'zod';

const purpose = z.literal('org_report_identification');

/** Cuerpo estricto: nada de campos extra (p. ej. un `subjectUserId` inyectado). */
export const grantConsentSchema = z
  .object({
    organizationId: z.string().uuid(),
    purpose,
    version: z.string().min(1).max(32),
  })
  .strict();

export const revokeConsentSchema = z
  .object({
    organizationId: z.string().uuid(),
    purpose,
  })
  .strict();
