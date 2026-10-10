#!/usr/bin/env node
/**
 * `pnpm doctor`: revisa en un solo paso lo que el entorno local necesita para
 * `pnpm dev` y dice, en español, el paso exacto para arreglar lo que falle.
 *
 * Revisa: versión de Node y pnpm, el archivo `.env`, Docker (CLI y motor), los
 * contenedores `adoptafacil-postgres` y `adoptafacil-redis`, que Postgres y
 * Redis respondan de verdad en sus puertos (no basta con que el puerto esté
 * abierto: en Windows, Docker Desktop lo abre aunque el contenedor esté
 * apagado), las migraciones pendientes y los puertos 3000 y 5173.
 *
 * Solo lee: no arranca, no borra ni migra nada. Sale con código 1 si algo falla.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { connect } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const isWindows = process.platform === 'win32';
let failures = 0;

const ok = (label, detail = '') => console.log(`  OK    ${label}${detail ? ` · ${detail}` : ''}`);
const warn = (label, fix) => console.log(`  AVISO ${label}\n        → ${fix}`);
const bad = (label, fix) => {
  failures += 1;
  console.log(`  FALLA ${label}\n        → ${fix}`);
};

function readEnv() {
  const file = resolve(ROOT, '.env');
  const values = {};
  if (!existsSync(file)) return null;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (match) values[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return values;
}

function run(command, args, timeout = 15_000) {
  const result = spawnSync(command, args, { encoding: 'utf8', timeout, shell: isWindows });
  return { ok: result.status === 0, out: `${result.stdout ?? ''}${result.stderr ?? ''}`.trim() };
}

/** Escribe `probe` y acepta la primera respuesta si cumple `accept`. */
function probe(host, port, payload, accept, timeoutMs = 3000) {
  return new Promise((resolvePromise) => {
    const socket = connect({ host, port });
    const done = (value) => {
      socket.destroy();
      resolvePromise(value);
    };
    socket.setTimeout(timeoutMs, () => done('timeout'));
    socket.once('error', (error) => done(error.code ?? 'error'));
    socket.once('connect', () => socket.write(payload));
    socket.once('data', (reply) => done(accept(reply) ? 'ok' : 'respuesta inesperada'));
    socket.once('end', () => done('cerró la conexión'));
  });
}

const postgresProbe = (host, port) =>
  probe(host, port, Buffer.from([0, 0, 0, 8, 0x04, 0xd2, 0x16, 0x2f]), (reply) =>
    ['S', 'N'].includes(reply.subarray(0, 1).toString()),
  );
const redisProbe = (host, port) =>
  probe(host, port, Buffer.from('PING\r\n'), (reply) => /^(\+PONG|-NOAUTH)/.test(reply.toString()));

function hostPort(url, fallback) {
  try {
    const parsed = new URL(url);
    return { host: parsed.hostname || 'localhost', port: Number(parsed.port) || fallback };
  } catch {
    return null;
  }
}

async function portInUse(port) {
  const result = await probe('localhost', port, Buffer.alloc(0), () => true, 1500);
  return !['ECONNREFUSED', 'error'].includes(result);
}

const DOCKER_UP =
  'Abre Docker Desktop, espera "Engine running" y en la carpeta del proyecto corre: docker compose up -d';

async function main() {
  console.log('AdoptaFácil · revisión del entorno local\n');

  // Node y pnpm
  const nodeMajor = Number(process.versions.node.split('.')[0]);
  if (nodeMajor === 20) ok('Node', process.versions.node);
  else
    warn(
      `Node ${process.versions.node}`,
      'El proyecto usa Node 20 LTS: fnm install 20 && fnm use 20',
    );
  const pnpm = run('pnpm', ['-v']);
  if (pnpm.ok && pnpm.out.startsWith('9.')) ok('pnpm', pnpm.out);
  else
    warn(
      `pnpm ${pnpm.out || 'no encontrado'}`,
      'Instala pnpm 9.15.9: corepack enable && corepack prepare pnpm@9.15.9 --activate',
    );

  // .env
  const env = readEnv();
  if (!env) {
    bad('.env no existe', 'Créalo con: pnpm setup:env');
  } else {
    ok('.env');
  }

  // Docker
  const docker = run('docker', ['info', '--format', '{{.ServerVersion}}']);
  if (!docker.ok) {
    bad('Docker no responde', DOCKER_UP);
  } else {
    ok('Docker', `motor ${docker.out}`);
    for (const name of ['adoptafacil-postgres', 'adoptafacil-redis']) {
      const inspect = run('docker', [
        'inspect',
        '-f',
        '{{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{end}}',
        name,
      ]);
      if (!inspect.ok) bad(`${name} no existe`, 'En la carpeta del proyecto: docker compose up -d');
      else if (/^running( healthy)?$/.test(inspect.out)) ok(name, inspect.out);
      else
        bad(
          `${name}: ${inspect.out}`,
          `docker compose up -d   y si sigue igual: docker logs ${name} --tail 30`,
        );
    }
  }

  // Postgres y Redis responden de verdad
  if (env) {
    const db = hostPort(env.DATABASE_URL, 5432);
    if (!db) bad('DATABASE_URL no es válida en .env', 'Regenera .env con: pnpm setup:env');
    else {
      const result = await postgresProbe(db.host, db.port);
      if (result === 'ok') ok('Postgres responde', `${db.host}:${db.port}`);
      else bad(`Postgres no responde en ${db.host}:${db.port} (${result})`, DOCKER_UP);
    }
    const redis = hostPort(env.REDIS_URL, 6379);
    if (!redis) bad('REDIS_URL no es válida en .env', 'Regenera .env con: pnpm setup:env');
    else {
      const result = await redisProbe(redis.host, redis.port);
      if (result === 'ok') ok('Redis responde', `${redis.host}:${redis.port}`);
      else bad(`Redis no responde en ${redis.host}:${redis.port} (${result})`, DOCKER_UP);
    }

    // Migraciones (solo si Postgres está arriba)
    if (failures === 0) {
      const status = run('pnpm', ['exec', 'prisma', 'migrate', 'status'], 60_000);
      if (/Database schema is up to date/i.test(status.out)) ok('Migraciones al día');
      else if (/have not yet been applied|not yet been applied/i.test(status.out))
        bad('Hay migraciones sin aplicar en tu base local', 'pnpm db:deploy');
      else warn('No se pudo leer el estado de las migraciones', 'pnpm exec prisma migrate status');
    }
  }

  // Puertos de la app
  for (const [port, what] of [
    [3000, 'API'],
    [5173, 'web'],
  ]) {
    if (await portInUse(port)) {
      warn(
        `El puerto ${port} (${what}) ya está en uso`,
        `Si no es tu pnpm dev actual, ciérralo. Windows: netstat -ano | findstr :${port}  y luego  taskkill /PID <pid> /F`,
      );
    } else ok(`Puerto ${port} libre`, what);
  }

  console.log(
    failures === 0
      ? '\nTodo listo: corre pnpm dev.'
      : `\n${failures} problema(s). Arregla lo marcado como FALLA y vuelve a correr pnpm doctor.`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
