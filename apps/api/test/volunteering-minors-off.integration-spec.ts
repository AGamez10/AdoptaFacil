// Debe ir antes de AppModule (ver el archivo).
import { previousVolunteeringMinors } from './support/volunteering-minors-off';
import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { purgeOrganizations } from './support/cleanup';
import { completeTestProfile } from './support/profile';
import { LEGAL_PERSON, LEGAL_ORG } from './support/legal';
import { approveTestOrganization } from './support/organization-status';

/**
 * P0-1 (§3.5, F23): con FEATURE_VOLUNTEERING_MINORS apagado — como en
 * producción, donde no se puede encender — el servidor no acepta la
 * inscripción de un menor ni recoge datos de su acudiente, y no escribe nada.
 */
describe('Voluntariado con menores deshabilitados (P0-1)', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  const admin = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  const orgIds: string[] = [];
  const password = 'password-1234';
  const previousMinors = previousVolunteeringMinors;

  let orgToken = '';
  let volunteerToken = '';
  let volunteerId = '';
  let opportunityId = '';

  const day = (offset: number): string => {
    const d = new Date();
    d.setUTCHours(0, 0, 0, 0);
    d.setUTCDate(d.getUTCDate() + offset);
    return d.toISOString();
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    server = app.getHttpServer();

    const org = await request(server)
      .post('/auth/register/organization')
      .send({
        ...LEGAL_ORG,
        organizationName: 'Refugio Sin Menores',
        displayName: 'Owner',
        email: `p01-${randomUUID()}@test.local`,
        password,
      })
      .expect(201);
    orgIds.push(org.body.user.organizationId);
    await approveTestOrganization(admin, org.body.user.organizationId);
    orgToken = org.body.tokens.accessToken;

    const person = await request(server)
      .post('/auth/register/person')
      .send({
        ...LEGAL_PERSON,
        displayName: 'Voluntaria',
        email: `p01-p-${randomUUID()}@test.local`,
        password,
      })
      .expect(201);
    orgIds.push(person.body.user.organizationId);
    volunteerId = person.body.user.id;
    await completeTestProfile(admin, volunteerId);
    volunteerToken = person.body.tokens.accessToken;

    const opportunity = await request(server)
      .post('/volunteer-opportunities')
      .set('Authorization', `Bearer ${orgToken}`)
      .send({
        title: 'Servicio social en bodega',
        category: 'sterilizations',
        startDate: day(1),
        endDate: day(400),
        location: 'Refugio',
        appliesToStudentService: true,
      })
      .expect(201);
    opportunityId = opportunity.body.id;
  });

  afterAll(async () => {
    if (previousMinors === undefined) delete process.env.FEATURE_VOLUNTEERING_MINORS;
    else process.env.FEATURE_VOLUNTEERING_MINORS = previousMinors;
    await purgeOrganizations(admin, orgIds);
    await admin.$disconnect();
    await app?.close();
  });

  const enroll = (extra: Record<string, unknown>) =>
    request(server)
      .post('/volunteer-enrollments')
      .set('Authorization', `Bearer ${volunteerToken}`)
      .send({ opportunityId, ...extra });

  it.each([{ isMinor: true }, { guardianName: 'Acudiente' }, { guardianDocument: '123456' }])(
    'rechaza %o con 403 y no guarda la inscripción',
    async (extra) => {
      const res = await enroll(extra).expect(403);
      expect(res.body.message).toMatch(/mayores de edad/);
      const rows = await admin.volunteerEnrollment.count({
        where: { volunteerUserId: volunteerId },
      });
      expect(rows).toBe(0);
    },
  );

  it('una persona mayor de edad sí se inscribe', async () => {
    await enroll({ isMinor: false, schoolName: 'Universidad Nacional' }).expect(201);
  });
});
