import { PRODUCTION_FORBIDDEN_DRIVERS, parseRedisUrl, validateEnv } from './env.validation';

/**
 * Ola 1 · R0-1 (SEC-001, SEC-002, SEC-003) and R1-1/R1-3/R1-7: production must
 * refuse to boot with simulated adapters or unsafe settings. Every case here
 * goes through `validateEnv`, the same hook ConfigModule runs at boot.
 */

const BASE = {
  DATABASE_URL: 'postgresql://u:p@localhost:5433/db?schema=public',
  DATABASE_URL_APP: 'postgresql://a:a@localhost:5433/db?schema=public',
  REDIS_URL: 'redis://localhost:6379',
};

/** A production configuration that is allowed to boot (money off). */
const SAFE_PRODUCTION = {
  ...BASE,
  NODE_ENV: 'production',
  AUTH_IDENTITY_DRIVER: 'disabled',
  PAYMENT_DRIVER: 'disabled',
  STORAGE_DRIVER: 'disk',
  NOTIFICATION_DRIVER: 'smtp',
  SMTP_HOST: 'smtp.example.test',
  SMTP_PORT: '465',
  SMTP_USER: 'u@example.test',
  SMTP_PASS: 'dummy',
  SMTP_FROM: 'no-reply@example.test',
  DIAN_DRIVER: 'disabled',
  SIGNATURE_DRIVER: 'disabled',
  TRUST_PROXY_HOPS: '1',
  THROTTLER_STORAGE: 'redis',
  WEB_BASE_URL: 'https://adoptafacil.co',
};

function omit(env: Record<string, string>, ...keys: string[]): Record<string, string> {
  return Object.fromEntries(Object.entries(env).filter(([key]) => !keys.includes(key)));
}

describe('production guard (R0-1)', () => {
  it('accepts an https WEB_BASE_URL, including the CI stack on https://localhost', () => {
    expect(() =>
      validateEnv({ ...SAFE_PRODUCTION, WEB_BASE_URL: 'https://localhost' }),
    ).not.toThrow();
  });

  it.each([
    ['the dev default (http://localhost:5173)', undefined],
    ['plain http', 'http://adoptafacil.co'],
  ])('refuses production when WEB_BASE_URL is %s (emailed links would not open)', (_c, url) => {
    const env = url
      ? { ...SAFE_PRODUCTION, WEB_BASE_URL: url }
      : omit(SAFE_PRODUCTION, 'WEB_BASE_URL');
    expect(() => validateEnv(env)).toThrow(/WEB_BASE_URL must be the public https origin/);
  });

  it('boots a production config with every simulated adapter replaced', () => {
    expect(() => validateEnv(SAFE_PRODUCTION)).not.toThrow();
  });

  it('refuses production when the drivers are left to their (simulated) defaults', () => {
    const withoutDrivers = omit(
      SAFE_PRODUCTION,
      'AUTH_IDENTITY_DRIVER',
      'PAYMENT_DRIVER',
      'NOTIFICATION_DRIVER',
      'DIAN_DRIVER',
      'SIGNATURE_DRIVER',
    );
    expect(() => validateEnv(withoutDrivers)).toThrow(
      /AUTH_IDENTITY_DRIVER=fake[\s\S]*PAYMENT_DRIVER=fake[\s\S]*NOTIFICATION_DRIVER=log[\s\S]*DIAN_DRIVER=fake[\s\S]*SIGNATURE_DRIVER=fake/,
    );
  });

  // SEC-001: the fake identity adapter accepted `fake:<email>:x` for any account.
  // SEC-002: the fake payment adapter approved unsigned webhooks.
  // SEC-003: the fake DIAN adapter auto-verified RTE.
  const cases = Object.entries(PRODUCTION_FORBIDDEN_DRIVERS).flatMap(([key, values]) =>
    values.map((value) => [key, value] as const),
  );
  it.each(cases)('refuses %s=%s in production', (key, value) => {
    expect(() => validateEnv({ ...SAFE_PRODUCTION, [key]: value })).toThrow(
      new RegExp(`${key}=${value} is a simulated adapter`),
    );
  });

  it('covers every port that has a simulated adapter', () => {
    expect(Object.keys(PRODUCTION_FORBIDDEN_DRIVERS).sort()).toEqual(
      [
        'AUTH_IDENTITY_DRIVER',
        'DIAN_DRIVER',
        'NOTIFICATION_DRIVER',
        'PAYMENT_DRIVER',
        'SIGNATURE_DRIVER',
        'STORAGE_DRIVER',
      ].sort(),
    );
  });

  it('still lets development and test use the simulated adapters', () => {
    for (const NODE_ENV of ['development', 'test']) {
      const env = validateEnv({ ...BASE, NODE_ENV });
      expect(env.AUTH_IDENTITY_DRIVER).toBe('fake');
      expect(env.PAYMENT_DRIVER).toBe('fake');
    }
  });

  it('accepts the real Google adapter in production when its client id is set', () => {
    expect(() =>
      validateEnv({
        ...SAFE_PRODUCTION,
        AUTH_IDENTITY_DRIVER: 'google',
        GOOGLE_OAUTH_CLIENT_ID: 'dummy.apps.googleusercontent.com',
      }),
    ).not.toThrow();
  });

  it('requires TRUST_PROXY_HOPS to be declared in production (R1-3)', () => {
    const env = omit(SAFE_PRODUCTION, 'TRUST_PROXY_HOPS');
    expect(() => validateEnv(env)).toThrow(/TRUST_PROXY_HOPS/);
    expect(() => validateEnv({ ...env, TRUST_PROXY_HOPS: '0' })).not.toThrow();
  });

  it('requires the shared Redis rate-limit store in production (R1-3)', () => {
    expect(() => validateEnv({ ...SAFE_PRODUCTION, THROTTLER_STORAGE: 'memory' })).toThrow(
      /THROTTLER_STORAGE/,
    );
  });
  it('refuses to boot production with platform MFA switched off (F19)', () => {
    expect(() => validateEnv({ ...SAFE_PRODUCTION, PLATFORM_MFA_REQUIRED: 'false' })).toThrow(
      /PLATFORM_MFA_REQUIRED/,
    );
    expect(() => validateEnv({ ...SAFE_PRODUCTION, PLATFORM_MFA_REQUIRED: 'true' })).not.toThrow();
  });

  it('keeps platform MFA on unless it is explicitly "false" (fail closed)', () => {
    expect(validateEnv(BASE).PLATFORM_MFA_REQUIRED).toBe(true);
    for (const value of ['', 'no', '0', 'off', 'TRUE']) {
      expect(validateEnv({ ...BASE, PLATFORM_MFA_REQUIRED: value }).PLATFORM_MFA_REQUIRED).toBe(
        true,
      );
    }
    expect(validateEnv({ ...BASE, PLATFORM_MFA_REQUIRED: 'false' }).PLATFORM_MFA_REQUIRED).toBe(
      false,
    );
  });
});

