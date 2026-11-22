import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { Role } from '@adoptafacil/contracts';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PasswordService } from '../src/core/auth/password.service';
import { TokenService } from '../src/core/auth/token.service';
import { purgeOrganizations } from './support/cleanup';
import { LEGAL_ORG } from './support/legal';
import { approveTestOrganization, formalizeTestOrganization } from './support/organization-status';

/**
 * Trabajo de cada cargo (decisión del dueño, 2026-11-22), por HTTP y con una
 * cuenta real de cada cargo:
 *  - el veterinario lleva lo clínico y marca "apto para adopción", pero no
 *    publica salvo con el permiso expreso que le da el propietario o un
 *    administrador;
 *  - el operador cobra la custodia por la tarifa del contrato y no anula ni
 *    cobra recargos;
 *  - el voluntario ve solo sus tareas y la ficha básica de los animales a su
 *    cargo, y registra sus cuidados.
 */
describe('Team work by role (vet publishing, operator charges, volunteer panel)', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  const admin = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  const orgIds: string[] = [];
  const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');
  const today = new Date(Date.now() - 5 * 3600_000).toISOString().slice(0, 10);

  let orgId: string;
  const tokens = new Map<Role, string>();
  const userIds = new Map<Role, string>();

  const as = (role: Role) => ({ Authorization: `Bearer ${tokens.get(role) as string}` });
  const get = (role: Role, path: string) => request(server).get(path).set(as(role));
  const post = (role: Role, path: string, body: object = {}) =>
    request(server).post(path).set(as(role)).send(body);
  const patch = (role: Role, path: string, body: object) =>
    request(server).patch(path).set(as(role)).send(body);
  const put = (role: Role, path: string, body: object) =>
    request(server).put(path).set(as(role)).send(body);

  async function memberOf(role: Role): Promise<void> {
    const userId = randomUUID();
    const email = `team-${role}-${randomUUID()}@test.local`;
    const passwordHash = await new PasswordService().hash('password-1234');
    await admin.user.create({
      data: {
        id: userId,
        organizationId: orgId,
        accountType: 'organization',
        email,
        displayName: `Persona ${role}`,
      },
    });
    await admin.authCredential.create({
      data: { userId, organizationId: orgId, accountType: 'organization', email, passwordHash },
    });
    await admin.userRole.create({ data: { organizationId: orgId, userId, role } });
    const issued = await app
      .get(TokenService)
      .issueTokens({ userId, organizationId: orgId, accountType: 'organization', email });
    tokens.set(role, issued.accessToken);
    userIds.set(role, userId);
  }

  const newAnimal = (role: Role, name: string) =>
    post(role, '/animals', {
      name,
      species: 'dog',
      sex: 'female',
      size: 'medium',
      approximateAgeMonths: 24,
      description: 'Tranquila y cariñosa.',
      tags: ['tranquila'],
    });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    server = app.getHttpServer();

    const res = await request(server)
      .post('/auth/register/organization')
      .send({
        ...LEGAL_ORG,
        organizationName: 'Refugio Trabajo por Cargo',
        displayName: 'Propietaria',
        email: `team-owner-${randomUUID()}@test.local`,
        password: 'password-1234',
      })
      .expect(201);
    orgId = res.body.user.organizationId as string;
    orgIds.push(orgId);
    await approveTestOrganization(admin, orgId);
    await formalizeTestOrganization(admin, orgId);
    tokens.set(Role.Owner, res.body.tokens.accessToken);
    userIds.set(Role.Owner, res.body.user.id);
    for (const role of [
      Role.Administrator,
      Role.Operator,
      Role.Veterinarian,
      Role.Volunteer,
      Role.ReadOnlyAuditor,
    ]) {
      await memberOf(role);
    }
  });

  afterAll(async () => {
    await purgeOrganizations(admin, orgIds);
    await admin.$disconnect();
    await app?.close();
  });

  describe('veterinarian', () => {
    let animalId: string;

    it('creates a record that stays off the portal until someone publishes it', async () => {
      const res = await newAnimal(Role.Veterinarian, 'Luna').expect(201);
      animalId = res.body.id;
      expect(res.body).toMatchObject({ status: 'unavailable', isActive: true });
      // El operador sí crea publicado, como siempre.
      const byOperator = await newAnimal(Role.Operator, 'Sol').expect(201);
      expect(byOperator.body.status).toBe('available');
    });

    it('edits the record but cannot publish nor pull it from the portal', async () => {
      await patch(Role.Veterinarian, `/animals/${animalId}`, { description: 'Vacunada.' }).expect(
        200,
      );
      const denied = await patch(Role.Veterinarian, `/animals/${animalId}`, {
        status: 'available',
      }).expect(403);
      expect(denied.body.message).toMatch(/administrador u operador/);
      await post(Role.Veterinarian, `/animals/${animalId}/activate`).expect(403);
      await post(Role.Veterinarian, `/animals/${animalId}/deactivate`).expect(403);
      // Sacarla por salud ("no disponible") sí.
      await patch(Role.Veterinarian, `/animals/${animalId}`, { status: 'unavailable' }).expect(200);
    });

    it('marks the animal fit for adoption and the team sees who did it', async () => {
      const res = await post(Role.Veterinarian, `/animals/${animalId}/adoption-readiness`, {
        ready: true,
        note: 'Esterilizada y con vacunas al día.',
      }).expect(200);
      expect(res.body).toMatchObject({
        status: 'unavailable',
        adoptionReadyByName: `Persona ${Role.Veterinarian}`,
        adoptionReadyNote: 'Esterilizada y con vacunas al día.',
      });
      expect(res.body.adoptionReadyAt).toEqual(expect.any(String));
      const seen = await get(Role.Owner, `/animals/${animalId}`).expect(200);
      expect(seen.body.adoptionReadyByName).toBe(`Persona ${Role.Veterinarian}`);
      // El voluntario no marca nada.
      await post(Role.Volunteer, `/animals/${animalId}/adoption-readiness`, {
        ready: true,
      }).expect(403);
    });

    it('publishes only after the owner or an administrator grants the explicit permission', async () => {
      const vetId = userIds.get(Role.Veterinarian) as string;
      // El operador no gobierna el equipo; a un operador no se le da este permiso.
      await put(Role.Operator, `/org/members/${vetId}/permissions`, {
        permissions: ['animals.publish'],
      }).expect(403);
      await put(Role.Owner, `/org/members/${userIds.get(Role.Operator)}/permissions`, {
        permissions: ['animals.publish'],
      }).expect(400);

      await put(Role.Administrator, `/org/members/${vetId}/permissions`, {
        permissions: ['animals.publish'],
      }).expect(204);
      const team = await get(Role.Owner, '/org/members').expect(200);
      const vet = team.body.members.find((m: { userId: string }) => m.userId === vetId);
      expect(vet.permissions).toEqual(['animals.publish']);
      const mine = await get(Role.Veterinarian, '/team/me/permissions').expect(200);
      expect(mine.body.permissions).toEqual(['animals.publish']);

      await patch(Role.Veterinarian, `/animals/${animalId}`, { status: 'available' }).expect(200);
      await post(Role.Veterinarian, `/animals/${animalId}/deactivate`).expect(201);
      await post(Role.Veterinarian, `/animals/${animalId}/activate`).expect(201);
      const audit = await admin.auditLog.findFirst({
        where: { organizationId: orgId, action: 'member.permissions_changed', entityId: vetId },
      });
      expect(audit?.metadata).toMatchObject({ added: ['animals.publish'], removed: [] });

      // Quitarlo vuelve a cerrar la puerta.
      await put(Role.Owner, `/org/members/${vetId}/permissions`, { permissions: [] }).expect(204);
      await post(Role.Veterinarian, `/animals/${animalId}/deactivate`).expect(403);
    });

    it('loses the permission when the role changes', async () => {
      const vetId = userIds.get(Role.Veterinarian) as string;
      await put(Role.Owner, `/org/members/${vetId}/permissions`, {
        permissions: ['animals.publish'],
      }).expect(204);
      await put(Role.Owner, `/org/members/${vetId}/role`, { role: Role.Volunteer }).expect(204);
      await put(Role.Owner, `/org/members/${vetId}/role`, { role: Role.Veterinarian }).expect(204);
      expect(
        await admin.memberPermissionGrant.count({
          where: { organizationId: orgId, userId: vetId },
        }),
      ).toBe(0);
    });
  });

  describe('operator custody charges', () => {
    let animalId: string;
    let responsibleId: string;
    let contractId: string;

    beforeAll(async () => {
      animalId = (await newAnimal(Role.Owner, 'Canela')).body.id;
      const responsible = await post(Role.Owner, '/custody/responsibles', {
        fullName: 'Persona Responsable De Prueba',
        documentType: 'CC',
        documentNumber: `10${Date.now() % 100000000}`,
        phone: '3000000000',
      }).expect(201);
      responsibleId = responsible.body.id;
      contractId = randomUUID();
      await admin.custodyContract.create({
        data: {
          id: contractId,
          organizationId: orgId,
          animalId,
          responsibleId,
          number: 'GC-2026-0001',
          status: 'issued',
          issuedAt: new Date(),
          snapshot: {},
          templateName: 'Base',
          startDate: new Date(`${today}T00:00:00Z`),
          monthlyFeeCop: 350_000,
          foodFeeCop: 80_000,
          representative: {},
          clauses: [],
          createdByUserId: userIds.get(Role.Owner) as string,
        },
      });
    });

    const charge = (role: Role, body: Record<string, unknown>) =>
      post(role, '/custody/charges', {
        animalId,
        responsibleId,
        description: 'Cobro de prueba',
        dueDate: today,
        ...body,
      });

    it('charges the monthly fee and food at the exact contract tariff', async () => {
      await charge(Role.Operator, { concept: 'boarding_fee', amountCop: 350_000 }).expect(400);
      const wrong = await charge(Role.Operator, {
        concept: 'boarding_fee',
        contractId,
        amountCop: 400_000,
      }).expect(400);
      expect(wrong.body.message).toMatch(/tarifa del contrato/);
      const ok = await charge(Role.Operator, {
        concept: 'boarding_fee',
        contractId,
        amountCop: 350_000,
      }).expect(201);
      await charge(Role.Operator, { concept: 'food', contractId, amountCop: 80_000 }).expect(201);
      const audit = await admin.auditLog.findFirst({
        where: { organizationId: orgId, action: 'custody.charge_created', entityId: ok.body.id },
      });
      expect(audit?.actorUserId).toBe(userIds.get(Role.Operator));
    });

    it('needs the support for other expenses and never sets a late fee', async () => {
      await charge(Role.Operator, { concept: 'veterinary', amountCop: 60_000 }).expect(400);
      await request(server)
        .post('/custody/charges')
        .set(as(Role.Operator))
        .field('animalId', animalId)
        .field('responsibleId', responsibleId)
        .field('concept', 'veterinary')
        .field('description', 'Consulta')
        .field('amountCop', '60000')
        .field('dueDate', today)
        .attach('file', PDF, { filename: 'factura.pdf', contentType: 'application/pdf' })
        .expect(201);
      await charge(Role.Operator, { concept: 'late_fee', amountCop: 10_000 }).expect(403);
      // El propietario sí decide un recargo o un valor distinto.
      await charge(Role.Owner, { concept: 'late_fee', amountCop: 10_000 }).expect(201);
      await charge(Role.Owner, {
        concept: 'boarding_fee',
        contractId,
        amountCop: 300_000,
      }).expect(201);
    });

    it('cannot cancel a charge nor void a payment', async () => {
      const list = await get(Role.Operator, `/custody/charges?animalId=${animalId}`).expect(200);
      const id = list.body[0].id as string;
      await post(Role.Operator, `/custody/charges/${id}/cancel`, { reason: 'Error' }).expect(403);
      await post(Role.Operator, `/custody/payments/${randomUUID()}/void`, {
        reason: 'Error',
      }).expect(403);
    });
  });

  describe('volunteer panel', () => {
    let careAnimalId: string;
    let otherAnimalId: string;
    let taskId: string;
    let careId: string;

    beforeAll(async () => {
      careAnimalId = (await newAnimal(Role.Owner, 'Toby')).body.id;
      otherAnimalId = (await newAnimal(Role.Owner, 'Max')).body.id;
    });

    it('the operator assigns an animal and a task; an auditor gets no work', async () => {
      const volunteerId = userIds.get(Role.Volunteer) as string;
      const assignees = await get(Role.Operator, '/team/assignees').expect(200);
      expect(assignees.body.map((a: { userId: string }) => a.userId)).toContain(volunteerId);
      expect(assignees.body.map((a: { userId: string }) => a.userId)).not.toContain(
        userIds.get(Role.ReadOnlyAuditor),
      );

      const care = await post(Role.Operator, '/team/assignments', {
        assigneeUserId: volunteerId,
        kind: 'animal_care',
        animalId: careAnimalId,
      }).expect(201);
      careId = care.body.id;
      expect(care.body).toMatchObject({ title: 'Cuidar a Toby', status: 'open' });
      await post(Role.Operator, '/team/assignments', {
        assigneeUserId: volunteerId,
        kind: 'animal_care',
        animalId: careAnimalId,
      }).expect(409);
      const task = await post(Role.Operator, '/team/assignments', {
        assigneeUserId: volunteerId,
        kind: 'task',
        title: 'Limpiar los caniles del patio',
        dueDate: today,
      }).expect(201);
      taskId = task.body.id;
      await post(Role.Operator, '/team/assignments', {
        assigneeUserId: userIds.get(Role.ReadOnlyAuditor),
        kind: 'task',
        title: 'No corresponde',
      }).expect(400);
      // Quien no coordina no encarga.
      await post(Role.Volunteer, '/team/assignments', {
        assigneeUserId: volunteerId,
        kind: 'task',
        title: 'Autoencargo',
      }).expect(403);
    });

    it('sees only its tasks and the basic record of its animals, nothing about adopters or donors', async () => {
      const work = await get(Role.Volunteer, '/team/me/work').expect(200);
      expect(work.body.assignments.map((a: { id: string }) => a.id).sort()).toEqual(
        [careId, taskId].sort(),
      );
      expect(work.body.animals).toHaveLength(1);
      const card = work.body.animals[0];
      expect(card).toMatchObject({ id: careAnimalId, name: 'Toby', tags: ['tranquila'] });
      expect(Object.keys(card).sort()).toEqual(
        expect.arrayContaining(['id', 'name', 'species', 'sex', 'size', 'status', 'tags']),
      );
      for (const forbidden of ['organizationId', 'adoptionReadyByName', 'photoRecords']) {
        expect(card).not.toHaveProperty(forbidden);
      }
      // Lo demás de la organización sigue cerrado.
      await get(Role.Volunteer, '/animals').expect(403);
      await get(Role.Volunteer, `/animals/${careAnimalId}`).expect(403);
      await get(Role.Volunteer, '/adoptions').expect(403);
      await get(Role.Volunteer, '/donations/received').expect(403);
      await get(Role.Volunteer, '/custody/charges').expect(403);
      await get(Role.Volunteer, '/team/assignments').expect(403);
    });

    it('logs care only for the animals in its charge', async () => {
      await post(Role.Volunteer, `/team/me/animals/${careAnimalId}/care-logs`, {
        kind: 'walk',
        note: 'Paseo de 30 minutos.',
      }).expect(201);
      await post(Role.Volunteer, `/team/me/animals/${careAnimalId}/care-logs`, {
        kind: 'observation',
      }).expect(400);
      await post(Role.Volunteer, `/team/me/animals/${otherAnimalId}/care-logs`, {
        kind: 'walk',
      }).expect(404);
      await get(Role.Volunteer, `/team/me/animals/${otherAnimalId}/care-logs`).expect(404);
      const logs = await get(Role.Volunteer, `/team/me/animals/${careAnimalId}/care-logs`).expect(
        200,
      );
      expect(logs.body).toHaveLength(1);
      expect(logs.body[0]).toMatchObject({
        kind: 'walk',
        authorName: `Persona ${Role.Volunteer}`,
      });
      // El veterinario lo ve en la ficha del animal.
      const forVet = await get(Role.Veterinarian, `/team/animals/${careAnimalId}/care-logs`).expect(
        200,
      );
      expect(forVet.body.map((l: { kind: string }) => l.kind)).toEqual(['walk']);
      await get(Role.Volunteer, `/team/animals/${careAnimalId}/care-logs`).expect(403);
    });

    it('completes its own tasks; the care assignment is closed by whoever assigned it', async () => {
      await post(Role.Volunteer, `/team/me/assignments/${careId}/complete`).expect(400);
      await post(Role.Veterinarian, `/team/me/assignments/${taskId}/complete`).expect(404);
      const done = await post(Role.Volunteer, `/team/me/assignments/${taskId}/complete`, {
        note: 'Listo.',
      }).expect(200);
      expect(done.body).toMatchObject({ status: 'done', completionNote: 'Listo.' });
      await post(Role.Volunteer, `/team/me/assignments/${taskId}/complete`).expect(409);

      await post(Role.Owner, `/team/assignments/${careId}/cancel`).expect(200);
      const work = await get(Role.Volunteer, '/team/me/work').expect(200);
      expect(work.body.animals).toEqual([]);
      await post(Role.Volunteer, `/team/me/animals/${careAnimalId}/care-logs`, {
        kind: 'feeding',
      }).expect(404);
    });
  });
});
