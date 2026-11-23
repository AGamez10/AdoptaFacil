import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  Injectable,
} from '@nestjs/common';
import { BaseExceptionFilter, HttpAdapterHost } from '@nestjs/core';
import { AlertsService } from './alerts.service';

interface RequestLike {
  method?: string;
  baseUrl?: string;
  route?: { path?: string };
  id?: string;
  headers?: Record<string, string | string[] | undefined>;
}

/**
 * Global filter: every unexpected error (a 5xx or anything that is not an
 * HttpException) raises an alert; then Nest's default handling answers the
 * request EXACTLY as before (same status and body). 4xx are user errors and
 * never alert. Only the route TEMPLATE is reported (no ids, query or body).
 */
@Catch()
@Injectable()
export class AlertingExceptionFilter implements ExceptionFilter {
  private base?: BaseExceptionFilter;

  constructor(
    private readonly adapterHost: HttpAdapterHost,
    private readonly alerts: AlertsService,
  ) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    if (host.getType() === 'http') {
      const status = exception instanceof HttpException ? exception.getStatus() : 500;
      if (status >= 500) {
        const req = host.switchToHttp().getRequest<RequestLike>();
        const route = `${req.baseUrl ?? ''}${req.route?.path ?? '(sin ruta)'}`;
        const name = exception instanceof Error ? exception.name : typeof exception;
        const message = exception instanceof Error ? exception.message : String(exception);
        const requestId = req.headers?.['x-request-id'];
        void this.alerts.notify(
          `http:${req.method} ${route}:${name}`,
          `Error ${status} en ${req.method} ${route}: ${name}: ${message}` +
            (typeof requestId === 'string' ? ` (petición ${requestId.slice(0, 64)})` : ''),
        );
      }
    }
    this.base ??= new BaseExceptionFilter(this.adapterHost.httpAdapter);
    this.base.catch(exception, host);
  }
}
