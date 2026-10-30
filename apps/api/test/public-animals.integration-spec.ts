import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { purgeOrganizations } from './support/cleanup';
import { LEGAL_ORG } from './support/legal';
import { approveTestOrganization } from './support/organization-status';

/**
 * T-029 public adoption catalog: GET /public/organizations/:slug/animals (no
 * auth) exposes ONLY adoptable animals (active + status=available) of one org,
 * via the bounded SECURITY DEFINER function. Verifies exclusions (adopted /
 * inactive / other org), pagination + cap, species filter, 404, and that no
 * clinical/internal/DOB field leaks.
 */
describe('Public adoption catalog (T-029, RF07 public projection)', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  const admin = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  const createdOrgIds: string[] = [];
  const password = 'password-1234';

  interface Actor {
    token: string;
    orgId: string;
    slug: string;
  }

  async function registerOrgWithSlug(): Promise<Actor> {
    const res = await request(server)
      .post('/auth/register/organization')
      .send({
        ...LEGAL_ORG,
        organizationName: 'Refugio',
        displayName: 'Owner',
        email: `t029-${randomUUID()}@test.local`,
        password,
      })
      .expect(201);
    await approveTestOrganization(admin, res.body.user.organizationId);
    const token = res.body.tokens.accessToken;
    const orgId = res.body.user.organizationId;
    createdOrgIds.push(orgId);
    const slug = `refugio-${randomUUID().slice(0, 8)}`;
    await request(server)
      .put('/org/profile')
      .set('Authorization', `Bearer ${token}`)
      .send({ slug })
      .expect(200);
    return { token, orgId, slug };
  }

  const createAnimal = (token: string, body: Record<string, unknown>) =>
    request(server).post('/animals').set('Authorization', `Bearer ${token}`).send(body);

  const publicList = (slug: string, query = '') =>
    request(server).get(`/public/organizations/${slug}/animals${query}`);

  let orgA: Actor;
  let orgB: Actor;
  let adoptedId: string;
  let hiddenId: string;
  let soloBId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    server = app.getHttpServer();

    orgA = await registerOrgWithSlug();

    // 2 adoptable dogs (one with photo + birthDate) + 1 adoptable cat.
    await createAnimal(orgA.token, {
      name: 'Firulais',
      species: 'dog',
      sex: 'male',
      size: 'medium',
      birthDate: '2024-07-01T00:00:00.000Z',
      photos: [{ filename: 'firu.jpg' }],
    }).expect(201);
    await createAnimal(orgA.token, {
      name: 'Rex',
      species: 'dog',
      sex: 'male',
      size: 'large',
    }).expect(201);
    await createAnimal(orgA.token, {
      name: 'Michi',
      species: 'cat',
      sex: 'female',
      size: 'small',
    }).expect(201);

    // Non-adoptable: adopted status (active) → excluded.
    const adopted = await createAnimal(orgA.token, {
      name: 'Adoptado',
      species: 'dog',
      sex: 'male',
      size: 'medium',
      status: 'adopted',
    }).expect(201);
    adoptedId = adopted.body.id;

    // Inactive (available but deactivated) → excluded.
    const hidden = await createAnimal(orgA.token, {
      name: 'Oculto',
      species: 'dog',
      sex: 'male',
      size: 'medium',
    }).expect(201);
    await request(server)
      .post(`/animals/${hidden.body.id}/deactivate`)
      .set('Authorization', `Bearer ${orgA.token}`)
      .expect(201);
    hiddenId = hidden.body.id;

    // Another org with its own adoptable animal → must never appear in orgA.
    orgB = await registerOrgWithSlug();
    const soloB = await createAnimal(orgB.token, {
      name: 'SoloB',
      species: 'dog',
      sex: 'male',
      size: 'medium',
    }).expect(201);
    soloBId = soloB.body.id;
  });

  afterAll(async () => {
    await purgeOrganizations(admin, createdOrgIds);
    await admin.$disconnect();
    await app?.close();
  });

  it('returns only adoptable animals (active + available) of the org, without a token', async () => {
    const res = await publicList(orgA.slug).expect(200);
    expect(res.body.total).toBe(3);
    expect(res.body.items).toHaveLength(3);
    const names = res.body.items.map((a: { name: string }) => a.name).sort();
    expect(names).toEqual(['Firulais', 'Michi', 'Rex']);
    // Excluded ones never appear.
    expect(names).not.toContain('Adoptado');
    expect(names).not.toContain('Oculto');
    expect(names).not.toContain('SoloB');
    // All items belong to orgA and are available.
    expect(
      res.body.items.every(
        (a: { organizationId: string; status: string }) =>
          a.organizationId === orgA.orgId && a.status === 'available',
      ),
    ).toBe(true);
  });

  it('exposes only public summary fields (computedAge derived; no DOB, no clinical/internal data)', async () => {
    const res = await publicList(orgA.slug).expect(200);
    const firu = res.body.items.find((a: { name: string }) => a.name === 'Firulais');
    expect(firu.computedAge).toMatchObject({ approximate: false });
    expect(firu.primaryPhotoRef).toContain(orgA.orgId);
    expect(firu.photoUrl).toContain('http');
    // Never leak raw DOB or any clinical/internal shape.
    const keys = Object.keys(firu);
    expect(keys).not.toContain('birthDate');
    expect(keys).not.toContain('approximateAgeMonths');
    expect(keys).not.toContain('clinicalEvents');
    expect(keys).not.toContain('description');
    expect(keys).not.toContain('breedId');
  });

  it('paginates with a server cap and supports the species filter', async () => {
    const first = await publicList(orgA.slug, '?limit=1&offset=0').expect(200);
    expect(first.body.items).toHaveLength(1);
    expect(first.body.total).toBe(3);
    expect(first.body.limit).toBe(1);

    // Over-cap limit is clamped to 50.
    const capped = await publicList(orgA.slug, '?limit=999').expect(200);
    expect(capped.body.limit).toBe(50);
    expect(capped.body.items).toHaveLength(3);

    const dogs = await publicList(orgA.slug, '?species=dog').expect(200);
    expect(dogs.body.total).toBe(2);
    expect(dogs.body.items.every((a: { species: string }) => a.species === 'dog')).toBe(true);

    const cats = await publicList(orgA.slug, '?species=cat').expect(200);
    expect(cats.body.total).toBe(1);
    expect(cats.body.items[0].name).toBe('Michi');
  });

  it('returns 404 for an unknown slug (no public portal)', async () => {
    await publicList(`nope-${randomUUID().slice(0, 8)}`).expect(404);
  });

  it('rejects an invalid species filter (400)', async () => {
    await publicList(orgA.slug, '?species=dragon').expect(400);
  });

  describe('public animal page (GET /public/organizations/:slug/animals/:ref)', () => {
    const publicDetail = (slug: string, ref: string) =>
      request(server).get(`/public/organizations/${slug}/animals/${ref}`);

    it('lists a non-enumerable public code for every adoptable animal', async () => {
      const res = await publicList(orgA.slug).expect(200);
      const codes = res.body.items.map((a: { publicCode: string }) => a.publicCode);
      expect(codes.every((c: string) => /^[0-9a-hjkmnp-tv-z]{8}$/.test(c))).toBe(true);
      expect(new Set(codes).size).toBe(codes.length);
    });

    it('resolves an adoptable animal by public code and by legacy id, same projection', async () => {
      const list = await publicList(orgA.slug).expect(200);
      const rex = list.body.items.find((a: { name: string }) => a.name === 'Rex');
      const byCode = await publicDetail(orgA.slug, rex.publicCode).expect(200);
      expect(byCode.body).toMatchObject({ id: rex.id, name: 'Rex', publicCode: rex.publicCode });
      expect(Object.keys(byCode.body)).not.toContain('birthDate');
      expect(Object.keys(byCode.body)).not.toContain('description');
      const byId = await publicDetail(orgA.slug, rex.id).expect(200);
      expect(byId.body).toEqual(byCode.body);
      // Codes are case-insensitive in the URL.
      await publicDetail(orgA.slug, rex.publicCode.toUpperCase()).expect(200);
    });

    it('answers the same 404 for adopted, inactive and other-org animals (no existence leak)', async () => {
      await publicDetail(orgA.slug, adoptedId).expect(404);
      await publicDetail(orgA.slug, hiddenId).expect(404);
      await publicDetail(orgA.slug, soloBId).expect(404);
      await publicDetail(orgB.slug, soloBId).expect(200);
      await publicDetail(`nope-${randomUUID().slice(0, 8)}`, soloBId).expect(404);
      await publicDetail(orgA.slug, 'zzzzzzzz').expect(404);
    });

    it('rejects refs that are neither a public code nor a UUID (400)', async () => {
      await publicDetail(orgA.slug, 'luna').expect(400);
      await publicDetail(orgA.slug, "1' OR '1'='1").expect(400);
      await publicDetail('Bad_Slug', soloBId).expect(400);
    });

    it('with 100 animals in one org: the global catalog lists all 100 and every animal page loads', async () => {
      const big = await registerOrgWithSlug();
      for (let i = 0; i < 100; i += 1) {
        await createAnimal(big.token, {
          name: `Animal ${i}`,
          species: i % 3 === 0 ? 'cat' : 'dog',
          sex: 'female',
          size: 'small',
        }).expect(201);
      }

      // /adoptar reads GET /public/animals page by page: before, only the
      // first 50 of an org reached it.
      const fromBig: { publicCode: string; organization: { slug: string } }[] = [];
      for (let page = 1; page <= 20; page += 1) {
        const res = await request(server).get(`/public/animals?limit=50&page=${page}`).expect(200);
        fromBig.push(
          ...res.body.data.filter(
            (a: { organization: { slug: string } }) => a.organization.slug === big.slug,
          ),
        );
        if (res.body.data.length < 50) break;
      }
      expect(fromBig).toHaveLength(100);

      // Every one of the 100 resolves by its public code — including the
      // oldest ones, past the first 50 of the per-org catalog.
      const slowest = { ms: 0 };
      for (const animal of fromBig) {
        const started = Date.now();
        await publicDetail(big.slug, animal.publicCode).expect(200);
        slowest.ms = Math.max(slowest.ms, Date.now() - started);
      }
      // Generous bound (shared CI runners); locally it is a few ms.
      expect(slowest.ms).toBeLessThan(2000);
    });
  });
});
