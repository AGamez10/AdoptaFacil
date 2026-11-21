import { randomUUID } from 'node:crypto';
import { BadRequestException, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { Role } from '@adoptafacil/contracts';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import {
  NOTIFICATION_PORT,
  type NotificationMessage,
  type NotificationPort,
} from '../src/core/notifications/notification.port';
import { InvitationsService } from '../src/modules/org/governance/invitations.service';
import { purgeOrganizations } from './support/cleanup';
import { LEGAL_MEMBER, LEGAL_ORG } from './support/legal';

/**
 * Lo que acepta quien entra por una invitación depende del cargo invitado.
 * Antes, cualquier invitado (voluntario, operador, auditor, contador...)
 * aceptaba el contrato de la organización y declaraba "que puede obligarla",
 * como si fuera su representante. Ahora:
 *  - solo una invitación de propietario acepta las condiciones de la
 *    organización en su nombre;
 *  - cualquier otro cargo acepta las "Condiciones para miembros de un equipo",
 *    que dicen expresamente que el miembro no la obliga;
 *  - la constancia de un miembro nunca registra el contrato de la organización,
 *    aunque el cliente lo envíe;
 *  - un ascenso a propietario pide aceptar el contrato de la organización.
 *
 * App propia: las rutas públicas de invitación tienen un cupo de 10 por minuto
 * por IP, así que aquí se llaman por HTTP como mucho 6 veces; el resto de los
 * cargos se prueba contra el mismo servicio que usa la ruta.
 */
class CapturingNotificationPort implements NotificationPort {
  readonly sent: NotificationMessage[] = [];
  async send(message: NotificationMessage): Promise<void> {
    this.sent.push(message);
  }
}

describe('Invitation legal terms by invited role', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  let invitations: InvitationsService;
  const admin = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  const notifications = new CapturingNotificationPort();
  const createdOrgIds: string[] = [];
  const password = 'password-1234';
  let ownerToken: string;

  const asOwner = () => ({ Authorization: `Bearer ${ownerToken}` });
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

  function lastTokenFor(email: string): string {
    const message = [...notifications.sent].reverse().find((m) => m.to === email);
    const match = message?.body.match(/\/invitacion#token=([A-Za-z0-9_%-]+)/);
    if (!match) throw new Error(`no invitation link sent to ${email}`);
    return decodeURIComponent(match[1]);
  }

  async function invited(role: Role, extra: Record<string, unknown> = {}): Promise<string> {
    const email = `legal-role-${randomUUID()}@test.local`;
    await request(server)
      .post('/org/invitations')
      .set(asOwner())
      .send({ email, role, ...extra })
      .expect(201);
    return lastTokenFor(email);
  }

  const acceptHttp = (token: string, legal: { legalAcceptances: unknown }) =>
    request(server)
      .post('/auth/invitations/accept')
      .send({ token, displayName: 'Invitada', password, ...legal });

  const keysOf = async (userId: string) =>
    (await admin.legalAcceptance.findMany({ where: { subjectType: 'user', subjectId: userId } }))
      .map((r) => r.documentKey)
      .sort();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(NOTIFICATION_PORT)
      .useValue(notifications)
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
    server = app.getHttpServer();
    invitations = app.get(InvitationsService);

    const res = await request(server)
      .post('/auth/register/organization')
      .send({
        ...LEGAL_ORG,
        organizationName: 'Refugio Términos por Cargo',
        displayName: 'Propietaria',
        email: `legal-role-owner-${randomUUID()}@test.local`,
        password,
      })
      .expect(201);
    createdOrgIds.push(res.body.user.organizationId);
    ownerToken = res.body.tokens.accessToken;
  });

  afterAll(async () => {
    await purgeOrganizations(admin, createdOrgIds);
    await admin.$disconnect();
    await app?.close();
  });

  it('a volunteer (HTTP) cannot accept "on behalf of the organization" and its record never says so', async () => {
    const token = await invited(Role.Volunteer);
    const refused = await acceptHttp(token, LEGAL_ORG).expect(400);
    expect(refused.body).toMatchObject({
      code: 'LEGAL_ACCEPTANCE_REQUIRED',
      missing: ['member_terms'],
    });

    const res = await acceptHttp(token, {
      legalAcceptances: [...LEGAL_MEMBER.legalAcceptances, ...LEGAL_ORG.legalAcceptances],
    }).expect(201);
    const keys = await keysOf(res.body.user.id);
    expect(keys).toContain('member_terms');
    expect(keys).not.toContain('org_terms');

    const status = await request(server)
      .get('/legal/me')
      .set(bearer(res.body.tokens.accessToken))
      .expect(200);
    expect(status.body).toMatchObject({ pending: [], audience: 'member' });
  });

  it.each([
    Role.Administrator,
    Role.Operator,
    Role.Veterinarian,
    Role.TemporaryCollaborator,
    Role.ReadOnlyAuditor,
  ])('a %s accepts the member conditions, never the organization contract', async (role) => {
    const token = await invited(role);
    await expect(
      invitations.accept({ token, displayName: 'Invitada', password, ...LEGAL_ORG }),
    ).rejects.toBeInstanceOf(BadRequestException);

    const session = await invitations.accept({
      token,
      displayName: 'Invitada',
      password,
      legalAcceptances: [...LEGAL_MEMBER.legalAcceptances, ...LEGAL_ORG.legalAcceptances],
    });
    const keys = await keysOf(session.user.id);
    expect(keys).toContain('member_terms');
    expect(keys).not.toContain('org_terms');

    const status = await request(server)
      .get('/legal/me')
      .set(bearer(session.tokens.accessToken))
      .expect(200);
    expect(status.body).toMatchObject({ pending: [], audience: 'member' });
  });

  it('a signer (accountant / fiscal reviewer) joins as a member, not as the organization', async () => {
    const token = await invited(Role.ReadOnlyAuditor, { signerRole: 'fiscal_reviewer' });
    const res = await acceptHttp(token, LEGAL_MEMBER).expect(201);
    const keys = await keysOf(res.body.user.id);
    expect(keys).toContain('member_terms');
    expect(keys).not.toContain('org_terms');
  });

  it('only an invited Owner accepts the organization contract on its behalf', async () => {
    const token = await invited(Role.Owner);
    const refused = await acceptHttp(token, LEGAL_MEMBER).expect(400);
    expect(refused.body.missing).toEqual(['org_terms']);

    const res = await acceptHttp(token, LEGAL_ORG).expect(201);
    const keys = await keysOf(res.body.user.id);
    expect(keys).toContain('org_terms');
    expect(keys).not.toContain('member_terms');
    const status = await request(server)
      .get('/legal/me')
      .set(bearer(res.body.tokens.accessToken))
      .expect(200);
    expect(status.body).toMatchObject({ pending: [], audience: 'organization' });
  });

  it('a member promoted to Owner must accept the organization contract; a member cannot', async () => {
    const token = await invited(Role.Administrator);
    const res = await acceptHttp(token, LEGAL_MEMBER).expect(201);
    const member = bearer(res.body.tokens.accessToken);

    // While a member, sending the organization contract records nothing.
    const asMember = await request(server)
      .post('/legal/me/acceptances')
      .set(member)
      .send({ documents: LEGAL_ORG.legalAcceptances })
      .expect(200);
    expect(asMember.body.history.some((h: { key: string }) => h.key === 'org_terms')).toBe(false);

    await request(server)
      .post('/rbac/roles')
      .set(asOwner())
      .send({ userId: res.body.user.id, role: Role.Owner })
      .expect(201);
    const pending = await request(server).get('/legal/me').set(member).expect(200);
    expect(pending.body).toMatchObject({ pending: ['org_terms'], audience: 'organization' });

    const accepted = await request(server)
      .post('/legal/me/acceptances')
      .set(member)
      .send({ documents: LEGAL_ORG.legalAcceptances })
      .expect(200);
    expect(accepted.body.pending).toEqual([]);
  });
});
