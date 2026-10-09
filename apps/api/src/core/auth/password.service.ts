import { Algorithm, hash, hashSync, verify } from '@node-rs/argon2';
import { Injectable } from '@nestjs/common';
import bcrypt from 'bcryptjs';

/**
 * Argon2id parameters: the OWASP Password Storage Cheat Sheet minimum
 * (m = 19 MiB, t = 2, p = 1). Raising them later is safe — {@link needsRehash}
 * upgrades each stored hash the next time its owner signs in.
 */
const ARGON2_OPTIONS = {
  algorithm: Algorithm.Argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

/** PHC prefix every current hash starts with (`$argon2id$v=19$m=…,t=…,p=…$`). */
const CURRENT_PREFIX = `$argon2id$v=19$m=${ARGON2_OPTIONS.memoryCost},t=${ARGON2_OPTIONS.timeCost},p=${ARGON2_OPTIONS.parallelism}$`;

/** bcrypt hashes (`$2a$`/`$2b$`/`$2y$`) written before AF-026. */
const BCRYPT_RE = /^\$2[aby]\$/;

/**
 * Password hashing with Argon2id (AF-026, native via `@node-rs/argon2`).
 * Hashes written before the migration (bcrypt) still verify, and
 * {@link needsRehash} tells the login flow to replace them with Argon2id on the
 * next successful sign-in — no forced reset. Plaintext passwords are only ever
 * received transiently here and never stored or logged.
 */
@Injectable()
export class PasswordService {
  /** A fixed valid hash used to equalize timing when a user is not found. */
  static readonly DUMMY_HASH = hashSync('dummy-password-for-timing', ARGON2_OPTIONS);

  async hash(plain: string): Promise<string> {
    return hash(plain, ARGON2_OPTIONS);
  }

  async verify(plain: string, stored: string): Promise<boolean> {
    if (BCRYPT_RE.test(stored)) {
      return bcrypt.compare(plain, stored);
    }
    try {
      return await verify(stored, plain);
    } catch {
      // Malformed hash: never a match, never a 500.
      return false;
    }
  }

  /** True when `stored` is not an Argon2id hash with the current parameters
   *  (e.g. a legacy bcrypt hash) and should be replaced after a successful
   *  verification. */
  needsRehash(stored: string): boolean {
    return !stored.startsWith(CURRENT_PREFIX);
  }
}
