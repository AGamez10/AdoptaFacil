import { z } from 'zod';
import {
  COMMUNITY_PRE_REGISTRATION_KINDS,
  COMMUNITY_PRE_REGISTRATION_OTHER_CATEGORY,
  SERVICE_CATEGORIES,
} from '@adoptafacil/contracts';

/** Pre-registro público de comercios y profesionales (sin cuenta). `.strict()`
 *  rechaza llaves desconocidas y el consentimiento debe venir explícito. */
const text = (min: number, max: number) => z.string().trim().min(min).max(max);

export const communityPreRegistrationSchema = z
  .object({
    kind: z.enum(COMMUNITY_PRE_REGISTRATION_KINDS),
    businessName: text(2, 120),
    category: z.enum([...SERVICE_CATEGORIES, COMMUNITY_PRE_REGISTRATION_OTHER_CATEGORY]),
    city: text(2, 80),
    contactName: text(2, 120),
    contactEmail: z.string().trim().toLowerCase().email().max(200),
    contactPhone: z
      .string()
      .trim()
      .regex(/^\+?[0-9 ()-]{7,20}$/)
      .optional(),
    message: text(1, 500).optional(),
    consent: z.literal(true),
  })
  .strict();
