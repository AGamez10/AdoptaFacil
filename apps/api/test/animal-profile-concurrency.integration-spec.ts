import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { purgeOrganizations } from './support/cleanup';
import { LEGAL_ORG } from './support/legal';

/**
 * Punto 2: muchas personas viendo el perfil de un animal MIENTRAS el equipo
 * registra eventos clínicos y edita la ficha. Complementa los escenarios k6
 * (`scripts/load/k6/perfil-animal.js` mide capacidad en un entorno real); esto
 * corre en cada revisión y comprueba lo que la carga no puede romper:
 *   - ninguna lectura falla ni se queda esperando a una escritura,
 *   - cada lectura devuelve el animal pedido (nunca el de otro),
 *   - no se pierde ni se duplica ninguna escritura.
 */
describe('Perfil del animal — lecturas simultáneas con operaciones internas', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  const admin = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  const orgIds: string[] = [];
  let token = '';
  const animals: { id: string; name: string }[] = [];

  const auth = () => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    server = app.getHttpServer();

    const org = await request(server)
      .post('/auth/register/organization')
      .send({
        ...LEGAL_ORG,
        organizationName: 'Refugio Concurrencia',
        displayName: 'Dra. Ana',
        email: `concurrencia-${randomUUID()}@test.local`,
        password: 'password-1234',
      })
      .expect(201);
    token = org.body.tokens.accessToken;
    orgIds.push(org.body.user.organizationId);

    for (const name of ['Chorizo', 'Luna', 'Rocco']) {
      const res = await request(server)
        .post('/animals')
        .set(auth())
        .send({ approximateAgeMonths: 12, name, species: 'dog', sex: 'male', size: 'medium' })
        .expect(201);
      animals.push({ id: res.body.id, name });
    }
  });

  afterAll(async () => {
    await purgeOrganizations(admin, orgIds);
    await admin.$disconnect();
    await app?.close();
  });

  it('atiende todas las lecturas, con el animal correcto, mientras se escribe a la vez', async () => {
    const WRITES_PER_ANIMAL = 4;
    const READ_ROUNDS = 10;

    const writes = animals.flatMap((animal) => [
      ...Array.from({ length: WRITES_PER_ANIMAL }, (_, i) =>
        request(server)
          .post(`/animals/${animal.id}/clinical-events`)
          .set(auth())
          .send({
            type: 'treatment',
            occurredAt: `2026-0${i + 1}-10T12:00:00.000Z`,
            details: { motivo: `control ${i + 1}` },
          }),
      ),
      request(server)
        .patch(`/animals/${animal.id}`)
        .set(auth())
        .send({ description: `Ficha actualizada de ${animal.name}` }),
    ]);

    const reads = Array.from({ length: READ_ROUNDS }, () =>
      animals.flatMap((animal) => [
        request(server)
          .get(`/animals/${animal.id}`)
          .set(auth())
          .then((res) => ({ res, expectName: animal.name })),
        request(server)
          .get(`/animals/${animal.id}/clinical-events`)
          .set(auth())
          .then((res) => ({ res, expectAnimalId: animal.id })),
        request(server)
          .get(`/animals/${animal.id}/clinical-events/carnet`)
          .set(auth())
          .then((res) => ({ res, expectAnimalId: animal.id })),
        request(server)
          .get('/animals?includeInactive=true')
          .set(auth())
          .then((res) => ({ res })),
      ]),
    ).flat();

    const started = Date.now();
    const [writeResults, readResults] = await Promise.all([
      Promise.all(writes),
      Promise.all(reads),
    ]);
    const elapsedMs = Date.now() - started;

    // Ninguna escritura se pierde.
    expect(writeResults.map((r) => r.status).filter((s) => s >= 300)).toEqual([]);

    // Ninguna lectura falla, y cada una trae SU animal.
    expect(readResults.map(({ res }) => res.status).filter((s) => s !== 200)).toEqual([]);
    for (const read of readResults as Array<{
      res: request.Response;
      expectName?: string;
      expectAnimalId?: string;
    }>) {
      if (read.expectName) expect(read.res.body.name).toBe(read.expectName);
      if (read.expectAnimalId) {
        for (const event of read.res.body as Array<{ animalId: string }>) {
          expect(event.animalId).toBe(read.expectAnimalId);
        }
      }
    }

    // Estado final exacto: ni eventos perdidos ni duplicados.
    for (const animal of animals) {
      const events = await request(server)
        .get(`/animals/${animal.id}/clinical-events`)
        .set(auth())
        .expect(200);
      expect(events.body).toHaveLength(WRITES_PER_ANIMAL);
      const detail = await request(server).get(`/animals/${animal.id}`).set(auth()).expect(200);
      expect(detail.body.description).toBe(`Ficha actualizada de ${animal.name}`);
    }

    // 135 peticiones mezcladas: holgado a propósito (CI compartido); solo
    // detecta un bloqueo real entre lecturas y escrituras.
    expect(elapsedMs).toBeLessThan(30_000);
  });
});
