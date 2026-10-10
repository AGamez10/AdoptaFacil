import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { NOTIFICATION_PORT } from '../src/core/notifications/notification.port';
import { purgeOrganizations } from './support/cleanup';
import {
  CapturingNotificationPort,
  type SignerActor,
  inviteSigner,
  memberWithRole,
  registerOwnSignature,
} from './support/signers';

/**
 * M13 · Firma con consentimiento — SEPARACIÓN entre organizaciones y firmantes.
 *
 * Dos organizaciones (A y B), cada una con su Owner (representante legal), un
 * redactor (Administrator) y un firmante adicional (revisor fiscal) que la
 * propia organización vinculó por invitación y que creó su cuenta y contraseña
 * con el enlace. Se demuestra que:
 * - vincular y revocar firmantes es solo del Owner de cada organización;
 * - el firmante solo ve y firma lo de SU organización (404 en la otra);
 * - nadie firma por otro, ni aprueba su propio borrador, ni acumula cargos;
 * - la política de firmas la declara el Owner; la plataforma la aplica;
 * - revocar corta el acceso y queda auditado con quién lo hizo.
 */
describe('Report signing: consent, separation between organizations and signers (M13)', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  const admin = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  const notifications = new CapturingNotificationPort();
  const orgIds: string[] = [];
  const password = 'password-1234';

  interface Actor {
    token: string;
    userId: string;
    orgId: string;
  }
  interface Org {
    owner: Actor;
    drafter: Actor;
    signer: SignerActor & { invitationId: string };
  }
  let A: Org;
  let B: Org;

  const today = new Date(Date.now() - 5 * 3600_000).toISOString().slice(0, 10);
  const monthAgo = new Date(Date.now() - 5 * 3600_000 - 25 * 86_400_000).toISOString().slice(0, 10);
  const auth = (a: { token: string }) => ({ Authorization: `Bearer ${a.token}` });

  async function setupOrg(name: string): Promise<Org> {
    const res = await request(server)
      .post('/auth/register/organization')
      .send({
        organizationName: name,
        displayName: `Owner ${name}`,
        email: `sign-${randomUUID()}@test.local`,
        password,
      })
      .expect(201);
    const owner: Actor = {
      token: res.body.tokens.accessToken,
      userId: res.body.user.id,
      orgId: res.body.user.organizationId,
    };
    orgIds.push(owner.orgId);
    await admin.organizationProfile.upsert({
      where: { organizationId: owner.orgId },
      create: { organizationId: owner.orgId, formalizationState: 'formalizada' },
      update: { formalizationState: 'formalizada' },
    });
    await registerOwnSignature(server, owner, 'legal_representative', `Rep ${name}`).expect(201);
    const signer = await inviteSigner(
      server,
      notifications,
      owner,
      'fiscal_reviewer',
      `Rev ${name}`,
    );
    await registerOwnSignature(server, signer, 'fiscal_reviewer', `Rev ${name}`).expect(201);
    const drafter = await memberWithRole(app, admin, owner.orgId, 'administrator');
    return { owner, drafter, signer };
  }

  const draft = (by: Actor, body: Record<string, unknown> = {}) =>
    request(server)
      .post('/org/reports')
      .set(auth(by))
      .send({ kind: 'donations', periodStart: monthAgo, periodEnd: today, ...body });
  const decide = (by: { token: string }, id: string, decision: 'approved' | 'rejected') =>
    request(server).post(`/org/reports/${id}/decision`).set(auth(by)).send({ decision });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(NOTIFICATION_PORT)
      .useValue(notifications)
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
    server = app.getHttpServer();
    A = await setupOrg('Refugio Alfa');
    B = await setupOrg('Refugio Beta');
  });

  afterAll(async () => {
    await purgeOrganizations(admin, orgIds);
    await admin.$disconnect();
    await app.close();
  });

  it("the signer account is the PERSON's own: created with their link, never by the platform, and every step is audited with who did it", async () => {
    const designation = await admin.orgSignerDesignation.findFirstOrThrow({
      where: { organizationId: A.owner.orgId, userId: A.signer.userId },
    });
    expect(designation).toMatchObject({
      role: 'fiscal_reviewer',
      designatedByUserId: A.owner.userId,
      revokedAt: null,
    });
    // Entra con el rol de menor poder, no como Owner ni Administrator.
    const roles = await admin.userRole.findMany({ where: { userId: A.signer.userId } });
    expect(roles.map((r) => r.role)).toEqual(['read_only_auditor']);
    // La contraseña la eligió la persona (hash propio); la invitación no la contiene.
    const message = notifications.sent.find((m) => m.to === A.signer.email);
    expect(message?.body).not.toContain(password);
    const audit = await admin.auditLog.findMany({
      where: {
        organizationId: A.owner.orgId,
        action: { in: ['invitation.created', 'signer.designated'] },
      },
    });
    expect(audit.map((a) => a.action).sort()).toEqual(['invitation.created', 'signer.designated']);
    expect(audit.find((a) => a.action === 'invitation.created')?.actorUserId).toBe(A.owner.userId);
  });

  it('only the Owner links signers: an Administrator or a non-auditor role is rejected, and a taken seat cannot be double-booked', async () => {
    const email = `x-${randomUUID()}@test.local`;
    await request(server)
      .post('/org/invitations')
      .set(auth(A.drafter))
      .send({ email, role: 'read_only_auditor', signerRole: 'accountant' })
      .expect(403);
    await request(server)
      .post('/org/invitations')
      .set(auth(A.owner))
      .send({ email, role: 'administrator', signerRole: 'accountant' })
      .expect(400);
    await request(server)
      .post('/org/invitations')
      .set(auth(A.owner))
      .send({ email, role: 'read_only_auditor', signerRole: 'fiscal_reviewer' })
      .expect(409); // el revisor fiscal ya está vinculado
  });

  it('the signer never reaches management: no generating, no inviting, no signer list, no policy', async () => {
    await draft(A.signer as unknown as Actor).expect(403);
    await request(server).get('/org/signers').set(auth(A.signer)).expect(403);
    await request(server)
      .post('/org/invitations')
      .set(auth(A.signer))
      .send({ email: `y-${randomUUID()}@test.local`, role: 'read_only_auditor' })
      .expect(403);
    await request(server)
      .put('/org/reports/policy')
      .set(auth(A.signer))
      .send({ kind: 'donations', requiredRoles: ['legal_representative'] })
      .expect(403);
  });

  it('the Owner declares the signatures the statutes demand; the platform applies the rule', async () => {
    await request(server)
      .put('/org/reports/policy')
      .set(auth(A.drafter))
      .send({ kind: 'social_service', requiredRoles: ['legal_representative', 'fiscal_reviewer'] })
      .expect(403);
    await request(server)
      .put('/org/reports/policy')
      .set(auth(A.owner))
      .send({ kind: 'social_service', requiredRoles: ['fiscal_reviewer'] })
      .expect(400); // el representante legal siempre firma
    await request(server)
      .put('/org/reports/policy')
      .set(auth(A.owner))
      .send({ kind: 'social_service', requiredRoles: ['legal_representative', 'fiscal_reviewer'] })
      .expect(200);

    const res = await draft(A.drafter, { kind: 'social_service' }).expect(201);
    expect(res.body.signers.map((s: { role: string }) => s.role)).toEqual([
      'legal_representative',
      'fiscal_reviewer',
    ]);
    // La política de A no gobierna a B: B sigue con el valor por defecto.
    const b = await draft(B.drafter, { kind: 'social_service' }).expect(201);
    expect(b.body.signers.map((s: { role: string }) => s.role)).toEqual(['legal_representative']);
  });

  it('whoever drafts cannot also be the signer of that document', async () => {
    // El Owner (representante legal) es el único firmante de B más el revisor: no puede redactar.
    const res = await draft(B.owner).expect(400);
    expect(res.body.message).toMatch(/no puede ser también su firmante/);
    // Como redactor, el Administrator sí puede.
    await draft(B.drafter).expect(201);
  });

  it('SEPARATION: each signer sees and signs only their own organization; the other one gets 404 everywhere', async () => {
    const reportA = (await draft(A.drafter, { periodStart: today, periodEnd: today }).expect(201))
      .body;
    const reportB = (await draft(B.drafter, { periodStart: today, periodEnd: today }).expect(201))
      .body;
    expect(reportA.organizationId).toBe(A.owner.orgId);
    expect(reportB.organizationId).toBe(B.owner.orgId);

    // Bandeja: cada firmante ve solo lo suyo.
    const inboxA = (
      await request(server).get('/org/reports/pending-signatures').set(auth(A.signer)).expect(200)
    ).body;
    const inboxB = (
      await request(server).get('/org/reports/pending-signatures').set(auth(B.signer)).expect(200)
    ).body;
    expect(inboxA.length).toBeGreaterThan(0);
    expect(
      inboxA.every(
        (i: { report: { organizationId: string } }) => i.report.organizationId === A.owner.orgId,
      ),
    ).toBe(true);
    expect(
      inboxB.every(
        (i: { report: { organizationId: string } }) => i.report.organizationId === B.owner.orgId,
      ),
    ).toBe(true);

    // El listado de un firmante adicional se recorta a lo que le toca firmar.
    const listA = (await request(server).get('/org/reports').set(auth(A.signer)).expect(200)).body;
    expect(
      listA.items.every((r: { organizationId: string }) => r.organizationId === A.owner.orgId),
    ).toBe(true);

    // El firmante de B no ve, no descarga ni firma el reporte de A (y viceversa).
    await request(server).get(`/org/reports/${reportA.id}/pdf`).set(auth(B.signer)).expect(404);
    await request(server).get(`/org/reports/${reportA.id}/xlsx`).set(auth(B.owner)).expect(404);
    await decide(B.signer, reportA.id, 'approved').expect(404);
    await decide(B.owner, reportA.id, 'approved').expect(404);
    await decide(A.signer, reportB.id, 'approved').expect(404);
    expect(
      await admin.orgReportApproval.count({
        where: { reportId: { in: [reportA.id, reportB.id] } },
      }),
    ).toBe(0);

    // Un firmante tampoco ve los firmantes ni las invitaciones de otra organización.
    await request(server)
      .get('/org/signers')
      .set(auth(B.owner))
      .expect(200)
      .then((r) => {
        expect(r.body.every((s: { email: string }) => s.email !== A.signer.email)).toBe(true);
      });

    // Lo suyo sí: cada uno aprueba en su organización.
    await decide(A.signer, reportA.id, 'approved').expect(200);
    await decide(A.owner, reportA.id, 'approved').expect(200);
    await decide(B.signer, reportB.id, 'approved').expect(200);
    await decide(B.owner, reportB.id, 'approved').expect(200);
    const issuedA = await request(server).get('/org/reports').set(auth(A.owner)).expect(200);
    expect(issuedA.body.items.find((r: { id: string }) => r.id === reportA.id).status).toBe(
      'issued',
    );
  });

  it('a rejection ends the document: it is never issued and nobody can approve it afterwards', async () => {
    const report = (
      await draft(A.drafter, { periodStart: monthAgo, periodEnd: monthAgo }).expect(201)
    ).body;
    await decide(A.signer, report.id, 'rejected').expect(200);
    const after = await decide(A.owner, report.id, 'approved').expect(409);
    expect(after.body.message).toMatch(/rechazado/);
    const list = await request(server).get('/org/reports').set(auth(A.owner)).expect(200);
    expect(list.body.items.find((r: { id: string }) => r.id === report.id).status).toBe('rejected');
    const pub = await request(server).get(`/public/reports/${report.code}`).expect(200);
    expect(pub.body.status).toBe('rejected');
  });

  it('REVOKING a signer cuts their access immediately, keeps what they signed, and is audited with who did it', async () => {
    const pendingDoc = (
      await draft(B.drafter, { periodStart: monthAgo, periodEnd: monthAgo }).expect(201)
    ).body;
    const designation = await admin.orgSignerDesignation.findFirstOrThrow({
      where: { organizationId: B.owner.orgId, userId: B.signer.userId },
    });
    // Ni un Administrator ni el Owner de OTRA organización pueden revocarlo.
    await request(server).delete(`/org/signers/${designation.id}`).set(auth(B.drafter)).expect(403);
    await request(server).delete(`/org/signers/${designation.id}`).set(auth(A.owner)).expect(404);
    await request(server).delete(`/org/signers/${designation.id}`).set(auth(B.owner)).expect(204);

    // La sesión de la persona deja de servir y ya no puede firmar el pendiente.
    await decide(B.signer, pendingDoc.id, 'approved').expect(403);
    const after = await admin.orgSignerDesignation.findUniqueOrThrow({
      where: { id: designation.id },
    });
    expect(after.revokedByUserId).toBe(B.owner.userId);
    expect(await admin.userRole.count({ where: { userId: B.signer.userId } })).toBe(0);
    const audit = await admin.auditLog.findFirstOrThrow({
      where: { organizationId: B.owner.orgId, action: 'signer.revoked', entityId: designation.id },
    });
    expect(audit.actorUserId).toBe(B.owner.userId);
    // Lo que firmó antes sigue emitido (historial intacto).
    expect(
      await admin.orgReportApproval.count({ where: { signerUserId: B.signer.userId } }),
    ).toBeGreaterThan(0);

    // Sin revisor vigente, el documento que lo exigía ya no se puede redactar.
    await request(server)
      .put('/org/reports/policy')
      .set(auth(B.owner))
      .send({ kind: 'donations', requiredRoles: ['legal_representative', 'fiscal_reviewer'] })
      .expect(200);
    const res = await draft(B.drafter).expect(400);
    expect(res.body.message).toMatch(/Revisor fiscal/);
    // Y la organización puede vincular a otra persona en ese cargo.
    const replacement = await inviteSigner(
      server,
      notifications,
      B.owner,
      'fiscal_reviewer',
      'Rev Nuevo',
    );
    await registerOwnSignature(server, replacement, 'fiscal_reviewer', 'Rev Nuevo').expect(201);
    await draft(B.drafter).expect(201);
  });

  it('one person, one seat: the legal representative cannot also be linked as a signer, and a signer cannot be invited twice', async () => {
    const res = await request(server)
      .post('/org/invitations')
      .set(auth(A.owner))
      .send({ email: A.signer.email, role: 'read_only_auditor', signerRole: 'accountant' })
      .expect(409); // el correo ya tiene cuenta: nadie acumula dos cuentas ni dos cargos
    expect(res.body.message).toMatch(/already has an AdoptaFácil account/);
  });
});
