import { hkdfSync } from 'node:crypto';
import {
  decryptSignature,
  encryptSignature,
  loadSignatureEncryptionConfig,
} from '../../core/crypto/signature-crypto';

/**
 * Encryption at rest of an organization's Mercado Pago OAuth tokens (access and
 * refresh). Same scheme as the ePayco keys (epayco-keys-crypto.ts): AES-256-GCM
 * with a key derived via HKDF-SHA256 from SIGNATURE_ENCRYPTION_KEY under its own
 * `info` label, so a database dump alone never reveals a token.
 *
 * Stored values carry the `enc1:` prefix. Rows written before this change hold
 * the token in clear: {@link openMercadoPagoToken} still reads them, and the
 * next connect or refresh rewrites them encrypted (no migration needed).
 */
export const MERCADOPAGO_TOKENS_ENCRYPTION_KEY = Symbol('MERCADOPAGO_TOKENS_ENCRYPTION_KEY');

const HKDF_INFO = 'adoptafacil/mercadopago-oauth-tokens/v1';
const PREFIX = 'enc1:';

export function loadMercadoPagoTokensEncryptionKey(): Buffer {
  const { signatureEncryptionKey } = loadSignatureEncryptionConfig();
  return Buffer.from(hkdfSync('sha256', signatureEncryptionKey, Buffer.alloc(0), HKDF_INFO, 32));
}

/** Encrypts one token for storage. An empty token stays empty. */
export function sealMercadoPagoToken(plaintext: string, key: Buffer): string {
  if (plaintext === '') return '';
  return PREFIX + encryptSignature(Buffer.from(plaintext, 'utf8'), key).toString('base64');
}

/** Inverse of {@link sealMercadoPagoToken}; returns legacy clear values as they
 *  are. Throws on a wrong key or tampering. */
export function openMercadoPagoToken(stored: string, key: Buffer): string {
  if (!stored.startsWith(PREFIX)) return stored;
  return decryptSignature(Buffer.from(stored.slice(PREFIX.length), 'base64'), key).toString('utf8');
}

/** Whether a stored value is already encrypted. */
export function isSealedMercadoPagoToken(stored: string): boolean {
  return stored.startsWith(PREFIX);
}
