#!/usr/bin/env node
/**
 * Se ejecuta solo antes de `pnpm dev`. Deja las dependencias al día sin que
 * nadie tenga que acordarse de `pnpm install`:
 *  - si `pnpm-lock.yaml` cambió (un `git pull` trajo paquetes) o falta algún
 *    ejecutable (instalación a medias, p. ej. "nest: not found"), instala;
 *  - si la instalación se corta (en WSL, el sistema mata el proceso por falta de
 *    memoria: SIGKILL), lo dice en español con el arreglo exacto.
 * No toca la base de datos ni el .env (para eso está `pnpm doctor`).
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { freemem, totalmem } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const isWindows = process.platform === 'win32';
const GB = 1024 ** 3;

/** Ejecutables que `pnpm dev` necesita, por paquete. */
const REQUIRED_BINS = [
  ['node_modules', 'turbo'],
  ['apps/api/node_modules', 'nest'],
  ['apps/web/node_modules', 'vite'],
  ['packages/contracts/node_modules', 'tsc'],
];

function binExists(dir, name) {
  const bin = resolve(ROOT, dir, '.bin', name);
  return existsSync(bin) || existsSync(`${bin}.cmd`);
}

function lockfileUpToDate() {
  const installed = resolve(ROOT, 'node_modules/.pnpm/lock.yaml');
  if (!existsSync(installed)) return false;
  return readFileSync(installed, 'utf8') === readFileSync(resolve(ROOT, 'pnpm-lock.yaml'), 'utf8');
}

const missing = REQUIRED_BINS.filter(([dir, name]) => !binExists(dir, name)).map(
  ([dir, name]) => `${dir.replace(/\/node_modules$/, '')} (${name})`,
);
const stale = !lockfileUpToDate();

if (missing.length === 0 && !stale) process.exit(0);

console.log(
  missing.length > 0
    ? `Faltan ejecutables (${missing.join(', ')}): la instalación quedó a medias.`
    : 'Hay paquetes nuevos desde la última instalación.',
);
console.log('Instalando dependencias (pnpm install --frozen-lockfile)…\n');

const free = freemem() / GB;
if (free < 2) {
  console.log(
    `AVISO: solo hay ${free.toFixed(1)} GB de memoria libre (de ${(totalmem() / GB).toFixed(1)} GB). ` +
      'Si el sistema corta la instalación, cierra otros programas o, en WSL, sube la memoria en ' +
      'C:\\Users\\<tu usuario>\\.wslconfig ([wsl2] memory=6GB) y ejecuta `wsl --shutdown`.\n',
  );
}

const result = spawnSync('pnpm', ['install', '--frozen-lockfile'], {
  cwd: ROOT,
  stdio: 'inherit',
  shell: isWindows,
});

if (result.status !== 0) {
  const killed = result.signal === 'SIGKILL' || result.status === 137;
  console.error(
    killed
      ? '\nEl sistema cortó la instalación por falta de memoria (SIGKILL). Libera memoria o súbela en WSL (ver arriba) y vuelve a ejecutar `pnpm dev`.'
      : '\nLa instalación falló. Revisa el error de arriba y vuelve a ejecutar `pnpm dev`.',
  );
  process.exit(1);
}

const still = REQUIRED_BINS.filter(([dir, name]) => !binExists(dir, name));
if (still.length > 0) {
  console.error(
    `\nTras instalar siguen faltando: ${still.map(([d, n]) => `${d}/.bin/${n}`).join(', ')}.\n` +
      'Borra las carpetas node_modules (`rm -rf node_modules apps/*/node_modules packages/*/node_modules`) y vuelve a ejecutar `pnpm dev`.',
  );
  process.exit(1);
}
console.log('\nDependencias al día.\n');
