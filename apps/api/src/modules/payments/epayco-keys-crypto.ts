import { hkdfSync } from 'node:crypto';
import {
  decryptSignature,
  encryptSignature,
  loadSignatureEncryptionConfig,
} from '../../core/crypto/signature-crypto';

/**
 * Encryption at rest of an organization's ePayco secrets (`P_KEY` and
 * `PRIVATE_KEY`, ADR-PAG-002). AES-256-GCM (authenticated: a tampered value
 * fails to decrypt instead of yielding a wrong key) with a key DERIVED via
 * HKDF-SHA256 from the existing SIGNATURE_ENCRYPTION_KEY under its own `info`
 * label — same pattern as the staff TOTP secrets (mfa-crypto.ts): one secret
 * for operations to manage, a separate key per purpose. A database dump alone
 * never reveals an organization's merchant keys.
 */
export const EPAYCO_KEYS_ENCRYPTION_KEY = Symbol('EPAYCO_KEYS_ENCRYPTION_KEY');

const HKDF_INFO = 'adoptafacil/epayco-merchant-keys/v1';

export function loadEpaycoKeysEncryptionKey(): Buffer {
  const { signatureEncryptionKey } = loadSignatureEncryptionConfig();
  return Buffer.from(hkdfSync('sha256', signatureEncryptionKey, Buffer.alloc(0), HKDF_INFO, 32));
}

/** Encrypts one secret; returns base64(iv || authTag || ciphertext). */
export function encryptEpaycoSecret(plaintext: string, key: Buffer): string {
  return encryptSignature(Buffer.from(plaintext, 'utf8'), key).toString('base64');
}

/** Inverse of {@link encryptEpaycoSecret}. Throws on a wrong key or tampering. */
export function decryptEpaycoSecret(ciphertext: string, key: Buffer): string {
  return decryptSignature(Buffer.from(ciphertext, 'base64'), key).toString('utf8');
}
