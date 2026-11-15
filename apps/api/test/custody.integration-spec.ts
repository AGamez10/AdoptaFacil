import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { purgeOrganizations } from './support/cleanup';
import { LEGAL_ORG } from './support/legal';
import { approveTestOrganization, formalizeTestOrganization } from './support/organization-status';

/**
 * Documentación, ingreso, custodia y guardería (extremo a extremo):
 * - ingreso con acta en PDF, que después no se puede modificar;
 * - contrato desde la plantilla, con datos faltantes señalados, emitido,
 *   firmado fuera y vigente; una plantilla nueva no altera el ya emitido;
 * - cobros, pagos con constancia (que no es factura), prórroga con quien la
 *   autoriza y aviso de vencimiento;
 * - REGLA: una deuda vencida NO impide registrar la salida del animal, y la
 *   entrega a una autoridad exige rol de administración y revisión humana;
 * - reportes de animales (PDF, CSV, Excel) e individual;
 * - aislamiento: la Org B no ve ni toca nada de la Org A (no-leak) y RBAC.
 */
describe('Custody (documentación, guardería, cuenta y reportes; no-leak)', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  const admin = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  const orgIds: string[] = [];
  const password = 'password-1234';

  interface Actor {
    token: string;
    userId: string;
    orgId: string;
  }
  let orgA: Actor;
  let orgB: Actor;
  let animalId: string;
  let responsibleId: string;
  let intakeId: string;
  let contractId: string;
  let chargeId: string;
  let actaDocumentId: string;

  const today = new Date(Date.now() - 5 * 3600_000).toISOString().slice(0, 10);
  const daysFromToday = (n: number) =>
    new Date(Date.parse(`${today}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
  const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');

  const api = (actor: Actor) => ({
    get: (path: string) => request(server).get(path).set('Authorization', `Bearer ${actor.token}`),
    post: (path: string, body?: object) =>
      request(server)
        .post(path)
        .set('Authorization', `Bearer ${actor.token}`)
        .send(body ?? {}),
    put: (path: string, body: object) =>
      request(server).put(path).set('Authorization', `Bearer ${actor.token}`).send(body),
  });

  async function registerOrg(name: string): Promise<Actor> {
    const res = await request(server)
      .post('/auth/register/organization')
      .send({
        ...LEGAL_ORG,
        organizationName: name,
        displayName: `Owner ${name}`,
        email: `custody-${randomUUID()}@test.local`,
        password,
      })
      .expect(201);
    orgIds.push(res.body.user.organizationId);
    await approveTestOrganization(admin, res.body.user.organizationId);
    await formalizeTestOrganization(admin, res.body.user.organizationId);
    return {
      token: res.body.tokens.accessToken,
      userId: res.body.user.id,
      orgId: res.body.user.organizationId,
    };
  }

  const contractBody = () => ({
    animalId,
    responsibleId,
    representative: {
      fullName: 'Representante De Prueba',
      documentType: 'CC',
      documentNumber: '900100200',
      position: 'Representante legal',
    },
    startDate: today,
    monthlyFeeCop: 350000,
    paymentFrequency: 'monthly',
    paymentDay: 5,
  });

  const binary = (req: request.Test) =>
    req.buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    server = app.getHttpServer();
    orgA = await registerOrg('Fundación Custodia A');
    orgB = await registerOrg('Refugio Custodia B');
    const animal = await api(orgA)
      .post('/animals', {
        name: 'Canela',
        species: 'dog',
        sex: 'female',
        size: 'medium',
        approximateAgeMonths: 30,
      })
      .expect(201);
    animalId = animal.body.id;
  });

  afterAll(async () => {
    await purgeOrganizations(admin, orgIds);
    await app.close();
    await admin.$disconnect();
  });

  it('registers a responsible and rejects a duplicated document', async () => {
    const body = {
      fullName: 'Persona Responsable De Prueba',
      documentType: 'CC',
      documentNumber: '1000200300',
      phone: '3000000000',
    };
    const res = await api(orgA).post('/custody/responsibles', body).expect(201);
    responsibleId = res.body.id;
    await api(orgA).post('/custody/responsibles', body).expect(409);
  });

  it('records an intake, generates the acta and then freezes it', async () => {
    const before = await api(orgA).get(`/custody/animals/${animalId}/overview`).expect(200);
    expect(before.body).toMatchObject({
      custodyStatus: 'not_registered',
      contractStatus: 'none',
      accountStatus: 'no_charges',
      intakeDateSource: 'system_record',
    });

    const body = {
      intakeAt: new Date(Date.now() - 3600_000).toISOString(),
      reason: 'boarding',
      responsibleId,
      physicalCondition: 'Activa, pelaje limpio, sin heridas visibles.',
      vaccinationStatus: 'up_to_date',
      receivedByName: 'Operadora De Turno',
    };
    const intake = await api(orgA).post(`/custody/animals/${animalId}/intakes`, body).expect(201);
    intakeId = intake.body.id;
    expect(intake.body.status).toBe('draft');

    // Un registro retrospectivo debe decir de dónde sale la información.
    await api(orgA)
      .put(`/custody/intakes/${intakeId}`, { ...body, isRetrospective: true })
      .expect(400);
    await api(orgA)
      .put(`/custody/intakes/${intakeId}`, { ...body, notes: 'Llegó con su cama.' })
      .expect(200);

    const done = await api(orgA).post(`/custody/intakes/${intakeId}/finalize`).expect(200);
    expect(done.body.intake.status).toBe('finalized');
    expect(done.body.document).toMatchObject({ kind: 'intake_record', source: 'generated' });
    actaDocumentId = done.body.document.id;

    const file = await binary(api(orgA).get(`/custody/documents/${actaDocumentId}/file`)).expect(
      200,
    );
    expect(file.headers['content-type']).toContain('application/pdf');
    expect((file.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');

    // Generada el acta, el ingreso no cambia: ni por la API ni por SQL directo.
    await api(orgA).put(`/custody/intakes/${intakeId}`, body).expect(409);
    await api(orgA).post(`/custody/intakes/${intakeId}/finalize`).expect(409);
    await expect(
      admin.animalIntake.update({ where: { id: intakeId }, data: { notes: 'cambio' } }),
    ).rejects.toThrow();
    await expect(
      admin.custodyDocument.update({ where: { id: actaDocumentId }, data: { title: 'x' } }),
    ).rejects.toThrow();

    const after = await api(orgA).get(`/custody/animals/${animalId}/overview`).expect(200);
    expect(after.body).toMatchObject({
      custodyStatus: 'in_custody',
      intakeDateSource: 'intake_record',
    });
  });

  it('builds a contract from the template, says what is missing, issues and activates it', async () => {
    const templates = await api(orgA).get('/custody/contract-templates').expect(200);
    expect(templates.body[0]).toMatchObject({ isBase: true });
    const locked = templates.body[0].clauses.find((c: { locked?: boolean }) => c.locked);
    expect(locked).toBeDefined();

    // Plantilla propia que intenta quitar y reescribir la cláusula bloqueada.
    const own = await api(orgA)
      .post('/custody/contract-templates', {
        name: 'Guardería de prueba',
        clauses: [
          { id: 'objeto', title: 'Objeto', body: 'Cuidado temporal de {{animal}}.', enabled: true },
          {
            id: locked.id,
            title: 'Retención',
            body: 'El animal se retiene por mora.',
            enabled: false,
          },
        ],
        annexes: [],
      })
      .expect(201);
    const kept = own.body.clauses.find((c: { id: string }) => c.id === locked.id);
    expect(kept).toMatchObject({ body: locked.body, enabled: true, locked: true });
    await api(orgA)
      .post('/custody/contract-templates', {
        name: 'Con variable desconocida',
        clauses: [
          { id: 'a', title: 'Algo', body: 'Texto con {{inventada}} variable.', enabled: true },
        ],
      })
      .expect(400);

    const prefill = await api(orgA)
      .get(`/custody/animals/${animalId}/contract-prefill`)
      .expect(200);
    expect(prefill.body.animal.name).toBe('Canela');
    expect(prefill.body.responsible.id).toBe(responsibleId);
    expect(prefill.body.missing.length).toBeGreaterThan(0);

    const draft = await api(orgA)
      .post('/custody/contracts', { ...contractBody(), templateKey: own.body.templateKey })
      .expect(201);
    contractId = draft.body.id;
    expect(draft.body).toMatchObject({ status: 'draft', templateVersion: 1 });
    expect(draft.body.number).toMatch(/^GC-\d{4}-0001$/);

    // Emitir exige confirmación y los datos obligatorios: se dice cuáles faltan.
    await api(orgA).post(`/custody/contracts/${contractId}/issue`, {}).expect(400);
    const missing = await api(orgA)
      .post(`/custody/contracts/${contractId}/issue`, { confirm: true })
      .expect(422);
    expect(missing.body.error).toBe('missing_required_data');
    expect(missing.body.missing.map((m: { field: string }) => m.field)).toEqual(
      expect.arrayContaining(['organization.nit', 'responsible.address']),
    );

    await admin.organizationProfile.upsert({
      where: { organizationId: orgA.orgId },
      create: {
        organizationId: orgA.orgId,
        nit: '900123456-7',
        phone: '6010000000',
        location: { city: 'Bogotá', address: 'Calle 1 # 2-3' },
      },
      update: {
        nit: '900123456-7',
        phone: '6010000000',
        location: { city: 'Bogotá', address: 'Calle 1 # 2-3' },
      },
    });
    await api(orgA)
      .put(`/custody/responsibles/${responsibleId}`, {
        fullName: 'Persona Responsable De Prueba',
        documentType: 'CC',
        documentNumber: '1000200300',
        phone: '3000000000',
        address: 'Carrera 4 # 5-6',
      })
      .expect(200);

    const preview = await binary(api(orgA).get(`/custody/contracts/${contractId}/preview`)).expect(
      200,
    );
    expect((preview.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');

    const issued = await api(orgA)
      .post(`/custody/contracts/${contractId}/issue`, { confirm: true })
      .expect(200);
    expect(issued.body.contract.status).toBe('issued');
    expect(issued.body.document.kind).toBe('boarding_contract');

    // Cambiar la plantilla después NO altera el contrato emitido.
    await api(orgA)
      .put(`/custody/contract-templates/${own.body.templateKey}`, {
        name: 'Guardería de prueba',
        clauses: [
          { id: 'objeto', title: 'Objeto nuevo', body: 'Otro texto distinto.', enabled: true },
        ],
        annexes: [],
      })
      .expect(200);
    const versions = await api(orgA)
      .get(`/custody/contract-templates/${own.body.templateKey}/versions`)
      .expect(200);
    expect(versions.body.map((v: { version: number }) => v.version)).toEqual([2, 1]);
    const same = await api(orgA).get(`/custody/contracts/${contractId}`).expect(200);
    expect(same.body.templateVersion).toBe(1);
    expect(same.body.clauses[0].body).toBe('Cuidado temporal de {{animal}}.');
    await api(orgA).put(`/custody/contracts/${contractId}`, contractBody()).expect(409);
    await expect(
      admin.custodyContract.update({ where: { id: contractId }, data: { monthlyFeeCop: 1 } }),
    ).rejects.toThrow();

    // El ejemplar firmado por fuera se adjunta y el contrato queda vigente.
    const signed = await request(server)
      .post(`/custody/animals/${animalId}/documents`)
      .set('Authorization', `Bearer ${orgA.token}`)
      .field('kind', 'signed_contract')
      .field('title', 'Contrato firmado')
      .field('contractId', contractId)
      .attach('file', PDF, { filename: 'firmado.pdf', contentType: 'application/pdf' })
      .expect(201);
    expect(signed.body).toMatchObject({ kind: 'signed_contract', source: 'uploaded', version: 1 });
    const active = await api(orgA).get(`/custody/contracts/${contractId}`).expect(200);
    expect(active.body.status).toBe('active');

    // Un archivo que no es PDF ni imagen se rechaza por su contenido.
    await request(server)
      .post(`/custody/animals/${animalId}/documents`)
      .set('Authorization', `Bearer ${orgA.token}`)
      .field('kind', 'other')
      .field('title', 'Ejecutable')
      .attach('file', Buffer.from('MZ\x90\x00binario'), {
        filename: 'x.pdf',
        contentType: 'application/pdf',
      })
      .expect(400);
  });

  it('charges, receives a payment with a receipt that is not an invoice, and grants an extension', async () => {
    const charge = await request(server)
      .post('/custody/charges')
      .set('Authorization', `Bearer ${orgA.token}`)
      .field('animalId', animalId)
      .field('responsibleId', responsibleId)
      .field('contractId', contractId)
      .field('concept', 'boarding_fee')
      .field('description', 'Mensualidad de guardería')
      .field('amountCop', '350000')
      .field('dueDate', daysFromToday(-10))
      .attach('file', PDF, { filename: 'soporte.pdf', contentType: 'application/pdf' })
      .expect(201);
    chargeId = charge.body.id;
    expect(charge.body).toMatchObject({
      status: 'pending',
      situation: 'overdue',
      balanceCop: 350000,
      hasSupport: true,
    });

    const food = await api(orgA)
      .post('/custody/charges', {
        animalId,
        responsibleId,
        concept: 'food',
        description: 'Concentrado del mes',
        amountCop: 80000,
        dueDate: daysFromToday(5),
      })
      .expect(201);
    expect(food.body.situation).toBe('upcoming');

    // Aviso de vencimiento, calculado al leer.
    const summary = await api(orgA).get('/custody/account/summary').expect(200);
    expect(summary.body).toMatchObject({ pendingCop: 430000, overdueCop: 350000 });
    expect(summary.body.alerts).toHaveLength(1);
    expect(summary.body.alerts[0]).toMatchObject({ chargeId, kind: 'payment_overdue' });
    expect(summary.body.byAnimal[0]).toMatchObject({ id: animalId, pendingCop: 430000 });

    await api(orgA)
      .post(`/custody/charges/${chargeId}/payments`, {
        amountCop: 999999999,
        paidOn: today,
        method: 'transfer',
      })
      .expect(400);
    const paid = await request(server)
      .post(`/custody/charges/${chargeId}/payments`)
      .set('Authorization', `Bearer ${orgA.token}`)
      .field('amountCop', '100000')
      .field('paidOn', today)
      .field('method', 'transfer')
      .attach('file', PDF, { filename: 'comprobante.pdf', contentType: 'application/pdf' })
      .expect(201);
    expect(paid.body).toMatchObject({ paidCop: 100000, balanceCop: 250000, status: 'pending' });
    const payment = paid.body.payments[0];
    expect(payment.receiptNumber).toMatch(/^RP-\d{4}-000001$/);
    expect(payment.hasProof).toBe(true);
    expect(payment.receiptDocumentId).toBeDefined();

    const docs = await api(orgA).get(`/custody/animals/${animalId}/documents`).expect(200);
    const receipt = docs.body.find((d: { id: string }) => d.id === payment.receiptDocumentId);
    expect(receipt.kind).toBe('payment_receipt');
    expect(docs.body.some((d: { kind: string }) => d.kind === 'electronic_invoice')).toBe(false);

    // Prórroga: decisión con nombre; la fecha original del cobro no cambia.
    await api(orgA)
      .post(`/custody/charges/${chargeId}/extensions`, {
        newDueDate: daysFromToday(-20),
        reason: 'Fecha anterior a la vigente',
      })
      .expect(400);
    const extended = await api(orgA)
      .post(`/custody/charges/${chargeId}/extensions`, {
        newDueDate: daysFromToday(7),
        reason: 'El responsable recibe su pago la otra semana.',
        requestedBy: 'El responsable',
      })
      .expect(201);
    expect(extended.body).toMatchObject({
      dueDate: daysFromToday(-10),
      effectiveDueDate: daysFromToday(7),
      situation: 'extended',
    });
    expect(extended.body.extensions[0].authorizedByName).toContain('Owner');
    const after = await api(orgA).get('/custody/account/summary').expect(200);
    expect(after.body.alerts).toHaveLength(0);

    // Lo registrado no se reescribe por SQL directo.
    await expect(
      admin.custodyCharge.update({ where: { id: chargeId }, data: { amountCop: 1 } }),
    ).rejects.toThrow();
    await expect(
      admin.custodyPayment.update({ where: { id: payment.id }, data: { amountCop: 1 } }),
    ).rejects.toThrow();
    await expect(
      admin.custodyChargeExtension.deleteMany({ where: { chargeId } }),
    ).rejects.toThrow();

    const statement = await binary(
      api(orgA).get(`/custody/responsibles/${responsibleId}/statement`),
    ).expect(200);
    expect((statement.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('a collection procedure needs a human decision and never touches custody', async () => {
    const late = await api(orgA)
      .post('/custody/charges', {
        animalId,
        responsibleId,
        concept: 'veterinary',
        description: 'Consulta veterinaria',
        amountCop: 120000,
        dueDate: daysFromToday(-40),
      })
      .expect(201);
    await api(orgA)
      .post(`/custody/charges/${late.body.id}/collection`, { note: 'Sin respuesta a tres avisos.' })
      .expect(400);
    const started = await api(orgA)
      .post(`/custody/charges/${late.body.id}/collection`, {
        note: 'Sin respuesta a tres avisos.',
        humanReviewConfirmed: true,
      })
      .expect(200);
    expect(started.body.collectionStartedAt).toBeDefined();
    // Un cobro al día no admite procedimiento de cobro.
    await api(orgA)
      .post(`/custody/charges/${chargeId}/collection`, {
        note: 'No aplica, está en prórroga.',
        humanReviewConfirmed: true,
      })
      .expect(409);

    const overview = await api(orgA).get(`/custody/animals/${animalId}/overview`).expect(200);
    expect(overview.body).toMatchObject({
      custodyStatus: 'in_custody',
      accountStatus: 'overdue',
      contractStatus: 'active',
      welfareStatus: 'available',
    });
  });

  it('RULE: a pending debt never blocks the release of the animal', async () => {
    // Entregar a una autoridad no es operación diaria ni automática.
    const authority = {
      releaseType: 'handover_to_authority',
      releasedAt: new Date().toISOString(),
      receivedByName: 'Funcionario De Prueba',
      conditionAtRelease: 'En buen estado general a simple vista.',
      deliveredByName: 'Operadora De Turno',
      authorityName: 'Autoridad de prueba',
      authorityBasis: 'Procedimiento de prueba revisado por la organización.',
    };
    await api(orgA).post(`/custody/animals/${animalId}/releases`, authority).expect(400);
    await api(orgA)
      .post(`/custody/animals/${animalId}/releases`, { ...authority, humanReviewConfirmed: true })
      .expect(403);
    await api(orgA).post(`/custody/animals/${animalId}/authority-handover`, authority).expect(400);

    const res = await api(orgA)
      .post(`/custody/animals/${animalId}/releases`, {
        releaseType: 'return_to_responsible',
        releasedAt: new Date().toISOString(),
        receivedByName: 'Persona Responsable De Prueba',
        conditionAtRelease: 'En buen estado general a simple vista.',
        deliveredByName: 'Operadora De Turno',
      })
      .expect(201);
    expect(res.body.release.outstandingBalanceCop).toBe(450000);
    expect(res.body.document.kind).toBe('release_record');

    const overview = await api(orgA).get(`/custody/animals/${animalId}/overview`).expect(200);
    // La custodia cambió; la cuenta y el contrato siguen su propio curso.
    expect(overview.body).toMatchObject({
      custodyStatus: 'released',
      accountStatus: 'overdue',
      contractStatus: 'active',
      pendingCop: 450000,
    });
    await expect(admin.custodyRelease.deleteMany({ where: { animalId } })).rejects.toThrow();

    const timeline = await api(orgA).get(`/custody/animals/${animalId}/timeline`).expect(200);
    const types = timeline.body.map((e: { type: string }) => e.type);
    expect(types).toEqual(
      expect.arrayContaining([
        'intake_recorded',
        'intake_finalized',
        'contract_issued',
        'contract_signed',
        'charge_created',
        'payment_received',
        'extension_granted',
        'collection_procedure_started',
        'release_recorded',
      ]),
    );

    const ended = await api(orgA)
      .post(`/custody/contracts/${contractId}/end`, {
        reason: 'El animal volvió con su responsable.',
      })
      .expect(200);
    expect(ended.body.status).toBe('ended');
  });

  it('exports the animals report as PDF, CSV and Excel, and the individual report', async () => {
    const preview = await api(orgA)
      .get('/custody/reports/animals?species=dog&custody=released')
      .expect(200);
    expect(preview.body.total).toBe(1);
    expect(preview.body.rows[0]).toMatchObject({
      name: 'Canela',
      custodyStatus: 'released',
      intakeDateSource: 'intake_record',
      responsibleName: 'Persona Responsable De Prueba',
    });
    const none = await api(orgA).get('/custody/reports/animals?species=cat').expect(200);
    expect(none.body.total).toBe(0);
    await api(orgA).get('/custody/reports/animals?species=dragon').expect(400);

    const pdf = await binary(api(orgA).get('/custody/reports/animals/pdf')).expect(200);
    expect((pdf.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
    const csv = await api(orgA).get('/custody/reports/animals/csv').expect(200);
    expect(csv.text).toContain('Canela');
    expect(csv.text).toContain('Fecha de ingreso');
    const xlsx = await binary(api(orgA).get('/custody/reports/animals/xlsx')).expect(200);
    expect((xlsx.body as Buffer).subarray(0, 2).toString()).toBe('PK');

    const individual = await api(orgA).post(`/custody/animals/${animalId}/report`).expect(201);
    expect(individual.body).toMatchObject({ kind: 'animal_report', source: 'generated' });
  });

  it('no-leak: another organization cannot see or touch any of it', async () => {
    const b = api(orgB);
    await b.get(`/custody/animals/${animalId}/overview`).expect(404);
    await b.get(`/custody/animals/${animalId}/documents`).expect(404);
    await b.get(`/custody/animals/${animalId}/timeline`).expect(404);
    await b.get(`/custody/documents/${actaDocumentId}/file`).expect(404);
    await b.get(`/custody/contracts/${contractId}`).expect(404);
    await b.get(`/custody/contracts/${contractId}/preview`).expect(404);
    await b.get(`/custody/responsibles/${responsibleId}/statement`).expect(404);
    await b
      .post(`/custody/charges/${chargeId}/payments`, {
        amountCop: 1000,
        paidOn: today,
        method: 'cash',
      })
      .expect(404);
    await b
      .post(`/custody/charges/${chargeId}/extensions`, {
        newDueDate: daysFromToday(30),
        reason: 'Intento ajeno',
      })
      .expect(404);
    await b
      .post('/custody/charges', {
        animalId,
        responsibleId,
        concept: 'other',
        description: 'Cobro ajeno',
        amountCop: 1000,
        dueDate: today,
      })
      .expect(404);
    expect((await b.get('/custody/responsibles').expect(200)).body).toHaveLength(0);
    expect((await b.get('/custody/charges').expect(200)).body).toHaveLength(0);
    expect((await b.get('/custody/contracts').expect(200)).body).toHaveLength(0);
    expect((await b.get('/custody/account/summary').expect(200)).body.pendingCop).toBe(0);
    expect((await b.get('/custody/reports/animals').expect(200)).body.total).toBe(0);
    // Solo ve la plantilla base, no la de la otra organización.
    expect((await b.get('/custody/contract-templates').expect(200)).body).toHaveLength(1);
  });

  it('RBAC: operators cannot decide, auditors only read, volunteers get nothing', async () => {
    const setRole = (role: string) =>
      admin.userRole.updateMany({ where: { userId: orgA.userId }, data: { role } });
    const charge = {
      animalId,
      responsibleId,
      concept: 'other',
      description: 'Cobro de prueba de permisos',
      amountCop: 1000,
      dueDate: daysFromToday(3),
    };

    await setRole('operator');
    const created = await api(orgA).post('/custody/charges', charge).expect(201);
    await api(orgA)
      .post(`/custody/charges/${created.body.id}/extensions`, {
        newDueDate: daysFromToday(9),
        reason: 'Un operador no concede prórrogas',
      })
      .expect(403);
    await api(orgA)
      .post(`/custody/charges/${created.body.id}/cancel`, { reason: 'Sin permiso' })
      .expect(403);
    await api(orgA).post(`/custody/animals/${animalId}/authority-handover`, {}).expect(403);
    await api(orgA).post('/custody/contract-templates', {}).expect(403);

    await setRole('read_only_auditor');
    await api(orgA).get(`/custody/animals/${animalId}/timeline`).expect(200);
    await api(orgA).get(`/custody/documents/${actaDocumentId}/file`).expect(200);
    await api(orgA).post('/custody/charges', charge).expect(403);
    await api(orgA).post(`/custody/animals/${animalId}/intakes`, {}).expect(403);

    await setRole('volunteer');
    await api(orgA).get(`/custody/animals/${animalId}/overview`).expect(403);
    await api(orgA).get('/custody/account/summary').expect(403);
    await api(orgA).get(`/custody/documents/${actaDocumentId}/file`).expect(403);

    await setRole('veterinarian');
    await api(orgA).get('/custody/charges').expect(403);
    await request(server).get('/custody/charges').expect(401);
  });
});
