import {
  decryptEpaycoSecret,
  encryptEpaycoSecret,
  loadEpaycoKeysEncryptionKey,
} from './epayco-keys-crypto';
import { loadMfaEncryptionKey } from '../../core/auth/mfa/mfa-crypto';
import { loadSignatureEncryptionConfig } from '../../core/crypto/signature-crypto';

describe('epayco-keys-crypto (ADR-PAG-002, keys at rest)', () => {
  const key = loadEpaycoKeysEncryptionKey();

  it('derives a 32-byte key distinct from the base key and the MFA key', () => {
    expect(key).toHaveLength(32);
    expect(key.equals(loadSignatureEncryptionConfig().signatureEncryptionKey)).toBe(false);
    expect(key.equals(loadMfaEncryptionKey())).toBe(false);
    // Deterministic: the same base key always derives the same key.
    expect(loadEpaycoKeysEncryptionKey().equals(key)).toBe(true);
  });

  it('round-trips a secret and never stores it in clear', () => {
    const plaintext = 'valor de prueba, no es una llave';
    const enc = encryptEpaycoSecret(plaintext, key);
    expect(enc).not.toContain(plaintext);
    expect(Buffer.from(enc, 'base64').toString('utf8')).not.toContain(plaintext);
    expect(decryptEpaycoSecret(enc, key)).toBe(plaintext);
  });

  it('uses a fresh IV per encryption (same plaintext ⇒ different ciphertext)', () => {
    expect(encryptEpaycoSecret('same', key)).not.toBe(encryptEpaycoSecret('same', key));
  });

  it('refuses tampered ciphertext (GCM auth tag)', () => {
    const raw = Buffer.from(encryptEpaycoSecret('secret-value', key), 'base64');
    raw[raw.length - 1] ^= 0x01;
    expect(() => decryptEpaycoSecret(raw.toString('base64'), key)).toThrow();
  });

  it('refuses decryption with another key', () => {
    const enc = encryptEpaycoSecret('secret-value', key);
    expect(() => decryptEpaycoSecret(enc, loadMfaEncryptionKey())).toThrow();
  });
});
