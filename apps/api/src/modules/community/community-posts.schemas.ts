import { z } from 'zod';
import { COMMUNITY_MEDIA_LIMITS, POST_REACTIONS, PostType } from '@adoptafacil/contracts';

/** Runtime validation for M11 posts. `.strict()` rejects unknown keys — same
 *  convention as campaigns/resources/marketplace. Body length mirrors the
 *  plan's spec (10–2000 characters) verbatim. */
const postImageInputSchema = z
  .object({
    filename: z.string().trim().min(1),
    contentType: z.enum([
      'image/jpeg',
      'image/png',
      'image/webp',
      'video/mp4',
      'video/quicktime',
      'video/webm',
    ]),
    order: z.number().int().nonnegative().optional(),
  })
  .strict();

export const createPostSchema = z
  .object({
    type: z.nativeEnum(PostType),
    title: z.string().trim().min(1).max(200).optional(),
    body: z.string().trim().min(10).max(2000),
    images: z
      .array(postImageInputSchema)
      .max(COMMUNITY_MEDIA_LIMITS.maxItems)
      .refine(
        (items) =>
          items.filter((i) => i.contentType.startsWith('video/')).length <=
          COMMUNITY_MEDIA_LIMITS.maxVideos,
        { message: 'Solo puedes adjuntar un video por publicación.' },
      )
      .optional(),
    shareable: z.boolean().optional(),
  })
  .strict();

export const setPostShareableSchema = z.object({ shareable: z.boolean() }).strict();

export const updatePostSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    body: z.string().trim().min(10).max(2000).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Debe incluirse al menos un campo.',
  });

export const setReactionSchema = z.object({ reaction: z.enum(POST_REACTIONS).nullable() }).strict();

export const myReactionsSchema = z
  .object({ postIds: z.array(z.string().uuid()).max(100) })
  .strict();
