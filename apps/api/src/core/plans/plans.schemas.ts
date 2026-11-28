import { z } from 'zod';
import {
  MERCADOPAGO_RESOURCE_ID_PATTERN,
  PLAN_KEYS,
  SUBSCRIPTION_STATUSES,
} from '@adoptafacil/contracts';

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

/** ADR-PAG-003: the org starts paying a plan with Mercado Pago (monthly). */
export const startPlanCheckoutSchema = z
  .object({
    plan: z.enum(['crece', 'pro']),
    /** Correo de la cuenta de Mercado Pago que va a pagar, si no es el de la
     *  cuenta de AdoptaFácil (Mercado Pago pide entrar con ese mismo correo). */
    payerEmail: z.string().trim().toLowerCase().email().max(320).optional(),
  })
  .strict();

/** `GET /org/plan/checkout/status`: Mercado Pago appends `preapproval_id` to
 *  the back URL; other query params it adds are ignored. */
export const planCheckoutStatusQuerySchema = z.object({
  preapproval_id: z.string().regex(MERCADOPAGO_RESOURCE_ID_PATTERN),
});
