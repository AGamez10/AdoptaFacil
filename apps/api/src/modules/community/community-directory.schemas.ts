import { z } from 'zod';
import { ServiceCategory } from '@adoptafacil/contracts';

/** Validación del primer corte del ecosistema (directorio + mascotas).
 *  `.strict()` rechaza llaves desconocidas, como el resto del módulo. Nunca
 *  se aceptan `status` ni columnas de moderación desde el cliente. */

const optionalText = (max: number) => z.string().trim().min(1).max(max).optional();

const listingFields = {
  category: z.nativeEnum(ServiceCategory),
  name: z.string().trim().min(2).max(120),
  description: optionalText(1000),
  department: z.string().trim().min(2).max(80),
  city: z.string().trim().min(2).max(80),
  address: optionalText(200),
  phone: z
    .string()
    .trim()
    .regex(/^\+?[0-9 ()-]{7,20}$/)
    .optional(),
  whatsapp: z
    .string()
    .trim()
    .regex(/^\+?[0-9 ]{7,20}$/)
    .optional(),
  website: z
    .string()
    .trim()
    .url()
    .max(200)
    .refine((value) => /^https?:\/\//i.test(value), { message: 'Debe empezar con http(s)://' })
    .optional(),
  email: z.string().trim().email().max(200).optional(),
};

export const createServiceListingSchema = z.object(listingFields).strict();

export const updateServiceListingSchema = z
  .object(listingFields)
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Debe incluirse al menos un campo.',
  });

export const createServiceReviewSchema = z
  .object({
    rating: z.number().int().min(1).max(5),
    comment: optionalText(1000),
  })
  .strict();

export const moderateServiceSchema = z
  .object({
    decision: z.enum(['approve', 'reject', 'hide']),
    reason: optionalText(500),
  })
  .strict()
  .refine((value) => value.decision === 'approve' || Boolean(value.reason), {
    message: 'El motivo es obligatorio para rechazar u ocultar.',
    path: ['reason'],
  });

const petFields = {
  name: z.string().trim().min(1).max(80),
  species: z.enum(['dog', 'cat', 'other']),
  breed: optionalText(80),
  sex: z.enum(['male', 'female', 'unknown']).optional(),
  birthDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine((value) => {
      const date = new Date(`${value}T00:00:00Z`);
      return !Number.isNaN(date.getTime()) && date.getTime() <= Date.now();
    }, 'Fecha inválida o futura.')
    .optional(),
  sterilized: z.boolean().optional(),
  adoptedFrom: optionalText(120),
  notes: optionalText(1000),
};

export const createPetProfileSchema = z.object(petFields).strict();

export const updatePetProfileSchema = z
  .object(petFields)
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Debe incluirse al menos un campo.',
  });
