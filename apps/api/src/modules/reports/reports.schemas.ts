import { z } from 'zod';
import { LEGAL_REPRESENTATIVE_ROLES } from '../org/legal-representative.schemas';

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Usa el formato AAAA-MM-DD.');

/** Cuerpo de `POST /org/reports`. Estricto: cualquier campo extra (p. ej. un
 *  `organizationId` inyectado) se rechaza — la organización sale del JWT. */
export const generateOrgReportSchema = z
  .object({
    kind: z.enum(['donations', 'social_service']),
    periodStart: day,
    periodEnd: day,
    filters: z
      .object({
        studentServiceOnly: z.boolean().optional(),
        schoolName: z.string().trim().max(200).optional(),
      })
      .strict()
      .optional(),
    signerRoles: z.array(z.enum(LEGAL_REPRESENTATIVE_ROLES)).max(3).optional(),
  })
  .strict();

/** `POST /org/reports/:id/decision`. Estricto: la decisión es la única entrada. */
export const decideOrgReportSchema = z
  .object({ decision: z.enum(['approved', 'rejected']) })
  .strict();

/** `PUT /org/reports/policy`. El representante legal siempre firma. */
export const setOrgReportPolicySchema = z
  .object({
    kind: z.enum(['donations', 'social_service']),
    requiredRoles: z
      .array(z.enum(LEGAL_REPRESENTATIVE_ROLES))
      .min(1)
      .max(3)
      .refine((roles) => roles.includes('legal_representative'), {
        message: 'El representante legal siempre firma.',
      }),
  })
  .strict();

const signatureToken = z.string().min(20).max(200);

/** Enlace de firma por correo: el token viaja en el cuerpo, nunca en la URL. */
export const signatureRequestTokenSchema = z.object({ token: signatureToken }).strict();

export const decideSignatureRequestSchema = z
  .object({
    token: signatureToken,
    decision: z.enum(['approved', 'rejected']),
    consent: z.boolean().optional(),
    documentNumber: z.string().trim().min(3).max(50),
    signature: z
      .object({
        fullName: z.string().trim().min(1).max(200),
        documentType: z.enum(['cedula_ciudadania', 'cedula_extranjeria', 'pasaporte']),
        position: z.string().trim().min(1).max(120),
        signatureBase64: z.string().min(1).max(2_000_000),
        signatureContentType: z.string().trim().min(1).max(100),
        method: z.enum(['drawn', 'photo']).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();
