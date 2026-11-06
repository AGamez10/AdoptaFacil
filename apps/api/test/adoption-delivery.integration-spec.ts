import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import {
  NOTIFICATION_PORT,
  type NotificationMessage,
} from '../src/core/notifications/notification.port';
import { purgeOrganizations } from './support/cleanup';
import { completeTestProfile } from './support/profile';
import { LEGAL_PERSON, LEGAL_ORG } from './support/legal';

const SIGNATURE_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
const PHOTO_PNG = Buffer.from(SIGNATURE_PNG, 'base64');

/**
 * Ajuste 6 — acta de ENTREGA con confirmación de las dos partes. Desde un
 * contrato firmado la organización registra la entrega (foto obligatoria) y
 * recibe un código; el adoptante lo confirma y, en una sola operación, el acta
 * queda sellada, el animal pasa a adoptado y se programan los hitos del plan.
 */
describe('Adoption delivery (ajuste 6: acta de entrega)', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  const admin = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  const sentEmails: NotificationMessage[] = [];
  const orgIds: string[] = [];
  const password = 'password-1234';

  let refugeToken = '';
  let refugeOrgId = '';
  let personToken = '';
  let personUserId = '';
  let otherToken = '';
  let otherOrgId = '';
  let animalId = '';
  let requestId = '';
  let contractId = '';
  let deliveryId = '';
  let photoRef = '';

  async function uploadPhoto(token: string): Promise<string> {
    const target = await request(server)
      .post('/adoptions/deliveries/photo-target')
      .set('Authorization', `Bearer ${token}`)
      .send({ filename: 'entrega.png' })
      .expect(201);
    const storageRef: string = target.body.storageRef;
    await request(server)
      .put('/storage/upload')
      .query({ key: storageRef })
      .set('Authorization', `Bearer ${token}`)
      .attach('file', PHOTO_PNG, { filename: 'entrega.png', contentType: 'image/png' })
      .expect(200);
    return storageRef;
  }

  function startBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      contractId,
      healthStatus: 'Sano, vacunas al día y desparasitado.',
      weightKg: 12.5,
      identityVerified: true,
      identificationChecked: true,
      items: ['vaccine_card', 'food', 'food'],
      photoRef,
      ...overrides,
    };
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(NOTIFICATION_PORT)
      .useValue({
        send: async (message: NotificationMessage) => {
          sentEmails.push(message);
        },
      })
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
    server = app.getHttpServer();

    const refuge = await request(server)
      .post('/auth/register/organization')
      .send({
        ...LEGAL_ORG,
        organizationName: 'Refugio Entregas',
        displayName: 'Owner Entregas',
        email: `delivery-refuge-${randomUUID()}@test.local`,
        password,
      })
      .expect(201);
    refugeToken = refuge.body.tokens.accessToken;
    refugeOrgId = refuge.body.user.organizationId;
    orgIds.push(refugeOrgId);

    const person = await request(server)
      .post('/auth/register/person')
      .send({
        ...LEGAL_PERSON,
        displayName: 'Persona Adoptante',
        email: `delivery-p-${randomUUID()}@test.local`,
        password,
      })
      .expect(201);
    personToken = person.body.tokens.accessToken;
    personUserId = person.body.user.id;
    orgIds.push(person.body.user.organizationId);
    await completeTestProfile(admin, personUserId);

    const other = await request(server)
      .post('/auth/register/organization')
      .send({
        ...LEGAL_ORG,
        organizationName: 'Otro Refugio Entregas',
        displayName: 'Owner Otro',
        email: `delivery-other-${randomUUID()}@test.local`,
        password,
      })
      .expect(201);
    otherToken = other.body.tokens.accessToken;
    otherOrgId = other.body.user.organizationId;
    orgIds.push(otherOrgId);

    const animal = await request(server)
      .post('/animals')
      .set('Authorization', `Bearer ${refugeToken}`)
      .send({
        approximateAgeMonths: 12,
        name: 'Luna',
        species: 'dog',
        sex: 'female',
        size: 'medium',
      })
      .expect(201);
    animalId = animal.body.id;

    await request(server)
      .post(`/animals/${animalId}/clinical-events`)
      .set('Authorization', `Bearer ${refugeToken}`)
      .send({
        type: 'vaccine',
        occurredAt: '2026-09-01T15:00:00.000Z',
        nextDueDate: '2027-09-01T15:00:00.000Z',
        details: { costo: 45000, nota: 'interna' },
      })
      .expect(201);

    await request(server)
      .post('/org/legal-representative')
      .set('Authorization', `Bearer ${refugeToken}`)
      .send({
        role: 'legal_representative',
        fullName: 'Representante Refugio',
        documentType: 'cedula_ciudadania',
        documentNumber: '987654321',
        position: 'Representante legal',
        signatureBase64: Buffer.from('fake-rep-signature').toString('base64'),
        signatureContentType: 'image/png',
      })
      .expect(201);

    const req = await request(server)
      .post('/adoptions')
      .set('Authorization', `Bearer ${personToken}`)
      .send({
        animalId,
        organizationId: refugeOrgId,
        animalSnapshot: { animalId, name: 'Luna', species: 'dog' },
        applicant: { fullName: 'Persona Adoptante', email: 'adoptante@test.local' },
        message: 'Tengo hogar y experiencia; deseo adoptar de forma responsable a este animal.',
      })
      .expect(201);
    requestId = req.body.id;
    for (const targetStatus of ['in_review', 'approved']) {
      await request(server)
        .post(`/adoptions/${requestId}/transitions`)
        .set('Authorization', `Bearer ${refugeToken}`)
        .send({ targetStatus })
        .expect(201);
    }

    const contract = await request(server)
      .post('/adoptions/contracts')
      .set('Authorization', `Bearer ${refugeToken}`)
      .send({ requestId })
      .expect(201);
    contractId = contract.body.id;
    const orgSignerId = contract.body.signers.find(
      (s: { role: string }) => s.role === 'organization_representative',
    ).id;
    const adopterSignerId = contract.body.signers.find(
      (s: { role: string }) => s.role === 'adopter',
    ).id;

    photoRef = await uploadPhoto(refugeToken);

    // Antes de firmar no se puede entregar.
    await request(server)
      .post('/adoptions/deliveries')
      .set('Authorization', `Bearer ${refugeToken}`)
      .send(startBody())
      .expect(409);

    await request(server)
      .post(`/adoptions/contracts/${contractId}/signatures`)
      .set('Authorization', `Bearer ${refugeToken}`)
      .send({ signerId: orgSignerId })
      .expect(201);
    await request(server)
      .post(`/adoptions/contracts/${contractId}/transitions`)
      .set('Authorization', `Bearer ${refugeToken}`)
      .send({ targetStatus: 'pending_signatures' })
      .expect(201);
    await request(server)
      .post(`/adoptions/contracts/${contractId}/signatures`)
      .set('Authorization', `Bearer ${personToken}`)
      .send({
        signerId: adopterSignerId,
        signatureBase64: SIGNATURE_PNG,
        signatureContentType: 'image/png',
      })
      .expect(201);
  });

  afterAll(async () => {
    await purgeOrganizations(admin, orgIds);
    await admin.$disconnect();
    await app.close();
  });

  it('rejects an incomplete delivery and a photo that is not the org own private file', async () => {
    await request(server)
      .post('/adoptions/deliveries')
      .set('Authorization', `Bearer ${refugeToken}`)
      .send(startBody({ identityVerified: false }))
      .expect(400);
    await request(server)
      .post('/adoptions/deliveries')
      .set('Authorization', `Bearer ${refugeToken}`)
      .send(startBody({ photoRef: `private/${otherOrgId}/${randomUUID()}-x.png` }))
      .expect(400);
    await request(server)
      .post('/adoptions/deliveries')
      .set('Authorization', `Bearer ${refugeToken}`)
      .send(startBody({ photoRef: `private/${refugeOrgId}/${randomUUID()}-nunca-subida.png` }))
      .expect(400);
  });

  it('keeps delivery management deny-by-default and tenant-scoped', async () => {
    await request(server)
      .post('/adoptions/deliveries')
      .set('Authorization', `Bearer ${personToken}`)
      .send(startBody())
      .expect(403);
    await request(server)
      .post('/adoptions/deliveries')
      .set('Authorization', `Bearer ${otherToken}`)
      .send(startBody({ photoRef: await uploadPhoto(otherToken) }))
      .expect(404);
  });

  it('lets the org start the delivery: returns the code once, emails it, seals a care-only record', async () => {
    const res = await request(server)
      .post('/adoptions/deliveries')
      .set('Authorization', `Bearer ${refugeToken}`)
      .send(startBody())
      .expect(201);
    deliveryId = res.body.delivery.id;
    expect(res.body.code).toMatch(/^\d{6}$/);
    expect(res.body.confirmUrl).toContain(`/mis-adopciones/entrega/${deliveryId}?codigo=`);
    const delivery = res.body.delivery;
    expect(delivery.status).toBe('pending_confirmation');
    expect(delivery.details.items).toEqual(['vaccine_card', 'food']);
    expect(delivery.contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(delivery.record.animal.name).toBe('Luna');
    expect(delivery.record.organizationName).toBe('Refugio Entregas');
    expect(delivery.record.clinical).toEqual([
      {
        type: 'vaccine',
        occurredAt: '2026-09-01T15:00:00.000Z',
        nextDueDate: '2027-09-01T15:00:00.000Z',
      },
    ]);
    // Nunca notas internas ni costos.
    expect(JSON.stringify(delivery.record)).not.toContain('45000');
    expect(JSON.stringify(delivery.record)).not.toContain('interna');
    // Plan ligero por defecto: 1, 4 y 12 meses.
    expect(delivery.milestonePlan.map((m: { offset: string }) => m.offset)).toEqual([
      '1 month',
      '4 months',
      '12 months',
    ]);

    const email = sentEmails.find((m) => m.template?.event === 'adoption.delivery_code');
    expect(email?.template?.data.codigo).toBe(res.body.code);

    const forContract = await request(server)
      .get(`/adoptions/deliveries/by-contract/${contractId}`)
      .set('Authorization', `Bearer ${refugeToken}`)
      .expect(200);
    expect(forContract.body.id).toBe(deliveryId);
    const fromOther = await request(server)
      .get(`/adoptions/deliveries/by-contract/${contractId}`)
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(200);
    expect(fromOther.body).toEqual({});
  });

  it('cancels a pending delivery, and a new start replaces it', async () => {
    await request(server)
      .post(`/adoptions/deliveries/${deliveryId}/cancel`)
      .set('Authorization', `Bearer ${refugeToken}`)
      .expect(201);
    const mine = await request(server)
      .get('/adoptions/deliveries/mine')
      .set('Authorization', `Bearer ${personToken}`)
      .expect(200);
    expect(mine.body.some((d: { id: string }) => d.id === deliveryId)).toBe(false);

    const res = await request(server)
      .post('/adoptions/deliveries')
      .set('Authorization', `Bearer ${refugeToken}`)
      .send(startBody())
      .expect(201);
    deliveryId = res.body.delivery.id;
  });

  it('shows the pending delivery only to its adopter', async () => {
    const mine = await request(server)
      .get(`/adoptions/deliveries/mine/${deliveryId}`)
      .set('Authorization', `Bearer ${personToken}`)
      .expect(200);
    expect(mine.body.status).toBe('pending_confirmation');
    expect(mine.body).not.toHaveProperty('codeHash');
    await request(server)
      .get(`/adoptions/deliveries/mine/${deliveryId}`)
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(404);
    await request(server)
      .post(`/adoptions/deliveries/${deliveryId}/confirm`)
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ code: '123456' })
      .expect(404);
  });

  it('rejects a wrong, expired or locked code; a regenerated code works', async () => {
    const regenerated = await request(server)
      .post(`/adoptions/deliveries/${deliveryId}/code`)
      .set('Authorization', `Bearer ${refugeToken}`)
      .expect(201);
    const code: string = regenerated.body.code;
    const wrong = code === '000000' ? '111111' : '000000';

    const bad = await request(server)
      .post(`/adoptions/deliveries/${deliveryId}/confirm`)
      .set('Authorization', `Bearer ${personToken}`)
      .send({ code: wrong })
      .expect(400);
    expect(bad.body.code).toBe('DELIVERY_CODE_INVALID');
    const row = await admin.adoptionDelivery.findUniqueOrThrow({ where: { id: deliveryId } });
    expect(row.codeAttempts).toBe(1);
    expect(row.codeHash).not.toContain(code);

    await admin.adoptionDelivery.update({
      where: { id: deliveryId },
      data: { codeExpiresAt: new Date(Date.now() - 1000) },
    });
    const expired = await request(server)
      .post(`/adoptions/deliveries/${deliveryId}/confirm`)
      .set('Authorization', `Bearer ${personToken}`)
      .send({ code })
      .expect(410);
    expect(expired.body.code).toBe('DELIVERY_CODE_EXPIRED');

    await admin.adoptionDelivery.update({
      where: { id: deliveryId },
      data: { codeExpiresAt: new Date(Date.now() + 600_000), codeAttempts: 5 },
    });
    const locked = await request(server)
      .post(`/adoptions/deliveries/${deliveryId}/confirm`)
      .set('Authorization', `Bearer ${personToken}`)
      .send({ code })
      .expect(429);
    expect(locked.body.code).toBe('DELIVERY_CODE_LOCKED');
  });

  it('confirms in one operation: seals the act, marks the animal adopted, schedules the plan', async () => {
    const fresh = await request(server)
      .post(`/adoptions/deliveries/${deliveryId}/code`)
      .set('Authorization', `Bearer ${refugeToken}`)
      .expect(201);

    const confirmed = await request(server)
      .post(`/adoptions/deliveries/${deliveryId}/confirm`)
      .set('Authorization', `Bearer ${personToken}`)
      .send({ code: fresh.body.code })
      .expect(201);
    expect(confirmed.body.status).toBe('confirmed');
    expect(confirmed.body.confirmedAt).toBeTruthy();
    expect(confirmed.body.codeExpiresAt).toBeNull();

    const animal = await request(server)
      .get(`/animals/${animalId}`)
      .set('Authorization', `Bearer ${refugeToken}`)
      .expect(200);
    expect(animal.body.status).toBe('adopted');

    const milestones = await request(server)
      .get(`/adoptions/followups/by-contract/${contractId}`)
      .set('Authorization', `Bearer ${refugeToken}`)
      .expect(200);
    expect(milestones.body).toHaveLength(3);
    const dueDays = milestones.body
      .map((m: { dueAt: string }) => (Date.parse(m.dueAt) - Date.now()) / 86_400_000)
      .sort((a: number, b: number) => a - b);
    expect(dueDays[0]).toBeGreaterThan(27);
    expect(dueDays[0]).toBeLessThan(32);
    expect(dueDays[2]).toBeGreaterThan(360);

    const mine = await request(server)
      .get('/adoptions/followups/mine')
      .set('Authorization', `Bearer ${personToken}`)
      .expect(200);
    expect(
      mine.body.filter((m: { contractId: string }) => m.contractId === contractId),
    ).toHaveLength(3);

    const audits = await admin.auditLog.findMany({
      where: { organizationId: refugeOrgId, entityType: 'adoption_delivery' },
    });
    const actions = audits.map((a) => a.action);
    expect(actions).toEqual(
      expect.arrayContaining([
        'adoption.delivery.started',
        'adoption.delivery.cancelled',
        'adoption.delivery.code_regenerated',
        'adoption.delivery.confirmed',
      ]),
    );
    expect(JSON.stringify(audits.map((a) => a.metadata))).not.toContain(fresh.body.code);
  });

  it('keeps a confirmed delivery immutable and refuses a second delivery or confirmation', async () => {
    await request(server)
      .post(`/adoptions/deliveries/${deliveryId}/confirm`)
      .set('Authorization', `Bearer ${personToken}`)
      .send({ code: '123456' })
      .expect(409);
    await request(server)
      .post('/adoptions/deliveries')
      .set('Authorization', `Bearer ${refugeToken}`)
      .send(startBody())
      .expect(409);
    await request(server)
      .post(`/adoptions/deliveries/${deliveryId}/code`)
      .set('Authorization', `Bearer ${refugeToken}`)
      .expect(409);
    await expect(
      admin.adoptionDelivery.update({
        where: { id: deliveryId },
        data: { details: { tampered: true } },
      }),
    ).rejects.toThrow(/immutable/);

    const mine = await request(server)
      .get('/adoptions/deliveries/mine')
      .set('Authorization', `Bearer ${personToken}`)
      .expect(200);
    const record = mine.body.find((d: { id: string }) => d.id === deliveryId);
    expect(record.status).toBe('confirmed');
    expect(record.record.animal.name).toBe('Luna');
  });
});
