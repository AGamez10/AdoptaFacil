import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import {
  currentLegalAcceptanceItems,
  getLegalDocument,
  requiredGuestLegalDocuments,
  requiredLegalDocuments,
} from '@adoptafacil/contracts';
import { AppModule } from '../src/app.module';
import { NOTIFICATION_PORT } from '../src/core/notifications/notification.port';
import { purgeOrganizations } from './support/cleanup';
import { LEGAL_ORG, LEGAL_PERSON } from './support/legal';

/**
 * Aceptación versionada de documentos legales de punta a punta (Ley 1581):
 * el registro exige y registra la aceptación, `/legal/me` dice qué falta, la
 * re-aceptación y la autorización comercial opcional quedan en el historial, y
 * el donante invitado deja su prueba en la organización beneficiaria.
 */
describe('Legal: aceptación versionada', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  const admin = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  const orgIds: string[] = [];
  const password = 'password1234';
  const send = jest.fn().mockResolvedValue(undefined);

  let personToken = '';
  let personId = '';
  let personOrgId = '';
  let beneficiaryOrgId = '';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(NOTIFICATION_PORT)
      .useValue({ send })
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
    server = app.getHttpServer();

    const person = await request(server)
      .post('/auth/register/person')
      .set('User-Agent', 'legal-spec/1.0')
      .send({
        ...LEGAL_PERSON,
        displayName: 'Titular',
        email: `legal-p-${randomUUID()}@test.local`,
        password,
      })
      .expect(201);
    personToken = person.body.tokens.accessToken;
    personId = person.body.user.id;
    personOrgId = person.body.user.organizationId;
    orgIds.push(personOrgId);

    const org = await request(server)
      .post('/auth/register/organization')
      .send({
        ...LEGAL_ORG,
        organizationName: 'Refugio Legal',
        displayName: 'Owner Legal',
        email: `legal-o-${randomUUID()}@test.local`,
        password,
      })
      .expect(201);
    beneficiaryOrgId = org.body.user.organizationId;
    orgIds.push(beneficiaryOrgId);
  });

  afterEach(() => send.mockClear());

  afterAll(async () => {
    await purgeOrganizations(admin, orgIds);
    await admin.$disconnect();
    await app.close();
  });

  it('no crea la cuenta si no se aceptan los documentos obligatorios', async () => {
    const email = `legal-none-${randomUUID()}@test.local`;
    const res = await request(server)
      .post('/auth/register/person')
      .send({ displayName: 'Sin aceptar', email, password })
      .expect(400);
    expect(res.body.code).toBe('LEGAL_ACCEPTANCE_REQUIRED');
    expect(await admin.authCredential.findUnique({ where: { email } })).toBeNull();
  });

  it('una organización debe aceptar además sus condiciones', async () => {
    const res = await request(server)
      .post('/auth/register/organization')
      .send({
        ...LEGAL_PERSON,
        organizationName: 'Sin condiciones',
        displayName: 'Owner',
        email: `legal-o2-${randomUUID()}@test.local`,
        password,
      })
      .expect(400);
    expect(res.body.missing).toEqual(['org_terms']);
  });

  it('registra la aceptación del registro con versión, hash, IP y navegador', async () => {
    const res = await request(server)
      .get('/legal/me')
      .set('Authorization', `Bearer ${personToken}`)
      .expect(200);
    expect(res.body.pending).toEqual([]);
    expect(res.body.commercialAuthorized).toBe(false);
    expect(res.body.history).toHaveLength(requiredLegalDocuments('person').length);

    const rows = await admin.legalAcceptance.findMany({ where: { subjectId: personId } });
    expect(rows).toHaveLength(requiredLegalDocuments('person').length);
    for (const r of rows) {
      expect(r.organizationId).toBe(personOrgId);
      expect(r.channel).toBe('registration');
      expect(r.documentSha256).toBe(getLegalDocument(r.documentKey as never).sha256);
      expect(r.userAgent).toBe('legal-spec/1.0');
      expect(r.ipAddress).toBeTruthy();
    }
    const audit = await admin.auditLog.findFirst({
      where: { organizationId: personOrgId, action: 'legal.accepted' },
    });
    // La auditoría no repite la IP ni el navegador.
    expect(JSON.stringify(audit?.metadata)).not.toContain('legal-spec');
  });

  it('la autorización comercial es opcional, avisa por correo y se puede retirar', async () => {
    const accepted = await request(server)
      .post('/legal/me/acceptances')
      .set('Authorization', `Bearer ${personToken}`)
      .send({ documents: currentLegalAcceptanceItems(['commercial_authorization']) })
      .expect(200);
    expect(accepted.body.commercialAuthorized).toBe(true);
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ subject: 'Registramos tu aceptación en AdoptaFácil' }),
    );

    const revoked = await request(server)
      .post('/legal/me/revocations')
      .set('Authorization', `Bearer ${personToken}`)
      .send({ key: 'commercial_authorization' })
      .expect(200);
    expect(revoked.body.commercialAuthorized).toBe(false);
    expect(revoked.body.history[0]).toMatchObject({
      key: 'commercial_authorization',
      action: 'revoked',
    });
  });

  it('la autorización de IA es opcional, aparte de la comercial, y se puede retirar', async () => {
    const accepted = await request(server)
      .post('/legal/me/acceptances')
      .set('Authorization', `Bearer ${personToken}`)
      .send({ documents: currentLegalAcceptanceItems(['ai_training_authorization']) })
      .expect(200);
    expect(accepted.body.aiTrainingAuthorized).toBe(true);
    expect(accepted.body.commercialAuthorized).toBe(false);
    expect(accepted.body.history[0]).toMatchObject({
      key: 'ai_training_authorization',
      channel: 'preferences',
    });

    const revoked = await request(server)
      .post('/legal/me/revocations')
      .set('Authorization', `Bearer ${personToken}`)
      .send({ key: 'ai_training_authorization' })
      .expect(200);
    expect(revoked.body.aiTrainingAuthorized).toBe(false);
  });

  it('la autorización obligatoria no se retira desde aquí (va por el canal de datos)', async () => {
    await request(server)
      .post('/legal/me/revocations')
      .set('Authorization', `Bearer ${personToken}`)
      .send({ key: 'data_authorization' })
      .expect(400);
  });

  it('rechaza aceptar una versión que no es la vigente', async () => {
    const res = await request(server)
      .post('/legal/me/acceptances')
      .set('Authorization', `Bearer ${personToken}`)
      .send({ documents: [{ key: 'terms', version: '2020-01-01' }] })
      .expect(400);
    expect(res.body.code).toBe('LEGAL_VERSION_OUTDATED');
  });

  it('una cuenta creada con Google queda pendiente hasta aceptar', async () => {
    const email = `legal-g-${randomUUID()}@test.local`;
    const google = await request(server)
      .post('/auth/google')
      .send({ idToken: `fake:${email}:Con Google` })
      .expect(200);
    orgIds.push(google.body.user.organizationId);
    const token = google.body.tokens.accessToken;

    const before = await request(server)
      .get('/legal/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect([...before.body.pending].sort()).toEqual([...requiredLegalDocuments('person')].sort());

    const after = await request(server)
      .post('/legal/me/acceptances')
      .set('Authorization', `Bearer ${token}`)
      .send({ documents: currentLegalAcceptanceItems(requiredLegalDocuments('person')) })
      .expect(200);
    expect(after.body.pending).toEqual([]);
    expect(after.body.history[0].channel).toBe('reacceptance');
  });

  it('el estado legal exige sesión', async () => {
    await request(server).get('/legal/me').expect(401);
  });

  it('el donante invitado debe aceptar antes de pagar, y su prueba queda en la organización', async () => {
    const base = {
      organizationId: beneficiaryOrgId,
      intendedAmount: 20_000,
      commissionPayer: 'organization',
      payer: { fullName: 'Invitada', email: `legal-guest-${randomUUID()}@test.local` },
    };
    const rejected = await request(server)
      .post('/donations')
      .send({ ...base, idempotencyKey: `legal-guest-${randomUUID()}` })
      .expect(400);
    expect(rejected.body.code).toBe('LEGAL_ACCEPTANCE_REQUIRED');

    const ok = await request(server)
      .post('/donations')
      .send({
        ...base,
        idempotencyKey: `legal-guest-${randomUUID()}`,
        legalAcceptances: currentLegalAcceptanceItems(requiredGuestLegalDocuments()),
      })
      .expect(201);

    const rows = await admin.legalAcceptance.findMany({ where: { subjectId: ok.body.id } });
    expect(rows).toHaveLength(requiredGuestLegalDocuments().length);
    expect(rows.every((r) => r.organizationId === beneficiaryOrgId)).toBe(true);
    expect(rows.every((r) => r.subjectType === 'donation' && r.userId === null)).toBe(true);
    expect(rows.every((r) => r.channel === 'guest_donation')).toBe(true);
  });

  it('lista pública de documentos vigentes con su hash', async () => {
    const res = await request(server).get('/public/legal/documents').expect(200);
    expect(res.body.find((d: { key: string }) => d.key === 'terms').sha256).toMatch(
      /^[0-9a-f]{64}$/,
    );
  });
});
