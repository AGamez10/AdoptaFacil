import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Role } from '@adoptafacil/contracts';
import type { AuthenticatedRequest } from '../auth/auth.types';
import {
  loadPlatformSecurityConfig,
  type PlatformSecurityConfig,
} from '../auth/mfa/platform-security.config';
import { PrismaService } from '../../prisma/prisma.service';
import { enforcePlatformMfa, grantedOnlyByPlatformRoles } from './platform-mfa.policy';
import { ROLES_KEY } from './roles.decorator';

/**
 * Enforces the roles declared by {@link Roles}. It DENIES BY DEFAULT: any
 * uncertainty — no principal, no tenant context, or no matching role — results
 * in a 403, never an open pass.
 *
 * Authority is read from the tenant-scoped `user_roles` table THROUGH the
 * request's organization context (set by the tenant middleware from the access
 * token). This binds RBAC to the tenant: a user's roles are only ever those
 * granted within their own organization, so an Administrator of Org A holds no
 * authority under Org B.
 *
 * Platform authority adds a second factor: when the ONLY roles that let the
 * caller in are platform roles, the session must have passed TOTP recently
 * (403 MFA_ENROLLMENT_REQUIRED / MFA_REQUIRED otherwise) — see
 * platform-mfa.policy.ts. Org roles are unaffected.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  private readonly platformSecurity: PlatformSecurityConfig = loadPlatformSecurityConfig();

  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    // No roles declared → this guard imposes no restriction.
    if (!required || required.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;
    if (!user) {
      throw new ForbiddenException('Missing authenticated principal');
    }

    const rows = await this.prisma.withTenant((tx) =>
      tx.userRole.findMany({ where: { userId: user.id } }),
    );
    const held = new Set<string>(rows.map((row) => row.role));
    const matched = required.filter((role) => held.has(role));
    if (matched.length === 0) {
      throw new ForbiddenException('Insufficient role for this operation');
    }
    if (grantedOnlyByPlatformRoles(matched)) {
      await enforcePlatformMfa(request, matched, this.prisma, this.platformSecurity);
    }
    return true;
  }
}
