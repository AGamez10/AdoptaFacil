import { randomBytes, randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { purgeOrganizations } from './support/cleanup';

/**
 * RNF03 gate para custodia (responsables, ingresos, plantillas, contratos,
 * cobros, prórrogas, pagos, salidas, documentos y eventos): una organización
 * nunca ve ni escribe lo de otra. Conecta como `adoptafacil_app` (no
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

describe('RLS cross-org no-leak (custodia)', () => {
  const prisma = new PrismaClient({ datasources: { db: { url: APP_DATABASE_URL } } });
  const admin = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  const orgA = randomUUID();
  const orgB = randomUUID();
  const user = randomUUID();
  const ids = {
    A: {
      animal: randomUUID(),
      responsible: randomUUID(),
      charge: randomUUID(),
      contract: randomUUID(),
    },
    B: {
      animal: randomUUID(),
      responsible: randomUUID(),
      charge: randomUUID(),
      contract: randomUUID(),
    },
  };

  async function seed(org: string, key: 'A' | 'B') {
    const id = ids[key];
    await withOrgContext(prisma, org, async (tx) => {
      await tx.animal.create({
        data: { id: id.animal, organizationId: org, name: `Animal ${key}`, species: 'dog' },
      });
      await tx.custodyResponsible.create({
        data: {
          id: id.responsible,
          organizationId: org,
          fullName: `Responsable ${key}`,
          documentType: 'CC',
          documentNumber: '1000000001',
          createdByUserId: user,
        },
      });
      await tx.animalIntake.create({
        data: {
          organizationId: org,
          animalId: id.animal,
          responsibleId: id.responsible,
          intakeAt: new Date('2026-11-01T15:00:00Z'),
          reason: 'boarding',
          physicalCondition: 'Sin novedades visibles.',
          receivedByName: 'Equipo',
          createdByUserId: user,
        },
      });
      await tx.custodyContractTemplate.create({
        data: {
          organizationId: org,
          templateKey: randomUUID(),
          version: 1,
          name: `Plantilla ${key}`,
          clauses: [],
          createdByUserId: user,
          createdByName: 'Equipo',
        },
      });
      await tx.custodyContract.create({
        data: {
          id: id.contract,
          organizationId: org,
          animalId: id.animal,
          responsibleId: id.responsible,
          number: 'GC-2026-0001',
          templateName: 'Base',
          startDate: new Date('2026-11-01'),
          monthlyFeeCop: 100_000,
          representative: {},
          clauses: [],
          createdByUserId: user,
        },
      });
      await tx.custodyCharge.create({
        data: {
          id: id.charge,
          organizationId: org,
          animalId: id.animal,
          responsibleId: id.responsible,
          concept: 'boarding_fee',
          description: 'Mensualidad',
          amountCop: 100_000,
          dueDate: new Date('2026-11-05'),
          createdByUserId: user,
        },
      });
      await tx.custodyChargeExtension.create({
        data: {
          organizationId: org,
          chargeId: id.charge,
          previousDueDate: new Date('2026-11-05'),
          newDueDate: new Date('2026-11-20'),
          reason: 'Acuerdo',
          authorizedByUserId: user,
          authorizedByName: 'Equipo',
        },
      });
      await tx.custodyPayment.create({
        data: {
          organizationId: org,
          chargeId: id.charge,
          receiptNumber: 'RP-2026-000001',
          amountCop: 10_000,
          paidOn: new Date('2026-11-06'),
          method: 'cash',
          receivedByUserId: user,
          receivedByName: 'Equipo',
        },
      });
      const link = await tx.custodyPaymentLink.create({
        data: {
          organizationId: org,
          chargeId: id.charge,
          token: randomBytes(32).toString('base64url'),
          createdByUserId: user,
        },
      });
      await tx.custodyOnlinePayment.create({
        data: {
          organizationId: org,
          chargeId: id.charge,
          linkId: link.id,
          collectionId: `af-${randomUUID().replace(/-/g, '').slice(0, 29)}`,
          amountCop: 20_000,
        },
      });
      await tx.custodyOnlinePaymentSettings.create({
        data: { organizationId: org, enabled: false },
      });
      await tx.custodyRelease.create({
        data: {
          organizationId: org,
          animalId: id.animal,
          releaseType: 'return_to_responsible',
          releasedAt: new Date('2026-11-10T15:00:00Z'),
          receivedByName: `Responsable ${key}`,
          conditionAtRelease: 'Sin novedades visibles.',
          deliveredByName: 'Equipo',
          createdByUserId: user,
        },
      });
      await tx.custodyDocument.create({
        data: {
          organizationId: org,
          animalId: id.animal,
          kind: 'other',
          title: `Documento ${key}`,
          source: 'uploaded',
          storageRef: `private/${org}/${randomUUID()}-doc.pdf`,
          contentType: 'application/pdf',
          sizeBytes: 10,
          sha256: 'a'.repeat(64),
          createdByUserId: user,
          createdByName: 'Equipo',
        },
      });
      await tx.custodyEvent.create({
        data: {
          organizationId: org,
          animalId: id.animal,
          type: 'note',
          summary: `Nota ${key}`,
          occurredAt: new Date(),
          actorUserId: user,
          actorName: 'Equipo',
        },
      });
    });
  }

  beforeAll(async () => {
    await prisma.$connect();
    await admin.organization.createMany({
      data: [
        { id: orgA, name: 'Custodia A' },
        { id: orgB, name: 'Custodia B' },
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

  const tables = [
    'custodyResponsible',
    'animalIntake',
    'custodyContractTemplate',
    'custodyContract',
    'custodyCharge',
    'custodyChargeExtension',
    'custodyPayment',
    'custodyRelease',
    'custodyDocument',
    'custodyEvent',
    'custodyPaymentLink',
    'custodyOnlinePayment',
    'custodyOnlinePaymentSettings',
  ] as const;

  type Finder = { findMany: () => Promise<Array<{ organizationId: string }>> };

  it('no-leak: each organization sees only its own custody rows, in every table', async () => {
    for (const org of [orgA, orgB]) {
      for (const table of tables) {
        const rows = await withOrgContext(prisma, org, (tx) =>
          (tx[table] as unknown as Finder).findMany(),
        );
        expect(rows.length).toBeGreaterThan(0);
        expect(rows.every((r) => r.organizationId === org)).toBe(true);
      }
    }
  });

  it('no-leak: with no tenant context nothing is visible', async () => {
    for (const table of tables) {
      const rows = await (prisma[table] as unknown as Finder).findMany();
      expect(rows).toHaveLength(0);
    }
  });

  it('no-leak: WITH CHECK blocks writing into another organization', async () => {
    await expect(
      withOrgContext(prisma, orgA, (tx) =>
        tx.custodyEvent.create({
          data: {
            organizationId: orgB,
            animalId: ids.B.animal,
            type: 'note',
            summary: 'Intruso',
            occurredAt: new Date(),
            actorUserId: user,
            actorName: 'Intruso',
          },
        }),
      ),
    ).rejects.toThrow();
    const touched = await withOrgContext(prisma, orgA, (tx) =>
      tx.custodyCharge.updateMany({ where: { id: ids.B.charge }, data: { status: 'cancelled' } }),
    );
    expect(touched.count).toBe(0);
    const contract = await withOrgContext(prisma, orgA, (tx) =>
      tx.custodyContract.findUnique({ where: { id: ids.B.contract } }),
    );
    expect(contract).toBeNull();
  });

  it('no-leak: the public lookups only tell which organization owns a link or a reference', async () => {
    const [linkA, attemptA] = await withOrgContext(
      prisma,
      orgA,
      async (tx) =>
        [
          await tx.custodyPaymentLink.findFirstOrThrow(),
          await tx.custodyOnlinePayment.findFirstOrThrow(),
        ] as const,
    );
    const owner = async (sql: Prisma.Sql) =>
      (await prisma.$queryRaw<{ id: string | null }[]>(sql))[0]?.id ?? null;
    expect(await owner(Prisma.sql`SELECT custody_payment_link_owner(${linkA.token}) AS id`)).toBe(
      orgA,
    );
    expect(
      await owner(Prisma.sql`SELECT custody_online_payment_owner(${attemptA.collectionId}) AS id`),
    ).toBe(orgA);
    // Un valor desconocido o con otra forma no devuelve nada.
    expect(
      await owner(Prisma.sql`SELECT custody_payment_link_owner(${'z'.repeat(43)}) AS id`),
    ).toBeNull();
    expect(
      await owner(Prisma.sql`SELECT custody_payment_link_owner(${"' OR 1=1 --"}) AS id`),
    ).toBeNull();
    expect(
      await owner(Prisma.sql`SELECT custody_online_payment_owner(${'af-nope0000'}) AS id`),
    ).toBeNull();
    // Un enlace revocado deja de resolver.
    await withOrgContext(prisma, orgA, (tx) =>
      tx.custodyPaymentLink.update({ where: { id: linkA.id }, data: { revokedAt: new Date() } }),
    );
    expect(
      await owner(Prisma.sql`SELECT custody_payment_link_owner(${linkA.token}) AS id`),
    ).toBeNull();
    // La base no deja encender el pago en línea sin la aceptación registrada.
    await expect(
      withOrgContext(prisma, orgA, (tx) =>
        tx.custodyOnlinePaymentSettings.update({
          where: { organizationId: orgA },
          data: { enabled: true },
        }),
      ),
    ).rejects.toThrow();
  });

  it('no-leak: the app role cannot delete custody rows nor rewrite what was issued', async () => {
    for (const table of tables) {
      await expect(
        withOrgContext(prisma, orgA, (tx) =>
          (tx[table] as unknown as { deleteMany: () => Promise<unknown> }).deleteMany(),
        ),
      ).rejects.toThrow();
    }
    await expect(
      withOrgContext(prisma, orgA, (tx) =>
        tx.custodyCharge.update({ where: { id: ids.A.charge }, data: { amountCop: 1 } }),
      ),
    ).rejects.toThrow();
    await expect(
      withOrgContext(prisma, orgA, (tx) => tx.custodyEvent.updateMany({ data: { summary: 'x' } })),
    ).rejects.toThrow();
  });
});
