import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { purgeOrganizations } from './support/cleanup';
import { LEGAL_ORG } from './support/legal';
import { approveTestOrganization } from './support/organization-status';

interface NetworkOrg {
  id: string;
  slug: string;
  name: string;
  city?: string;
  animals: number;
  photos: string[];
}

/**
 * `GET /public/network` (landing, sin sesión): cifras reales de TODA la red de
 * adopción. Mismo universo que el catálogo global: solo organizaciones
 * aprobadas con slug público y animales activos disponibles o en proceso.
 * Nunca una organización sin slug ni un animal adoptado.
 */
describe('Public adoption network (landing)', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  const admin = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  const createdOrgIds: string[] = [];
  const city = `Ciudad-${randomUUID().slice(0, 6)}`;
  let slugA = '';
  let noSlugOrgId = '';

  async function registerOrg(name: string): Promise<{ token: string; orgId: string }> {
    const res = await request(server)
      .post('/auth/register/organization')
      .send({
        ...LEGAL_ORG,
        organizationName: name,
        displayName: 'Owner',
        email: `t-net-${randomUUID()}@test.local`,
        password: 'password-1234',
      })
      .expect(201);
    const orgId = res.body.user.organizationId as string;
    createdOrgIds.push(orgId);
    await approveTestOrganization(admin, orgId);
    return { token: res.body.tokens.accessToken, orgId };
  }

  const createAnimal = (token: string, body: Record<string, unknown>) =>
    request(server)
      .post('/animals')
      .set('Authorization', `Bearer ${token}`)
      .send({ approximateAgeMonths: 12, species: 'dog', sex: 'male', size: 'medium', ...body })
      .expect(201);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    server = app.getHttpServer();

    const a = await registerOrg('Red Pública A');
    slugA = `net-${randomUUID().slice(0, 8)}`;
    await request(server)
      .put('/org/profile')
      .set('Authorization', `Bearer ${a.token}`)
      .send({ slug: slugA, location: { city } })
      .expect(200);
    await createAnimal(a.token, { name: 'RedUno' });
    await createAnimal(a.token, { name: 'RedDos', species: 'cat', sex: 'female' });
    await createAnimal(a.token, { name: 'RedAdoptado', status: 'adopted' });

    const hidden = await registerOrg('Red Sin Slug');
    noSlugOrgId = hidden.orgId;
    await createAnimal(hidden.token, { name: 'RedOculto' });
  });

  afterAll(async () => {
    await purgeOrganizations(admin, createdOrgIds);
    await admin.$disconnect();
    await app?.close();
  });

  it('cuenta solo animales adoptables de organizaciones públicas, con su ciudad', async () => {
    const res = await request(server).get('/public/network').expect(200);
    const orgs = res.body.items as NetworkOrg[];
    const a = orgs.find((org) => org.slug === slugA);
    expect(a).toMatchObject({ name: 'Red Pública A', city, animals: 2, photos: [] });
    expect(orgs.some((org) => org.id === noSlugOrgId)).toBe(false);
    expect(res.body.cities).toEqual(expect.arrayContaining([{ city, count: 2 }]));
    expect(res.body.organizations).toBeGreaterThanOrEqual(1);
    expect(res.body.animals).toBeGreaterThanOrEqual(2);
  });

  it('coincide con el total del catálogo global', async () => {
    const [network, catalog] = await Promise.all([
      request(server).get('/public/network').expect(200),
      request(server).get('/public/animals?limit=1').expect(200),
    ]);
    expect(network.body.animals).toBe(catalog.body.total);
  });
});
