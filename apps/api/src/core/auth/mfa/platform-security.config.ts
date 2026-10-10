import type { PlatformSessionPolicy } from '@adoptafacil/contracts';

/**
 * Security policy for PLATFORM STAFF sessions (PlatformAdmin /
 * PlatformSuperAdmin). Read from the environment at DI time, same convention
 * as `auth.config.ts`. The defaults are the policy; the variables only exist so
 * an operator can make it STRICTER (or switch MFA off outside production for
 * local work — production refuses to boot with it off, see env.validation.ts).
 *
 *   PLATFORM_MFA_REQUIRED           default true  — TOTP for every platform session
 *   PLATFORM_ACCESS_TTL_SECONDS     default 600   — 10 min access token for staff
 *   PLATFORM_MFA_MAX_SECONDS        default 28800 — a passed second factor lasts a work day (8 h)
 *   PLATFORM_IDLE_TIMEOUT_SECONDS   default 1800  — 30 min without refreshing → second factor again
 *   PLATFORM_APPROVAL_TTL_SECONDS   default 86400 — an undecided sensitive action expires in 24 h
 */
export const PLATFORM_SECURITY_CONFIG = Symbol('PLATFORM_SECURITY_CONFIG');

export interface PlatformSecurityConfig extends PlatformSessionPolicy {
  mfaRequired: boolean;
}

function positiveInt(value: string | undefined, fallback: number, max: number): number {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? Math.min(n, max) : fallback;
}

export function loadPlatformSecurityConfig(): PlatformSecurityConfig {
  const raw = process.env.PLATFORM_MFA_REQUIRED;
  return {
    // Fails closed: only the explicit string "false" turns it off.
    mfaRequired: raw === undefined || raw.trim().toLowerCase() !== 'false',
    accessTtlSeconds: positiveInt(process.env.PLATFORM_ACCESS_TTL_SECONDS, 600, 900),
    mfaSessionMaxSeconds: positiveInt(process.env.PLATFORM_MFA_MAX_SECONDS, 8 * 3600, 12 * 3600),
    idleTimeoutSeconds: positiveInt(process.env.PLATFORM_IDLE_TIMEOUT_SECONDS, 30 * 60, 60 * 60),
    sensitiveActionTtlSeconds: positiveInt(
      process.env.PLATFORM_APPROVAL_TTL_SECONDS,
      24 * 3600,
      72 * 3600,
    ),
  };
}

/** Whether a session's second factor (epoch seconds from the `mfa_at` claim)
 *  is still valid under the policy. */
export function isMfaFresh(
  mfaAtSeconds: number | undefined,
  config: PlatformSecurityConfig,
  nowMs = Date.now(),
): boolean {
  if (typeof mfaAtSeconds !== 'number') return false;
  const age = nowMs / 1000 - mfaAtSeconds;
  return age >= -60 && age < config.mfaSessionMaxSeconds;
}
