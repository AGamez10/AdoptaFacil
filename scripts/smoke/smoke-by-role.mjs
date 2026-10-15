#!/usr/bin/env node
/**
 * Prueba de humo por rol (`pnpm smoke`): recorre en un navegador real lo que ya
 * funciona, con cada rol, contra un stack LOCAL levantado con `pnpm dev`.
 *
 * Requisitos previos (una sola vez sobre la base local):
 *   pnpm seed:admin && pnpm seed:demo
 *   y las banderas FEATURE_* encendidas en `.env` (con PAYMENT_DRIVER=fake).
 *
 * Qué cubre:
 *   - visitante: landing, portal público, campañas (lista + detalle), donar,
 *     marketplace, recursos, transparencia, verificación de certificados;
 *   - persona: login, apadrinar, mis donaciones/solicitudes, solicitud de adopción;
 *   - dueño de organización: login, panel completo, pendientes (campana),
 *     aprobación de la solicitud, contrato de adopción y reportes;
 *   - administrador de plataforma: login, verificación en dos pasos (TOTP), revisión de
 *     organizaciones y tableros. La primera corrida activa el segundo factor de esa
 *     cuenta y guarda la clave en ~/.adoptafacil-smoke/ (nunca en el repo).
 *
 * Cada página falla si muestra un mensaje de error conocido, si lanza un error
 * de JavaScript, si alguna llamada al API responde 5xx o 429, o si una llamada
 * de autenticación responde 4xx (sesión perdida). Sale con código 1 si algo falla.
 *
 * Crea datos de prueba (una solicitud de adopción y su contrato) y por eso se
 * niega a correr contra un API que no sea local, salvo SMOKE_ALLOW_REMOTE=1.
 * Nunca hace cobros: no envía ningún formulario de pago.
 *
 * Variables (todas opcionales; se leen del entorno o del `.env` de la raíz):
 *   SMOKE_WEB_URL (http://localhost:5173), SMOKE_API_URL (http://localhost:3000),
 *   SEED_DEMO_PASSWORD, PLATFORM_ADMIN_EMAIL, PLATFORM_ADMIN_PASSWORD,
 *   SMOKE_OUT (carpeta para capturas), PLAYWRIGHT_CHROMIUM_PATH,
 *   SMOKE_ADMIN_TOTP_SECRET o SMOKE_TOTP_FILE (clave TOTP de una cuenta ya activada).
 */
import { createHmac } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function loadDotEnv() {
  const file = resolve(ROOT, '.env');
  const values = {};
  if (!existsSync(file)) return values;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!match) continue;
    values[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return values;
}

const dotEnv = loadDotEnv();
const env = (name, fallback = '') => process.env[name] ?? dotEnv[name] ?? fallback;

const WEB = env('SMOKE_WEB_URL', 'http://localhost:5173').replace(/\/$/, '');
const API = env('SMOKE_API_URL', 'http://localhost:3000').replace(/\/$/, '');
const DEMO_PASSWORD = env('SEED_DEMO_PASSWORD', 'DemoPass123!');
const ADMIN_EMAIL = env('PLATFORM_ADMIN_EMAIL');
const ADMIN_PASSWORD = env('PLATFORM_ADMIN_PASSWORD');
const OUT = process.env.SMOKE_OUT ?? '';
const OWNER_EMAIL = 'owner@refugiopatitasfelices.demo';
const PERSON_EMAIL = 'donante@demo.adoptafacil.local';
const PORTAL_SLUG = 'patitas-felices';

const isLocal = (url) => /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(url);
if ((!isLocal(API) || !isLocal(WEB)) && process.env.SMOKE_ALLOW_REMOTE !== '1') {
  console.error('La prueba de humo crea datos de prueba: solo corre contra localhost.');
  process.exit(2);
}
if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error(
    'Faltan PLATFORM_ADMIN_EMAIL / PLATFORM_ADMIN_PASSWORD (los de `pnpm seed:admin`).',
  );
  process.exit(2);
}

const ERROR_TEXTS = [
  'Algo salió mal',
  'Ocurrió un error',
  'No se pudo cargar',
  'Organización no encontrada',
  'Página no encontrada',
];

const results = [];

function record(role, step, problems) {
  results.push({ role, step, ok: problems.length === 0, problems });
  const mark = problems.length === 0 ? 'ok  ' : 'FAIL';
  console.log(`${mark} [${role}] ${step}${problems.length ? ` → ${problems.join(' | ')}` : ''}`);
}

