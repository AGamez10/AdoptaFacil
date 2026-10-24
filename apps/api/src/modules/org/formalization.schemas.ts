import { z } from 'zod';
import { FormalizationState } from '@adoptafacil/contracts';

/** Validation for a formalization transition request. `.strict()` rejects
 *  unknown keys; `targetState` must be a valid FormalizationState. */
export const requestTransitionSchema = z
  .object({
    targetState: z.nativeEnum(FormalizationState),
    reason: z.string().trim().min(1).max(1000).optional(),
  })
  .strict();

/** Platform review transition (R2-2): same fields plus the evidence document
 *  cited to enter ESAL / ESAL_RTE. */
export const platformTransitionSchema = z
  .object({
    targetState: z.nativeEnum(FormalizationState),
    reason: z.string().trim().min(1).max(1000).optional(),
    evidenceDocumentId: z.string().guid().optional(),
  })
  .strict();
