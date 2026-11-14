import { z } from 'zod';

/** Crear una reseña — cualquier Persona autenticada, cruzando tenants (M12,
 *  RF23). `rating` 1-5 (también validado en `create_review()`, defensa en
 *  profundidad). `comment` es opcional; vacío tras trim se guarda como null. */
export const createReviewSchema = z
  .object({
    organizationId: z.string().guid(),
    rating: z.number().int().min(1).max(5),
    comment: z.string().trim().max(2000).optional(),
    isAnonymous: z.boolean().optional(),
  })
  .strict();

/** Decisión de moderación (PlatformAdmin/PlatformSuperAdmin) — motivo
 *  obligatorio para rechazar, mismo criterio que `reviewDocumentSchema`. */
export const decideReviewSchema = z
  .object({
    decision: z.enum(['approve', 'reject']),
    reason: z.string().trim().min(1).max(2000).optional(),
  })
  .strict()
  .refine((value) => value.decision === 'approve' || (value.reason?.length ?? 0) > 0, {
    message: 'A reason is required to reject a review.',
    path: ['reason'],
  });

/** Ocultar una reseña ya aprobada (objetivo #3) — motivo siempre obligatorio. */
export const hideReviewSchema = z
  .object({
    reason: z.string().trim().min(1).max(2000),
  })
  .strict();

/** Palabras sueltas que harían pasar a un visitante por staff (comparadas sin
 *  tildes, en minúscula, palabra por palabra para no atrapar apellidos que
 *  solo las contienen). La marca se busca aparte, con o sin espacios. */
const RESERVED_NAME_WORDS = new Set([
  'admin',
  'administrador',
  'administradora',
  'administracion',
  'moderador',
  'moderadora',
  'soporte',
  'oficial',
]);

function normalizeName(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

/** Nombre opcional de un visitante sin cuenta (2026-11-05). Solo letras,
 *  espacios y `. ' -`: sin números (teléfonos, cédulas), sin `@` (correos) y
 *  sin enlaces — el nombre se publica y no debe arrastrar datos de contacto
 *  (Ley 1581). Espacios repetidos se colapsan. Vacío tras trim ⇒ anónima. */
export const publicReviewAuthorNameSchema = z
  .string()
  .transform((value) => value.trim().replace(/\s+/g, ' '))
  .pipe(
    z
      .string()
      .max(60, 'El nombre puede tener máximo 60 caracteres.')
      .refine((value) => value === '' || value.length >= 2, {
        message: 'El nombre debe tener al menos 2 caracteres.',
      })
      .refine((value) => value === '' || /^\p{L}[\p{L}\p{M} .'-]*$/u.test(value), {
        message: 'El nombre solo puede tener letras, espacios, puntos, apóstrofos y guiones.',
      })
      // Dominios ("spam.co", "www.x"): letras.letras sin espacio. Iniciales
      // como "J.R." siguen permitidas.
      .refine((value) => !/\p{L}{2,}\.\p{L}{2,}/u.test(value), {
        message: 'El nombre no puede incluir enlaces.',
      })
      .refine(
        (value) => {
          const normalized = normalizeName(value);
          if (normalized.replace(/[^a-z]/g, '').includes('adoptafacil')) return false;
          return !normalized.split(/[^a-z]+/).some((word) => RESERVED_NAME_WORDS.has(word));
        },
        { message: 'Ese nombre no está permitido.' },
      ),
  )
  .transform((value) => (value === '' ? undefined : value));

/** Reseña del portal público (S7-b) — sin `organizationId` (viene del slug de
 *  la URL). `authorName` es solo para visitantes y `isAnonymous` solo para
 *  miembros con sesión: el servicio rechaza la combinación que no aplica. */
export const createPublicReviewSchema = z
  .object({
    rating: z.number().int().min(1).max(5),
    comment: z.string().trim().max(2000).optional(),
    authorName: publicReviewAuthorNameSchema.optional(),
    isAnonymous: z.boolean().optional(),
  })
  .strict();
