import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { PDFDocument } from 'pdf-lib';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PlansService } from '../src/core/plans/plans.service';
import { OrgExportsService } from '../src/modules/org-exports/org-exports.service';
import { purgeOrganizations } from './support/cleanup';
import { completeTestProfile } from './support/profile';
import { LEGAL_ORG, LEGAL_PERSON } from './support/legal';
import { memberWithRole } from './support/signers';

/**
 * Reporte de impacto en PDF (`GET /org/exports/impact-report.pdf`):
 * - cifras correctas y solo del período (lo de fuera no cuenta);
 * - no-leak: las cifras de la Org A nunca suman nada de la Org B;
 * - solo agregados: ningún campo con nombre, contacto o documento de personas;
 * - RBAC deny-by-default, período validado y plan (Gratis 403 PLAN_REQUIRED).
 */
describe('Org impact report (impactReport: cifras agregadas, período, plan, no-leak)', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  let plans: PlansService;
  let exports: OrgExportsService;
  const admin = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  const orgIds: string[] = [];
  const password = 'password-1234';

  interface Actor {
    token: string;
    userId: string;
    orgId: string;
  }
  let orgA: Actor;
  let orgB: Actor;
  let person: Actor;

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const setEnforced = (value: boolean) =>
    Object.defineProperty(plans, 'enforced', { value, configurable: true });
  const colombiaDay = (msAgo: number) =>
    new Date(Date.now() - 5 * 3600_000 - msAgo).toISOString().slice(0, 10);
  const today = colombiaDay(0);
  const monthAgo = colombiaDay(30 * 86_400_000);
  const DAY = 86_400_000;

  async function registerOrg(name: string): Promise<Actor> {
    const res = await request(server)
      .post('/auth/register/organization')
      .send({
        ...LEGAL_ORG,
        organizationName: name,
        displayName: `Owner ${name}`,
        email: `impact-${randomUUID()}@test.local`,
        password,
      })
      .expect(201);
    orgIds.push(res.body.user.organizationId);
    return {
      token: res.body.tokens.accessToken,
      userId: res.body.user.id,
      orgId: res.body.user.organizationId,
    };
  }

  async function animal(actor: Actor, name: string): Promise<string> {
    const res = await request(server)
      .post('/animals')
      .set(auth(actor.token))
      .send({ approximateAgeMonths: 12, name, species: 'dog', sex: 'female', size: 'small' })
      .expect(201);
    return res.body.id as string;
  }

  async function donate(to: Actor, amount: number): Promise<void> {
    const res = await request(server)
      .post('/donations')
      .set(auth(person.token))
      .send({
        organizationId: to.orgId,
        intendedAmount: amount,
        commissionPayer: 'donor',
        idempotencyKey: `imp-${randomUUID()}`,
        payer: { fullName: 'Donante Privada', documentId: '1020304050' },
      })
      .expect(201);
    await request(server)
      .post('/donations/webhook')
      .set('x-signature', 'fake-sig')
      .send({
        collectionId: res.body.collectionId,
        status: 'approved',
        eventId: `evt-${randomUUID()}`,
      })
      .expect(200);
  }

  async function clinical(orgId: string, animalId: string, type: string, occurredAt: Date) {
    const eventId = randomUUID();
    // Dos versiones del mismo evento: cuenta UNA atención.
    for (const version of [1, 2]) {
      await admin.clinicalEvent.create({
        data: {
          eventId,
          organizationId: orgId,
          animalId,
          type,
          occurredAt,
          version,
          authorUserId: randomUUID(),
        },
      });
    }
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    server = app.getHttpServer();
    plans = app.get(PlansService);
    exports = app.get(OrgExportsService);

    orgA = await registerOrg('Refugio Impacto A');
    orgB = await registerOrg('Refugio Impacto B');
    const personReg = await request(server)
      .post('/auth/register/person')
      .send({
        ...LEGAL_PERSON,
        displayName: 'Persona Impacto',
        email: `impact-p-${randomUUID()}@test.local`,
        password,
      })
      .expect(201);
    person = {
      token: personReg.body.tokens.accessToken,
      userId: personReg.body.user.id,
      orgId: personReg.body.user.organizationId,
    };
    orgIds.push(person.orgId);
    await completeTestProfile(admin, person.userId);

    const luna = await animal(orgA, 'Luna');
    await animal(orgA, 'Toby');
    const old = await animal(orgA, 'Viejito');
    // Registrado hace dos meses: fuera del período del último mes.
    await admin.animal.update({
      where: { id: old },
      data: { createdAt: new Date(Date.now() - 60 * DAY) },
    });
    const bAnimal = await animal(orgB, 'Solo De B');

    await clinical(orgA.orgId, luna, 'vaccine', new Date(Date.now() - 3 * DAY));
    await clinical(orgA.orgId, luna, 'sterilization', new Date(Date.now() - 4 * DAY));
    await clinical(orgA.orgId, luna, 'vaccine', new Date(Date.now() - 90 * DAY)); // fuera
    await clinical(orgB.orgId, bAnimal, 'vaccine', new Date(Date.now() - 3 * DAY));

    await donate(orgA, 100_000);
    await donate(orgA, 20_000);
    await donate(orgB, 999_000);

    const opportunity = await admin.volunteerOpportunity.create({
      data: {
        organizationId: orgA.orgId,
        title: 'Paseos',
        category: 'cuidado',
        startDate: new Date(Date.now() - 60 * DAY),
        endDate: new Date(Date.now() + 60 * DAY),
        location: 'Bogotá',
      },
    });
    const enrollment = await admin.volunteerEnrollment.create({
      data: {
        organizationId: orgA.orgId,
        opportunityId: opportunity.id,
        volunteerUserId: person.userId,
        volunteerName: 'Voluntaria Privada',
        volunteerEmail: 'voluntaria@test.local',
        appliesToStudentService: false,
        status: 'accepted',
      },
    });
    await admin.serviceHours.createMany({
      data: [
        { hours: 6, status: 'approved', date: new Date(Date.now() - 2 * DAY) },
        { hours: 2.5, status: 'approved', date: new Date(Date.now() - 5 * DAY) },
        { hours: 4, status: 'pending', date: new Date(Date.now() - 5 * DAY) },
      ].map((h) => ({
        organizationId: orgA.orgId,
        enrollmentId: enrollment.id,
        volunteerUserId: person.userId,
        description: 'Sesión',
        ...h,
      })),
    });

    await admin.campaign.create({
      data: {
        organizationId: orgA.orgId,
        title: 'Cirugía de Luna',
        category: 'surgeries',
        goalAmount: 500_000,
        raisedAmount: 120_000,
        deadline: new Date(Date.now() + 20 * DAY),
      },
    });
  });

  afterAll(async () => {
    setEnforced(false);
    await purgeOrganizations(admin, orgIds);
    await admin.$disconnect();
    await app.close();
  });

  it('cuenta solo lo de la organización y lo del período', async () => {
    const data = await exports.collectImpact(orgA.orgId, monthAgo, today);
    expect(data.organization.name).toBe('Refugio Impacto A');
    expect(data.animalsRegistered).toBe(2);
    expect(data.care).toEqual({ vaccines: 1, sterilizations: 1, surgeries: 0, treatments: 0 });
    // El donante cubrió la comisión: llega completo a la organización.
    expect(data.donations).toEqual({ count: 2, netTotal: 120_000, donors: 1 });
    expect(data.volunteerHours).toBe(8.5);
    expect(data.volunteers).toBe(1);
    expect(data.campaigns.map((c) => c.title)).toEqual(['Cirugía de Luna']);
    expect(data.animalsToday.available).toBe(3);
  });

  it('no-leak: la Org B ve solo sus cifras', async () => {
    const data = await exports.collectImpact(orgB.orgId, monthAgo, today);
    expect(data.animalsRegistered).toBe(1);
    expect(data.donations).toEqual({ count: 1, netTotal: 999_000, donors: 1 });
    expect(data.volunteerHours).toBe(0);
    expect(data.campaigns).toEqual([]);
  });

  it('solo agregados: ningún dato de personas viaja al documento', async () => {
    const text = JSON.stringify(await exports.collectImpact(orgA.orgId, monthAgo, today));
    for (const personal of [
      'Donante Privada',
      '1020304050',
      'Voluntaria Privada',
      'voluntaria@test.local',
      person.userId,
    ]) {
      expect(text).not.toContain(personal);
    }
  });

  it('el dueño descarga el PDF; el período se valida', async () => {
    const res = await request(server)
      .get(`/org/exports/impact-report.pdf?start=${monthAgo}&end=${today}`)
      .set(auth(orgA.token))
      .buffer(true)
      .parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on('data', (c: Buffer) => chunks.push(c));
        r.on('end', () => cb(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    expect(res.headers['cache-control']).toBe('private, no-store');
    const pdf = await PDFDocument.load(res.body as Buffer);
    expect(pdf.getTitle()).toBe('Reporte de impacto · Refugio Impacto A');

    const base = '/org/exports/impact-report.pdf';
    await request(server).get(base).set(auth(orgA.token)).expect(400);
    await request(server)
      .get(`${base}?start=2026-02-30&end=${today}`)
      .set(auth(orgA.token))
      .expect(400);
    await request(server)
      .get(`${base}?start=2020-01-01&end=${today}`)
      .set(auth(orgA.token))
      .expect(400);
    await request(server)
      .get(`${base}?start=${today}&end=${monthAgo}`)
      .set(auth(orgA.token))
      .expect(400);

    const events = await admin.auditLog.findMany({
      where: { organizationId: orgA.orgId, action: 'organization.impact_report_generated' },
    });
    expect(events).toHaveLength(1);
    expect(events[0].metadata).toEqual({ periodStart: monthAgo, periodEnd: today });
  });

  it('RBAC: Operator, Volunteer y una persona reciben 403', async () => {
    const url = `/org/exports/impact-report.pdf?start=${monthAgo}&end=${today}`;
    for (const role of ['operator', 'volunteer']) {
      const member = await memberWithRole(app, admin, orgA.orgId, role);
      await request(server).get(url).set(auth(member.token)).expect(403);
    }
    await request(server).get(url).set(auth(person.token)).expect(403);
  });

  it('plan: con los planes encendidos, Gratis recibe PLAN_REQUIRED', async () => {
    setEnforced(true);
    try {
      const res = await request(server)
        .get(`/org/exports/impact-report.pdf?start=${monthAgo}&end=${today}`)
        .set(auth(orgB.token))
        .expect(403);
      expect(res.body).toMatchObject({
        code: 'PLAN_REQUIRED',
        capability: 'impactReport',
        requiredPlan: 'crece',
      });
    } finally {
      setEnforced(false);
    }
  });
});
