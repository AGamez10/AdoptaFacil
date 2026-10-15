import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { Role } from '@adoptafacil/contracts';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PasswordService } from '../src/core/auth/password.service';
import { TokenService } from '../src/core/auth/token.service';
import { purgeOrganizations } from './support/cleanup';
import { LEGAL_ORG, LEGAL_PERSON } from './support/legal';

/**
 * Ola 1 · R2-1 (AF-023, MVP-RF-07, MVP-RF-10) over HTTP against the real app:
 *   - a new organization starts as a draft, its Owner submits it for review;
 *   - only the platform approves, observes, rejects or suspends, following the
 *     allowed transitions, with a reason where it matters, audited in the
 *     organization's own trail;
 *   - only approved organizations are public (portal and catalogs);
 *   - a suspension blocks the backoffice at once (already issued tokens
 *     included) without deleting anything, and lifting it restores access.
 */
describe('Organization status, approval and suspension (R2-1, AF-023)', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  const admin = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  const createdOrgIds: string[] = [];
  const password = 'password-1234';

  interface Actor {
    token: string;
    userId: string;
    orgId: string;
  }

  let owner: Actor;
  let administrator: Actor;
  let platform: Actor;
  let person: Actor;
  let slug: string;
  let productId: string;

  async function register(kind: 'organization' | 'person', name: string): Promise<Actor> {
    const res = await request(server)
      .post(`/auth/register/${kind}`)
      .send({
        ...(kind === 'organization' ? LEGAL_ORG : LEGAL_PERSON),
        organizationName: name,
        displayName: name,
        email: `status-${randomUUID()}@test.local`,
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
    const email = `status-member-${randomUUID()}@test.local`;
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
  const changeStatus = (actor: Actor, orgId: string, body: Record<string, unknown>) =>
    request(server).post(`/platform/organizations/${orgId}/status`).set(auth(actor)).send(body);
  const isPublic = async (): Promise<boolean> => {
    const portal = await request(server).get(`/public/organizations/${slug}`);
    const product = await request(server).get(`/public/marketplace/products/${productId}`);
    const catalog = await request(server).get(
      `/public/marketplace/products?organizationId=${owner.orgId}`,
    );
    const listed = (catalog.body.items ?? []).some((p: { id: string }) => p.id === productId);
    // The three views must agree: all public or all hidden.
    expect([portal.status === 200, product.status === 200, listed]).toEqual(
      Array(3).fill(portal.status === 200),
    );
    return portal.status === 200;
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    server = app.getHttpServer();

    owner = await register('organization', 'Refugio Estado');
    administrator = await memberOf(owner.orgId, Role.Administrator);
    person = await register('person', 'Persona Estado');
    platform = await register('person', 'Revisor Plataforma');
    await admin.userRole.create({
      data: { organizationId: platform.orgId, userId: platform.userId, role: Role.PlatformAdmin },
    });

    slug = `estado-${randomUUID().slice(0, 8)}`;
    await request(server).put('/org/profile').set(auth(owner)).send({ slug }).expect(200);
    const product = await request(server)
      .post('/marketplace/products')
      .set(auth(owner))
      .send({ name: 'Collar', category: 'accessories', price: 20000 })
      .expect(201);
    productId = product.body.id;
  });

  afterAll(async () => {
    await purgeOrganizations(admin, createdOrgIds);
    await admin.$disconnect();
    await app?.close();
  });

  it('a new organization starts as a draft and is not public', async () => {
    const res = await request(server).get('/org/status').set(auth(owner)).expect(200);
    expect(res.body).toEqual({
      organizationId: owner.orgId,
      status: 'draft',
      reason: null,
      changedAt: null,
    });
    expect(await isPublic()).toBe(false);
  });

  it('a person account is approved from the start (nothing to review)', async () => {
    const row = await admin.organization.findUnique({ where: { id: person.orgId } });
    expect(row?.status).toBe('approved');
  });

  it('only the Owner submits the organization for review', async () => {
    await request(server).post('/org/status/submit').set(auth(administrator)).expect(403);
    const res = await request(server).post('/org/status/submit').set(auth(owner)).expect(200);
    expect(res.body.status).toBe('pending_review');
    // Already in review: nothing to submit.
    await request(server).post('/org/status/submit').set(auth(owner)).expect(409);
    expect(await isPublic()).toBe(false);
  });

  it('an organization cannot change its own status through the platform route (403)', async () => {
    await changeStatus(owner, owner.orgId, { status: 'approved' }).expect(403);
    await changeStatus(person, owner.orgId, { status: 'approved' }).expect(403);
    await request(server).get('/platform/organizations').set(auth(owner)).expect(403);
  });

  it('the review queue lists real organizations only, filtered by status', async () => {
    const res = await request(server)
      .get('/platform/organizations?status=pending_review')
      .set(auth(platform))
      .expect(200);
    const ids = res.body.map((o: { organizationId: string }) => o.organizationId);
    expect(ids).toContain(owner.orgId);
    expect(ids).not.toContain(person.orgId);
    expect(ids).not.toContain(platform.orgId);
    expect(res.body.every((o: { status: string }) => o.status === 'pending_review')).toBe(true);
    await request(server)
      .get('/platform/organizations?status=bogus')
      .set(auth(platform))
      .expect(400);
  });

  it('validates the platform request: id, transition, reason, unknown org', async () => {
    await changeStatus(platform, 'not-a-uuid', { status: 'approved' }).expect(400);
    await changeStatus(platform, owner.orgId, { status: 'nope' }).expect(400);
    await changeStatus(platform, owner.orgId, { status: 'approved', extra: 1 }).expect(400);
    // pending_review → suspended is not an allowed transition.
    await changeStatus(platform, owner.orgId, { status: 'suspended', reason: 'x' }).expect(400);
    // Observing requires a reason the organization can read.
    await changeStatus(platform, owner.orgId, { status: 'observed' }).expect(400);
    await changeStatus(platform, randomUUID(), { status: 'approved' }).expect(404);
  });

  it('observed → the Owner resubmits → approved: the organization becomes public', async () => {
    await changeStatus(platform, owner.orgId, {
      status: 'observed',
      reason: 'Falta el RUT actualizado',
    }).expect(200);
    const seen = await request(server).get('/org/status').set(auth(owner)).expect(200);
    expect(seen.body).toMatchObject({ status: 'observed', reason: 'Falta el RUT actualizado' });
    expect(await isPublic()).toBe(false);

    await request(server).post('/org/status/submit').set(auth(owner)).expect(200);
    const approved = await changeStatus(platform, owner.orgId, { status: 'approved' }).expect(200);
    expect(approved.body).toMatchObject({ status: 'approved', reason: null });
    expect(new Date(approved.body.changedAt).toISOString()).toBe(approved.body.changedAt);
    expect(await isPublic()).toBe(true);
  });

  it('two reviewers deciding at once: exactly one change wins', async () => {
    const results = await Promise.all([
      changeStatus(platform, owner.orgId, { status: 'observed', reason: 'Revisión A' }),
      changeStatus(platform, owner.orgId, { status: 'observed', reason: 'Revisión B' }),
    ]);
    const codes = results.map((r) => r.status).sort();
    // The loser either read the old status (conditional update → 409) or the
    // new one (observed → observed is not a transition → 400); never both win.
    expect(codes[0]).toBe(200);
    expect([400, 409]).toContain(codes[1]);
    const events = await admin.auditLog.count({
      where: {
        organizationId: owner.orgId,
        action: 'organization.status_changed',
        metadata: { path: ['to'], equals: 'observed' },
      },
    });
    expect(events).toBe(2); // the earlier observation + exactly one of these two
    // Back to approved for the next cases.
    await request(server).post('/org/status/submit').set(auth(owner)).expect(200);
    await changeStatus(platform, owner.orgId, { status: 'approved' }).expect(200);
  });

  it('a suspension blocks the backoffice at once, keeps the session and the data', async () => {
    await changeStatus(platform, owner.orgId, { status: 'suspended' }).expect(400);
    await changeStatus(platform, owner.orgId, {
      status: 'suspended',
      reason: 'Denuncia en verificación',
    }).expect(200);

    // Same token as before the suspension: blocked now, for every role.
    for (const actor of [owner, administrator]) {
      const blocked = await request(server).get('/rbac/my-roles').set(auth(actor)).expect(403);
      expect(blocked.body.code).toBe('ORGANIZATION_SUSPENDED');
    }
    await request(server).get('/marketplace/products').set(auth(owner)).expect(403);
    await request(server).post('/org/invitations').set(auth(owner)).send({}).expect(403);
    // What stays reachable: the session itself and the status explaining it.
    await request(server).get('/auth/me').set(auth(owner)).expect(200);
    const status = await request(server).get('/org/status').set(auth(owner)).expect(200);
    expect(status.body).toMatchObject({ status: 'suspended', reason: 'Denuncia en verificación' });
    // Not public while suspended; nothing was deleted.
    expect(await isPublic()).toBe(false);
    expect(await admin.product.count({ where: { id: productId } })).toBe(1);
    // Other organizations are unaffected.
    await request(server).get('/rbac/my-roles').set(auth(platform)).expect(200);
  });

  it('lifting the suspension restores the backoffice and the public surface', async () => {
    await changeStatus(platform, owner.orgId, { status: 'approved' }).expect(200);
    await request(server).get('/rbac/my-roles').set(auth(owner)).expect(200);
    expect(await isPublic()).toBe(true);
  });

  it('every change is audited in the organization trail, with who and why', async () => {
    const events = await admin.auditLog.findMany({
      where: { organizationId: owner.orgId, action: 'organization.status_changed' },
      orderBy: { createdAt: 'asc' },
    });
    const steps = events.map((e) => {
      const m = e.metadata as { from: string; to: string; by: string };
      return `${m.from}>${m.to}:${m.by}`;
    });
    expect(steps).toEqual([
      'draft>pending_review:organization',
      'pending_review>observed:platform',
      'observed>pending_review:organization',
      'pending_review>approved:platform',
      'approved>observed:platform',
      'observed>pending_review:organization',
      'pending_review>approved:platform',
      'approved>suspended:platform',
      'suspended>approved:platform',
    ]);
    const suspension = events.find((e) => (e.metadata as { to: string }).to === 'suspended');
    expect(suspension?.actorUserId).toBe(platform.userId);
    expect(suspension?.metadata).toMatchObject({ reason: 'Denuncia en verificación' });
  });
});
