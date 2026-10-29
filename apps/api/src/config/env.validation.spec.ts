import { validateEnv } from './env.validation';

/** Minimal set of the always-required vars (no hardcoded secrets — dummy URLs). */
const BASE = {
  DATABASE_URL: 'postgresql://u:p@localhost:5433/db?schema=public',
  DATABASE_URL_APP: 'postgresql://a:a@localhost:5433/db?schema=public',
  REDIS_URL: 'redis://localhost:6379',
};

describe('validateEnv — NOTIFICATION_DRIVER fail-fast (T-109)', () => {
  it('boots with the default log driver (no SMTP vars needed)', () => {
    expect(() => validateEnv({ ...BASE })).not.toThrow();
    expect(validateEnv({ ...BASE }).NOTIFICATION_DRIVER).toBe('log');
  });

  it('fails fast when driver=smtp and credentials are missing', () => {
    expect(() => validateEnv({ ...BASE, NOTIFICATION_DRIVER: 'smtp' })).toThrow(/SMTP_HOST/);
  });

  it('accepts driver=smtp when all SMTP_* vars are present', () => {
    expect(() =>
      validateEnv({
        ...BASE,
        NOTIFICATION_DRIVER: 'smtp',
        SMTP_HOST: 'smtp.example.test',
        SMTP_PORT: '465',
        SMTP_USER: 'u@example.test',
        SMTP_PASS: 'secret',
        SMTP_FROM: 'no-reply@example.test',
      }),
    ).not.toThrow();
  });
});

describe('validateEnv — PAYMENT_DRIVER fail-fast (T-052)', () => {
  it('boots with the default fake driver (no gateway vars needed)', () => {
    expect(() => validateEnv({ ...BASE })).not.toThrow();
    expect(validateEnv({ ...BASE }).PAYMENT_DRIVER).toBe('fake');
  });

  // Mercado Pago retired from the product on 2026-10-17 (owner decision).
  it("rejects PAYMENT_DRIVER='mercadopago' (Mercado Pago retired)", () => {
    expect(() => validateEnv({ ...BASE, PAYMENT_DRIVER: 'mercadopago' })).toThrow(/PAYMENT_DRIVER/);
  });

  it('ignores leftover MERCADOPAGO_* vars in an old .env (not part of the schema any more)', () => {
    const env = validateEnv({
      ...BASE,
      PAYMENT_DRIVER: 'disabled',
      MERCADOPAGO_PUBLIC_KEY: 'TEST-pub-dummy',
      MERCADOPAGO_ACCESS_TOKEN: 'TEST-token-dummy',
    }) as Record<string, unknown>;
    expect(env.PAYMENT_DRIVER).toBe('disabled');
    expect(Object.keys(env).some((k) => k.startsWith('MERCADOPAGO_'))).toBe(false);
  });
});

describe('validateEnv — AUTH_IDENTITY_DRIVER fail-fast (T-Google-SignIn)', () => {
  it('boots with the default fake driver (no GOOGLE_OAUTH_CLIENT_ID needed)', () => {
    expect(() => validateEnv({ ...BASE })).not.toThrow();
    expect(validateEnv({ ...BASE }).AUTH_IDENTITY_DRIVER).toBe('fake');
  });

  it('fails fast when driver=google and GOOGLE_OAUTH_CLIENT_ID is missing', () => {
    expect(() => validateEnv({ ...BASE, AUTH_IDENTITY_DRIVER: 'google' })).toThrow(
      /GOOGLE_OAUTH_CLIENT_ID/,
    );
  });

  it('rejects an empty-string GOOGLE_OAUTH_CLIENT_ID the same as missing', () => {
    expect(() =>
      validateEnv({ ...BASE, AUTH_IDENTITY_DRIVER: 'google', GOOGLE_OAUTH_CLIENT_ID: '' }),
    ).toThrow(/GOOGLE_OAUTH_CLIENT_ID/);
  });

  it('accepts driver=google when GOOGLE_OAUTH_CLIENT_ID is present', () => {
    expect(() =>
      validateEnv({
        ...BASE,
        AUTH_IDENTITY_DRIVER: 'google',
        GOOGLE_OAUTH_CLIENT_ID: 'dummy-client-id.apps.googleusercontent.com',
      }),
    ).not.toThrow();
  });
});

describe('validateEnv — no real payment gateway wired', () => {
  it('accepts only the fake and disabled drivers', () => {
    expect(validateEnv({ ...BASE, PAYMENT_DRIVER: 'disabled' }).PAYMENT_DRIVER).toBe('disabled');
    expect(() => validateEnv({ ...BASE, PAYMENT_DRIVER: 'retired-gateway' })).toThrow(
      /PAYMENT_DRIVER/,
    );
  });
});
