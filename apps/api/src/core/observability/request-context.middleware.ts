import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { httpRequestDuration } from './metrics';

const INCOMING_ID = /^[A-Za-z0-9-]{8,64}$/;

/** Route TEMPLATE of a matched request, never the concrete URL. */
export function routeTemplate(req: Request): string {
  const route = (req as Request & { route?: { path?: string } }).route?.path;
  return route ? `${req.baseUrl ?? ''}${route}` : 'unmatched';
}

/**
 * Plan de escala (B9): every request gets an id (`X-Request-Id`, kept from the
 * proxy when well formed) and, when it finishes, its latency is recorded by
 * route template. With HTTP_ACCESS_LOG=true one JSON line per request goes to
 * stdout: time, id, method, route template, status, ms — no URL, query, body,
 * IP or user, so the log never carries personal data.
 */
export function requestContext(options: { accessLog: boolean }) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const incoming = req.headers['x-request-id'];
    const id = typeof incoming === 'string' && INCOMING_ID.test(incoming) ? incoming : randomUUID();
    (req as Request & { id?: string }).id = id;
    res.setHeader('X-Request-Id', id);
    const started = process.hrtime.bigint();
    res.on('finish', () => {
      const seconds = Number(process.hrtime.bigint() - started) / 1e9;
      const route = routeTemplate(req);
      httpRequestDuration.observe(
        { method: req.method, route, status: `${Math.floor(res.statusCode / 100)}xx` },
        seconds,
      );
      if (options.accessLog) {
        process.stdout.write(
          `${JSON.stringify({
            t: new Date().toISOString(),
            rid: id,
            method: req.method,
            route,
            status: res.statusCode,
            ms: Math.round(seconds * 1000),
          })}\n`,
        );
      }
    });
    next();
  };
}
