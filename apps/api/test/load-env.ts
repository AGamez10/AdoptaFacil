import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Load the repo-root .env into process.env for integration tests, WITHOUT
 * overriding variables already present (so CI-provided values win). No dotenv
 * dependency — a tiny KEY=VALUE parser that also strips surrounding quotes.
 */
// T-108: integration tests run on the in-memory storage stub (no real files on
// disk). The disk adapter has its own unit + integration coverage that overrides
// STORAGE_PORT explicitly, so forcing the stub here keeps the rest of the suite
// filesystem-free and deterministic.
process.env.STORAGE_DRIVER = 'stub';

// Ola 1 (R1-1/R1-3): module feature flags are OFF by default everywhere, but
// the existing suites exercise donations, sponsorships, community, etc., so
// the integration run switches them on unless a suite or CI already set them
// (feature-flags.integration-spec.ts builds its own app with them off). The
// throttler keeps its per-process store so each suite's app instance starts
// with a clean auth budget instead of sharing counters in Redis.
for (const flag of [
  'FEATURE_PAYMENTS',
  'FEATURE_SPONSORSHIPS',
  'FEATURE_DONATION_CERTIFICATES',
  'FEATURE_COMMUNITY',
  'FEATURE_COMMUNITY_WALL',
  'FEATURE_REPUTATION',
  'FEATURE_RESOURCES',
  'FEATURE_MARKETPLACE',
  // M13: firmas en reportes (apagado por defecto en producción; ver env.validation.ts).
  'REPORTS_SIGNATURES_ENABLED',
]) {
  process.env[flag] ??= 'true';
}
process.env.THROTTLER_STORAGE ??= 'memory';
// F19: platform staff need a second factor (TOTP) by default. The existing
// suites exercise platform endpoints with plain logins, so the integration run
// switches enforcement off unless CI or a suite set it; the MFA suites
// (platform-mfa / platform-workspace) build their app with it ON.
process.env.PLATFORM_MFA_REQUIRED ??= 'false';

const envPath = join(__dirname, '..', '..', '..', '.env');
if (existsSync(envPath)) {
  for (const rawLine of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}
