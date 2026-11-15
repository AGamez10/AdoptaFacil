import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { purgeOrganizations } from './support/cleanup';
import { completeTestProfile } from './support/profile';
import { approveTestOrganization } from './support/organization-status';
import { LEGAL_PERSON, LEGAL_ORG } from './support/legal';

/**
 * M04 adoptions (T-028a) end-to-end: an authenticated PERSON applies to adopt a
 * refuge's real animal (consumed via M03's `/animals`), the refuge evaluates on
 * the kanban with AUDITED transitions, and every invariant holds — role gating,
 * conflict of interest (§12), one active request per animal (RF10), and no leak
 * of requests across organizations.
 */
describe('Adoptions (M04: request + evaluation)', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  const admin = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  const orgIds: string[] = [];
  const password = 'password-1234';
  const longMessage =
    'Tengo patio, tiempo y experiencia con perros rescatados; quiero darle un hogar.';

  let refugeToken = '';
  let refugeOrgId = '';
  let personToken = '';
  let otherToken = '';
  let animalId = '';
  let animalSpecies = 'dog';
  let requestId = '';

  const snapshot = () => ({ animalId, name: 'Firulais', species: animalSpecies });
  const applicant = () => ({ fullName: 'Adoptante Demo', email: 'adoptante@test.local' });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    server = app.getHttpServer();

    const refugeReg = await request(server)
      .post('/auth/register/organization')
      .send({
        ...LEGAL_ORG,
        organizationName: 'Refugio Patitas',
        displayName: 'Owner Refugio',
        email: `t028-refuge-${randomUUID()}@test.local`,
        password,
      })
      .expect(201);
    refugeToken = refugeReg.body.tokens.accessToken;
    refugeOrgId = refugeReg.body.user.organizationId;
    await approveTestOrganization(admin, refugeOrgId);
    orgIds.push(refugeOrgId);

    const personReg = await request(server)
      .post('/auth/register/person')
      .send({
        ...LEGAL_PERSON,
        displayName: 'Persona Adoptante',
        email: `t028-p-${randomUUID()}@test.local`,
        password,
      })
      .expect(201);
    personToken = personReg.body.tokens.accessToken;
    orgIds.push(personReg.body.user.organizationId);
    await completeTestProfile(admin, personReg.body.user.id);

    const otherReg = await request(server)
      .post('/auth/register/organization')
      .send({
        ...LEGAL_ORG,
        organizationName: 'Otro Refugio',
        displayName: 'Owner Otro',
        email: `t028-other-${randomUUID()}@test.local`,
        password,
      })
      .expect(201);
    otherToken = otherReg.body.tokens.accessToken;
    orgIds.push(otherReg.body.user.organizationId);

    // Real M03 animal in the refuge (consumed via the real endpoint, not mocked).
    const animalRes = await request(server)
      .post('/animals')
      .set('Authorization', `Bearer ${refugeToken}`)
      .send({
        approximateAgeMonths: 12,
        name: 'Firulais',
        species: 'dog',
        sex: 'male',
        size: 'medium',
      })
      .expect(201);
    animalId = animalRes.body.id;
    animalSpecies = animalRes.body.species;
  });

  afterAll(async () => {
    await purgeOrganizations(admin, orgIds);
    await admin.$disconnect();
    await app.close();
  });

  it('lets an authenticated person create a request on a real animal (201, status new)', async () => {
    const res = await request(server)
      .post('/adoptions')
      .set('Authorization', `Bearer ${personToken}`)
      .send({
        animalId,
        organizationId: refugeOrgId,
        animalSnapshot: snapshot(),
        applicant: applicant(),
        message: longMessage,
      })
      .expect(201);
    expect(res.body.status).toBe('new');
    expect(res.body.organizationId).toBe(refugeOrgId);
    requestId = res.body.id;
  });

  it('rejects a too-short message (RF10, 400)', async () => {
    await request(server)
      .post('/adoptions')
      .set('Authorization', `Bearer ${personToken}`)
      .send({
        animalId,
        organizationId: refugeOrgId,
        animalSnapshot: snapshot(),
        applicant: applicant(),
        message: 'muy corto',
      })
      .expect(400);
  });

  it('enforces one ACTIVE request per animal/user (RF10, 409)', async () => {
    await request(server)
      .post('/adoptions')
      .set('Authorization', `Bearer ${personToken}`)
      .send({
        animalId,
        organizationId: refugeOrgId,
        animalSnapshot: snapshot(),
        applicant: applicant(),
        message: longMessage,
      })
      .expect(409);
  });

  it('blocks applying to an animal of your OWN organization (conflict of interest, 403)', async () => {
    await request(server)
      .post('/adoptions')
      .set('Authorization', `Bearer ${refugeToken}`)
      .send({
        animalId,
        organizationId: refugeOrgId,
        animalSnapshot: snapshot(),
        applicant: { fullName: 'Owner', email: 'owner@test.local' },
        message: longMessage,
      })
      .expect(403);
  });

  it('shows the request on the owning refuge kanban, but never to another org (no-leak)', async () => {
    const mine = await request(server)
      .get('/adoptions')
      .set('Authorization', `Bearer ${refugeToken}`)
      .expect(200);
    expect(mine.body.some((r: { id: string }) => r.id === requestId)).toBe(true);

    const other = await request(server)
      .get('/adoptions')
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(200);
    expect(other.body.some((r: { id: string }) => r.id === requestId)).toBe(false);
  });

  it('denies listing/evaluation to a person without an eval role (deny-by-default, 403)', async () => {
    await request(server)
      .get('/adoptions')
      .set('Authorization', `Bearer ${personToken}`)
      .expect(403);
    await request(server)
      .post(`/adoptions/${requestId}/transitions`)
      .set('Authorization', `Bearer ${personToken}`)
      .send({ targetStatus: 'in_review' })
      .expect(403);
  });

  it('moves the request through evaluation and AUDITS each transition (UTC)', async () => {
    await request(server)
      .post(`/adoptions/${requestId}/transitions`)
      .set('Authorization', `Bearer ${refugeToken}`)
      .send({ targetStatus: 'in_review' })
      .expect(201);
    const approved = await request(server)
      .post(`/adoptions/${requestId}/transitions`)
      .set('Authorization', `Bearer ${refugeToken}`)
      .send({ targetStatus: 'approved', reason: 'Perfil idóneo' })
      .expect(201);
    expect(approved.body.status).toBe('approved');

    // Invalid transition out of a terminal state → 409.
    await request(server)
      .post(`/adoptions/${requestId}/transitions`)
      .set('Authorization', `Bearer ${refugeToken}`)
      .send({ targetStatus: 'rejected' })
      .expect(409);

    // Audit trail: at least the two transitions were recorded (append-only).
    const audits = await admin.auditLog.findMany({
      where: { entityId: requestId, action: 'adoption.request.transitioned' },
    });
    expect(audits.length).toBeGreaterThanOrEqual(2);
  });

  describe('P0-3: el animal es real, de la organización y se aprueba una sola vez', () => {
    async function newPerson(tag: string): Promise<string> {
      const reg = await request(server)
        .post('/auth/register/person')
        .send({
          ...LEGAL_PERSON,
          displayName: tag,
          email: `p03-${tag}-${randomUUID()}@test.local`,
          password,
        })
        .expect(201);
      orgIds.push(reg.body.user.organizationId);
      await completeTestProfile(admin, reg.body.user.id);
      return reg.body.tokens.accessToken;
    }
    async function newAnimal(token: string, name: string): Promise<string> {
      const res = await request(server)
        .post('/animals')
        .set('Authorization', `Bearer ${token}`)
        .send({ approximateAgeMonths: 24, name, species: 'cat', sex: 'female', size: 'small' })
        .expect(201);
      return res.body.id;
    }
    const apply = (token: string, organizationId: string, id: string, name = 'Inventado') =>
      request(server)
        .post('/adoptions')
        .set('Authorization', `Bearer ${token}`)
        .send({
          animalId: id,
          organizationId,
          animalSnapshot: { animalId: id, name, species: 'dog' },
          applicant: applicant(),
          message: longMessage,
        });
    const move = (id: string, targetStatus: string) =>
      request(server)
        .post(`/adoptions/${id}/transitions`)
        .set('Authorization', `Bearer ${refugeToken}`)
        .send({ targetStatus });

    it('un animal que no existe → 404', async () => {
      const token = await newPerson('noexiste');
      await apply(token, refugeOrgId, randomUUID()).expect(404);
    });

    it('un animal de OTRA organización, atribuido a esta → 404', async () => {
      const token = await newPerson('ajeno');
      const foreign = await newAnimal(otherToken, 'Ajeno');
      await apply(token, refugeOrgId, foreign).expect(404);
    });

    it('el nombre y la especie salen de la base, nunca del cliente', async () => {
      const token = await newPerson('snapshot');
      const id = await newAnimal(refugeToken, 'Mishi Real');
      const res = await apply(token, refugeOrgId, id, 'Nombre Falso').expect(201);
      expect(res.body.animalSnapshot).toMatchObject({
        animalId: id,
        name: 'Mishi Real',
        species: 'cat',
      });
    });

    it('aprobar una solicitud reserva el animal: otra aprobación → 409 y nuevas solicitudes → 409', async () => {
      const id = await newAnimal(refugeToken, 'Una Sola Vez');
      const first = await apply(await newPerson('primera'), refugeOrgId, id).expect(201);
      const second = await apply(await newPerson('segunda'), refugeOrgId, id).expect(201);
      await move(first.body.id, 'in_review').expect(201);
      await move(second.body.id, 'in_review').expect(201);
      await move(first.body.id, 'approved').expect(201);

      const animal = await admin.animal.findUniqueOrThrow({ where: { id } });
      expect(animal.status).toBe('in_process');

      const blocked = await move(second.body.id, 'approved').expect(409);
      expect(blocked.body.message).toMatch(/ya tiene una adopción aprobada/i);
      await apply(await newPerson('tercera'), refugeOrgId, id).expect(409);
    });
  });
});
