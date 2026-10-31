import { z } from 'zod';
import { ruledDate } from '../../core/validation/date-rules';
import { CampaignEvidenceType, DATE_RULES } from '@adoptafacil/contracts';

/**
 * Create a spending evidence. `.strict()` rejects unknown keys. `amount` is
 * OPTIONAL (a photo may carry no monetary value); when present it must be a
 * POSITIVE INTEGER COP (money is never float; negative/non-integer → 400).
 */
export const createCampaignEvidenceSchema = z
  .object({
    type: z.nativeEnum(CampaignEvidenceType),
    concept: z.string().trim().min(1).max(500),
    amount: z.number().int().positive().optional(),
    spentAt: ruledDate(DATE_RULES.campaignSpent),
    filename: z.string().trim().min(1).max(255),
    contentType: z.string().trim().min(1).max(150).optional(),
    order: z.number().int().min(0).optional(),
  })
  .strict();
