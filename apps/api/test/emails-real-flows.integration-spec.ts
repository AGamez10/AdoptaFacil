import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { NOTIFICATION_TRANSPORT } from '../src/core/notifications/notification.module';
import type { NotificationMessage } from '../src/core/notifications/notification.port';
import { purgeOrganizations } from './support/cleanup';
import { completeTestProfile } from './support/profile';
import { LEGAL_ORG, LEGAL_PERSON } from './support/legal';

/**
 * Smoke of the branded emails on the REAL flows (real AppModule, Prisma, RLS,
 * the fake payment gateway and the real TemplatedNotificationAdapter). Only the
 * transport (SMTP/log) is replaced, to read what would leave the server.
 * Emails go through the delivery queue, so each check waits for the worker:
 *
 *   guest donation approved by webhook   → donation.thanks with the magic link
 *   authenticated donation approved      → donation.thanks pointing to "Mis donaciones"
 *   first sponsorship payment approved   → sponsorship.welcome
 *
 * And none of them is sent twice when the gateway repeats its webhook.
 */
describe('Branded emails on the real donation and sponsorship flows', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  const admin = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  const orgIds: string[] = [];
  const password = 'password-1234';
  const sent: NotificationMessage[] = [];
  const ORG_NAME = 'Refugio <Huellas> & Co';

  let orgToken = '';
  let orgId = '';
  let personToken = '';
  let personEmail = '';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(NOTIFICATION_TRANSPORT)
      .useValue({ send: async (m: NotificationMessage) => void sent.push(m) })
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
    server = app.getHttpServer();

    const org = await request(server)
      .post('/auth/register/organization')
      .send({
        ...LEGAL_ORG,
        organizationName: ORG_NAME,
        displayName: 'Owner Correos',
        email: `flows-org-${randomUUID()}@test.local`,
        password,
      })
      .expect(201);
    orgToken = org.body.tokens.accessToken;
    orgId = org.body.user.organizationId;
    orgIds.push(orgId);

    personEmail = `flows-p-${randomUUID()}@test.local`;
    const person = await request(server)
      .post('/auth/register/person')
      .send({ ...LEGAL_PERSON, displayName: 'Padrina Ana', email: personEmail, password })
      .expect(201);
    personToken = person.body.tokens.accessToken;
    orgIds.push(person.body.user.organizationId);
    await completeTestProfile(admin, person.body.user.id);
  });

  beforeEach(() => {
    sent.length = 0;
  });

  afterAll(async () => {
    await purgeOrganizations(admin, orgIds);
    await admin.$disconnect();
    await app?.close();
  });

  function expectBranded(message: NotificationMessage) {
    expect(message.html).toBeDefined();
    // Org name escaped, never raw markup.
    expect(message.html).toContain('Refugio &lt;Huellas&gt; &amp; Co');
    expect(message.html).not.toContain('<Huellas>');
    expect(message.html).toContain('a través de AdoptaFácil');
    expect(message.html).toContain('Ley 1581');
    expect(message.body).not.toContain('**');
  }

  async function waitForMail(to: string, count = 1): Promise<NotificationMessage[]> {
    const start = Date.now();
    for (;;) {
      const mine = sent.filter((m) => m.to === to);
      if (mine.length >= count) return mine;
      if (Date.now() - start > 15_000) return mine;
      await new Promise((r) => setTimeout(r, 50));
    }
  }

  async function approve(collectionId: string) {
    return request(server)
      .post('/donations/webhook')
      .set('x-signature', 'fake-sig')
      .send({ collectionId, status: 'approved', eventId: `evt-${collectionId}` })
      .expect(200);
  }

  it('a guest donation sends one branded thank-you with the amount and the magic link, even if the webhook repeats', async () => {
    const guestEmail = `flows-guest-${randomUUID()}@test.local`;
    const res = await request(server)
      .post('/donations')
      .send({
        organizationId: orgId,
        intendedAmount: 40_000,
        commissionPayer: 'organization',
        idempotencyKey: `flows-guest-${randomUUID()}`,
        payer: { fullName: 'Invitada', email: guestEmail },
      })
      .expect(201);

    await approve(res.body.collectionId);
    await approve(res.body.collectionId);

    await waitForMail(guestEmail);
    await new Promise((r) => setTimeout(r, 1000)); // room for a duplicate to show up
    const mine = sent.filter((m) => m.to === guestEmail);
    expect(mine).toHaveLength(1);
    const [message] = mine;
    expect(message.to).toBe(guestEmail);
    expect(message.subject).toBe(`¡Gracias por tu donación a ${ORG_NAME}!`);
    expectBranded(message);
    expect(message.body.replace(/\s/g, ' ')).toContain('$ 40.000');
    expect(message.body).toMatch(/\/donaciones\/comprobante\?token=[A-Za-z0-9_-]{20,}/);
    expect(message.html).toMatch(/href="[^"]*\/donaciones\/comprobante\?token=/);
  });

  it('an authenticated donation sends the thank-you pointing to "Mis donaciones" (no magic link)', async () => {
    const res = await request(server)
      .post('/donations')
      .set('Authorization', `Bearer ${personToken}`)
      .send({
        organizationId: orgId,
        intendedAmount: 25_000,
        commissionPayer: 'organization',
        idempotencyKey: `flows-auth-${randomUUID()}`,
        // The web app fills `payer` from the session for a signed-in donor.
        payer: { fullName: 'Padrina Ana', email: personEmail },
      })
      .expect(201);

    await approve(res.body.collectionId);

    const mine = await waitForMail(personEmail);
    expect(mine).toHaveLength(1);
    const [message] = mine;
    expectBranded(message);
    expect(message.body.replace(/\s/g, ' ')).toContain('$ 25.000');
    expect(message.body).toContain('/mis-donaciones');
    expect(message.body).not.toContain('token=');
  });

  it('subscribing to a sponsorship with an approved first payment sends the branded welcome', async () => {
    const animal = await request(server)
      .post('/animals')
      .set('Authorization', `Bearer ${orgToken}`)
      .send({ name: 'Canela', species: 'dog', sex: 'female', size: 'medium' })
      .expect(201);
    const plan = await request(server)
      .post('/sponsorship-plans')
      .set('Authorization', `Bearer ${orgToken}`)
      .send({
        animalId: animal.body.id,
        name: 'Padrinazgo mensual',
        amount: 30_000,
        periodicity: 'monthly',
      })
      .expect(201);

    const sponsorship = await request(server)
      .post('/sponsorships')
      .set('Authorization', `Bearer ${personToken}`)
      .send({ planId: plan.body.id })
      .expect(201);
    expect(sponsorship.body.status).toBe('active');

    await waitForMail(personEmail);
    const welcome = sent.filter((m) => m.subject.includes('Canela'));
    expect(welcome).toHaveLength(1);
    expect(welcome[0].to).toBe(personEmail);
    expectBranded(welcome[0]);
    expect(welcome[0].body.replace(/\s/g, ' ')).toContain('$ 30.000');
    expect(welcome[0].body).toContain('/apadrinar');
  });

  it('a campaign post emails each past donor of the org once, greeting them by name', async () => {
    const donors = [
      { fullName: 'Marta Lucía Pérez', email: `flows-d1-${randomUUID()}@test.local` },
      { fullName: '', email: `flows-d2-${randomUUID()}@test.local` },
    ];
    for (const donor of [...donors, donors[0]]) {
      const res = await request(server)
        .post('/donations')
        .send({
          organizationId: orgId,
          intendedAmount: 10_000,
          commissionPayer: 'organization',
          idempotencyKey: `flows-camp-${randomUUID()}`,
          payer: donor.fullName ? donor : { email: donor.email },
        })
        .expect(201);
      await approve(res.body.collectionId);
    }

    await request(server)
      .post('/community/posts')
      .set('Authorization', `Bearer ${orgToken}`)
      .send({
        type: 'campaign',
        title: 'Ya casi llegamos',
        body: 'Faltan $200.000 para la cirugía.',
      })
      .expect(201);

    const isUpdate = (m: NotificationMessage) => m.subject.includes('novedades');
    const start = Date.now();
    while (sent.filter(isUpdate).length < 2 && Date.now() - start < 15_000) {
      await new Promise((r) => setTimeout(r, 50));
    }
    await new Promise((r) => setTimeout(r, 500));
    const first = sent.filter((m) => isUpdate(m) && m.to === donors[0].email);
    const second = sent.filter((m) => isUpdate(m) && m.to === donors[1].email);
    expect(first).toHaveLength(1); // donated twice, emailed once
    expect(second).toHaveLength(1);
    expect(first[0].body).toContain('Hola Marta,');
    expect(second[0].body).toContain('Hola amigo(a),');
    expect(first[0].headers?.['List-Unsubscribe']).toBeDefined();
    expectBranded(first[0]);
  });
});
