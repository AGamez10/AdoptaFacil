// Local demo .env: turns on every module needed to see the current work.
//
// `pnpm setup:demo-env` creates .env from .env.example when missing (same
// UTF-8 no-BOM rule as setup-env.mjs) and then sets ONLY the module flags
// below to "true". Every other line (SMTP, secrets, URLs, values you set by
// hand) is kept byte for byte. Prints what changed.
//
// Refuses when the .env looks like production: NODE_ENV=production or a
// DATABASE_URL that is not localhost. No credentials are written.
//
// Left off on purpose: FEATURE_PAYMENTS (no gateway chosen yet) and
// FEATURE_VOLUNTEERING_MINORS (not allowed until the legal review closes).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEMO_FLAGS = [
  'FEATURE_SPONSORSHIPS',
  'FEATURE_DONATION_CERTIFICATES',
  'FEATURE_COMMUNITY',
  'FEATURE_COMMUNITY_WALL',
  'REPORTS_SIGNATURES_ENABLED',
  'FEATURE_REPUTATION',
  'FEATURE_RESOURCES',
  'FEATURE_MARKETPLACE',
];

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

function readValue(lines, key) {
  for (const line of lines) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=(.*)$/);
    if (m && m[1] === key) return m[2].trim().replace(/^(['"])(.*)\1$/, '$2');
  }
  return undefined;
}

/** Returns the new text and the list of changes; throws on a production-looking file. */
export function applyDemoFlags(text) {
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const lines = text.split(/\r?\n/);

  if (readValue(lines, 'NODE_ENV') === 'production') {
    throw new Error('NODE_ENV=production en .env: esto es solo para la demo local.');
  }
  const dbUrl = readValue(lines, 'DATABASE_URL');
  if (dbUrl) {
    let host;
    try {
      host = new URL(dbUrl).hostname;
    } catch {
      host = undefined;
    }
    if (!host || !LOCAL_HOSTS.has(host)) {
      throw new Error(`DATABASE_URL no apunta a una base local (${host ?? 'ilegible'}).`);
    }
  }

  const changes = [];
  const seen = new Set();
  const out = lines.map((line) => {
    const m = line.match(/^(\s*)([A-Z0-9_]+)(\s*=\s*)(.*)$/);
    if (!m || !DEMO_FLAGS.includes(m[2])) return line;
    seen.add(m[2]);
    if (m[4].trim() === 'true') return line;
    changes.push(`${m[2]}: ${m[4].trim() || '(vacío)'} → true`);
    return `${m[1]}${m[2]}${m[3]}true`;
  });

  const missing = DEMO_FLAGS.filter((key) => !seen.has(key));
  if (missing.length > 0) {
    while (out.length > 0 && out[out.length - 1] === '') out.pop();
    out.push('', '# --- pnpm setup:demo-env ---');
    for (const key of missing) {
      out.push(`${key}=true`);
      changes.push(`${key}: (no estaba) → true`);
    }
    out.push('');
  }

  return { text: out.join(eol), changes };
}

/** Bandeja local (servicio `mailpit` de docker-compose.yml). */
export const LOCAL_MAILBOX = {
  NOTIFICATION_DRIVER: 'smtp',
  SMTP_HOST: 'localhost',
  SMTP_PORT: '1025',
  SMTP_FROM: '"AdoptaFácil (local)" <no-reply@adoptafacil.local>',
};

/**
 * Con NOTIFICATION_DRIVER=log los correos solo se escriben en la consola de la
 * API: una invitación o una solicitud de firma "no llega" a nadie. Si el .env
 * no tiene un SMTP propio (driver log y SMTP_HOST vacío), lo apunta a la
 * bandeja local de Mailpit (http://localhost:8025). Un SMTP ya configurado
 * nunca se toca.
 */
export function applyLocalMailbox(text) {
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const lines = text.split(/\r?\n/);
  const driver = readValue(lines, 'NOTIFICATION_DRIVER') ?? 'log';
  const host = readValue(lines, 'SMTP_HOST') ?? '';
  if (driver !== 'log' || host !== '') return { text, changes: [] };

  const changes = [];
  const seen = new Set();
  const out = lines.map((line) => {
    const m = line.match(/^(\s*)([A-Z0-9_]+)(\s*=\s*)(.*)$/);
    if (!m || !(m[2] in LOCAL_MAILBOX) || seen.has(m[2])) return line;
    seen.add(m[2]);
    const value = LOCAL_MAILBOX[m[2]];
    const current = m[4].trim().replace(/^(['"])(.*)\1$/, '$2');
    if (current === value) return line;
    changes.push(`${m[2]}: ${m[4].trim() || '(vacío)'} → ${value}`);
    return `${m[1]}${m[2]}${m[3]}${m[2] === 'SMTP_FROM' ? `'${value}'` : value}`;
  });
  const missing = Object.keys(LOCAL_MAILBOX).filter((key) => !seen.has(key));
  if (missing.length > 0) {
    while (out.length > 0 && out[out.length - 1] === '') out.pop();
    out.push('', '# --- pnpm setup:demo-env: bandeja local (Mailpit) ---');
    for (const key of missing) {
      const value = LOCAL_MAILBOX[key];
      out.push(`${key}=${key === 'SMTP_FROM' ? `'${value}'` : value}`);
      changes.push(`${key}: (no estaba) → ${value}`);
    }
    out.push('');
  }
  return { text: out.join(eol), changes };
}

/**
 * Appends to an existing .env the keys the template has and the file lacks, so
 * a .env from an older checkout gets the new variables. Existing lines are never
 * changed. Commented-out keys in the template are not added.
 */
export function addMissingKeys(text, templateText) {
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const present = new Set(
    text
      .split(/\r?\n/)
      .map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=/)?.[1])
      .filter(Boolean),
  );
  const added = [];
  for (const line of templateText.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)\s*=/);
    if (m && !present.has(m[1])) {
      added.push(line);
      present.add(m[1]);
    }
  }
  if (added.length === 0) return { text, added };
  const base = text.endsWith('\n') ? text : text + eol;
  return {
    text: base + '# --- añadido por pnpm setup:demo-env ---' + eol + added.join(eol) + eol,
    added,
  };
}