/** Abre un contexto de navegador que anota errores de JS y respuestas malas del API. */
async function openSession(browser, role) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const session = { role, context, page, pending: [], accessToken: null };
  page.on('pageerror', (error) => session.pending.push(`error JS: ${String(error).slice(0, 160)}`));
  page.on('response', async (response) => {
    const url = response.url();
    if (!url.startsWith(API)) return;
    const path = url.slice(API.length).split('?')[0];
    const status = response.status();
    if (status >= 500 || status === 429 || (status >= 400 && path.startsWith('/auth/'))) {
      session.pending.push(`${status} ${response.request().method()} ${path}`);
    }
    if (path === '/auth/login' && status === 200) {
      const body = await response.json().catch(() => null);
      session.accessToken = body?.tokens?.accessToken ?? session.accessToken;
    }
  });
  return session;
}

async function check(session, step, action) {
  session.pending = [];
  const problems = [];
  try {
    await action(session.page);
    await session.page.waitForTimeout(1500);
    const text = (await session.page.textContent('body')) ?? '';
    for (const message of ERROR_TEXTS)
      if (text.includes(message)) problems.push(`muestra "${message}"`);
  } catch (error) {
    problems.push(
      String(error?.message ?? error)
        .split('\n')[0]
        .slice(0, 200),
    );
  }
  problems.push(...session.pending);
  if (OUT) {
    const name = `${session.role}-${step}`.replace(/[^a-z0-9-]+/gi, '_');
    await session.page.screenshot({ path: `${OUT}/${name}.png` }).catch(() => {});
  }
  record(session.role, step, problems);
}

const visit = (session, route) => check(session, route, (page) => page.goto(WEB + route));

async function login(session, email, password) {
  await check(session, 'login', async (page) => {
    await page.goto(`${WEB}/login`);
    await page.getByLabel('Correo electrónico').fill(email);
    await page.getByLabel('Contraseña').fill(password);
    await page.getByRole('button', { name: 'Iniciar sesión' }).click();
    try {
      await page.waitForURL(/\/(inicio|perfil)/, { timeout: 15_000 });
    } catch {
      const alert = (await page.locator('[role=alert]').allTextContents()).join(' ').trim();
      throw new Error(`no entró${alert ? `: ${alert}` : ''}`);
    }
    await acceptLegalGate(page);
  });
}

/** Cuentas creadas antes de una versión nueva de los textos legales ven el
 *  diálogo "Antes de continuar": se aceptan solo las casillas obligatorias
 *  (términos, datos y, en una organización, sus condiciones); las opcionales quedan sin marcar, como haría una persona. */
async function acceptLegalGate(page) {
  const dialog = page.getByRole('dialog').filter({ hasText: 'Antes de continuar' });
  try {
    await dialog.waitFor({ state: 'visible', timeout: 4_000 });
  } catch {
    return;
  }
  await dialog.getByRole('checkbox', { name: /^Acepto los/ }).check();
  await dialog.getByRole('checkbox', { name: /^Autorizo el tratamiento/ }).check();
  // Solo cuentas de organización: condiciones para organizaciones (obligatoria).
  const orgTerms = dialog.getByRole('checkbox', { name: /^En nombre de la organización/ });
  if (await orgTerms.count()) await orgTerms.check();
  await dialog.getByRole('button', { name: 'Aceptar y continuar' }).click();
  await dialog.waitFor({ state: 'hidden', timeout: 10_000 });
}

// ── Verificación en dos pasos del personal de plataforma (TOTP, RFC 6238) ──
// La prueba no apaga la exigencia: la cumple como lo haría una persona. La
// primera vez activa el segundo factor y guarda la clave FUERA del repo, solo
// en esta máquina; las siguientes calcula el código con esa clave.
function base32Decode(input) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const char of input.replace(/=+$/, '').replace(/\s+/g, '').toUpperCase()) {
    const value = alphabet.indexOf(char);
    if (value < 0) throw new Error('Clave TOTP con caracteres inválidos.');
    bits += value.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

function totp(secret, nowMs = Date.now()) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(nowMs / 1000 / 30)));
  const digest = createHmac('sha1', base32Decode(secret)).update(counter).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const code = (digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return String(code).padStart(6, '0');
}

const totpFile = (email) =>
  env('SMOKE_TOTP_FILE') || resolve(homedir(), '.adoptafacil-smoke', `totp-${email}.txt`);

function loadTotpSecret(email) {
  const fromEnv = env('SMOKE_ADMIN_TOTP_SECRET');
  if (fromEnv) return fromEnv;
  const file = totpFile(email);
  return existsSync(file) ? readFileSync(file, 'utf8').trim() : '';
}

/** Un código que el API aún no haya aceptado (no reutiliza el de la ventana anterior). */
async function freshTotp(page, secret, lastCode) {
  let code = totp(secret);
  while (code === lastCode) {
    await page.waitForTimeout(2000);
    code = totp(secret);
  }
  return code;
}

