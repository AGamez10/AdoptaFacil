import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { NOTIFICATION_TRANSPORT } from '../src/core/notifications/notification.module';
import {
  NOTIFICATION_PORT,
  type NotificationMessage,
  type NotificationPort,
} from '../src/core/notifications/notification.port';
import { hashEmail, signUnsubscribe } from '../src/core/notifications/templates/email-compose';
import { EmailTemplateService } from '../src/core/notifications/templates/email-template.service';
import { loadAuthConfig } from '../src/core/auth/auth.config';
import { purgeOrganizations } from './support/cleanup';

/**
 * Superadmin email templates: RBAC (platform roles only), versioning, activate
 * / switch off, preview, idempotency, audit, append-only grants, and the
 * bulk-email opt-out end to end (Ley 1581). Uses one transactional and one
 * bulk event; every row this spec writes is removed as superuser afterwards.
 */
describe('Email templates (superadmin panel)', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  const admin = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  const appRole = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL_APP } } });
  const createdOrgIds: string[] = [];
  const sent: NotificationMessage[] = [];
  const EVENT = 'volunteering.enrollment_received';
  const BULK = 'community.campaign_update';
  const optedOut = `optout-${randomUUID()}@test.local`;

  interface Actor {
    token: string;
    orgId: string;
    userId: string;
  }

  async function registerOrg(): Promise<Actor> {
    const res = await request(server)
      .post('/auth/register/organization')
      .send({
        organizationName: 'Refugio Correos',
        displayName: 'Owner',
        email: `mail-${randomUUID()}@test.local`,
        password: 'password123',
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
  const draft = {
    subject: 'Recibimos tu inscripción, {{nombre}}',
    preheader: 'Pronto te contamos',
    heading: '¡Gracias {{nombre}}!',
    body: 'Te inscribiste a **{{oportunidad}}** en {{organizacion}}.',
  };

  async function cleanTemplates(): Promise<void> {
    await admin.emailTemplateSetting.deleteMany({ where: { eventKey: { in: [EVENT, BULK] } } });
    await admin.emailTemplateVersion.deleteMany({ where: { eventKey: { in: [EVENT, BULK] } } });
    await admin.emailSuppression.deleteMany({ where: { emailHash: hashEmail(optedOut) } });
  }

  let platformAdmin: Actor;
  let owner: Actor;

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
    await cleanTemplates();

    platformAdmin = await registerOrg();
    await admin.userRole.create({
      data: {
        organizationId: platformAdmin.orgId,
        userId: platformAdmin.userId,
        role: 'platform_admin',
      },
    });
    owner = await registerOrg();
  });

  afterAll(async () => {
    await cleanTemplates();
    await purgeOrganizations(admin, createdOrgIds);
    await admin.$disconnect();
    await appRole.$disconnect();
    await app?.close();
  });

  it('an org Owner gets 403 on every superadmin route (deny-by-default)', async () => {
    await request(server).get('/platform/email-templates').set(auth(owner.token)).expect(403);
    await request(server)
      .post(`/platform/email-templates/${EVENT}/versions`)
      .set(auth(owner.token))
      .send(draft)
      .expect(403);
    await request(server)
      .put(`/platform/email-templates/${EVENT}/enabled`)
      .set(auth(owner.token))
      .send({ enabled: false })
      .expect(403);
    await request(server).get('/platform/email-templates').expect(401);
  });

  it('lists the full catalog with the default copy in use', async () => {
    const res = await request(server)
      .get('/platform/email-templates')
      .set(auth(platformAdmin.token))
      .expect(200);
    const row = res.body.find((r: { event: string }) => r.event === EVENT);
    expect(row).toMatchObject({ enabled: true, activeVersion: null, category: 'transactional' });
    expect(
      res.body.find((r: { event: string }) => r.event === 'auth.password_reset').required,
    ).toBe(true);
  });

  it('rejects unknown variables and unknown events', async () => {
    const bad = await request(server)
      .post(`/platform/email-templates/${EVENT}/versions`)
      .set(auth(platformAdmin.token))
      .send({ ...draft, body: 'Hola {{contrasena}}' })
      .expect(400);
    expect(JSON.stringify(bad.body)).toContain('{{contrasena}}');
    await request(server)
      .post('/platform/email-templates/no.existe/versions')
      .set(auth(platformAdmin.token))
      .send(draft)
      .expect(404);
    await request(server)
      .post(`/platform/email-templates/${EVENT}/versions`)
      .set(auth(platformAdmin.token))
      .send({ ...draft, html: '<b>x</b>' })
      .expect(400);
  });

  it('previews a draft escaped and with example values, without saving it', async () => {
    const res = await request(server)
      .post(`/platform/email-templates/${EVENT}/preview`)
      .set(auth(platformAdmin.token))
      .send({ content: { ...draft, body: '<script>x</script> {{nombre}}' } })
      .expect(200);
    expect(res.body.subject).toBe('Recibimos tu inscripción, Carlos');
    expect(res.body.html).toContain('&lt;script&gt;');
    expect(res.body.html).not.toContain('<script>');
    const detail = await request(server)
      .get(`/platform/email-templates/${EVENT}`)
      .set(auth(platformAdmin.token))
      .expect(200);
    expect(detail.body.versions).toHaveLength(0);
  });

  it('saves versions, activates one (audited), and real sends use it', async () => {
    const v1 = await request(server)
      .post(`/platform/email-templates/${EVENT}/versions`)
      .set(auth(platformAdmin.token))
      .send({ ...draft, changeNote: 'Más cálido' })
      .expect(201);
    expect(v1.body.latestVersion).toBe(1);
    expect(v1.body.activeVersion).toBeNull(); // saved as draft

    const active = await request(server)
      .put(`/platform/email-templates/${EVENT}/active`)
      .set(auth(platformAdmin.token))
      .send({ version: 1 })
      .expect(200);
    expect(active.body.activeVersion).toBe(1);
    expect(active.body.activeContent.subject).toBe(draft.subject);

    // Idempotent: activating the same version again adds no audit entry.
    await request(server)
      .put(`/platform/email-templates/${EVENT}/active`)
      .set(auth(platformAdmin.token))
      .send({ version: 1 })
      .expect(200);
    const audits = await admin.auditLog.findMany({
      where: {
        entityType: 'email_template',
        entityId: EVENT,
        action: 'platform.email_template.activated',
      },
    });
    expect(audits).toHaveLength(1);
    expect(audits[0].metadata).toEqual({ version: 1, previousVersion: null });

    await request(server)
      .put(`/platform/email-templates/${EVENT}/active`)
      .set(auth(platformAdmin.token))
      .send({ version: 99 })
      .expect(404);

    const port = app.get<NotificationPort>(NOTIFICATION_PORT);
    sent.length = 0;
    await port.send({
      to: 'vol@test.local',
      subject: 'fallback',
      body: 'fallback',
      template: {
        event: EVENT,
        organizationName: 'Refugio <Correos>',
        data: { nombre: 'Luisa', oportunidad: 'Paseo', organizacion: 'Refugio <Correos>' },
      },
    });
    expect(sent).toHaveLength(1);
    expect(sent[0].subject).toBe('Recibimos tu inscripción, Luisa');
    expect(sent[0].html).toContain('Refugio &lt;Correos&gt;');
    expect(sent[0].html).toContain('<strong>Paseo</strong>');
  });

  it('switching an event off stops its emails; the required one cannot be switched off', async () => {
    await request(server)
      .put(`/platform/email-templates/${EVENT}/enabled`)
      .set(auth(platformAdmin.token))
      .send({ enabled: false })
      .expect(200);
    sent.length = 0;
    await app.get<NotificationPort>(NOTIFICATION_PORT).send({
      to: 'vol@test.local',
      subject: 'x',
      body: 'x',
      template: { event: EVENT, data: {} },
    });
    expect(sent).toHaveLength(0);

    await request(server)
      .put('/platform/email-templates/auth.password_reset/enabled')
      .set(auth(platformAdmin.token))
      .send({ enabled: false })
      .expect(403);
  });

  it('versions are append-only for the runtime role', async () => {
    await expect(
      appRole.emailTemplateVersion.updateMany({
        where: { eventKey: EVENT },
        data: { subject: 'hack' },
      }),
    ).rejects.toThrow();
    await expect(
      appRole.emailTemplateVersion.deleteMany({ where: { eventKey: EVENT } }),
    ).rejects.toThrow();
    await expect(appRole.emailSuppression.deleteMany({})).rejects.toThrow();
  });

  it('test-send goes only to the acting admin, masked in the response', async () => {
    sent.length = 0;
    const res = await request(server)
      .post(`/platform/email-templates/${EVENT}/test-send`)
      .set(auth(platformAdmin.token))
      .send({})
      .expect(200);
    expect(res.body.sentTo).toMatch(/^ma•••@test\.local$/);
    expect(sent).toHaveLength(1);
    expect(sent[0].subject.startsWith('[Prueba] ')).toBe(true);
    expect(sent[0].to).toMatch(/^mail-.*@test\.local$/);
  });

  it('bulk emails carry List-Unsubscribe; after opting out (idempotent) they stop', async () => {
    const port = app.get<NotificationPort>(NOTIFICATION_PORT);
    const bulkMessage = {
      to: optedOut,
      subject: 'x',
      body: 'x',
      template: { event: BULK, data: { titulo: 'Meta', mensaje: 'Vamos' } },
    } as const;

    sent.length = 0;
    await port.send({ ...bulkMessage, template: { ...bulkMessage.template } });
    expect(sent).toHaveLength(1);
    expect(sent[0].headers?.['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
    expect(sent[0].html).toContain('/correo/baja?h=');

    const h = hashEmail(optedOut);
    const t = signUnsubscribe(loadAuthConfig().jwtSecret, h);
    const forged = signUnsubscribe('not-the-server-secret', h);
    await request(server).post('/public/email/unsubscribe').send({ h, t: forged }).expect(400);
    await request(server).post('/public/email/unsubscribe').send({ h, t }).expect(200);
    // One-click form POST from an inbox (query params), repeated: still 200.
    await request(server)
      .post(`/public/email/unsubscribe?h=${h}&t=${t}`)
      .type('form')
      .send('List-Unsubscribe=One-Click')
      .expect(200);
    const rows = await admin.emailSuppression.findMany({ where: { emailHash: h } });
    expect(rows).toHaveLength(1);

    sent.length = 0;
    await port.send({ ...bulkMessage, template: { ...bulkMessage.template } });
    expect(sent).toHaveLength(0);

    // Transactional emails to the same address keep flowing.
    app.get(EmailTemplateService).clearCache();
    await port.send({
      to: optedOut,
      subject: 'x',
      body: 'x',
      template: { event: 'auth.password_reset', data: { enlace: 'https://app.test/r' } },
    });
    expect(sent).toHaveLength(1);
  });
});
