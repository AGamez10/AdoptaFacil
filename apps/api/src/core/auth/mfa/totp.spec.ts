import {
  base32Decode,
  base32Encode,
  buildOtpauthUri,
  generateTotpSecret,
  hotp,
  totpAt,
  verifyTotp,
} from './totp';

// RFC 6238, appendix B: shared secret "12345678901234567890" (SHA-1). The RFC
// lists 8-digit values; a 6-digit authenticator shows their last 6 digits.
const RFC_SECRET = base32Encode(Buffer.from('12345678901234567890', 'ascii'));

describe('TOTP (RFC 6238)', () => {
  it.each([
    [59, '287082'],
    [1111111109, '081804'],
    [1111111111, '050471'],
    [1234567890, '005924'],
    [2000000000, '279037'],
  ])('matches the RFC vector at T=%i', (seconds, expected) => {
    expect(totpAt(RFC_SECRET, seconds * 1000)).toBe(expected);
  });

  it('matches the RFC 4226 HOTP vectors', () => {
    const key = Buffer.from('12345678901234567890', 'ascii');
    expect(hotp(key, 0)).toBe('755224');
    expect(hotp(key, 9)).toBe('520489');
  });

  it('round-trips base32', () => {
    const bytes = Buffer.from([0, 1, 2, 250, 251, 252, 253, 254, 255, 7]);
    expect(base32Decode(base32Encode(bytes))).toEqual(bytes);
  });

  it('accepts the current step and one step of drift, and returns the matched step', () => {
    const secret = generateTotpSecret();
    const now = 1_760_000_000_000;
    expect(verifyTotp(secret, totpAt(secret, now), now)).toBe(Math.floor(now / 30_000));
    expect(verifyTotp(secret, totpAt(secret, now - 30_000), now)).toBe(
      Math.floor(now / 30_000) - 1,
    );
    expect(verifyTotp(secret, totpAt(secret, now + 30_000), now)).not.toBeNull();
  });

  it('rejects codes outside the window, malformed codes and wrong secrets', () => {
    const secret = generateTotpSecret();
    const now = 1_760_000_000_000;
    expect(verifyTotp(secret, totpAt(secret, now - 90_000), now)).toBeNull();
    expect(verifyTotp(secret, '12345', now)).toBeNull();
    expect(verifyTotp(secret, 'abcdef', now)).toBeNull();
    expect(verifyTotp(generateTotpSecret(), totpAt(secret, now), now)).toBeNull();
  });

  it('builds an otpauth URI with issuer and account', () => {
    const uri = buildOtpauthUri('JBSWY3DPEHPK3PXP', 'ana@adoptafacil.org', 'AdoptaFácil');
    expect(uri.startsWith('otpauth://totp/AdoptaF%C3%A1cil%3Aana%40adoptafacil.org?')).toBe(true);
    expect(uri).toContain('secret=JBSWY3DPEHPK3PXP');
    expect(uri).toContain('digits=6');
  });
});
