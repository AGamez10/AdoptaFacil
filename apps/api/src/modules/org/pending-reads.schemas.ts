import { z } from 'zod';

/** Same format as the `notification_reads_item_key_format` CHECK constraint. */
export const PENDING_ITEM_KEY_RE =
  /^(adoptions|expiring|rejected|reminder:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;

export const markPendingReadSchema = z
  .object({
    keys: z.array(z.string().regex(PENDING_ITEM_KEY_RE)).min(1).max(50),
  })
  .strict();