function main() {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const examplePath = join(root, '.env.example');
  const targetPath = join(root, '.env');

  if (!existsSync(targetPath)) {
    if (!existsSync(examplePath)) {
      console.error('[setup:demo-env] No hay .env ni .env.example en la raíz del repo.');
      process.exit(1);
    }
    writeFileSync(targetPath, readFileSync(examplePath, 'utf8'), { encoding: 'utf8' });
    console.log('[setup:demo-env] Creado .env desde .env.example.');
  }

  let result;
  try {
    result = applyDemoFlags(readFileSync(targetPath, 'utf8').replace(/^\uFEFF/, ''));
  } catch (error) {
    console.error(`[setup:demo-env] No se tocó nada: ${error.message}`);
    process.exit(1);
  }
  const keys = addMissingKeys(result.text, readFileSync(examplePath, 'utf8'));
  const mailbox = applyLocalMailbox(keys.text);
  keys.text = mailbox.text;
  const changes = [
    ...keys.added.map(
      (line) =>
        `${line.split('=')[0]}: (no estaba) → ${line.slice(line.indexOf('=') + 1) || '(vacío)'}`,
    ),
    ...result.changes,
    ...mailbox.changes,
  ];

  if (changes.length === 0) {
    console.log('[setup:demo-env] Todo ya estaba listo; .env sin cambios.');
    return;
  }
  writeFileSync(targetPath, keys.text, { encoding: 'utf8' });
  console.log('[setup:demo-env] Cambios en .env:');
  for (const change of changes) console.log(`  - ${change}`);
  if (mailbox.changes.length > 0) {
    console.log(
      '[setup:demo-env] Correos a la bandeja local: corre `docker compose up -d mailpit` y ábrelos en http://localhost:8025',
    );
  }
  console.log('[setup:demo-env] Si `pnpm dev` ya corría, reinícialo para que tome los cambios.');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
