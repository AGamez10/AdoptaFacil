import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { decryptSignature, encryptSignature } from '../../core/crypto/signature-crypto';

/**
 * What the OAuth `state` carries (ADR-PAG-003). `/connect` is authenticated
 * (it knows the org and the actor), but Mercado Pago's redirect to
 * `/callback` is necessarily PUBLIC (a browser redirect has no Authorization
 * header). The state is therefore SEALED with AES-256-GCM:
 *   - integrity: a forged or altered state fails to open (anti-CSRF: only a
 *     state minted by `/connect` for that org is accepted);
 *   - confidentiality: the PKCE `code_verifier` travels inside it and must
 *     not be readable by whoever sees the redirect URL;
 *   - expiry: `exp` (epoch seconds), checked on open.
 * It is deliberately NOT a JWT signed with the access-token secret, so a
 * state can never be confused with a session token.
 */
export interface MercadoPagoOAuthStateClaims {
  organizationId: string;
  actorUserId: string;
  /** Unique per authorize URL. */
  nonce: string;
  /** PKCE verifier when PKCE is on. */
  codeVerifier?: string;
  /** sha256 (hex) of the browser-binding secret set as an HttpOnly cookie
   *  by `/connect`: a leaked authorize URL is useless in another browser. */
  bindingHash: string;
  /** Expiry, epoch seconds. */
  exp: number;
}

/** HttpOnly cookie that binds an authorize URL to the browser that asked for it. */
export const MERCADOPAGO_OAUTH_BINDING_COOKIE = 'af_mp_oauth';

/** A fresh browser-binding secret and the hash the state carries. */
export function createOAuthBinding(): { secret: string; hash: string } {
  const secret = randomBytes(32).toString('base64url');
  return { secret, hash: oauthBindingHash(secret) };
}

export function oauthBindingHash(secret: string): string {
  return createHash('sha256').update(secret, 'utf8').digest('hex');
}

/** Constant-time check of the cookie against the state's hash. */
export function oauthBindingMatches(
  claims: MercadoPagoOAuthStateClaims,
  secret: string | undefined,
): boolean {
  if (!secret || !/^[A-Za-z0-9_-]{20,200}$/.test(secret)) return false;
  const expected = Buffer.from(claims.bindingHash, 'hex');
  const actual = Buffer.from(oauthBindingHash(secret), 'hex');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function sealOAuthState(
  claims: Omit<MercadoPagoOAuthStateClaims, 'nonce' | 'exp'>,
  key: Buffer,
  ttlSeconds: number,
  now: Date = new Date(),
): string {
  const full: MercadoPagoOAuthStateClaims = {
    ...claims,
    nonce: randomBytes(16).toString('hex'),
    exp: Math.floor(now.getTime() / 1000) + ttlSeconds,
  };
  return encryptSignature(Buffer.from(JSON.stringify(full), 'utf8'), key).toString('base64url');
}

/** Opens a state; `null` for anything tampered, malformed or expired. */
export function openOAuthState(
  state: string,
  key: Buffer,
  now: Date = new Date(),
): MercadoPagoOAuthStateClaims | null {
  if (!/^[A-Za-z0-9_-]{20,2048}$/.test(state)) return null;
  let claims: MercadoPagoOAuthStateClaims;
  try {
    claims = JSON.parse(
      decryptSignature(Buffer.from(state, 'base64url'), key).toString('utf8'),
    ) as MercadoPagoOAuthStateClaims;
  } catch {
    return null;
  }
  if (
    !claims ||
    typeof claims.organizationId !== 'string' ||
    typeof claims.actorUserId !== 'string' ||
    typeof claims.nonce !== 'string' ||
    typeof claims.bindingHash !== 'string' ||
    !/^[0-9a-f]{64}$/.test(claims.bindingHash) ||
    typeof claims.exp !== 'number' ||
    claims.exp < Math.floor(now.getTime() / 1000)
  ) {
    return null;
  }
  return claims;
}
