import { createHash, randomBytes } from 'node:crypto';
import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MERCADOPAGO_USER_ID_PATTERN } from '@adoptafacil/contracts';
import type { Env } from '../../config/env.validation';
import { mercadoPagoTimeoutSignal } from './mercadopago-http';

/** Injectable fetch surface so tests run with ZERO network. */
export type MercadoPagoOAuthFetch = typeof fetch;

/**
 * Colombia's OAuth authorization host. The token exchange is on the API host
 * (`MERCADOPAGO_BASE_URL`). Overridable only for tests.
 * Source: https://www.mercadopago.com.co/developers/es/docs/security/oauth/creation
 */
export const MERCADOPAGO_AUTHORIZE_URL_DEFAULT = 'https://auth.mercadopago.com.co/authorization';

/** Validated token pair (both grants answer the same shape). */
export interface MercadoPagoTokenGrant {
  accessToken: string;
  refreshToken: string | null;
  /** Seconds until the access token expires. */
  expiresIn: number;
  userId: string;
  publicKey: string | null;
  liveMode: boolean;
  scope: string | null;
}

/** Default lifetime when the response has no `expires_in` (Mercado Pago
 *  documents 180 days for OAuth access tokens). */
export const MERCADOPAGO_DEFAULT_TOKEN_TTL_SECONDS = 180 * 24 * 60 * 60;

/**
 * Non-2xx from `/oauth/token`. `invalidGrant` = the code/refresh token is no
 * longer valid (revoked by the seller, already used, expired): the caller
 * marks the connection for reconnection instead of retrying. The message is
 * for server logs only — never forwarded to a public redirect.
 */
export class MercadoPagoOAuthError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly invalidGrant: boolean,
  ) {
    super(message);
    this.name = 'MercadoPagoOAuthError';
  }
}

/**
 * Text Mercado Pago sends back (`error_description`) made safe to log: control
 * characters dropped, at most 200 chars, and any value we ourselves sent
 * (code, secrets, verifier, tokens) replaced by `[redacted]` in case it is
 * echoed.
 */
export function safeOAuthDescription(
  text: unknown,
  secrets: Array<string | undefined> = [],
): string | undefined {
  if (typeof text !== 'string' || text.length === 0) return undefined;
  let out = Array.from(text, (ch) => (ch.charCodeAt(0) < 32 || ch.charCodeAt(0) === 127 ? ' ' : ch))
    .join('')
    .replace(/ +/g, ' ')
    .trim();
  for (const secret of secrets) {
    if (secret && secret.length >= 6) out = out.split(secret).join('[redacted]');
  }
  return out.slice(0, 200);
}

