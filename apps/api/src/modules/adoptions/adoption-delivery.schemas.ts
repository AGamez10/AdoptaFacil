import { z } from 'zod';
import { ADOPTION_DELIVERY_ITEMS } from '@adoptafacil/contracts';

/** Validación del acta de entrega (ajuste 6). `.strict()` rechaza claves extra. */

export const startDeliverySchema = z
  .object({
    contractId: z.string().uuid(),
    healthStatus: z.string().trim().min(3).max(1000),
    weightKg: z.number().positive().max(150),
    /** El contrato exige confirmar la identidad con el documento original. */
    identityVerified: z.literal(true, {
      errorMap: () => ({ message: 'Confirma la identidad del adoptante con su documento.' }),
    }),
    identificationChecked: z.boolean(),
    items: z
      .array(z.enum(ADOPTION_DELIVERY_ITEMS as unknown as [string, ...string[]]))
      .max(ADOPTION_DELIVERY_ITEMS.length)
      .transform((items) => [...new Set(items)]),
    photoRef: z.string().min(1).max(500),
  })
  .strict();

export const confirmDeliverySchema = z
  .object({ code: z.string().regex(/^\d{6}$/, 'El código tiene 6 dígitos.') })
  .strict();

export const deliveryPhotoTargetSchema = z
  .object({ filename: z.string().trim().min(1).max(200) })
  .strict();
