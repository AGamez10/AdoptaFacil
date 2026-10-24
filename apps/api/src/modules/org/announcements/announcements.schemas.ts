import { z } from 'zod';
import { ANNOUNCEMENT_AUDIENCES } from '@adoptafacil/contracts';

/** `POST /org/announcements`. Plain text only: the email template escapes it. */
export const sendOrgAnnouncementSchema = z
  .object({
    audiences: z.array(z.enum(ANNOUNCEMENT_AUDIENCES)).min(1).max(ANNOUNCEMENT_AUDIENCES.length),
    // One line (it becomes the subject): no line breaks.
    title: z
      .string()
      .trim()
      .min(3)
      .max(120)
      .regex(/^[^\r\n]*$/, 'El título va en una sola línea.'),
    message: z.string().trim().min(10).max(2000),
  })
  .strict();
