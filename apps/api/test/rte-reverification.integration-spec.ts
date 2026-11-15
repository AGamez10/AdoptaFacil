import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { NOTIFICATION_PORT } from '../src/core/notifications/notification.port';
import { AppModule } from '../src/app.module';
import { RteReverificationService } from '../src/modules/org/rte-reverification.service';
import { purgeOrganizations } from './support/cleanup';
import { LEGAL_ORG, LEGAL_PERSON } from './support/legal';

const DAY = 24 * 60 * 60 * 1000;

/**
 * Reverificación anual del RTE: avisos a 60 y 30 días, al vencer se suspende
 * solo el certificado con beneficio tributario (sin borrar nada) y un RUT
 * nuevo aprobado por la plataforma lo renueva hasta el siguiente plazo.
 */
describe('RTE: reverificación anual', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  let rte: RteReverificationService;
  const admin = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  const orgIds: string[] = [];
  const sent: Array<{ to: string; subject: string; idempotencyKey?: string }> = [];
  const password = 'password-1234';
  let platformToken = '';
  let org: { token: string; orgId: string; email: string };

  const enabled = async (token: string): Promise<string[]> => {
    const res = await request(server)
      .get('/org/formalization/capabilities')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    return res.body.capabilities
      .filter((c: { enabled: boolean }) => c.enabled)
      .map((c: { capability: string }) => c.capability);
  };

  const setProfile = (data: { rteVigente: boolean; rteValidUntil: Date | null }) =>
    admin.organizationProfile.upsert({
      where: { organizationId: org.orgId },
      create: { organizationId: org.orgId, formalizationState: 'esal_rte', ...data },
      update: { formalizationState: 'esal_rte', ...data },
    });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(NOTIFICATION_PORT)
      .useValue({ send: async (m: (typeof sent)[number]) => void sent.push(m) })
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
    server = app.getHttpServer();
    rte = app.get(RteReverificationService);

    const email = `rte-${randomUUID()}@test.local`;
    const res = await request(server)
      .post('/auth/register/organization')
      .send({
        ...LEGAL_ORG,
        organizationName: 'Patitas RTE',
        displayName: 'Owner',
        email,
        password,
      })
      .expect(201);
    orgIds.push(res.body.user.organizationId);
    org = { token: res.body.tokens.accessToken, orgId: res.body.user.organizationId, email };

    const platform = await request(server)
      .post('/auth/register/person')
      .send({
        ...LEGAL_PERSON,
        displayName: 'PA',
        email: `rte-pa-${randomUUID()}@test.local`,
        password,
      })
      .expect(201);
    orgIds.push(platform.body.user.organizationId);
    await admin.userRole.create({
      data: {
        organizationId: platform.body.user.organizationId,
        userId: platform.body.user.id,
        role: 'platform_admin',
      },
    });
    platformToken = platform.body.tokens.accessToken;
  });

  beforeEach(() => {
    sent.length = 0;
  });

  afterAll(async () => {
    await purgeOrganizations(admin, orgIds);
    await admin.$disconnect();
    await app?.close();
  });

  it('el estado de formalización muestra hasta cuándo vale el RTE', async () => {
    const until = new Date('2027-07-01T04:59:59.000Z');
    await setProfile({ rteVigente: true, rteValidUntil: until });
    const res = await request(server)
      .get('/org/formalization')
      .set('Authorization', `Bearer ${org.token}`)
      .expect(200);
    expect(res.body).toMatchObject({
      state: 'esal_rte',
      rteVigente: true,
      rteValidUntil: until.toISOString(),
    });
  });

  it('lejos del vencimiento no avisa nada', async () => {
    const now = new Date();
    await setProfile({ rteVigente: true, rteValidUntil: new Date(now.getTime() + 120 * DAY) });
    await rte.scan(now);
    expect(sent.filter((m) => m.to === org.email)).toHaveLength(0);
  });

  it('avisa a 60 y a 30 días, una vez por etapa', async () => {
    const until = new Date(Date.now() + 200 * DAY);
    await setProfile({ rteVigente: true, rteValidUntil: until });
    await rte.scan(new Date(until.getTime() - 59 * DAY));
    await rte.scan(new Date(until.getTime() - 29 * DAY));
    const mine = sent.filter((m) => m.to === org.email);
    expect(mine).toHaveLength(2);
    expect(mine[0].subject).toContain('Tu RTE vence el');
    expect(mine[0].idempotencyKey).toContain(':60:');
    expect(mine[1].idempotencyKey).toContain(':30:');
    // Sigue vigente: el certificado tributario no se pausa antes de tiempo.
    expect(await enabled(org.token)).toContain('donation_tax_certificate');
  });

  it('al vencer sin RUT nuevo suspende solo el certificado tributario, sin borrar nada', async () => {
    const until = new Date(Date.now() - DAY);
    await setProfile({ rteVigente: true, rteValidUntil: until });
    const result = await rte.scan(new Date());
    expect(result.expired).toBeGreaterThanOrEqual(1);

    const profile = await admin.organizationProfile.findUniqueOrThrow({
      where: { organizationId: org.orgId },
    });
    expect(profile).toMatchObject({ formalizationState: 'esal_rte', rteVigente: false });
    expect(profile.rteValidUntil?.toISOString()).toBe(until.toISOString());

    const caps = await enabled(org.token);
    expect(caps).not.toContain('donation_tax_certificate');
    expect(caps).toContain('donation_accounting_certificate');
    expect(caps).toContain('receive_donations');
    expect(sent.find((m) => m.to === org.email)?.subject).toContain('Tu RTE venció');

    const audit = await admin.auditLog.findFirst({
      where: { organizationId: org.orgId, action: 'formalization.rte_expired' },
    });
    expect(audit).not.toBeNull();

    // Un segundo escaneo no lo vuelve a vencer ni a avisar.
    sent.length = 0;
    await rte.scan(new Date());
    expect(sent.filter((m) => m.to === org.email)).toHaveLength(0);
  });

  it('un RUT nuevo aprobado por la plataforma lo renueva hasta el siguiente plazo anual', async () => {
    await setProfile({ rteVigente: false, rteValidUntil: new Date(Date.now() - DAY) });
    const doc = await admin.organizationDocument.create({
      data: {
        organizationId: org.orgId,
        type: 'rut',
        storageRef: `organizations/${org.orgId}/documents/${randomUUID()}.pdf`,
        version: 1,
        status: 'pending',
      },
    });
    await request(server)
      .post(`/platform/documents/${doc.id}/decision`)
      .set('Authorization', `Bearer ${platformToken}`)
      .send({ decision: 'approve' })
      .expect((res) => expect([200, 201]).toContain(res.status));

    const profile = await admin.organizationProfile.findUniqueOrThrow({
      where: { organizationId: org.orgId },
    });
    expect(profile.rteVigente).toBe(true);
    expect(profile.rteValidUntil!.getTime()).toBeGreaterThan(Date.now());
    expect(await enabled(org.token)).toContain('donation_tax_certificate');
    const audit = await admin.auditLog.findFirst({
      where: { organizationId: org.orgId, action: 'formalization.rte_reverified' },
    });
    expect(audit?.metadata).toMatchObject({ evidenceDocumentId: doc.id, wasVigente: false });
  });

  it('aprobar un RUT de una organización que no es ESAL con RTE no le da RTE', async () => {
    await admin.organizationProfile.update({
      where: { organizationId: org.orgId },
      data: { formalizationState: 'esal', rteVigente: false, rteValidUntil: null },
    });
    const doc = await admin.organizationDocument.create({
      data: {
        organizationId: org.orgId,
        type: 'rut',
        storageRef: `organizations/${org.orgId}/documents/${randomUUID()}.pdf`,
        version: 2,
        status: 'pending',
      },
    });
    await request(server)
      .post(`/platform/documents/${doc.id}/decision`)
      .set('Authorization', `Bearer ${platformToken}`)
      .send({ decision: 'approve' });
    const profile = await admin.organizationProfile.findUniqueOrThrow({
      where: { organizationId: org.orgId },
    });
    expect(profile).toMatchObject({
      formalizationState: 'esal',
      rteVigente: false,
      rteValidUntil: null,
    });
  });
});
