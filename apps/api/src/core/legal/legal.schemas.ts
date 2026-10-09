import { z } from 'zod';
import { LEGAL_DOCUMENTS, type LegalDocumentKey } from '@adoptafacil/contracts';

const keys = LEGAL_DOCUMENTS.map((d) => d.key) as [LegalDocumentKey, ...LegalDocumentKey[]];

/** Un documento aceptado: clave conocida + versión que vio el usuario. */
export const legalAcceptanceItemSchema = z
  .object({
    key: z.enum(keys),
    version: z.string().trim().min(1).max(20),
  })
  .strict();

/** Lista acotada de aceptaciones (reutilizada por registro y donación invitada). */
export const legalAcceptancesSchema = z
  .array(legalAcceptanceItemSchema)
  .max(LEGAL_DOCUMENTS.length);

export const acceptLegalDocumentsSchema = z
  .object({ documents: legalAcceptancesSchema.min(1) })
  .strict();

export const revokeLegalDocumentSchema = z.object({ key: z.enum(keys) }).strict();
