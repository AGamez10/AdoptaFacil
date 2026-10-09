import type { NextFunction, Request, Response } from 'express';

/**
 * Security headers for every API response (Ola 1, R1-3, SEC-009). Written by
 * hand instead of adding helmet: the API only serves JSON and stored files,
 * so the set is short and each header is explained here.
 *
 * Deliberately NOT sent: Cross-Origin-Resource-Policy (the web app on another
 * origin loads images from /storage/public) and Cross-Origin-Embedder-Policy.
 */
export const BASE_SECURITY_HEADERS: Readonly<Record<string, string>> = {
  // Stored files keep their declared Content-Type; never let the browser sniff
  // an upload into HTML or script.
  'X-Content-Type-Options': 'nosniff',
  // Nothing the API serves is meant to run code or be framed. If an uploaded
  // file ever reaches the browser as HTML, it cannot load or execute anything.
  'Content-Security-Policy':
    "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
};

/** HSTS: only in production, where the API is served over TLS (Caddy/Render). */
export const HSTS_HEADER = 'max-age=31536000; includeSubDomains';

export function securityHeaders(options: { hsts: boolean }) {
  const headers = options.hsts
    ? { ...BASE_SECURITY_HEADERS, 'Strict-Transport-Security': HSTS_HEADER }
    : BASE_SECURITY_HEADERS;
  return (_req: Request, res: Response, next: NextFunction): void => {
    for (const [name, value] of Object.entries(headers)) {
      res.setHeader(name, value);
    }
    next();
  };
}
