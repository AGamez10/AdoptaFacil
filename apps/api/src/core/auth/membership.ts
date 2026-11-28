import { UnauthorizedException } from '@nestjs/common';
import type { AccountType } from '@adoptafacil/contracts';
import type { PrismaService } from '../../prisma/prisma.service';

/** Error code of the 401 a removed organization member gets. */
export const MEMBERSHIP_REVOKED = 'MEMBERSHIP_REVOKED';

/**
 * An ORGANIZATION account holding no role in its organization is a former
 * member (`DELETE /org/members/:id` deletes only the roles and the refresh
 * tokens; the `org` claim comes from `auth_credentials`, which outlives the
 * removal). Person accounts never hold a role in their personal organization
 * (nor do platform staff, who are person accounts), so only organization
 * accounts are checked. Used when issuing/rotating tokens AND on every
 * authenticated request (audit run-2 R-04: an access token issued before the
 * removal used to keep working until it expired).
 */
export async function assertActiveMembership(
  prisma: PrismaService,
  principal: { userId: string; organizationId: string; accountType: AccountType },
): Promise<void> {
  if (principal.accountType !== 'organization') return;
  const roles = await prisma.withOrgContext(principal.organizationId, (tx) =>
    tx.userRole.count({
      where: { userId: principal.userId, organizationId: principal.organizationId },
    }),
  );
  if (roles === 0) {
    throw new UnauthorizedException({
      statusCode: 401,
      code: MEMBERSHIP_REVOKED,
      message: 'Esta cuenta ya no hace parte de la organización.',
    });
  }
}

/** Error code of the 401 for an access token issued before a credential change. */
export const SESSION_REVOKED = 'SESSION_REVOKED';

/**
 * Audit run-4 RA-01: an access token issued BEFORE the account's sessions were
 * revoked (password reset completed, first Google link) stops working at once
 * instead of living out its 15 minutes. `auth_credentials` is the global
 * identity index (no RLS): a single keyed read by the unique `user_id`.
 * Tokens minted in the same second as the revocation are accepted (`iat` has
 * one-second resolution and the new session is issued right after it).
 */
export async function assertSessionNotRevoked(
  prisma: PrismaService,
  userId: string,
  issuedAtSeconds: number | undefined,
): Promise<void> {
  const credential = await prisma.authCredential.findUnique({
    where: { userId },
    select: { sessionsRevokedAt: true },
  });
  const revokedAt = credential?.sessionsRevokedAt;
  if (!revokedAt) return;
  const revokedAtSeconds = Math.floor(revokedAt.getTime() / 1000);
  if (typeof issuedAtSeconds !== 'number' || issuedAtSeconds < revokedAtSeconds) {
    throw new UnauthorizedException({
      statusCode: 401,
      code: SESSION_REVOKED,
      message: 'Tu sesión se cerró porque cambiaron las credenciales de la cuenta.',
    });
  }
}
