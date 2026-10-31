import { z } from 'zod';
import { ruledDate } from '../../core/validation/date-rules';
import { DATE_RULES, DocumentType, dateOrderError } from '@adoptafacil/contracts';

/** Upload a new document version (Owner/Administrator). `.strict()` rejects
 *  unknown keys; the server assigns `version` and sets status Pending. */
export const uploadDocumentSchema = z
  .object({
    type: z.nativeEnum(DocumentType),
    filename: z.string().trim().min(1).max(255),
    contentType: z.string().trim().max(150).optional(),
    issuedAt: ruledDate(DATE_RULES.documentIssued).optional(),
    expiresAt: ruledDate(DATE_RULES.documentExpires).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (!value.issuedAt || !value.expiresAt) return;
    const error = dateOrderError(
      value.issuedAt,
      value.expiresAt,
      { start: 'La fecha de expedición', end: 'La fecha de vencimiento' },
      { strict: true },
    );
    if (error) ctx.addIssue({ code: 'custom', message: error, path: ['expiresAt'] });
  });

/** Platform review decision. A reason (`note`, motivo) is MANDATORY for observe
 *  and reject — enforced here (400) and again in the DB function as a backstop. */
export const reviewDocumentSchema = z
  .object({
    decision: z.enum(['observe', 'approve', 'reject']),
    note: z.string().trim().min(1).max(2000).optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.decision === 'approve' || (value.note !== undefined && value.note.trim().length > 0),
    {
      message: 'A reason (note) is required to observe or reject a document.',
      path: ['note'],
    },
  );
