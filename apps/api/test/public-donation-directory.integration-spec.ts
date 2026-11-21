import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import type { PublicDonationOrganization } from '@adoptafacil/contracts';
import { AppModule } from '../src/app.module';
import { purgeOrganizations } from './support/cleanup';
import { LEGAL_ORG } from './support/legal';
import { approveTestOrganization } from './support/organization-status';

/**
 * `GET /public/donations/directory` ("Quiero donar", sin sesión): todas las
 * organizaciones aprobadas con portal público, primero las que pueden recibir
 * donaciones y, entre ellas, las más formalizadas. Solo señales públicas.
 */
describe('Public donation directory ("Quiero donar")', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  const admin = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  const createdOrgIds: string[] = [];
  const tag = randomUUID().slice(0, 6);
  const ids: Record<string, string> = {};

  async function registerOrg(key: string, slug: string | null, state: string): Promise<void> {
    const res = await request(server)
      .post('/auth/register/organization')
      .send({
        ...LEGAL_ORG,
        organizationName: `Dir ${key} ${tag}`,
        displayName: 'Owner',
        email: `t-dir-${randomUUID()}@test.local`,
        password: 'password-1234',
      })
      .expect(201);
    const orgId = res.body.user.organizationId as string;
    createdOrgIds.push(orgId);
    ids[key] = orgId;
    await approveTestOrganization(admin, orgId);
    if (slug) {
      await request(server)
        .put('/org/profile')
        .set('Authorization', `Bearer ${res.body.tokens.accessToken}`)
        .send({ slug })
        .expect(200);
    }
    // El estado lo reconoce la plataforma (flujo propio con documentos); aquí
    // se fija directo para probar solo el orden del directorio.
    const formalization = {
      formalizationState: state,
      rteVigente: state === 'esal_rte',
      rteValidUntil: state === 'esal_rte' ? new Date(Date.now() + 86_400_000) : null,
    };
    await admin.organizationProfile.upsert({
      where: { organizationId: orgId },
      update: formalization,
      create: { organizationId: orgId, ...formalization },
    });
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    server = app.getHttpServer();
    await registerOrg('informal', `dir-inf-${tag}`, 'informal');
    await registerOrg('formalizada', `dir-for-${tag}`, 'formalizada');
    await registerOrg('rte', `dir-rte-${tag}`, 'esal_rte');
    await registerOrg('noslug', null, 'esal_rte');
  });

  afterAll(async () => {
    await purgeOrganizations(admin, createdOrgIds);
    await admin.$disconnect();
    await app?.close();
  });

  it('ordena por formalización, excluye a quien no tiene portal y deja al final a quien no cobra', async () => {
    const res = await request(server).get('/public/donations/directory').expect(200);
    const items = res.body.items as PublicDonationOrganization[];
    const mine = items.filter((org) => Object.values(ids).includes(org.id));
    expect(mine.map((org) => org.id)).toEqual([ids.rte, ids.formalizada, ids.informal]);

    const [rte, formalizada, informal] = mine;
    expect(rte).toMatchObject({ donorBenefit: 'tax_certificate', rteVigente: true });
    expect(formalizada).toMatchObject({ donorBenefit: 'receipt', verified: true });
    expect(informal).toMatchObject({ canReceiveDonations: false, verified: false });

    // Quien no puede cobrar nunca queda antes de quien sí.
    const firstBlocked = items.findIndex((org) => !org.canReceiveDonations);
    if (firstBlocked >= 0) {
      expect(items.slice(firstBlocked).every((org) => !org.canReceiveDonations)).toBe(true);
    }
  });

  it('expone solo señales públicas (nada de cuentas, documentos ni revisores)', async () => {
    const res = await request(server).get('/public/donations/directory').expect(200);
    const body = JSON.stringify(res.body);
    for (const key of [
      'mpUserId',
      'accessToken',
      'storageRef',
      'reviewNote',
      'nit',
      'validDocumentTypes',
    ]) {
      expect(body).not.toContain(`"${key}"`);
    }
  });
});
