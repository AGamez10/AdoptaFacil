import { existsSync, readFileSync } from 'node:fs';
import { connect } from 'node:net';
import { join } from 'node:path';

/**
 * Local-dev preflight: before Nest builds the module graph, check that the
 * Postgres and Redis the API needs actually answer. Without it, a stopped
 * Docker container leaves the API stuck before `listen()` printing endless
 * ioredis/Prisma connection errors (ECONNREFUSED, or ECONNRESET/ECONNABORTED
 * on Windows, where Docker Desktop's port proxy accepts and then drops the
 * connection), and the browser only sees failed requests.
 *
 * A bare TCP connect is not enough for that Windows case, so each check speaks
 * the first byte of the real protocol: Redis must answer `PING` with `+PONG`,
 * Postgres must answer an SSLRequest with `S` or `N`.
 *
 * Production never runs it (compose/Render already wait on health checks, and
 * the platform restarts the process), nor does SKIP_SERVICE_PREFLIGHT=1.
 */

const TIMEOUT_MS = 3000;

/** The same files ConfigModule reads (app.module.ts), without overriding the shell. */
function readEnvFiles(): Record<string, string> {
  const values: Record<string, string> = {};
  for (const file of [join(process.cwd(), '.env'), join(process.cwd(), '..', '..', '.env')]) {
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
      if (match && !(match[1] in values)) {
        values[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
      }
    }
  }
  return values;
}

/** Opens a socket, writes `probe` and resolves true if the first reply passes `accept`. */
export function probeService(
  host: string,
  port: number,
  probe: Buffer,
  accept: (reply: Buffer) => boolean,
  timeoutMs = TIMEOUT_MS,
): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ host, port });
    const done = (ok: boolean) => {
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeoutMs, () => done(false));
    socket.once('error', () => done(false));
    socket.once('connect', () => socket.write(probe));
    socket.once('data', (reply) => done(accept(reply)));
    socket.once('end', () => done(false));
  });
}

const POSTGRES_SSL_REQUEST = Buffer.from([0, 0, 0, 8, 0x04, 0xd2, 0x16, 0x2f]);

export function postgresAnswers(host: string, port: number): Promise<boolean> {
  return probeService(host, port, POSTGRES_SSL_REQUEST, (reply) =>
    ['S', 'N'].includes(reply.subarray(0, 1).toString()),
  );
}

export function redisAnswers(host: string, port: number): Promise<boolean> {
  // A password-protected Redis answers PING with -NOAUTH: still alive.
  return probeService(host, port, Buffer.from('PING\r\n'), (reply) =>
    /^(\+PONG|-NOAUTH)/.test(reply.toString()),
  );
}

function hostAndPort(url: string, fallbackPort: number): { host: string; port: number } | null {
  try {
    const parsed = new URL(url);
    return { host: parsed.hostname || 'localhost', port: Number(parsed.port) || fallbackPort };
  } catch {
    return null;
  }
}

/** Spanish, step-by-step message for whoever runs `pnpm dev` on their machine. */
export function describeMissingServices(
  missing: string[],
  what = 'La API no puede arrancar',
  localhostOnly: string[] = [],
): string {
  if (missing.length === 0 && localhostOnly.length > 0) {
    // The containers ARE up: 127.0.0.1 answers, but `localhost` resolves to
    // IPv6 (::1) first on some Windows machines and Docker Desktop only
    // publishes the port on IPv4. Saying "Docker is off" here misleads.
    return [
      '',
      `[AdoptaFácil] ${what}: ${localhostOnly.join(' y ')} responde en 127.0.0.1 pero no en "localhost".`,
      'Los contenedores sí están arriba; tu equipo resuelve "localhost" por IPv6 y Docker solo publica IPv4.',
      'Para arreglarlo, en el archivo .env de la raíz cambia "localhost" por "127.0.0.1" en:',
      '  DATABASE_URL, DATABASE_URL_APP y REDIS_URL',
      'y vuelve a ejecutar el comando. Para revisar todo de una vez: pnpm doctor',
      '',
    ].join('\n');
  }
  return [
    '',
    `[AdoptaFácil] ${what}: no responde ${missing.join(' ni ')}.`,
    'Casi siempre es que los contenedores de Docker están apagados. Para arreglarlo:',
    '  1. Abre Docker Desktop y espera a que diga "Engine running".',
    '  2. En la carpeta del proyecto: docker compose up -d',
    '  3. Revisa con: docker ps   (adoptafacil-postgres y adoptafacil-redis deben decir "healthy")',
    '  4. Vuelve a ejecutar el comando (pnpm dev, pnpm seed:admin...).',
    'Para revisar todo de una vez: pnpm doctor',
    '',
  ].join('\n');
}

export type LocalService = 'postgres' | 'redis';

export interface ServiceCheck {
  /** Services that answer nowhere ("Postgres (localhost:5433)"). */
  missing: string[];
  /** Services that answer on 127.0.0.1 but not on the `localhost` in .env. */
  localhostOnly: string[];
}

async function checkService(
  label: string,
  target: { host: string; port: number },
  answers: (host: string, port: number) => Promise<boolean>,
  result: ServiceCheck,
): Promise<void> {
  if (await answers(target.host, target.port)) return;
  if (target.host === 'localhost' && (await answers('127.0.0.1', target.port))) {
    result.localhostOnly.push(label);
  } else {
    result.missing.push(`${label} (${target.host}:${target.port})`);
  }
}

/** Which of `services` do not answer, and which only fail through `localhost`. */
export async function checkLocalServices(
  services: readonly LocalService[] = ['postgres', 'redis'],
): Promise<ServiceCheck> {
  const files = readEnvFiles();
  const value = (name: string) => process.env[name] ?? files[name] ?? '';
  const result: ServiceCheck = { missing: [], localhostOnly: [] };
  const db = hostAndPort(value('DATABASE_URL'), 5432);
  if (services.includes('postgres') && db) {
    await checkService('Postgres', db, postgresAnswers, result);
  }
  const redis = hostAndPort(value('REDIS_URL'), 6379);
  if (services.includes('redis') && redis) {
    await checkService('Redis', redis, redisAnswers, result);
  }
  return result;
}

/** Which of `services` do not answer, as human labels ("Postgres (localhost:5433)"). */
export async function findMissingServices(
  services: readonly LocalService[] = ['postgres', 'redis'],
): Promise<string[]> {
  const { missing, localhostOnly } = await checkLocalServices(services);
  return [...missing, ...localhostOnly.map((label) => `${label} (localhost)`)];
}

/**
 * Exits with the step-by-step message when a needed service does not answer.
 * `what` names who stops ("La API no puede arrancar", "seed:admin no puede
 * crear el administrador").
 */
export async function runLocalPreflight(
  services: readonly LocalService[] = ['postgres', 'redis'],
  what = 'La API no puede arrancar',
): Promise<void> {
  if (process.env.NODE_ENV === 'production' || process.env.SKIP_SERVICE_PREFLIGHT === '1') return;
  const { missing, localhostOnly } = await checkLocalServices(services);
  if (missing.length > 0 || localhostOnly.length > 0) {
    console.error(describeMissingServices(missing, what, localhostOnly));
    process.exit(1);
  }
}
