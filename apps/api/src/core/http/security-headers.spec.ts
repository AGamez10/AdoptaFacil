import type { NextFunction, Request, Response } from 'express';
import { securityHeaders } from './security-headers';

function run(production: boolean) {
  const headers = new Map<string, string>([['X-Powered-By', 'Express']]);
  const res = {
    setHeader: (k: string, v: string) => headers.set(k, v),
    removeHeader: (k: string) => headers.delete(k),
  } as unknown as Response;
  const next = jest.fn() as NextFunction;
  securityHeaders(production)({} as Request, res, next);
  return { headers, next };
}

describe('securityHeaders', () => {
  it('sets the hardening headers on every response and continues', () => {
    const { headers, next } = run(false);
    expect(headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(headers.get('X-Frame-Options')).toBe('DENY');
    expect(headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
    expect(headers.has('X-Powered-By')).toBe(false);
    expect(next).toHaveBeenCalled();
  });

  it('only sends HSTS in production (never on local http)', () => {
    expect(run(false).headers.has('Strict-Transport-Security')).toBe(false);
    expect(run(true).headers.get('Strict-Transport-Security')).toBe('max-age=31536000');
  });
});
