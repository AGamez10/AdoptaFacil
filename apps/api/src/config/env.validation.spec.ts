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
      PAYMENT_DRIVER: 'epayco',
      MERCADOPAGO_PUBLIC_KEY: 'TEST-pub-dummy',
      MERCADOPAGO_ACCESS_TOKEN: 'TEST-token-dummy',
    }) as Record<string, unknown>;
    expect(env.PAYMENT_DRIVER).toBe('epayco');
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

describe('validateEnv — PAYMENT_DRIVER=epayco (ADR-PAG-002)', () => {
  it('boots in direct mode with no platform ePayco keys', () => {
    const env = validateEnv({ ...BASE, PAYMENT_DRIVER: 'epayco' });
    expect(env.PAYMENT_DRIVER).toBe('epayco');
    expect(env.EPAYCO_COLLECTION_MODE).toBe('direct_to_org');
    expect(env.EPAYCO_TEST).toBe(false);
  });

  it('fails fast in platform_split without approval ref, fee rate and platform keys', () => {
    expect(() =>
      validateEnv({ ...BASE, PAYMENT_DRIVER: 'epayco', EPAYCO_COLLECTION_MODE: 'platform_split' }),
    ).toThrow(/EPAYCO_SPLIT_APPROVAL_REF[\s\S]*EPAYCO_PLATFORM_PRIVATE_KEY/);
  });

  it('accepts platform_split with every required value', () => {
    expect(() =>
      validateEnv({
        ...BASE,
        PAYMENT_DRIVER: 'epayco',
        EPAYCO_COLLECTION_MODE: 'platform_split',
        EPAYCO_SPLIT_APPROVAL_REF: 'ticket-1',
        EPAYCO_SPLIT_FEE_RATE: '0.04',
        EPAYCO_PLATFORM_CUST_ID: '999000',
        EPAYCO_PLATFORM_P_KEY: 'p',
        EPAYCO_PLATFORM_PUBLIC_KEY: 'pub',
        EPAYCO_PLATFORM_PRIVATE_KEY: 'priv',
      }),
    ).not.toThrow();
  });

  it('rejects a fee rate outside [0, 1)', () => {
    expect(() =>
      validateEnv({ ...BASE, PAYMENT_DRIVER: 'epayco', EPAYCO_SPLIT_FEE_RATE: '1.5' }),
    ).toThrow(/EPAYCO_SPLIT_FEE_RATE/);
  });
});
