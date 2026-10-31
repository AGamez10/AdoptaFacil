import { z } from 'zod';
import { QR_TARGET_KINDS, qrTargetNeedsId } from '@adoptafacil/contracts';

/** `PUT /org/qr/target`: un tipo de la lista cerrada + un UUID (nunca una URL).
 *  `profile` y `donate` no llevan id; `campaign` y `animal` lo exigen. */
export const updateOrgQrTargetSchema = z
  .object({
    kind: z.enum(QR_TARGET_KINDS),
    id: z.string().uuid().nullish(),
  })
  .strict()
  .refine((v) => (qrTargetNeedsId(v.kind) ? !!v.id : !v.id), {
    message: 'Perfil y donar no llevan id; campaña y animal sí.',
    path: ['id'],
  });
