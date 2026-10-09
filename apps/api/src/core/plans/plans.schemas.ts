import { z } from 'zod';
import { PLAN_KEYS, SUBSCRIPTION_STATUSES } from '@adoptafacil/contracts';

/** Platform assigns, extends or cancels an organization's plan after a manual
 *  payment. A period end is mandatory for every status but `canceled`, so a
 *  paid plan can never be granted open-ended by mistake. */
export const assignPlanSchema = z
  .object({
    plan: z.enum(PLAN_KEYS),
    status: z.enum(SUBSCRIPTION_STATUSES),
    currentPeriodEnd: z.string().datetime({ offset: true }).nullable().optional(),
    providerReference: z.string().trim().min(1).max(200).nullable().optional(),
    discountPercent: z.number().int().min(0).max(100).optional(),
  })
  .strict()
  .refine((value) => value.status === 'canceled' || Boolean(value.currentPeriodEnd), {
    message: 'currentPeriodEnd is required unless the subscription is canceled.',
    path: ['currentPeriodEnd'],
  });
