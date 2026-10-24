/**
 * Guard for `seed:trafico` (datos ficticios para ver la plataforma con tráfico).
 * The seed writes dozens of fake people, donations and adoptions, so it must
 * only ever touch a developer's local database:
 *
 * - refuses with NODE_ENV=production;
 * - refuses inside CI (the seed is a manual tool, never part of a pipeline);
 * - refuses unless BOTH database URLs (DATABASE_URL and DATABASE_URL_APP) point
 *   at this machine (localhost, 127.0.0.1, ::1 or a local Unix socket);
 * - refuses without the explicit `--yes-demo` flag on the command line.
 *
 * Pure function over (env, argv) so every rule is unit-tested without a DB.
 */

export const DEMO_SEED_FLAG = '--yes-demo';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
const DATABASE_URL_KEYS = ['DATABASE_URL', 'DATABASE_URL_APP'] as const;

type Env = Record<string, string | undefined>;

function isTruthy(value: string | undefined): boolean {
  const v = (value ?? '').trim().toLowerCase();
  return v !== '' && v !== '0' && v !== 'false';
}

/** True when the Postgres URL resolves to this machine. Unparseable ⇒ false. */
export function isLocalDatabaseUrl(raw: string | undefined): boolean {
  if (!raw?.trim()) return false;
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return false;
  }
  if (url.protocol !== 'postgresql:' && url.protocol !== 'postgres:') return false;
  // libpq lets `?host=` override the authority; it must be local as well.
  const hostParam = url.searchParams.get('host');
  if (hostParam !== null) {
    return hostParam.startsWith('/') || LOCAL_HOSTS.has(hostParam.toLowerCase());
  }
  return LOCAL_HOSTS.has(url.hostname.toLowerCase());
}

/** The reason the seed must not run, or `null` when it may. */
export function demoSeedRefusal(env: Env, argv: readonly string[]): string | null {
  if ((env.NODE_ENV ?? '').trim().toLowerCase() === 'production') {
    return 'NODE_ENV=production: los datos de demostración nunca se cargan en producción.';
  }
  if (isTruthy(env.CI)) {
    return 'CI está definida: este seeder es manual y no corre en integración continua.';
  }
  for (const key of DATABASE_URL_KEYS) {
    if (!isLocalDatabaseUrl(env[key])) {
      return `${key} no apunta a una base local (localhost, 127.0.0.1 o ::1).`;
    }
  }
  if (!argv.includes(DEMO_SEED_FLAG)) {
    return `Falta la bandera explícita ${DEMO_SEED_FLAG}.`;
  }
  return null;
}

export class DemoSeedRefusedError extends Error {}

export function assertDemoSeedAllowed(env: Env, argv: readonly string[]): void {
  const reason = demoSeedRefusal(env, argv);
  if (reason) throw new DemoSeedRefusedError(reason);
}
