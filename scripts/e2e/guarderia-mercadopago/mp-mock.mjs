// Mercado Pago SIMULADO para el recorrido de punta a punta del cobro de
// guardería (cero red real, nunca credenciales reales). Solo escucha en
// 127.0.0.1. Ver README.md de esta carpeta.
// - GET  /authorization       -> redirige al callback OAuth con code y state
// - POST /oauth/token         -> una cuenta nueva por organización (token y user_id propios)
// - POST /v1/orders           -> crea la orden (solo con un token emitido aquí) y da checkout_url
// - GET  /v1/orders/:id       -> relectura, solo con el token de la cuenta dueña de la orden
// - GET  /v1/payments/search  -> conciliación (lista vacía)
// - POST /__pay/:id           -> "paga" la orden y envía el aviso FIRMADO (x-signature v1) a la API
import { createHmac, randomUUID } from 'node:crypto';
import http from 'node:http';

const PORT = Number(process.env.MOCK_PORT ?? 4010);
const API = process.env.API_URL ?? 'http://localhost:3000';
const ORDERS_SECRET = process.env.ORDERS_SECRET ?? 'e2e-orders-secret';
const accounts = new Map(); // token -> user id (una cuenta por organización)
let nextUser = 812345000 + Math.floor(Math.random() * 999);
const orders = new Map();
const log = (...a) => console.log('[mp-mock]', ...a);

const send = (res, status, body, headers = {}) => {
  res.writeHead(status, { 'Content-Type': 'application/json', ...headers });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
};
const readBody = (req) =>
  new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => resolve(data));
  });

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    const auth = req.headers.authorization ?? '';
    log(req.method, url.pathname);

    if (url.pathname === '/authorization') {
      const redirect = new URL(url.searchParams.get('redirect_uri'));
      redirect.searchParams.set('code', 'TG-e2e-code');
      redirect.searchParams.set('state', url.searchParams.get('state'));
      res.writeHead(302, { Location: redirect.toString() });
      return res.end();
    }
    if (url.pathname === '/oauth/token' && req.method === 'POST') {
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
    if (url.pathname === '/v1/orders' && req.method === 'POST') {
      const body = JSON.parse(await readBody(req));
      const token = auth.replace(/^Bearer /, '');
      if (!accounts.has(token)) {
        log('order refused: not the org token');
        return send(res, 401, { message: 'invalid token' });
      }
      const id = `ORDE2E${orders.size + 1}`;
      orders.set(id, { body, paid: null, token });
      log('order created', id, 'amount', body.total_amount, 'ref', body.external_reference);
      return send(res, 201, {
        id,
        status: 'created',
        checkout_url: `https://www.mercadopago.com.co/checkout/v1/redirect?order_id=${id}`,
      });
    }
    const ord = /^\/v1\/orders\/(\w+)$/.exec(url.pathname);
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
                  id: `PAY-${ord[1]}`,
                  amount,
                  status: 'processed',
                  payment_method: { id: 'pse', type: 'bank_transfer' },
                },
              ]
            : [],
        },
      });
    }
    if (url.pathname.startsWith('/v1/payments/search')) {
      return send(res, 200, { results: [], paging: { total: 0 } });
    }
    const pay = /^\/__pay\/(\w+)$/.exec(url.pathname);
    if (pay && req.method === 'POST') {
      const found = orders.get(pay[1]);
      if (!found) return send(res, 404, { error: 'no order' });
      found.paid = new Date().toISOString();
      const ts = String(Math.floor(Date.now() / 1000));
      const requestId = randomUUID();
      const manifest = `id:${pay[1].toLowerCase()};request-id:${requestId};ts:${ts};`;
      const v1 = createHmac('sha256', ORDERS_SECRET).update(manifest).digest('hex');
      const hook = await fetch(
        `${API}/donations/webhook/mercadopago?data.id=${pay[1]}&type=order`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-signature': `ts=${ts},v1=${v1}`,
            'x-request-id': requestId,
          },
          body: JSON.stringify({
            type: 'order',
            action: 'order.processed',
            data: { id: pay[1], external_reference: found.body.external_reference },
          }),
        },
      );
      log('webhook sent', pay[1], '->', hook.status);
      return send(res, 200, {
        webhookStatus: hook.status,
        successUrl: found.body.config.online.success_url,
      });
    }
    send(res, 404, { error: 'not mocked', path: url.pathname });
  })
  .listen(PORT, '127.0.0.1', () => log(`listening on ${PORT}`));
