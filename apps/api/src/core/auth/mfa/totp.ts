import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * TOTP (RFC 6238) over HOTP (RFC 4226) with HMAC-SHA1, 6 digits and 30-second
 * steps: the parameters every authenticator app (Google Authenticator, Microsoft
 * Authenticator, Authy, 1Password…) understands by default. Implemented on
 * node:crypto (≈60 lines) instead of adding a dependency to the auth path.
 */

export const TOTP_DIGITS = 6;
export const TOTP_STEP_SECONDS = 30;
/** Accepted clock drift: the previous, current and next step. */
export const TOTP_WINDOW = 1;
/** 160-bit secret, the size RFC 4226 recommends. */
const SECRET_BYTES = 20;

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(bytes: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

export function base32Decode(input: string): Buffer {
  const clean = input.replace(/=+$/, '').replace(/\s+/g, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of clean) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) throw new Error('Invalid base32 character');
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export function generateTotpSecret(): string {
  return base32Encode(randomBytes(SECRET_BYTES));
}

/** HOTP value of `counter` for a raw key, zero-padded to {@link TOTP_DIGITS}. */
export function hotp(key: Buffer, counter: number): string {
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac('sha1', key).update(message).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    (digest[offset + 1] << 16) |
    (digest[offset + 2] << 8) |
    digest[offset + 3];
  return String(binary % 10 ** TOTP_DIGITS).padStart(TOTP_DIGITS, '0');
}

export function totpStep(nowMs: number): number {
  return Math.floor(nowMs / 1000 / TOTP_STEP_SECONDS);
}

/** The code an authenticator shows at `nowMs` (used by tests and the enrollment preview). */
export function totpAt(secretBase32: string, nowMs: number): string {
  return hotp(base32Decode(secretBase32), totpStep(nowMs));
}

/**
 * Checks `code` against the steps inside the drift window and returns the
 * MATCHED step (so the caller can reject replays: a step is only usable once
 * and never one older than the last accepted), or null. Constant-time compare.
 */
export function verifyTotp(secretBase32: string, code: string, nowMs: number): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const key = base32Decode(secretBase32);
  const current = totpStep(nowMs);
  const presented = Buffer.from(code);
  for (let delta = -TOTP_WINDOW; delta <= TOTP_WINDOW; delta += 1) {
    const step = current + delta;
    if (timingSafeEqual(Buffer.from(hotp(key, step)), presented)) {
      return step;
    }
  }
  return null;
}

/** `otpauth://` URI for the QR (Key Uri Format used by authenticator apps). */
export function buildOtpauthUri(
  secretBase32: string,
  accountEmail: string,
  issuer: string,
): string {
  const label = encodeURIComponent(`${issuer}:${accountEmail}`);
  const params = new URLSearchParams({
    secret: secretBase32,
    issuer,
    algorithm: 'SHA1',
    digits: String(TOTP_DIGITS),
    period: String(TOTP_STEP_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}
