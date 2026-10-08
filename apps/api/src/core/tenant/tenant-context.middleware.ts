import { Injectable, Optional, type NestMiddleware } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { NextFunction, Request, Response } from 'express';
import type { AccessTokenClaims } from '@adoptafacil/contracts';
import { TenantContextService } from './tenant-context.service';

/** RFC 4122 UUID (any version). Reject anything else so a bad value never
 *  reaches the database as an org id. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Establishes the per-request tenant context. The organization comes ONLY from
 * the authenticated principal: the `org` claim of a valid access token (AF-009).
 * No header, query string or body can choose the tenant — the former `x-org-id`
 * fallback was removed. When an org is resolved, the rest of the request runs
 * inside `TenantContextService.run({ organizationId })` so `withTenant` and RLS
 * see the right tenant. With no valid token, the request proceeds WITHOUT a
 * context — business queries then hit RLS with no `app.current_org_id` and see
 * zero rows, and `withTenant` rejects. The context is bound to the request's
 * async chain, so it is discarded when the request ends (no leakage between
 * requests).
 *
 * `JwtService` is optional so the middleware still loads when the auth module
 * is absent (e.g. isolated tests); without it no request gets a tenant context.
 */
@Injectable()
export class TenantContextMiddleware implements NestMiddleware {
  constructor(
    private readonly tenant: TenantContextService,
    @Optional() private readonly jwt?: JwtService,
  ) {}

  use(req: Request, _res: Response, next: NextFunction): void {
    const organizationId = this.orgFromToken(req);
    if (organizationId) {
      this.tenant.run({ organizationId }, () => next());
      return;
    }
    next();
  }

  /** Organization from the access token's `org` claim (the only source). */
  private orgFromToken(req: Request): string | undefined {
    if (!this.jwt) {
      return undefined;
    }
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      return undefined;
    }
    try {
      const claims = this.jwt.verify<AccessTokenClaims>(header.slice('Bearer '.length));
      return typeof claims.org === 'string' && UUID_RE.test(claims.org) ? claims.org : undefined;
    } catch {
      // Invalid/expired token: no tenant context. The JwtAuthGuard is what
      // actually rejects protected routes.
      return undefined;
    }
  }
}
