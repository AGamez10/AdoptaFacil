import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { purgeOrganizations } from './support/cleanup';
import { LEGAL_ORG, LEGAL_PERSON } from './support/legal';

/**
 * Comunidad · primer corte del ecosistema: directorio de servicios con
 * reseñas moderadas y ficha privada de mascota. Verifica el ciclo
 * pendiente → aprobado → público, que editar devuelve a revisión, RBAC
 * (deny-by-default) y que un tenant no toca los datos de otro por la API.
 * La no-filtración a nivel de base vive en
 * `rls-no-leak-community-directory.integration-spec.ts`.
 */
describe('Community directory + pet profiles (ecosystem first cut)', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  const admin = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  const orgIds: string[] = [];
  const password = 'password-1234';
  const city = `Ciudad ${randomUUID().slice(0, 8)}`;

  interface Actor {
    token: string;
    orgId: string;
    userId: string;
  }

  async function registerPerson(tag: string, displayName = 'Camila Rojas'): Promise<Actor> {
    const res = await request(server)
      .post('/auth/register/person')
      .send({
        ...LEGAL_PERSON,
        displayName,
        email: `dir-${tag}-${randomUUID()}@test.local`,
        password,
      })
      .expect(201);
    orgIds.push(res.body.user.organizationId);
    return {
      token: res.body.tokens.accessToken,
      orgId: res.body.user.organizationId,
      userId: res.body.user.id,
    };
  }

  async function orgActorWithRoles(tag: string, roles: string[]): Promise<Actor> {
    const res = await request(server)
      .post('/auth/register/organization')
      .send({
        ...LEGAL_ORG,
        organizationName: `Org ${tag}`,
        displayName: 'Owner',
        email: `dir-${tag}-${randomUUID()}@test.local`,
        password,
      })
      .expect(201);
    const actor = {
      token: res.body.tokens.accessToken,
      orgId: res.body.user.organizationId,
      userId: res.body.user.id,
    };
    orgIds.push(actor.orgId);
    await admin.userRole.deleteMany({ where: { userId: actor.userId } });
    for (const role of roles) {
      await admin.userRole.create({
        data: { organizationId: actor.orgId, userId: actor.userId, role },
      });
    }
    return actor;
  }

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  const listingBody = (extra: Record<string, unknown> = {}) => ({
    category: 'veterinary',
    name: 'Clínica Huellitas',
    description: 'Consulta general y vacunación.',
    department: 'Antioquia',
    city,
    whatsapp: '+57 300 123 4567',
    website: 'https://huellitas.example',
    ...extra,
  });

  let business: Actor;
  let neighbor: Actor;
  let platformAdmin: Actor;
  let listingId = '';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    server = app.getHttpServer();

    business = await registerPerson('business');
    neighbor = await registerPerson('neighbor', 'Andrés Gómez Pérez');
    platformAdmin = await orgActorWithRoles('mod', ['platform_admin']);
  });

  afterAll(async () => {
    await purgeOrganizations(admin, orgIds);
    await admin.$disconnect();
    await app?.close();
  });

  const moderate = (path: string, body: Record<string, unknown>) =>
    request(server).patch(path).set(auth(platformAdmin.token)).send(body);

  it('no token → 401 on the private endpoints', async () => {
    await request(server).post('/community/services').send(listingBody()).expect(401);
    await request(server).get('/community/pets').expect(401);
  });

  it('rejects unknown keys and a self-set status (400)', async () => {
    await request(server)
      .post('/community/services')
      .set(auth(business.token))
      .send(listingBody({ status: 'approved' }))
      .expect(400);
  });

  it('a person publishes a listing — it starts pending and is NOT public', async () => {
    const res = await request(server)
      .post('/community/services')
      .set(auth(business.token))
      .send(listingBody())
      .expect(201);
    listingId = res.body.id;
    expect(res.body).toMatchObject({ status: 'pending', organizationId: business.orgId });

    await request(server).get(`/public/community/services/${listingId}`).expect(404);
    const page = await request(server)
      .get(`/public/community/services?city=${encodeURIComponent(city)}`)
      .expect(200);
    expect(page.body.items).toHaveLength(0);
  });

  it('duplicate name in the same account → 409', async () => {
    await request(server)
      .post('/community/services')
      .set(auth(business.token))
      .send(listingBody())
      .expect(409);
  });

  it('an org account without Owner/Administrator cannot publish (403); an Owner can', async () => {
    const operator = await orgActorWithRoles('operator', ['operator']);
    await request(server)
      .post('/community/services')
      .set(auth(operator.token))
      .send(listingBody())
      .expect(403);
    const owner = await orgActorWithRoles('owner', ['owner']);
    await request(server)
      .post('/community/services')
      .set(auth(owner.token))
      .send(listingBody({ category: 'pet_shop', name: 'Tienda del refugio' }))
      .expect(201);
  });

  it('moderation is platform-only (org role → 403) and needs a reason to reject', async () => {
    await request(server).get('/platform/community/services').set(auth(business.token)).expect(403);
    await moderate(`/platform/community/services/${listingId}/moderate`, {
      decision: 'reject',
    }).expect(400);
  });

  it('once approved, the listing is public (city match is case-insensitive)', async () => {
    const res = await moderate(`/platform/community/services/${listingId}/moderate`, {
      decision: 'approve',
    }).expect(200);
    expect(res.body.status).toBe('approved');

    const page = await request(server)
      .get(
        `/public/community/services?city=${encodeURIComponent(city.toUpperCase())}&category=veterinary`,
      )
      .expect(200);
    expect(page.body.items.map((i: { id: string }) => i.id)).toEqual([listingId]);
    expect(page.body.items[0]).toMatchObject({ ratingCount: 0, name: 'Clínica Huellitas' });
    expect(page.body.items[0]).not.toHaveProperty('organizationId');
  });

  it('another tenant cannot edit the listing (404 under RLS)', async () => {
    await request(server)
      .patch(`/community/services/${listingId}`)
      .set(auth(neighbor.token))
      .send({ name: 'Robado' })
      .expect(404);
  });

  it('nobody reviews their own listing (403); a neighbor review starts pending', async () => {
    await request(server)
      .post(`/community/services/${listingId}/reviews`)
      .set(auth(business.token))
      .send({ rating: 5 })
      .expect(403);
    const res = await request(server)
      .post(`/community/services/${listingId}/reviews`)
      .set(auth(neighbor.token))
      .send({ rating: 4, comment: 'Muy amables con mi gata.' })
      .expect(201);
    expect(res.body.status).toBe('pending');
    await request(server)
      .post(`/community/services/${listingId}/reviews`)
      .set(auth(neighbor.token))
      .send({ rating: 1 })
      .expect(409);

    const reviews = await request(server)
      .get(`/public/community/services/${listingId}/reviews`)
      .expect(200);
    expect(reviews.body.items).toHaveLength(0);
  });

  it('an approved review is public with only the first name, and counts in the rating', async () => {
    const queue = await request(server)
      .get('/platform/community/service-reviews?status=pending')
      .set(auth(platformAdmin.token))
      .expect(200);
    const pending = queue.body.items.find((r: { listingId: string }) => r.listingId === listingId);
    expect(pending).toBeDefined();
    await moderate(`/platform/community/service-reviews/${pending.id}/moderate`, {
      decision: 'approve',
    }).expect(200);

    const reviews = await request(server)
      .get(`/public/community/services/${listingId}/reviews`)
      .expect(200);
    expect(reviews.body.items).toEqual([
      expect.objectContaining({ rating: 4, authorName: 'Andrés' }),
    ]);
    expect(reviews.body.items[0]).not.toHaveProperty('authorUserId');

    const detail = await request(server).get(`/public/community/services/${listingId}`).expect(200);
    expect(detail.body).toMatchObject({ ratingAverage: 4, ratingCount: 1 });
  });

  it('editing the content sends the listing back to review and out of the directory', async () => {
    const res = await request(server)
      .patch(`/community/services/${listingId}`)
      .set(auth(business.token))
      .send({ description: 'Ahora también peluquería.' })
      .expect(200);
    expect(res.body.status).toBe('pending');
    await request(server).get(`/public/community/services/${listingId}`).expect(404);
  });

  it('moderation decisions are audited in the business tenant', async () => {
    const audit = await admin.auditLog.findMany({
      where: { organizationId: business.orgId, entityId: listingId },
    });
    expect(audit.map((a) => a.action)).toEqual(
      expect.arrayContaining([
        'community_service_listing.created',
        'community_service_listing.approved',
        'community_service_listing.updated',
      ]),
    );
  });

  describe('pet profiles', () => {
    let petId = '';

    it('an organization account cannot keep pet profiles (403)', async () => {
      const owner = await orgActorWithRoles('owner-pets', ['owner']);
      await request(server)
        .post('/community/pets')
        .set(auth(owner.token))
        .send({ name: 'Rocky', species: 'dog' })
        .expect(403);
    });

    it('rejects a future birth date (400)', async () => {
      await request(server)
        .post('/community/pets')
        .set(auth(neighbor.token))
        .send({ name: 'Mishi', species: 'cat', birthDate: '2999-01-01' })
        .expect(400);
    });

    it('a person creates, lists and edits their pet', async () => {
      const res = await request(server)
        .post('/community/pets')
        .set(auth(neighbor.token))
        .send({ name: 'Mishi', species: 'cat', birthDate: '2022-03-10', sterilized: true })
        .expect(201);
      petId = res.body.id;
      expect(res.body).toMatchObject({ name: 'Mishi', birthDate: '2022-03-10', sterilized: true });

      const list = await request(server)
        .get('/community/pets')
        .set(auth(neighbor.token))
        .expect(200);
      expect(list.body.map((p: { id: string }) => p.id)).toEqual([petId]);

      const edited = await request(server)
        .patch(`/community/pets/${petId}`)
        .set(auth(neighbor.token))
        .send({ breed: 'Criolla' })
        .expect(200);
      expect(edited.body.breed).toBe('Criolla');
    });

    it('another person never sees nor touches it (empty list, 404)', async () => {
      const list = await request(server)
        .get('/community/pets')
        .set(auth(business.token))
        .expect(200);
      expect(list.body).toEqual([]);
      await request(server)
        .patch(`/community/pets/${petId}`)
        .set(auth(business.token))
        .send({ name: 'Mía' })
        .expect(404);
      await request(server)
        .delete(`/community/pets/${petId}`)
        .set(auth(business.token))
        .expect(404);
    });

    it('the owner deletes it', async () => {
      await request(server)
        .delete(`/community/pets/${petId}`)
        .set(auth(neighbor.token))
        .expect(204);
      const list = await request(server)
        .get('/community/pets')
        .set(auth(neighbor.token))
        .expect(200);
      expect(list.body).toEqual([]);
    });
  });
});
