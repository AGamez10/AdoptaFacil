import { randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { purgeOrganizations } from './support/cleanup';

/**
 * RNF03 gate for `organization_email_usage` (contador mensual de correos con
 * la marca de la organización). Connects as the NON-SUPERUSER
 * `adoptafacil_app` role; every test name contains "no-leak".
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

describe('RLS cross-org no-leak (organization_email_usage)', () => {
  const prisma = new PrismaClient({ datasources: { db: { url: APP_DATABASE_URL } } });
  const admin = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  const orgA = randomUUID();
  const orgB = randomUUID();

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.organization.createMany({
      data: [
        { id: orgA, name: 'Org A' },
        { id: orgB, name: 'Org B' },
      ],
      skipDuplicates: true,
    });
    for (const [org, count] of [
      [orgA, 7],
      [orgB, 3],
    ] as const) {
      await withOrgContext(prisma, org, (tx) =>
        tx.organizationEmailUsage.create({
          data: { organizationId: org, month: '2026-10', brandedCount: count },
        }),
      );
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await purgeOrganizations(admin, [orgA, orgB]);
    await admin.$disconnect();
  });

  it('no-leak: Org A sees only its own usage, never Org B', async () => {
    const rows = await withOrgContext(prisma, orgA, (tx) => tx.organizationEmailUsage.findMany());
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ organizationId: orgA, brandedCount: 7 });
  });

  it('no-leak: Org B cannot bump Org A counter (UPDATE matches nothing)', async () => {
    const result = await withOrgContext(prisma, orgB, (tx) =>
      tx.organizationEmailUsage.updateMany({
        where: { organizationId: orgA },
        data: { brandedCount: 0 },
      }),
    );
    expect(result.count).toBe(0);
    const a = await withOrgContext(prisma, orgA, (tx) => tx.organizationEmailUsage.findMany());
    expect(a[0].brandedCount).toBe(7);
  });

  it('no-leak: with no tenant context, no usage is visible', async () => {
    expect(await prisma.organizationEmailUsage.findMany()).toHaveLength(0);
  });

  it('no-leak: WITH CHECK blocks writing usage for a different org than the context', async () => {
    await expect(
      withOrgContext(prisma, orgA, (tx) =>
        tx.organizationEmailUsage.create({
          data: { organizationId: orgB, month: '2026-11', brandedCount: 1 },
        }),
      ),
    ).rejects.toThrow();
  });
});
