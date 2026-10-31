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
 * Banco de recursos — ofrecimiento ABIERTO (cuando no hay una necesidad que
 * calce) y comunidad PÚBLICA compartible en redes. Cubre: crear/listar/retirar
 * lo propio, sin medicamentos, tope por persona, RBAC del tablero, que el
 * tablero no revele al donante, tomarlo (necesidad existente o nueva) y que
 * quede en "Mis ofertas" como oferta aceptada con su entrega, carrera de dos
 * organizaciones, y privacidad de las lecturas públicas de la comunidad
 * (primer nombre, sin id de autora, solo con permiso). Los casos "no-leak:"
 * también corren en `pnpm test:rls`.
 */
describe('Open offers (M09) + public shareable community (M11)', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  const admin = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  const orgIds: string[] = [];
  const password = 'password-1234';

  interface Actor {
    token: string;
    orgId: string;
    userId: string;
  }

  async function registerOrg(tag: string): Promise<Actor> {
    const res = await request(server)
      .post('/auth/register/organization')
      .send({
        ...LEGAL_ORG,
        organizationName: `Org ${tag}`,
        displayName: 'Owner',
        email: `res-${tag}-${randomUUID()}@test.local`,
        password,
      })
      .expect(201);
    await approveTestOrganization(admin, res.body.user.organizationId);
    orgIds.push(res.body.user.organizationId);
    return {
      token: res.body.tokens.accessToken,
      orgId: res.body.user.organizationId,
      userId: res.body.user.id,
    };
  }

  async function registerPerson(tag: string): Promise<Actor> {
    const res = await request(server)
      .post('/auth/register/person')
      .send({
        ...LEGAL_PERSON,
        displayName: 'Donante',
        email: `res-${tag}-${randomUUID()}@test.local`,
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

  async function actorWithRoles(tag: string, roles: string[]): Promise<Actor> {
    const actor = await registerOrg(tag);
    await admin.userRole.deleteMany({ where: { userId: actor.userId } });
    for (const role of roles) {
      await admin.userRole.create({
        data: { organizationId: actor.orgId, userId: actor.userId, role },
      });
    }
    return actor;
  }

  const openOffer = (token: string, body: Record<string, unknown> = {}) =>
    request(server)
      .post('/resources/open-offers')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Cobijas medianas',
        description: 'Lavadas, en buen estado',
        category: 'supplies',
        quantity: 4,
        unit: 'unidades',
        department: 'Antioquia',
        city: 'Medellín',
        ...body,
      });

  let org: Actor;
  let otherOrg: Actor;
  let donor: Actor;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    server = app.getHttpServer();
    org = await registerOrg('oo-org');
    otherOrg = await registerOrg('oo-other');
    donor = await registerPerson('oo-donor');
  });

  afterAll(async () => {
    await purgeOrganizations(admin, orgIds);
    await admin.$disconnect();
    await app?.close();
  });

  it('requires a session to leave an open offer', async () => {
    await request(server).post('/resources/open-offers').send({}).expect(401);
  });

  it('rejects medicine: only accepted when an organization asks for it in a need', async () => {
    await openOffer(donor.token, { category: 'medicine' }).expect(400);
  });

  let openId = '';

  it('a person leaves an open offer and sees it in their own list', async () => {
    const res = await openOffer(donor.token).expect(201);
    openId = res.body.id;
    expect(res.body).toMatchObject({
      status: 'open',
      expired: false,
      quantity: 4,
      city: 'Medellín',
    });
    const mine = await request(server)
      .get('/resources/open-offers/mine')
      .set('Authorization', `Bearer ${donor.token}`)
      .expect(200);
    expect(mine.body.map((o: { id: string }) => o.id)).toContain(openId);
  });

  it('no-leak: the row lives in the donor tenant and is invisible to another tenant under RLS', async () => {
    const mineFromOrg = await request(server)
      .get('/resources/open-offers/mine')
      .set('Authorization', `Bearer ${org.token}`)
      .expect(200);
    expect(mineFromOrg.body.map((o: { id: string }) => o.id)).not.toContain(openId);
    const row = await admin.resourceOpenOffer.findUnique({ where: { id: openId } });
    expect(row?.organizationId).toBe(donor.orgId);
  });

  it('RBAC: a person (no org role) cannot read the board; ReadOnlyAuditor cannot either', async () => {
    await request(server)
      .get('/resources/open-offers/board')
      .set('Authorization', `Bearer ${donor.token}`)
      .expect(403);
    const auditor = await actorWithRoles('oo-auditor', ['read_only_auditor']);
    await request(server)
      .get('/resources/open-offers/board')
      .set('Authorization', `Bearer ${auditor.token}`)
      .expect(403);
  });

  it('no-leak: the board shows the offer to an organization WITHOUT the donor identity', async () => {
    const res = await request(server)
      .get('/resources/open-offers/board?city=medellín')
      .set('Authorization', `Bearer ${org.token}`)
      .expect(200);
    const item = res.body.items.find((o: { id: string }) => o.id === openId);
    expect(item).toBeDefined();
    expect(item).not.toHaveProperty('donorUserId');
    expect(JSON.stringify(res.body)).not.toContain(donor.userId);
    expect(JSON.stringify(res.body)).not.toContain(donor.orgId);
  });

  it('cannot claim for a need of a different category or unit', async () => {
    const need = await request(server)
      .post('/resources/needs')
      .set('Authorization', `Bearer ${org.token}`)
      .send({ title: 'Alimento', category: 'food', quantityNeeded: 10, unit: 'kg' })
      .expect(201);
    await request(server)
      .post(`/resources/open-offers/${openId}/claim`)
      .set('Authorization', `Bearer ${org.token}`)
      .send({ needId: need.body.id })
      .expect(400);
  });

  it("cannot claim with ANOTHER organization's need (tenant set by the server)", async () => {
    const foreign = await request(server)
      .post('/resources/needs')
      .set('Authorization', `Bearer ${otherOrg.token}`)
      .send({ title: 'Cobijas', category: 'supplies', quantityNeeded: 10, unit: 'unidades' })
      .expect(201);
    await request(server)
      .post(`/resources/open-offers/${openId}/claim`)
      .set('Authorization', `Bearer ${org.token}`)
      .send({ needId: foreign.body.id })
      .expect(400);
  });

  it('claims it publishing a new need: accepted offer + scheduled delivery, shown in "Mis ofertas"', async () => {
    const res = await request(server)
      .post(`/resources/open-offers/${openId}/claim`)
      .set('Authorization', `Bearer ${org.token}`)
      .send({ needTitle: 'Cobijas para el invierno' })
      .expect(201);
    const { needId, offerId } = res.body;
    const need = await request(server).get(`/public/resources/needs/${needId}`).expect(200);
    expect(need.body).toMatchObject({
      title: 'Cobijas para el invierno',
      quantityNeeded: 4,
      unit: 'unidades',
    });

    const offers = await request(server)
      .get('/resources/offers/mine')
      .set('Authorization', `Bearer ${donor.token}`)
      .expect(200);
    const mineOffer = offers.body.find((o: { id: string }) => o.id === offerId);
    expect(mineOffer).toMatchObject({
      status: 'accepted',
      deliveryStatus: 'scheduled',
      organizationName: 'Org oo-org',
    });

    const mine = await request(server)
      .get('/resources/open-offers/mine')
      .set('Authorization', `Bearer ${donor.token}`)
      .expect(200);
    expect(mine.body.find((o: { id: string }) => o.id === openId)).toMatchObject({
      status: 'claimed',
      claimedByOrganizationName: 'Org oo-org',
    });
  });

  it('a second organization cannot take an offer already claimed, and it leaves the board', async () => {
    await request(server)
      .post(`/resources/open-offers/${openId}/claim`)
      .set('Authorization', `Bearer ${otherOrg.token}`)
      .send({})
      .expect(400);
    const board = await request(server)
      .get('/resources/open-offers/board')
      .set('Authorization', `Bearer ${otherOrg.token}`)
      .expect(200);
    expect(board.body.items.map((o: { id: string }) => o.id)).not.toContain(openId);
  });

  it('claims for an EXISTING need of the same category and unit', async () => {
    const second = await openOffer(donor.token, { title: 'Guacal grande', quantity: 1 }).expect(
      201,
    );
    const need = await request(server)
      .post('/resources/needs')
      .set('Authorization', `Bearer ${otherOrg.token}`)
      .send({ title: 'Guacales', category: 'supplies', quantityNeeded: 5, unit: 'Unidades ' })
      .expect(201);
    const res = await request(server)
      .post(`/resources/open-offers/${second.body.id}/claim`)
      .set('Authorization', `Bearer ${otherOrg.token}`)
      .send({ needId: need.body.id })
      .expect(201);
    expect(res.body.needId).toBe(need.body.id);
  });

  it('the donor withdraws an open offer; a withdrawn one cannot be claimed', async () => {
    const third = await openOffer(donor.token, { title: 'Platos', quantity: 3 }).expect(201);
    await request(server)
      .patch(`/resources/open-offers/${third.body.id}/withdraw`)
      .set('Authorization', `Bearer ${donor.token}`)
      .expect(200);
    await request(server)
      .post(`/resources/open-offers/${third.body.id}/claim`)
      .set('Authorization', `Bearer ${org.token}`)
      .send({})
      .expect(400);
  });

  it('no-leak: another user cannot withdraw my open offer', async () => {
    const mine = await openOffer(donor.token, { title: 'Correas' }).expect(201);
    const intruder = await registerPerson('oo-intruder');
    await request(server)
      .patch(`/resources/open-offers/${mine.body.id}/withdraw`)
      .set('Authorization', `Bearer ${intruder.token}`)
      .expect(404);
  });

  it('caps open offers per person at 5', async () => {
    const capped = await registerPerson('oo-cap');
    for (let i = 0; i < 5; i += 1) {
      await openOffer(capped.token, { title: `Cosa ${i}` }).expect(201);
    }
    await openOffer(capped.token, { title: 'Una más' }).expect(409);
  });

  // ------------------------------------------------------------------ comunidad
  const createPost = (token: string, body: Record<string, unknown> = {}) =>
    request(server)
      .post('/community/posts')
      .set('Authorization', `Bearer ${token}`)
      .send({
        type: 'general',
        body: 'Hoy cumple un año Toby desde que lo adopté. Gracias.',
        ...body,
      });

  it('no-leak: a post is NOT public unless its author marks it shareable', async () => {
    const post = await createPost(donor.token).expect(201);
    expect(post.body.post.shareable).toBe(false);
    await request(server).get(`/public/community/posts/${post.body.post.id}`).expect(404);
    await request(server).get(`/public/share/c/${post.body.post.id}`).expect(404);
    await request(server).get(`/public/community/posts/${post.body.post.id}/card.png`).expect(404);
  });

  it('no-leak: a shareable person post shows only the first name, never the author id', async () => {
    const person = await request(server)
      .post('/auth/register/person')
      .send({
        ...LEGAL_PERSON,
        displayName: 'Laura Marcela Gómez',
        email: `oo-laura-${randomUUID()}@test.local`,
        password,
      })
      .expect(201);
    orgIds.push(person.body.user.organizationId);
    const token = person.body.tokens.accessToken;
    const post = await createPost(token, { shareable: true, title: 'Un año con Toby' }).expect(201);
    const id = post.body.post.id;

    const pub = await request(server).get(`/public/community/posts/${id}`).expect(200);
    expect(pub.body).toMatchObject({ id, authorDisplayName: 'Laura', isOrganization: false });
    const json = JSON.stringify(pub.body);
    expect(json).not.toContain('Gómez');
    expect(json).not.toContain(person.body.user.id);
    expect(pub.body).not.toHaveProperty('authorUserId');

    const list = await request(server).get('/public/community/posts?limit=24').expect(200);
    expect(list.body.items.map((p: { id: string }) => p.id)).toContain(id);
    expect(JSON.stringify(list.body)).not.toContain(person.body.user.id);

    // Turning it off removes it from public reads right away.
    await request(server)
      .patch(`/community/posts/${id}/shareable`)
      .set('Authorization', `Bearer ${token}`)
      .send({ shareable: false })
      .expect(200);
    await request(server).get(`/public/community/posts/${id}`).expect(404);
  });

  it('only the author can change whether a post is shareable', async () => {
    const post = await createPost(donor.token, { shareable: true }).expect(201);
    await request(server)
      .patch(`/community/posts/${post.body.post.id}/shareable`)
      .set('Authorization', `Bearer ${org.token}`)
      .send({ shareable: false })
      .expect(404);
  });

  it('the share bridge serves Open Graph + Twitter tags and redirects with UTM; the card is a 1200×630 PNG', async () => {
    const post = await createPost(org.token, {
      shareable: true,
      type: 'event',
      title: 'Jornada de adopción <este sábado>',
    }).expect(201);
    const id = post.body.post.id;

    const html = await request(server).get(`/public/share/c/${id}?s=whatsapp`).expect(200);
    expect(html.headers['content-type']).toContain('text/html');
    expect(html.text).toContain(
      '<meta property="og:title" content="Jornada de adopción &lt;este sábado&gt; · Org oo-org">',
    );
    expect(html.text).toContain('name="twitter:card" content="summary_large_image"');
    expect(html.text).toMatch(
      /og:image" content="[^"]+\/public\/community\/posts\/[^"]+\/card\.png"/,
    );
    expect(html.text).toContain(
      `/comunidad/publicacion/${id}?utm_source=whatsapp&amp;utm_medium=social&amp;utm_campaign=comunidad_compartida`,
    );
    expect(html.text).not.toContain('<este');

    const unknownSource = await request(server)
      .get(`/public/share/c/${id}?s=evil"><script>`)
      .expect(200);
    expect(unknownSource.text).toContain('utm_source=share');

    const png = await request(server)
      .get(`/public/community/posts/${id}/card.png`)
      .buffer(true)
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect(png.headers['content-type']).toBe('image/png');
    const body = png.body as Buffer;
    expect(body.subarray(1, 4).toString()).toBe('PNG');
    expect(body.readUInt32BE(16)).toBe(1200);
    expect(body.readUInt32BE(20)).toBe(630);
  });
});
