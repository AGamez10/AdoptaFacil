import { Prisma } from '@prisma/client';
import { isUniqueConstraintViolation } from '../../core/errors/prisma-conflict.util';

/** True when a write lost a race on an append-only sequence: the UNIQUE
 *  (ticket_id, seq) / (action_id) constraint, or the sequence trigger. */
export function isConcurrentAppend(error: unknown): boolean {
  if (isUniqueConstraintViolation(error)) return true;
  const message =
    error instanceof Prisma.PrismaClientKnownRequestError ||
    error instanceof Prisma.PrismaClientUnknownRequestError
      ? error.message
      : '';
  return message.includes('expected seq');
}

/** Message of a database trigger rejection (four eyes, expiry), if any. */
export function triggerRejection(error: unknown): string | null {
  const message =
    error instanceof Prisma.PrismaClientKnownRequestError ||
    error instanceof Prisma.PrismaClientUnknownRequestError
      ? error.message
      : '';
  if (message.includes('four eyes')) return 'four_eyes';
  if (message.includes('expired')) return 'expired';
  if (message.includes('only the requester can cancel')) return 'not_requester';
  return null;
}
