import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { Role } from '@adoptafacil/contracts';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PasswordService } from '../src/core/auth/password.service';
import { TokenService } from '../src/core/auth/token.service';
import {
  DefaultCredentialsCheck,
  LEGACY_SEED_EMAIL,
} from '../src/core/rbac/default-credentials.check';
import { purgeOrganizations } from './support/cleanup';

/**
 * Ola 1 · hilo 2 (RBAC y organizaciones), proven over HTTP against the real app
 * (live Postgres + Redis, runtime role without BYPASSRLS):
 *   - AF-007: an Administrator cannot grant Owner (to itself or anyone);
 *   - AF-008: the last Owner cannot be revoked (409), and revocations are audited;
 *   - SEC-022: malformed revoke params are a 400, never a 500;
 *   - AF-009: the tenant comes only from the JWT — an x-org-id header can neither
 *     open a route nor switch the tenant of a valid token;
 *   - AF-026: Argon2id for new passwords, legacy bcrypt upgraded on sign-in,
 *     12-character minimum for new passwords;
 *   - AF-037: the legacy seed account with its default password is detected.
 */
describe('RBAC governance (AF-007, AF-008, AF-009, AF-026, AF-037)', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  const admin = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  const createdOrgIds: string[] = [];
  const password = 'password-1234';

  interface Actor {
    token: string;
    userId: string;
    orgId: string;
    email: string;
  }

  let owner: Actor;
  let administrator: Actor;
  let operator: Actor;
  let otherOrg: Actor;

  async function registerOrg(name: string): Promise<Actor> {
    const email = `gov-${randomUUID()}@test.local`;
    const res = await request(server)
      .post('/auth/register/organization')
      .send({ organizationName: name, displayName: 'Owner', email, password })
      .expect(201);
    createdOrgIds.push(res.body.user.organizationId);
    return {
      token: res.body.tokens.accessToken,
      userId: res.body.user.id,
      orgId: res.body.user.organizationId,
      email,
    };
  }

  /** A second account INSIDE `orgId` holding `role`, able to sign in. Created
   *  directly (the invitation flow has its own spec); its token is issued
   *  by the real TokenService so the auth rate limit is not spent here. */
  async function memberOf(orgId: string, role: Role): Promise<Actor> {
    const userId = randomUUID();
    const email = `gov-member-${randomUUID()}@test.local`;
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
    return { token: tokens.accessToken, userId, orgId, email };
  }

  const assign = (actor: Actor, userId: string, role: string) =>
    request(server)
      .post('/rbac/roles')
      .set('Authorization', `Bearer ${actor.token}`)
      .send({ userId, role });

  const revoke = (actor: Actor, userId: string, role: string) =>
    request(server)
      .delete(`/rbac/roles/${userId}/${role}`)
      .set('Authorization', `Bearer ${actor.token}`);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    server = app.getHttpServer();

    owner = await registerOrg('Refugio Gobierno A');
    administrator = await memberOf(owner.orgId, Role.Administrator);
    operator = await memberOf(owner.orgId, Role.Operator);
    otherOrg = await registerOrg('Refugio Gobierno B');
  });

  afterAll(async () => {
    await admin.authCredential.deleteMany({ where: { email: LEGACY_SEED_EMAIL } });
    await purgeOrganizations(admin, createdOrgIds);
    await admin.$disconnect();
    await app?.close();
  });

  describe('AF-007 · only an Owner grants Owner', () => {
    it('an Administrator cannot promote itself to Owner (403)', async () => {
      await assign(administrator, administrator.userId, Role.Owner).expect(403);
      const roles = await admin.userRole.findMany({ where: { userId: administrator.userId } });
      expect(roles.map((r) => r.role)).toEqual([Role.Administrator]);
    });

    it('an Administrator cannot promote someone else to Owner (403)', async () => {
      await assign(administrator, operator.userId, Role.Owner).expect(403);
    });

    it('an Administrator can still grant non-Owner roles (201)', async () => {
      await assign(administrator, operator.userId, Role.Volunteer).expect(201);
    });

    it('an Operator cannot assign any role (403)', async () => {
      await assign(operator, operator.userId, Role.Administrator).expect(403);
    });

    it('an Owner can grant Owner (201) and it is audited', async () => {
      await assign(owner, administrator.userId, Role.Owner).expect(201);
      const event = await admin.auditLog.findFirst({
        where: {
          organizationId: owner.orgId,
          action: 'role.assigned',
          entityId: administrator.userId,
        },
        orderBy: { createdAt: 'desc' },
      });
      expect(event?.metadata).toMatchObject({ role: Role.Owner });
    });
  });

  describe('AF-008 · an organization never loses its last Owner', () => {
    it('with two Owners, one can be revoked (204) and the revocation is audited', async () => {
      await revoke(owner, administrator.userId, Role.Owner).expect(204);
      const event = await admin.auditLog.findFirst({
        where: {
          organizationId: owner.orgId,
          action: 'role.revoked',
          entityId: administrator.userId,
        },
      });
      expect(event?.actorUserId).toBe(owner.userId);
      expect(event?.metadata).toMatchObject({ role: Role.Owner });
    });

    it('the last Owner cannot revoke itself (409)', async () => {
      await revoke(owner, owner.userId, Role.Owner).expect(409);
      const owners = await admin.userRole.findMany({
        where: { organizationId: owner.orgId, role: Role.Owner },
      });
      expect(owners).toHaveLength(1);
    });

    it('two Owners revoking each other at the same time leave exactly one Owner', async () => {
      const second = await memberOf(owner.orgId, Role.Owner);
      const results = await Promise.all([
        revoke(owner, second.userId, Role.Owner),
        revoke(second, owner.userId, Role.Owner),
      ]);
      const codes = results.map((r) => r.status).sort();
      // One revocation wins. The loser is stopped either by the row lock
      // (409, last Owner) or, if the winner already committed, by the
      // RolesGuard because it is no longer an Owner (403). Never both win.
      expect(codes[0]).toBe(204);
      expect([403, 409]).toContain(codes[1]);
      const owners = await admin.userRole.findMany({
        where: { organizationId: owner.orgId, role: Role.Owner },
      });
      expect(owners).toHaveLength(1);
      // Restore the original Owner if the race removed it.
      if (owners[0].userId !== owner.userId) {
        await admin.userRole.create({
          data: { organizationId: owner.orgId, userId: owner.userId, role: Role.Owner },
        });
      }
    });

    it('revoking a role the user does not hold is a silent no-op (204, not audited)', async () => {
      const before = await admin.auditLog.count({
        where: { organizationId: owner.orgId, action: 'role.revoked' },
      });
      await revoke(owner, operator.userId, Role.Veterinarian).expect(204);
      const after = await admin.auditLog.count({
        where: { organizationId: owner.orgId, action: 'role.revoked' },
      });
      expect(after).toBe(before);
    });

    it('an Owner of another organization cannot revoke roles here (no effect)', async () => {
      await revoke(otherOrg, operator.userId, Role.Operator).expect(204);
      const roles = await admin.userRole.findMany({ where: { userId: operator.userId } });
      expect(roles.map((r) => r.role)).toContain(Role.Operator);
    });
  });

  describe('SEC-022 · malformed revoke params are a 400', () => {
    it('rejects a non-UUID user id', async () => {
      await revoke(owner, 'not-a-uuid', Role.Operator).expect(400);
    });

    it('rejects an unknown or platform role', async () => {
      await revoke(owner, operator.userId, 'emperor').expect(400);
      await revoke(owner, operator.userId, Role.PlatformSuperAdmin).expect(400);
    });
  });

  describe('AF-009 · the tenant comes only from the JWT', () => {
    it('an x-org-id header without a token opens nothing (401)', async () => {
      await request(server).get('/rbac/roles').set('x-org-id', owner.orgId).expect(401);
    });

    it('an x-org-id header cannot switch the tenant of a valid token', async () => {
      const res = await request(server)
        .get('/rbac/roles')
        .set('Authorization', `Bearer ${otherOrg.token}`)
        .set('x-org-id', owner.orgId)
        .expect(200);
      const orgIds = new Set(res.body.map((r: { organizationId: string }) => r.organizationId));
      expect([...orgIds]).toEqual([otherOrg.orgId]);
    });

    it('an organizationId in the body is ignored when assigning roles', async () => {
      // Owner of B tries to assign in A by smuggling A's id: the target user
      // (of A) is invisible under B's tenant → 404, and the schema drops the key.
      await request(server)
        .post('/rbac/roles')
        .set('Authorization', `Bearer ${otherOrg.token}`)
        .send({ userId: operator.userId, role: Role.Administrator, organizationId: owner.orgId })
        .expect(404);
    });
  });

  describe('AF-026 · password hashing and policy', () => {
    it('stores new passwords as Argon2id', async () => {
      const credential = await admin.authCredential.findUnique({ where: { email: owner.email } });
      expect(credential?.passwordHash.startsWith('$argon2id$')).toBe(true);
    });

    it('rejects a new password shorter than 12 characters (400)', async () => {
      await request(server)
        .post('/auth/register/person')
        .send({
          displayName: 'Corta',
          email: `gov-short-${randomUUID()}@test.local`,
          password: '12345678',
        })
        .expect(400);
    });

    it('upgrades a legacy bcrypt hash to Argon2id on the next successful sign-in', async () => {
      const legacy = await memberOf(owner.orgId, Role.Volunteer);
      await admin.authCredential.update({
        where: { email: legacy.email },
        data: { passwordHash: await bcrypt.hash(password, 4) },
      });
      await request(server)
        .post('/auth/login')
        .send({ email: legacy.email, password: 'wrong-password-1' })
        .expect(401);
      const stillLegacy = await admin.authCredential.findUnique({ where: { email: legacy.email } });
      expect(stillLegacy?.passwordHash.startsWith('$2')).toBe(true);

      await request(server).post('/auth/login').send({ email: legacy.email, password }).expect(200);
      const upgraded = await admin.authCredential.findUnique({ where: { email: legacy.email } });
      expect(upgraded?.passwordHash.startsWith('$argon2id$')).toBe(true);
    });
  });

  describe('AF-037 · no seed account with a default password', () => {
    const originalEnv = process.env.NODE_ENV;

    /** Runs the real seed script with only the given credential env vars. */
    function runSeed(env: Record<string, string>, args: string[] = []) {
      const clean = { ...process.env };
      delete clean.PLATFORM_ADMIN_EMAIL;
      delete clean.PLATFORM_ADMIN_PASSWORD;
      return spawnSync(
        'pnpm',
        ['exec', 'ts-node', '--transpile-only', 'scripts/seed-platform-admin.ts', ...args],
        { cwd: join(__dirname, '..'), env: { ...clean, ...env }, encoding: 'utf8' },
      );
    }

    it('the seed refuses to run without explicit credentials (no defaults)', () => {
      const run = runSeed({});
      expect(run.status).toBe(1);
      expect(run.stderr).toMatch(/No hay valores por defecto/);
    });

    it('the seed refuses the old default and short passwords', () => {
      const email = `gov-seed-${randomUUID()}@test.local`;
      expect(
        runSeed({ PLATFORM_ADMIN_EMAIL: email, PLATFORM_ADMIN_PASSWORD: 'changeme123' }).status,
      ).toBe(1);
      const variant = runSeed({
        PLATFORM_ADMIN_EMAIL: email,
        PLATFORM_ADMIN_PASSWORD: 'ChangeMe1234',
      });
      expect(variant.status).toBe(1);
      expect(variant.stderr).toMatch(/valor por defecto conocido/);
      expect(
        runSeed({ PLATFORM_ADMIN_EMAIL: email, PLATFORM_ADMIN_PASSWORD: 'corta' }).status,
      ).toBe(1);
    });

    afterEach(() => {
      process.env.NODE_ENV = originalEnv;
    });

    it('detects the legacy seed account still opening with changeme123 and refuses to boot in production', async () => {
      const check = app.get(DefaultCredentialsCheck);
      await expect(check.legacyDefaultStillWorks()).resolves.toBe(false);

      // Reproduce a database seeded before the fix.
      const userId = randomUUID();
      await admin.user.create({
        data: {
          id: userId,
          organizationId: owner.orgId,
          accountType: 'person',
          email: LEGACY_SEED_EMAIL,
          displayName: 'Legacy',
        },
      });
      await admin.authCredential.create({
        data: {
          userId,
          organizationId: owner.orgId,
          accountType: 'person',
          email: LEGACY_SEED_EMAIL,
          passwordHash: await bcrypt.hash('changeme123', 4),
        },
      });
      await expect(check.legacyDefaultStillWorks()).resolves.toBe(true);

      process.env.NODE_ENV = 'production';
      await expect(check.onApplicationBootstrap()).rejects.toThrow(/AF-037/);

      // After rotation the check passes.
      await admin.authCredential.update({
        where: { email: LEGACY_SEED_EMAIL },
        data: { passwordHash: await bcrypt.hash('una-clave-rotada-y-larga', 4) },
      });
      await expect(check.onApplicationBootstrap()).resolves.toBeUndefined();
    });
  });
});
