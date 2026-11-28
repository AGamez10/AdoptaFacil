/* global window, document, location */
// Recorrido de punta a punta, en navegador real, de TODOS los cobros con
// Mercado Pago SIMULADO y la CSP de producción APLICADA (ver README.md):
//
//   A. Donación a una fundación: conecta SU cuenta (OAuth), un invitado dona
//      desde el celular y paga con PSE; luego tarjeta, Efecty y Nequi.
//   B. Café por el QR de la bolsa: escanea, elige la campaña, paga y queda el
//      aporte del 20 % del margen bruto para esa campaña.
//   C. Plan Crece: la organización paga con otro correo de Mercado Pago; el
//      primer cobro aprobado activa el plan.
//   D. Ninguna página de la web viola la Content-Security-Policy.
//
// Sale con código 1 si algún control no se cumple.
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(join(process.cwd(), 'package.json'));
const { chromium } = require('playwright');
const contracts = require('./packages/contracts/dist/cjs/index.js');

const API = process.env.API_URL ?? 'http://127.0.0.1:3000';
const WEB = process.env.WEB_URL ?? 'http://127.0.0.1:5180';
const MOCK = process.env.MOCK_URL ?? 'http://127.0.0.1:4010';
const PG_URL = process.env.PG_URL;
const OUT = process.env.OUT_DIR ?? join(tmpdir(), 'cobros-mercadopago');
if (!PG_URL) {
  console.error('Falta PG_URL (conexión de superusuario, solo para preparar datos de prueba)');
  process.exit(2);
}

const psql = (sql) => execFileSync('psql', [PG_URL, '-tAc', sql]).toString().trim();
const results = [];
function check(condition, message) {
  results.push(`${condition ? 'OK   ' : 'FALLA'} ${message}`);
  console.log(results.at(-1));
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
async function registerOrg(name, email, password) {
  const reg = await api('POST', '/auth/register/organization', null, {
    legalAcceptances: contracts.currentLegalAcceptanceItems(
      contracts.requiredLegalDocuments('organization'),
    ),
    organizationName: name,
    displayName: 'Dueña E2E',
    email,
    password,
  });
  const orgId = reg.user.organizationId;
  if (!/^[0-9a-f-]{36}$/.test(orgId)) throw new Error('id de organización inesperado');
  psql(`update organizations set status='approved', status_changed_at=now() where id='${orgId}'`);
  psql(
    `insert into organization_profiles (id, organization_id, formalization_state, rte_vigente, updated_at)
     values (gen_random_uuid(), '${orgId}', 'formalizada', false, now())
     on conflict (organization_id) do update set formalization_state='formalizada', rte_vigente=false`,
  );
  return { orgId, token: reg.tokens.accessToken };
}

// --- CSP: cada violación en cualquier página cuenta como falla ---
const violations = [];
async function watchCsp(ctx, label) {
  await ctx.exposeBinding('__afCsp', (_src, v) => violations.push({ label, ...v }));
  await ctx.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) => {
      window.__afCsp({
        page: location.pathname,
        directive: e.effectiveDirective,
        blocked: e.blockedURI,
        sample: e.sample,
      });
    });
  });
  ctx.on('console', (msg) => {
    if (/Content Security Policy/i.test(msg.text())) {
      violations.push({ label, page: msg.location()?.url, console: msg.text().slice(0, 300) });
    }
  });
}

/** El checkout de Mercado Pago se reemplaza por una página simulada. */
async function fakeCheckout(ctx) {
  await ctx.route('https://www.mercadopago.com.co/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.startsWith('/__pay/')) {
      const res = await fetch(`${MOCK}${url.pathname}${url.search}`, { method: 'POST' });
      return route.fulfill({ contentType: 'application/json', body: await res.text() });
    }
    const kind = url.searchParams.has('order_id')
      ? ['order', url.searchParams.get('order_id')]
      : url.searchParams.has('pref_id')
        ? ['preference', url.searchParams.get('pref_id')]
        : ['preapproval', url.searchParams.get('preapproval_id')];
    return route.fulfill({
      contentType: 'text/html',
      body: `<!doctype html><meta name=viewport content="width=device-width"><title>Mercado Pago (simulado)</title>
<body style="font-family:sans-serif;padding:24px"><h1>Mercado Pago (simulado)</h1><p>${kind[0]} ${kind[1]}</p>
<button id=pay>Pagar</button><script>document.getElementById('pay').onclick=async()=>{
const r=await fetch('/__pay/${kind[0]}/${kind[1]}'+location.search,{method:'POST'});const j=await r.json();
window.__lastPay=j;location.href=j.successUrl}</script>`,
    });
  });
}

