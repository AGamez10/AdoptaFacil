import bcrypt from 'bcryptjs';
import { PasswordService } from './password.service';

/** AF-026: Argon2id for new hashes, legacy bcrypt still verifies and is
 *  flagged for a transparent upgrade on the next sign-in. */
describe('PasswordService (Argon2id + legacy bcrypt)', () => {
  const service = new PasswordService();

  it('hashes with Argon2id and the OWASP parameters', async () => {
    const stored = await service.hash('una-clave-muy-larga');
    expect(stored.startsWith('$argon2id$v=19$m=19456,t=2,p=1$')).toBe(true);
    expect(service.needsRehash(stored)).toBe(false);
  });

  it('verifies a legacy bcrypt hash and asks for a rehash', async () => {
    const legacy = await bcrypt.hash('clave-heredada-123', 4);
    expect(await service.verify('clave-heredada-123', legacy)).toBe(true);
    expect(await service.verify('otra-clave', legacy)).toBe(false);
    expect(service.needsRehash(legacy)).toBe(true);
  });

  it('treats a malformed stored hash as a mismatch, never an exception', async () => {
    await expect(service.verify('x', 'not-a-hash')).resolves.toBe(false);
    expect(service.needsRehash('not-a-hash')).toBe(true);
  });

  it('keeps the timing dummy as a valid Argon2id hash', async () => {
    expect(PasswordService.DUMMY_HASH.startsWith('$argon2id$')).toBe(true);
    expect(await service.verify('nope', PasswordService.DUMMY_HASH)).toBe(false);
  });
});
