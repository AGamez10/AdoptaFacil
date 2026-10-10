import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import * as ExcelJS from 'exceljs';
import { PDFDocument } from 'pdf-lib';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { purgeOrganizations } from './support/cleanup';
import { completeTestProfile } from './support/profile';
import {
  CapturingNotificationPort,
  type SignerActor,
  inviteSigner,
  memberWithRole,
  registerOwnSignature,
} from './support/signers';
import { NOTIFICATION_PORT } from '../src/core/notifications/notification.port';

/**
 * M13 · Reportes de donaciones y servicio social (extremo a extremo):
 * - aislamiento: la Org B nunca genera, lista ni descarga nada de la Org A;
 * - RBAC deny-by-default: Operator/Volunteer no generan; el auditor solo lee;
 * - sin escalamiento: un `organizationId` inyectado en el cuerpo se rechaza;
 * - idempotencia: generar dos veces lo mismo devuelve el MISMO folio;
 * - niveles de formalidad: informal ⇒ informativo y sin firmas; ESAL-RTE con
 *   rep. legal + revisor fiscal ⇒ certificado y con firmas;
 * - privacidad: el donante anónimo nunca aparece; la verificación pública no
 *   expone datos personales; el certificado de donación ya no muestra el nombre
 *   completo del donante en la verificación pública.
 */
