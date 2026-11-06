import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import * as ExcelJS from 'exceljs';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PlansService } from '../src/core/plans/plans.service';
import { purgeOrganizations } from './support/cleanup';
import { completeTestProfile } from './support/profile';
import { LEGAL_ORG, LEGAL_PERSON } from './support/legal';
import { memberWithRole } from './support/signers';

/**
 * Exportación de datos de la organización a Excel (`GET /org/exports/data.xlsx`):
 * - no-leak: la Org B nunca ve una fila de la Org A;
 * - minimización: el archivo no lleva el contacto del adoptante ni del donante;
 * - RBAC deny-by-default: Operator y Volunteer reciben 403;
 * - plan: con los planes encendidos, Gratis recibe 403 PLAN_REQUIRED y Crece descarga;
 * - bitácora: cada descarga deja un evento con conteos, sin datos personales.
 */
describe('Org data export (dataExport: xlsx, minimización, plan, no-leak)', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  let plans: PlansService;
  const admin = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  const orgIds: string[] = [];
  const password = 'password-1234';
  const ADOPTER_EMAIL = `adoptante-${randomUUID()}@test.local`;
  const ADOPTER_PHONE = '3001234567';
  const DONOR_NAME = 'Donante Con Nombre Propio';

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

  async function registerOrg(name: string): Promise<Actor> {
    const res = await request(server)
      .post('/auth/register/organization')
      .send({
        ...LEGAL_ORG,
        organizationName: name,
        displayName: `Owner ${name}`,
        email: `export-${randomUUID()}@test.local`,
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

  const download = (actor: Actor) =>
    request(server)
      .get('/org/exports/data.xlsx')
      .set(auth(actor.token))
      .buffer(true)
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      });

  async function workbook(body: Buffer): Promise<ExcelJS.Workbook> {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(body as unknown as ArrayBuffer);
    return wb;
  }

  function allText(wb: ExcelJS.Workbook): string {
    const parts: string[] = [];
    wb.eachSheet((sheet) =>
      sheet.eachRow((row) =>
        row.eachCell((cell) => {
          parts.push(String(cell.value ?? ''));
        }),
      ),
    );
    return parts.join('\n');
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    server = app.getHttpServer();
    plans = app.get(PlansService);

    orgA = await registerOrg('Refugio Exporta A');
    orgB = await registerOrg('Refugio Exporta B');

    const personReg = await request(server)
      .post('/auth/register/person')
      .send({
        ...LEGAL_PERSON,
        displayName: 'Persona Exporta',
        email: `export-p-${randomUUID()}@test.local`,
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

    const animal = await request(server)
      .post('/animals')
      .set(auth(orgA.token))
      .send({
        approximateAgeMonths: 12,
        name: 'Firulais Exportado',
        species: 'dog',
        sex: 'male',
        size: 'medium',
      })
      .expect(201);
    await request(server)
      .post('/animals')
      .set(auth(orgB.token))
      .send({
        approximateAgeMonths: 12,
        name: 'Solo De B',
        species: 'cat',
        sex: 'female',
        size: 'small',
      })
      .expect(201);

    await request(server)
      .post('/adoptions')
      .set(auth(person.token))
      .send({
        animalId: animal.body.id,
        organizationId: orgA.orgId,
        animalSnapshot: { animalId: animal.body.id, name: 'Firulais Exportado', species: 'dog' },
        applicant: { fullName: 'Adoptante Privado', email: ADOPTER_EMAIL, phone: ADOPTER_PHONE },
        message: 'Tengo patio, tiempo y experiencia con perros rescatados; quiero darle un hogar.',
      })
      .expect(201);

    const donation = await request(server)
      .post('/donations')
      .set(auth(person.token))
      .send({
        organizationId: orgA.orgId,
        intendedAmount: 50_000,
        commissionPayer: 'organization',
        idempotencyKey: `exp-${randomUUID()}`,
        payer: { fullName: DONOR_NAME, documentId: '1020304050' },
      })
      .expect(201);
    await request(server)
      .post('/donations/webhook')
      .set('x-signature', 'fake-sig')
      .send({
        collectionId: donation.body.collectionId,
        status: 'approved',
        eventId: `evt-${randomUUID()}`,
      })
      .expect(200);
  });

  afterAll(async () => {
    setEnforced(false);
    await purgeOrganizations(admin, orgIds);
    await admin.$disconnect();
    await app.close();
  });

  it('el dueño descarga sus datos en Excel, con encabezados que no permiten cachear', async () => {
    const res = await download(orgA).expect(200);
    expect(res.headers['content-type']).toContain('spreadsheetml');
    expect(res.headers['cache-control']).toBe('private, no-store');
    expect(res.headers['content-disposition']).toMatch(
      /^attachment; filename="adoptafacil-datos-\d{8}\.xlsx"$/,
    );
    const wb = await workbook(res.body as Buffer);
    expect(wb.getWorksheet('Animales')!.getRow(2).getCell(2).value).toBe('Firulais Exportado');
    expect(wb.getWorksheet('Adopciones')!.rowCount).toBe(2);
    const donation = wb.getWorksheet('Donaciones')!.getRow(2);
    expect(donation.getCell(3).value).toBe('Aprobada');
    // La organización cubre la comisión: cobrado 50.000 = neto + comisión + pasarela (con IVA).
    expect(donation.getCell(6).value).toBe(50_000);
    const parts = [7, 8, 9, 10, 11].map((c) => Number(donation.getCell(c).value));
    expect(parts[0]).toBeLessThan(50_000);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(50_000);
  });

  it('no lleva el contacto del adoptante ni el nombre o documento del donante', async () => {
    const text = allText(await workbook((await download(orgA).expect(200)).body as Buffer));
    expect(text).not.toContain(ADOPTER_EMAIL);
    expect(text).not.toContain(ADOPTER_PHONE);
    expect(text).not.toContain('Adoptante Privado');
    expect(text).not.toContain(DONOR_NAME);
    expect(text).not.toContain('1020304050');
  });

  it('no-leak: la Org B solo ve lo suyo y nunca una fila de la Org A', async () => {
    const text = allText(await workbook((await download(orgB).expect(200)).body as Buffer));
    expect(text).toContain('Solo De B');
    expect(text).not.toContain('Firulais Exportado');
    expect(text).not.toContain('Refugio Exporta A');
  });

  it('RBAC: Operator, Volunteer y una persona reciben 403; sin sesión, 401', async () => {
    for (const role of ['operator', 'volunteer']) {
      const member = await memberWithRole(app, admin, orgA.orgId, role);
      await download(member).expect(403);
    }
    await download(person).expect(403);
    await request(server).get('/org/exports/data.xlsx').expect(401);
  });

  it('plan: con los planes encendidos, Gratis recibe PLAN_REQUIRED y Crece descarga', async () => {
    setEnforced(true);
    try {
      const refused = await request(server)
        .get('/org/exports/data.xlsx')
        .set(auth(orgB.token))
        .expect(403);
      expect(refused.body).toMatchObject({
        code: 'PLAN_REQUIRED',
        capability: 'dataExport',
        requiredPlan: 'crece',
      });
      await admin.organizationSubscription.create({
        data: {
          organizationId: orgB.orgId,
          plan: 'crece',
          status: 'active',
          currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000),
        },
      });
      await download(orgB).expect(200);
    } finally {
      setEnforced(false);
    }
  });

  it('cada descarga queda en la bitácora con conteos y sin datos personales', async () => {
    const events = await admin.auditLog.findMany({
      where: { organizationId: orgA.orgId, action: 'organization.data_exported' },
    });
    expect(events.length).toBeGreaterThan(0);
    expect(events[0].actorUserId).toBe(orgA.userId);
    expect(events[0].metadata).toMatchObject({
      format: 'xlsx',
      animals: 1,
      adoptions: 1,
      donations: 1,
    });
    expect(JSON.stringify(events.map((e) => e.metadata))).not.toContain(ADOPTER_EMAIL);
  });
});
