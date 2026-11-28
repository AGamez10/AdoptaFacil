// Mercado Pago SIMULADO para el recorrido de los cobros (donaciones, café y
// planes). Cero red real, nunca credenciales reales; solo escucha en 127.0.0.1.
//
// Cuenta de cada organización (OAuth, donaciones por Orders):
//   GET  /authorization, POST /oauth/token, POST /v1/orders, GET /v1/orders/:id
// Cuenta de AdoptaFácil (PLATFORM_TOKEN: café y planes):
//   POST /checkout/preferences, GET /v1/payments/:id,
//   POST /preapproval, GET|PUT /preapproval/:id, GET /authorized_payments/:id
// Conciliación: GET /v1/payments/search (vacía)
// "Pagar" (lo llama la página simulada del checkout):
//   POST /__pay/order/:id        -> aviso FIRMADO de Orders a /donations/webhook/mercadopago
//   POST /__pay/preference/:id   -> pago aprobado + aviso FIRMADO a la notification_url del café
//   POST /__pay/preapproval/:id  -> autoriza, cobra el primer mes y avisa a /billing/webhooks/mercadopago
import { createHmac, randomUUID } from 'node:crypto';
import http from 'node:http';

const PORT = Number(process.env.MOCK_PORT ?? 4010);
const API = process.env.API_URL ?? 'http://127.0.0.1:3000';
const ORDERS_SECRET = process.env.ORDERS_SECRET ?? 'e2e-orders-secret';
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET ?? 'e2e-webhook-secret';
const PLATFORM_TOKEN = process.env.PLATFORM_TOKEN ?? 'APP_USR-e2e-platform';
const CHECKOUT = 'https://www.mercadopago.com.co';

const accounts = new Map(); // token de organización -> user id
let nextUser = 812345000 + Math.floor(Math.random() * 999);
let seq = 1000 + Math.floor(Math.random() * 1000);
const orders = new Map();
const preferences = new Map();
const payments = new Map();
const preapprovals = new Map();
const charges = new Map();
const log = (...a) => console.log('[mp-mock]', ...a);

const send = (res, status, body) => {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
};
const readBody = (req) =>
  new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => resolve(data));
  });

/** Aviso firmado como Mercado Pago (x-signature v1 sobre id;request-id;ts). */
async function signedNotify(url, secret, type, id, extra = {}) {
  const ts = String(Math.floor(Date.now() / 1000));
  const requestId = randomUUID();
  const manifest = `id:${String(id).toLowerCase()};request-id:${requestId};ts:${ts};`;
  const v1 = createHmac('sha256', secret).update(manifest).digest('hex');
  const target = new URL(url);
  target.searchParams.set('data.id', String(id));
  target.searchParams.set('type', type);
  const res = await fetch(target, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-signature': `ts=${ts},v1=${v1}`,
      'x-request-id': requestId,
    },
    body: JSON.stringify({ type, data: { id: String(id) }, ...extra }),
  });
  const body = await res.text();
  log('aviso', type, id, '->', res.status, body);
  return { status: res.status, body };
}

