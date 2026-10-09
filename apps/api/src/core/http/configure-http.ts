import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { securityHeaders } from './security-headers';

export interface HttpHardeningOptions {
  production: boolean;
  /** Reverse-proxy hops in front of the API (TRUST_PROXY_HOPS). */
  trustProxyHops: number;
}

/**
 * HTTP hardening shared by `main.ts` and the integration tests, so what the
 * tests assert is exactly what production runs (Ola 1, R1-3):
 *  - no `X-Powered-By: Express`;
 *  - `trust proxy` as a HOP COUNT (never `true`): req.ip is the client address
 *    the trusted proxy saw, so a forged X-Forwarded-For cannot pick the
 *    rate-limit bucket, and behind Caddy every user no longer shares one IP;
 *  - security headers on every response (HSTS only in production).
 */
export function applyHttpHardening(app: INestApplication, options: HttpHardeningOptions): void {
  const express = app as NestExpressApplication;
  express.disable('x-powered-by');
  express.set('trust proxy', options.trustProxyHops);
  express.use(securityHeaders({ hsts: options.production }));
}
