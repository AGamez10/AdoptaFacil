import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { STORAGE_PORT, type StoragePort } from '../src/core/storage/storage.port';
import { DOCUMENT_TEXT_PORT } from '../src/modules/org/document-verification/document-text.port';
import { nitCheckDigit } from '../src/modules/org/document-verification/nit';
import { purgeOrganizations } from './support/cleanup';
import { LEGAL_ORG, LEGAL_PERSON } from './support/legal';

const NIT = '901234567';
const DV = String(nitCheckDigit(NIT));

/** Texto de un RUT en régimen especial. La lectura real de PDF (pdf.js) no corre
 *  dentro de la VM de Jest, así que el puerto se simula con este texto; el
 *  adaptador tiene su propia prueba en un Node real. */
const RUT_TEXT = `Formulario del Registro Único Tributario
Número de Identificación Tributaria (NIT) ${NIT}-${DV}
Tipo de contribuyente Persona jurídica
35. Razón social FUNDACION PATITAS DE PRUEBA
04- Impto. renta y compl. régimen especial`;

/**
 * Verificación automática de documentos y funciones por estado formal.
 * Cubre RBAC deny-by-default, no-filtración entre organizaciones y que el
 * informe solo lee (no aprueba ni cambia el estado).
 */
describe('Document verification + capabilities (M01)', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  let storage: StoragePort;
  const admin = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  const createdOrgIds: string[] = [];
  const password = 'password-1234';
  let platformToken = '';

  async function registerOrg(): Promise<{ token: string; orgId: string }> {
    const res = await request(server)
      .post('/auth/register/organization')
      .send({
        ...LEGAL_ORG,
        organizationName: 'Patitas',
        displayName: 'Owner',
        email: `dv-${randomUUID()}@test.local`,
        password,
      })
      .expect(201);
    createdOrgIds.push(res.body.user.organizationId);
    return { token: res.body.tokens.accessToken, orgId: res.body.user.organizationId };
  }

  async function document(orgId: string, type: string, status = 'pending'): Promise<string> {
    const storageRef = `organizations/${orgId}/documents/${randomUUID()}.pdf`;
    await storage.saveObject(storageRef, Buffer.from('%PDF-1.4 rut'), 'application/pdf');
    const doc = await admin.organizationDocument.create({
      data: { organizationId: orgId, type, storageRef, version: 1, status },
    });
    return doc.id;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DOCUMENT_TEXT_PORT)
      .useValue({ extractText: async () => RUT_TEXT })
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
    server = app.getHttpServer();
    storage = app.get<StoragePort>(STORAGE_PORT);

    const platform = await request(server)
      .post('/auth/register/person')
      .send({
        ...LEGAL_PERSON,
        displayName: 'PA',
        email: `dv-pa-${randomUUID()}@test.local`,
        password,
      })
      .expect(201);
    createdOrgIds.push(platform.body.user.organizationId);
    await admin.userRole.create({
      data: {
        organizationId: platform.body.user.organizationId,
        userId: platform.body.user.id,
        role: 'platform_admin',
      },
    });
    platformToken = platform.body.tokens.accessToken;
  });

  afterAll(async () => {
    await purgeOrganizations(admin, createdOrgIds);
    await admin.$disconnect();
    await app?.close();
  });

  it('el informe de un RUT pendiente propone aprobar y subir a ESAL con RTE, sin decidir nada', async () => {
    const org = await registerOrg();
    await admin.organizationProfile.upsert({
      where: { organizationId: org.orgId },
      create: { organizationId: org.orgId, nit: `${NIT}-${DV}`, formalizationState: 'esal' },
      update: { nit: `${NIT}-${DV}`, formalizationState: 'esal' },
    });
    const docId = await document(org.orgId, 'rut');

    const res = await request(server)
      .get(`/platform/documents/${docId}/verification`)
      .set('Authorization', `Bearer ${platformToken}`)
      .expect(200);
    expect(res.body).toMatchObject({
      documentId: docId,
      organizationId: org.orgId,
      method: 'pdf_text',
      suggestion: 'approve',
      suggestedState: 'esal_rte',
      currentState: 'esal',
    });
    expect(res.body.checks.find((c: { id: string }) => c.id === 'nit_profile').result).toBe('pass');

    // Solo lee: el documento sigue pendiente y el estado no cambió.
    const doc = await admin.organizationDocument.findUnique({ where: { id: docId } });
    expect(doc?.status).toBe('pending');
    const profile = await admin.organizationProfile.findUnique({
      where: { organizationId: org.orgId },
    });
    expect(profile?.formalizationState).toBe('esal');
  });

  it('deny-by-default: una organización no puede pedir el informe de plataforma (403)', async () => {
    const org = await registerOrg();
    const docId = await document(org.orgId, 'rut');
    await request(server)
      .get(`/platform/documents/${docId}/verification`)
      .set('Authorization', `Bearer ${org.token}`)
      .expect(403);
    await request(server).get(`/platform/documents/${docId}/verification`).expect(401);
  });

  it('solo verifica documentos de la cola: uno ya decidido da 404; un id inválido, 400', async () => {
    const org = await registerOrg();
    const decided = await document(org.orgId, 'rut', 'approved');
    await request(server)
      .get(`/platform/documents/${decided}/verification`)
      .set('Authorization', `Bearer ${platformToken}`)
      .expect(404);
    await request(server)
      .get('/platform/documents/no-es-uuid/verification')
      .set('Authorization', `Bearer ${platformToken}`)
      .expect(400);
  });

  it('no-leak: la organización llena su perfil con su RUT, pero no puede leer el de otra (404)', async () => {
    const a = await registerOrg();
    const b = await registerOrg();
    const docA = await document(a.orgId, 'rut');

    const own = await request(server)
      .get(`/org/documents/${docA}/prefill`)
      .set('Authorization', `Bearer ${a.token}`)
      .expect(200);
    expect(own.body).toEqual({
      documentId: docA,
      readable: true,
      nit: `${NIT}-${DV}`,
      legalName: 'FUNDACION PATITAS DE PRUEBA',
    });

    await request(server)
      .get(`/org/documents/${docA}/prefill`)
      .set('Authorization', `Bearer ${b.token}`)
      .expect(404);

    // Prefill no escribe nada en el perfil.
    const profile = await admin.organizationProfile.findUnique({
      where: { organizationId: a.orgId },
    });
    expect(profile?.nit ?? null).toBeNull();
  });

  it('la cédula no sirve para llenar el perfil (404)', async () => {
    const org = await registerOrg();
    const id = await document(org.orgId, 'legal_representative_id');
    await request(server)
      .get(`/org/documents/${id}/prefill`)
      .set('Authorization', `Bearer ${org.token}`)
      .expect(404);
  });

  it('las funciones siguen el estado formal: el certificado tributario solo con RTE vigente', async () => {
    const org = await registerOrg();
    const get = () =>
      request(server)
        .get('/org/formalization/capabilities')
        .set('Authorization', `Bearer ${org.token}`)
        .expect(200);
    const enabled = (body: { capabilities: Array<{ capability: string; enabled: boolean }> }) =>
      body.capabilities.filter((c) => c.enabled).map((c) => c.capability);

    const informal = await get();
    expect(informal.body.state).toBe('informal');
    expect(enabled(informal.body)).toContain('receive_donations');
    expect(enabled(informal.body)).toContain('donation_receipt');
    expect(enabled(informal.body)).not.toContain('donation_tax_certificate');
    expect(informal.body.next.state).toBe('en_proceso');

    await admin.organizationProfile.upsert({
      where: { organizationId: org.orgId },
      create: { organizationId: org.orgId, formalizationState: 'esal_rte', rteVigente: false },
      update: { formalizationState: 'esal_rte', rteVigente: false },
    });
    expect(enabled((await get()).body)).not.toContain('donation_tax_certificate');

    await admin.organizationProfile.update({
      where: { organizationId: org.orgId },
      data: { rteVigente: true },
    });
    const rte = await get();
    expect(enabled(rte.body)).toContain('donation_tax_certificate');
    expect(rte.body.next).toBeUndefined();
  });
});
