import { randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { purgeOrganizations } from './support/cleanup';

/**
 * RNF03 gate para el trabajo del equipo (permisos expresos, encargos y
 * bitácora de cuidados): una organización nunca ve ni escribe lo de otra, y la
 * bitácora es de solo inserción. Conecta como `adoptafacil_app` (no
 * superusuario). Cada nombre lleva "no-leak" para el gate `test:rls`.
 */
const APP_DATABASE_URL =
  process.env.DATABASE_URL_APP ??
  'postgresql://adoptafacil_app:adoptafacil_app@localhost:5433/adoptafacil?schema=public';

async function withOrgContext<T>(
  prisma: PrismaClient,
  organizationId: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.$executeRaw`SELECT set_config('app.current_org_id', ${organizationId}, true)`;
    return fn(tx);
  });
}

describe('RLS cross-org no-leak (trabajo del equipo)', () => {
  const prisma = new PrismaClient({ datasources: { db: { url: APP_DATABASE_URL } } });
  const admin = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  const orgA = randomUUID();
  const orgB = randomUUID();
  const user = randomUUID();
  const ids = {
    A: { animal: randomUUID(), assignment: randomUUID(), log: randomUUID() },
    B: { animal: randomUUID(), assignment: randomUUID(), log: randomUUID() },
  };

  async function seed(org: string, key: 'A' | 'B') {
    const id = ids[key];
    await withOrgContext(prisma, org, async (tx) => {
      await tx.animal.create({
        data: { id: id.animal, organizationId: org, name: `Animal ${key}`, species: 'dog' },
      });
      await tx.memberPermissionGrant.create({
        data: {
          organizationId: org,
          userId: user,
          permission: 'animals.publish',
          grantedByUserId: user,
        },
      });
      await tx.teamAssignment.create({
        data: {
          id: id.assignment,
          organizationId: org,
          kind: 'animal_care',
          assigneeUserId: user,
          animalId: id.animal,
          title: `Cuidar a Animal ${key}`,
          createdByUserId: user,
        },
      });
      await tx.animalCareLog.create({
        data: {
          id: id.log,
          organizationId: org,
          animalId: id.animal,
          authorUserId: user,
          kind: 'walk',
          occurredAt: new Date(),
        },
      });
    });
  }

  beforeAll(async () => {
    await prisma.$connect();
    await admin.organization.createMany({
      data: [
        { id: orgA, name: 'Equipo A' },
        { id: orgB, name: 'Equipo B' },
      ],
    });
    await seed(orgA, 'A');
    await seed(orgB, 'B');
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await purgeOrganizations(admin, [orgA, orgB]);
    await admin.$disconnect();
  });

  it('no-leak: each organization only reads its own grants, assignments and care logs', async () => {
    const seen = await withOrgContext(prisma, orgA, async (tx) => ({
      grants: await tx.memberPermissionGrant.findMany(),
      assignments: await tx.teamAssignment.findMany(),
      logs: await tx.animalCareLog.findMany(),
    }));
    expect(seen.grants.map((g) => g.organizationId)).toEqual([orgA]);
    expect(seen.assignments.map((a) => a.id)).toEqual([ids.A.assignment]);
    expect(seen.logs.map((l) => l.id)).toEqual([ids.A.log]);
  });

  it('no-leak: without tenant context nothing is visible', async () => {
    const counts = await prisma.$transaction(async (tx) => [
      await tx.memberPermissionGrant.count(),
      await tx.teamAssignment.count(),
      await tx.animalCareLog.count(),
    ]);
    expect(counts).toEqual([0, 0, 0]);
  });

  it('no-leak: an organization cannot write into or change another one', async () => {
    await expect(
      withOrgContext(prisma, orgA, (tx) =>
        tx.teamAssignment.create({
          data: {
            organizationId: orgB,
            kind: 'task',
            assigneeUserId: user,
            title: 'Intrusa',
            createdByUserId: user,
          },
        }),
      ),
    ).rejects.toThrow();
    await expect(
      withOrgContext(prisma, orgA, (tx) =>
        tx.animalCareLog.create({
          data: {
            organizationId: orgB,
            animalId: ids.B.animal,
            authorUserId: user,
            kind: 'walk',
            occurredAt: new Date(),
          },
        }),
      ),
    ).rejects.toThrow();
    const touched = await withOrgContext(prisma, orgA, (tx) =>
      tx.teamAssignment.updateMany({
        where: { id: ids.B.assignment },
        data: { status: 'cancelled' },
      }),
    );
    expect(touched.count).toBe(0);
    const revoked = await withOrgContext(prisma, orgA, (tx) =>
      tx.memberPermissionGrant.deleteMany({ where: { organizationId: orgB } }),
    );
    expect(revoked.count).toBe(0);
  });

  it('no-leak: care logs are append-only and assignments are never deleted by the app', async () => {
    await expect(
      withOrgContext(prisma, orgA, (tx) =>
        tx.animalCareLog.update({ where: { id: ids.A.log }, data: { note: 'cambio' } }),
      ),
    ).rejects.toThrow();
    await expect(
      withOrgContext(prisma, orgA, (tx) => tx.animalCareLog.deleteMany()),
    ).rejects.toThrow();
    await expect(
      withOrgContext(prisma, orgA, (tx) => tx.teamAssignment.deleteMany()),
    ).rejects.toThrow();
    // La base rechaza valores fuera del catálogo.
    await expect(
      withOrgContext(prisma, orgA, (tx) =>
        tx.memberPermissionGrant.create({
          data: {
            organizationId: orgA,
            userId: randomUUID(),
            permission: 'org.everything',
            grantedByUserId: user,
          },
        }),
      ),
    ).rejects.toThrow();
  });
});
