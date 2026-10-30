import { z } from 'zod';
import { MAX_SPONSORSHIP_AMOUNT_COP, SponsorshipPeriodicity } from '@adoptafacil/contracts';

const uuid = z.string().guid();

/** Create a sponsorship plan. `.strict()` rejects unknown keys. Money is
 *  integer COP > 0 (never float), coherent with the money engine. */
export const createSponsorshipPlanSchema = z
  .object({
    animalId: uuid,
    name: z.string().trim().min(1).max(200),
    amount: z.number().int().positive(),
    periodicity: z.nativeEnum(SponsorshipPeriodicity),
  })
  .strict();

/** Patch a plan. At least one field must be present. */
export const updateSponsorshipPlanSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    amount: z.number().int().positive().optional(),
    periodicity: z.nativeEnum(SponsorshipPeriodicity).optional(),
    isActive: z.boolean().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided.',
  });

/**
 * Mark an animal as needing sponsorship (`PUT /sponsorship-plans/animal/:id`).
 * `amount` is optional: omitted keeps the current one (or the suggested
 * default for a new plan). Capped as a typo guard.
 */
export const markAnimalNeedsSponsorshipSchema = z
  .object({
    amount: z.number().int().positive().max(MAX_SPONSORSHIP_AMOUNT_COP).optional(),
  })
  .strict();

/**
 * Subscribe to a plan (authenticated Person = the padrino). Requerimiento
 * #17: charges a collection immediately through the PaymentPort.
 */
export const createSponsorshipSchema = z
  .object({
    planId: uuid,
  })
  .strict();

/** Optional free-text reason accompanying a suspend/reactivate action. */
export const sponsorshipStatusChangeSchema = z
  .object({
    reason: z.string().trim().min(1).max(500).optional(),
  })
  .strict();

/**
 * Requerimiento #19: cancelling a sponsorship REQUIRES a reason (unlike
 * suspend/reactivate above) — the client asked that every cancellation leave
 * an auditable "why" behind.
 */
export const cancelSponsorshipSchema = z
  .object({
    reason: z.string().trim().min(1).max(500),
  })
  .strict();

/** Body of `POST /sponsorships/:id/retry-payment`: empty (or no body). */
export const paySponsorshipPaymentSchema = z.object({}).strict();
