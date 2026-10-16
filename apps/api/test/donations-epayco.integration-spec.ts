import { createHash, randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { computeBreakdown, DIRECT_COLLECTION_RATES } from '@adoptafacil/contracts';
import { purgeOrganizations } from './support/cleanup';
import { LEGAL_GUEST, LEGAL_ORG } from './support/legal';

/**
 * ePayco end to end (ADR-PAG-001/002) with PAYMENT_DRIVER=epayco and ZERO
 * network (every ePayco call is a mocked global fetch):
 *   - the Owner connects the org's ePayco keys (encrypted at rest, never echoed);
 *   - a guest donates → checkout v2 session created with the ORG's keys;
 *   - ePayco's confirmation arrives FORM-URLENCODED (as ePayco posts it),
 *     is verified with the org's P_KEY and read back → donation approved;
 *   - a forged signature is 403 and an amount mismatch never approves.
 */
describe('Donations with ePayco (direct to org, form-urlencoded confirmation)', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  const admin = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  const orgIds: string[] = [];
  const savedEnv = { ...process.env };
  const realFetch = globalThis.fetch;

  const custId = `8${String(Date.now()).slice(-8)}`;
  const keys = {
    custId,
    pKey: 'org-p-key-integration-secret',
    publicKey: 'org-public-key-1234',
    privateKey: 'org-private-key-integration-secret',
  };
  let orgId = '';
  let orgToken = '';
  /** What the mocked read-back answers for the next confirmation. */
  let readBack: Record<string, unknown> = {};
  const sessionBodies: Record<string, unknown>[] = [];

  beforeAll(async () => {
    process.env.PAYMENT_DRIVER = 'epayco';
    process.env.EPAYCO_TEST = 'true';
    process.env.EPAYCO_APIFY_BASE_URL = 'https://apify.epayco.test';
    process.env.EPAYCO_SECURE_BASE_URL = 'https://secure.epayco.test';
    globalThis.fetch = jest.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url);
      const json = (body: unknown) =>
        new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
      if (u === 'https://apify.epayco.test/login') return json({ token: 'tok' });
      if (u === 'https://apify.epayco.test/payment/session/create') {
        sessionBodies.push(JSON.parse(String(init?.body)));
        return json({ success: true, data: { sessionId: `sess-${sessionBodies.length}` } });
      }
      if (u.startsWith('https://secure.epayco.test/validation/v1/reference/')) {
        return json({ success: true, data: readBack });
      }
      return realFetch(url, init);
    }) as typeof fetch;

    // ConfigModule.forRoot validates process.env when AppModule is first
    // imported, so the module is loaded only AFTER the ePayco env is set.
    const { AppModule } = await import('../src/app.module');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    server = app.getHttpServer();

    const reg = await request(server)
      .post('/auth/register/organization')
      .send({
        ...LEGAL_ORG,
        organizationName: 'Refugio ePayco',
        displayName: 'Owner ePayco',
        email: `epayco-org-${randomUUID()}@test.local`,
        password: 'password-1234',
      })
      .expect(201);
    orgToken = reg.body.tokens.accessToken;
    orgId = reg.body.user.organizationId;
    orgIds.push(orgId);
  });

  afterAll(async () => {
    globalThis.fetch = realFetch;
    process.env = savedEnv;
    await purgeOrganizations(admin, orgIds);
    await admin.$disconnect();
    await app.close();
  });

  const donate = (idempotencyKey: string) =>
    request(server)
      .post('/donations')
      .send({
        ...LEGAL_GUEST,
        organizationId: orgId,
        intendedAmount: 50000,
        commissionPayer: 'donor',
        idempotencyKey,
        payer: { email: 'donante@test.local' },
      });

  const confirmation = (invoice: string, amount: string, pKey = keys.pKey) => {
    const body = {
      x_ref_payco: String(Math.floor(Math.random() * 1e9)),
      x_transaction_id: `tx-${randomUUID()}`,
      x_amount: amount,
      x_currency_code: 'COP',
      x_id_invoice: invoice,
      x_cust_id_cliente: keys.custId,
      x_cod_transaction_state: '1',
    };
    const x_signature = createHash('sha256')
      .update(
        [
          keys.custId,
          pKey,
          body.x_ref_payco,
          body.x_transaction_id,
          body.x_amount,
          body.x_currency_code,
        ].join('^'),
      )
      .digest('hex');
    return { ...body, x_signature };
  };

  it('refuses a donation before the org connects ePayco (409, no platform fallback)', async () => {
    await donate(`epayco-${randomUUID()}`).expect(409);
  });

  it('Owner connects ePayco; status never returns a secret', async () => {
    const res = await request(server)
      .put('/org/epayco/connect')
      .set('Authorization', `Bearer ${orgToken}`)
      .send(keys)
      .expect(200);
    expect(res.body).toMatchObject({ connected: true, custId, publicKeyHint: '1234' });
    const status = await request(server)
      .get('/org/epayco/status')
      .set('Authorization', `Bearer ${orgToken}`)
      .expect(200);
    const serialized = JSON.stringify([res.body, status.body]);
    expect(serialized).not.toContain(keys.pKey);
    expect(serialized).not.toContain(keys.privateKey);

    const stored = await admin.organizationEpaycoAccount.findUnique({
      where: { organizationId: orgId },
    });
    expect(stored?.pKeyEnc).not.toContain(keys.pKey);
    expect(stored?.privateKeyEnc).not.toContain(keys.privateKey);
    const audits = await admin.auditLog.findMany({
      where: { organizationId: orgId, action: 'payment_gateway.epayco_connected' },
    });
    expect(audits).toHaveLength(1);
    expect(JSON.stringify(audits)).not.toContain(keys.pKey);
  });

  it('rejects connect without a session (401)', async () => {
    await request(server).put('/org/epayco/connect').send(keys).expect(401);
  });

  let invoice = '';
  let amountCharged = 0;
  let donationId = '';

  it("a guest donation opens a checkout session with the ORG's keys and no platform fee", async () => {
    const res = await donate(`epayco-${randomUUID()}`).expect(201);
    const expected = computeBreakdown(50000, 'donor', DIRECT_COLLECTION_RATES);
    expect(res.body.status).toBe('pending');
    expect(res.body.breakdown).toEqual(expected);
    expect(res.body.checkoutSessionId).toMatch(/^sess-/);
    expect(res.body.checkoutTest).toBe(true);
    invoice = res.body.collectionId;
    amountCharged = res.body.amountCharged;
    donationId = res.body.id;
    const session = sessionBodies[sessionBodies.length - 1];
    expect(session).toMatchObject({ invoice, amount: expected.amountCharged, test: true });
  });

  it('a form-urlencoded confirmation with a FORGED signature is 403', async () => {
    const body = confirmation(invoice, String(amountCharged), 'not-the-p-key');
    await request(server).post('/donations/webhook').type('form').send(body).expect(403);
  });

  it('a read-back amount mismatch never approves (audited)', async () => {
    const body = confirmation(invoice, String(amountCharged));
    readBack = { ...body, x_amount: '1000' };
    const res = await request(server)
      .post('/donations/webhook')
      .type('form')
      .send(body)
      .expect(200);
    expect(res.body.applied).toBe(false);
    const audits = await admin.auditLog.findMany({
      where: { organizationId: orgId, action: 'donation.payment_mismatch' },
    });
    expect(audits.length).toBeGreaterThanOrEqual(1);
  });

  it('a valid form-urlencoded confirmation approves the donation and issues the receipt', async () => {
    const body = confirmation(invoice, `${amountCharged}.00`);
    readBack = { ...body };
    const res = await request(server)
      .post('/donations/webhook')
      .type('form')
      .send(body)
      .expect(200);
    expect(res.body).toEqual({ applied: true, status: 'approved', donationId });
    const receipts = await admin.donationReceipt.findMany({ where: { donationId } });
    expect(receipts).toHaveLength(1);
  });
});