/** RFC 7636 PKCE pair (S256). The verifier is 43 url-safe chars. */
export function createPkcePair(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

function parseGrant(body: unknown): MercadoPagoTokenGrant {
  const b = (body ?? {}) as Record<string, unknown>;
  const accessToken = typeof b.access_token === 'string' ? b.access_token : '';
  const userId =
    typeof b.user_id === 'number' || typeof b.user_id === 'string' ? String(b.user_id) : '';
  if (!accessToken || !MERCADOPAGO_USER_ID_PATTERN.test(userId)) {
    throw new MercadoPagoOAuthError(
      'Mercado Pago OAuth answered without a usable grant',
      502,
      false,
    );
  }
  const expiresIn =
    typeof b.expires_in === 'number' && Number.isFinite(b.expires_in) && b.expires_in > 0
      ? b.expires_in
      : MERCADOPAGO_DEFAULT_TOKEN_TTL_SECONDS;
  return {
    accessToken,
    refreshToken: typeof b.refresh_token === 'string' && b.refresh_token ? b.refresh_token : null,
    expiresIn,
    userId,
    publicKey: typeof b.public_key === 'string' && b.public_key ? b.public_key : null,
    liveMode: b.live_mode === true,
    scope: typeof b.scope === 'string' ? b.scope : null,
  };
}

/**
 * Transport-only wrapper around Mercado Pago's OAuth (ADR-PAG-003): builds
 * the authorize URL (with PKCE when enabled in the app) and calls
 * `POST /oauth/token` for the authorization_code and refresh_token grants.
 * It never touches the database nor the `state` (that is
 * `MercadoPagoConnectService`'s job).
 *
 * `MERCADOPAGO_CLIENT_ID`/`MERCADOPAGO_CLIENT_SECRET` come only from env,
 * never logged. Tokens are never logged.
 */
@Injectable()
export class MercadoPagoOAuthClient {
  private readonly logger = new Logger('MercadoPagoOAuthClient');
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly tokenUrl: string;
  private readonly authorizeUrl: string;
  private readonly redirectUri: string;
  private readonly pkce: boolean;
  /** Sandbox: grants must belong to test users (`live_mode=false`). */
  private readonly sandbox: boolean;
  /** Whether the code exchange carries `test_token=true` (defaults to `sandbox`). */
  private readonly sendTestToken: boolean;
  private readonly platformAccessToken: string | undefined;

  constructor(
    config: ConfigService<Env, true>,
    // `@Optional()`: Nest's DI would otherwise try to resolve the bare type
    // alias and fail at boot; tests pass a mock directly.
    @Optional() private readonly fetchFn: MercadoPagoOAuthFetch = globalThis.fetch.bind(globalThis),
  ) {
    this.clientId = (config.get('MERCADOPAGO_CLIENT_ID', { infer: true }) as string) ?? '';
    this.clientSecret = (config.get('MERCADOPAGO_CLIENT_SECRET', { infer: true }) as string) ?? '';
    const base = (
      (config.get('MERCADOPAGO_BASE_URL', { infer: true }) as string | undefined) ??
      'https://api.mercadopago.com'
    ).replace(/\/+$/, '');
    this.tokenUrl = `${base}/oauth/token`;
    this.authorizeUrl =
      (config.get('MERCADOPAGO_AUTHORIZE_URL', { infer: true }) as string | undefined) ??
      MERCADOPAGO_AUTHORIZE_URL_DEFAULT;
    const apiBase = (
      (config.get('API_PUBLIC_BASE_URL', { infer: true }) as string | undefined) ??
      (config.get('STORAGE_PUBLIC_BASE_URL', { infer: true }) as string | undefined) ??
      'http://localhost:3000'
    ).replace(/\/+$/, '');
    this.redirectUri =
      (config.get('MERCADOPAGO_OAUTH_REDIRECT_URI', { infer: true }) as string | undefined) ??
      `${apiBase}/org/mercadopago/callback`;
    this.pkce = config.get('MERCADOPAGO_OAUTH_PKCE', { infer: true }) === true;
    this.sandbox = config.get('MERCADOPAGO_TEST', { infer: true }) === true;
    const testTokenOverride = config.get('MERCADOPAGO_OAUTH_TEST_TOKEN', { infer: true }) as
      boolean | undefined;
    this.sendTestToken = testTokenOverride ?? this.sandbox;
    this.platformAccessToken = config.get('MERCADOPAGO_PLATFORM_ACCESS_TOKEN', {
      infer: true,
    }) as string | undefined;
    if (this.isConfigured()) {
      // Mercado Pago shows "La aplicación no está preparada para conectarse"
      // when these do not match the app's panel EXACTLY. Log what we send
      // (client_id and redirect_uri are public; the secret never is).
      for (const line of this.describeOAuthSetup()) this.logger.log(line);
    }
  }

  /**
   * Non-secret OAuth setup to compare, character by character, with the app
   * in Mercado Pago's developer panel. Includes warnings for the usual
   * mismatches (non-https or localhost redirect, which the panel's Redirect
   * URL list cannot hold).
   */
  describeOAuthSetup(): string[] {
    const lines = [
      `Mercado Pago OAuth: client_id=${this.clientId} (from MERCADOPAGO_CLIENT_ID) ` +
        `redirect_uri=${this.redirectUri} ` +
        `authorize=${this.authorizeUrl} pkce=${this.pkce} sandbox=${this.sandbox} ` +
        `test_token=${this.sendTestToken}`,
    ];
    // The plans (Suscripciones) app has its OWN credentials. Its access token
    // starts with `APP_USR-<appId>-`; showing that public App ID lets you see
    // whether it is the same app as MERCADOPAGO_CLIENT_ID (the Redirect URL
    // must be registered in the app whose App ID is MERCADOPAGO_CLIENT_ID).
    const platformAppId = /^APP_USR-(\d+)-/.exec(this.platformAccessToken ?? '')?.[1];
    if (platformAppId) {
      lines.push(
        `Mercado Pago OAuth: MERCADOPAGO_PLATFORM_ACCESS_TOKEN belongs to app ${platformAppId} ` +
          `(${platformAppId === this.clientId ? 'SAME as' : 'different from'} MERCADOPAGO_CLIENT_ID)`,
      );
    }
    if (this.redirectUri.endsWith('/')) {
      lines.push(
        'Mercado Pago OAuth: redirect_uri ends with "/"; the panel entry must end with "/" too ' +
          '(callback and callback/ are different URLs for Mercado Pago)',
      );
    }
    if (this.redirectUri.includes('?') || this.redirectUri.includes('#')) {
      lines.push(
        'Mercado Pago OAuth: redirect_uri has a query or fragment; Mercado Pago wants a static URL',
      );
    }
    let redirect: URL | undefined;
    try {
      redirect = new URL(this.redirectUri);
    } catch {
      lines.push('Mercado Pago OAuth: redirect_uri is not a valid URL');
    }
    if (redirect && redirect.protocol !== 'https:') {
      lines.push(
        'Mercado Pago OAuth: redirect_uri is not https; register an https URL (e.g. a tunnel) ' +
          'in the app and set MERCADOPAGO_OAUTH_REDIRECT_URI to the same value',
      );
    }
    if (redirect && ['localhost', '127.0.0.1', '::1', '[::1]'].includes(redirect.hostname)) {
      lines.push(
        'Mercado Pago OAuth: redirect_uri points to localhost; Mercado Pago cannot redirect there ' +
          'unless the exact same URL is registered in the app',
      );
    }
    return lines;
  }

  /** Whether the OAuth app credentials are configured at all. */
  isConfigured(): boolean {
    return Boolean(this.clientId && this.clientSecret);
  }

  usesPkce(): boolean {
    return this.pkce;
  }

  /**
   * `live_mode` every grant must carry in this deployment: sandbox
   * (`MERCADOPAGO_TEST=true`) accepts only test users, production only real
   * accounts. A mismatched grant is refused (never stored or used).
   *
   * Mercado Pago only marks a grant `live_mode=false` when the exchange sent
   * `test_token=true`. Without it (`MERCADOPAGO_OAUTH_TEST_TOKEN=false`, what
   * Mercado Pago support asked for, ticket WCS-58365) a TEST seller's grant
   * comes back `live_mode=true`, so that is what sandbox expects then.
   */
  expectedLiveMode(): boolean {
    return this.sandbox ? !this.sendTestToken : true;
  }

  getRedirectUri(): string {
    return this.redirectUri;
  }

  /** URL the browser navigates to (full page navigation, never a fetch). */
  buildAuthorizeUrl(state: string, codeChallenge?: string): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      response_type: 'code',
      platform_id: 'mp',
      redirect_uri: this.redirectUri,
      state,
    });
    if (codeChallenge) {
      params.set('code_challenge', codeChallenge);
      params.set('code_challenge_method', 'S256');
    }
    const url = `${this.authorizeUrl}?${params.toString()}`;
    for (const line of this.describeAuthorizeUrl(url)) this.logger.log(line);
    return url;
  }

  /**
   * What the browser is about to send, for the logs: the redirect_uri before
   * and after URL-encoding, whether it is encoded exactly once, and the whole
   * authorize URL with the sealed `state` hidden. No secret is in this URL
   * (`client_secret` only ever goes in the server-to-server token call).
   */
  describeAuthorizeUrl(url: string): string[] {
    const encoded = /[?&]redirect_uri=([^&]*)/.exec(url)?.[1] ?? '';
    let decodedOnce = '';
    try {
      decodedOnce = decodeURIComponent(encoded);
    } catch {
      decodedOnce = '';
    }
    const singleEncoded = decodedOnce === this.redirectUri && !/%25[0-9A-Fa-f]{2}/.test(encoded);
    const shown = url.replace(/([?&]state=)[^&]*/, '$1<redacted>');
    return [
      `Mercado Pago OAuth authorize: redirect_uri (raw)=${this.redirectUri}`,
      `Mercado Pago OAuth authorize: redirect_uri (url-encoded as sent)=${encoded}`,
      `Mercado Pago OAuth authorize: encoded exactly once=${singleEncoded}, ` +
        `trailing slash=${this.redirectUri.endsWith('/')}`,
      `Mercado Pago OAuth authorize: url=${shown}`,
    ];
  }

  /** Exchange the authorization `code` for a token pair. */
  exchangeCode(code: string, codeVerifier?: string): Promise<MercadoPagoTokenGrant> {
    const body: Record<string, string> = {
      client_id: this.clientId,
      client_secret: this.clientSecret,
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.redirectUri,
    };
    if (codeVerifier) body.code_verifier = codeVerifier;
    // Sandbox: ask for test credentials of the connected test user. Can be
    // switched off with MERCADOPAGO_OAUTH_TEST_TOKEN=false (Checkout Pro).
    if (this.sendTestToken) body.test_token = 'true';
    return this.postToken(body);
  }

  /** Renew the pair before it lapses (and whenever the access token expired). */
  refreshToken(refreshToken: string): Promise<MercadoPagoTokenGrant> {
    return this.postToken({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    });
  }

  private async postToken(body: Record<string, string>): Promise<MercadoPagoTokenGrant> {
    if (!this.isConfigured()) {
      throw new MercadoPagoOAuthError('Mercado Pago OAuth app is not configured', 503, false);
    }
    const response = await this.fetchFn(this.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: new URLSearchParams(body).toString(),
      signal: mercadoPagoTimeoutSignal(),
    });
    if (!response.ok) {
      // Only the error CODE, never the body (it can echo request context).
      const err = (await response.json().catch(() => null)) as Record<string, unknown> | null;
      const code = typeof err?.error === 'string' ? err.error.slice(0, 60) : 'unknown';
      // `error_description` is Mercado Pago's own text; it is logged only
      // trimmed and with every value WE sent (code, secrets, tokens) removed.
      const description = safeOAuthDescription(err?.error_description ?? err?.message, [
        body.code,
        body.client_secret,
        body.code_verifier,
        body.refresh_token,
      ]);
      this.logger.warn(
        `Mercado Pago OAuth ${body.grant_type} failed: status=${response.status} error=${code}` +
          (description ? ` error_description=${description}` : ''),
      );
      const invalidGrant =
        code === 'invalid_grant' ||
        (response.status === 400 && body.grant_type === 'refresh_token');
      throw new MercadoPagoOAuthError(
        `Mercado Pago OAuth ${body.grant_type} failed (${response.status}, ${code})`,
        response.status,
        invalidGrant,
      );
    }
    return parseGrant(await response.json().catch(() => null));
  }
}
