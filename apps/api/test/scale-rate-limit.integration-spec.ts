import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { purgeOrganizations } from './support/cleanup';
import { LEGAL_ORG } from './support/legal';

/**
 * Plan de escala (B6): a single client cannot flood the public reads, and a
 * single organization cannot flood writes; everyone else keeps their budget.
 */
describe('Scale rate limits (plan de escala, B6)', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  const admin = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  const createdOrgIds: string[] = [];
  const saved = {
    pub: process.env.PUBLIC_RATE_LIMIT_PER_MIN,
    org: process.env.ORG_WRITE_RATE_LIMIT_PER_MIN,
  };

  beforeAll(async () => {
    process.env.PUBLIC_RATE_LIMIT_PER_MIN = '3';
    process.env.ORG_WRITE_RATE_LIMIT_PER_MIN = '2';
    // Imported after setting the env: ConfigModule validates it on first import.
    const { AppModule } = await import('../src/app.module');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    server = app.getHttpServer();
  });

  afterAll(async () => {
    process.env.PUBLIC_RATE_LIMIT_PER_MIN = saved.pub;
    process.env.ORG_WRITE_RATE_LIMIT_PER_MIN = saved.org;
    await purgeOrganizations(admin, createdOrgIds);
    await admin.$disconnect();
    await app?.close();
  });

  it('answers 429 with Retry-After once a client spends its public read budget', async () => {
    for (let i = 0; i < 3; i += 1) {
      await request(server).get('/public/campaigns').expect(200);
    }
    const blocked = await request(server).get('/public/campaigns').expect(429);
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
    // Non-public routes do not draw from that budget.
    await request(server).get('/health').expect(200);
  });

  it('caps writes per organization without touching another organization', async () => {
    const register = async () => {
      const res = await request(server)
        .post('/auth/register/organization')
        .send({
          ...LEGAL_ORG,
          organizationName: `Escala ${randomUUID().slice(0, 6)}`,
          displayName: 'Owner',
          email: `t-escala-${randomUUID()}@test.local`,
          password: 'password-1234',
        })
        .expect(201);
      createdOrgIds.push(res.body.user.organizationId);
      return res.body.tokens.accessToken as string;
    };
    const tokenA = await register();
    const tokenB = await register();
    const write = (token: string) =>
      request(server)
        .put('/org/profile')
        .set('Authorization', `Bearer ${token}`)
        .send({ description: 'perfil' });

    await write(tokenA).expect(200);
    await write(tokenA).expect(200);
    await write(tokenA).expect(429);
    await write(tokenB).expect(200);
  });
});
