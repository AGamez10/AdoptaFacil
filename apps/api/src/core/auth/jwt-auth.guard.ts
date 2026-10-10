import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { type AccessTokenClaims, OrganizationStatus } from '@adoptafacil/contracts';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthenticatedRequest } from './auth.types';

/** Error code of the 403 a suspended organization's members get (R2-1). */
export const ORGANIZATION_SUSPENDED = 'ORGANIZATION_SUSPENDED';

/**
 * Routes a member of a SUSPENDED organization can still reach: the session
 * itself (`/auth/*`: me, refresh, logout) and the status read that explains
 * why everything else answers 403.
 */
function allowedWhileSuspended(method: string, path: string): boolean {
  return path.startsWith('/auth/') || (method === 'GET' && path === '/org/status');
}

/**
 * Validates the `Authorization: Bearer <access token>` header and attaches the
 * authenticated principal to the request. The tenant context itself is set
 * earlier by the tenant middleware (also from the token), so this guard only
 * gates access to protected routes.
 *
 * It also enforces the platform suspension (R2-1, AF-023): the organization's
 * status is read on every authenticated request (not from the token, so a
 * suspension applies at once to already issued tokens) and a suspended one
 * gets 403 `ORGANIZATION_SUSPENDED` outside {@link allowedWhileSuspended}.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = request.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing bearer token');
    }
    let claims: AccessTokenClaims;
    try {
      claims = this.jwt.verify<AccessTokenClaims>(header.slice('Bearer '.length));
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
    request.user = {
      id: claims.sub,
      organizationId: claims.org,
      accountType: claims.typ,
      email: claims.email,
    };

    const path = (request.originalUrl ?? request.url ?? '').split('?')[0];
    if (!allowedWhileSuspended(request.method, path)) {
      // `organizations` is the global catalog (no RLS): a plain keyed read.
      const org = await this.prisma.organization.findUnique({
        where: { id: claims.org },
        select: { status: true },
      });
      if (org?.status === OrganizationStatus.Suspended) {
        throw new ForbiddenException({
          statusCode: 403,
          code: ORGANIZATION_SUSPENDED,
          message: 'This organization is suspended by the platform.',
        });
      }
    }
    return true;
  }
}
