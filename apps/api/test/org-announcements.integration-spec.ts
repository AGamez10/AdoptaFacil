import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { ORG_ANNOUNCEMENT_DAILY_LIMIT } from '@adoptafacil/contracts';
import { AppModule } from '../src/app.module';
import { loadAuthConfig } from '../src/core/auth/auth.config';
import { NOTIFICATION_TRANSPORT } from '../src/core/notifications/notification.module';
import type {
  NotificationMessage,
  NotificationPort,
} from '../src/core/notifications/notification.port';
import { hashEmail, signUnsubscribe } from '../src/core/notifications/templates/email-compose';
import { purgeOrganizations } from './support/cleanup';
import { LEGAL_ORG, LEGAL_PERSON } from './support/legal';

/**
 * Ajuste 13 — urgent announcements of an organization to its own contacts:
 * RBAC (Owner/Administrator), tenant isolation (never another org's
 * contacts), de-duplication across audiences, per-organization unsubscribe
 * (signed for that org only) and the daily limit.
 */
describe('Org urgent announcements', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  const admin = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  const createdOrgIds: string[] = [];
  const sent: NotificationMessage[] = [];
  const tag = randomUUID().slice(0, 8);
  const shared = `shared-${tag}@test.local`;
  const adopterOnly = `adopter-${tag}@test.local`;
  const otherOrgContact = `other-${tag}@test.local`;

  interface Actor {
    token: string;
    orgId: string;
    userId: string;
  }

  async function registerOrg(name: string): Promise<Actor> {
    const res = await request(server)
      .post('/auth/register/organization')
      .send({
        ...LEGAL_ORG,
        organizationName: name,
        displayName: 'Owner',
        email: `ann-${randomUUID()}@test.local`,
        password: 'password-1234',
      })
      .expect(201);
    createdOrgIds.push(res.body.user.organizationId);
    return {
      token: res.body.tokens.accessToken,
      orgId: res.body.user.organizationId,
      userId: res.body.user.id,
    };
  }

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function seedRequest(org: Actor, email: string, fullName: string) {
    await admin.adoptionRequest.create({
      data: {
        organizationId: org.orgId,
        animalId: randomUUID(),
        animalSnapshot: { animalId: randomUUID(), name: 'Michi', species: 'cat' },
        applicantUserId: org.userId,
        applicant: { fullName, email },
        message: 'Quiero adoptar con mucho cariño y responsabilidad.',
      },
    });
  }

  async function seedDonation(org: Actor, email: string) {
    await admin.donation.create({
      data: {
        organizationId: org.orgId,
        conceptKind: 'organization',
        conceptId: org.orgId,
        commissionPayer: 'donor',
        intendedAmount: 10000,
        amountCharged: 10400,
        breakdown: {},
        collectionId: `col-${randomUUID()}`,
        idempotencyKey: randomUUID(),
        status: 'approved',
        payer: { email: email.toUpperCase(), fullName: 'Laura Gómez' },
      },
    });
  }

  async function waitForSent(count: number): Promise<void> {
    const start = Date.now();
    while (sent.length < count) {
      if (Date.now() - start > 15_000) throw new Error(`only ${sent.length} of ${count} sent`);
      await new Promise((r) => setTimeout(r, 50));
    }
  }

  let orgA: Actor;
  let orgB: Actor;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(NOTIFICATION_TRANSPORT)
      .useValue({
        send: async (m: NotificationMessage) => void sent.push(m),
      } satisfies NotificationPort)
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
    server = app.getHttpServer();

    orgA = await registerOrg('Refugio Anuncios A');
    orgB = await registerOrg('Refugio Anuncios B');
    await seedRequest(orgA, shared, 'Ana Pérez');
    await seedRequest(orgA, adopterOnly, 'Carlos Ruiz');
    await seedDonation(orgA, shared);
    await seedRequest(orgB, otherOrgContact, 'Otra Persona');
  });

  afterAll(async () => {
    await admin.emailSuppression.deleteMany({
      where: { emailHash: { in: [shared, adopterOnly, otherOrgContact].map(hashEmail) } },
    });
    await purgeOrganizations(admin, createdOrgIds);
    await admin.$disconnect();
    await app?.close();
  });

  it('counts only the own org contacts, once per address', async () => {
    const res = await request(server)
      .get('/org/announcements/audience')
      .set(auth(orgA.token))
      .expect(200);
    expect(res.body).toMatchObject({
      donors: 1,
      adopters: 2,
      volunteers: 0,
      total: 2,
      remainingToday: ORG_ANNOUNCEMENT_DAILY_LIMIT,
    });
  });

  it('a person account cannot send announcements (deny-by-default)', async () => {
    const person = await request(server)
      .post('/auth/register/person')
      .send({
        ...LEGAL_PERSON,
        displayName: 'Persona',
        email: `person-${randomUUID()}@test.local`,
        password: 'password-1234',
      })
      .expect(201);
    createdOrgIds.push(person.body.user.organizationId);
    await request(server)
      .post('/org/announcements')
      .set(auth(person.body.tokens.accessToken))
      .send({ audiences: ['adopters'], title: 'Hola', message: 'Mensaje de prueba largo' })
      .expect(403);
    await request(server)
      .get('/org/announcements/audience')
      .set(auth(person.body.tokens.accessToken))
      .expect(403);
  });

  it('sends one email per address with an unsubscribe link for this org only', async () => {
    sent.length = 0;
    await request(server)
      .post('/org/announcements')
      .set(auth(orgA.token))
      .send({
        audiences: ['donors', 'adopters'],
        title: 'Hogar temporal hoy',
        message: 'Rescatamos 5 cachorros y necesitamos hogar temporal.',
      })
      .expect(201)
      .expect(({ body }) => expect(body).toEqual({ recipients: 2 }));
    await waitForSent(2);
    const to = sent.map((m) => m.to.toLowerCase()).sort();
    expect(to).toEqual([adopterOnly, shared].sort());
    expect(to).not.toContain(otherOrgContact);
    const html = sent[0].html ?? '';
    expect(html).toContain('Hogar temporal hoy');
    expect(html).toContain(`&amp;o=${orgA.orgId}`);
    expect(sent[0].headers?.['List-Unsubscribe']).toContain(`o=${orgA.orgId}`);

    const audit = await admin.auditLog.findFirst({
      where: { organizationId: orgA.orgId, action: 'org.announcement_sent' },
    });
    expect(audit?.metadata).toEqual({ audiences: ['donors', 'adopters'], recipients: 2 });
    expect(JSON.stringify(audit?.metadata)).not.toContain('@');
  });

  it('an org opt-out stops only that org; the token cannot be replayed for another org', async () => {
    const secret = loadAuthConfig().jwtSecret;
    const h = hashEmail(adopterOnly);
    const t = signUnsubscribe(secret, h, orgA.orgId);
    // The org-scoped token is not a platform-wide or another org's opt-out.
    await request(server).post('/public/email/unsubscribe').send({ h, t }).expect(400);
    await request(server)
      .post('/public/email/unsubscribe')
      .send({ h, t, o: orgB.orgId })
      .expect(400);
    await request(server)
      .post('/public/email/unsubscribe')
      .send({ h, t, o: orgA.orgId })
      .expect(200);
    const rows = await admin.emailSuppression.findMany({ where: { emailHash: h } });
    expect(rows.map((r) => r.category)).toEqual([`org:${orgA.orgId}`]);

    const res = await request(server)
      .get('/org/announcements/audience')
      .set(auth(orgA.token))
      .expect(200);
    expect(res.body).toMatchObject({ adopters: 1, total: 1 });

    sent.length = 0;
    await request(server)
      .post('/org/announcements')
      .set(auth(orgA.token))
      .send({
        audiences: ['adopters'],
        title: 'Segundo aviso',
        message: 'Seguimos buscando hogar temporal.',
      })
      .expect(201);
    await waitForSent(1);
    await new Promise((r) => setTimeout(r, 500));
    expect(sent.map((m) => m.to.toLowerCase())).toEqual([shared]);
  });

  it('enforces the daily limit with 429', async () => {
    const used = await admin.auditLog.count({
      where: { organizationId: orgA.orgId, action: 'org.announcement_sent' },
    });
    for (let i = used; i < ORG_ANNOUNCEMENT_DAILY_LIMIT; i++) {
      await request(server)
        .post('/org/announcements')
        .set(auth(orgA.token))
        .send({
          audiences: ['volunteers'],
          title: `Aviso ${i}`,
          message: 'Mensaje de prueba suficiente.',
        })
        .expect(201);
    }
    const res = await request(server)
      .post('/org/announcements')
      .set(auth(orgA.token))
      .send({ audiences: ['adopters'], title: 'Otro', message: 'Mensaje de prueba suficiente.' })
      .expect(429);
    expect(res.body.code).toBe('ANNOUNCEMENT_LIMIT');
  });

  it('rejects multi-line titles and unknown audiences', async () => {
    await request(server)
      .post('/org/announcements')
      .set(auth(orgB.token))
      .send({
        audiences: ['adopters'],
        title: 'Hola\r\nBcc: x',
        message: 'Mensaje de prueba suficiente.',
      })
      .expect(400);
    await request(server)
      .post('/org/announcements')
      .set(auth(orgB.token))
      .send({ audiences: ['everyone'], title: 'Hola', message: 'Mensaje de prueba suficiente.' })
      .expect(400);
  });
});
