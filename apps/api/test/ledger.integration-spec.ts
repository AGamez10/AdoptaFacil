import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma, PrismaClient } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { purgeOrganizations } from './support/cleanup';
import { completeTestProfile } from './support/profile';
import { LEGAL_ORG, LEGAL_PERSON } from './support/legal';
import { approveTestOrganization } from './support/organization-status';

/**
 * RF14 · Libro público (extremo a extremo):
 * - la organización registra ingresos/gastos (JSON y multipart con soporte);
 * - idempotencia: el mismo `clientRequestId` devuelve el MISMO movimiento;
 * - inmutable: se anula con motivo (una sola vez) y sigue visible como anulado;
 *   ni la app ni un UPDATE directo pueden cambiar el contenido;
 * - las donaciones aprobadas por la pasarela entran solas, sin donante;
 * - el público solo ve columnas públicas (sin soporte, sin quién registró);
 * - aislamiento: la Org B no ve, anula ni descarga nada de la Org A (no-leak);
 * - RBAC: un voluntario no registra.
 */
describe('Public ledger (RF14: libro público, idempotencia, inmutabilidad, no-leak)', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  const admin = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  const appDb = new PrismaClient({
    datasources: {
      db: {
        url:
          process.env.DATABASE_URL_APP ??
          'postgresql://adoptafacil_app:adoptafacil_app@localhost:5433/adoptafacil?schema=public',
      },
    },
  });
  const orgIds: string[] = [];
  const password = 'password-1234';

  interface Actor {
    token: string;
    userId: string;
    orgId: string;
  }
  let orgA: Actor;
  let orgB: Actor;
  let slugA: string;
  const today = new Date(Date.now() - 5 * 3600_000).toISOString().slice(0, 10);
  const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');

  async function registerOrg(name: string): Promise<Actor> {
    const res = await request(server)
      .post('/auth/register/organization')
      .send({
        ...LEGAL_ORG,
        organizationName: name,
        displayName: `Owner ${name}`,
        email: `ledger-${randomUUID()}@test.local`,
        password,
      })
      .expect(201);
    orgIds.push(res.body.user.organizationId);
    await approveTestOrganization(admin, res.body.user.organizationId);
    return {
      token: res.body.tokens.accessToken,
      userId: res.body.user.id,
      orgId: res.body.user.organizationId,
    };
  }

  const create = (actor: Actor, body: Record<string, unknown>) =>
    request(server).post('/org/ledger').set('Authorization', `Bearer ${actor.token}`).send(body);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    server = app.getHttpServer();

    orgA = await registerOrg('Fundación Libro Abierto');
    orgB = await registerOrg('Refugio Vecino');
    slugA = `libro-${randomUUID().slice(0, 8)}`;
    await request(server)
      .put('/org/profile')
      .set('Authorization', `Bearer ${orgA.token}`)
      .send({ slug: slugA })
      .expect(200);
  });

  afterAll(async () => {
    await purgeOrganizations(admin, orgIds);
    await app.close();
    await admin.$disconnect();
    await appDb.$disconnect();
  });

  it('registers an expense with a private support and an income without donor', async () => {
    const expense = await request(server)
      .post('/org/ledger')
      .set('Authorization', `Bearer ${orgA.token}`)
      .field('kind', 'expense')
      .field('category', 'veterinaria')
      .field('occurredOn', today)
      .field('amountCop', '185000')
      .field('concept', 'Esterilización de Luna')
      .field('counterparty', 'Clínica Veterinaria San Roque')
      .attach('support', PDF, { filename: 'factura.pdf', contentType: 'application/pdf' })
      .expect(201);
    expect(expense.body).toMatchObject({
      source: 'manual',
      kind: 'expense',
      amountCop: 185000,
      hasSupport: true,
      counterparty: 'Clínica Veterinaria San Roque',
    });

    await create(orgA, {
      kind: 'income',
      category: 'donacion_dinero',
      occurredOn: today,
      amountCop: 500000,
      concept: 'Donaciones por transferencia de la semana',
    }).expect(201);

    // Habeas Data: un ingreso nunca lleva el nombre de quien donó.
    const withDonor = await create(orgA, {
      kind: 'income',
      category: 'donacion_dinero',
      occurredOn: today,
      amountCop: 10000,
      concept: 'Donación',
      counterparty: 'Pedro Pérez',
    }).expect(400);
    expect(JSON.stringify(withDonor.body.message)).toContain('no se publica');

    // El soporte se descarga solo con sesión de la propia organización.
    const file = await request(server)
      .get(`/org/ledger/${expense.body.id}/support`)
      .set('Authorization', `Bearer ${orgA.token}`)
      .expect(200);
    expect(Buffer.from(file.body).toString('ascii', 0, 5)).toBe('%PDF-');
  });

  it('rejects a future date, a wrong category and a fake support file', async () => {
    const tomorrow = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
    await create(orgA, {
      kind: 'expense',
      category: 'alimento',
      occurredOn: tomorrow,
      amountCop: 1000,
      concept: 'Concentrado',
    }).expect(400);
    await create(orgA, {
      kind: 'income',
      category: 'alimento',
      occurredOn: today,
      amountCop: 1000,
      concept: 'Concentrado',
    }).expect(400);
    await request(server)
      .post('/org/ledger')
      .set('Authorization', `Bearer ${orgA.token}`)
      .field('kind', 'expense')
      .field('category', 'alimento')
      .field('occurredOn', today)
      .field('amountCop', '1000')
      .field('concept', 'Concentrado')
      .attach('support', Buffer.from('<script>alert(1)</script>'), {
        filename: 'factura.pdf',
        contentType: 'application/pdf',
      })
      .expect(400);
  });

  it('is idempotent: the same clientRequestId returns the same entry', async () => {
    const body = {
      kind: 'expense',
      category: 'alimento',
      occurredOn: today,
      amountCop: 98000,
      concept: 'Bulto de concentrado',
      clientRequestId: randomUUID(),
    };
    const [a, b] = await Promise.all([create(orgA, body), create(orgA, body)]);
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect(a.body.id).toBe(b.body.id);
    const count = await admin.ledgerEntry.count({
      where: { organizationId: orgA.orgId, clientRequestId: body.clientRequestId },
    });
    expect(count).toBe(1);
  });

  it('voids once with a reason, keeps it public as voided and out of the totals', async () => {
    const entry = await create(orgA, {
      kind: 'expense',
      category: 'transporte',
      occurredOn: today,
      amountCop: 777000,
      concept: 'Valor digitado mal',
    }).expect(201);

    await request(server)
      .post(`/org/ledger/${entry.body.id}/void`)
      .set('Authorization', `Bearer ${orgA.token}`)
      .send({ reason: 'corto' })
      .expect(400);
    const voided = await request(server)
      .post(`/org/ledger/${entry.body.id}/void`)
      .set('Authorization', `Bearer ${orgA.token}`)
      .send({ reason: 'Se digitó 777.000 en vez de 77.000' })
      .expect(200);
    expect(voided.body.voidedAt).toBeDefined();
    await request(server)
      .post(`/org/ledger/${entry.body.id}/void`)
      .set('Authorization', `Bearer ${orgA.token}`)
      .send({ reason: 'Otra vez la misma anulación' })
      .expect(409);

    const pub = await request(server).get(`/public/organizations/${slugA}/ledger`).expect(200);
    const row = pub.body.items.find((i: { id: string }) => i.id === entry.body.id);
    expect(row).toMatchObject({ voided: true, voidReason: 'Se digitó 777.000 en vez de 77.000' });
    expect(pub.body.totals.expenseCop).toBe(185000 + 98000);
  });

  it('no-leak: the database refuses to edit or delete a movement, even for the app role', async () => {
    const entry = await admin.ledgerEntry.findFirstOrThrow({
      where: { organizationId: orgA.orgId, voidedAt: null },
    });
    await expect(
      appDb.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.current_org_id', ${orgA.orgId}, true)`;
        await tx.$executeRaw(
          Prisma.sql`UPDATE ledger_entries SET amount_cop = 1 WHERE id = ${entry.id}::uuid`,
        );
      }),
    ).rejects.toThrow();
    await expect(
      admin.$executeRaw(Prisma.sql`DELETE FROM ledger_entries WHERE id = ${entry.id}::uuid`),
    ).rejects.toThrow();
  });

  it('includes approved online donations automatically, without the donor', async () => {
    const donorReg = await request(server)
      .post('/auth/register/person')
      .send({
        ...LEGAL_PERSON,
        displayName: 'Donante Real',
        email: `ledger-donor-${randomUUID()}@test.local`,
        password,
      })
      .expect(201);
    orgIds.push(donorReg.body.user.organizationId);
    await completeTestProfile(admin, donorReg.body.user.id);
    const donation = await request(server)
      .post('/donations')
      .set('Authorization', `Bearer ${donorReg.body.tokens.accessToken}`)
      .send({
        organizationId: orgA.orgId,
        intendedAmount: 50000,
        commissionPayer: 'organization',
        idempotencyKey: `ledger-${randomUUID()}`,
        payer: { fullName: 'Donante Real', documentId: '1020304050' },
      })
      .expect(201);
    const webhook = {
      collectionId: donation.body.collectionId,
      status: 'approved',
      eventId: `evt-${randomUUID()}`,
    };
    await request(server).post('/donations/webhook').set('x-signature', 'fake-sig').send(webhook);
    // Un webhook repetido no duplica nada en el libro.
    await request(server).post('/donations/webhook').set('x-signature', 'fake-sig').send(webhook);

    const pub = await request(server).get(`/public/organizations/${slugA}/ledger`).expect(200);
    const online = pub.body.items.filter((i: { source: string }) => i.source === 'online_donation');
    expect(online).toHaveLength(1);
    expect(online[0]).toMatchObject({ kind: 'income', amountCop: 50000, voided: false });
    expect(JSON.stringify(pub.body)).not.toContain('Donante Real');
    expect(pub.body.totals.incomeCop).toBe(500000 + 50000);

    // La organización también la ve, sin poder anularla.
    const mine = await request(server)
      .get('/org/ledger')
      .set('Authorization', `Bearer ${orgA.token}`)
      .expect(200);
    const onlineMine = mine.body.items.find(
      (i: { source: string }) => i.source === 'online_donation',
    );
    await request(server)
      .post(`/org/ledger/${onlineMine.id}/void`)
      .set('Authorization', `Bearer ${orgA.token}`)
      .send({ reason: 'Intento de anular una donación en línea' })
      .expect(400);
  });

  it('public view exposes only public fields', async () => {
    const pub = await request(server).get(`/public/organizations/${slugA}/ledger`).expect(200);
    const text = JSON.stringify(pub.body);
    expect(text).not.toContain('factura.pdf');
    expect(text).not.toContain(orgA.userId);
    expect(text).not.toContain('storage');
    await request(server).get('/public/organizations/no-existe-esta-org/ledger').expect(404);
  });

  it('no-leak: Org B cannot see, void or download anything from Org A', async () => {
    const mineA = await request(server)
      .get('/org/ledger')
      .set('Authorization', `Bearer ${orgA.token}`)
      .expect(200);
    const target = mineA.body.items.find(
      (i: { hasSupport: boolean; source: string }) => i.hasSupport && i.source === 'manual',
    );

    const mineB = await request(server)
      .get('/org/ledger')
      .set('Authorization', `Bearer ${orgB.token}`)
      .expect(200);
    expect(mineB.body.items).toHaveLength(0);
    await request(server)
      .post(`/org/ledger/${target.id}/void`)
      .set('Authorization', `Bearer ${orgB.token}`)
      .send({ reason: 'Intento de otra organización' })
      .expect(404);
    await request(server)
      .get(`/org/ledger/${target.id}/support`)
      .set('Authorization', `Bearer ${orgB.token}`)
      .expect(404);
  });

  it('RBAC: a volunteer cannot register movements', async () => {
    await admin.userRole.updateMany({
      where: { userId: orgB.userId },
      data: { role: 'volunteer' },
    });
    await create(orgB, {
      kind: 'expense',
      category: 'alimento',
      occurredOn: today,
      amountCop: 1000,
      concept: 'Concentrado',
    }).expect(403);
  });
});
