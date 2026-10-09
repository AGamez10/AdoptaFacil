import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { purgeOrganizations } from './support/cleanup';

/**
 * Owner preview of the organization's own portal (`GET /org/portal/preview`,
 * `/animals`, `/campaigns`): works while the organization is still a draft
 * (the public portal answers 404 until it is approved), only ever shows the
 * caller's own organization, and keeps the public projection (no phone, no NIT
 * while informal).
 */
describe('Portal preview for the organization owner', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  const admin = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  const createdOrgIds: string[] = [];

  async function registerOrg(name: string) {
    const res = await request(server)
      .post('/auth/register/organization')
      .send({
        organizationName: name,
        displayName: 'Owner',
        email: `preview-${randomUUID()}@test.local`,
        password: 'password-preview-123',
      })
      .expect(201);
    createdOrgIds.push(res.body.user.organizationId);
    return { token: res.body.tokens.accessToken as string, orgId: res.body.user.organizationId };
  }

  const get = (token: string, path: string) =>
    request(server).get(path).set('Authorization', `Bearer ${token}`);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    server = app.getHttpServer();
  });

  afterAll(async () => {
    await purgeOrganizations(admin, createdOrgIds);
    await admin.$disconnect();
    await app.close();
  });

  it('shows a draft organization its own portal, animals and campaigns', async () => {
    const owner = await registerOrg('Refugio Vista Previa');
    const slug = `vista-previa-${randomUUID().slice(0, 8)}`;
    await request(server)
      .put('/org/profile')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ slug, phone: '3001234567', nit: '900123456' })
      .expect(200);
    await request(server)
      .post('/animals')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ name: 'Luna', species: 'dog', sex: 'female', size: 'medium' })
      .expect(201);
    await request(server)
      .post('/campaigns')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({
        title: 'Vacunas',
        category: 'medications',
        goalAmount: 500000,
        deadline: new Date(Date.now() + 30 * 86_400_000).toISOString(),
      })
      .expect(201);

    // The public portal does not exist yet (draft)…
    await request(server).get(`/public/organizations/${slug}`).expect(404);

    // …but the owner can preview it.
    const org = await get(owner.token, '/org/portal/preview').expect(200);
    expect(org.body).toMatchObject({ id: owner.orgId, name: 'Refugio Vista Previa', slug });
    expect(org.body).not.toHaveProperty('phone');
    expect(org.body.nit).toBeUndefined();

    const animals = await get(owner.token, '/org/portal/preview/animals').expect(200);
    expect(animals.body.total).toBe(1);
    expect(animals.body.items[0]).toMatchObject({ name: 'Luna', organizationId: owner.orgId });

    const campaigns = await get(owner.token, '/org/portal/preview/campaigns').expect(200);
    expect(campaigns.body.items.map((c: { title: string }) => c.title)).toEqual(['Vacunas']);
  });

  it('never shows another organization: each caller previews only its own', async () => {
    const a = await registerOrg('Refugio A');
    const b = await registerOrg('Refugio B');
    await request(server)
      .post('/animals')
      .set('Authorization', `Bearer ${a.token}`)
      .send({ name: 'Solo de A', species: 'cat', sex: 'male', size: 'small' })
      .expect(201);

    const orgB = await get(b.token, '/org/portal/preview').expect(200);
    expect(orgB.body.id).toBe(b.orgId);
    const animalsB = await get(b.token, '/org/portal/preview/animals').expect(200);
    expect(animalsB.body.total).toBe(0);
  });

  it('requires a session (401) and an organization role (403 for a person)', async () => {
    await request(server).get('/org/portal/preview').expect(401);
    const person = await request(server)
      .post('/auth/register/person')
      .send({
        displayName: 'Persona',
        email: `preview-person-${randomUUID()}@test.local`,
        password: 'password-preview-123',
      })
      .expect(201);
    await get(person.body.tokens.accessToken, '/org/portal/preview').expect(403);
  });
});
