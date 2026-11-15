import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { Role } from '@adoptafacil/contracts';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PasswordService } from '../src/core/auth/password.service';
import { TokenService } from '../src/core/auth/token.service';
import { PlansService } from '../src/core/plans/plans.service';
import { purgeOrganizations } from './support/cleanup';
import { LEGAL_ORG } from './support/legal';

/**
 * Pantalla "Miembros" sobre HTTP contra la app real: listar el equipo con sus
 * puestos del plan, cambiar el cargo de una persona y retirarla. Casos de
 * abuso: rol sin permiso, escalar a propietario, dejar la organización sin
 * propietario, retirarse a sí mismo, otra organización, firmantes (no se tocan
 * aquí ni ocupan puesto) y el tope del plan al devolverle el acceso a alguien.
 */
describe('Org team members (Miembros)', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  let plans: PlansService;
  const admin = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  const createdOrgIds: string[] = [];
  const password = 'password-1234';

  interface Actor {
    token: string;
    userId: string;
    orgId: string;
  }

  let owner: Actor;
  let otherOwner: Actor;

  async function registerOrg(name: string): Promise<Actor> {
    const res = await request(server)
      .post('/auth/register/organization')
      .send({
        ...LEGAL_ORG,
        organizationName: name,
        displayName: 'Dueña',
        email: `team-${randomUUID()}@test.local`,
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

  async function memberOf(orgId: string, role: Role, name: string = role): Promise<Actor> {
    const userId = randomUUID();
    const email = `team-member-${randomUUID()}@test.local`;
    const passwordHash = await new PasswordService().hash(password);
    await admin.user.create({
      data: {
        id: userId,
        organizationId: orgId,
        accountType: 'organization',
        email,
        displayName: name,
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
  const list = (actor: Actor) => request(server).get('/org/members').set(auth(actor));
  const changeRole = (actor: Actor, userId: string, role: string) =>
    request(server).put(`/org/members/${userId}/role`).set(auth(actor)).send({ role });
  const remove = (actor: Actor, userId: string) =>
    request(server).delete(`/org/members/${userId}`).set(auth(actor));
  const setEnforced = (value: boolean) =>
    Object.defineProperty(plans, 'enforced', { value, configurable: true });
  const setPromoEnd = (value: Date | null) =>
    Object.defineProperty(plans, 'promoEndsAt', { value, configurable: true });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    server = app.getHttpServer();
    plans = app.get(PlansService);

    owner = await registerOrg('Refugio Equipo');
    otherOwner = await registerOrg('Refugio Vecino');
  });

  afterEach(() => {
    setEnforced(false);
    setPromoEnd(null);
  });

  afterAll(async () => {
    await purgeOrganizations(admin, createdOrgIds);
    await admin.$disconnect();
    await app?.close();
  });

  it('lists the team (owner first) with seats; only Owner and Administrator may see it', async () => {
    const administrator = await memberOf(owner.orgId, Role.Administrator, 'Ana Admin');
    const operator = await memberOf(owner.orgId, Role.Operator, 'Oscar Operador');

    const res = await list(owner).expect(200);
    const ids = res.body.members.map((m: { userId: string }) => m.userId);
    expect(ids[0]).toBe(owner.userId);
    expect(ids).toEqual(expect.arrayContaining([administrator.userId, operator.userId]));
    const ana = res.body.members.find((m: { userId: string }) => m.userId === administrator.userId);
    expect(ana).toMatchObject({ displayName: 'Ana Admin', roles: [Role.Administrator] });
    expect(ana.email).toMatch(/@test\.local$/);
    expect(res.body.seats).toMatchObject({ used: ids.length, limit: null });

    await list(administrator).expect(200);
    await list(operator).expect(403);
    // La otra organización solo se ve a sí misma.
    const other = await list(otherOwner).expect(200);
    expect(other.body.members.map((m: { userId: string }) => m.userId)).toEqual([
      otherOwner.userId,
    ]);
  });

  it('changes a role (audited); an Administrator can never reach or touch an Owner', async () => {
    const administrator = await memberOf(owner.orgId, Role.Administrator);
    const operator = await memberOf(owner.orgId, Role.Operator);

    await changeRole(administrator, operator.userId, Role.Veterinarian).expect(204);
    const roles = await admin.userRole.findMany({ where: { userId: operator.userId } });
    expect(roles.map((r) => r.role)).toEqual([Role.Veterinarian]);
    const audit = await admin.auditLog.findFirst({
      where: {
        organizationId: owner.orgId,
        action: 'member.role_changed',
        entityId: operator.userId,
      },
    });
    expect(audit?.metadata).toMatchObject({ from: [Role.Operator], to: Role.Veterinarian });

    await changeRole(administrator, operator.userId, Role.Owner).expect(403);
    await changeRole(administrator, owner.userId, Role.Operator).expect(403);
    await changeRole(administrator, operator.userId, 'platform_admin').expect(400);
    await changeRole(operator, administrator.userId, Role.Volunteer).expect(403);
  });

  it('never leaves the organization without an Owner', async () => {
    await changeRole(owner, owner.userId, Role.Administrator).expect(409);
    const second = await memberOf(owner.orgId, Role.Operator);
    await changeRole(owner, second.userId, Role.Owner).expect(204);
    // Con otra propietaria ya se puede pasar a administradora.
    await changeRole(second, owner.userId, Role.Administrator).expect(204);
    await changeRole(second, owner.userId, Role.Owner).expect(204);
    await remove(owner, second.userId).expect(204);
  });

  it('removes a member: loses access at once, sessions closed, listed as former; can be restored', async () => {
    const administrator = await memberOf(owner.orgId, Role.Administrator);
    const operator = await memberOf(owner.orgId, Role.Operator);
    await admin.refreshToken.create({
      data: {
        userId: operator.userId,
        tokenHash: `hash-${randomUUID()}`,
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });
    await request(server).get('/animals').set(auth(operator)).expect(200);

    await remove(administrator, operator.userId).expect(204);
    await request(server).get('/animals').set(auth(operator)).expect(403);
    expect(await admin.refreshToken.count({ where: { userId: operator.userId } })).toBe(0);
    await remove(administrator, operator.userId).expect(409);

    const res = await list(owner).expect(200);
    expect(res.body.members.map((m: { userId: string }) => m.userId)).not.toContain(
      operator.userId,
    );
    expect(res.body.formerMembers.map((m: { userId: string }) => m.userId)).toContain(
      operator.userId,
    );

    await changeRole(owner, operator.userId, Role.Volunteer).expect(204);
    const restored = await admin.auditLog.findFirst({
      where: { action: 'member.restored', entityId: operator.userId },
    });
    expect(restored).not.toBeNull();
  });

  it('refuses self-removal, an Administrator removing an Owner, and another organization', async () => {
    const administrator = await memberOf(owner.orgId, Role.Administrator);
    await remove(owner, owner.userId).expect(400);
    await remove(administrator, owner.userId).expect(403);
    await remove(otherOwner, administrator.userId).expect(404);
    await changeRole(otherOwner, administrator.userId, Role.Volunteer).expect(404);
    await remove(owner, 'not-a-uuid').expect(400);
  });

  it('signers are managed in Firmantes and do not use a seat', async () => {
    const before = (await list(owner).expect(200)).body.seats.used as number;
    const signer = await memberOf(owner.orgId, Role.ReadOnlyAuditor, 'Carla Contadora');
    await admin.orgSignerDesignation.create({
      data: {
        organizationId: owner.orgId,
        userId: signer.userId,
        role: 'accountant',
        designatedByUserId: owner.userId,
      },
    });
    const res = await list(owner).expect(200);
    expect(res.body.seats.used).toBe(before);
    const carla = res.body.members.find((m: { userId: string }) => m.userId === signer.userId);
    expect(carla).toMatchObject({ signerRole: 'accountant' });
    await changeRole(owner, signer.userId, Role.Operator).expect(409);
    await remove(owner, signer.userId).expect(409);
  });

  it('restoring access respects the members limit of the plan', async () => {
    const fresh = await registerOrg('Refugio Plan Gratis');
    const a = await memberOf(fresh.orgId, Role.Operator);
    await memberOf(fresh.orgId, Role.Operator);
    await remove(fresh, a.userId).expect(204);
    await memberOf(fresh.orgId, Role.Volunteer);
    // Gratis: 3 puestos, hoy ocupados (dueña + 2).
    setEnforced(true);
    setPromoEnd(new Date(Date.now() - 86_400_000));
    const view = await list(fresh).expect(200);
    expect(view.body.seats).toMatchObject({ used: 3, limit: 3, planName: 'Gratis' });
    const full = await changeRole(fresh, a.userId, Role.Operator).expect(403);
    expect(full.body).toMatchObject({ code: 'PLAN_REQUIRED', limit: 'members' });
  });
});
