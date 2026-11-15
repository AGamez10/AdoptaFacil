import { randomBytes } from 'node:crypto';
import {
  createOAuthBinding,
  oauthBindingMatches,
  openOAuthState,
  sealOAuthState,
} from './mercadopago-oauth-state';
import { isDueForRefresh } from './mercadopago-connections.service';
import {
  decryptMercadoPagoSecret,
  encryptMercadoPagoSecret,
  loadMercadoPagoTokensEncryptionKey,
} from './mercadopago-token-crypto';

const key = loadMercadoPagoTokensEncryptionKey();
const CLAIMS = {
  organizationId: '11111111-2222-3333-4444-555555555555',
  actorUserId: '66666666-7777-8888-9999-000000000000',
  codeVerifier: 'pkce-verifier-should-stay-hidden',
  bindingHash: 'a'.repeat(64),
};

describe('Mercado Pago OAuth state (sealed, anti-CSRF)', () => {
  it('round-trips and hides the PKCE verifier from whoever sees the URL', () => {
    const state = sealOAuthState(CLAIMS, key, 600);
    expect(state).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(Buffer.from(state, 'base64url').toString('utf8')).not.toContain('pkce-verifier');
    const opened = openOAuthState(state, key);
    expect(opened).toMatchObject(CLAIMS);
    expect(opened?.nonce).toMatch(/^[0-9a-f]{32}$/);
  });

  it('binds the state to the browser cookie that asked for it (constant-time)', () => {
    const binding = createOAuthBinding();
    const state = sealOAuthState({ ...CLAIMS, bindingHash: binding.hash }, key, 600);
    const opened = openOAuthState(state, key)!;
    expect(oauthBindingMatches(opened, binding.secret)).toBe(true);
    expect(oauthBindingMatches(opened, createOAuthBinding().secret)).toBe(false);
    expect(oauthBindingMatches(opened, undefined)).toBe(false);
    expect(oauthBindingMatches(opened, 'short')).toBe(false);
  });

  it('gives each authorize URL a different state', () => {
    expect(sealOAuthState(CLAIMS, key, 600)).not.toBe(sealOAuthState(CLAIMS, key, 600));
  });

  it('refuses a tampered, foreign-key, malformed or expired state', () => {
    const state = sealOAuthState(CLAIMS, key, 600);
    const raw = Buffer.from(state, 'base64url');
    raw[raw.length - 1] ^= 0x01;
    expect(openOAuthState(raw.toString('base64url'), key)).toBeNull();
    expect(openOAuthState(state, randomBytes(32))).toBeNull();
    expect(openOAuthState('not a state!', key)).toBeNull();
    const old = sealOAuthState(CLAIMS, key, 600, new Date(Date.now() - 11 * 60 * 1000));
    expect(openOAuthState(old, key)).toBeNull();
  });
});

describe('Mercado Pago tokens at rest', () => {
  it('never stores the token in clear', () => {
    const enc = encryptMercadoPagoSecret('APP_USR-token', key);
    expect(enc).not.toContain('APP_USR');
    expect(decryptMercadoPagoSecret(enc, key)).toBe('APP_USR-token');
  });
});

describe('isDueForRefresh', () => {
  const now = new Date('2026-11-06T00:00:00Z');
  it('is due inside the window and when already expired', () => {
    expect(isDueForRefresh(new Date('2026-11-20T00:00:00Z'), now, 30)).toBe(true);
    expect(isDueForRefresh(new Date('2026-11-01T00:00:00Z'), now, 30)).toBe(true);
    expect(isDueForRefresh(new Date('2027-01-20T00:00:00Z'), now, 30)).toBe(false);
  });
});
