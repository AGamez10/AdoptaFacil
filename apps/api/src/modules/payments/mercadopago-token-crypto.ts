import { hkdfSync } from 'node:crypto';
import {
  decryptSignature,
  encryptSignature,
  loadSignatureEncryptionConfig,
} from '../../core/crypto/signature-crypto';

/**
 * Encryption at rest of an organization's Mercado Pago OAuth tokens (access
 * and refresh, ADR-PAG-003). AES-256-GCM (authenticated: a tampered value
 * fails to decrypt instead of yielding a wrong token) with a key DERIVED via
 * HKDF-SHA256 from SIGNATURE_ENCRYPTION_KEY under its own `info` label — same
 * pattern as the staff TOTP secrets: one secret for
 * operations to manage, a separate key per purpose. A database dump alone
 * never reveals an organization's token.
 *
 * The same key also seals the PKCE `code_verifier` inside the OAuth `state`
 * (it travels through the browser, so it must not be readable there).
 */
export const MERCADOPAGO_TOKENS_ENCRYPTION_KEY = Symbol('MERCADOPAGO_TOKENS_ENCRYPTION_KEY');

const HKDF_INFO = 'adoptafacil/mercadopago-oauth-tokens/v1';

export function loadMercadoPagoTokensEncryptionKey(): Buffer {
  const { signatureEncryptionKey } = loadSignatureEncryptionConfig();
  return Buffer.from(hkdfSync('sha256', signatureEncryptionKey, Buffer.alloc(0), HKDF_INFO, 32));
}

/** Encrypts one secret; returns base64(iv || authTag || ciphertext). */
export function encryptMercadoPagoSecret(plaintext: string, key: Buffer): string {
  return encryptSignature(Buffer.from(plaintext, 'utf8'), key).toString('base64');
}

/** Inverse of {@link encryptMercadoPagoSecret}. Throws on a wrong key or tampering. */
export function decryptMercadoPagoSecret(ciphertext: string, key: Buffer): string {
  return decryptSignature(Buffer.from(ciphertext, 'base64'), key).toString('utf8');
}