async function dismissCookies(page) {
  await page
    .getByRole('button', { name: 'Rechazar todo' })
    .first()
    .click({ timeout: 3000 })
    .catch(() => {});
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const stamp = Date.now();
  const password = 'password-1234';
  const email = `cobros-e2e-${stamp}@test.local`;
  const orgName = `Fundación Cobros E2E ${stamp}`;
  const { orgId, token } = await registerOrg(orgName, email, password);
  const campaign = await api('POST', '/campaigns', token, {
    title: `Cirugía de Luna ${stamp}`,
    category: 'surgeries',
    goalAmount: 2_000_000,
    deadline: '2027-12-31T00:00:00.000Z',
  });

  // Café: equipo de AdoptaFácil, presentación con QR y lote a la venta.
  // (En la vida real lo crea la plataforma con doble aprobación; aquí se
  // siembra directo para probar la compra.)
  const team = await registerOrg(
    `Equipo Café E2E ${stamp}`,
    `cafe-e2e-${stamp}@test.local`,
    password,
  );
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  const code = Array.from(
    { length: 8 },
    (_, i) => alphabet[(stamp + i * 7) % alphabet.length],
  ).join('');
  const productId = psql('select gen_random_uuid()');
  const lotId = psql('select gen_random_uuid()');
  psql(
    `insert into coffee_products (id, organization_id, code, name, presentation_grams, qr_domain, updated_at)
     values ('${productId}', '${team.orgId}', '${code}', 'Café San Pedro E2E', 340, 'adoptafacil.org', now())`,
  );
  psql(
    `insert into coffee_lots (id, organization_id, product_id, lot_code, status, sale_price_cop, unit_cost_cop,
       shipping_fee_cop, stock_units, contribution_bps, default_campaign_id, published_at, updated_at)
     values ('${lotId}', '${team.orgId}', '${productId}', 'L-E2E-${stamp}', 'on_sale', 38000, 22000, 8000, 50,
       2000, '${campaign.id}', now(), now())`,
  );

  const browser = await chromium.launch();
  try {
    // ---------------- A. Donaciones ----------------
    const org = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await watchCsp(org, 'organización');
    await fakeCheckout(org);
    const page = await org.newPage();
    await page.goto(`${WEB}/login`);
    await dismissCookies(page);
    await page.getByLabel('Correo electrónico').fill(email);
    await page.getByLabel('Contraseña').fill(password);
    await page.getByRole('button', { name: 'Iniciar sesión' }).click();
    await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 20000 });

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
    check(connected === '1', 'A1. la fundación conectó SU cuenta de Mercado Pago (OAuth)');
    await page.screenshot({ path: join(OUT, 'a1-cuenta-conectada.png'), fullPage: true });

    const donor = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    await watchCsp(donor, 'donante');
    await fakeCheckout(donor);
    const dp = await donor.newPage();
    const donateUrl = `${WEB}/donaciones?organizationId=${orgId}&organizationName=${encodeURIComponent(orgName)}`;
    await dp.goto(donateUrl);
    await dismissCookies(dp);
    await dp.getByTestId('donation-preset-50000').click();
    await dp.getByTestId('donation-guest-name').fill('Ana Donante');
    await dp.getByTestId('donation-guest-email').fill(`donante-${stamp}@test.local`);
    for (const box of await dp.locator('input[type=checkbox]').all()) {
      if (!(await box.isChecked())) await box.check();
    }
    await dp.screenshot({ path: join(OUT, 'a2-donar-celular.png'), fullPage: true });
    await dp.getByRole('button', { name: `Donar a ${orgName}` }).click();
    await dp.waitForURL(/mercadopago\.com\.co/, { timeout: 20000 });
    const orderParam = new URL(dp.url()).searchParams.get('order_id');
    await dp.goto(`${dp.url()}&method=pse`);
    await dp.locator('#pay').click();
    await dp.waitForURL(/\/donaciones\/resultado/, { timeout: 20000 });
    await dp.waitForTimeout(1500);
    await dp.screenshot({ path: join(OUT, 'a3-donacion-resultado.png'), fullPage: true });
    const donation = psql(
      `select status || ' ' || amount_charged from donations where organization_id='${orgId}' order by created_at desc limit 1`,
    );
    check(
      donation.startsWith('approved'),
      `A2. donación por PSE aprobada sola por el aviso firmado (orden ${orderParam}: ${donation})`,
    );

    // Los demás medios que habilita la cuenta de la fundación.
    for (const method of ['visa', 'efecty', 'nequi']) {
      const created = await api('POST', '/donations', null, {
        legalAcceptances: contracts.currentLegalAcceptanceItems(
          contracts.requiredLegalDocuments('guest'),
        ),
        organizationId: orgId,
        intendedAmount: 30000,
        idempotencyKey: `e2e-${method}-${stamp}`,
        payer: { email: `donante-${method}-${stamp}@test.local`, fullName: 'Donante E2E' },
      });
      const link = created.paymentLinkUrl ?? created.checkoutUrl ?? created.payment?.paymentLinkUrl;
      const id = new URL(link).searchParams.get('order_id');
      const paid = await (
        await fetch(`${MOCK}/__pay/order/${id}?method=${method}`, { method: 'POST' })
      ).json();
      check(paid.webhookStatus === 200, `A3. aviso firmado del pago con ${method} aceptado`);
    }
    const approved = psql(
      `select count(*) from donations where organization_id='${orgId}' and status='approved'`,
    );
    check(approved === '4', `A4. PSE, tarjeta, Efecty y Nequi quedaron aprobadas (${approved}/4)`);

    // ---------------- B. Café por el QR ----------------
    const buyer = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    await watchCsp(buyer, 'comprador café');
    await fakeCheckout(buyer);
    const cp = await buyer.newPage();
    await cp.goto(`${WEB}/c/${code}?o=qr`);
    await dismissCookies(cp);
    await cp.getByText('Cada bolsa aporta').first().waitFor({ timeout: 20000 });
    const offer = await cp.locator('body').innerText();
    check(
      offer.includes('3.200'),
      'B1. al escanear el QR se ve el aporte por bolsa (20 % de 16.000 = 3.200)',
    );
    await cp.getByLabel('Una bolsa más').click();
    const fields = {
      fullName: 'Carlos Comprador',
      email: `comprador-${stamp}@test.local`,
      phone: '3001234567',
      address: 'Calle 10 # 20-30',
      city: 'Medellín',
      department: 'Antioquia',
    };
    for (const [key, value] of Object.entries(fields))
      await cp.locator(`#buyer-${key}`).fill(value);
    await cp.locator('form input[type=checkbox]').last().check();
    await cp.screenshot({ path: join(OUT, 'b1-cafe-qr-celular.png'), fullPage: true });
    await cp.getByRole('button', { name: 'Pagar con Mercado Pago' }).click();
    await cp.waitForURL(/mercadopago\.com\.co/, { timeout: 20000 });
    await cp.locator('#pay').click();
    await cp.waitForURL(/\/cafe\/pedido\//, { timeout: 20000 });
    await cp.waitForTimeout(1500);
    await cp.screenshot({ path: join(OUT, 'b2-cafe-pedido.png'), fullPage: true });
    const order = psql(
      `select status || ' ' || quantity || ' ' || total_cop || ' ' || contribution_total_cop || ' ' || campaign_id
       from coffee_orders where lot_id='${lotId}' order by created_at desc limit 1`,
    ).split(' ');
    check(order[0] === 'paid', `B2. el pedido de café quedó pagado solo (${order[0]})`);
    check(
      order[1] === '2' && order[2] === String(2 * 38000 + 8000),
      `B3. cobró 2 bolsas + envío (${order[2]})`,
    );
    check(
      order[3] === '6400' && order[4] === campaign.id,
      `B4. el 20 % del margen (6.400) quedó asignado a la campaña elegida`,
    );

    // ---------------- C. Plan Crece ----------------
    await page.goto(`${WEB}/organizacion/plan`);
    await page.getByTestId('plan-pay-mercadopago-crece').waitFor({ timeout: 20000 });
    await page.getByTestId('plan-payer-email-toggle-crece').click();
    const payerEmail = `tesoreria-${stamp}@test.local`;
    await page.getByTestId('plan-payer-email-crece').fill(payerEmail);
    await page.screenshot({ path: join(OUT, 'c1-plan.png'), fullPage: true });
    await page.getByTestId('plan-pay-mercadopago-crece').click();
    await page.waitForURL(/mercadopago\.com\.co/, { timeout: 20000 });
    await page.locator('#pay').click();
    await page.waitForURL(/\/organizacion\/plan/, { timeout: 20000 });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: join(OUT, 'c2-plan-activo.png'), fullPage: true });
    const sub = psql(
      `select plan || ' ' || status || ' ' || coalesce(provider,'') from organization_subscriptions where organization_id='${orgId}'`,
    );
    check(
      sub.startsWith('crece active mercadopago'),
      `C1. el primer cobro aprobado activó Crece (${sub})`,
    );
    const mockLog = execFileSync('bash', [
      '-c',
      `grep -c "payer_email ${payerEmail}" "${process.env.MOCK_LOG ?? '/dev/null'}" || true`,
    ])
      .toString()
      .trim();
    if (process.env.MOCK_LOG) {
      check(
        mockLog !== '0',
        'C2. la suscripción se abrió al correo de Mercado Pago que se escribió',
      );
    }

    // ---------------- D. CSP en las páginas principales ----------------
    const anon = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await watchCsp(anon, 'visitante');
    const ap = await anon.newPage();
    for (const path of [
      '/',
      '/adoptar',
      '/campanas',
      `/campanas/${campaign.id}`,
      '/cafe',
      '/donar',
      '/login',
      '/registro',
      '/comunidad',
      '/legal/politica-de-datos',
    ]) {
      await ap.goto(`${WEB}${path}`, { waitUntil: 'networkidle' }).catch(() => {});
      await dismissCookies(ap);
    }
    for (const path of ['/dashboard', '/animales', '/organizacion', '/organizacion/campanas']) {
      await page.goto(`${WEB}${path}`, { waitUntil: 'networkidle' }).catch(() => {});
    }
    await page.waitForTimeout(1000);
    if (violations.length) console.log(JSON.stringify(violations, null, 2));
    check(
      violations.length === 0,
      `D1. ninguna página violó la CSP aplicada (${violations.length})`,
    );
  } finally {
    await browser.close();
  }
}

main()
  .then(() => console.log(`\nRecorrido completo (${results.length} controles). Capturas en ${OUT}`))
  .catch((error) => {
    console.error(`\n${error.message}`);
    process.exit(1);
  });
