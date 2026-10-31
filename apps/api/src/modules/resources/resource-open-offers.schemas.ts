import { z } from 'zod';
import { OPEN_OFFER_CATEGORIES, type ResourceCategory } from '@adoptafacil/contracts';

/** Runtime validation for open offers (M09). Same conventions as needs:
 *  `.strict()`, positive integer quantities, no medicine category. */
export const createResourceOpenOfferSchema = z
  .object({
    title: z.string().trim().min(3).max(120),
    description: z.string().trim().max(1000).optional(),
    category: z.enum(OPEN_OFFER_CATEGORIES as [ResourceCategory, ...ResourceCategory[]], {
      message:
        'Elige alimento, insumos, equipo u otro. Los medicamentos solo se reciben cuando una organización los pide.',
    }),
    quantity: z.number().int('La cantidad debe ser un número entero.').positive().max(100_000),
    unit: z.string().trim().min(1).max(40),
    department: z.string().trim().min(2).max(80),
    city: z.string().trim().min(2).max(80),
  })
  .strict();

export const claimResourceOpenOfferSchema = z
  .object({
    needId: z.string().uuid().optional(),
    needTitle: z.string().trim().min(1).max(200).optional(),
  })
  .strict();
