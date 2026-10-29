/**
 * Prueba de concepto del split 1:1 de Mercado Pago, SOLO SANDBOX.
 *
 *   pnpm --filter @adoptafacil/api mp:sandbox authorize-url
 *   pnpm --filter @adoptafacil/api mp:sandbox pay --code TG-... [--amount 50000]
 *   MP_SELLER_ACCESS_TOKEN=... pnpm --filter @adoptafacil/api mp:sandbox pay [--amount 50000]
 *
 * Lee MERCADOPAGO_CLIENT_ID / MERCADOPAGO_CLIENT_SECRET del entorno (credenciales
 * de PRUEBA de la aplicación de la plataforma). Nunca imprime ni guarda tokens:
 * el token del vendedor vive solo en memoria durante la ejecución.
 *
 * Variables opcionales:
 *   MERCADOPAGO_OAUTH_REDIRECT_URI  debe coincidir con la registrada en la app de MP
 *   MP_BUYER_EMAIL                  email del comprador de prueba
 *   MP_TEST_CARDHOLDER              APRO (aprobado, por defecto), OTHE (rechazado)...
 */
import { randomBytes, randomUUID } from 'node:crypto';
import {
  MERCADOPAGO_API_BASE_URL,
  MercadoPagoOAuthClient,
} from '../src/core/payments/mercadopago-sandbox/mercadopago-oauth.client';
import {
  MercadoPagoApiError,
  MercadoPagoSplitClient,
} from '../src/core/payments/mercadopago-sandbox/mercadopago-split.client';

// Tarjeta de prueba Mastercard publicada por Mercado Pago para Colombia.
const TEST_CARD = { number: '5254133674403564', cvv: '123', month: 11, year: 2030 };

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Falta la variable de entorno ${name}.`);
    process.exit(2);
  }
  return value;
}

function oauthClient(): MercadoPagoOAuthClient {
  return new MercadoPagoOAuthClient({
    clientId: requireEnv('MERCADOPAGO_CLIENT_ID'),
    clientSecret: requireEnv('MERCADOPAGO_CLIENT_SECRET'),
    redirectUri:
      process.env.MERCADOPAGO_OAUTH_REDIRECT_URI ??
      'http://localhost:3000/org/mercadopago/callback',
  });
}

async function sellerCredentials(): Promise<{
  accessToken: string;
  publicKey: string;
  userId: string;
}> {
  const code = arg('code');
  if (code) {
    const tokens = await oauthClient().exchangeCode(code);
    console.log(
      `OAuth OK: vendedor user_id=${tokens.user_id} live_mode=${tokens.live_mode} refresh_token=${tokens.refresh_token ? 'sí' : 'no'} expires_in=${tokens.expires_in}`,
    );
    if (!tokens.public_key) throw new Error('La respuesta OAuth no trae public_key.');
    return {
      accessToken: tokens.access_token,
      publicKey: tokens.public_key,
      userId: String(tokens.user_id),
    };
  }
  const accessToken = process.env.MP_SELLER_ACCESS_TOKEN;
  if (!accessToken) {
    console.error('Pasa --code TG-... (del callback OAuth) o define MP_SELLER_ACCESS_TOKEN.');
    process.exit(2);
  }
  const res = await fetch(`${MERCADOPAGO_API_BASE_URL}/users/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`GET /users/me falló (${res.status})`);
  const me = (await res.json()) as { id: number };
  const publicKey = process.env.MP_SELLER_PUBLIC_KEY;
  if (!publicKey) {
    console.error('Con MP_SELLER_ACCESS_TOKEN también hace falta MP_SELLER_PUBLIC_KEY.');
    process.exit(2);
  }
  return { accessToken, publicKey, userId: String(me.id) };
}

/** Tokeniza la tarjeta de prueba con la public_key del vendedor (lo que haría el Brick). */
async function createCardToken(publicKey: string): Promise<string> {
  const res = await fetch(
    `${MERCADOPAGO_API_BASE_URL}/v1/card_tokens?public_key=${encodeURIComponent(publicKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        card_number: TEST_CARD.number,
        security_code: TEST_CARD.cvv,
        expiration_month: TEST_CARD.month,
        expiration_year: TEST_CARD.year,
        cardholder: {
          name: process.env.MP_TEST_CARDHOLDER ?? 'APRO',
          identification: { type: 'CC', number: '123456789' },
        },
      }),
    },
  );
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(`POST /v1/card_tokens falló (${res.status}): ${body.message ?? 'sin mensaje'}`);
  }
  return ((await res.json()) as { id: string }).id;
}

async function pay(): Promise<void> {
  const amountCop = Number(arg('amount') ?? 50_000);
  const seller = await sellerCredentials();
  const attempt = async (omitApplicationFee: boolean) => {
    const cardToken = await createCardToken(seller.publicKey);
    const idempotencyKey = randomUUID();
    return new MercadoPagoSplitClient().createSplitPayment({
      sellerAccessToken: seller.accessToken,
      amountCop,
      cardToken,
      paymentMethodId: 'master',
      payerEmail: process.env.MP_BUYER_EMAIL ?? `test_buyer_${Date.now()}@testuser.com`,
      externalReference: `af-${idempotencyKey}`,
      idempotencyKey,
      description: 'AdoptaFácil sandbox split 4%',
      omitApplicationFee,
    });
  };
  let result;
  try {
    result = await attempt(false);
  } catch (err) {
    if (!(err instanceof MercadoPagoApiError) || !/application_fee/.test(err.message)) throw err;
    console.error(`Con application_fee: ${err.message}`);
    console.log('Reintentando el mismo cobro SIN application_fee para aislar la causa...');
    result = await attempt(true);
  }
  console.log('Pago creado:', JSON.stringify(result, null, 2));
  if (result.collectorId && result.collectorId !== seller.userId) {
    console.warn('ATENCIÓN: collector_id no coincide con el vendedor conectado.');
  }
  if (result.reportedApplicationFeeCop === undefined) {
    console.warn(
      'ATENCIÓN: MP no reportó application_fee en fee_details; el split podría no haberse aplicado.',
    );
  } else if (result.reportedApplicationFeeCop !== result.applicationFeeCop) {
    console.warn('ATENCIÓN: la application_fee reportada difiere de la calculada.');
  }
}

async function main(): Promise<void> {
  switch (process.argv[2]) {
    case 'authorize-url':
      console.log(oauthClient().buildAuthorizeUrl(randomBytes(16).toString('hex')));
      console.log(
        'Abre la URL, inicia sesión con el VENDEDOR de prueba y copia el ?code=TG-... del redirect.',
      );
      return;
    case 'pay':
      return pay();
    default:
      console.error(
        'Uso: mp-sandbox-split.ts authorize-url | pay [--code TG-...] [--amount 50000]',
      );
      process.exit(2);
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? `${err.name}: ${err.message}` : err);
  process.exit(1);
});
