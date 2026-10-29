import { z } from 'zod';
import { QR_TARGET_KINDS } from '@adoptafacil/contracts';

/** `PUT /org/qr/target`: un tipo de la lista cerrada + un UUID (nunca una URL).
 *  `donate` no lleva id; `campaign` y `animal` lo exigen. */
export const updateOrgQrTargetSchema = z
  .object({
    kind: z.enum(QR_TARGET_KINDS),
    id: z.string().uuid().nullish(),
  })
  .strict()
  .refine((v) => (v.kind === 'donate' ? !v.id : !!v.id), {
    message: 'El destino donar no lleva id; campaña y animal sí.',
    path: ['id'],
  });
