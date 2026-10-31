import { randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { purgeOrganizations } from './support/cleanup';

/**
 * RNF03 gate para la campana de pendientes (`notification_reads`): una org
 * nunca ve ni escribe las marcas de leído de otra. Conecta como
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

describe('RLS cross-org no-leak (notification_reads)', () => {
  const prisma = new PrismaClient({ datasources: { db: { url: APP_DATABASE_URL } } });
  const admin = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  const orgA = randomUUID();
  const orgB = randomUUID();
  const userA = randomUUID();
  const userB = randomUUID();

  beforeAll(async () => {
    await prisma.$connect();
    await admin.organization.createMany({
      data: [
        { id: orgA, name: 'Org A' },
        { id: orgB, name: 'Org B' },
      ],
    });
    await admin.user.createMany({
      data: [
        {
          id: userA,
          organizationId: orgA,
          accountType: 'organization',
          email: `a-${orgA}@t.local`,
          displayName: 'A',
        },
        {
          id: userB,
          organizationId: orgB,
          accountType: 'organization',
          email: `b-${orgB}@t.local`,
          displayName: 'B',
        },
      ],
    });
    await withOrgContext(prisma, orgA, (tx) =>
      tx.notificationRead.create({
        data: { organizationId: orgA, userId: userA, itemKey: 'adoptions' },
      }),
    );
    await withOrgContext(prisma, orgB, (tx) =>
      tx.notificationRead.create({
        data: { organizationId: orgB, userId: userB, itemKey: 'rejected' },
      }),
    );
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await purgeOrganizations(admin, [orgA, orgB]);
    await admin.$disconnect();
  });

  it('no-leak: Org A sees only its own read marks, never Org B', async () => {
    const rows = await withOrgContext(prisma, orgA, (tx) => tx.notificationRead.findMany());
    expect(rows.map((r) => r.itemKey)).toEqual(['adoptions']);
  });

  it('no-leak: Org B sees only its own read marks (inverse)', async () => {
    const rows = await withOrgContext(prisma, orgB, (tx) => tx.notificationRead.findMany());
    expect(rows.map((r) => r.itemKey)).toEqual(['rejected']);
  });

  it('no-leak: with no tenant context, no read mark is visible', async () => {
    expect(await prisma.notificationRead.findMany()).toHaveLength(0);
  });

  it('no-leak: WITH CHECK blocks writing a mark for another org than the context', async () => {
    await expect(
      withOrgContext(prisma, orgA, (tx) =>
        tx.notificationRead.create({
          data: { organizationId: orgB, userId: userB, itemKey: 'expiring' },
        }),
      ),
    ).rejects.toThrow();
  });

  it('rejects an item key outside the known format', async () => {
    await expect(
      withOrgContext(prisma, orgA, (tx) =>
        tx.notificationRead.create({
          data: { organizationId: orgA, userId: userA, itemKey: 'cualquier-cosa' },
        }),
      ),
    ).rejects.toThrow();
  });
});
