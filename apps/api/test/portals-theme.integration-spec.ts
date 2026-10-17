import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { purgeOrganizations } from './support/cleanup';
import { LEGAL_PERSON, LEGAL_ORG } from './support/legal';
import { approveTestOrganization } from './support/organization-status';

/**
 * M14 portal personalization (T-027): the owner saves brand tokens (validated:
 * format + contrast, tokens only), a non-Owner/Admin cannot edit (deny-by-default,
 * 403), and the public portal read returns only the (public) tokens by slug —
 * never another org's data.
 */
describe('Portal theme (M14: tokens + RBAC + public read)', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  const admin = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  const createdOrgIds: string[] = [];
  const password = 'password-1234';

  let ownerToken = '';
  let personToken = '';
  const slug = `theme-a-${randomUUID().slice(0, 8)}`;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    server = app.getHttpServer();

    const ownerReg = await request(server)
      .post('/auth/register/organization')
      .send({
        ...LEGAL_ORG,
        organizationName: 'Refugio Tema',
        displayName: 'Owner',
        email: `t027-${randomUUID()}@test.local`,
        password,
      })
      .expect(201);
    await approveTestOrganization(admin, ownerReg.body.user.organizationId);
    ownerToken = ownerReg.body.tokens.accessToken;
    createdOrgIds.push(ownerReg.body.user.organizationId);

    // Give the org a slug so the public theme read can find it.
    await request(server)
      .put('/org/profile')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ slug })
      .expect(200);

    const personReg = await request(server)
      .post('/auth/register/person')
      .send({
        ...LEGAL_PERSON,
        displayName: 'Persona',
        email: `t027-p-${randomUUID()}@test.local`,
        password,
      })
      .expect(201);
    personToken = personReg.body.tokens.accessToken;
    createdOrgIds.push(personReg.body.user.organizationId);
  });

  afterAll(async () => {
    await purgeOrganizations(admin, createdOrgIds);
    await admin.$disconnect();
    await app?.close();
  });

  it('returns an empty theme before anything is saved', async () => {
    const res = await request(server)
      .get('/portals/theme')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(res.body.tokens).toEqual({});
  });

  it('lets an Owner save a valid theme and persists it', async () => {
    const res = await request(server)
      .put('/portals/theme')
      .set('Authorization', `Bearer ${ownerToken}`)
      // primary/foreground pair meets the AA 4.5:1 contrast minimum (5.07:1).
      .send({
        tokens: { primary: '142 72% 29%', 'primary-foreground': '0 0% 100%' },
      })
      .expect(200);
    expect(res.body.tokens.primary).toBe('142 72% 29%');

    const read = await request(server)
      .get('/portals/theme')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(read.body.tokens.primary).toBe('142 72% 29%');
  });

  it('rejects unsafe/invalid tokens with 400 (tokens only, format — never contrast)', async () => {
    // Unknown key.
    await request(server)
      .put('/portals/theme')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ tokens: { 'font-sans': 'url(evil)' } })
      .expect(400);
    // Malformed color.
    await request(server)
      .put('/portals/theme')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ tokens: { primary: '#ff0000' } })
      .expect(400);
    // `secondary`/`radius` were REMOVED (T-PERSONALIZACION-AUDIT: neither
    // painted anything in the real portal) — now rejected like any unknown key.
    await request(server)
      .put('/portals/theme')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ tokens: { secondary: '213 20% 93%' } })
      .expect(400);
    await request(server)
      .put('/portals/theme')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ tokens: { radius: '0.5rem' } })
      .expect(400);
  });

  it('accepts (never blocks) a color/foreground pair below the minimum contrast — a warning, not a save-blocker', async () => {
    const res = await request(server)
      .put('/portals/theme')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ tokens: { primary: '142 72% 90%', 'primary-foreground': '0 0% 100%' } })
      .expect(200);
    expect(res.body.tokens.primary).toBe('142 72% 90%');

    // Restore the valid pair so downstream assertions (audit/public read) keep
    // seeing the theme this suite set up — this test only proves contrast
    // never blocks the save, not the org's final theme state.
    await request(server)
      .put('/portals/theme')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        tokens: { primary: '142 72% 29%', 'primary-foreground': '0 0% 100%' },
      })
      .expect(200);
  });

  it('forbids a user without Owner/Administrator from editing (403, deny-by-default)', async () => {
    await request(server)
      .put('/portals/theme')
      .set('Authorization', `Bearer ${personToken}`)
      .send({ tokens: { primary: '24 90% 45%' } })
      .expect(403);
  });

  it('records an audit event on each theme update (keys only, never values)', async () => {
    const orgId = createdOrgIds[0];
    const events = await admin.auditLog.findMany({
      where: { organizationId: orgId, action: 'portal.theme_updated' },
    });
    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(events[0].metadata)).not.toContain('142 72% 29%');
  });

  describe('public endpoint GET /public/organizations/:slug/theme', () => {
    it('returns the saved tokens for a known slug (no auth)', async () => {
      const res = await request(server).get(`/public/organizations/${slug}/theme`).expect(200);
      expect(res.body.tokens.primary).toBe('142 72% 29%');
    });

    it('returns an empty theme for an unknown slug (no cross-org leak)', async () => {
      const res = await request(server)
        .get(`/public/organizations/does-not-exist-${randomUUID().slice(0, 6)}/theme`)
        .expect(200);
      expect(res.body.tokens).toEqual({});
    });
  });
  describe('Ola 3: plantilla del portal', () => {
    it('guarda la plantilla, la conserva al cambiar solo colores y la expone en público sin filtrarla como token', async () => {
      await request(server)
        .put('/portals/theme')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          tokens: { primary: '142 72% 29%', 'primary-foreground': '0 0% 100%' },
          template: 'carnet',
        })
        .expect(200)
        .expect((res) => {
          expect(res.body.template).toBe('carnet');
          expect(res.body.tokens).not.toHaveProperty('__template');
        });

      // Sin `template`: se conserva la guardada.
      await request(server)
        .put('/portals/theme')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ tokens: { primary: '142 72% 29%', 'primary-foreground': '0 0% 100%' } })
        .expect(200)
        .expect((res) => expect(res.body.template).toBe('carnet'));

      const pub = await request(server).get(`/public/organizations/${slug}/theme`).expect(200);
      expect(pub.body.template).toBe('carnet');
      expect(pub.body.tokens).not.toHaveProperty('__template');
    });

    it('rechaza una plantilla fuera del catálogo y no deja meter la clave reservada como token', async () => {
      await request(server)
        .put('/portals/theme')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ tokens: {}, template: 'hackeada' })
        .expect(400);
      await request(server)
        .put('/portals/theme')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ tokens: { __template: 'impacto' } })
        .expect(400);
    });

    it('guarda los ajustes de la plantilla, los resuelve con valores por defecto y los expone en público', async () => {
      await request(server)
        .put('/portals/theme')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ tokens: {}, template: 'orbita', templateOptions: { density: 'intensa' } })
        .expect(200)
        .expect((res) => {
          expect(res.body.templateOptions).toEqual({ density: 'intensa', showCount: true });
          expect(res.body.tokens).not.toHaveProperty('__templateOptions');
        });

      // Solo colores: se conservan plantilla y ajustes.
      await request(server)
        .put('/portals/theme')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ tokens: {} })
        .expect(200)
        .expect((res) => expect(res.body.templateOptions.density).toBe('intensa'));

      const pub = await request(server).get(`/public/organizations/${slug}/theme`).expect(200);
      expect(pub.body.template).toBe('orbita');
      expect(pub.body.templateOptions).toEqual({ density: 'intensa', showCount: true });
      expect(pub.body.tokens).not.toHaveProperty('__templateOptions');

      // Al cambiar de plantilla, los ajustes de la anterior no se arrastran.
      await request(server)
        .put('/portals/theme')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ tokens: {}, template: 'carnet' })
        .expect(200)
        .expect((res) =>
          expect(res.body.templateOptions).toEqual({ pattern: 'puntos', showMinis: true }),
        );
    });

    it('rechaza ajustes que la plantilla no declara (deny-by-default)', async () => {
      for (const templateOptions of [
        { density: 'intensa' }, // de otra plantilla (la actual es carnet)
        { pattern: 'url(javascript:alert(1))' },
        { showMinis: 'si' },
      ]) {
        await request(server)
          .put('/portals/theme')
          .set('Authorization', `Bearer ${ownerToken}`)
          .send({ tokens: {}, template: 'carnet', templateOptions })
          .expect(400);
      }
      await request(server)
        .put('/portals/theme')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ tokens: { __templateOptions: 'x' } })
        .expect(400);
    });

    it('Historias: guarda un video de portada propio y público, lo expone como URL y lo quita con null', async () => {
      const orgId = createdOrgIds[0];
      const reserve = await request(server)
        .post('/org/profile/uploads')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ filename: 'portada.webm', contentType: 'video/webm' })
        .expect(201);
      const key: string = reserve.body.key;
      expect(key.startsWith(`public/${orgId}/`)).toBe(true);

      await request(server)
        .put('/portals/theme')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ tokens: {}, template: 'historias', coverVideoKey: key })
        .expect(200)
        .expect((res) => {
          expect(res.body.template).toBe('historias');
          expect(res.body.templateOptions).toEqual({ autoAdvance: false });
          expect(res.body.coverVideoUrl).toContain('portada.webm');
          expect(res.body.tokens).not.toHaveProperty('__coverVideo');
        });

      // Solo colores: el video se conserva y sale en público.
      await request(server)
        .put('/portals/theme')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ tokens: {} })
        .expect(200);
      const pub = await request(server).get(`/public/organizations/${slug}/theme`).expect(200);
      expect(pub.body.coverVideoUrl).toContain('portada.webm');
      expect(pub.body.tokens).not.toHaveProperty('__coverVideo');

      await request(server)
        .put('/portals/theme')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ tokens: {}, coverVideoKey: null })
        .expect(200)
        .expect((res) => expect(res.body).not.toHaveProperty('coverVideoUrl'));
    });

    it('Historias: rechaza un video ajeno, privado, que no es video o una URL libre', async () => {
      const orgId = createdOrgIds[0];
      const otherOrg = randomUUID();
      const cases: Array<[string, number]> = [
        [`public/${otherOrg}/${randomUUID()}-x.mp4`, 403],
        [`private/${orgId}/${randomUUID()}-x.mp4`, 400],
        [`public/${orgId}/${randomUUID()}-x.png`, 400],
        ['https://otro-sitio.example/video.mp4', 400],
      ];
      for (const [coverVideoKey, status] of cases) {
        await request(server)
          .put('/portals/theme')
          .set('Authorization', `Bearer ${ownerToken}`)
          .send({ tokens: {}, coverVideoKey })
          .expect(status);
      }
      await request(server)
        .put('/portals/theme')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ tokens: { __coverVideo: 'x' } })
        .expect(400);
    });

    it('un slug desconocido recibe la plantilla por defecto', async () => {
      const res = await request(server)
        .get(`/public/organizations/does-not-exist-${randomUUID().slice(0, 6)}/theme`)
        .expect(200);
      expect(res.body.template).toBe('clasica');
    });
  });
});
