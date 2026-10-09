/**
 * Idempotent seed: creates a PlatformAdmin (+ PlatformSuperAdmin) user so
 * someone can operate the cross-tenant document review queue (RF03,
 * `/plataforma/documentos`) during the pilot — without it, nobody can
 * approve/reject organizations' documents.
 *
 * Usage (from repo root):
 *   pnpm seed:admin        (en una terminal: pide correo, nombre y contraseña)
 *   PLATFORM_ADMIN_EMAIL=ops@adoptafacil.co PLATFORM_ADMIN_PASSWORD='…' pnpm seed:admin
 *   pnpm seed:admin -- ops@adoptafacil.co "una-clave-larga-y-unica" "Admin Piloto"
 *   PLATFORM_ADMIN_EMAIL=… PLATFORM_ADMIN_PASSWORD='…' pnpm seed:admin -- --rotate-password
 *
 * Credentials come from env vars (preferred: CLI args end up in the shell
 * history) or from CLI args (email, password, displayName, in that order):
 *   PLATFORM_ADMIN_EMAIL, PLATFORM_ADMIN_PASSWORD, PLATFORM_ADMIN_NAME
 * There are NO defaults (AF-037): without an email and a password the script
 * refuses to run. The password must meet the platform policy
 * (`MIN_PASSWORD_LENGTH`) and cannot be a known default such as the old
 * `changeme123`.
 *
 * Idempotent: running it twice never duplicates the user — a second run finds
 * the existing credential by email and just re-asserts (upserts) the platform
 * roles, so a partially-failed prior run is safely completed too. An existing
 * password is NEVER changed silently: pass `--rotate-password` to replace it
 * (Argon2id) with the one given.
 */
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { PrismaClient } from '@prisma/client';
import { MIN_PASSWORD_LENGTH, Role } from '@adoptafacil/contracts';
import { PasswordService } from '../src/core/auth/password.service';

/** Load the repo-root `.env` (same file the API reads) without adding a
 *  dependency — mirrors the hand-rolled approach already used by
 *  scripts/setup-env.mjs. Never overrides a var already set in the shell. */
function loadRootEnv(): void {
  const envPath = join(__dirname, '..', '..', '..', '.env');
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    const quoted =
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"));
    if (quoted) value = value.slice(1, -1);
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

loadRootEnv();

// pnpm (unlike npm) forwards a literal `--` through `pnpm run seed:admin -- x y z`
// instead of stripping it — filter it out so positional args land correctly
// regardless of whether this runs via the root wrapper or apps/api directly.
const rawArgs = process.argv.slice(2).filter((arg) => arg !== '--');
const rotatePassword = rawArgs.includes('--rotate-password');
const [argEmail, argPassword, argName] = rawArgs.filter((arg) => !arg.startsWith('--'));

/** Placeholders that pass the length rule but must never protect a platform
 *  account (variants of the former `changeme123` default). Case-insensitive.
 *  Shorter ones (incl. `changeme123` itself) already fail MIN_PASSWORD_LENGTH. */
const FORBIDDEN_PASSWORDS = new Set([
  'changeme1234',
  'changeme12345',
  'password1234',
  'adoptafacil123',
  'adoptafacil1234',
  'adminadoptafacil',
]);

/** Reads one line from the terminal; with `hidden`, typed characters are not
 *  echoed (works in cmd/PowerShell and POSIX shells). */
function ask(question: string, hidden = false): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  if (hidden) {
    const muted = rl as unknown as { _writeToOutput: (chunk: string) => void };
    muted._writeToOutput = (chunk: string) => {
      if (chunk.includes(question)) process.stdout.write(chunk);
    };
  }
  return new Promise((resolve) =>
    rl.question(question, (answer) => {
      rl.close();
      if (hidden) process.stdout.write('\n');
      resolve(answer);
    }),
  );
}

function fail(message: string): never {
  console.error(`[seed:admin] ${message}`);
  process.exit(1);
}

/** Credentials from args or env; when missing and a person is at the terminal,
 *  they are asked for (password hidden, typed twice). Nothing is ever defaulted. */
