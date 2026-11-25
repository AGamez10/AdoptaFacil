import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { SUPPRESSION_CONFIRMATION } from '../src/modules/privacy/privacy.service';
import { purgeOrganizations } from './support/cleanup';
import { LEGAL_ORG, LEGAL_PERSON } from './support/legal';

/**
 * Derechos del titular (Ley 1581; auditoría run-2 C-01): consulta de todo lo
 * que la plataforma guarda de la persona y supresión de su cuenta, que
 * conserva lo que la ley obliga a guardar sin abrir ningún candado de
 * inmutabilidad. Cada titular ve y suprime SOLO lo suyo.
 */
describe('Privacy: data-subject access and suppression (Ley 1581)', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  const admin = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  const orgIds: string[] = [];
  const password = 'password-privacy-123';

  interface Actor {
    token: string;
    orgId: string;
    userId: string;
    email: string;
  }

  async function register(kind: 'person' | 'organization', tag: string): Promise<Actor> {
    const email = `privacy-${tag}-${randomUUID()}@test.local`;
    const res = await request(server)
      .post(`/auth/register/${kind}`)
      .send({
        ...(kind === 'person' ? LEGAL_PERSON : { ...LEGAL_ORG, organizationName: `Org ${tag}` }),
        displayName: `Titular ${tag}`,
        email,
        password,
      })
      .expect(201);
    orgIds.push(res.body.user.organizationId);
    return {
      token: res.body.tokens.accessToken,
      orgId: res.body.user.organizationId,
      userId: res.body.user.id,
      email,
    };
  }

  const auth = (a: Actor) => ({ Authorization: `Bearer ${a.token}` });
  const post = (a: Actor, body: string) =>
    request(server)
      .post('/community/posts')
      .set(auth(a))
      .send({ type: 'general', body })
      .expect(201);

  let ana: Actor;
  let beto: Actor;
  let shelter: Actor;
  let donationId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    server = app.getHttpServer();
    ana = await register('person', 'ana');
    beto = await register('person', 'beto');
    shelter = await register('organization', 'refugio');
    await admin.user.update({
      where: { id: ana.userId },
      data: { phone: '3001234567', documentId: '1020304050', address: 'Calle 1 # 2-3, Medellín' },
    });
    const donation = await admin.donation.create({
      data: {
        organizationId: shelter.orgId,
        donorUserId: ana.userId,
        conceptKind: 'organization',
        conceptId: shelter.orgId,
        intendedAmount: 20000,
        amountCharged: 20000,
        breakdown: {},
        collectionId: `col-${randomUUID()}`,
        idempotencyKey: randomUUID(),
        status: 'approved',
        payer: { email: ana.email, fullName: 'Titular ana' },
      },
    });
    donationId = donation.id;
    await post(ana, 'Hoy adopté a Luna y está feliz en casa.');
    await post(beto, 'Beto también comparte su historia de adopción.');
  });

  afterAll(async () => {
    await purgeOrganizations(admin, orgIds);
    await admin.$disconnect();
    await app?.close();
  });

  it('requires a session', async () => {
    await request(server).get('/me/privacy/data').expect(401);
    await request(server).post('/me/privacy/suppression').send({ confirmation: 'x' }).expect(401);
  });

  it('consulta: the person gets everything held about them, across organizations, and only theirs', async () => {
    const res = await request(server).get('/me/privacy/data').set(auth(ana)).expect(200);
    expect(res.body.legalBasis).toMatch(/1581/);
    const data = res.body.data;
    expect(data.account).toMatchObject({
      id: ana.userId,
      email: ana.email,
      phone: '3001234567',
      documentId: '1020304050',
    });
    // Her donation lives in the SHELTER's tenant and still shows up.
    expect(data.donations.map((d: { id: string }) => d.id)).toEqual([donationId]);
    expect(data.community.posts).toHaveLength(1);
    expect(data.legalAcceptances.length).toBeGreaterThan(0);
    // No-leak: nothing of Beto.
    expect(JSON.stringify(data)).not.toContain(beto.email);
    expect(JSON.stringify(data)).not.toContain('Beto también');

    const audit = await admin.auditLog.findFirst({
      where: { actorUserId: ana.userId, action: 'privacy.access_served' },
    });
    expect(audit).not.toBeNull();
    expect(JSON.stringify(audit?.metadata)).not.toContain(ana.email);
  });

  it('AF-N02: registrarse con el correo de un donante invitado no entrega sus datos', async () => {
    // Un donante invitado (sin cuenta) dejó su nombre y cédula en una donación.
    const guestEmail = `privacy-invitado-${randomUUID()}@test.local`;
    const guestDonation = await admin.donation.create({
      data: {
        organizationId: shelter.orgId,
        conceptKind: 'organization',
        conceptId: shelter.orgId,
        intendedAmount: 15000,
        amountCharged: 15000,
        breakdown: {},
        collectionId: `col-${randomUUID()}`,
        idempotencyKey: randomUUID(),
        status: 'approved',
        payer: { email: guestEmail, fullName: 'Donante Invitado', documentNumber: '79111222' },
      },
    });
    // Otra persona registra ese correo (sin probar que el buzón es suyo).
    const res = await request(server)
      .post('/auth/register/person')
      .send({ ...LEGAL_PERSON, displayName: 'Impostor', email: guestEmail, password })
      .expect(201);
    orgIds.push(res.body.user.organizationId);

    const data = await request(server)
      .get('/me/privacy/data')
      .set({ Authorization: `Bearer ${res.body.tokens.accessToken}` })
      .expect(200);
    expect(data.body.data.donations).toEqual([]);
    expect(JSON.stringify(data.body.data)).not.toContain('79111222');
    expect(JSON.stringify(data.body.data)).not.toContain(guestDonation.id);
  });

  it('supresión needs the exact confirmation phrase and is only for person accounts', async () => {
    await request(server)
      .post('/me/privacy/suppression')
      .set(auth(ana))
      .send({ confirmation: 'si' })
      .expect(400);
    await request(server)
      .post('/me/privacy/suppression')
      .set(auth(shelter))
      .send({ confirmation: SUPPRESSION_CONFIRMATION })
      .expect(403);
    expect((await admin.user.findUniqueOrThrow({ where: { id: ana.userId } })).email).toBe(
      ana.email,
    );
  });

  it('supresión: identity erased, own content deleted, legally retained records kept, sign-in impossible', async () => {
    const res = await request(server)
      .post('/me/privacy/suppression')
      .set(auth(ana))
      .send({ confirmation: SUPPRESSION_CONFIRMATION.toLowerCase() })
      .expect(200);
    expect(res.body.postsDeleted).toBe(1);
    expect(res.body.retained.map((r: { data: string }) => r.data).join(' ')).toMatch(/Donaciones/);

    const user = await admin.user.findUniqueOrThrow({ where: { id: ana.userId } });
    expect(user).toMatchObject({
      displayName: 'Titular suprimido',
      phone: null,
      documentId: null,
      address: null,
    });
    expect(user.email).not.toBe(ana.email);
    const credential = await admin.authCredential.findUniqueOrThrow({
      where: { userId: ana.userId },
    });
    expect(credential.email).not.toBe(ana.email);
    expect(await admin.refreshToken.count({ where: { userId: ana.userId } })).toBe(0);
    expect(await admin.post.count({ where: { authorUserId: ana.userId } })).toBe(0);
    const org = await admin.organization.findUniqueOrThrow({ where: { id: ana.orgId } });
    expect(org.name).toBe('Titular suprimido');

    // Retained: the donation (tax support of the shelter) is untouched.
    const donation = await admin.donation.findUniqueOrThrow({ where: { id: donationId } });
    expect(donation).toMatchObject({ status: 'approved', amountCharged: 20000 });
    // The immutable audit trail keeps the event, with ids only.
    const audit = await admin.auditLog.findFirst({
      where: { actorUserId: ana.userId, action: 'privacy.suppression_completed' },
    });
    expect(audit).not.toBeNull();

    // The old e-mail and password no longer sign in.
    await request(server).post('/auth/login').send({ email: ana.email, password }).expect(401);
  });

  it('no-leak: another person is untouched by the suppression', async () => {
    expect(await admin.post.count({ where: { authorUserId: beto.userId } })).toBe(1);
    const res = await request(server).get('/me/privacy/data').set(auth(beto)).expect(200);
    expect(res.body.data.account.email).toBe(beto.email);
  });
});
