import { createHash, randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { Role } from '@adoptafacil/contracts';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PasswordService } from '../src/core/auth/password.service';
import { TokenService } from '../src/core/auth/token.service';
import {
  NOTIFICATION_PORT,
  type NotificationMessage,
  type NotificationPort,
} from '../src/core/notifications/notification.port';
import { purgeOrganizations } from './support/cleanup';

/**
 * Ola 1 · R2-3 (AF-017, condition C9) over HTTP against the real app: member
 * invitations with a random single-use token tied to one organization and one
 * email, with an expiry, only the hash stored, plus the abuse cases (reuse,
 * expiry, revocation, replacement, guessing, cross-organization, role
 * escalation, races, suspended organization).
 *
 * Own app instance so the per-IP throttler budget of the public invitation
 * routes (10/min each) is not shared with other suites; each route is called
 * at most 10 times here.
 */
class CapturingNotificationPort implements NotificationPort {
  readonly sent: NotificationMessage[] = [];
  async send(message: NotificationMessage): Promise<void> {
    this.sent.push(message);
  }
}

describe('Member invitations (R2-3, AF-017)', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  const admin = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  const notifications = new CapturingNotificationPort();
  const createdOrgIds: string[] = [];
  const password = 'password-1234';

  interface Actor {
    token: string;
    userId: string;
    orgId: string;
  }

  let owner: Actor;
  let administrator: Actor;
  let operator: Actor;
  let otherOwner: Actor;

  async function registerOrg(name: string): Promise<Actor> {
    const res = await request(server)
      .post('/auth/register/organization')
      .send({
        organizationName: name,
        displayName: 'Owner',
        email: `inv-${randomUUID()}@test.local`,
        password,
      })
      .expect(201);
    createdOrgIds.push(res.body.user.organizationId);
    return {
      token: res.body.tokens.accessToken,
      userId: res.body.user.id,
      orgId: res.body.user.organizationId,
    };
  }

  async function memberOf(orgId: string, role: Role): Promise<Actor> {
    const userId = randomUUID();
    const email = `inv-member-${randomUUID()}@test.local`;
    const passwordHash = await new PasswordService().hash(password);
    await admin.user.create({
      data: {
        id: userId,
        organizationId: orgId,
        accountType: 'organization',
        email,
        displayName: role,
      },
    });
    await admin.authCredential.create({
      data: { userId, organizationId: orgId, accountType: 'organization', email, passwordHash },
    });
    await admin.userRole.create({ data: { organizationId: orgId, userId, role } });
    const tokens = await app
      .get(TokenService)
      .issueTokens({ userId, organizationId: orgId, accountType: 'organization', email });
    return { token: tokens.accessToken, userId, orgId };
  }

  const auth = (actor: Actor) => ({ Authorization: `Bearer ${actor.token}` });
  const invite = (actor: Actor, email: string, role: string) =>
    request(server).post('/org/invitations').set(auth(actor)).send({ email, role });
  const preview = (token: string) =>
    request(server).post('/auth/invitations/preview').send({ token });
  const accept = (token: string, extra: Record<string, unknown> = {}) =>
    request(server)
      .post('/auth/invitations/accept')
      .send({ token, displayName: 'Invitada', password, ...extra });

  /** The raw token lives ONLY in the emailed link, in its fragment. */
  function lastTokenFor(email: string): string {
    const message = [...notifications.sent].reverse().find((m) => m.to === email);
    const match = message?.body.match(/\/invitacion#token=([A-Za-z0-9_%-]+)/);
    if (!match) throw new Error(`no invitation link sent to ${email}`);
    return decodeURIComponent(match[1]);
  }

  async function invited(role: Role = Role.Operator, by: Actor = owner) {
    const email = `invitee-${randomUUID()}@test.local`;
    const res = await invite(by, email, role).expect(201);
    return { email, id: res.body.id as string, token: lastTokenFor(email) };
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(NOTIFICATION_PORT)
      .useValue(notifications)
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
    server = app.getHttpServer();

    owner = await registerOrg('Refugio Invita');
    administrator = await memberOf(owner.orgId, Role.Administrator);
    operator = await memberOf(owner.orgId, Role.Operator);
    otherOwner = await registerOrg('Refugio Ajeno');
  });

  afterAll(async () => {
    await purgeOrganizations(admin, createdOrgIds);
    await admin.$disconnect();
    await app?.close();
  });

  it('an Owner invites: the token is only emailed, the database keeps its hash', async () => {
    const email = `invitee-${randomUUID()}@test.local`;
    const res = await invite(owner, email.toUpperCase(), Role.Veterinarian).expect(201);
    expect(res.body).toMatchObject({
      organizationId: owner.orgId,
      email,
      role: Role.Veterinarian,
      status: 'pending',
      invitedByUserId: owner.userId,
    });
    expect(JSON.stringify(res.body)).not.toMatch(/token/i);
    const token = lastTokenFor(email);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);

    const row = await admin.organizationInvitation.findUniqueOrThrow({
      where: { id: res.body.id },
    });
    expect(row.tokenHash).toBe(createHash('sha256').update(token).digest('hex'));
    expect(JSON.stringify(row)).not.toContain(token);
    // 7-day expiry (TODO(client) to confirm), stored in UTC.
    const days = (row.expiresAt.getTime() - row.createdAt.getTime()) / 86_400_000;
    expect(days).toBeCloseTo(7, 2);
  });

  it('deny-by-default: who may invite, and with which role', async () => {
    const email = () => `invitee-${randomUUID()}@test.local`;
    await invite(administrator, email(), Role.Operator).expect(201);
    // Only an Owner invites an Owner (AF-007 applied to invitations).
    await invite(administrator, email(), Role.Owner).expect(403);
    await invite(operator, email(), Role.Volunteer).expect(403);
    // Platform roles are never invitable; bad input is a 400.
    await invite(owner, email(), Role.PlatformAdmin).expect(400);
    await invite(owner, 'not-an-email', Role.Operator).expect(400);
    await request(server)
      .post('/org/invitations')
      .set(auth(owner))
      .send({ email: email(), role: Role.Operator, organizationId: otherOwner.orgId })
      .expect(400);
    await request(server)
      .post('/org/invitations')
      .send({ email: email(), role: 'operator' })
      .expect(401);
  });

  it('an email that already has an account cannot be invited (409)', async () => {
    const existing = await admin.authCredential.findFirstOrThrow({
      where: { userId: operator.userId },
    });
    await invite(owner, existing.email, Role.Volunteer).expect(409);
  });

  it('preview shows the organization, email and role; bad tokens get one answer', async () => {
    const inv = await invited(Role.Volunteer);
    const res = await preview(inv.token).expect(200);
    expect(res.body).toEqual({
      organizationName: 'Refugio Invita',
      email: inv.email,
      role: Role.Volunteer,
      expiresAt: expect.any(String),
    });
    // A guessed token and a malformed one: same 400, nothing revealed.
    const guessed = await preview('A'.repeat(43)).expect(400);
    expect(guessed.body.message).toBe('Invalid or expired invitation');
    await preview('short').expect(400);
  });

  it('accepting creates the account INSIDE the inviting organization with the invited role', async () => {
    const inv = await invited(Role.Volunteer);
    const res = await accept(inv.token).expect(201);
    expect(res.body.user).toMatchObject({
      email: inv.email,
      accountType: 'organization',
      organizationId: owner.orgId,
    });
    const roles = await request(server)
      .get('/rbac/my-roles')
      .set('Authorization', `Bearer ${res.body.tokens.accessToken}`)
      .expect(200);
    expect(JSON.stringify(roles.body)).toContain(Role.Volunteer);

    // Single use: the same link never works twice.
    await accept(inv.token, { password: 'otra-clave-larga' }).expect(400);
    const list = await request(server).get('/org/invitations').set(auth(owner)).expect(200);
    expect(list.body.find((i: { id: string }) => i.id === inv.id).status).toBe('accepted');

    const audit = await admin.auditLog.findMany({
      where: { organizationId: owner.orgId, entityId: inv.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(audit.map((a) => a.action)).toEqual(['invitation.created', 'invitation.accepted']);
    expect(JSON.stringify(audit)).not.toContain(inv.token);
  });

  it('a new password must meet the policy (12 characters)', async () => {
    const inv = await invited();
    await accept(inv.token, { password: 'corta' }).expect(400);
    await accept(inv.token, { displayName: '' }).expect(400);
  });

  it('expired, revoked and replaced links stop working', async () => {
    const expired = await invited();
    await admin.organizationInvitation.update({
      where: { id: expired.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await preview(expired.token).expect(400);

    const revoked = await invited();
    await request(server).delete(`/org/invitations/${revoked.id}`).set(auth(owner)).expect(204);
    await request(server).delete(`/org/invitations/${revoked.id}`).set(auth(owner)).expect(409);
    await accept(revoked.token).expect(400);

    // Re-inviting the same email replaces the pending link.
    const first = await invited();
    await invite(owner, first.email, Role.Operator).expect(201);
    const second = lastTokenFor(first.email);
    expect(second).not.toBe(first.token);
    await preview(first.token).expect(400);
    await preview(second).expect(200);
  });

  it('another organization can neither see nor revoke these invitations', async () => {
    const inv = await invited();
    const theirs = await request(server).get('/org/invitations').set(auth(otherOwner)).expect(200);
    expect(theirs.body.some((i: { id: string }) => i.id === inv.id)).toBe(false);
    await request(server).delete(`/org/invitations/${inv.id}`).set(auth(otherOwner)).expect(404);
    await request(server).delete('/org/invitations/not-a-uuid').set(auth(owner)).expect(400);
    // An Administrator cannot revoke an Owner invitation.
    const ownerInvite = await invited(Role.Owner);
    await request(server)
      .delete(`/org/invitations/${ownerInvite.id}`)
      .set(auth(administrator))
      .expect(403);
  });

  it('two acceptances of the same link at once: exactly one account is created', async () => {
    const inv = await invited();
    const results = await Promise.all([accept(inv.token), accept(inv.token)]);
    const codes = results.map((r) => r.status).sort();
    // The loser sees the link already used (400) or, past that check, the
    // email already taken (409); never two accounts.
    expect(codes[0]).toBe(201);
    expect([400, 409]).toContain(codes[1]);
    expect(await admin.authCredential.count({ where: { email: inv.email } })).toBe(1);
  });

  it('a suspended organization cannot onboard anyone through a pending link', async () => {
    const inv = await invited();
    await admin.organization.update({ where: { id: owner.orgId }, data: { status: 'suspended' } });
    try {
      await accept(inv.token).expect(400);
      expect(await admin.authCredential.count({ where: { email: inv.email } })).toBe(0);
    } finally {
      await admin.organization.update({ where: { id: owner.orgId }, data: { status: 'draft' } });
    }
  });
});