describe('module feature flags (R1-1)', () => {
  it('are all off by default', () => {
    const env = validateEnv(BASE);
    expect(env.FEATURE_PAYMENTS).toBe(false);
    expect(env.FEATURE_SPONSORSHIPS).toBe(false);
    expect(env.FEATURE_DONATION_CERTIFICATES).toBe(false);
    expect(env.FEATURE_COMMUNITY).toBe(false);
    expect(env.FEATURE_REPUTATION).toBe(false);
    expect(env.FEATURE_RESOURCES).toBe(false);
    expect(env.FEATURE_MARKETPLACE).toBe(false);
    expect(env.FEATURE_VOLUNTEERING_MINORS).toBe(false);
  });

  it('turn on only for the exact string "true" (fail closed)', () => {
    expect(validateEnv({ ...BASE, FEATURE_COMMUNITY: 'true' }).FEATURE_COMMUNITY).toBe(true);
    for (const value of ['TRUE', '1', 'yes', 'on', 'false']) {
      expect(validateEnv({ ...BASE, FEATURE_COMMUNITY: value }).FEATURE_COMMUNITY).toBe(false);
    }
  });

  it('refuses money modules in production without a real gateway and a written approval', () => {
    expect(() => validateEnv({ ...SAFE_PRODUCTION, FEATURE_PAYMENTS: 'true' })).toThrow(
      /PAYMENT_DRIVER[\s\S]*PAYMENTS_PRODUCTION_APPROVAL_REF/,
    );
    // No real gateway is wired today: even with the approval reference the
    // money modules cannot be switched on in production.
    for (const flag of ['FEATURE_PAYMENTS', 'FEATURE_SPONSORSHIPS']) {
      expect(() =>
        validateEnv({
          ...SAFE_PRODUCTION,
          [flag]: 'true',
          PAYMENTS_PRODUCTION_APPROVAL_REF: 'acta-2026-10-01',
        }),
      ).toThrow(/PAYMENT_DRIVER/);
    }
  });

  it("accepts PAYMENT_DRIVER='mercadopago' for money modules in production (ADR-PAG-003)", () => {
    const mp = {
      PAYMENT_DRIVER: 'mercadopago',
      MERCADOPAGO_CLIENT_ID: '123',
      MERCADOPAGO_CLIENT_SECRET: 'client-secret-dummy',
      MERCADOPAGO_WEBHOOK_SECRET: 'webhook-secret-dummy',
      API_PUBLIC_BASE_URL: 'https://api.adoptafacil.co',
    };
    expect(() =>
      validateEnv({
        ...SAFE_PRODUCTION,
        ...mp,
        FEATURE_PAYMENTS: 'true',
        PAYMENTS_PRODUCTION_APPROVAL_REF: 'acta-2026-11-06',
      }),
    ).not.toThrow();
    // The OAuth code and every notification travel to the API: https only.
    expect(() =>
      validateEnv({
        ...SAFE_PRODUCTION,
        ...mp,
        API_PUBLIC_BASE_URL: 'http://api.adoptafacil.co',
      }),
    ).toThrow(/API_PUBLIC_BASE_URL/);
    expect(() =>
      validateEnv({
        ...SAFE_PRODUCTION,
        ...mp,
        MERCADOPAGO_OAUTH_REDIRECT_URI: 'http://api.adoptafacil.co/org/mercadopago/callback',
      }),
    ).toThrow(/MERCADOPAGO_OAUTH_REDIRECT_URI/);
    // Mercado Pago's hosts are pinned in production (test overrides only).
    expect(() =>
      validateEnv({ ...SAFE_PRODUCTION, ...mp, MERCADOPAGO_BASE_URL: 'https://api.mp.test' }),
    ).toThrow(/MERCADOPAGO_BASE_URL/);
    expect(() =>
      validateEnv({
        ...SAFE_PRODUCTION,
        ...mp,
        MERCADOPAGO_AUTHORIZE_URL: 'https://auth.mercadopago.com.evil.co/authorization',
      }),
    ).toThrow(/MERCADOPAGO_AUTHORIZE_URL/);
    expect(() =>
      validateEnv({
        ...SAFE_PRODUCTION,
        ...mp,
        MERCADOPAGO_BASE_URL: 'https://api.mercadopago.com/',
        MERCADOPAGO_AUTHORIZE_URL: 'https://auth.mercadopago.com.ar/authorization',
      }),
    ).not.toThrow();
    // Still needs the written approval reference.
    expect(() => validateEnv({ ...SAFE_PRODUCTION, ...mp, FEATURE_PAYMENTS: 'true' })).toThrow(
      /PAYMENTS_PRODUCTION_APPROVAL_REF/,
    );
  });

  it('refuses donation certificates without payments in production', () => {
    expect(() =>
      validateEnv({ ...SAFE_PRODUCTION, FEATURE_DONATION_CERTIFICATES: 'true' }),
    ).toThrow(/FEATURE_DONATION_CERTIFICATES/);
  });

  it('refuses volunteering with minors in production', () => {
    expect(() => validateEnv({ ...SAFE_PRODUCTION, FEATURE_VOLUNTEERING_MINORS: 'true' })).toThrow(
      /FEATURE_VOLUNTEERING_MINORS/,
    );
    expect(
      validateEnv({ ...BASE, FEATURE_VOLUNTEERING_MINORS: 'true' }).FEATURE_VOLUNTEERING_MINORS,
    ).toBe(true);
  });
});

