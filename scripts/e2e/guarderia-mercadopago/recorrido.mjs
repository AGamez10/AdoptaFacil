// Recorrido de punta a punta, en navegador, del cobro de guardería por Mercado
// Pago SIMULADO (ver README.md de esta carpeta). Sale con código 1 si algún
// paso no se cumple.
//
//   1. Sin cuenta de Mercado Pago conectada, Custodia no deja encender el pago.
//   2. La organización conecta SU cuenta (OAuth simulado) y enciende el pago en
//      Custodia y guardería, aceptando las condiciones.
//   3. Registra el cobro desde la ficha del animal, pestaña Custodia.
//   4. Genera el enlace de pago y lo comparte (copiar y WhatsApp).
//   5. Quien paga abre el enlace SIN sesión, en celular, y paga en el
//      checkout simulado; Mercado Pago envía el aviso firmado.
//   6. El cobro queda pagado solo, con constancia, y la organización recibe un aviso.
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(join(process.cwd(), 'package.json'));
const { chromium } = require('playwright');
const contracts = require('./packages/contracts/dist/cjs/index.js');

const API = process.env.API_URL ?? 'http://localhost:3000';
const WEB = process.env.WEB_URL ?? 'http://localhost:5173';
const MOCK = process.env.MOCK_URL ?? 'http://127.0.0.1:4010';
// Conexión de SUPERUSUARIO (como las pruebas de integración) solo para aprobar
// y formalizar la organización de prueba, que en la vida real hace la plataforma.
const PG_URL = process.env.PG_URL;
const OUT = process.env.OUT_DIR ?? join(tmpdir(), 'guarderia-mercadopago');

if (!PG_URL) {
  console.error(
    'Falta PG_URL (p. ej. postgresql://adoptafacil:adoptafacil@localhost:5433/adoptafacil)',
  );
  process.exit(2);
}

const psql = (sql) => execFileSync('psql', [PG_URL, '-tAc', sql]).toString().trim();
const log = [];
function check(condition, message) {
  log.push(`${condition ? 'OK   ' : 'FALLA'} ${message}`);
  console.log(log.at(-1));
  if (!condition) throw new Error(`No se cumplió: ${message}`);
}

