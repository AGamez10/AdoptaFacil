import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { BRANDED_EMAIL_MONTHLY_LIMIT } from '@adoptafacil/contracts';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PlansService } from '../src/core/plans/plans.service';
import { EMAIL_DELIVERY } from '../src/core/notifications/delivery/email-delivery.worker';
import { NOTIFICATION_TRANSPORT } from '../src/core/notifications/notification.module';
import type {
  NotificationMessage,
  NotificationPort,
} from '../src/core/notifications/notification.port';
import { purgeOrganizations } from './support/cleanup';
import { LEGAL_ORG } from './support/legal';

/**
 * Correos con la marca de la organización (`brandedEmails`), en la capa que
 * renderiza y envía (la que corre el worker de la cola):
 * - con plan: encabezado con el nombre de la organización, su color, remitente
 *   "<Org> vía AdoptaFácil" y "responder a" su correo de contacto;
 * - cada correo con marca suma 1 al contador del mes de ESA organización;
 * - tope del mes alcanzado o plan Gratis: el correo sale igual, sin marca;
 * - "Plan y facturación" muestra cuántos van del tope.
 */
describe('Org branded emails (brandedEmails: marca, tope mensual, nunca bloquea)', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  let plans: PlansService;
  let delivery: NotificationPort;
  const sent: NotificationMessage[] = [];
  const transport: NotificationPort = {
    send: async (message) => {
      sent.push(message);
    },
  };
  const admin = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  const orgIds: string[] = [];
  const month = new Date().toISOString().slice(0, 7);

  interface Actor {
    token: string;
    orgId: string;
  }
  let orgA: Actor;
  let orgB: Actor;

  const setEnforced = (value: boolean) =>
    Object.defineProperty(plans, 'enforced', { value, configurable: true });

  async function registerOrg(name: string): Promise<Actor> {
    const res = await request(server)
      .post('/auth/register/organization')
      .send({
        ...LEGAL_ORG,
        organizationName: name,
        displayName: `Owner ${name}`,
        email: `branded-${randomUUID()}@test.local`,
        password: 'password-1234',
      })
      .expect(201);
    orgIds.push(res.body.user.organizationId);
    return { token: res.body.tokens.accessToken, orgId: res.body.user.organizationId };
  }

  const thanks = (org: Actor, orgName: string) =>
    delivery.send({
      to: 'donante@test.local',
      subject: 'Respaldo',
      body: 'Respaldo',
      template: {
        event: 'donation.thanks',
        organizationName: orgName,
        organizationId: org.orgId,
        data: { monto: 50_000, enlace: 'https://adoptafacil.org/donaciones/x' },
      },
    });

  const usage = (org: Actor) =>
    admin.organizationEmailUsage.findUnique({
      where: { organizationId_month: { organizationId: org.orgId, month } },
    });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(NOTIFICATION_TRANSPORT)
      .useValue(transport)
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
    server = app.getHttpServer();
    plans = app.get(PlansService);
    delivery = app.get<NotificationPort>(EMAIL_DELIVERY);

    orgA = await registerOrg('Fundación Marca A');
    orgB = await registerOrg('Refugio Marca B');
    await admin.organizationProfile.upsert({
      where: { organizationId: orgA.orgId },
      create: { organizationId: orgA.orgId, contactEmail: 'contacto@marca-a.org' },
      update: { contactEmail: 'contacto@marca-a.org' },
    });
    await admin.portalTheme.upsert({
      where: { organizationId: orgA.orgId },
      create: {
        organizationId: orgA.orgId,
        tokens: { primary: '142 72% 29%', 'primary-foreground': '0 0% 100%' },
      },
      update: { tokens: { primary: '142 72% 29%', 'primary-foreground': '0 0% 100%' } },
    });
  });

  afterAll(async () => {
    setEnforced(false);
    await purgeOrganizations(admin, orgIds);
    await admin.$disconnect();
    await app.close();
  });

  beforeEach(() => {
    sent.length = 0;
  });

  it('con plan: sale con la marca, el remitente y el responder a de la organización', async () => {
    await thanks(orgA, 'Fundación Marca A');
    expect(sent).toHaveLength(1);
    const email = sent[0];
    expect(email.fromName).toBe('Fundación Marca A vía AdoptaFácil');
    expect(email.replyTo).toBe('contacto@marca-a.org');
    expect(email.html).toContain('Fundación Marca A</td>');
    expect(email.html).toContain('a través de 🐾 Adopta');
    expect(email.html).toContain('background:#157f3c');
    expect((await usage(orgA))?.brandedCount).toBe(1);
  });

  it('el contador es por organización: B sin correo de contacto no recibe responder a', async () => {
    await thanks(orgB, 'Refugio Marca B');
    expect(sent[0].fromName).toBe('Refugio Marca B vía AdoptaFácil');
    expect(sent[0].replyTo).toBeUndefined();
    expect((await usage(orgB))?.brandedCount).toBe(1);
    expect((await usage(orgA))?.brandedCount).toBe(1);
  });

  it('tope del mes alcanzado: el correo sale igual, con la marca de AdoptaFácil', async () => {
    await admin.organizationEmailUsage.update({
      where: { organizationId_month: { organizationId: orgA.orgId, month } },
      data: { brandedCount: BRANDED_EMAIL_MONTHLY_LIMIT.pro },
    });
    await thanks(orgA, 'Fundación Marca A');
    expect(sent).toHaveLength(1);
    expect(sent[0].fromName).toBeUndefined();
    expect(sent[0].replyTo).toBeUndefined();
    expect(sent[0].html).toContain('🐾 Adopta<span');
    expect((await usage(orgA))?.brandedCount).toBe(BRANDED_EMAIL_MONTHLY_LIMIT.pro);
  });

  it('plan Gratis (planes encendidos): sin marca y sin gastar contador', async () => {
    setEnforced(true);
    try {
      await thanks(orgB, 'Refugio Marca B');
      expect(sent).toHaveLength(1);
      expect(sent[0].fromName).toBeUndefined();
      expect((await usage(orgB))?.brandedCount).toBe(1);
    } finally {
      setEnforced(false);
    }
  });

  it('"Plan y facturación" muestra los correos con marca del mes y el tope', async () => {
    const res = await request(server)
      .get('/org/plan')
      .set('Authorization', `Bearer ${orgB.token}`)
      .expect(200);
    expect(res.body.usage.brandedEmails).toEqual({
      sent: 1,
      limit: BRANDED_EMAIL_MONTHLY_LIMIT.pro,
    });
  });
});
