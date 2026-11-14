import { randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { newCoffeeCode } from '../src/modules/coffee/coffee-admin.service';
import { newCoffeeReference } from '../src/modules/coffee/coffee-public.service';
import { purgeOrganizations } from './support/cleanup';

/**
 * RNF03 gate para el café (presentaciones, lotes, pedidos, visitas y
 * entregas): un equipo nunca ve ni escribe lo de otro. Conecta como
 * `adoptafacil_app` (no superusuario). Cada nombre lleva "no-leak" para el
 * gate `test:rls`.
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

describe('RLS cross-org no-leak (café)', () => {
  const prisma = new PrismaClient({ datasources: { db: { url: APP_DATABASE_URL } } });
  const admin = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  const teamA = randomUUID();
  const teamB = randomUUID();
  const ids = {
    A: { product: randomUUID(), lot: randomUUID() },
    B: { product: randomUUID(), lot: randomUUID() },
  };

  async function seed(org: string, key: 'A' | 'B', code: string, ref: string) {
    await withOrgContext(prisma, org, async (tx) => {
      await tx.coffeeProduct.create({
        data: {
          id: ids[key].product,
          organizationId: org,
          code,
          name: `Café ${key}`,
          presentationGrams: 250,
          qrDomain: 'adoptafacil.org',
        },
      });
      await tx.coffeeLot.create({
        data: {
          id: ids[key].lot,
          organizationId: org,
          productId: ids[key].product,
          lotCode: 'L1',
          salePriceCop: 28_000,
          unitCostCop: 17_000,
          stockUnits: 10,
        },
      });
      await tx.coffeeOrder.create({
        data: {
          organizationId: org,
          lotId: ids[key].lot,
          reference: ref,
          quantity: 1,
          unitPriceCop: 28_000,
          shippingFeeCop: 0,
          totalCop: 28_000,
          contributionPerUnitCop: 2_200,
          contributionTotalCop: 2_200,
          campaignId: randomUUID(),
          campaignTitle: 'Campaña',
          campaignOrgName: 'Fundación',
          buyerName: `Comprador ${key}`,
          buyerEmail: `c-${key}@test.local`,
          buyerPhone: '3001234567',
          shippingAddress: 'Calle 1',
          shippingCity: 'Ibagué',
          shippingDepartment: 'Tolima',
          privacyAcceptedAt: new Date(),
          reservedUntil: new Date(Date.now() + 60_000),
        },
      });
      await tx.coffeeContributionDelivery.create({
        data: {
          organizationId: org,
          campaignId: randomUUID(),
          campaignTitle: 'Campaña',
          amountCop: 1_000,
          deliveredOn: new Date('2026-11-01'),
          evidence: 'Soporte',
        },
      });
    });
    await admin.coffeeVisitDay.create({
      data: {
        organizationId: org,
        productId: ids[key].product,
        day: new Date('2026-11-01'),
        source: 'qr',
        visits: 4,
      },
    });
  }

  const code = () => newCoffeeCode();

  beforeAll(async () => {
    await prisma.$connect();
    await admin.organization.createMany({
      data: [
        { id: teamA, name: 'Equipo A' },
        { id: teamB, name: 'Equipo B' },
      ],
    });
    await seed(teamA, 'A', code(), newCoffeeReference());
    await seed(teamB, 'B', code(), newCoffeeReference());
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await purgeOrganizations(admin, [teamA, teamB]);
    await admin.$disconnect();
  });

  const tables = [
    'coffeeProduct',
    'coffeeLot',
    'coffeeOrder',
    'coffeeVisitDay',
    'coffeeContributionDelivery',
  ] as const;

  it('no-leak: each team sees only its own coffee rows, in every table', async () => {
    for (const [team] of [[teamA], [teamB]]) {
      for (const table of tables) {
        const rows = (await withOrgContext(prisma, team, (tx) =>
          (
            tx[table] as unknown as { findMany: () => Promise<Array<{ organizationId: string }>> }
          ).findMany(),
        )) as Array<{ organizationId: string }>;
        expect(rows.length).toBeGreaterThan(0);
        expect(rows.every((r) => r.organizationId === team)).toBe(true);
      }
    }
  });

  it('no-leak: with no tenant context nothing is visible', async () => {
    for (const table of tables) {
      const rows = await (
        prisma[table] as unknown as { findMany: () => Promise<unknown[]> }
      ).findMany();
      expect(rows).toHaveLength(0);
    }
  });

  it('no-leak: WITH CHECK blocks writing into another team', async () => {
    await expect(
      withOrgContext(prisma, teamA, (tx) =>
        tx.coffeeProduct.create({
          data: {
            organizationId: teamB,
            code: code(),
            name: 'Intruso',
            presentationGrams: 250,
            qrDomain: 'adoptafacil.org',
          },
        }),
      ),
    ).rejects.toThrow();
    const touched = await withOrgContext(prisma, teamA, (tx) =>
      tx.coffeeLot.updateMany({ where: { id: ids.B.lot }, data: { stockUnits: 0 } }),
    );
    expect(touched.count).toBe(0);
  });

  it('no-leak: the app role cannot write visits, nor change or delete deliveries', async () => {
    await expect(
      withOrgContext(prisma, teamA, (tx) =>
        tx.coffeeVisitDay.create({
          data: {
            organizationId: teamA,
            productId: ids.A.product,
            day: new Date('2026-11-02'),
            source: 'web',
          },
        }),
      ),
    ).rejects.toThrow();
    await expect(
      withOrgContext(prisma, teamA, (tx) => tx.coffeeContributionDelivery.deleteMany({})),
    ).rejects.toThrow();
    await expect(
      withOrgContext(prisma, teamA, (tx) => tx.coffeeOrder.deleteMany({})),
    ).rejects.toThrow();
  });
});
