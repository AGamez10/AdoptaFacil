import { createHash } from 'node:crypto';
import type { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.validation';
import {
  createPkcePair,
  MERCADOPAGO_DEFAULT_TOKEN_TTL_SECONDS,
  MercadoPagoOAuthClient,
  MercadoPagoOAuthError,
  safeOAuthDescription,
} from './mercadopago-oauth.client';

function makeConfig(overrides: Record<string, unknown> = {}): ConfigService<Env, true> {
  const values: Record<string, unknown> = {
    MERCADOPAGO_BASE_URL: 'https://api.mp.test',
    MERCADOPAGO_CLIENT_ID: '1234567890',
    MERCADOPAGO_CLIENT_SECRET: 'client-secret-for-tests',
    API_PUBLIC_BASE_URL: 'https://api.adoptafacil.test',
    ...overrides,
  };
  return { get: (key: string) => values[key] } as unknown as ConfigService<Env, true>;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const GRANT = {
  access_token: 'APP_USR-access',
  refresh_token: 'TG-refresh',
  expires_in: 15_552_000,
  user_id: 123456789,
  public_key: 'APP_USR-public',
  live_mode: true,
  scope: 'offline_access read write',
};

describe('MercadoPagoOAuthClient (ADR-PAG-003)', () => {
  it('builds the Colombian authorize URL with the redirect derived from the API origin', () => {
    const client = new MercadoPagoOAuthClient(makeConfig(), jest.fn());
    const url = new URL(client.buildAuthorizeUrl('st'));
    expect(url.origin + url.pathname).toBe('https://auth.mercadopago.com.co/authorization');
    expect(url.searchParams.get('client_id')).toBe('1234567890');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('platform_id')).toBe('mp');
    expect(url.searchParams.get('state')).toBe('st');
    expect(url.searchParams.get('redirect_uri')).toBe(
      'https://api.adoptafacil.test/org/mercadopago/callback',
    );
    expect(url.searchParams.has('code_challenge')).toBe(false);
    // The secret never appears in a browser-facing URL.
    expect(url.toString()).not.toContain('client-secret');
  });

  it('describes the non-secret OAuth setup to compare with the panel', () => {
    const client = new MercadoPagoOAuthClient(makeConfig(), jest.fn());
    const lines = client.describeOAuthSetup();
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('client_id=1234567890');
    expect(lines[0]).toContain(
      'redirect_uri=https://api.adoptafacil.test/org/mercadopago/callback',
    );
    expect(lines.join('\n')).not.toContain('client-secret');
  });

  it('warns when the redirect URI is http or localhost (the panel cannot match it)', () => {
    const client = new MercadoPagoOAuthClient(
      makeConfig({ API_PUBLIC_BASE_URL: 'http://localhost:3000' }),
      jest.fn(),
    );
    const text = client.describeOAuthSetup().join('\n');
    expect(text).toContain('not https');
    expect(text).toContain('localhost');
  });

  it('encodes the redirect_uri exactly once and logs it raw and encoded, hiding the state', () => {
    const redirect = 'https://t.trycloudflare.com/api/org/mercadopago/callback';
    const client = new MercadoPagoOAuthClient(
      makeConfig({ MERCADOPAGO_OAUTH_REDIRECT_URI: redirect }),
      jest.fn(),
    );
    const url = client.buildAuthorizeUrl('sealed-state-value');
    // Single encoding: ':' -> %3A once, never %253A.
    expect(url).toContain(
      'redirect_uri=https%3A%2F%2Ft.trycloudflare.com%2Fapi%2Forg%2Fmercadopago%2Fcallback',
    );
    expect(url).not.toContain('%25');
    const lines = client.describeAuthorizeUrl(url).join('\n');
    expect(lines).toContain(`redirect_uri (raw)=${redirect}`);
    expect(lines).toContain('encoded exactly once=true');
    expect(lines).toContain('trailing slash=false');
    expect(lines).toContain('state=<redacted>');
    expect(lines).not.toContain('sealed-state-value');
    expect(lines).not.toContain('client-secret');
  });

  it('flags a trailing slash on the redirect_uri (callback and callback/ differ for Mercado Pago)', () => {
    const client = new MercadoPagoOAuthClient(
      makeConfig({
        MERCADOPAGO_OAUTH_REDIRECT_URI: 'https://t.example.com/api/org/mercadopago/callback/',
      }),
      jest.fn(),
    );
    expect(client.describeOAuthSetup().join('\n')).toContain('ends with "/"');
    expect(client.describeAuthorizeUrl(client.buildAuthorizeUrl('s')).join('\n')).toContain(
      'trailing slash=true',
    );
  });

  it('shows whether the plans token belongs to the same app as the OAuth client_id', () => {
    const same = new MercadoPagoOAuthClient(
      makeConfig({ MERCADOPAGO_PLATFORM_ACCESS_TOKEN: 'APP_USR-1234567890-110912-abc-55' }),
      jest.fn(),
    );
    expect(same.describeOAuthSetup().join('\n')).toContain('SAME as MERCADOPAGO_CLIENT_ID');
    const other = new MercadoPagoOAuthClient(
      makeConfig({ MERCADOPAGO_PLATFORM_ACCESS_TOKEN: 'APP_USR-999-110912-abc-55' }),
      jest.fn(),
    );
    const text = other.describeOAuthSetup().join('\n');
    expect(text).toContain('app 999 (different from MERCADOPAGO_CLIENT_ID)');
    expect(text).not.toContain('abc-55');
  });

  it('trims error_description and removes every value we sent', () => {
    expect(safeOAuthDescription('bad\nredirect  TG-secret-code ok', ['TG-secret-code'])).toBe(
      'bad redirect [redacted] ok',
    );
    expect(safeOAuthDescription('x'.repeat(500))).toHaveLength(200);
    expect(safeOAuthDescription(undefined)).toBeUndefined();
  });

  it('adds an S256 PKCE challenge when given one', () => {
    const { verifier, challenge } = createPkcePair();
    expect(challenge).toBe(createHash('sha256').update(verifier).digest('base64url'));
    const client = new MercadoPagoOAuthClient(makeConfig(), jest.fn());
    const url = new URL(client.buildAuthorizeUrl('st', challenge));
    expect(url.searchParams.get('code_challenge')).toBe(challenge);
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
  });

  it('exchanges the code (form-encoded, with verifier and sandbox flag) and validates the grant', async () => {
    const fetchFn = jest.fn(async () => json(GRANT));
    const client = new MercadoPagoOAuthClient(makeConfig({ MERCADOPAGO_TEST: true }), fetchFn);
    const grant = await client.exchangeCode('TG-code', 'verifier-1');
    expect(grant).toEqual({
      accessToken: 'APP_USR-access',
      refreshToken: 'TG-refresh',
      expiresIn: 15_552_000,
      userId: '123456789',
      publicKey: 'APP_USR-public',
      liveMode: true,
      scope: 'offline_access read write',
    });
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.mp.test/oauth/token');
    const body = new URLSearchParams(String(init.body));
    expect(body.get('grant_type')).toBe('authorization_code');
    expect(body.get('code')).toBe('TG-code');
    expect(body.get('code_verifier')).toBe('verifier-1');
    expect(body.get('test_token')).toBe('true');
    expect(body.get('redirect_uri')).toBe('https://api.adoptafacil.test/org/mercadopago/callback');
  });

  it('defaults the lifetime and refuses a grant without user id or token', async () => {
    const noTtl = new MercadoPagoOAuthClient(
      makeConfig(),
      jest.fn(async () => json({ ...GRANT, expires_in: undefined })),
    );
    expect((await noTtl.refreshToken('TG-refresh')).expiresIn).toBe(
      MERCADOPAGO_DEFAULT_TOKEN_TTL_SECONDS,
    );
    const broken = new MercadoPagoOAuthClient(
      makeConfig(),
      jest.fn(async () => json({ access_token: 'x' })),
    );
    await expect(broken.exchangeCode('c')).rejects.toBeInstanceOf(MercadoPagoOAuthError);
  });

  it('flags invalid_grant so the connection is marked for reconnection', async () => {
    const client = new MercadoPagoOAuthClient(
      makeConfig(),
      jest.fn(async () => json({ error: 'invalid_grant', message: 'echo of something' }, 400)),
    );
    const error = await client.refreshToken('TG-old').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(MercadoPagoOAuthError);
    expect((error as MercadoPagoOAuthError).invalidGrant).toBe(true);
    expect((error as Error).message).not.toContain('echo of something');
  });

  it('expects live grants in production and test grants in sandbox; every call has a timeout', async () => {
    expect(new MercadoPagoOAuthClient(makeConfig(), jest.fn()).expectedLiveMode()).toBe(true);
    expect(
      new MercadoPagoOAuthClient(
        makeConfig({ MERCADOPAGO_TEST: true }),
        jest.fn(),
      ).expectedLiveMode(),
    ).toBe(false);
    const fetchFn = jest.fn(async () => json(GRANT));
    await new MercadoPagoOAuthClient(makeConfig(), fetchFn).refreshToken('TG-refresh');
    const [, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('refuses to call Mercado Pago when the app is not configured', async () => {
    const fetchFn = jest.fn();
    const client = new MercadoPagoOAuthClient(
      makeConfig({ MERCADOPAGO_CLIENT_SECRET: undefined }),
      fetchFn,
    );
    expect(client.isConfigured()).toBe(false);
    await expect(client.exchangeCode('c')).rejects.toThrow(/not configured/);
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