describe('Org reports (M13: donaciones + servicio social, firmas, idempotencia, no-leak)', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
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
  let donor: Actor;
  /** Quien redacta (Administrator): nunca firma lo que redacta. */
  let drafterA: Actor;
  /** El revisor fiscal: otra persona, con su propia cuenta y contraseña. */
  let reviewerA: SignerActor;
  const notifications = new CapturingNotificationPort();

  // PNG real de 1x1 para que la firma se pueda incrustar en el PDF.
  const SIGNATURE_PNG =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

  const today = new Date(Date.now() - 5 * 3600_000).toISOString().slice(0, 10);
  const monthAgo = new Date(Date.now() - 5 * 3600_000 - 25 * 86_400_000).toISOString().slice(0, 10);

  async function registerOrg(name: string): Promise<Actor> {
    const res = await request(server)
      .post('/auth/register/organization')
      .send({
        organizationName: name,
        displayName: `Owner ${name}`,
        email: `reports-${randomUUID()}@test.local`,
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

  async function setOwnRole(actor: Actor, role: string): Promise<void> {
    await admin.userRole.deleteMany({ where: { userId: actor.userId } });
    await admin.userRole.create({
      data: { organizationId: actor.orgId, userId: actor.userId, role },
    });
  }

  async function registerSigner(actor: Actor, role: string, fullName: string) {
    await request(server)
      .post('/org/legal-representative')
      .set('Authorization', `Bearer ${actor.token}`)
      .send({
        role,
        fullName,
        documentType: 'cedula_ciudadania',
        documentNumber: '79000111',
        position: role === 'legal_representative' ? 'Representante legal' : 'Revisora fiscal',
        signatureBase64: SIGNATURE_PNG,
        signatureContentType: 'image/png',
      })
      .expect(201);
  }

  async function donate(to: Actor, amount: number, extra: Record<string, unknown>) {
    const res = await request(server)
      .post('/donations')
      .set('Authorization', `Bearer ${donor.token}`)
      .send({
        organizationId: to.orgId,
        intendedAmount: amount,
        commissionPayer: 'organization',
        idempotencyKey: `rep-${randomUUID()}`,
        ...extra,
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
    return res.body.id as string;
  }

  const generate = (actor: Actor, body: Record<string, unknown>) =>
    request(server).post('/org/reports').set('Authorization', `Bearer ${actor.token}`).send(body);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(NOTIFICATION_PORT)
      .useValue(notifications)
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
    server = app.getHttpServer();

    orgA = await registerOrg('Fundación Huellitas');
    orgB = await registerOrg('Rescatista Informal');

    await request(server)
      .put('/org/profile')
      .set('Authorization', `Bearer ${orgA.token}`)
      .send({ nit: '900555444-2' })
      .expect(200);
    await admin.organizationProfile.update({
      where: { organizationId: orgA.orgId },
      data: { formalizationState: 'esal_rte', rteVigente: true },
    });
    await registerSigner(orgA, 'legal_representative', 'Laura Gómez');
    reviewerA = await inviteSigner(
      server,
      notifications,
      orgA,
      'fiscal_reviewer',
      'Diana Revisora',
    );
    await registerOwnSignature(server, reviewerA, 'fiscal_reviewer', 'Diana Revisora').expect(201);
    drafterA = await memberWithRole(app, admin, orgA.orgId, 'administrator');
    // La org informal también tiene una "firma" registrada: aun así sus
    // reportes deben salir informativos y SIN firmas.
    await registerSigner(orgB, 'legal_representative', 'Rescatista Firmante');

    const donorReg = await request(server)
      .post('/auth/register/person')
      .send({
        displayName: 'María Restrepo',
        email: `reports-donor-${randomUUID()}@test.local`,
        password,
      })
      .expect(201);
    donor = {
      token: donorReg.body.tokens.accessToken,
      userId: donorReg.body.user.id,
      orgId: donorReg.body.user.organizationId,
    };
    orgIds.push(donor.orgId);
    await completeTestProfile(admin, donor.userId);

    await donate(orgA, 120000, { payer: { fullName: 'María Restrepo', documentId: '1020304050' } });
    await donate(orgA, 80000, {
      payer: { fullName: 'Donante Secreto', documentId: '5566778899' },
      anonymous: true,
    });
    await donate(orgB, 30000, { payer: { fullName: 'Solo De B' } });

    // Servicio social en la Org A (sembrado directo: el flujo de inscripción
    // tiene su propia cobertura).
    const opportunity = await admin.volunteerOpportunity.create({
      data: {
        organizationId: orgA.orgId,
        title: 'Paseo de perros',
        category: 'cuidado',
        startDate: new Date(Date.now() - 60 * 86_400_000),
        endDate: new Date(Date.now() + 60 * 86_400_000),
        location: 'Medellín',
        appliesToStudentService: true,
      },
    });
    const enrollment = await admin.volunteerEnrollment.create({
      data: {
        organizationId: orgA.orgId,
        opportunityId: opportunity.id,
        volunteerUserId: donor.userId,
        volunteerName: 'Juan 😀 Estudiante',
        volunteerEmail: 'juan@test.local',
        appliesToStudentService: true,
        status: 'accepted',
        schoolName: 'Colegio San José',
        schoolAgreementCode: 'CV-77',
        isMinor: true,
        guardianName: 'Acudiente Privado',
        guardianDocument: '123123123',
      },
    });
    await admin.serviceHours.createMany({
      data: [
        { hours: 6, status: 'approved' },
        { hours: 2.5, status: 'approved' },
        { hours: 4, status: 'pending' },
      ].map((h, i) => ({
        organizationId: orgA.orgId,
        enrollmentId: enrollment.id,
        volunteerUserId: donor.userId,
        date: new Date(Date.now() - (i + 2) * 86_400_000),
        description: `Sesión ${i}`,
        ...h,
      })),
    });
  });

  afterAll(async () => {
    await purgeOrganizations(admin, orgIds);
    await admin.$disconnect();
    await app.close();
  });

  let donationsReportId = '';
  let donationsCode = '';

  it('readiness explains what each document will be worth and which signatures exist', async () => {
    const a = await request(server)
      .get('/org/reports/readiness')
      .set('Authorization', `Bearer ${orgA.token}`)
      .expect(200);
    expect(a.body.donationsLegalEffect).toBe('certified');
    expect(a.body.socialServiceLegalEffect).toBe('signed');
    expect(a.body.schools).toEqual(['Colegio San José']);
    expect(
      a.body.signers.find((s: { role: string }) => s.role === 'fiscal_reviewer').registered,
    ).toBe(true);

    const b = await request(server)
      .get('/org/reports/readiness')
      .set('Authorization', `Bearer ${orgB.token}`)
      .expect(200);
    expect(b.body.donationsLegalEffect).toBe('informative');
    expect(b.body.nextSteps[0]).toMatch(/Formaliza/);
    expect(b.body.schools).toEqual([]);
  });

  it('generates a CERTIFIED donations report for the ESAL-RTE org, with both signers', async () => {
    const res = await generate(drafterA, {
      kind: 'donations',
      periodStart: monthAgo,
      periodEnd: today,
    }).expect(201);
    expect(res.body.code).toMatch(/^ADF-REP-\d{4}-[2-9A-Z]{8}$/);
    expect(res.body.legalEffect).toBe('certified');
    expect(res.body.reused).toBe(false);
    expect(res.body.signers.map((s: { role: string }) => s.role)).toEqual([
      'legal_representative',
      'fiscal_reviewer',
    ]);
    expect(res.body.summary.rowCount).toBe(2);
    expect(res.body.organizationId).toBe(orgA.orgId);
    donationsReportId = res.body.id;
    donationsCode = res.body.code;

    const row = await admin.orgReport.findUniqueOrThrow({ where: { id: donationsReportId } });
    const sealed = JSON.stringify(row.payload);
    expect(sealed).toContain('Donante anónimo');
    expect(sealed).not.toContain('Donante Secreto');
    expect(sealed).not.toContain('5566778899');
    expect(sealed).not.toContain('Solo De B'); // donación de la otra organización
    expect(JSON.stringify(row.signers)).not.toContain('79000111'); // nunca el documento del firmante
  });

  it('is a DRAFT without signatures until EVERY required signer approves with their own account', async () => {
    const auth = (a: { token: string }) => ({ Authorization: `Bearer ${a.token}` });
    const row = await request(server).get('/org/reports').set(auth(orgA)).expect(200);
    const mine = row.body.items.find((r: { id: string }) => r.id === donationsReportId);
    expect(mine.status).toBe('pending_signatures');
    expect(mine.approvals).toEqual([]);

    // El borrador se descarga, pero SIN firmas y marcado sin valor.
    const draftPdf = await request(server)
      .get(`/org/reports/${donationsReportId}/pdf`)
      .set(auth(orgA))
      .buffer(true)
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect((draftPdf.body as Buffer).length).toBeGreaterThan(1000);
    const pub = await request(server).get(`/public/reports/${donationsCode}`).expect(200);
    expect(pub.body.status).toBe('pending_signatures');

    // Nadie aprueba su propio borrador ni por otro: quien redactó, un miembro
    // sin la designación y el firmante equivocado reciben 404.
    await request(server)
      .post(`/org/reports/${donationsReportId}/decision`)
      .set(auth(drafterA))
      .send({ decision: 'approved' })
      .expect(403);
    await request(server)
      .post(`/org/reports/${donationsReportId}/decision`)
      .set(auth(orgB))
      .send({ decision: 'approved' })
      .expect(404);
    await request(server)
      .post(`/org/reports/${donationsReportId}/decision`)
      .set(auth(orgA))
      .send({ decision: 'approved', signerRole: 'fiscal_reviewer' })
      .expect(400); // cuerpo estricto: no se elige por quién se firma

    // Cada firmante ve SOLO lo suyo en su bandeja.
    const inbox = await request(server)
      .get('/org/reports/pending-signatures')
      .set(auth(reviewerA))
      .expect(200);
    expect(inbox.body).toHaveLength(1);
    expect(inbox.body[0]).toMatchObject({ role: 'fiscal_reviewer' });
    expect(inbox.body[0].report.id).toBe(donationsReportId);

    // 1.ª aprobación (representante legal): todavía pendiente.
    const first = await request(server)
      .post(`/org/reports/${donationsReportId}/decision`)
      .set(auth(orgA))
      .send({ decision: 'approved' })
      .expect(200);
    expect(first.body.status).toBe('pending_signatures');
    // Aprobar dos veces se rechaza (una decisión por cargo).
    await request(server)
      .post(`/org/reports/${donationsReportId}/decision`)
      .set(auth(orgA))
      .send({ decision: 'approved' })
      .expect(409);

    // 2.ª aprobación (revisor fiscal): el documento queda emitido.
    const second = await request(server)
      .post(`/org/reports/${donationsReportId}/decision`)
      .set(auth(reviewerA))
      .send({ decision: 'approved' })
      .expect(200);
    expect(second.body.status).toBe('issued');
    const approvals = await admin.orgReportApproval.findMany({
      where: { reportId: donationsReportId },
    });
    expect(approvals.map((a) => a.signerRole).sort()).toEqual([
      'fiscal_reviewer',
      'legal_representative',
    ]);
    // Cada firma queda ligada a la huella del contenido sellado.
    const sealedRow = await admin.orgReport.findUniqueOrThrow({ where: { id: donationsReportId } });
    expect(approvals.every((a) => a.contentHash === sealedRow.contentHash)).toBe(true);
    const issued = await admin.auditLog.findMany({
      where: { organizationId: orgA.orgId, action: 'report.issued', entityId: donationsReportId },
    });
    expect(issued).toHaveLength(1);
    expect((issued[0].metadata as { requestedByUserId?: string }).requestedByUserId).toBe(
      drafterA.userId,
    );
    const pub2 = await request(server).get(`/public/reports/${donationsCode}`).expect(200);
    expect(pub2.body.status).toBe('issued');
  });

  it('is idempotent: generating the same report again returns the SAME folio, no duplicate', async () => {
    const again = await generate(drafterA, {
      kind: 'donations',
      periodStart: monthAgo,
      periodEnd: today,
    }).expect(201);
    expect(again.body.id).toBe(donationsReportId);
    expect(again.body.code).toBe(donationsCode);
    expect(again.body.reused).toBe(true);
    const [concurrentA, concurrentB] = await Promise.all([
      generate(drafterA, { kind: 'donations', periodStart: monthAgo, periodEnd: today }),
      generate(drafterA, { kind: 'donations', periodStart: monthAgo, periodEnd: today }),
    ]);
    expect(concurrentA.body.code).toBe(donationsCode);
    expect(concurrentB.body.code).toBe(donationsCode);
    expect(
      await admin.orgReport.count({ where: { organizationId: orgA.orgId, kind: 'donations' } }),
    ).toBe(1);
  });

  it('downloads the signed PDF and the Excel', async () => {
    const pdf = await request(server)
      .get(`/org/reports/${donationsReportId}/pdf`)
      .set('Authorization', `Bearer ${orgA.token}`)
      .buffer(true)
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect(pdf.headers['content-type']).toBe('application/pdf');
    expect(pdf.headers['content-disposition']).toContain(`${donationsCode}.pdf`);
    expect(pdf.headers['cache-control']).toContain('no-store');
    const doc = await PDFDocument.load(pdf.body as Buffer);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);

    const xlsx = await request(server)
      .get(`/org/reports/${donationsReportId}/xlsx`)
      .set('Authorization', `Bearer ${orgA.token}`)
      .buffer(true)
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      })
      .expect(200);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(xlsx.body as ArrayBuffer);
    const donors = wb.getWorksheet('Donaciones')!.getColumn(3).values.slice(2);
    expect(donors).toEqual(expect.arrayContaining(['Donante', 'Donante anónimo']));
    expect(JSON.stringify(donors)).not.toContain('María Restrepo');

    const downloads = await admin.auditLog.count({
      where: {
        organizationId: orgA.orgId,
        action: 'report.downloaded',
        entityId: donationsReportId,
      },
    });
    expect(downloads).toBe(3); // borrador + PDF emitido + Excel
  });

  it('BLOCKS the social service report while there is no consent registry: it names volunteers, so it is never issued', async () => {
    const before = await admin.orgReport.count({
      where: { organizationId: orgA.orgId, kind: 'social_service' },
    });
    const res = await generate(drafterA, {
      kind: 'social_service',
      periodStart: monthAgo,
      periodEnd: today,
      filters: { studentServiceOnly: true, schoolName: '  Colegio San José ' },
    }).expect(409);
    expect(res.body.message).toContain('consentimiento');
    const after = await admin.orgReport.count({
      where: { organizationId: orgA.orgId, kind: 'social_service' },
    });
    expect(after).toBe(before);
  });

  it('donations reports never identify the donor while there is no consent registry', async () => {
    const rows = await admin.orgReport.findMany({
      where: { organizationId: orgA.orgId, kind: 'donations' },
    });
    expect(rows.length).toBeGreaterThan(0);
    const dump = JSON.stringify(rows.map((r) => r.payload));
    expect(dump).not.toContain('María Restrepo');
    expect(dump).not.toContain('Donante Secreto');
    expect(dump).not.toContain('5566778899');
    expect(dump).not.toContain('4050');
  });

  it('an informal org gets an INFORMATIVE report with NO signatures, even if it registered one', async () => {
    const res = await generate(orgB, {
      kind: 'donations',
      periodStart: monthAgo,
      periodEnd: today,
    }).expect(201);
    expect(res.body.legalEffect).toBe('informative');
    expect(res.body.signers).toEqual([]);
    expect(res.body.summary.rowCount).toBe(1);
  });

  it('no-leak: Org B cannot list, download or verify-by-id Org A reports (404), and its list has only its own', async () => {
    await request(server)
      .get(`/org/reports/${donationsReportId}/pdf`)
      .set('Authorization', `Bearer ${orgB.token}`)
      .expect(404);
    await request(server)
      .get(`/org/reports/${donationsReportId}/xlsx`)
      .set('Authorization', `Bearer ${orgB.token}`)
      .expect(404);
    const list = await request(server)
      .get('/org/reports')
      .set('Authorization', `Bearer ${orgB.token}`)
      .expect(200);
    expect(
      list.body.items.every((r: { organizationId: string }) => r.organizationId === orgB.orgId),
    ).toBe(true);
    expect(list.body.items.some((r: { id: string }) => r.id === donationsReportId)).toBe(false);
  });

  it('no privilege escalation: an injected organizationId is rejected (strict body)', async () => {
    await generate(orgB, {
      kind: 'donations',
      periodStart: monthAgo,
      periodEnd: today,
      organizationId: orgA.orgId,
    }).expect(400);
  });

  it('validates inputs: future dates, inverted periods, unknown kinds and unregistered signers', async () => {
    await generate(drafterA, {
      kind: 'donations',
      periodStart: today,
      periodEnd: '2999-01-01',
    }).expect(400);
    await generate(drafterA, { kind: 'donations', periodStart: today, periodEnd: monthAgo }).expect(
      400,
    );
    await generate(drafterA, { kind: 'payroll', periodStart: monthAgo, periodEnd: today }).expect(
      400,
    );
    const res = await generate(drafterA, {
      kind: 'donations',
      periodStart: monthAgo,
      periodEnd: today,
      signerRoles: ['legal_representative', 'accountant'],
    }).expect(400);
    expect(res.body.message).toMatch(/Contador/);
  });

  it('RBAC deny-by-default: Operator cannot generate nor read; ReadOnlyAuditor reads but cannot generate', async () => {
    await setOwnRole(orgA, 'operator');
    await generate(orgA, { kind: 'donations', periodStart: monthAgo, periodEnd: today }).expect(
      403,
    );
    await request(server)
      .get('/org/reports')
      .set('Authorization', `Bearer ${orgA.token}`)
      .expect(403);

    await setOwnRole(orgA, 'read_only_auditor');
    await generate(orgA, { kind: 'donations', periodStart: monthAgo, periodEnd: today }).expect(
      403,
    );
    await request(server)
      .get('/org/reports')
      .set('Authorization', `Bearer ${orgA.token}`)
      .expect(200);
    await request(server)
      .get(`/org/reports/${donationsReportId}/pdf`)
      .set('Authorization', `Bearer ${orgA.token}`)
      .expect(200);

    await setOwnRole(orgA, 'owner');
  });

  it('a person without an org role cannot generate reports', async () => {
    await generate(donor, { kind: 'donations', periodStart: monthAgo, periodEnd: today }).expect(
      403,
    );
  });

  it('public verification by folio shows the seal but no personal data', async () => {
    const res = await request(server).get(`/public/reports/${donationsCode}`).expect(200);
    expect(res.body).toMatchObject({
      code: donationsCode,
      kind: 'donations',
      organizationName: 'Fundación Huellitas',
      legalEffect: 'certified',
      rowCount: 2,
    });
    expect(res.body.contentHash).toMatch(/^[0-9a-f]{64}$/);
    const text = JSON.stringify(res.body);
    expect(text).not.toContain('María');
    expect(text).not.toContain(orgA.orgId);
    expect(res.body.id).toBeUndefined();

    await request(server).get('/public/reports/ADF-REP-2026-ZZZZZZZZ').expect(404);
    await request(server).get("/public/reports/x' OR '1'='1").expect(404);
  });

  it('donation certificate public verification no longer exposes the full donor name', async () => {
    const cert = await admin.donationCertificate.findFirstOrThrow({
      where: {
        organizationId: orgA.orgId,
        payload: { path: ['donorName'], equals: 'María Restrepo' },
      },
    });
    const res = await request(server)
      .get(`/public/donations/certificates/${cert.code}`)
      .expect(200);
    expect(res.body.donorName).toBe('María R.');

    const anon = await admin.donationCertificate.findFirstOrThrow({
      where: {
        organizationId: orgA.orgId,
        payload: { path: ['donorName'], equals: 'Donante Secreto' },
      },
    });
    const anonRes = await request(server)
      .get(`/public/donations/certificates/${anon.code}`)
      .expect(200);
    expect(anonRes.body.donorName).toBe('Donante anónimo');
  });
  it('with signatures OFF (default) reports never carry signatures, even for a certified-grade org', async () => {
    // Los casos anteriores ejercen el camino con firmas (load-env las enciende);
    // aquí se apaga solo para este servicio, como queda en producción.
    const offRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ConfigService)
      .useFactory({
        factory: (): Pick<ConfigService, 'get'> => {
          const real = new ConfigService();
          return {
            get: ((key: string, ...rest: unknown[]) =>
              key === 'REPORTS_SIGNATURES_ENABLED'
                ? false
                : (real.get as (k: string, ...r: unknown[]) => unknown)(key, ...rest)) as never,
          };
        },
      })
      .compile();
    const offApp = offRef.createNestApplication();
    await offApp.init();
    try {
      const offServer = offApp.getHttpServer();
      const call = (body: Record<string, unknown>) =>
        request(offServer)
          .post('/org/reports')
          .set('Authorization', `Bearer ${orgA.token}`)
          .send(body);

      const ready = await request(offServer)
        .get('/org/reports/readiness')
        .set('Authorization', `Bearer ${orgA.token}`)
        .expect(200);
      expect(ready.body.signaturesEnabled).toBe(false);
      expect(ready.body.donationsLegalEffect).toBe('informative');

      // Pedir firmas explícitamente se rechaza: nadie firma por otro.
      await call({
        kind: 'donations',
        periodStart: monthAgo,
        periodEnd: today,
        signerRoles: ['legal_representative'],
      }).expect(400);

      const res = await call({ kind: 'donations', periodStart: monthAgo, periodEnd: today }).expect(
        201,
      );
      expect(res.body.legalEffect).toBe('informative');
      expect(res.body.signers).toEqual([]);
    } finally {
      await offApp.close();
    }
  });
});