const platformOnly = (auth) => auth === `Bearer ${PLATFORM_TOKEN}`;

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
    const auth = req.headers.authorization ?? '';
    const path = url.pathname;
    log(req.method, path);

    // --- OAuth de la organización ---
    if (path === '/authorization') {
      const redirect = new URL(url.searchParams.get('redirect_uri'));
      redirect.searchParams.set('code', 'TG-e2e-code');
      redirect.searchParams.set('state', url.searchParams.get('state'));
      res.writeHead(302, { Location: redirect.toString() });
      return res.end();
    }
    if (path === '/oauth/token' && req.method === 'POST') {
      await readBody(req);
      const userId = ++nextUser;
      const token = `APP_USR-e2e-org-${userId}`;
      accounts.set(token, String(userId));
      return send(res, 200, {
        access_token: token,
        refresh_token: 'TG-e2e-refresh',
        expires_in: 15_552_000,
        user_id: userId,
        public_key: 'APP_USR-e2e-public',
        live_mode: true,
      });
    }

    // --- Donaciones: Orders con el token de la organización ---
    if (path === '/v1/orders' && req.method === 'POST') {
      const body = JSON.parse(await readBody(req));
      const token = auth.replace(/^Bearer /, '');
      if (!accounts.has(token)) return send(res, 401, { message: 'invalid token' });
      const id = `ORDE2E${++seq}`;
      orders.set(id, { body, paid: false, token });
      return send(res, 201, {
        id,
        status: 'created',
        checkout_url: `${CHECKOUT}/checkout/v1/redirect?order_id=${id}`,
      });
    }
    const ord = /^\/v1\/orders\/(\w+)$/.exec(path);
    if (ord && req.method === 'GET') {
      const found = orders.get(ord[1]);
      if (!found || auth !== `Bearer ${found.token}`) return send(res, 404, {});
      const amount = found.body.total_amount;
      return send(res, 200, {
        id: ord[1],
        user_id: accounts.get(found.token),
        live_mode: true,
        external_reference: found.body.external_reference,
        total_amount: amount,
        status: found.paid ? 'processed' : 'action_required',
        status_detail: found.paid ? 'accredited' : 'waiting_payment',
        total_paid_amount: found.paid ? amount : '0',
        transactions: {
          payments: found.paid
            ? [
                {
                  id: `PAY${ord[1]}`,
                  amount,
                  status: 'processed',
                  payment_method: { id: found.method, type: found.methodType },
                },
              ]
            : [],
        },
      });
    }

    // --- Café: Checkout Pro con el token de AdoptaFácil ---
    if (path === '/checkout/preferences' && req.method === 'POST') {
      if (!platformOnly(auth)) return send(res, 401, { message: 'invalid token' });
      const body = JSON.parse(await readBody(req));
      const id = `PREF-${++seq}`;
      preferences.set(id, body);
      return send(res, 201, {
        id,
        init_point: `${CHECKOUT}/checkout/v1/redirect?pref_id=${id}`,
      });
    }
    const pay = /^\/v1\/payments\/(\d+)$/.exec(path);
    if (pay && req.method === 'GET') {
      const found = payments.get(pay[1]);
      if (!found || !platformOnly(auth)) return send(res, 404, {});
      return send(res, 200, found);
    }
    if (path.startsWith('/v1/payments/search')) {
      return send(res, 200, { results: [], paging: { total: 0 } });
    }

    // --- Planes: suscripciones con el token de AdoptaFácil ---
    if (path === '/preapproval' && req.method === 'POST') {
      if (!platformOnly(auth)) return send(res, 401, { message: 'invalid token' });
      const body = JSON.parse(await readBody(req));
      const id = `preap${++seq}`;
      preapprovals.set(id, { id, status: 'pending', ...body });
      log(
        'suscripción',
        id,
        'payer_email',
        body.payer_email,
        'monto',
        body.auto_recurring?.transaction_amount,
      );
      return send(res, 201, {
        id,
        init_point: `${CHECKOUT}/subscriptions/checkout?preapproval_id=${id}`,
      });
    }
    const preap = /^\/preapproval\/(\w+)$/.exec(path);
    if (preap) {
      const found = preapprovals.get(preap[1]);
      if (!found || !platformOnly(auth)) return send(res, 404, {});
      if (req.method === 'PUT') Object.assign(found, JSON.parse((await readBody(req)) || '{}'));
      return send(res, 200, found);
    }
    const charge = /^\/authorized_payments\/(\d+)$/.exec(path);
    if (charge) {
      const found = charges.get(charge[1]);
      if (!found || !platformOnly(auth)) return send(res, 404, {});
      return send(res, 200, found);
    }

    // --- Lo que hace la página de pago simulada ---
    const payOrder = /^\/__pay\/order\/(\w+)$/.exec(path);
    if (payOrder && req.method === 'POST') {
      const found = orders.get(payOrder[1]);
      if (!found) return send(res, 404, { error: 'no order' });
      const method = url.searchParams.get('method') ?? 'pse';
      found.paid = true;
      found.method = method;
      found.methodType =
        { pse: 'bank_transfer', efecty: 'ticket', nequi: 'digital_wallet' }[method] ??
        'credit_card';
      const hook = await signedNotify(
        `${API}/donations/webhook/mercadopago`,
        ORDERS_SECRET,
        'order',
        payOrder[1],
        {
          action: 'order.processed',
          data: { id: payOrder[1], external_reference: found.body.external_reference },
        },
      );
      return send(res, 200, {
        webhookStatus: hook.status,
        successUrl: found.body.config.online.success_url,
      });
    }
    const payPref = /^\/__pay\/preference\/([\w-]+)$/.exec(path);
    if (payPref && req.method === 'POST') {
      const pref = preferences.get(payPref[1]);
      if (!pref) return send(res, 404, { error: 'no preference' });
      const id = String(++seq);
      const total = pref.items.reduce((s, i) => s + i.unit_price * i.quantity, 0);
      payments.set(id, {
        id: Number(id),
        status: 'approved',
        external_reference: pref.external_reference,
        transaction_amount: total,
        currency_id: 'COP',
        live_mode: true,
      });
      const hook = await signedNotify(pref.notification_url, WEBHOOK_SECRET, 'payment', id);
      return send(res, 200, { webhookStatus: hook.status, successUrl: pref.back_urls.success });
    }
    const payPre = /^\/__pay\/preapproval\/(\w+)$/.exec(path);
    if (payPre && req.method === 'POST') {
      const pre = preapprovals.get(payPre[1]);
      if (!pre) return send(res, 404, { error: 'no preapproval' });
      pre.status = 'authorized';
      pre.next_payment_date = new Date(Date.now() + 30 * 86_400_000).toISOString();
      const first = await signedNotify(
        `${API}/billing/webhooks/mercadopago`,
        WEBHOOK_SECRET,
        'subscription_preapproval',
        payPre[1],
      );
      const chargeId = String(++seq);
      charges.set(chargeId, {
        id: Number(chargeId),
        preapproval_id: payPre[1],
        status: 'processed',
        payment: { id: Number(chargeId) + 1, status: 'approved' },
        transaction_amount: pre.auto_recurring.transaction_amount,
        currency_id: 'COP',
        debit_date: new Date().toISOString(),
        date_created: new Date().toISOString(),
      });
      const second = await signedNotify(
        `${API}/billing/webhooks/mercadopago`,
        WEBHOOK_SECRET,
        'subscription_authorized_payment',
        chargeId,
      );
      const back = new URL(pre.back_url);
      back.searchParams.set('preapproval_id', payPre[1]);
      return send(res, 200, {
        webhookStatus: Math.max(first.status, second.status),
        payerEmail: pre.payer_email,
        successUrl: back.toString(),
      });
    }
    send(res, 404, { error: 'not mocked', path });
  })
  .listen(PORT, '127.0.0.1', () => log(`listening on ${PORT}`));
