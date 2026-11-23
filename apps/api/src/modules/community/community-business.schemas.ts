import { z } from 'zod';

/** Validación de Negocios aliados. `.strict()` rechaza llaves desconocidas:
 *  nunca se aceptan `status` ni columnas de moderación desde el cliente. */

const optionalText = (max: number) => z.string().trim().min(1).max(max).optional();
const nullableText = (max: number) => z.string().trim().min(1).max(max).nullable().optional();

/** Último día de vigencia: `AAAA-MM-DD`, desde hoy y hasta dos años. */
const validUntil = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Usa el formato AAAA-MM-DD.')
  .refine((value) => {
    const day = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(day.getTime())) return false;
    const today = new Date(Date.now() - 5 * 3_600_000).toISOString().slice(0, 10);
    const max = new Date(Date.now() + 731 * 86_400_000).toISOString().slice(0, 10);
    return value >= today && value <= max;
  }, 'La fecha debe ser de hoy en adelante y máximo a dos años.');

export const activateBusinessSchema = z.object({ commercialConsent: z.boolean() }).strict();

export const businessConsentSchema = z.object({ commercialConsent: z.boolean() }).strict();

export const createBenefitSchema = z
  .object({
    listingId: z.string().uuid(),
    title: z.string().trim().min(4).max(80),
    description: optionalText(400),
    terms: optionalText(400),
    validUntil: validUntil.optional(),
  })
  .strict();

export const updateBenefitSchema = z
  .object({
    title: z.string().trim().min(4).max(80).optional(),
    description: nullableText(400),
    terms: nullableText(400),
    validUntil: validUntil.nullable().optional(),
    active: z.boolean().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Debe incluirse al menos un campo.',
  });

export const redeemSchema = z.object({ code: z.string().trim().min(8).max(20) }).strict();

export const moderateBenefitSchema = z
  .object({
    decision: z.enum(['approve', 'reject', 'hide']),
    reason: optionalText(500),
  })
  .strict()
  .refine((value) => value.decision === 'approve' || Boolean(value.reason), {
    message: 'El motivo es obligatorio para rechazar u ocultar.',
    path: ['reason'],
  });