async function api(method, path, token, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${JSON.stringify(json)}`);
  return json;
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const stamp = Date.now();
  const email = `guarderia-e2e-${stamp}@test.local`;
  const password = 'password-1234';
  const orgName = `Fundación Guardería E2E ${stamp}`;

  // Preparación: organización aprobada y formalizada, un animal y un responsable.
  const reg = await api('POST', '/auth/register/organization', null, {
    legalAcceptances: contracts.currentLegalAcceptanceItems(
      contracts.requiredLegalDocuments('organization'),
    ),
    organizationName: orgName,
    displayName: 'Dueña E2E',
    email,
    password,
  });
  const orgId = reg.user.organizationId;
  const token = reg.tokens.accessToken;
  if (!/^[0-9a-f-]{36}$/.test(orgId)) throw new Error('id de organización inesperado');
  psql(`update organizations set status='approved', status_changed_at=now() where id='${orgId}'`);
  psql(
    `insert into organization_profiles (id, organization_id, formalization_state, rte_vigente, updated_at)
     values (gen_random_uuid(), '${orgId}', 'formalizada', false, now())
     on conflict (organization_id) do update set formalization_state='formalizada', rte_vigente=false`,
  );
  await api('POST', '/animals', token, {
    name: 'Canela',
    species: 'dog',
    sex: 'female',
    size: 'medium',
    approximateAgeMonths: 30,
  });
  await api('POST', '/custody/responsibles', token, {
    fullName: 'Laura Responsable',
    documentType: 'CC',
    documentNumber: '1000200399',
    phone: '3000000000',
  });

  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();

    await page.goto(`${WEB}/login`);
    await page
      .getByRole('button', { name: 'Rechazar todo' })
      .first()
      .click()
      .catch(() => {});
    await page.getByLabel('Correo electrónico').fill(email);
    await page.getByLabel('Contraseña').fill(password);
    await page.getByRole('button', { name: 'Iniciar sesión' }).click();
    await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 20000 });

    // 1. Sin cuenta conectada no se puede encender.
    await page.goto(`${WEB}/organizacion/custodia`);
    await page.getByText('Pago en línea por Mercado Pago').waitFor({ timeout: 20000 });
    await page.screenshot({ path: join(OUT, '01-custodia-sin-cuenta.png'), fullPage: true });
    check(
      await page.getByRole('button', { name: 'Encender el pago en línea' }).isDisabled(),
      'sin cuenta de Mercado Pago, "Encender el pago en línea" está deshabilitado',
    );

    // 2. Conectar la cuenta de la organización y encender.
    await page.goto(`${WEB}/organizacion?tab=pagos`);
    await page
      .getByRole('button', { name: /Conectar Mercado Pago/ })
      .first()
      .click();
    let connected = '0';
    for (let i = 0; i < 40 && connected === '0'; i++) {
      await page.waitForTimeout(500);
      connected = psql(
        `select count(*) from organization_mercadopago_connections where organization_id='${orgId}'`,
      );
    }
    check(connected === '1', 'la organización conectó su cuenta de Mercado Pago (OAuth)');

    await page.goto(`${WEB}/organizacion/custodia`);
    await page.getByRole('button', { name: 'Encender el pago en línea' }).click();
    await page.getByText('Leí estas condiciones y las acepto').click();
    await page.getByRole('button', { name: 'Aceptar y encender' }).click();
    await page.getByText('Encendido', { exact: true }).waitFor();
    await page.screenshot({ path: join(OUT, '02-encendido.png'), fullPage: true });
    check(true, 'pago en línea encendido aceptando las condiciones');

    // 3. Registrar el cobro desde la ficha del animal, pestaña Custodia.
    await page.goto(`${WEB}/animales`);
    await page
      .getByRole('button', { name: /Canela/ })
      .first()
      .click();
    await page.getByRole('tab', { name: 'Custodia' }).click();
    await page.getByRole('button', { name: 'Registrar cobro' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.waitFor();
    const selects = dialog.locator('select');
    await selects.nth(0).selectOption({ index: 1 });
    await selects.nth(1).selectOption({ label: 'Servicio de guardería' });
    await dialog.getByLabel('Valor (COP)').fill('350000');
    await dialog.getByLabel('Descripción').fill('Mensualidad de guardería');
    await dialog.getByRole('button', { name: 'Registrar cobro' }).click();
    await dialog.waitFor({ state: 'hidden', timeout: 15000 });
    check(
      psql(
        `select count(*) from custody_charges where organization_id='${orgId}' and status='pending'`,
      ) === '1',
      'cobro registrado desde la pestaña Custodia del animal',
    );

    // 4. Generar y compartir el enlace.
    await page.getByRole('button', { name: 'Enlace de pago' }).first().click();
    const linkBox = page.getByRole('textbox', { name: 'Enlace de pago' });
    await linkBox.waitFor({ timeout: 15000 });
    const link = await linkBox.inputValue();
    await page.screenshot({ path: join(OUT, '03-enlace.png'), fullPage: true });
    check(link.startsWith(`${WEB}/pagar/guarderia/`), `enlace de pago generado: ${link}`);
    const whatsapp = await page.locator('a[href^="https://wa.me/"]').first().getAttribute('href');
    check(
      Boolean(whatsapp) && decodeURIComponent(whatsapp).includes(link),
      'el botón de WhatsApp lleva el enlace en el mensaje',
    );

    // 5. Quien paga, sin sesión y en celular, paga en el checkout simulado.
    const payer = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    let webhookStatus = 0;
    await payer.route('https://www.mercadopago.com.co/**', async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname.startsWith('/__pay/')) {
        const res = await fetch(`${MOCK}${url.pathname}`, { method: 'POST' });
        const body = await res.text();
        webhookStatus = JSON.parse(body).webhookStatus;
        return route.fulfill({ contentType: 'application/json', body });
      }
      const orderId = url.searchParams.get('order_id');
      return route.fulfill({
        contentType: 'text/html',
        body: `<!doctype html><meta name=viewport content="width=device-width"><title>Mercado Pago (simulado)</title>
<body style="font-family:sans-serif;padding:24px"><h1>Mercado Pago (simulado)</h1><p>Orden ${orderId}</p>
<button id=pay>Pagar</button><script>document.getElementById('pay').onclick=async()=>{
const r=await fetch('/__pay/${orderId}',{method:'POST'});const j=await r.json();location.href=j.successUrl}</script>`,
      });
    });
    const pp = await payer.newPage();
    await pp.goto(link);
    await pp
      .getByRole('button', { name: 'Rechazar todo' })
      .first()
      .click({ timeout: 3000 })
      .catch(() => {});
    await pp.getByRole('button', { name: /Pagar con Mercado Pago/ }).waitFor({ timeout: 15000 });
    await pp.screenshot({ path: join(OUT, '04-pagina-de-pago-celular.png'), fullPage: true });
    const publicText = await pp.locator('body').innerText();
    check(publicText.includes('350.000'), 'la página pública muestra el cobro');
    check(
      !publicText.includes('1000200399'),
      'la página pública no muestra el documento del responsable',
    );
    await pp.getByRole('button', { name: /Pagar con Mercado Pago/ }).click();
    await pp.waitForURL(/mercadopago\.com\.co/, { timeout: 20000 });
    await pp.locator('#pay').click();
    await pp.waitForURL(/\/pagar\/guarderia\/resultado/, { timeout: 20000 });
    check(webhookStatus === 200, 'la API aceptó el aviso firmado de Mercado Pago (200)');
    await pp.getByText('Pago recibido').waitFor({ timeout: 20000 });
    await pp.screenshot({ path: join(OUT, '05-resultado-celular.png'), fullPage: true });
    check(true, 'quien paga ve "Pago recibido" con su constancia');

    // 6. Registrado solo, con constancia y aviso a la organización.
    check(
      psql(`select status from custody_charges where organization_id='${orgId}'`) === 'paid',
      'el cobro quedó pagado sin que nadie lo registrara a mano',
    );
    await page.goto(`${WEB}/organizacion/custodia`);
    await page.locator('select').first().selectOption({ index: 2 });
    await page.getByText('Pagado', { exact: true }).waitFor({ timeout: 15000 });
    await page.screenshot({ path: join(OUT, '06-pago-registrado.png'), fullPage: true });
    check(
      await page
        .getByRole('button', { name: /Ver constancia/ })
        .or(page.getByText('Ver constancia'))
        .first()
        .isVisible(),
      'la organización ve el pago con su constancia en Vencimientos y pagos',
    );
    const notices = psql(
      `select count(*) from user_notifications where organization_id='${orgId}'`,
    );
    check(Number(notices) >= 1, `la organización recibió el aviso del pago (${notices})`);
  } finally {
    await browser.close();
  }
}

main()
  .then(() => {
    console.log(`\nRecorrido completo. Capturas en ${OUT}`);
  })
  .catch((error) => {
    console.error(`\n${error.message}`);
    process.exit(1);
  });
