import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * AF-N07: el contexto de build de deploy/docker/*.Dockerfile es la raíz del repo
 * y hace `COPY . .`; la etapa `migrate` copia /repo completo. Si un secreto del
 * VPS no está en .dockerignore, termina dentro de la imagen.
 *
 * Intérprete mínimo de .dockerignore (el de Docker: `**`, `*`, negación con `!`,
 * gana la última regla que coincide, y excluir una carpeta excluye su contenido).
 */
const REPO_ROOT = join(__dirname, '..', '..', '..', '..');

function toRegex(pattern: string): RegExp {
  let out = '';
  for (let i = 0; i < pattern.length; i += 1) {
    const c = pattern[i];
    if (c === '*' && pattern[i + 1] === '*') {
      out += pattern[i + 2] === '/' ? '(?:.*/)?' : '.*';
      i += pattern[i + 2] === '/' ? 2 : 1;
    } else if (c === '*') out += '[^/]*';
    else if (c === '?') out += '[^/]';
    else out += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${out}$`);
}

function excluded(path: string, rules: { negate: boolean; re: RegExp }[]): boolean {
  const parts = path.split('/');
  const candidates = parts.map((_, i) => parts.slice(0, i + 1).join('/'));
  let result = false;
  for (const rule of rules) {
    if (candidates.some((candidate) => rule.re.test(candidate))) result = !rule.negate;
  }
  return result;
}

const rules = readFileSync(join(REPO_ROOT, '.dockerignore'), 'utf8')
  .split('\n')
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith('#'))
  .map((line) => {
    const negate = line.startsWith('!');
    const body = (negate ? line.slice(1) : line).replace(/^\/+/, '').replace(/\/+$/, '');
    return { negate, re: toRegex(body) };
  });

describe('.dockerignore (AF-N07)', () => {
  it.each([
    'deploy/api.env',
    'deploy/.env',
    '.env',
    'apps/api/.env',
    'deploy/backups/db-2026-11-24.dump.age',
    'deploy/.last-release',
    'deploy/produccion.env',
    'deploy/backup-identity.key',
    'deploy/tls/origin.pem',
  ])('deja fuera de la imagen el secreto %s', (path) => {
    expect(excluded(path, rules)).toBe(true);
  });

  it.each([
    'deploy/api.env.example',
    'deploy/.env.example',
    'deploy/Caddyfile',
    'deploy/scripts/migrate.sh',
    'apps/api/src/main.ts',
    'prisma/schema/org.prisma',
  ])('sigue incluyendo lo que el build necesita: %s', (path) => {
    expect(excluded(path, rules)).toBe(false);
  });
});
