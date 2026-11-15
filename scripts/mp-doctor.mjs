#!/usr/bin/env node
/**
 * `pnpm mp:doctor`: revisa tu configuración de Mercado Pago contra la API real
 * y dice, en español, qué cambiar. Nunca imprime secretos ni tokens: solo
 * números públicos (App ID, id de usuario), URLs y si cada variable existe.
 *
 *   pnpm mp:doctor                       lee el .env y consulta Mercado Pago (solo lectura)
 *   pnpm mp:doctor --crear-suscripcion   además crea UNA suscripción pendiente de prueba
 *                                        (solo con MERCADOPAGO_TEST=true) para ver el motivo
 *                                        exacto si Mercado Pago la rechaza
 *
 * Pega la salida completa en el chat: no lleva credenciales.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const crearSuscripcion = process.argv.includes('--crear-suscripcion');
let failures = 0;

const ok = (label, detail = '') => console.log(`  OK    ${label}${detail ? ` · ${detail}` : ''}`);
const info = (label) => console.log(`  ·     ${label}`);
const warn = (label, fix) => console.log(`  AVISO ${label}\n        → ${fix}`);
const bad = (label, fix) => {
  failures += 1;
  console.log(`  FALLA ${label}\n        → ${fix}`);
};

function readEnv() {
  const file = resolve(ROOT, '.env');
  if (!existsSync(file)) return null;
  const values = {};
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (match) values[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return values;
}

/** Texto de Mercado Pago apto para imprimir: sin saltos, recortado. */
const trim = (value) =>
  String(value ?? '')
    .replace(/[\r\n\t]+/g, ' ')
    .slice(0, 240);

async function mp(base, path, init = {}) {
  try {
    const response = await fetch(`${base}${path}`, {
      ...init,
      signal: AbortSignal.timeout(15_000),
    });
    const body = await response.json().catch(() => null);
    return { status: response.status, body };
  } catch (error) {
    return { status: 0, body: null, error: trim(error?.cause?.code ?? error?.message) };
  }
}

const env = readEnv();
console.log('\nMercado Pago · diagnóstico\n');
if (!env) {
  console.log('  FALLA no existe .env en la raíz del repo\n        → ejecuta `pnpm setup:env`');
  process.exit(1);
}

const base = (env.MERCADOPAGO_BASE_URL || 'https://api.mercadopago.com').replace(/\/+$/, '');
const sandbox = env.MERCADOPAGO_TEST === 'true';
console.log(`Modo: ${sandbox ? 'SANDBOX (usuarios de prueba)' : 'PRODUCCIÓN (cuentas reales)'}\n`);

// 1) Variables (solo si existen).
console.log('Variables');
for (const key of [
  'PAYMENT_DRIVER',
  'MERCADOPAGO_CLIENT_ID',
  'MERCADOPAGO_CLIENT_SECRET',
  'MERCADOPAGO_ORDERS_WEBHOOK_SECRET',
  'MERCADOPAGO_WEBHOOK_SECRET',
  'MERCADOPAGO_PLATFORM_ACCESS_TOKEN',
  'API_PUBLIC_BASE_URL',
  'WEB_BASE_URL',
]) {
  const present = Boolean(env[key]);
  const secret = /SECRET|TOKEN/.test(key);
  if (present) ok(key, secret ? 'definida' : env[key]);
  else bad(`${key} no está definida`, 'agrégala al .env (ver docs/pagos/mercadopago-oauth.md §6)');
}
if (env.PAYMENT_DRIVER && env.PAYMENT_DRIVER !== 'mercadopago') {
  bad(
    `PAYMENT_DRIVER=${env.PAYMENT_DRIVER}`,
    'ponla en `mercadopago` para cobrar con Mercado Pago',
  );
}

