import {
  type CallHandler,
  type ExecutionContext,
  HttpException,
  Injectable,
  Logger,
  type NestInterceptor,
} from '@nestjs/common';
import { catchError, concatMap, from, map, type Observable, throwError } from 'rxjs';
import { AuditService } from '../audit/audit.service';
import type { AuthenticatedRequest } from '../auth/auth.types';

/** Polling reads that would only flood the trail (they expose nothing new). */
const SKIP: readonly RegExp[] = [
  /^GET \/platform\/workspace\/(me|activity)$/,
  /^GET \/platform\/review-claims$/,
];

/**
 * Platform access log (F19 security). Every request that reached its data
 * only through a platform role (marked by RolesGuard after the MFA check) is
 * recorded in the staff member's TEAM trail — append-only, UTC — with the
 * route template, the path ids, the outcome and the client address. Never the
 * body. The entry is written before the response leaves, so a request that
 * could not be logged is not answered as a success.
 */
@Injectable()
export class PlatformAccessInterceptor implements NestInterceptor {
  private readonly logger = new Logger(PlatformAccessInterceptor.name);

  constructor(private readonly audit: AuditService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    return next.handle().pipe(
      concatMap((body) => from(this.record(request, 'ok', 200)).pipe(map(() => body))),
      catchError((error: unknown) => {
        const status = error instanceof HttpException ? error.getStatus() : 500;
        return from(this.record(request, 'error', status)).pipe(
          concatMap(() => throwError(() => error)),
        );
      }),
    );
  }

  private async record(
    request: AuthenticatedRequest,
    outcome: 'ok' | 'error',
    status: number,
  ): Promise<void> {
    const mark = request.platformAccess;
    if (!mark || !request.user) return;
    const route = (request.route?.path as string | undefined) ?? request.path;
    const key = `${request.method} ${route}`;
    if (SKIP.some((pattern) => pattern.test(key))) return;
    const params = Object.fromEntries(
      Object.entries(request.params ?? {}).filter(([, value]) =>
        /^[0-9a-f-]{36}$/i.test(String(value)),
      ),
    );
    try {
      await this.audit.record({
        organizationId: mark.teamOrganizationId,
        actorUserId: request.user.id,
        action: 'platform.request',
        entityType: 'platform_route',
        entityId: null,
        metadata: {
          method: request.method,
          route,
          params,
          outcome,
          status,
          roles: mark.roles,
          ip: request.ip ?? null,
        },
      });
    } catch (error) {
      if (outcome === 'ok') throw error;
      this.logger.error(`platform access log failed: ${(error as Error).name}`);
    }
  }
}
