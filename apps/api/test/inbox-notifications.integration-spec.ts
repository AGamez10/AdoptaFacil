import { randomBytes, randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma, PrismaClient } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { hashInvitationToken } from '../src/modules/org/governance/invitations.service';
import { purgeOrganizations } from './support/cleanup';
import { LEGAL_ORG, LEGAL_PERSON } from './support/legal';
import { approveTestOrganization } from './support/organization-status';

const APP_DATABASE_URL =
  process.env.DATABASE_URL_APP ??
  'postgresql://adoptafacil_app:adoptafacil_app@localhost:5433/adoptafacil?schema=public';

/**
 * Avisos en la plataforma (bandeja por persona) y banco de recursos visible:
 *   - un ofrecimiento abierto se ve en la lista pública (sin donante), en el
 *     tablero de su propia organización (marcado, no se puede tomar) y avisa a
 *     las organizaciones aprobadas del mismo departamento;
 *   - ofrecer sobre una necesidad avisa al equipo; aceptarla avisa a quien
 *     ofreció; cada quien marca como leídos solo los suyos;
 *   - `user_notifications` aislada por tenant (casos "no-leak").
 */
describe('Inbox notifications + visible resource bank', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  const admin = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  const appDb = new PrismaClient({ datasources: { db: { url: APP_DATABASE_URL } } });
  const orgIds: string[] = [];
  const password = 'password-1234';
  const department = `Depto-${randomUUID().slice(0, 8)}`;

  interface Actor {
    token: string;
    orgId: string;
    userId: string;
  }

  async function registerOrg(tag: string): Promise<Actor> {
    const res = await request(server)
      .post('/auth/register/organization')
      .send({
        ...LEGAL_ORG,
        organizationName: `Org ${tag}`,
        displayName: 'Owner',
        email: `inbox-${tag}-${randomUUID()}@test.local`,
        password,
      })
      .expect(201);
    await approveTestOrganization(admin, res.body.user.organizationId);
    orgIds.push(res.body.user.organizationId);
    return {
      token: res.body.tokens.accessToken,
      orgId: res.body.user.organizationId,
      userId: res.body.user.id,
    };
  }

  async function registerPerson(tag: string): Promise<Actor> {
    const res = await request(server)
      .post('/auth/register/person')
      .send({
        ...LEGAL_PERSON,
        displayName: 'Laura Donante',
        email: `inbox-${tag}-${randomUUID()}@test.local`,
        password,
      })
      .expect(201);
    orgIds.push(res.body.user.organizationId);
    return {
      token: res.body.tokens.accessToken,
      orgId: res.body.user.organizationId,
      userId: res.body.user.id,
    };
  }

  /** Un segundo miembro (Operator) del equipo de `owner`, con su sesión. */
  async function addTeammate(owner: Actor): Promise<Actor> {
    const email = `inbox-mate-${randomUUID()}@test.local`;
    const invite = await request(server)
      .post('/org/invitations')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ email, role: 'operator' })
      .expect(201);
    // El token real solo viaja en el correo: se fija uno conocido sobre la invitación.
    const token = randomBytes(32).toString('base64url');
    await admin.organizationInvitation.update({
      where: { id: invite.body.id },
      data: { tokenHash: hashInvitationToken(token) },
    });
    const res = await request(server)
      .post('/auth/invitations/accept')
      .send({ ...LEGAL_ORG, token, displayName: 'Camila Equipo', password })
      .expect(201);
    return {
      token: res.body.tokens.accessToken,
      orgId: res.body.user.organizationId,
      userId: res.body.user.id,
    };
  }

  const inbox = (token: string) =>
    request(server).get('/me/notifications').set('Authorization', `Bearer ${token}`).expect(200);

  async function setDepartment(orgId: string, value: string): Promise<void> {
    await admin.organizationProfile.upsert({
      where: { organizationId: orgId },
      create: { organizationId: orgId, location: { country: 'CO', department: value, city: 'X' } },
      update: { location: { country: 'CO', department: value, city: 'X' } },
    });
  }

  let org: Actor;
  let teammate: Actor;
  let nearbyOrg: Actor;
  let farOrg: Actor;
  let donor: Actor;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    server = app.getHttpServer();
    org = await registerOrg('inbox-org');
    teammate = await addTeammate(org);
    nearbyOrg = await registerOrg('inbox-near');
    farOrg = await registerOrg('inbox-far');
    donor = await registerPerson('inbox-donor');
    await setDepartment(nearbyOrg.orgId, department);
    await setDepartment(farOrg.orgId, `${department}-otro`);
  });

  afterAll(async () => {
    await appDb.$disconnect();
    await purgeOrganizations(admin, orgIds);
    await admin.$disconnect();
    await app?.close();
  });

  it('requires a session to read the inbox', async () => {
    await request(server).get('/me/notifications').expect(401);
  });

  it('accepting the invitation tells the owner and welcomes the new member', async () => {
    const owner = await inbox(org.token);
    expect(owner.body.items.map((n: { kind: string }) => n.kind)).toContain('org.member_joined');
    const mate = await inbox(teammate.token);
    expect(mate.body.items[0]).toMatchObject({ kind: 'org.welcome', tone: 'kudos', read: false });
  });

  let openId = '';

  it('a team member offers in the bank: own team sees it on the board, others can take it', async () => {
    const res = await request(server)
      .post('/resources/open-offers')
      .set('Authorization', `Bearer ${teammate.token}`)
      .send({
        title: 'Bulto de concentrado',
        category: 'food',
        quantity: 2,
        unit: 'bultos',
        department,
        city: 'Pueblo',
      })
      .expect(201);
    openId = res.body.id;

    const own = await request(server)
      .get('/resources/open-offers/board')
      .set('Authorization', `Bearer ${org.token}`)
      .expect(200);
    const mine = own.body.items.find((o: { id: string }) => o.id === openId);
    expect(mine).toMatchObject({ fromYourOrganization: true });

    const other = await request(server)
      .get('/resources/open-offers/board')
      .set('Authorization', `Bearer ${farOrg.token}`)
      .expect(200);
    const seen = other.body.items.find((o: { id: string }) => o.id === openId);
    expect(seen).toBeDefined();
    expect(seen.fromYourOrganization).toBeUndefined();

    // Su propia organización no puede tomarlo.
    await request(server)
      .post(`/resources/open-offers/${openId}/claim`)
      .set('Authorization', `Bearer ${org.token}`)
      .send({})
      .expect(400);
  });

  it('no-leak: the public list shows the open offer without donor or organization', async () => {
    const res = await request(server).get('/public/resources/open-offers?limit=50').expect(200);
    const item = res.body.items.find((o: { id: string }) => o.id === openId);
    expect(item).toMatchObject({ title: 'Bulto de concentrado', quantity: 2, city: 'Pueblo' });
    const raw = JSON.stringify(item);
    expect(raw).not.toContain(teammate.userId);
    expect(raw).not.toContain(org.orgId);
    expect(item.fromYourOrganization).toBeUndefined();
  });

  it('the offer notifies organizations of the same department, the team and thanks the author', async () => {
    const near = await inbox(nearbyOrg.token);
    expect(near.body.items[0]).toMatchObject({
      kind: 'resources.open_offer_published',
      href: `/organizacion/recursos/ofrecimientos?foco=${openId}`,
    });
    const far = await inbox(farOrg.token);
    expect(
      far.body.items.some((n: { kind: string }) => n.kind === 'resources.open_offer_published'),
    ).toBe(false);
    const owner = await inbox(org.token);
    expect(
      owner.body.items.some((n: { kind: string }) => n.kind === 'resources.open_offer_published'),
    ).toBe(true);
    const author = await inbox(teammate.token);
    expect(author.body.items[0]).toMatchObject({
      kind: 'resources.open_offer_published',
      tone: 'kudos',
    });
  });

  it('claiming the open offer tells the team member who offered it', async () => {
    const claim = await request(server)
      .post(`/resources/open-offers/${openId}/claim`)
      .set('Authorization', `Bearer ${nearbyOrg.token}`)
      .send({})
      .expect(201);
    const author = await inbox(teammate.token);
    expect(author.body.items[0]).toMatchObject({
      kind: 'resources.open_offer_claimed',
      href: `/mis-ofertas?foco=${claim.body.offerId}`,
    });
  });

  let offerId = '';

  it('offering on a need notifies the organization; accepting notifies the donor', async () => {
    const need = await request(server)
      .post('/resources/needs')
      .set('Authorization', `Bearer ${org.token}`)
      .send({ title: 'Arena para gatos', category: 'supplies', quantityNeeded: 10, unit: 'kg' })
      .expect(201);
    const offer = await request(server)
      .post('/resources/offers')
      .set('Authorization', `Bearer ${donor.token}`)
      .send({ needId: need.body.id, quantityOffered: 5 })
      .expect(201);
    offerId = offer.body.id;

    const staff = await inbox(org.token);
    expect(staff.body.items[0]).toMatchObject({
      kind: 'resources.offer_received',
      href: `/organizacion/recursos/${need.body.id}?foco=${offerId}`,
    });
    expect(staff.body.items[0].title).toContain('Arena para gatos');
    const mate = await inbox(teammate.token);
    expect(
      mate.body.items.some((n: { kind: string }) => n.kind === 'resources.offer_received'),
    ).toBe(true);

    await request(server)
      .patch(`/resources/offers/${offerId}/decision`)
      .set('Authorization', `Bearer ${org.token}`)
      .send({ decision: 'accept' })
      .expect(200);
    const mine = await inbox(donor.token);
    expect(mine.body.items[0]).toMatchObject({
      kind: 'resources.offer_accepted',
      tone: 'success',
      href: `/mis-ofertas?foco=${offerId}`,
    });
    expect(mine.body.unread).toBeGreaterThanOrEqual(2);
  });

  it('marks as read only the own notifications', async () => {
    const before = await inbox(donor.token);
    const id = before.body.items[0].id;
    // Otra persona no puede marcar el aviso del donante.
    const other = await request(server)
      .post('/me/notifications/read')
      .set('Authorization', `Bearer ${org.token}`)
      .send({ ids: [id] })
      .expect(200);
    expect(other.body.updated).toBe(0);

    await request(server)
      .post('/me/notifications/read')
      .set('Authorization', `Bearer ${donor.token}`)
      .send({ ids: [id] })
      .expect(200);
    const after = await inbox(donor.token);
    expect(after.body.items[0].read).toBe(true);
    expect(after.body.unread).toBe(before.body.unread - 1);

    await request(server)
      .post('/me/notifications/read')
      .set('Authorization', `Bearer ${donor.token}`)
      .send({ all: true })
      .expect(200);
    expect((await inbox(donor.token)).body.unread).toBe(0);

    await request(server)
      .post('/me/notifications/read')
      .set('Authorization', `Bearer ${donor.token}`)
      .send({})
      .expect(400);
  });

  async function withOrgContext<T>(
    organizationId: string,
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return appDb.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.$executeRaw`SELECT set_config('app.current_org_id', ${organizationId}, true)`;
      return fn(tx);
    });
  }

  it('no-leak: user_notifications of one tenant are invisible from another', async () => {
    const fromDonor = await withOrgContext(donor.orgId, (tx) => tx.userNotification.findMany());
    expect(fromDonor.length).toBeGreaterThan(0);
    expect(fromDonor.every((n) => n.organizationId === donor.orgId)).toBe(true);
    const fromOrg = await withOrgContext(org.orgId, (tx) =>
      tx.userNotification.findMany({ where: { userId: donor.userId } }),
    );
    expect(fromOrg).toHaveLength(0);
    expect(await appDb.userNotification.findMany()).toHaveLength(0);
  });

  it('no-leak: WITH CHECK blocks writing a notification into another tenant', async () => {
    await expect(
      withOrgContext(org.orgId, (tx) =>
        tx.userNotification.create({
          data: {
            organizationId: donor.orgId,
            userId: donor.userId,
            kind: 'test.forged',
            title: 'x',
          },
        }),
      ),
    ).rejects.toThrow();
  });

  it('no-leak: the app role cannot delete or rewrite a notification', async () => {
    await expect(
      withOrgContext(donor.orgId, (tx) =>
        tx.userNotification.deleteMany({ where: { userId: donor.userId } }),
      ),
    ).rejects.toThrow();
    await expect(
      withOrgContext(donor.orgId, (tx) =>
        tx.userNotification.updateMany({
          where: { userId: donor.userId },
          data: { title: 'reescrito' },
        }),
      ),
    ).rejects.toThrow();
  });
});
