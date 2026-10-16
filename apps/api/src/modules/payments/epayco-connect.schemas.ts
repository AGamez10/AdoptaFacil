import { z } from 'zod';
import { EPAYCO_CUST_ID_PATTERN } from '@adoptafacil/contracts';

/** One ePayco key: trimmed, non-empty, bounded, no whitespace inside. */
const key = z
  .string()
  .trim()
  .min(1, 'La llave es obligatoria.')
  .max(200, 'La llave es demasiado larga.')
  .regex(/^\S+$/, 'La llave no puede contener espacios.');

/** `PUT /org/epayco/connect` — `.strict()`: no unknown keys (same convention
 *  as the other payment schemas). */
export const connectEpaycoAccountSchema = z
  .object({
    custId: z
      .string()
      .trim()
      .regex(EPAYCO_CUST_ID_PATTERN, 'El P_CUST_ID_CLIENTE debe ser numérico.'),
    pKey: key,
    publicKey: key,
    privateKey: key,
  })
  .strict();