describe('empty values count as unset (R0-5, BLD-001)', () => {
  it('boots with the .env that `pnpm setup:env` generates (empty optional keys)', () => {
    expect(() =>
      validateEnv({
        ...BASE,
        SMTP_HOST: '',
        SMTP_PORT: '',
        SMTP_USER: '',
        SMTP_PASS: '',
        SMTP_FROM: '',
        GOOGLE_OAUTH_CLIENT_ID: '',
      }),
    ).not.toThrow();
  });

  it('still fails when a driver needs a value that is empty', () => {
    expect(() => validateEnv({ ...BASE, NOTIFICATION_DRIVER: 'smtp', SMTP_HOST: '' })).toThrow(
      /SMTP_HOST is required/,
    );
  });
});

describe('parseRedisUrl keeps the whole REDIS_URL (R1-7, BLD-003)', () => {
  it('keeps host and port, defaulting db 0', () => {
    expect(parseRedisUrl('redis://localhost:6379')).toEqual({
      host: 'localhost',
      port: 6379,
      db: 0,
    });
  });

  it('keeps the database index, credentials and TLS', () => {
    expect(parseRedisUrl('rediss://app:s%40cret@redis.internal:6380/2')).toEqual({
      host: 'redis.internal',
      port: 6380,
      db: 2,
      username: 'app',
      password: 's@cret',
      tls: {},
    });
  });

  it('keeps a password given without a user (redis://:pass@host)', () => {
    expect(parseRedisUrl('redis://:only-pass@localhost/1')).toEqual({
      host: 'localhost',
      port: 6379,
      db: 1,
      password: 'only-pass',
    });
  });

  it('rejects a non-numeric database index', () => {
    expect(() => parseRedisUrl('redis://localhost:6379/abc')).toThrow(/database index/);
  });
});
