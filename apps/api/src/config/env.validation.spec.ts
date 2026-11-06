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

  const SMTP_MIN = {
    ...BASE,
    NOTIFICATION_DRIVER: 'smtp',
    SMTP_HOST: 'postfix',
    SMTP_PORT: '25',
    SMTP_FROM: 'no-reply@example.test',
  };

  it('accepts an internal relay without SMTP_USER/SMTP_PASS (both absent)', () => {
    expect(() => validateEnv(SMTP_MIN)).not.toThrow();
  });

  it('refuses SMTP_USER without SMTP_PASS (they go together)', () => {
    expect(() => validateEnv({ ...SMTP_MIN, SMTP_USER: 'u' })).toThrow(/SMTP_PASS/);
  });

  it('refuses a partial DKIM config and accepts the full one', () => {
    expect(() => validateEnv({ ...SMTP_MIN, SMTP_DKIM_DOMAIN: 'example.test' })).toThrow(
      /SMTP_DKIM_SELECTOR[\s\S]*SMTP_DKIM_PRIVATE_KEY|SMTP_DKIM_PRIVATE_KEY[\s\S]*SMTP_DKIM_SELECTOR/,
    );
    expect(() =>
      validateEnv({
        ...SMTP_MIN,
        SMTP_DKIM_DOMAIN: 'example.test',
        SMTP_DKIM_SELECTOR: 'af1',
        SMTP_DKIM_PRIVATE_KEY: 'pem-line-1\\npem-line-2',
      }),
    ).not.toThrow();
  });
});

describe('validateEnv — PAYMENT_DRIVER fail-fast (T-052)', () => {
  it('boots with the default fake driver (no gateway vars needed)', () => {
    expect(() => validateEnv({ ...BASE })).not.toThrow();
    expect(validateEnv({ ...BASE }).PAYMENT_DRIVER).toBe('fake');
  });

  // ADR-PAG-003 (2026-11-06): Mercado Pago is back, with each org's OAuth grant.
  it("PAYMENT_DRIVER='mercadopago' fails fast without the application credentials", () => {
    expect(() => validateEnv({ ...BASE, PAYMENT_DRIVER: 'mercadopago' })).toThrow(
      /MERCADOPAGO_CLIENT_ID/,
    );
    expect(() =>
      validateEnv({
        ...BASE,
        PAYMENT_DRIVER: 'mercadopago',
        MERCADOPAGO_CLIENT_ID: '123',
        MERCADOPAGO_CLIENT_SECRET: 'client-secret-dummy',
      }),
    ).toThrow(/MERCADOPAGO_WEBHOOK_SECRET/);
  });

  it("boots PAYMENT_DRIVER='mercadopago' with client id, secret and webhook secret (no platform token needed)", () => {
    const env = validateEnv({
      ...BASE,
      PAYMENT_DRIVER: 'mercadopago',
      MERCADOPAGO_CLIENT_ID: '123',
      MERCADOPAGO_CLIENT_SECRET: 'client-secret-dummy',
      MERCADOPAGO_WEBHOOK_SECRET: 'webhook-secret-dummy',
    });
    expect(env.PAYMENT_DRIVER).toBe('mercadopago');
    expect(env.MERCADOPAGO_TOKEN_REFRESH_WINDOW_DAYS).toBe(30);
    expect(env.MERCADOPAGO_OAUTH_PKCE).toBe(false);
  });

  it('ignores the vars of the retired integration (MERCADOPAGO_ACCESS_TOKEN/PUBLIC_KEY)', () => {
    const env = validateEnv({
      ...BASE,
      PAYMENT_DRIVER: 'epayco',
      MERCADOPAGO_PUBLIC_KEY: 'TEST-pub-dummy',
      MERCADOPAGO_ACCESS_TOKEN: 'TEST-token-dummy',
    }) as Record<string, unknown>;
    expect(env.PAYMENT_DRIVER).toBe('epayco');
    expect(env.MERCADOPAGO_ACCESS_TOKEN).toBeUndefined();
    expect(env.MERCADOPAGO_PUBLIC_KEY).toBeUndefined();
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
