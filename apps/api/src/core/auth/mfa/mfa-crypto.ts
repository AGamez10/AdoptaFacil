import { hkdfSync } from 'node:crypto';
import {
  decryptSignature,
  encryptSignature,
  loadSignatureEncryptionConfig,
} from '../../crypto/signature-crypto';

/**
 * Encryption at rest of TOTP secrets (AES-256-GCM). The key is DERIVED with
 * HKDF-SHA256 from the existing SIGNATURE_ENCRYPTION_KEY (already mandatory in
 * production) under its own `info` label: a separate key per purpose without a
 * new secret for operations to manage. A leaked database dump alone never
 * reveals a staff member's second factor.
 */
export const MFA_ENCRYPTION_KEY = Symbol('MFA_ENCRYPTION_KEY');

export function loadMfaEncryptionKey(): Buffer {
  const { signatureEncryptionKey } = loadSignatureEncryptionConfig();
  return Buffer.from(
    hkdfSync(
      'sha256',
      signatureEncryptionKey,
      Buffer.alloc(0),
      'adoptafacil/platform-mfa-totp/v1',
      32,
    ),
  );
}

export function encryptTotpSecret(secretBase32: string, key: Buffer): string {
  return encryptSignature(Buffer.from(secretBase32, 'utf8'), key).toString('base64');
}

export function decryptTotpSecret(ciphertext: string, key: Buffer): string {
  return decryptSignature(Buffer.from(ciphertext, 'base64'), key).toString('utf8');
}