// 2) URL de redirección que envía la API.
console.log('\nRedirección OAuth (debe estar IDÉNTICA en la app de Checkout Pro del panel)');
const apiBase = (
  env.API_PUBLIC_BASE_URL ||
  env.STORAGE_PUBLIC_BASE_URL ||
  'http://localhost:3000'
).replace(/\/+$/, '');
const redirect = env.MERCADOPAGO_OAUTH_REDIRECT_URI || `${apiBase}/org/mercadopago/callback`;
info(`redirect_uri = ${redirect}`);
if (!env.MERCADOPAGO_OAUTH_REDIRECT_URI) {
  warn(
    'MERCADOPAGO_OAUTH_REDIRECT_URI no está definida: se usa la URL derivada de la API',
    'si abres la app por un túnel, defínela con `https://<túnel>/api/org/mercadopago/callback`',
  );
}
if (!redirect.startsWith('https://')) warn('la redirección no es https', 'usa tu túnel https');
if (/localhost|127\.0\.0\.1/.test(redirect))
  warn('la redirección apunta a localhost', 'Mercado Pago no puede volver ahí');
if (redirect.endsWith('/'))
  warn('la redirección termina en "/"', 'en el panel debe terminar igual');

// 3) Credenciales de la app de OAuth (Checkout Pro).
console.log('\nApp de Checkout Pro (OAuth)');
if (env.MERCADOPAGO_CLIENT_ID && env.MERCADOPAGO_CLIENT_SECRET) {
  const res = await mp(base, '/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({
      client_id: env.MERCADOPAGO_CLIENT_ID,
      client_secret: env.MERCADOPAGO_CLIENT_SECRET,
      grant_type: 'client_credentials',
    }).toString(),
  });
  if (res.status === 200)
    ok('client_id y client_secret son válidos', `App ID ${env.MERCADOPAGO_CLIENT_ID}`);
  else if (res.status === 0) bad(`no se pudo conectar a ${base}`, res.error ?? 'revisa tu red');
  else
    bad(
      `Mercado Pago rechazó las credenciales (${res.status}: ${trim(res.body?.error ?? res.body?.message)})`,
      'copia de nuevo App ID y Client secret de la app de Checkout Pro (credenciales de producción o de prueba según el modo)',
    );
}

// 4) Cuenta de AdoptaFácil (planes).
console.log('\nCuenta de AdoptaFácil (suscripciones de planes)');
const token = env.MERCADOPAGO_PLATFORM_ACCESS_TOKEN;
if (token) {
  const appId = /^APP_USR-(\d+)-/.exec(token)?.[1];
  if (appId) {
    info(`el token pertenece a la app ${appId}`);
    if (appId === env.MERCADOPAGO_CLIENT_ID) {
      warn(
        'es la MISMA app que MERCADOPAGO_CLIENT_ID',
        'el panel solo deja una solución por app: crea otra de Suscripciones',
      );
    }
  }
  const me = await mp(base, '/users/me', { headers: { Authorization: `Bearer ${token}` } });
  if (me.status === 200) {
    const tags = Array.isArray(me.body?.tags) ? me.body.tags : [];
    const test = tags.includes('test_user') || /^TEST/i.test(String(me.body?.nickname ?? ''));
    ok(
      'el token de planes es válido',
      `usuario ${me.body?.id} · país ${me.body?.site_id} · ${test ? 'usuario de PRUEBA' : 'cuenta real'}`,
    );
    if (me.body?.site_id && me.body.site_id !== 'MCO')
      warn(
        `la cuenta es de ${me.body.site_id}, no de Colombia (MCO)`,
        'usa una cuenta de Colombia',
      );
    if (sandbox && !test)
      bad(
        'MERCADOPAGO_TEST=true pero el token de planes es de una cuenta real',
        'usa el token del VENDEDOR de prueba',
      );
    if (!sandbox && test)
      bad(
        'modo producción pero el token de planes es de un usuario de prueba',
        'usa el token de producción de AdoptaFácil',
      );
  } else if (me.status === 0) {
    bad(`no se pudo conectar a ${base}`, me.error ?? 'revisa tu red');
  } else {
    bad(
      `Mercado Pago rechazó el token de planes (${me.status})`,
      'copia de nuevo el Access token de la app de Suscripciones',
    );
  }
} else {
  info('sin MERCADOPAGO_PLATFORM_ACCESS_TOKEN no se puede cobrar el plan en línea');
}