async function passPlatformMfa(session, email, password) {
  await check(session, 'verificación en dos pasos', async (page) => {
    const enroll = page.getByText('Activa la verificación en dos pasos');
    const confirm = page.getByText('Confirma que eres tú');
    try {
      await enroll.or(confirm).first().waitFor({ timeout: 8_000 });
    } catch {
      return; // PLATFORM_MFA_REQUIRED=false en este entorno: nada que pasar.
    }
    let secret;
    if (await enroll.isVisible()) {
      await page.locator('#mfa-password').fill(password);
      await page.getByRole('button', { name: 'Continuar' }).click();
      const key = page.locator('code.font-mono');
      await key.waitFor({ timeout: 10_000 });
      secret = (await key.textContent())?.trim() ?? '';
      const file = totpFile(email);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, `${secret}\n`, { mode: 0o600 });
    } else {
      secret = loadTotpSecret(email);
      if (!secret) {
        throw new Error(
          `la cuenta ya tiene segundo factor y no hay clave guardada: define SMOKE_ADMIN_TOTP_SECRET o ${totpFile(email)}`,
        );
      }
    }
    session.lastTotp = await freshTotp(page, secret, session.lastTotp);
    await page.locator('#mfa-code').fill(session.lastTotp);
    await page.getByRole('button', { name: /^(Activar|Confirmar)$/ }).click();
    await enroll.or(confirm).first().waitFor({ state: 'hidden', timeout: 15_000 });
  });
}

