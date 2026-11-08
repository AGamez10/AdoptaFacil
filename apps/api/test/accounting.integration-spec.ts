import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { type Prisma, PrismaClient } from '@prisma/client';
import request from 'supertest';
import { accountingPeriodOf } from '@adoptafacil/contracts';
import { mercadoPagoSignatureV1 } from '../src/core/payments/mercadopago-payment.adapter';
import { NOTIFICATION_PORT } from '../src/core/notifications/notification.port';
import { PlansService } from '../src/core/plans/plans.service';
import { purgeOrganizations } from './support/cleanup';
import { LEGAL_GUEST, LEGAL_ORG } from './support/legal';
import { CapturingNotificationPort, SIGNATURE_PNG } from './support/signers';
import { approveTestOrganization, formalizeTestOrganization } from './support/organization-status';

/**
 * Contabilidad de donaciones por detrás (sección 2A/2B), de punta a punta con
 * PAYMENT_DRIVER=mercadopago y CERO red (Mercado Pago simulado):
 *  - el libro auxiliar nace solo de pagos que Mercado Pago confirma al
 *    releerlos con el token del refugio, con comisión, neto y forma de pago;
 *  - "Releer Mercado Pago" recupera una notificación perdida y aprueba la
 *    donación; ignora pagos ajenos a AdoptaFácil o de otra cuenta;
 *  - la conciliación del mes cuadra o muestra el descuadre;
 *  - el plan Gratis concilia y exporta lo básico; cierre, exporte completo y
 *    paquete para el revisor exigen plan de pago (403 PLAN_REQUIRED);
 *  - al cerrar el mes, el libro se sella y va a firma del revisor fiscal por
 *    correo (sin cuenta): primera vez registra su firma, y queda emitido;
 *  - el libro y los cierres son inmutables (también para superusuario);
 *  - reembolsos y contracargos restan; si llegan de un mes cerrado, entran
 *    como ajuste fechado en el mes abierto;
 *  - el enlace compartido con el revisor funciona sin cuenta y se revoca;
 *  - otra organización no ve nada (RLS).
 */

async function withOrgContext<T>(
  prisma: PrismaClient,
  organizationId: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.current_org_id', ${organizationId}, true)`;
    return fn(tx);
  });
}

