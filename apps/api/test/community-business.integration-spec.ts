import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { purgeOrganizations } from './support/cleanup';
import { LEGAL_ORG, LEGAL_PERSON } from './support/legal';

/**
 * Comunidad · Negocios aliados. Verifica el ciclo completo:
 *   activar el panel (con y sin autorización comercial) → beneficio que nace
 *   en revisión → aprobado y público → quien adoptó (y solo quien adoptó)
 *   obtiene su pase → el negocio lo canjea una sola vez sin ver quién adoptó
 *   → el impacto y el camino al sello lo reflejan.
 * Y las barreras: otro negocio no canjea códigos ajenos, nadie usa beneficios
 * de su propio negocio, la app no lee la tabla de pases, el estado de
 * moderación no se escribe desde el cliente y el pre-registro sin cuenta ya
 * no existe.
 */
describe('Community business allies (panel, benefits, passes, impact)', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  const admin = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  const appDb = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL_APP } } });
  const orgIds: string[] = [];
  const password = 'password-1234';
  const city = `Ciudad ${randomUUID().slice(0, 8)}`;

  interface Actor {
    token: string;
    orgId: string;
    userId: string;
  }

  async function registerPerson(tag: string, displayName = 'Camila Rojas'): Promise<Actor> {
    const res = await request(server)
      .post('/auth/register/person')
      .send({
        ...LEGAL_PERSON,
        displayName,
        email: `biz-${tag}-${randomUUID()}@test.local`,
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

  async function orgActorWithRoles(tag: string, roles: string[]): Promise<Actor> {
    const res = await request(server)
      .post('/auth/register/organization')
      .send({
        ...LEGAL_ORG,
        organizationName: `Org ${tag} ${randomUUID().slice(0, 6)}`,
        displayName: 'Owner',
        email: `biz-${tag}-${randomUUID()}@test.local`,
        password,
      })
      .expect(201);
    const actor = {
      token: res.body.tokens.accessToken,
      orgId: res.body.user.organizationId,
      userId: res.body.user.id,
    };
    orgIds.push(actor.orgId);
    await admin.userRole.deleteMany({ where: { userId: actor.userId } });
    for (const role of roles) {
      await admin.userRole.create({
        data: { organizationId: actor.orgId, userId: actor.userId, role },
      });
    }
    return actor;
  }

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  /** Una adopción CONFIRMADA de `adopter` en el refugio `shelterOrgId`. */
  async function seedConfirmedAdoption(
    shelterOrgId: string,
    adopter: Actor,
    animalName: string,
  ): Promise<void> {
    const requestId = randomUUID();
    const contractId = randomUUID();
    const animalId = randomUUID();
    await admin.$executeRaw`
      INSERT INTO adoption_requests (id, organization_id, animal_id, animal_snapshot,
        applicant_user_id, applicant, message, status, updated_at)
      VALUES (${requestId}::uuid, ${shelterOrgId}::uuid, ${animalId}::uuid, '{}'::jsonb,
        ${adopter.userId}::uuid, '{}'::jsonb, 'Quiero adoptar', 'approved', now())`;
    await admin.$executeRaw`
      INSERT INTO adoption_contracts (id, organization_id, request_id, animal_id, status,
        signers, payload, updated_at)
      VALUES (${contractId}::uuid, ${shelterOrgId}::uuid, ${requestId}::uuid, ${animalId}::uuid,
        'draft', '[]'::jsonb, '{}'::jsonb, now())`;
    await admin.$executeRaw`
      INSERT INTO adoption_deliveries (id, organization_id, contract_id, request_id, animal_id,
        adopter_user_id, adopter_name, adopter_email, animal_name, status, details, record,
        milestone_plan, content_hash, created_by_user_id, updated_at, confirmed_at)
      VALUES (${randomUUID()}::uuid, ${shelterOrgId}::uuid, ${contractId}::uuid,
        ${requestId}::uuid, ${animalId}::uuid, ${adopter.userId}::uuid, 'Laura Méndez',
        'laura@test.local', ${animalName}, 'confirmed', '{}'::jsonb, '{}'::jsonb, '[]'::jsonb,
        'hash', ${adopter.userId}::uuid, now(), now())`;
  }

  /** Un aporte de `donor` al refugio, entregado (lo confirma el refugio). */
  async function seedDeliveredContribution(shelterOrgId: string, donor: Actor): Promise<void> {
    const needId = randomUUID();
    const offerId = randomUUID();
    await admin.$executeRaw`
      INSERT INTO resource_needs (id, organization_id, title, category, quantity_needed, unit,
        status, updated_at)
      VALUES (${needId}::uuid, ${shelterOrgId}::uuid, 'Concentrado', 'food', 10, 'kg',
        'needed', now())`;
    await admin.$executeRaw`
      INSERT INTO resource_offers (id, organization_id, need_id, donor_user_id, quantity_offered,
        status, updated_at)
      VALUES (${offerId}::uuid, ${shelterOrgId}::uuid, ${needId}::uuid, ${donor.userId}::uuid, 5,
        'accepted', now())`;
    await admin.$executeRaw`
      INSERT INTO resource_deliveries (id, organization_id, offer_id, need_id, status, updated_at,
        completed_at)
      VALUES (${randomUUID()}::uuid, ${shelterOrgId}::uuid, ${offerId}::uuid, ${needId}::uuid,
        'completed', now(), now())`;
  }

  let business: Actor;
  let otherBusiness: Actor;
  let adopter: Actor;
  let neighbor: Actor;
  let shelter: Actor;
  let platformAdmin: Actor;
  let listingId = '';
  let benefitId = '';
  let passCode = '';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    server = app.getHttpServer();

    business = await registerPerson('business');
    otherBusiness = await registerPerson('other');
    adopter = await registerPerson('adopter', 'Laura Méndez');
    neighbor = await registerPerson('neighbor');
    shelter = await orgActorWithRoles('shelter', ['owner']);
    platformAdmin = await orgActorWithRoles('mod', ['platform_admin']);
    await seedConfirmedAdoption(shelter.orgId, adopter, 'Luna');
  });

  afterAll(async () => {
    await purgeOrganizations(admin, orgIds);
    await admin.$disconnect();
    await appDb.$disconnect();
    await app?.close();
  });

  it('no token → 401 on the private endpoints', async () => {
    await request(server).get('/community/business/me').expect(401);
    await request(server).post('/community/business/redeem').send({ code: 'ABCDEFGH' }).expect(401);
    await request(server).get('/community/benefits/mine').expect(401);
  });

  it('the old account-less pre-registration endpoint is gone', async () => {
    await request(server)
      .post('/public/community/pre-registrations')
      .send({ kind: 'commerce' })
      .expect(404);
  });

  it('an account without a business panel gets account: null (no 403)', async () => {
    const res = await request(server)
      .get('/community/business/me')
      .set(auth(neighbor.token))
      .expect(200);
    expect(res.body.account).toBeNull();
    expect(res.body.ally).toMatchObject({ eligible: false, isAlly: false });
  });

  it('activates the business panel without commercial consent, then gives and withdraws it', async () => {
    const res = await request(server)
      .post('/community/business/activate')
      .set(auth(business.token))
      .send({ commercialConsent: false })
      .expect(201);
    expect(res.body).toMatchObject({ commercialConsent: false });
    expect(res.body.commercialConsentAt).toBeUndefined();

    const given = await request(server)
      .patch('/community/business/consent')
      .set(auth(business.token))
      .send({ commercialConsent: true })
      .expect(200);
    expect(given.body.commercialConsent).toBe(true);
    expect(given.body.commercialConsentAt).toEqual(expect.any(String));
    const row = await admin.businessAccount.findUnique({
      where: { organizationId: business.orgId },
    });
    expect(row?.commercialConsentVersion).toBe('2026-11-23');

    const withdrawn = await request(server)
      .patch('/community/business/consent')
      .set(auth(business.token))
      .send({ commercialConsent: false })
      .expect(200);
    expect(withdrawn.body.commercialConsent).toBe(false);

    // Activar dos veces no duplica ni cambia nada.
    await request(server)
      .post('/community/business/activate')
      .set(auth(business.token))
      .send({ commercialConsent: true })
      .expect(201);
    expect(await admin.businessAccount.count({ where: { organizationId: business.orgId } })).toBe(
      1,
    );
  });

  it('a benefit needs an active panel and an own listing', async () => {
    await request(server)
      .post('/community/business/activate')
      .set(auth(otherBusiness.token))
      .send({ commercialConsent: false })
      .expect(201);
    const listing = await request(server)
      .post('/community/services')
      .set(auth(business.token))
      .send({ category: 'veterinary', name: 'Clínica Huellitas', department: 'Antioquia', city })
      .expect(201);
    listingId = listing.body.id;

    // Otro negocio no cuelga beneficios del perfil ajeno (bajo RLS no existe).
    await request(server)
      .post('/community/business/benefits')
      .set(auth(otherBusiness.token))
      .send({ listingId, title: 'Consulta gratis' })
      .expect(404);
    // Sin panel activo, nada.
    await request(server)
      .post('/community/business/benefits')
      .set(auth(neighbor.token))
      .send({ listingId, title: 'Consulta gratis' })
      .expect(403);
    // Nunca se acepta el estado desde el cliente.
    await request(server)
      .post('/community/business/benefits')
      .set(auth(business.token))
      .send({ listingId, title: 'Consulta gratis', status: 'approved' })
      .expect(400);
  });

  it('a benefit is born pending and is not public until listing and benefit are approved', async () => {
    const res = await request(server)
      .post('/community/business/benefits')
      .set(auth(business.token))
      .send({
        listingId,
        title: 'Primera consulta gratis',
        description: 'Para perros y gatos adoptados en AdoptaFácil.',
        terms: 'Una vez por animal. Lunes a viernes.',
      })
      .expect(201);
    benefitId = res.body.id;
    expect(res.body).toMatchObject({ status: 'pending', active: true });

    const before = await request(server)
      .get(`/public/community/benefits?city=${encodeURIComponent(city)}`)
      .expect(200);
    expect(before.body.items).toHaveLength(0);

    await request(server)
      .patch(`/platform/community/services/${listingId}/moderate`)
      .set(auth(platformAdmin.token))
      .send({ decision: 'approve' })
      .expect(200);
    const queue = await request(server)
      .get('/platform/community/benefits?status=pending')
      .set(auth(platformAdmin.token))
      .expect(200);
    expect(queue.body.items.map((b: { id: string }) => b.id)).toContain(benefitId);
    // Rechazar u ocultar exige motivo.
    await request(server)
      .patch(`/platform/community/benefits/${benefitId}/moderate`)
      .set(auth(platformAdmin.token))
      .send({ decision: 'reject' })
      .expect(400);
    // Un negocio no modera.
    await request(server)
      .patch(`/platform/community/benefits/${benefitId}/moderate`)
      .set(auth(business.token))
      .send({ decision: 'approve' })
      .expect(403);
    await request(server)
      .patch(`/platform/community/benefits/${benefitId}/moderate`)
      .set(auth(platformAdmin.token))
      .send({ decision: 'approve' })
      .expect(200);

    const page = await request(server)
      .get(`/public/community/benefits?city=${encodeURIComponent(city)}`)
      .expect(200);
    expect(page.body.items).toHaveLength(1);
    expect(page.body.items[0]).toMatchObject({
      id: benefitId,
      title: 'Primera consulta gratis',
      listingName: 'Clínica Huellitas',
      listingIsPartner: false,
    });
    const card = await request(server).get(`/public/community/services/${listingId}`).expect(200);
    expect(card.body.adopterBenefitTitle).toBe('Primera consulta gratis');
    const benefits = await request(server)
      .get(`/public/community/services/${listingId}/benefits`)
      .expect(200);
    expect(benefits.body).toHaveLength(1);
  });

  it('only someone with a confirmed adoption gets a pass; never for their own benefit', async () => {
    await request(server)
      .post(`/community/benefits/${benefitId}/pass`)
      .set(auth(neighbor.token))
      .expect(403);
    await request(server)
      .post(`/community/benefits/${benefitId}/pass`)
      .set(auth(business.token))
      .expect(403);

    const status = await request(server)
      .get('/community/benefits/mine')
      .set(auth(adopter.token))
      .expect(200);
    expect(status.body).toMatchObject({ eligible: true, adoptedAnimals: ['Luna'], passes: [] });

    const res = await request(server)
      .post(`/community/benefits/${benefitId}/pass`)
      .set(auth(adopter.token))
      .expect(201);
    passCode = res.body.code;
    expect(passCode).toMatch(/^[2-9A-HJ-NP-Z]{8}$/);
    expect(res.body).toMatchObject({ status: 'issued', listingName: 'Clínica Huellitas' });

    // Pedirlo otra vez devuelve el mismo código.
    const again = await request(server)
      .post(`/community/benefits/${benefitId}/pass`)
      .set(auth(adopter.token))
      .expect(201);
    expect(again.body.code).toBe(passCode);
  });

  it('the app role cannot read the passes table directly', async () => {
    await expect(
      appDb.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.current_org_id', ${business.orgId}, true)`;
        return tx.$queryRaw`SELECT code FROM community_benefit_passes`;
      }),
    ).rejects.toThrow(/permission denied/i);
  });

  it('another business cannot redeem the code', async () => {
    await request(server)
      .post('/community/business/redeem')
      .set(auth(otherBusiness.token))
      .send({ code: passCode })
      .expect(404);
  });

  it('the business redeems the code once and never sees who adopted', async () => {
    const formatted = `${passCode.slice(0, 4).toLowerCase()}-${passCode.slice(4)}`;
    const res = await request(server)
      .post('/community/business/redeem')
      .set(auth(business.token))
      .send({ code: formatted })
      .expect(200);
    expect(res.body).toMatchObject({
      result: 'redeemed',
      benefitTitle: 'Primera consulta gratis',
      animalName: 'Luna',
    });
    expect(res.body.adoptedMonth).toMatch(/^\d{4}-\d{2}$/);
    expect(JSON.stringify(res.body)).not.toMatch(/Laura|laura@test\.local|Méndez/);
    expect(JSON.stringify(res.body)).not.toContain(adopter.userId);

    const twice = await request(server)
      .post('/community/business/redeem')
      .set(auth(business.token))
      .send({ code: passCode })
      .expect(200);
    expect(twice.body.result).toBe('already_redeemed');

    const history = await request(server)
      .get('/community/business/redemptions')
      .set(auth(business.token))
      .expect(200);
    expect(history.body).toHaveLength(1);
    expect(JSON.stringify(history.body)).not.toMatch(/Laura|laura@test\.local/);

    const mine = await request(server)
      .get('/community/benefits/mine')
      .set(auth(adopter.token))
      .expect(200);
    expect(mine.body.passes[0]).toMatchObject({ status: 'redeemed' });
  });

  it('impact and the path to the ally seal reflect verified actions only', async () => {
    let me = await request(server)
      .get('/community/business/me')
      .set(auth(business.token))
      .expect(200);
    expect(me.body.impact).toMatchObject({
      contributionsDelivered: 0,
      sheltersSupported: 0,
      adoptersBenefited: 1,
      liveBenefits: 1,
      passesIssued: 1,
    });
    expect(me.body.ally).toMatchObject({ eligible: true, isAlly: false });

    await seedDeliveredContribution(shelter.orgId, business);
    me = await request(server).get('/community/business/me').set(auth(business.token)).expect(200);
    expect(me.body.impact).toMatchObject({ contributionsDelivered: 1, sheltersSupported: 1 });

    const publicImpact = await request(server)
      .get(`/public/community/services/${listingId}/impact`)
      .expect(200);
    expect(publicImpact.body).toMatchObject({ sheltersSupported: 1, adoptersBenefited: 1 });
    expect(publicImpact.body.passesIssued).toBeUndefined();

    // El sello lo pone la plataforma (nunca el negocio).
    await request(server)
      .patch(`/platform/community/services/${listingId}/partner`)
      .set(auth(platformAdmin.token))
      .send({ partner: true })
      .expect(200);
    me = await request(server).get('/community/business/me').set(auth(business.token)).expect(200);
    expect(me.body.ally.isAlly).toBe(true);
  });

  it('pausing hides the benefit; editing sends it back to review', async () => {
    await request(server)
      .patch(`/community/business/benefits/${benefitId}`)
      .set(auth(business.token))
      .send({ active: false })
      .expect(200);
    let page = await request(server)
      .get(`/public/community/benefits?city=${encodeURIComponent(city)}`)
      .expect(200);
    expect(page.body.items).toHaveLength(0);

    const resumed = await request(server)
      .patch(`/community/business/benefits/${benefitId}`)
      .set(auth(business.token))
      .send({ active: true })
      .expect(200);
    expect(resumed.body.status).toBe('approved');

    const edited = await request(server)
      .patch(`/community/business/benefits/${benefitId}`)
      .set(auth(business.token))
      .send({ title: 'Primera consulta y desparasitación gratis' })
      .expect(200);
    expect(edited.body.status).toBe('pending');
    page = await request(server)
      .get(`/public/community/benefits?city=${encodeURIComponent(city)}`)
      .expect(200);
    expect(page.body.items).toHaveLength(0);
  });

  it('audit run-4 F10: concurrent creations cannot exceed the open-benefits cap', async () => {
    const own = await request(server)
      .post('/community/services')
      .set(auth(otherBusiness.token))
      .send({
        category: 'grooming',
        name: `Peluquería F10 ${randomUUID().slice(0, 6)}`,
        department: 'Antioquia',
        city,
      })
      .expect(201);
    const results = await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        request(server)
          .post('/community/business/benefits')
          .set(auth(otherBusiness.token))
          .send({ listingId: own.body.id, title: `Beneficio paralelo ${i}` }),
      ),
    );
    expect(results.filter((r) => r.status === 201)).toHaveLength(3);
    expect(results.filter((r) => r.status === 409)).toHaveLength(3);
  });
});