async function resolveCredentials(): Promise<{
  email: string;
  password: string;
  displayName: string;
}> {
  let email = (argEmail ?? process.env.PLATFORM_ADMIN_EMAIL ?? '').trim().toLowerCase();
  let password = argPassword ?? process.env.PLATFORM_ADMIN_PASSWORD ?? '';
  let displayName = argName ?? process.env.PLATFORM_ADMIN_NAME ?? '';

  if ((!email || !password) && process.stdin.isTTY) {
    console.log('[seed:admin] Crea (o asegura) una cuenta de administración de la plataforma.');
    if (!email) email = (await ask('Correo: ')).trim().toLowerCase();
    if (!displayName)
      displayName = (await ask('Nombre para mostrar (Enter = Platform Admin): ')).trim();
    if (!password) {
      password = await ask(`Contraseña (mínimo ${MIN_PASSWORD_LENGTH} caracteres): `, true);
      if ((await ask('Repite la contraseña: ', true)) !== password) {
        fail('Las contraseñas no coinciden.');
      }
    }
  }

  if (!email || !password) {
    fail(
      'Faltan credenciales: ejecútalo en una terminal para que te las pida, o define ' +
        'PLATFORM_ADMIN_EMAIL y PLATFORM_ADMIN_PASSWORD. No hay valores por defecto.',
    );
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    fail(`La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`);
  }
  if (FORBIDDEN_PASSWORDS.has(password.toLowerCase())) {
    fail('Esa contraseña es un valor por defecto conocido. Usa una única.');
  }
  if (argPassword) {
    console.warn(
      '[seed:admin] Aviso: la contraseña llegó como argumento y puede quedar en el historial de la ' +
        'terminal. Prefiere que el script te la pida.',
    );
  }
  return { email, password, displayName: displayName || 'Platform Admin' };
}

/** Both platform roles, so the pilot operator can do everything at the
 *  platform level (review queue, future platform settings, etc.). */
const PLATFORM_ROLES = [Role.PlatformAdmin, Role.PlatformSuperAdmin] as const;

async function main(): Promise<void> {
  const { email, password, displayName } = await resolveCredentials();
  // Superuser connection (bypasses RLS) — this is an ops/bootstrap script, not
  // an authenticated request; mirrors the `admin` PrismaClient used by the
  // integration tests' cleanup helper.
  const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  // Same hashing as normal registration (Argon2id) — reused, not reimplemented.
  const passwords = new PasswordService();

  try {
    const existing = await prisma.authCredential.findUnique({ where: { email } });

    let userId: string;
    let organizationId: string;

    if (existing) {
      console.log(`[seed:admin] Ya existe una credencial para ${email} — no se duplica.`);
      userId = existing.userId;
      organizationId = existing.organizationId;
      if (rotatePassword) {
        await prisma.authCredential.update({
          where: { id: existing.id },
          data: { passwordHash: await passwords.hash(password) },
        });
        // Rotating a credential ends every open session of that account.
        await prisma.refreshToken.updateMany({
          where: { userId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        console.log(`[seed:admin] Contraseña rotada para ${email}; sesiones abiertas revocadas.`);
      } else {
        console.log('[seed:admin] La contraseña existente NO se cambió (usa --rotate-password).');
      }
    } else {
      organizationId = randomUUID();
      userId = randomUUID();
      const passwordHash = await passwords.hash(password);

      await prisma.$transaction(async (tx) => {
        await tx.organization.create({
          data: { id: organizationId, name: `${displayName} (Platform)`, status: 'approved' },
        });
        await tx.user.create({
          data: { id: userId, organizationId, accountType: 'person', email, displayName },
        });
        await tx.authCredential.create({
          data: { userId, organizationId, accountType: 'person', email, passwordHash },
        });
      });
      console.log(`[seed:admin] Usuario creado: ${email} (userId=${userId}).`);
    }

    // Upsert (not create): a second run never duplicates a role row, and a
    // partially-failed prior run (e.g. credential created but roles missing)
    // gets completed safely.
    for (const role of PLATFORM_ROLES) {
      await prisma.userRole.upsert({
        where: { organizationId_userId_role: { organizationId, userId, role } },
        create: { organizationId, userId, role },
        update: {},
      });
    }
    console.log(`[seed:admin] Roles asegurados para ${email}: ${PLATFORM_ROLES.join(', ')}.`);
    console.log('[seed:admin] Listo. Inicia sesión y visita /plataforma/documentos.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error('[seed:admin] Error:', error);
  process.exit(1);
});