describe('Accounting: ledger, reconciliation, close and reviewer package', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  let plans: PlansService;
  const admin = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  const appDb = new PrismaClient({
    datasources: { db: { url: process.env.DATABASE_URL_APP ?? process.env.DATABASE_URL } },
  });
  const notifications = new CapturingNotificationPort();
  const orgIds: string[] = [];
  const savedEnv = { ...process.env };
  const realFetch = globalThis.fetch;

  const SECRET = 'mp-webhook-secret-accounting';
  const mpUserId = `8${String(Date.now()).slice(-9)}`;
  const orgAccess = 'APP_USR-org-access-accounting';

  /** Pagos que conoce el Mercado Pago simulado (id → cuerpo + token que puede leerlo). */
  const payments = new Map<string, { token: string; body: Record<string, unknown> }>();

  // Un mes ya terminado (hace ~2 meses) para poder cerrarlo.
  const PAST_DATE = new Date(Date.now() - 62 * 86_400_000);
  const PAST = accountingPeriodOf(PAST_DATE);
  const CURRENT = accountingPeriodOf(new Date());
  const pastIso = (offsetHours = 0) =>
    new Date(PAST_DATE.getTime() + offsetHours * 3_600_000).toISOString();

  let owner = { token: '', userId: '', orgId: '' };
  let other = { token: '', userId: '', orgId: '' };
  const reviewerEmail = `revisor-${randomUUID()}@test.local`;
  const auth = (a: { token: string }) => ({ Authorization: `Bearer ${a.token}` });
  const setEnforced = (value: boolean) =>
    Object.defineProperty(plans, 'enforced', { value, configurable: true });
  const setPromoEnd = (value: Date | null) =>
    Object.defineProperty(plans, 'promoEndsAt', { value, configurable: true });
  const onPlan = async (plan: 'free' | 'crece') => {
    if (plan === 'free') {
      await admin.organizationSubscription.deleteMany({ where: { organizationId: owner.orgId } });
      return;
    }
    await admin.organizationSubscription.upsert({
      where: { organizationId: owner.orgId },
      create: {
        organizationId: owner.orgId,
        plan,
        status: 'active',
        currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000),
      },
      update: { plan, status: 'active' },
    });
  };

  const binary = (r: request.Test) =>
    r.buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    });

  function lastLink(email: string, pattern: RegExp): string {
    const message = [...notifications.sent]
      .reverse()
      .find((m) => m.to === email && pattern.test(m.body));
    const match = message?.body.match(pattern);
    if (!match) throw new Error(`no link sent to ${email}`);
    return decodeURIComponent(match[1]);
  }

  const notify = (orgId: string, paymentId: string) => {
    const ts = String(Math.floor(Date.now() / 1000));
    const requestId = randomUUID();
    const v1 = mercadoPagoSignatureV1(SECRET, paymentId, requestId, ts);
    return request(server)
      .post(`/donations/webhook/mercadopago/${orgId}?data.id=${paymentId}&type=payment`)
      .set('x-signature', `ts=${ts},v1=${v1}`)
      .set('x-request-id', requestId)
      .send({ type: 'payment', data: { id: paymentId } });
  };

  const donate = async (amount: number) => {
    const res = await request(server)
      .post('/donations')
      .send({
        ...LEGAL_GUEST,
        organizationId: owner.orgId,
        intendedAmount: amount,
        idempotencyKey: `acc-${randomUUID()}`,
        payer: { email: 'donante@test.local', fullName: 'Donante Prueba' },
      })
      .expect(201);
    return res.body as { id: string; collectionId: string; amountCharged: number };
  };

  const mpPayment = (
    id: string,
    reference: string,
    amount: number,
    over: Record<string, unknown> = {},
  ) => {
    payments.set(id, {
      token: orgAccess,
      body: {
        id: Number(id),
        collector_id: Number(mpUserId),
        external_reference: reference,
        status: 'approved',
        status_detail: 'accredited',
        currency_id: 'COP',
        transaction_amount: amount,
        transaction_details: { net_received_amount: amount - 1500 },
        fee_details: [{ type: 'mercadopago_fee', amount: 1500, fee_payer: 'collector' }],
        payment_type_id: 'bank_transfer',
        payment_method_id: 'pse',
        date_created: pastIso(),
        date_approved: pastIso(),
        refunds: [],
        transaction_amount_refunded: 0,
        ...over,
      },
    });
  };

  beforeAll(async () => {
    process.env.PAYMENT_DRIVER = 'mercadopago';
    process.env.MERCADOPAGO_BASE_URL = 'https://api.mp.test';
    process.env.MERCADOPAGO_CLIENT_ID = '5550002';
    process.env.MERCADOPAGO_CLIENT_SECRET = 'mp-client-secret-accounting';
    process.env.MERCADOPAGO_WEBHOOK_SECRET = SECRET;
    process.env.MERCADOPAGO_PLATFORM_ACCESS_TOKEN = 'APP_USR-platform-accounting';
    process.env.API_PUBLIC_BASE_URL = 'https://api.adoptafacil.test';
    process.env.MERCADOPAGO_TEST = 'false';
    globalThis.fetch = jest.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url);
      const json = (body: unknown, status = 200) =>
        new Response(JSON.stringify(body), {
          status,
          headers: { 'Content-Type': 'application/json' },
        });
      const authHeader = String(
        (init?.headers as Record<string, string> | undefined)?.Authorization,
      );
      if (u === 'https://api.mp.test/oauth/token') {
        return json({
          access_token: orgAccess,
          refresh_token: 'TG-refresh-accounting',
          expires_in: 15_552_000,
          user_id: Number(mpUserId),
          public_key: 'APP_USR-public',
          live_mode: true,
        });
      }
      if (u === 'https://api.mp.test/checkout/preferences') {
        return json({
          id: `pref-${randomUUID()}`,
          collector_id: Number(mpUserId),
          init_point: 'https://www.mercadopago.com.co/checkout/v1/redirect?pref_id=x',
        });
      }
      if (u.startsWith('https://api.mp.test/v1/payments/search?')) {
        const results: Array<Record<string, unknown>> = [...payments.values()]
          .filter((p) => `Bearer ${p.token}` === authHeader)
          .map((p) => ({ live_mode: true, ...p.body }));
        // Pagos de la cuenta que NO originó AdoptaFácil, y uno de otro cobrador.
        results.push(
          {
            live_mode: true,
            id: 990001,
            collector_id: Number(mpUserId),
            external_reference: 'tienda-123',
            status: 'approved',
            transaction_amount: 999,
            currency_id: 'COP',
          },
          {
            live_mode: true,
            id: 990002,
            collector_id: 12345,
            external_reference: 'af-ajeno',
            status: 'approved',
            transaction_amount: 5000,
            currency_id: 'COP',
          },
        );
        return json({ results, paging: { total: results.length } });
      }
      const pay = /^https:\/\/api\.mp\.test\/v1\/payments\/(\w+)$/.exec(u);
      if (pay) {
        const found = payments.get(pay[1]);
        return found && authHeader === `Bearer ${found.token}`
          ? json({ live_mode: true, ...found.body })
          : json({}, 404);
      }
      return realFetch(url, init);
    }) as typeof fetch;

    const { AppModule } = await import('../src/app.module');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(NOTIFICATION_PORT)
      .useValue(notifications)
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
    server = app.getHttpServer();
    plans = app.get(PlansService);

    const register = async (name: string) => {
      const res = await request(server)
        .post('/auth/register/organization')
        .send({
          ...LEGAL_ORG,
          organizationName: name,
          displayName: `Owner ${name}`,
          email: `acc-${randomUUID()}@test.local`,
          password: 'password-1234',
        })
        .expect(201);
      orgIds.push(res.body.user.organizationId);
      await approveTestOrganization(admin, res.body.user.organizationId);
      await formalizeTestOrganization(admin, res.body.user.organizationId);
      return {
        token: res.body.tokens.accessToken as string,
        userId: res.body.user.id as string,
        orgId: res.body.user.organizationId as string,
      };
    };
    owner = await register('Refugio Contable');
    other = await register('Otro Refugio Contable');
    await admin.organizationProfile.upsert({
      where: { organizationId: owner.orgId },
      create: {
        organizationId: owner.orgId,
        formalizationState: 'formalizada',
        nit: '900123456-7',
      },
      update: { formalizationState: 'formalizada', nit: '900123456-7' },
    });

    // El refugio conecta SU cuenta de Mercado Pago (OAuth).
    const connect = await request(server)
      .get('/org/mercadopago/connect')
      .set(auth(owner))
      .expect(200);
    const state = new URL(connect.body.authorizeUrl).searchParams.get('state');
    // El mismo navegador que inició la conexión (cookie de enlace del OAuth).
    const binding = ([] as string[])
      .concat(connect.headers['set-cookie'] ?? [])
      .find((c) => c.startsWith('af_mp_oauth='));
    const done = await request(server)
      .get(`/org/mercadopago/callback?code=TG-acc&state=${state}`)
      .set('Cookie', String(binding).split(';')[0])
      .expect(302);
    expect(done.headers.location).toMatch(/mercadopago=connected$/);
  });

  beforeEach(() => {
    setEnforced(true);
    setPromoEnd(new Date(Date.now() - 86_400_000));
  });

  afterEach(() => {
    setEnforced(false);
    setPromoEnd(null);
  });

  afterAll(async () => {
    globalThis.fetch = realFetch;
    process.env = savedEnv;
    await purgeOrganizations(admin, orgIds);
    await admin.$disconnect();
    await appDb.$disconnect();
    await app.close();
  });

  let d1 = { id: '', collectionId: '', amountCharged: 0 };
  let d2 = { id: '', collectionId: '', amountCharged: 0 };

  it('an approved Mercado Pago payment becomes a ledger line with fee, net and payment method', async () => {
    await onPlan('free');
    d1 = await donate(50_000);
    mpPayment('70001', d1.collectionId, d1.amountCharged);
    await notify(owner.orgId, '70001').expect(200);

    const view = await request(server)
      .get(`/org/accounting/periods/${PAST}`)
      .set(auth(owner))
      .expect(200);
    expect(view.body.status).toBe('open');
    expect(view.body.entries).toHaveLength(1);
    expect(view.body.entries[0]).toMatchObject({
      seq: 1,
      entryType: 'donation',
      source: 'mercadopago',
      donationId: d1.id,
      gatewayPaymentId: '70001',
      grossCop: d1.amountCharged,
      feeCop: 1500,
      netCop: d1.amountCharged - 1500,
      paymentType: 'bank_transfer',
      destination: 'general',
      isAdjustment: false,
      period: PAST,
    });
    expect(view.body.totals).toMatchObject({
      donationCount: 1,
      donationsGrossCop: d1.amountCharged,
      feesCop: 1500,
      balanceCop: d1.amountCharged,
    });
    // Leer otra vez no duplica renglones.
    const again = await request(server)
      .get(`/org/accounting/periods/${PAST}`)
      .set(auth(owner))
      .expect(200);
    expect(again.body.entries).toHaveLength(1);
  });

  it('"Releer Mercado Pago" recovers a lost notification and ignores foreign payments', async () => {
    d2 = await donate(30_000);
    mpPayment('70002', d2.collectionId, d2.amountCharged, { date_approved: pastIso(2) });
    // La notificación se perdió: AdoptaFácil aún la tiene pendiente.
    const before = await request(server)
      .get(`/org/accounting/periods/${PAST}/reconciliation`)
      .set(auth(owner))
      .expect(200);
    expect(before.body.counts.matched).toBe(1);

    const reread = await request(server)
      .post(`/org/accounting/periods/${PAST}/reread`)
      .set(auth(owner))
      .expect(200);
    expect(reread.body).toMatchObject({ fetched: 2, settled: 1, entriesCreated: 1 });
    const donation = await admin.donation.findUniqueOrThrow({ where: { id: d2.id } });
    expect(donation.status).toBe('approved');
    // Nunca se guarda un pago que AdoptaFácil no originó ni uno de otra cuenta.
    const stored = await admin.mercadoPagoPayment.findMany({
      where: { mpPaymentId: { in: ['990001', '990002'] } },
    });
    expect(stored).toHaveLength(0);

    const rec = await request(server)
      .get(`/org/accounting/periods/${PAST}/reconciliation`)
      .set(auth(owner))
      .expect(200);
    expect(rec.body).toMatchObject({
      mercadopagoConnected: true,
      balanced: true,
      platformTotalCop: d1.amountCharged + d2.amountCharged,
      gatewayTotalCop: d1.amountCharged + d2.amountCharged,
      gatewayFeesCop: 3000,
      differenceCop: 0,
    });
    expect(rec.body.counts.matched).toBe(2);
  });

  it('an amount that does not match is never approved and shows as a discrepancy', async () => {
    const d3 = await donate(20_000);
    mpPayment('70003', d3.collectionId, d3.amountCharged - 5000, {
      date_approved: new Date().toISOString(),
    });
    await notify(owner.orgId, '70003').expect(200);
    expect((await admin.donation.findUniqueOrThrow({ where: { id: d3.id } })).status).toBe(
      'pending',
    );
    const rec = await request(server)
      .get(`/org/accounting/periods/${CURRENT}/reconciliation`)
      .set(auth(owner))
      .expect(200);
    expect(rec.body.balanced).toBe(false);
    expect(rec.body.counts.amount_mismatch).toBe(1);
    expect(rec.body.lines[0]).toMatchObject({
      status: 'amount_mismatch',
      reference: d3.collectionId,
    });
    expect(rec.body.lines[0].hint).toMatch(/no coincide/);
    // El mes en curso no se puede cerrar.
    await onPlan('crece');
    await request(server)
      .post(`/org/accounting/periods/${CURRENT}/close`)
      .set(auth(owner))
      .send({})
      .expect(400);
  });

  it('free plan: reconciles and exports the basic file; close, full export and sharing need a paid plan', async () => {
    await onPlan('free');
    const overview = await request(server).get('/org/accounting').set(auth(owner)).expect(200);
    expect(overview.body.features).toEqual({
      close: false,
      fullExport: false,
      accountantPackage: false,
    });
    expect(overview.body.mercadopagoConnected).toBe(true);

    const csv = await binary(
      request(server)
        .get(`/org/accounting/periods/${PAST}/export?format=csv&detail=basic`)
        .set(auth(owner)),
    ).expect(200);
    const text = (csv.body as Buffer).toString('utf8');
    expect(text).toContain('Folio,Fecha (hora Colombia),Tipo,Valor bruto (COP)');
    expect(text).not.toContain('Comisión pasarela');
    expect(text).toContain(`,Donación,${d1.amountCharged}`);

    for (const [method, path, body, capability] of [
      ['post', `/org/accounting/periods/${PAST}/close`, {}, 'accountingClose'],
      [
        'post',
        `/org/accounting/periods/${PAST}/shares`,
        { signerRole: 'fiscal_reviewer' },
        'accountantPackage',
      ],
    ] as const) {
      const res = await request(server)[method](path).set(auth(owner)).send(body).expect(403);
      expect(res.body).toMatchObject({ code: 'PLAN_REQUIRED', capability, requiredPlan: 'crece' });
    }
    const full = await request(server)
      .get(`/org/accounting/periods/${PAST}/export?format=xlsx&detail=full`)
      .set(auth(owner))
      .expect(403);
    expect(full.body).toMatchObject({ code: 'PLAN_REQUIRED', capability: 'accountingFullExport' });
  });

  let signToken = '';
  let reportCode = '';

  it('paid plan: linking the reviewer sends a welcome email, no account', async () => {
    await onPlan('crece');
    await request(server)
      .post('/org/signers')
      .set(auth(owner))
      .send({
        email: reviewerEmail,
        fullName: 'Rita Revisora',
        role: 'fiscal_reviewer',
        statutoryDeclaration: true,
      })
      .expect(201);
    const welcome = notifications.sent.filter((m) => m.to === reviewerEmail).at(-1);
    expect(welcome?.subject).toMatch(/te vinculó como su revisor fiscal/);
    expect(welcome?.body).toMatch(/No necesitas crear una cuenta/);
    const overview = await request(server).get('/org/accounting').set(auth(owner)).expect(200);
    expect(overview.body.features).toEqual({
      close: true,
      fullExport: true,
      accountantPackage: true,
    });
    expect(overview.body.signers).toEqual([
      { role: 'fiscal_reviewer', displayName: 'Rita Revisora', signatureRegistered: false },
    ]);
  });

  it('closing the month seals it and sends the ledger to the reviewer for signature', async () => {
    await onPlan('crece');
    // La política exige al representante legal, que aún no registró su firma:
    // el mes se cierra igual y el libro firmable se genera después.
    await admin.orgReportPolicy.create({
      data: {
        organizationId: owner.orgId,
        kind: 'accounting',
        requiredRoles: ['legal_representative', 'fiscal_reviewer'],
        updatedByUserId: owner.userId,
      },
    });
    const res = await request(server)
      .post(`/org/accounting/periods/${PAST}/close`)
      .set(auth(owner))
      .send({ note: 'Cierre de prueba' })
      .expect(200);
    expect(res.body.report).toBeNull();
    expect(res.body.reportError).toMatch(/representante legal/i);
    await admin.orgReportPolicy.deleteMany({ where: { organizationId: owner.orgId } });
    const retry = await request(server)
      .post(`/org/accounting/periods/${PAST}/report`)
      .set(auth(owner))
      .expect(200);
    res.body.report = retry.body;
    expect(res.body.close).toMatchObject({
      period: PAST,
      entryCount: 2,
      lastSeq: 2,
      note: 'Cierre de prueba',
      reconciliation: { balanced: true },
    });
    expect(res.body.close.entriesHash).toMatch(/^[0-9a-f]{64}$/);
    expect(res.body.report).toMatchObject({ status: 'pending_signatures' });
    reportCode = res.body.report.code;
    signToken = lastLink(reviewerEmail, /\/firmar#token=([A-Za-z0-9_%-]+)/);
    const mail = notifications.sent.filter((m) => m.to === reviewerEmail).at(-1);
    expect(mail?.body).toContain('libro auxiliar de donaciones del mes');

    await request(server)
      .post(`/org/accounting/periods/${PAST}/close`)
      .set(auth(owner))
      .send({})
      .expect(409);

    const audit = await admin.auditLog.findFirst({
      where: { organizationId: owner.orgId, action: 'accounting.period_closed' },
    });
    expect(audit?.metadata).toMatchObject({ period: PAST, entryCount: 2 });
  });

  it('the ledger and the close are immutable, even for the superuser', async () => {
    await expect(
      admin.$executeRawUnsafe(
        `UPDATE accounting_entries SET gross_cop = 1 WHERE organization_id = $1::uuid`,
        owner.orgId,
      ),
    ).rejects.toThrow(/solo inserción/);
    await expect(
      admin.$executeRawUnsafe(
        `DELETE FROM accounting_entries WHERE organization_id = $1::uuid`,
        owner.orgId,
      ),
    ).rejects.toThrow(/solo inserción/);
    await expect(
      admin.$executeRawUnsafe(
        `UPDATE accounting_period_closes SET note = 'x' WHERE organization_id = $1::uuid`,
        owner.orgId,
      ),
    ).rejects.toThrow(/solo inserción/);
  });

  it('the reviewer downloads the month package, signs for the first time without an account, and the ledger is issued', async () => {
    const pkg = await binary(
      request(server)
        .post('/public/accounting/signature-package')
        .send({ token: signToken, format: 'xlsx' }),
    ).expect(200);
    expect((pkg.body as Buffer).subarray(0, 2).toString()).toBe('PK');

    const preview = await request(server)
      .post('/public/signature-requests/preview')
      .send({ token: signToken })
      .expect(200);
    expect(preview.body).toMatchObject({
      needsSignature: true,
      role: 'fiscal_reviewer',
      report: { kind: 'accounting', code: reportCode },
    });
    const pdf = await binary(
      request(server).post('/public/signature-requests/pdf').send({ token: signToken }),
    ).expect(200);
    expect((pdf.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');

    const done = await request(server)
      .post('/public/signature-requests/decision')
      .send({
        token: signToken,
        decision: 'approved',
        consent: true,
        documentNumber: '52.111.222',
        signature: {
          fullName: 'Rita Revisora',
          documentType: 'cedula_ciudadania',
          position: 'Revisora fiscal',
          signatureBase64: SIGNATURE_PNG,
          signatureContentType: 'image/png',
        },
      })
      .expect(200);
    expect(done.body).toMatchObject({ status: 'issued', code: reportCode });

    const verify = await request(server).get(`/public/reports/${reportCode}`).expect(200);
    expect(verify.body).toMatchObject({
      kind: 'accounting',
      status: 'issued',
      legalEffect: 'signed',
    });
    const view = await request(server)
      .get(`/org/accounting/periods/${PAST}`)
      .set(auth(owner))
      .expect(200);
    expect(view.body.report).toMatchObject({ code: reportCode, status: 'issued' });
  });

  it('a refund of a closed month enters as a dated adjustment; a chargeback subtracts', async () => {
    // Reembolso parcial fechado en el mes ya cerrado.
    mpPayment('70001', d1.collectionId, d1.amountCharged, {
      refunds: [{ id: 5001, amount: 10_000, status: 'approved', date_created: pastIso(5) }],
      transaction_amount_refunded: 10_000,
    });
    await notify(owner.orgId, '70001').expect(200);
    mpPayment('70002', d2.collectionId, d2.amountCharged, {
      date_approved: pastIso(2),
      status: 'charged_back',
    });
    await notify(owner.orgId, '70002').expect(200);

    const current = await request(server)
      .get(`/org/accounting/periods/${CURRENT}`)
      .set(auth(owner))
      .expect(200);
    const refund = current.body.entries.find(
      (e: { entryType: string }) => e.entryType === 'refund',
    );
    expect(refund).toMatchObject({
      grossCop: -10_000,
      isAdjustment: true,
      eventPeriod: PAST,
      period: CURRENT,
      donationId: d1.id,
    });
    const chargeback = current.body.entries.find(
      (e: { entryType: string }) => e.entryType === 'chargeback',
    );
    // El contracargo se conoce hoy: es un hecho del mes en curso, no un ajuste.
    expect(chargeback).toMatchObject({
      grossCop: -d2.amountCharged,
      isAdjustment: false,
      eventPeriod: CURRENT,
    });
    expect(current.body.totals.adjustmentCount).toBe(1);

    // El mes cerrado no cambió.
    const past = await request(server)
      .get(`/org/accounting/periods/${PAST}`)
      .set(auth(owner))
      .expect(200);
    expect(past.body.entries).toHaveLength(2);
    expect(past.body.totals.balanceCop).toBe(d1.amountCharged + d2.amountCharged);
    // Reprocesar la misma notificación no duplica el reverso.
    await notify(owner.orgId, '70001').expect(200);
    const again = await request(server)
      .get(`/org/accounting/periods/${CURRENT}`)
      .set(auth(owner))
      .expect(200);
    expect(
      again.body.entries.filter((e: { entryType: string }) => e.entryType === 'refund'),
    ).toHaveLength(1);
  });

  let shareToken = '';
  let shareId = '';

  it('the organization shares the month with the reviewer: no account, full export, revocable', async () => {
    await onPlan('crece');
    const shared = await request(server)
      .post(`/org/accounting/periods/${PAST}/shares`)
      .set(auth(owner))
      .send({ signerRole: 'fiscal_reviewer' })
      .expect(201);
    shareId = shared.body.id;
    expect(shared.body).toMatchObject({
      signerRole: 'fiscal_reviewer',
      signerName: 'Rita Revisora',
    });
    shareToken = lastLink(reviewerEmail, /\/contabilidad-compartida#token=([A-Za-z0-9_%-]+)/);
    // Solo la huella queda en la base.
    const row = await admin.accountingShare.findUniqueOrThrow({ where: { id: shareId } });
    expect(row.tokenHash).not.toContain(shareToken);

    const preview = await request(server)
      .post('/public/accounting/shares/preview')
      .send({ token: shareToken })
      .expect(200);
    expect(preview.body).toMatchObject({
      organizationName: 'Refugio Contable',
      nit: '900123456-7',
      period: PAST,
      status: 'closed',
      signerRole: 'fiscal_reviewer',
      report: { code: reportCode, status: 'issued' },
      reconciliation: { balanced: expect.any(Boolean) },
    });
    expect(preview.body.entries).toHaveLength(2);

    const csv = await binary(
      request(server)
        .post('/public/accounting/shares/export')
        .send({ token: shareToken, format: 'csv' }),
    ).expect(200);
    const text = (csv.body as Buffer).toString('utf8');
    expect(text).toContain('Comisión pasarela (COP)');
    expect(text).toContain('Donante (sin autorización para identificarlo)');
    expect(text).not.toContain('Donante Prueba');

    const views = await admin.auditLog.count({
      where: {
        organizationId: owner.orgId,
        action: { in: ['accounting.share_viewed', 'accounting.share_downloaded'] },
      },
    });
    expect(views).toBe(2);

    // Otra organización no puede revocarlo; la dueña sí, y el enlace muere.
    await request(server).delete(`/org/accounting/shares/${shareId}`).set(auth(other)).expect(404);
    await request(server).delete(`/org/accounting/shares/${shareId}`).set(auth(owner)).expect(204);
    await request(server)
      .post('/public/accounting/shares/preview')
      .send({ token: shareToken })
      .expect(400);
    await request(server)
      .post('/public/accounting/shares/preview')
      .send({ token: 'x'.repeat(43) })
      .expect(400);
  });

  it('if the plan lapses, a shared link stops working', async () => {
    await onPlan('crece');
    await request(server)
      .post(`/org/accounting/periods/${PAST}/shares`)
      .set(auth(owner))
      .send({ signerRole: 'fiscal_reviewer' })
      .expect(201);
    const token = lastLink(reviewerEmail, /\/contabilidad-compartida#token=([A-Za-z0-9_%-]+)/);
    await request(server).post('/public/accounting/shares/preview').send({ token }).expect(200);
    await onPlan('free');
    await request(server).post('/public/accounting/shares/preview').send({ token }).expect(400);
  });

  it('another organization sees nothing (HTTP and RLS)', async () => {
    const view = await request(server)
      .get(`/org/accounting/periods/${PAST}`)
      .set(auth(other))
      .expect(200);
    expect(view.body.entries).toHaveLength(0);
    expect(view.body.status).toBe('open');
    const leaked = await withOrgContext(appDb, other.orgId, (tx) =>
      Promise.all([
        tx.accountingEntry.count({ where: { organizationId: owner.orgId } }),
        tx.accountingPeriodClose.count({ where: { organizationId: owner.orgId } }),
        tx.accountingShare.count({ where: { organizationId: owner.orgId } }),
      ]),
    );
    expect(leaked).toEqual([0, 0, 0]);
    // Sin contexto de organización tampoco se ve nada.
    expect(await appDb.accountingEntry.count()).toBe(0);
  });

  it('roles: only management closes, rereads or shares; nobody without a session', async () => {
    await request(server).get('/org/accounting').expect(401);
    await request(server).post(`/org/accounting/periods/${PAST}/reread`).expect(401);
    await request(server).get('/org/accounting/periods/2026-13').set(auth(owner)).expect(400);
    await request(server).get('/org/accounting/periods/2999-01').set(auth(owner)).expect(400);
  });
});
