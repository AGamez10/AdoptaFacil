import { randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { purgeOrganizations } from './support/cleanup';

/**
 * RNF03 gate for web push subscriptions (notificaciones push VAPID): cada
 * suscripción vive en el tenant de su persona. El envío a otra cuenta solo
 * devuelve endpoints de la persona pedida. Conecta como el rol de app (no
 * superusuario). Todo test lleva "no-leak" para el gate `test:rls`.
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

describe('RLS cross-org no-leak (push_subscriptions)', () => {
  const prisma = new PrismaClient({ datasources: { db: { url: APP_DATABASE_URL } } });
  const admin = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  const orgA = randomUUID();
  const orgB = randomUUID();
  const userA = randomUUID();
  const userB = randomUUID();
  const endpointA = `https://push.example.test/a-${randomUUID()}`;
  const endpointB = `https://push.example.test/b-${randomUUID()}`;

  beforeAll(async () => {
    await prisma.$connect();
    await admin.organization.createMany({
      data: [
        { id: orgA, name: 'Org A' },
        { id: orgB, name: 'Org B' },
      ],
      skipDuplicates: true,
    });
    await admin.user.create({
      data: {
        id: userA,
        organizationId: orgA,
        accountType: 'organization',
        email: `a-${userA}@test.local`,
        displayName: 'A',
      },
    });
    await admin.user.create({
      data: {
        id: userB,
        organizationId: orgB,
        accountType: 'organization',
        email: `b-${userB}@test.local`,
        displayName: 'B',
      },
    });
    await withOrgContext(prisma, orgA, (tx) =>
      tx.pushSubscription.create({
        data: {
          organizationId: orgA,
          userId: userA,
          endpoint: endpointA,
          p256dh: 'p256dh-a-key-value',
          auth: 'auth-a',
        },
      }),
    );
    await withOrgContext(prisma, orgB, (tx) =>
      tx.pushSubscription.create({
        data: {
          organizationId: orgB,
          userId: userB,
          endpoint: endpointB,
          p256dh: 'p256dh-b-key-value',
          auth: 'auth-b',
        },
      }),
    );
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await purgeOrganizations(admin, [orgA, orgB]);
    await admin.$disconnect();
  });

  it('no-leak: Org A never lists the subscriptions of Org B', async () => {
    const rows = await withOrgContext(prisma, orgA, (tx) => tx.pushSubscription.findMany());
    expect(rows.every((r) => r.organizationId === orgA)).toBe(true);
    expect(rows.some((r) => r.endpoint === endpointB)).toBe(false);
  });

  it('no-leak: Org A cannot write a subscription into Org B', async () => {
    await expect(
      withOrgContext(prisma, orgA, (tx) =>
        tx.pushSubscription.create({
          data: {
            organizationId: orgB,
            userId: userB,
            endpoint: `https://push.example.test/x-${randomUUID()}`,
            p256dh: 'p256dh-x-key-value',
            auth: 'auth-x',
          },
        }),
      ),
    ).rejects.toThrow();
  });

  it("no-leak: the per-user function returns only that person's endpoints", async () => {
    const rows = await withOrgContext(prisma, orgA, (tx) =>
      tx.$queryRaw<Array<{ endpoint: string }>>(
        Prisma.sql`SELECT * FROM push_subscriptions_for_user(${userA}::uuid)`,
      ),
    );
    expect(rows.map((r) => r.endpoint)).toEqual([endpointA]);
  });
});
