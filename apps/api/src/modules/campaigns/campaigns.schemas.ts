import { z } from 'zod';
import { ruledDate } from '../../core/validation/date-rules';
import { CampaignCategory, CampaignStatus, DATE_RULES } from '@adoptafacil/contracts';

/** Create a campaign. `.strict()` rejects unknown keys. Money is integer COP > 0. */
export const createCampaignSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(5000).optional(),
    category: z.nativeEnum(CampaignCategory),
    goalAmount: z.number().int().positive(),
    deadline: ruledDate(DATE_RULES.campaignDeadline),
  })
  .strict();

/** Patch a campaign. At least one field must be present. */
export const updateCampaignSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(5000).optional(),
    category: z.nativeEnum(CampaignCategory).optional(),
    goalAmount: z.number().int().positive().optional(),
    /** Sin `notPast` aquí: el formulario reenvía la fecha guardada al editar
     *  otros campos. El servicio exige que NO sea pasada solo si cambia. */
    deadline: ruledDate({ ...DATE_RULES.campaignDeadline, notPast: false }).optional(),
    status: z.nativeEnum(CampaignStatus).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided.',
  });
