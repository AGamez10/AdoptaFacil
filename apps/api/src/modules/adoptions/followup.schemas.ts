import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';

/** Runtime validation for M04 post-adoption follow-up (T-028c). `.strict()` rejects
 *  unknown keys so no extra field can be smuggled in. */

const uuid = z.string().uuid();

const questionSchema = z
  .object({
    id: uuid.optional(),
    prompt: z.string().trim().min(1).max(500),
    kind: z.enum(['text', 'boolean', 'photo']),
    required: z.boolean().optional(),
  })
  .strict();

export const scheduleFollowUpSchema = z
  .object({
    contractId: uuid,
    title: z.string().trim().min(1).max(200),
    /** ISO-8601 UTC del vencimiento. */
    dueAt: z.string().datetime(),
    questionnaire: z.array(questionSchema).max(50).optional(),
  })
  .strict();

export const submitFollowUpSchema = z
  .object({
    answers: z.record(z.string(), z.unknown()).optional(),
    photoFilename: z.string().trim().min(1).max(300).optional(),
    complete: z.boolean().optional(),
  })
  .strict()
  .refine((d) => d.answers !== undefined || d.photoFilename !== undefined, {
    message: 'Debes enviar respuestas del cuestionario o una foto.',
  });

/** Images accepted as follow-up evidence (subset of the storage allowlist). */
export const FOLLOWUP_PHOTO_CONTENT_TYPES: readonly string[] = [
  'image/jpeg',
  'image/png',
  'image/webp',
];

/** Text fields that travel next to the photo in the multipart body. */
const followUpPhotoFieldsSchema = z
  .object({
    answers: z.record(z.string(), z.unknown()).optional(),
    complete: z.boolean().optional(),
  })
  .strict();

/**
 * Multipart fields arrive as strings: `answers` is JSON and `complete` is
 * "true"/"false". Parsed here and validated with the same strictness as the
 * JSON endpoint (unknown fields are rejected).
 */
export function parseFollowUpPhotoFields(
  fields: Record<string, unknown>,
): z.infer<typeof followUpPhotoFieldsSchema> {
  const raw: Record<string, unknown> = { ...fields };
  try {
    if (typeof raw.answers === 'string') raw.answers = JSON.parse(raw.answers);
  } catch {
    throw new BadRequestException('Las respuestas no tienen un formato válido.');
  }
  if (raw.complete === 'true') raw.complete = true;
  else if (raw.complete === 'false') raw.complete = false;
  const parsed = followUpPhotoFieldsSchema.safeParse(raw);
  if (!parsed.success) {
    throw new BadRequestException('Los datos del seguimiento no son válidos.');
  }
  return parsed.data;
}
