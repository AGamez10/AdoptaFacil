import { z } from 'zod';

/**
 * Query validation for the public adoption catalog (T-029). `limit` is capped at
 * 50 (mandatory pagination — no mass dumps); `species` is the only allowed filter
 * (Dog/Cat/Other). Unknown query keys are ignored (default zod strip). The DB
 * function re-clamps limit/offset as a backstop.
 */
export const publicAnimalsQuerySchema = z.object({
  // A positive int; the server CAP (max 50) is enforced authoritatively in the
  // DB function (LEAST(..., 50)), so an over-cap limit is clamped, not rejected.
  limit: z.coerce.number().int().min(1).optional(),
  offset: z.coerce.number().int().min(0).optional(),
  species: z.enum(['dog', 'cat', 'other']).optional(),
});

export type PublicAnimalsQuery = z.infer<typeof publicAnimalsQuerySchema>;

/**
 * Query validation for the GLOBAL public adoption catalog (S1-07),
 * `GET /public/animals`. Page-based (the landing page's pager), server-capped
 * at 50 like the per-org endpoint; `city` matches an organization's profile
 * city case-insensitively (exact match — no fuzzy search in this cut).
 */
export const publicAnimalsGlobalQuerySchema = z.object({
  species: z.enum(['dog', 'cat', 'other']).optional(),
  city: z.string().trim().min(1).optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).optional(),
});

export type PublicAnimalsGlobalQuery = z.infer<typeof publicAnimalsGlobalQuerySchema>;

/**
 * Path params of the public animal page endpoint,
 * `GET /public/organizations/:slug/animals/:ref`. `ref` is the animal's public
 * code (8 Crockford base32 chars) or, for links published before public codes
 * existed, its UUID. Anything else is rejected before touching the database.
 */
export const publicAnimalParamsSchema = z.object({
  slug: z
    .string()
    .max(63)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  ref: z
    .string()
    .transform((value) => value.toLowerCase())
    .pipe(z.union([z.string().regex(/^[0-9a-hjkmnp-tv-z]{8}$/), z.string().uuid()])),
});

export type PublicAnimalParams = z.infer<typeof publicAnimalParamsSchema>;
