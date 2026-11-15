import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma, PrismaClient } from '@prisma/client';
import request from 'supertest';
import type { NationalTransparency } from '@adoptafacil/contracts';
import { AppModule } from '../src/app.module';
import { NationalTransparencyService } from '../src/modules/ledger/national-transparency.service';
import { purgeOrganizations } from './support/cleanup';
import { LEGAL_ORG } from './support/legal';
import { approveTestOrganization, formalizeTestOrganization } from './support/organization-status';

/**
 * Transparencia Nacional (punto 22): el consolidado de los libros públicos.
 * - suma solo organizaciones APROBADAS (una suspendida deja de contar);
 * - los anulados no suman;
 * - sin sesión y sin datos personales: ni conceptos, ni contrapartes, ni ids;
 * - la función es SECURITY DEFINER, con search_path fijo y no ejecutable por PUBLIC.
 */
describe('National transparency (consolidado público, sin datos personales)', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  let national: NationalTransparencyService;
  const admin = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  const orgIds: string[] = [];
  const today = new Date(Date.now() - 5 * 3600_000).toISOString().slice(0, 10);

  interface Actor {
    token: string;
    orgId: string;
  }
  let orgA: Actor;
  let orgC: Actor;

  async function registerOrg(name: string): Promise<Actor> {
    const res = await request(server)
      .post('/auth/register/organization')
      .send({
        ...LEGAL_ORG,
        organizationName: name,
        displayName: `Owner ${name}`,
        email: `national-${randomUUID()}@test.local`,
        password: 'password-1234',
      })
      .expect(201);
    orgIds.push(res.body.user.organizationId);
    await approveTestOrganization(admin, res.body.user.organizationId);
    await formalizeTestOrganization(admin, res.body.user.organizationId);
    return { token: res.body.tokens.accessToken, orgId: res.body.user.organizationId };
  }

  const create = (actor: Actor, body: Record<string, unknown>) =>
    request(server).post('/org/ledger').set('Authorization', `Bearer ${actor.token}`).send(body);

  /** Sin la caché de un minuto: cada lectura de la prueba recalcula. */
  const fresh = (): Promise<NationalTransparency> => national.get(Date.now() + 10 * 60_000);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    server = app.getHttpServer();
    national = app.get(NationalTransparencyService);
    orgA = await registerOrg('Fundación Nacional A');
    orgC = await registerOrg('Refugio Que Será Suspendido');
  });

  afterAll(async () => {
    await purgeOrganizations(admin, orgIds);
    await app.close();
    await admin.$disconnect();
  });

  it('sums only approved organizations and only current movements', async () => {
    const before = await fresh();

    await create(orgA, {
      kind: 'income',
      category: 'donacion_dinero',
      occurredOn: today,
      amountCop: 700000,
      concept: 'Bazar nacional de prueba',
    }).expect(201);
    await create(orgA, {
      kind: 'expense',
      category: 'veterinaria',
      occurredOn: today,
      amountCop: 250000,
      concept: 'Cirugía de prueba',
      counterparty: 'Clínica Privada Confidencial',
    }).expect(201);
    const voided = await create(orgA, {
      kind: 'expense',
      category: 'alimento',
      occurredOn: today,
      amountCop: 90000,
      concept: 'Registro duplicado',
    }).expect(201);
    await request(server)
      .post(`/org/ledger/${voided.body.id}/void`)
      .set('Authorization', `Bearer ${orgA.token}`)
      .send({ reason: 'Se registró dos veces el mismo gasto' })
      .expect(200);
    await create(orgC, {
      kind: 'income',
      category: 'evento',
      occurredOn: today,
      amountCop: 333000,
      concept: 'No debe sumar',
    }).expect(201);
    await admin.organization.update({ where: { id: orgC.orgId }, data: { status: 'suspended' } });

    const after = await fresh();
    expect(after.totals.incomeCop - before.totals.incomeCop).toBe(700000);
    expect(after.totals.expenseCop - before.totals.expenseCop).toBe(250000);
    expect(after.totals.movementCount - before.totals.movementCount).toBe(2);
    expect(after.thisMonth.incomeCop - before.thisMonth.incomeCop).toBe(700000);
    expect(after.organizations.reporting - before.organizations.reporting).toBe(1);
    // Las dos estaban aprobadas al empezar; la suspendida deja de contar.
    expect(after.organizations.approved - before.organizations.approved).toBe(-1);
    expect(after.months).toHaveLength(12);
    expect(after.months[11].month).toBe(after.thisMonth.month);
    const vet = (r: NationalTransparency) =>
      r.categories.find((c) => c.kind === 'expense' && c.category === 'veterinaria')?.amountCop ??
      0;
    expect(vet(after) - vet(before)).toBe(250000);
  });

  it('is public and carries no personal or row-level data', async () => {
    const res = await request(server).get('/public/transparency/national').expect(200);
    const text = JSON.stringify(res.body);
    for (const secret of [
      'Bazar nacional de prueba',
      'Clínica Privada Confidencial',
      'Registro duplicado',
      orgA.orgId,
      orgC.orgId,
    ]) {
      expect(text).not.toContain(secret);
    }
    expect(Object.keys(res.body).sort()).toEqual(
      [
        'animals',
        'categories',
        'departments',
        'donationDestinations',
        'generatedAt',
        'months',
        'organizations',
        'thisMonth',
        'totals',
      ].sort(),
    );
  });

  it('no-leak: the function is SECURITY DEFINER with a fixed search_path and not executable by PUBLIC', async () => {
    const rows = await admin.$queryRaw<
      { prosecdef: boolean; proconfig: string[] | null; public_exec: boolean }[]
    >(Prisma.sql`
      SELECT p.prosecdef, p.proconfig,
             has_function_privilege('public', p.oid, 'EXECUTE') AS public_exec
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'public_national_transparency'
    `);
    expect(rows).toHaveLength(1);
    expect(rows[0].prosecdef).toBe(true);
    expect(rows[0].proconfig).toEqual(['search_path=public, pg_temp']);
    expect(rows[0].public_exec).toBe(false);
  });
});