async function api(session, method, path, body) {
  const response = await fetch(API + path, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(session.accessToken ? { authorization: `Bearer ${session.accessToken}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = Array.isArray(data?.message) ? data.message.join('; ') : data?.message;
    const error = new Error(
      `${method} ${path} → ${response.status}${detail ? ` (${detail})` : data?.error ? ` (${data.error})` : ''}`,
    );
    error.data = data;
    throw error;
  }
  return data;
}

/** Paso por API con su propio registro (para preparar el contrato). */
async function apiStep(session, step, fn) {
  try {
    const value = await fn();
    record(session.role, step, []);
    return value;
  } catch (error) {
    record(session.role, step, [String(error?.message ?? error)]);
    return null;
  }
}

async function main() {
  const browser = await chromium.launch({
    ...(env('PLAYWRIGHT_CHROMIUM_PATH') ? { executablePath: env('PLAYWRIGHT_CHROMIUM_PATH') } : {}),
  });
  if (OUT) mkdirSync(OUT, { recursive: true });

  // ── Visitante (sin sesión) ─────────────────────────────────────────────
  const visitor = await openSession(browser, 'visitante');
  for (const route of [
    '/',
    `/o/${PORTAL_SLUG}`,
    '/o/huellas-esperanza',
    '/marketplace',
    '/recursos',
    '/donaciones',
    '/transparencia',
    '/verificar',
  ]) {
    await visit(visitor, route);
  }
  await visitor.context.close();

  // ── Persona ────────────────────────────────────────────────────────────
  const person = await openSession(browser, 'persona');
  await login(person, PERSON_EMAIL, DEMO_PASSWORD);
  for (const route of [
    '/inicio',
    '/mis-donaciones',
    '/mis-solicitudes',
    '/voluntariado',
    '/comunidad',
    '/certificado',
  ]) {
    await visit(person, route);
  }

  // ── Dueño de organización ──────────────────────────────────────────────
  const owner = await openSession(browser, 'dueno');
  await login(owner, OWNER_EMAIL, DEMO_PASSWORD);
  // El detalle de campaña necesita al menos una campaña activa.
  await apiStep(owner, 'API: campaña activa', async () => {
    const campaigns = await api(owner, 'GET', '/campaigns');
    if ((campaigns?.items ?? []).some((c) => c.status === 'active')) return;
    const deadline = new Date(Date.now() + 60 * 24 * 3600 * 1000).toISOString();
    await api(owner, 'POST', '/campaigns', {
      title: 'Campaña de prueba de humo',
      category: 'medications',
      goalAmount: 500000,
      deadline,
    });
  });
  for (const route of [
    '/inicio',
    '/animales',
    '/adopciones',
    '/organizacion',
    '/organizacion/documentos',
    '/organizacion/formalizacion',
    '/organizacion/portal',
    '/organizacion/campanas',
    '/organizacion/apadrinamientos',
    '/organizacion/marketplace',
    '/organizacion/recursos',
    '/organizacion/voluntariado',
    '/organizacion/plan',
    '/donaciones-recibidas',
    '/recordatorios',
  ]) {
    await visit(owner, route);
  }
  await check(owner, 'pendientes (campana)', async (page) => {
    await page.goto(`${WEB}/inicio`);
    await page.getByRole('button', { name: /^Pendientes:/ }).click();
    await page.getByLabel('Recordatorios y acciones pendientes').waitFor({ timeout: 10_000 });
  });
  for (const route of [
    '/organizacion/dashboard-donaciones',
    '/organizacion/reporte-exogeno',
    '/organizacion/transparencia-nacional',
  ]) {
    await visit(owner, route);
  }

  // Apadrinar: un animal disponible del refugio (sin enviar ningún pago).
  const animals = await apiStep(owner, 'API: animales disponibles', () =>
    api(owner, 'GET', '/animals'),
  );
  const animal = Array.isArray(animals)
    ? animals.filter((a) => a.status === 'available').at(-1)
    : null;
  if (animal) {
    await check(person, 'apadrinar', async (page) => {
      await page.goto(`${WEB}/apadrinar?animalId=${encodeURIComponent(animal.id)}`);
      const sponsor = page.getByRole('button', { name: 'Apadrinar' });
      if (
        await sponsor
          .first()
          .isVisible()
          .catch(() => false)
      )
        await sponsor.first().click();
    });
  }

  // Contrato: la persona solicita, el dueño aprueba y genera el contrato.
  let contractId = null;
  if (animal) {
    const body = {
      animalId: animal.id,
      organizationId: animal.organizationId,
      animalSnapshot: { animalId: animal.id, name: animal.name, species: animal.species },
      applicant: { fullName: 'Prueba de humo', email: PERSON_EMAIL },
      message:
        'Prueba de humo automatizada: tengo espacio, tiempo y experiencia para cuidarlo bien.',
    };
    const request = await apiStep(person, 'API: solicitud de adopción', async () => {
      try {
        return await api(person, 'POST', '/adoptions', body);
      } catch (error) {
        // Solicitar exige perfil completo: lo completa con datos de prueba y reintenta.
        if (!error.data?.missing?.length) throw error;
        const filler = {
          phone: '3000000000',
          documentId: '1000000000',
          address: 'Calle de prueba 1',
        };
        const patch = Object.fromEntries(error.data.missing.map((field) => [field, filler[field]]));
        await api(person, 'PATCH', '/auth/me/profile', patch);
        return api(person, 'POST', '/adoptions', body);
      }
    });
    if (request?.id) {
      const contract = await apiStep(owner, 'API: aprobar y generar contrato', async () => {
        await api(owner, 'POST', `/adoptions/${request.id}/transitions`, {
          targetStatus: 'in_review',
        });
        await api(owner, 'POST', `/adoptions/${request.id}/transitions`, {
          targetStatus: 'approved',
        });
        return api(owner, 'POST', '/adoptions/contracts', { requestId: request.id });
      });
      contractId = contract?.id ?? null;
    }
  }
  if (contractId) {
    await check(owner, 'contrato de adopción', async (page) => {
      await page.goto(`${WEB}/adopciones/contratos/${contractId}`);
      await page
        .getByText(/contrato/i)
        .first()
        .waitFor({ timeout: 10_000 });
    });
  }
  await visit(person, '/mis-solicitudes');
  await owner.context.close();
  await person.context.close();

  // ── Administrador de plataforma ────────────────────────────────────────
  const admin = await openSession(browser, 'plataforma');
  await login(admin, ADMIN_EMAIL, ADMIN_PASSWORD);
  await passPlatformMfa(admin, ADMIN_EMAIL, ADMIN_PASSWORD);
  for (const route of [
    '/inicio',
    '/plataforma/organizaciones',
    '/plataforma/documentos',
    '/plataforma/organizaciones-duplicadas',
    '/plataforma/dashboard',
    '/plataforma/dashboard/financiero',
    '/plataforma/banner',
    '/plataforma/resenas',
  ]) {
    await visit(admin, route);
  }
  await admin.context.close();

  // ── Visitante otra vez: campañas y donar (ya hay una campaña activa) ──
  const visitorAgain = await openSession(browser, 'visitante');
  await check(visitorAgain, 'detalle de campaña', async (page) => {
    await page.goto(`${WEB}/campanas`);
    const first = page.locator('a[href^="/campanas/"]').first();
    await first.waitFor({ timeout: 10_000 });
    await first.click();
    await page.waitForURL(/\/campanas\/[^/]+$/);
  });
  await check(visitorAgain, 'donar desde el portal', async (page) => {
    await page.goto(`${WEB}/o/${PORTAL_SLUG}`);
    const cta = page
      .getByRole('link', { name: /^(Donar|Quiero donar)/ })
      .or(page.getByRole('button', { name: /^(Donar|Quiero donar)/ }));
    await cta.first().waitFor({ timeout: 10_000 });
    await cta.first().click();
  });
  await visitorAgain.context.close();
  await browser.close();

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} pasos sin errores.`);
  if (failed.length) {
    console.log('Fallaron:');
    for (const r of failed) console.log(`  [${r.role}] ${r.step}: ${r.problems.join(' | ')}`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
