import { ForbiddenException } from '@nestjs/common';
import {
  MFA_ENROLLMENT_REQUIRED,
  MFA_REQUIRED,
  PLATFORM_ROLES,
  type Role,
} from '@adoptafacil/contracts';
import type { PrismaService } from '../../prisma/prisma.service';
import type { AuthenticatedRequest } from '../auth/auth.types';
import { isMfaFresh, type PlatformSecurityConfig } from '../auth/mfa/platform-security.config';

/** True when every role that authorizes the caller is a platform role — i.e.
 *  the request reaches its data ONLY through platform authority. */
export function grantedOnlyByPlatformRoles(matched: readonly string[]): boolean {
  return matched.length > 0 && matched.every((role) => PLATFORM_ROLES.includes(role as Role));
}

/**
 * Second factor for platform authority (F19 security). A request authorized
 * only by PlatformAdmin/PlatformSuperAdmin must come from a session that passed
 * TOTP within the work-day window; otherwise 403 with a machine-readable code
 * the web turns into the enrollment or code screen. Also marks the request so
 * the platform access log records it in the staff member's team.
 */
export async function enforcePlatformMfa(
  request: AuthenticatedRequest,
  matchedRoles: readonly string[],
  prisma: PrismaService,
  config: PlatformSecurityConfig,
): Promise<void> {
  const user = request.user;
  if (!user) throw new ForbiddenException('Missing authenticated principal');
  if (config.mfaRequired && !isMfaFresh(user.mfaAt, config)) {
    // Auth infrastructure keyed by user (no tenant): a plain keyed read.
    const factor = await prisma.authMfaFactor.findUnique({
      where: { userId: user.id },
      select: { confirmedAt: true },
    });
    const enrolled = Boolean(factor?.confirmedAt);
    throw new ForbiddenException({
      statusCode: 403,
      code: enrolled ? MFA_REQUIRED : MFA_ENROLLMENT_REQUIRED,
      message: enrolled
        ? 'Confirm the code of your authenticator app to use platform tools.'
        : 'Set up two-step verification to use platform tools.',
    });
  }
  request.platformAccess = {
    teamOrganizationId: user.organizationId,
    roles: [...matchedRoles],
  };
}
