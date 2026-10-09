import { randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { purgeOrganizations } from './support/cleanup';

/**
 * RNF03 gate extended to the plan subscription (`organization_subscriptions`): a subscription
 * belongs to one organization and must never be visible under another org's
 * context. Connects as the NON-SUPERUSER `adoptafacil_app` role. Every test name
 * contains "no-leak" so the `test:rls` gate (-t "no-leak") runs it. A superuser
 * client is used only for teardown.
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

describe('RLS cross-org no-leak (organization_subscriptions)', () => {
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
    await withOrgContext(prisma, orgA, (tx) =>
      tx.organizationSubscription.create({
        data: { organizationId: orgA, plan: 'crece', status: 'active' },
      }),
    );
    await withOrgContext(prisma, orgB, (tx) =>
      tx.organizationSubscription.create({
        data: { organizationId: orgB, plan: 'pro', status: 'trialing' },
      }),
    );
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await purgeOrganizations(admin, [orgA, orgB]);
    await admin.$disconnect();
  });

  it('no-leak: Org A sees only its own subscription, never Org B', async () => {
    const rows = await withOrgContext(prisma, orgA, (tx) => tx.organizationSubscription.findMany());
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.organizationId === orgA)).toBe(true);
  });

  it('no-leak: Org B sees only its own subscription, never Org A (inverse)', async () => {
    const rows = await withOrgContext(prisma, orgB, (tx) => tx.organizationSubscription.findMany());
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.organizationId === orgB)).toBe(true);
  });

  it('no-leak: with no tenant context, no subscriptions are visible', async () => {
    const rows = await prisma.organizationSubscription.findMany();
    expect(rows).toHaveLength(0);
  });

  it('no-leak: Org A cannot update Org B subscription (0 rows affected)', async () => {
    const result = await withOrgContext(prisma, orgA, (tx) =>
      tx.organizationSubscription.updateMany({
        where: { organizationId: orgB },
        data: { plan: 'free' },
      }),
    );
    expect(result.count).toBe(0);
  });

  it('no-leak: WITH CHECK blocks writing a subscription for a different org than the context', async () => {
    await expect(
      withOrgContext(prisma, orgA, (tx) =>
        tx.organizationSubscription.create({
          data: { organizationId: orgB, plan: 'pro', status: 'active' },
        }),
      ),
    ).rejects.toThrow();
  });
});
