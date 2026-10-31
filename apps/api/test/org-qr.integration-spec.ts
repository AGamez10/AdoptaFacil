import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { purgeOrganizations } from './support/cleanup';
import { LEGAL_ORG, LEGAL_PERSON } from './support/legal';
import { approveTestOrganization } from './support/organization-status';

/**
 * QR fijo por organización: el código no cambia nunca, la org elige a dónde
 * lleva (donar, una campaña activa propia o apadrinar un animal propio con
 * plan), y el escaneo público solo devuelve slug + destino validado.
 */
describe('QR fijo por organización', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  const admin = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  const orgIds: string[] = [];
  const password = 'password-1234';

  let tokenA = '';
  let tokenB = '';
  let personToken = '';
  let slugA = '';
  let campaignA = '';
  let campaignB = '';
  let animalWithPlan = '';
  let animalWithoutPlan = '';

  async function registerOrg(tag: string): Promise<{ token: string; orgId: string }> {
    const res = await request(server)
      .post('/auth/register/organization')
      .send({
        ...LEGAL_ORG,
        organizationName: `Refugio QR ${tag}`,
        displayName: `Owner ${tag}`,
        email: `qr-${tag}-${randomUUID()}@test.local`,
        password,
      })
      .expect(201);
    await approveTestOrganization(admin, res.body.user.organizationId);
    orgIds.push(res.body.user.organizationId);
    return { token: res.body.tokens.accessToken, orgId: res.body.user.organizationId };
  }

  async function createCampaign(token: string): Promise<string> {
    const res = await request(server)
      .post('/campaigns')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Cirugía de Luna',
        category: 'surgeries',
        goalAmount: 500_000,
        deadline: '2027-12-31T00:00:00.000Z',
      })
      .expect(201);
    return res.body.id;
  }

  async function createAnimal(token: string, name: string): Promise<string> {
    const res = await request(server)
      .post('/animals')
      .set('Authorization', `Bearer ${token}`)
      .send({ name, species: 'dog', sex: 'female', size: 'medium', approximateAgeMonths: 12 })
      .expect(201);
    return res.body.id;
  }

  const getQr = (token: string) =>
    request(server).get('/org/qr').set('Authorization', `Bearer ${token}`);
  const setTarget = (token: string, body: object) =>
    request(server).put('/org/qr/target').set('Authorization', `Bearer ${token}`).send(body);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    server = app.getHttpServer();

    const a = await registerOrg('a');
    tokenA = a.token;
    const b = await registerOrg('b');
    tokenB = b.token;

    slugA = `qr-a-${randomUUID().slice(0, 8)}`;
    await request(server)
      .put('/org/profile')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ slug: slugA })
      .expect(200);

    const person = await request(server)
      .post('/auth/register/person')
      .send({
        ...LEGAL_PERSON,
        displayName: 'Persona QR',
        email: `qr-p-${randomUUID()}@test.local`,
        password,
      })
      .expect(201);
    personToken = person.body.tokens.accessToken;
    orgIds.push(person.body.user.organizationId);

    campaignA = await createCampaign(tokenA);
    campaignB = await createCampaign(tokenB);
    animalWithPlan = await createAnimal(tokenA, 'Luna');
    animalWithoutPlan = await createAnimal(tokenA, 'Sol');
    await request(server)
      .post('/sponsorship-plans')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ animalId: animalWithPlan, name: 'Padrino', amount: 30_000, periodicity: 'monthly' })
      .expect(201);
  });

  afterAll(async () => {
    await purgeOrganizations(admin, orgIds);
    await admin.$disconnect();
    await app?.close();
  });

  it('creates ONE fixed code per organization, pointing to donate by default', async () => {
    const first = await getQr(tokenA).expect(200);
    expect(first.body.code).toMatch(/^[a-hjkmnp-z2-9]{8}$/);
    expect(first.body.target).toEqual({ kind: 'donate', id: null });
    expect(first.body.campaigns.map((c: { id: string }) => c.id)).toEqual([campaignA]);
    expect(first.body.animals.map((c: { id: string }) => c.id)).toEqual([animalWithPlan]);

    const again = await getQr(tokenA).expect(200);
    expect(again.body.code).toBe(first.body.code);
    const other = await getQr(tokenB).expect(200);
    expect(other.body.code).not.toBe(first.body.code);
  });

  it('changing the destination never changes the code', async () => {
    const before = await getQr(tokenA).expect(200);
    const res = await setTarget(tokenA, { kind: 'campaign', id: campaignA }).expect(200);
    expect(res.body.code).toBe(before.body.code);
    expect(res.body.effectiveTarget).toEqual({ kind: 'campaign', id: campaignA });

    const scan = await request(server).get(`/public/qr/${before.body.code}`).expect(200);
    expect(scan.body).toEqual({ slug: slugA, target: { kind: 'campaign', id: campaignA } });

    const audit = await admin.auditLog.findFirst({
      where: { action: 'org.qr_target_updated', entityType: 'organization_qr_link' },
      orderBy: { createdAt: 'desc' },
    });
    expect(audit?.metadata).toMatchObject({ kind: 'campaign', targetId: campaignA });
  });

  it('can point to the organization profile (no id)', async () => {
    const { body } = await setTarget(tokenA, { kind: 'profile' }).expect(200);
    expect(body.effectiveTarget).toEqual({ kind: 'profile', id: null });
    const scan = await request(server).get(`/public/qr/${body.code}`).expect(200);
    expect(scan.body).toEqual({ slug: slugA, target: { kind: 'profile', id: null } });
    await setTarget(tokenA, { kind: 'profile', id: campaignA }).expect(400);
  });

  it('rejects a campaign of ANOTHER organization', async () => {
    await setTarget(tokenA, { kind: 'campaign', id: campaignB }).expect(400);
  });

  it('only accepts an animal with an active sponsorship plan', async () => {
    await setTarget(tokenA, { kind: 'animal', id: animalWithoutPlan }).expect(400);
    const res = await setTarget(tokenA, { kind: 'animal', id: animalWithPlan }).expect(200);
    expect(res.body.target).toEqual({ kind: 'animal', id: animalWithPlan });
  });

  it('only accepts a closed list of kinds, never a URL', async () => {
    await setTarget(tokenA, { kind: 'url', id: 'https://evil.example' }).expect(400);
    await setTarget(tokenA, { kind: 'campaign', id: 'https://evil.example' }).expect(400);
    await setTarget(tokenA, { kind: 'donate', id: campaignA }).expect(400);
    await setTarget(tokenA, { kind: 'donate', url: 'https://evil.example' }).expect(400);
  });

  it('falls back to donate (same org) when the chosen campaign stops being active', async () => {
    const { body } = await setTarget(tokenA, { kind: 'campaign', id: campaignA }).expect(200);
    await admin.campaign.update({ where: { id: campaignA }, data: { status: 'cancelled' } });

    const scan = await request(server).get(`/public/qr/${body.code}`).expect(200);
    expect(scan.body).toEqual({ slug: slugA, target: { kind: 'donate', id: null } });
    const own = await getQr(tokenA).expect(200);
    expect(own.body.target).toEqual({ kind: 'campaign', id: campaignA });
    expect(own.body.effectiveTarget).toEqual({ kind: 'donate', id: null });
  });

  it('counts scans (totals only) and 404s unknown or malformed codes', async () => {
    const before = (await getQr(tokenA).expect(200)).body;
    await request(server).get(`/public/qr/${before.code}`).expect(200);
    const after = (await getQr(tokenA).expect(200)).body;
    expect(after.scansLast30Days).toBe(before.scansLast30Days + 1);

    await request(server).get('/public/qr/zzzzzzzz').expect(404);
    await request(server).get('/public/qr/..%2F..%2Fadmin').expect(404);
  });

  it('an org without a public slug resolves to 404 (nothing to show)', async () => {
    const { body } = await getQr(tokenB).expect(200);
    await request(server).get(`/public/qr/${body.code}`).expect(404);
  });

  it('a person account (no org role) cannot read or change a QR', async () => {
    await getQr(personToken).expect(403);
    await setTarget(personToken, { kind: 'donate' }).expect(403);
  });

  it('the code is immutable even for a superuser', async () => {
    const { body } = await getQr(tokenA).expect(200);
    await expect(
      admin.organizationQrLink.update({ where: { code: body.code }, data: { code: 'abcdefgh' } }),
    ).rejects.toThrow(/immutable/);
  });
});
