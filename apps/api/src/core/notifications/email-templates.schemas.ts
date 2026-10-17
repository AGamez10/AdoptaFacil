import { z } from 'zod';
import { EMAIL_ACCENT_COLORS, EMAIL_ICONS } from '@adoptafacil/contracts';
import { CONTENT_LIMITS } from './templates/email-render';

/** One admin-edited copy. `.strict()` rejects unknown keys. The
 *  template-specific rules (allowed variables, one-line fields, button only
 *  where the event has a URL) are checked by `validateContent`. */
const contentShape = {
  subject: z.string().trim().min(1).max(CONTENT_LIMITS.subject),
  preheader: z.string().trim().max(CONTENT_LIMITS.preheader).default(''),
  heading: z.string().trim().min(1).max(CONTENT_LIMITS.heading),
  body: z.string().trim().min(1).max(CONTENT_LIMITS.body),
  ctaLabel: z.string().trim().max(CONTENT_LIMITS.ctaLabel).optional(),
  footerNote: z.string().trim().max(CONTENT_LIMITS.footerNote).optional(),
  accentColor: z.enum(EMAIL_ACCENT_COLORS).optional(),
  icon: z.enum(EMAIL_ICONS).optional(),
};

export const emailTemplateContentSchema = z.object(contentShape).strict();

export const createEmailTemplateVersionSchema = z
  .object({
    ...contentShape,
    changeNote: z.string().trim().max(200).optional(),
    activate: z.boolean().optional(),
  })
  .strict();

export const activateEmailTemplateSchema = z
  .object({ version: z.number().int().positive().nullable() })
  .strict();

export const setEmailTemplateEnabledSchema = z.object({ enabled: z.boolean() }).strict();

export const previewEmailTemplateSchema = z
  .object({
    content: emailTemplateContentSchema.optional(),
    organizationName: z.string().trim().max(120).optional(),
  })
  .strict();

export const emailUnsubscribeSchema = z
  .object({
    h: z.string().regex(/^[0-9a-f]{64}$/),
    t: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  })
  .passthrough();
