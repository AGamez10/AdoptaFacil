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
 * M01 organization profile: CRUD with RBAC, the simulable upload seam, and the
 * public portal endpoint (public fields only, NIT gated on formalization, never
 * private data, never another org's data).
 */
describe('Organization profile (M01: CRUD + RBAC + public endpoint)', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  const admin = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  const createdOrgIds: string[] = [];
  const password = 'password-1234';

  let ownerToken = '';
  let ownerOrgId = '';
  let personToken = '';
  const slugA = `refugio-a-${randomUUID().slice(0, 8)}`;

  async function registerOrg(name: string): Promise<{ token: string; orgId: string }> {
    const res = await request(server)
      .post('/auth/register/organization')
      .send({
        ...LEGAL_ORG,
        organizationName: name,
        displayName: 'Owner',
        email: `t101-${randomUUID()}@test.local`,
        password,
      })
      .expect(201);
    await approveTestOrganization(admin, res.body.user.organizationId);
    createdOrgIds.push(res.body.user.organizationId);
    return { token: res.body.tokens.accessToken, orgId: res.body.user.organizationId };
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    server = app.getHttpServer();

    const owner = await registerOrg('Refugio A');
    ownerToken = owner.token;
    ownerOrgId = owner.orgId;

    const personReg = await request(server)
      .post('/auth/register/person')
      .send({
        ...LEGAL_PERSON,
        displayName: 'Persona',
        email: `t101-person-${randomUUID()}@test.local`,
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

  it('returns the own profile with defaults for a fresh org (formalization = informal)', async () => {
    const res = await request(server)
      .get('/org/profile')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(res.body.id).toBe(ownerOrgId);
    expect(res.body.name).toBe('Refugio A');
    expect(res.body.formalizationState).toBe('informal');
    expect(res.body.rteVigente).toBe(false);
  });

  it('lets an Owner edit the profile and persists it', async () => {
    const res = await request(server)
      .put('/org/profile')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        nit: '900123456-7',
        legalName: 'Fundación Refugio A',
        description: 'Refugio de perros y gatos',
        logoUrl: 'https://cdn.test/logo.png',
        coverPhotos: ['https://cdn.test/c1.jpg', 'https://cdn.test/c2.jpg'],
        whatsapp: '+573001234567',
        contactEmail: 'contacto@refugioa.test',
        phone: '+576011234567',
        location: { country: 'CO', department: 'Antioquia', city: 'Medellín', address: 'Calle 1' },
        socialLinks: { instagram: 'https://instagram.com/refugioa' },
        slug: slugA,
      })
      .expect(200);
    expect(res.body.nit).toBe('900123456-7');
    expect(res.body.slug).toBe(slugA);
    expect(res.body.location.city).toBe('Medellín');

    const read = await request(server)
      .get('/org/profile')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(read.body.description).toBe('Refugio de perros y gatos');
    expect(read.body.coverPhotos).toHaveLength(2);
    expect(read.body.socialLinks.instagram).toBe('https://instagram.com/refugioa');
  });

  it('rejects a slug already used by another organization with a clear 409 — never a raw 500', async () => {
    const other = await registerOrg('Refugio B');
    const res = await request(server)
      .put('/org/profile')
      .set('Authorization', `Bearer ${other.token}`)
      .send({ slug: slugA })
      .expect(409);
    expect(res.body.message).toBe('Este nombre de portal ya está en uso. Elige otro.');

    // The failed write must not have partially applied — Refugio B still has
    // no slug (the whole upsert rolled back inside the same transaction).
    const read = await request(server)
      .get('/org/profile')
      .set('Authorization', `Bearer ${other.token}`)
      .expect(200);
    expect(read.body.slug ?? null).toBeNull();
  });

  it('forbids a user without Owner/Administrator from editing (403)', async () => {
    await request(server)
      .put('/org/profile')
      .set('Authorization', `Bearer ${personToken}`)
      .send({ description: 'hacked' })
      .expect(403);
  });

  it('rejects unknown/forbidden fields (e.g. formalizationState) with 400', async () => {
    await request(server)
      .put('/org/profile')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ formalizationState: 'esal_rte' })
      .expect(400);
  });

  it('reserves a simulable upload target (Owner only)', async () => {
    const res = await request(server)
      .post('/org/profile/uploads')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ filename: 'logo.png', contentType: 'image/png' })
      .expect(201);
    expect(res.body.url).toContain(ownerOrgId);
    expect(res.body.key).toContain('logo.png');
    await request(server)
      .post('/org/profile/uploads')
      .set('Authorization', `Bearer ${personToken}`)
      .send({ filename: 'x.png' })
      .expect(403);
  });

  it('records an audit event on each profile update', async () => {
    const events = await admin.auditLog.findMany({
      where: { organizationId: ownerOrgId, action: 'organization.profile_updated' },
    });
    expect(events.length).toBeGreaterThanOrEqual(1);
    // Only field names are recorded, never values.
    expect(JSON.stringify(events[0].metadata)).not.toContain('900123456-7');
  });

  describe('AF-N01: identidad legal bloqueada tras la verificación de la plataforma', () => {
    it('no deja cambiar NIT, razón social ni nombre en ESAL con RTE; sí el resto del perfil', async () => {
      const org = await registerOrg('Fundación Verificada');
      await request(server)
        .put('/org/profile')
        .set('Authorization', `Bearer ${org.token}`)
        .send({
          nit: `9009${randomUUID().replace(/\D/g, '').slice(0, 5)}-1`,
          legalName: 'Fundación Verificada',
        })
        .expect(200);
      // La plataforma (PlatformAdmin con MFA) aprueba la ESAL con RTE.
      await admin.organizationProfile.update({
        where: { organizationId: org.orgId },
        data: { formalizationState: 'esal_rte', rteVigente: true },
      });
      const before = await admin.organizationProfile.findUniqueOrThrow({
        where: { organizationId: org.orgId },
      });

      for (const change of [
        { nit: '900999999-1' },
        { legalName: 'Otra Fundación S.A.S.' },
        { name: 'Otra Fundación' },
      ]) {
        const res = await request(server)
          .put('/org/profile')
          .set('Authorization', `Bearer ${org.token}`)
          .send(change)
          .expect(409);
        expect(res.body.message).toContain('nueva verificación');
      }

      const after = await admin.organizationProfile.findUniqueOrThrow({
        where: { organizationId: org.orgId },
        include: { organization: true },
      });
      expect(after.nit).toBe(before.nit);
      expect(after.legalName).toBe('Fundación Verificada');
      expect(after.organization.name).toBe('Fundación Verificada');
      const blocked = await admin.auditLog.count({
        where: { organizationId: org.orgId, action: 'organization.legal_identity_change_blocked' },
      });
      expect(blocked).toBe(3);

      // Reenviar los mismos datos (el formulario manda todo) y editar lo demás sí funciona.
      await request(server)
        .put('/org/profile')
        .set('Authorization', `Bearer ${org.token}`)
        .send({
          nit: before.nit,
          legalName: before.legalName,
          name: 'Fundación Verificada',
          description: 'Nueva',
        })
        .expect(200);

      // Bajando el estado (suspende certificados) se puede corregir y pedir verificación otra vez.
      await admin.organizationProfile.update({
        where: { organizationId: org.orgId },
        data: { formalizationState: 'formalizada', rteVigente: false },
      });
      await request(server)
        .put('/org/profile')
        .set('Authorization', `Bearer ${org.token}`)
        .send({ legalName: 'Fundación Verificada Corregida' })
        .expect(200);
    });
  });

  describe('public endpoint GET /public/organizations/:slug', () => {
    it('returns only public fields; hides NIT while informal; never phone/legalName', async () => {
      const res = await request(server).get(`/public/organizations/${slugA}`).expect(200);
      expect(res.body.name).toBe('Refugio A');
      expect(res.body.slug).toBe(slugA);
      expect(res.body.description).toBe('Refugio de perros y gatos');
      // Informal → NIT hidden; private fields never exposed.
      expect(res.body.nit ?? null).toBeNull();
      expect(res.body).not.toHaveProperty('phone');
      expect(res.body).not.toHaveProperty('legalName');
    });

    it('exposes NIT once the organization is formalized', async () => {
      await admin.organizationProfile.update({
        where: { organizationId: ownerOrgId },
        data: { formalizationState: 'formalizada' },
      });
      const res = await request(server).get(`/public/organizations/${slugA}`).expect(200);
      expect(res.body.nit).toBe('900123456-7');
      expect(res.body).not.toHaveProperty('phone');
    });

    it('returns 404 for an unknown slug (no cross-org leak)', async () => {
      await request(server)
        .get(`/public/organizations/does-not-exist-${randomUUID().slice(0, 6)}`)
        .expect(404);
    });
  });
});
