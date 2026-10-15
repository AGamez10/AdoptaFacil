import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { totpAt } from '../src/core/auth/mfa/totp';
import { purgeOrganizations } from './support/cleanup';
import { createStaffMember, type StaffMember } from './support/platform-team';
import { LEGAL_ORG } from './support/legal';

/**
 * F19 · platform team workspace, end to end over HTTP with the second factor
 * ENFORCED (as in production). Two teams work the same platform at once:
 *   - each sees and changes only its own tasks, notes, approvals, members,
 *     activity and exports (the isolation test the brief asks for);
 *   - sensitive actions need a different lead of the same team, with a fresh
 *     TOTP code (four eyes + step-up);
 *   - every platform request lands in the caller's team trail.
 */
describe('Platform workspace (F19)', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  const admin = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  const createdOrgIds: string[] = [];
  const previousMfa = process.env.PLATFORM_MFA_REQUIRED;

  let leadA1: StaffMember;
  let leadA2: StaffMember;
  let analystA: StaffMember;
  let leadB1: StaffMember;
  let leadB2: StaffMember;
  let subjectId: string;
  let ownerToken: string;
  /** A code step is accepted once and never one older than the last, so each
   *  code comes from the next 30-second step: the test clock moves forward. */
  const realNow = Date.now.bind(Date);
  let offsetMs = 0;
  const nextCode = (member: StaffMember) => {
    offsetMs += 30_000;
    return totpAt(member.totpSecret!, realNow() + offsetMs);
  };

  const as = (member: { token: string }) => ({
    get: (path: string) => request(server).get(path).set('Authorization', `Bearer ${member.token}`),
    post: (path: string, body: object = {}) =>
      request(server).post(path).set('Authorization', `Bearer ${member.token}`).send(body),
  });

  beforeAll(async () => {
    process.env.PLATFORM_MFA_REQUIRED = 'true';
    jest.spyOn(Date, 'now').mockImplementation(() => realNow() + offsetMs);
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    server = app.getHttpServer();

    const staff = { enrolled: true, mfaVerified: true };
    leadA1 = await createStaffMember(admin, app, { roles: ['platform_super_admin'], ...staff });
    createdOrgIds.push(leadA1.orgId);
    leadA2 = await createStaffMember(admin, app, {
      teamOrgId: leadA1.orgId,
      roles: ['platform_super_admin'],
      ...staff,
    });
    analystA = await createStaffMember(admin, app, {
      teamOrgId: leadA1.orgId,
      roles: ['platform_admin'],
      ...staff,
    });
    leadB1 = await createStaffMember(admin, app, { roles: ['platform_super_admin'], ...staff });
    createdOrgIds.push(leadB1.orgId);
    leadB2 = await createStaffMember(admin, app, {
      teamOrgId: leadB1.orgId,
      roles: ['platform_super_admin'],
      ...staff,
    });

    // An organization waiting for platform review (the shared catalog).
    const owner = await request(server)
      .post('/auth/register/organization')
      .send({
        ...LEGAL_ORG,
        organizationName: 'Fundación en revisión',
        displayName: 'Owner',
        email: `ws-owner-${randomUUID()}@test.local`,
        password: 'password-owner-123',
      })
      .expect(201);
    subjectId = owner.body.user.organizationId;
    ownerToken = owner.body.tokens.accessToken;
    createdOrgIds.push(subjectId);
    await admin.organization.update({
      where: { id: subjectId },
      data: { status: 'pending_review' },
    });
  });

  afterAll(async () => {
    jest.restoreAllMocks();
    if (previousMfa === undefined) delete process.env.PLATFORM_MFA_REQUIRED;
    else process.env.PLATFORM_MFA_REQUIRED = previousMfa;
    await purgeOrganizations(admin, createdOrgIds);
    await admin.$disconnect();
    await app?.close();
  });

  it('deny-by-default: an organization role cannot open the workspace', async () => {
    await as({ token: ownerToken }).get('/platform/workspace/me').expect(403);
    await as({ token: ownerToken }).get('/platform/workspace/tickets').expect(403);
    await as({ token: ownerToken }).get('/platform/workspace/approvals').expect(403);
  });

  it('shows who I am, in which team, and the session rules', async () => {
    const me = await as(leadA1).get('/platform/workspace/me').expect(200);
    expect(me.body).toMatchObject({
      userId: leadA1.userId,
      teamOrganizationId: leadA1.orgId,
      roles: ['platform_super_admin'],
      mfa: { required: true, enrolled: true, verified: true },
    });
    expect(me.body.policy.accessTtlSeconds).toBeLessThanOrEqual(900);
  });

  describe('two teams never see or change each other’s work', () => {
    let ticketA: { id: string; version: number };
    let ticketB: { id: string; version: number };

    it('each team gets its own task for the same pending organization', async () => {
      const listA = await as(leadA1).get('/platform/workspace/tickets').expect(200);
      const listB = await as(leadB1).get('/platform/workspace/tickets').expect(200);
      ticketA = listA.body.find(
        (t: { subjectOrganizationId: string }) => t.subjectOrganizationId === subjectId,
      );
      ticketB = listB.body.find(
        (t: { subjectOrganizationId: string }) => t.subjectOrganizationId === subjectId,
      );
      expect(ticketA).toBeDefined();
      expect(ticketB).toBeDefined();
      expect(ticketA.id).not.toBe(ticketB.id);
      const idsB = listB.body.map((t: { id: string }) => t.id);
      expect(idsB).not.toContain(ticketA.id);
    });

    it('team A takes its task and writes a note; team B sees none of it', async () => {
      const taken = await as(analystA)
        .post(`/platform/workspace/tickets/${ticketA.id}/take`, {
          expectedVersion: ticketA.version,
        })
        .expect(201);
      expect(taken.body).toMatchObject({ status: 'in_progress', assigneeUserId: analystA.userId });
      await as(leadA1)
        .post(`/platform/workspace/tickets/${ticketA.id}/notes`, {
          note: 'Falta el RUT vigente — nota de A',
        })
        .expect(201);

      // Team B: not found (not forbidden — it does not exist for them).
      await as(leadB1).get(`/platform/workspace/tickets/${ticketA.id}`).expect(404);
      await as(leadB1)
        .post(`/platform/workspace/tickets/${ticketA.id}/take`, {
          expectedVersion: taken.body.version,
        })
        .expect(404);
      await as(leadB1)
        .post(`/platform/workspace/tickets/${ticketA.id}/notes`, { note: 'intrusión' })
        .expect(404);

      const detailB = await as(leadB1).get(`/platform/workspace/tickets/${ticketB.id}`).expect(200);
      expect(detailB.body).toMatchObject({ status: 'open', assigneeUserId: null });
      expect(JSON.stringify(detailB.body)).not.toContain('nota de A');
      expect(JSON.stringify(detailB.body)).not.toContain(analystA.userId);
    });

    it('a stale change is rejected instead of overwriting (409)', async () => {
      await as(leadA2)
        .post(`/platform/workspace/tickets/${ticketA.id}/take`, {
          expectedVersion: ticketA.version,
        })
        .expect(409);
    });

    it('approvals, members and activity stay inside each team', async () => {
      const asked = await as(leadA1)
        .post('/platform/workspace/approvals', {
          type: 'audit.export',
          payload: { from: '2026-01-01', to: '2026-12-31' },
          reason: 'Auditoría trimestral del equipo A',
        })
        .expect(201);
      const approvalsB = await as(leadB1).get('/platform/workspace/approvals').expect(200);
      expect(approvalsB.body.map((a: { id: string }) => a.id)).not.toContain(asked.body.id);
      await as(leadB1)
        .post(`/platform/workspace/approvals/${asked.body.id}/approve`, { code: nextCode(leadB1) })
        .expect(404);
      await as(leadB1)
        .post(`/platform/workspace/approvals/${asked.body.id}/reject`, { note: 'no aplica' })
        .expect(404);
      await as(leadB1).get(`/platform/workspace/approvals/${asked.body.id}/export.csv`).expect(404);

      const teamB = await as(leadB1).get('/platform/workspace/team').expect(200);
      expect(teamB.body.map((m: { userId: string }) => m.userId).sort()).toEqual(
        [leadB1.userId, leadB2.userId].sort(),
      );

      const activityB = await as(leadB1).get('/platform/workspace/activity?limit=100').expect(200);
      const dump = JSON.stringify(activityB.body);
      for (const member of [leadA1, leadA2, analystA]) expect(dump).not.toContain(member.userId);
      expect(
        activityB.body.every((e: { organizationId: string }) => e.organizationId === leadB1.orgId),
      ).toBe(true);
    });
  });

  describe('four eyes for sensitive actions', () => {
    it('the requester cannot approve, an analyst cannot decide, another lead approves with a fresh code', async () => {
      const asked = await as(leadA1)
        .post('/platform/workspace/approvals', {
          type: 'staff.role_grant',
          payload: { userId: analystA.userId, role: 'platform_super_admin' },
          reason: 'Asciende a líder para cubrir vacaciones',
        })
        .expect(201);
      expect(asked.body.status).toBe('pending');

      // Only leads may ask for staff changes.
      await as(analystA)
        .post('/platform/workspace/approvals', {
          type: 'staff.role_grant',
          payload: { userId: analystA.userId, role: 'platform_super_admin' },
          reason: 'Me asciendo solo',
        })
        .expect(403);

      const own = await as(leadA1)
        .post(`/platform/workspace/approvals/${asked.body.id}/approve`, { code: nextCode(leadA1) })
        .expect(403);
      expect(own.body.code).toBe('FOUR_EYES');
      await as(analystA)
        .post(`/platform/workspace/approvals/${asked.body.id}/approve`, {
          code: nextCode(analystA),
        })
        .expect(403);
      await as(leadA2)
        .post(`/platform/workspace/approvals/${asked.body.id}/approve`, { code: '000000' })
        .expect(401);

      const code = nextCode(leadA2);
      const approved = await as(leadA2)
        .post(`/platform/workspace/approvals/${asked.body.id}/approve`, { code, note: 'ok' })
        .expect(201);
      expect(approved.body).toMatchObject({ status: 'approved', decidedByUserId: leadA2.userId });
      const roles = await admin.userRole.findMany({ where: { userId: analystA.userId } });
      expect(roles.map((r) => r.role).sort()).toEqual(['platform_admin', 'platform_super_admin']);

      // Decided once: a second decision is refused.
      await as(leadA2)
        .post(`/platform/workspace/approvals/${asked.body.id}/reject`, { note: 'tarde' })
        .expect(409);

      const trail = await admin.auditLog.findMany({
        where: { organizationId: leadA1.orgId, entityId: asked.body.id },
        select: { action: true, actorUserId: true },
      });
      expect(trail).toEqual(
        expect.arrayContaining([
          { action: 'workspace.approval.requested', actorUserId: leadA1.userId },
          { action: 'workspace.approval.approved', actorUserId: leadA2.userId },
        ]),
      );
    });

    it('the same code cannot be used twice (replay)', async () => {
      const asked = await as(leadA1)
        .post('/platform/workspace/approvals', {
          type: 'audit.export',
          payload: { from: '2026-01-01', to: '2026-01-31' },
          reason: 'Prueba de reutilización de código',
        })
        .expect(201);
      const code = nextCode(leadA2);
      // Burn the code on another approval first.
      const other = await as(leadA1)
        .post('/platform/workspace/approvals', {
          type: 'audit.export',
          payload: { from: '2026-02-01', to: '2026-02-28' },
          reason: 'Otra exportación',
        })
        .expect(201);
      await as(leadA2)
        .post(`/platform/workspace/approvals/${other.body.id}/approve`, { code })
        .expect(201);
      await as(leadA2)
        .post(`/platform/workspace/approvals/${asked.body.id}/approve`, { code })
        .expect(401);
    });

    it('an approved export is downloadable only by its requester, as a safe CSV', async () => {
      const asked = await as(leadA2)
        .post('/platform/workspace/approvals', {
          type: 'audit.export',
          payload: { from: '2026-01-01', to: '2026-12-31' },
          reason: 'Exportación para revisoría',
        })
        .expect(201);
      await as(leadA2).get(`/platform/workspace/approvals/${asked.body.id}/export.csv`).expect(403);
      await as(leadA1)
        .post(`/platform/workspace/approvals/${asked.body.id}/approve`, { code: nextCode(leadA1) })
        .expect(201);
      await as(leadA1).get(`/platform/workspace/approvals/${asked.body.id}/export.csv`).expect(403);
      const csv = await as(leadA2)
        .get(`/platform/workspace/approvals/${asked.body.id}/export.csv`)
        .expect(200);
      expect(csv.headers['content-type']).toContain('text/csv');
      expect(csv.text).toContain('created_at_utc,actor_user_id,actor_email,action');
      expect(csv.text).not.toContain(leadB1.userId);
    });

    it('cancel is only for the requester', async () => {
      const asked = await as(leadA1)
        .post('/platform/workspace/approvals', {
          type: 'audit.export',
          payload: { from: '2026-03-01', to: '2026-03-31' },
          reason: 'La voy a cancelar',
        })
        .expect(201);
      await as(leadA2).post(`/platform/workspace/approvals/${asked.body.id}/cancel`).expect(403);
      const cancelled = await as(leadA1)
        .post(`/platform/workspace/approvals/${asked.body.id}/cancel`)
        .expect(201);
      expect(cancelled.body.status).toBe('cancelled');
    });
  });

  it('every platform request is recorded in the caller’s team trail', async () => {
    const before = await admin.auditLog.count({
      where: {
        organizationId: leadB1.orgId,
        action: 'platform.request',
        actorUserId: leadB1.userId,
      },
    });
    await as(leadB1).get('/platform/workspace/team').expect(200);
    const after = await admin.auditLog.findMany({
      where: {
        organizationId: leadB1.orgId,
        action: 'platform.request',
        actorUserId: leadB1.userId,
      },
      orderBy: { createdAt: 'desc' },
    });
    expect(after.length).toBe(before + 1);
    expect(after[0].metadata).toMatchObject({
      method: 'GET',
      route: '/platform/workspace/team',
      status: 200,
    });
  });
});
