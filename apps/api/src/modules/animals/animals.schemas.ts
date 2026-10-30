import { DATE_RULES } from '@adoptafacil/contracts';
import { z } from 'zod';
import { ruledDate } from '../../core/validation/date-rules';

/** Enums mirror the STABLE contract value sets (animals.ts). Exported so
 *  `bulk-import.schemas.ts` (S2-04B-1) validates rows against the SAME rules
 *  instead of duplicating them and risking drift. */
export const species = z.enum(['dog', 'cat', 'other']);
export const sex = z.enum(['male', 'female', 'unknown']);
export const size = z.enum(['small', 'medium', 'large']);
const status = z.enum(['available', 'in_process', 'adopted', 'unavailable']);

const photoInput = z
  .object({
    filename: z.string().trim().min(1).max(255),
    contentType: z.string().trim().max(150).optional(),
    order: z.number().int().min(0).max(1000).optional(),
  })
  .strict();

/** Birth date: ISO-8601 with offset, never after today in Colombia. Shared
 *  with the bulk import so both paths reject a future birth date. */
export const birthDate = ruledDate(DATE_RULES.animalBirth);

/** Personality tags (S2-04A) — free text, max 10, no empty/oversized entries. */
export const tags = z.array(z.string().trim().min(1).max(40)).max(10);

/** Create an animal record. `.strict()` rejects unknown keys. The age is
 *  required: an exact `birthDate` or, when unknown, `approximateAgeMonths`. */
export const createAnimalSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    species,
    sex,
    size,
    status: status.optional(),
    breedId: z.string().guid().optional(),
    customBreed: z.string().trim().min(1).max(80).optional(),
    birthDate: birthDate.optional(),
    approximateAgeMonths: z.number().int().min(0).max(1200).optional(),
    description: z.string().trim().max(5000).optional(),
    tags: tags.optional(),
    photos: z.array(photoInput).max(20).optional(),
  })
  .strict()
  .refine((value) => value.birthDate !== undefined || value.approximateAgeMonths !== undefined, {
    message: 'Indica la fecha de nacimiento o una edad aproximada.',
    path: ['birthDate'],
  });

/** Patch an animal record. At least one field must be present. `birthDate:
 *  null` clears it; the service checks the record still keeps an age. */
export const updateAnimalSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    species: species.optional(),
    sex: sex.optional(),
    size: size.optional(),
    status: status.optional(),
    breedId: z.string().guid().optional(),
    customBreed: z.string().trim().min(1).max(80).optional(),
    birthDate: birthDate.nullable().optional(),
    approximateAgeMonths: z.number().int().min(0).max(1200).optional(),
    description: z.string().trim().max(5000).optional(),
    tags: tags.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided.',
  });

export const addPhotoSchema = photoInput;

export const createBreedSchema = z
  .object({
    species,
    name: z.string().trim().min(1).max(80),
  })
  .strict();