// 5) URLs de webhooks que hay que registrar.
console.log('\nWebhooks (se registran en el panel, uno por aplicación)');
info(`Checkout Pro (evento Order):  ${apiBase}/donations/webhook/mercadopago`);
info(`Suscripciones (planes):       ${apiBase}/billing/webhooks/mercadopago`);
if (
  env.API_PUBLIC_BASE_URL &&
  !/\/api\/?$/.test(env.API_PUBLIC_BASE_URL) &&
  /trycloudflare|ngrok/.test(env.API_PUBLIC_BASE_URL)
) {
  warn(
    'usas un túnel sin /api en API_PUBLIC_BASE_URL',
    'si el túnel apunta a la web (5173), la URL pública de la API es `https://<túnel>/api`',
  );
}
if (!(env.WEB_BASE_URL || '').startsWith('https://')) {
  warn(
    'WEB_BASE_URL no es https',
    'Mercado Pago pide una back_url https para la suscripción: usa tu túnel',
  );
}

// 6) Suscripción de prueba (opcional).
if (crearSuscripcion) {
  console.log('\nSuscripción de prueba');
  if (!sandbox) {
    bad(
      '--crear-suscripcion solo corre con MERCADOPAGO_TEST=true',
      'no se crea nada en producción',
    );
  } else if (!token) {
    bad('falta MERCADOPAGO_PLATFORM_ACCESS_TOKEN', 'defínelo para probar la suscripción');
  } else {
    const payer = env.MERCADOPAGO_TEST_PAYER_EMAIL || '';
    if (!payer)
      warn(
        'MERCADOPAGO_TEST_PAYER_EMAIL no está definida',
        'pon el correo del COMPRADOR de prueba; en sandbox el pagador debe ser ese',
      );
    const res = await mp(base, '/preapproval', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-Idempotency-Key': `mp-doctor-${Date.now()}`,
      },
      body: JSON.stringify({
        reason: 'AdoptaFácil · prueba mp:doctor',
        external_reference: `mp-doctor:${Date.now()}`,
        // Sin correo configurado se usa uno inventado y único: un correo de
        // una cuenta real de otro país (p. ej. test_user@testuser.com) hace
        // que Mercado Pago responda "Payer is associated with a different site".
        payer_email: payer || `mp-doctor-${Date.now()}@example.com`,
        back_url: `${(env.WEB_BASE_URL || '').replace(/\/+$/, '')}/organizacion/plan?pago=mercadopago`,
        status: 'pending',
        auto_recurring: {
          frequency: 1,
          frequency_type: 'months',
          transaction_amount: 10000,
          currency_id: 'COP',
        },
      }),
    });
    if (res.status === 200 || res.status === 201) {
      const link = String(res.body?.sandbox_init_point ?? res.body?.init_point ?? '');
      ok(
        'Mercado Pago aceptó la suscripción de prueba',
        `id ${res.body?.id} · enlace en ${link.split('/')[2] ?? '?'}`,
      );
    } else {
      bad(
        `Mercado Pago rechazó la suscripción (${res.status}): ${trim(res.body?.message ?? res.body?.error)} ${trim(res.body?.cause?.[0]?.description)}`,
        'ese es el motivo exacto: corrígelo y vuelve a correr el diagnóstico',
      );
    }
  }
}

console.log(
  failures
    ? `\n${failures} problema(s) por corregir.\n`
    : '\nSin fallas. Si el OAuth aún falla, la causa está en el panel (URL de redirección o tipo de app).\n',
);
process.exit(failures ? 1 : 0);
