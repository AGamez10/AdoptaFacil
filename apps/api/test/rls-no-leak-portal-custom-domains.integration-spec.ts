import { randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { purgeOrganizations } from './support/cleanup';

/**
 * RNF03 gate para el dominio propio (`portal_custom_domains`): una org nunca
 * ve ni escribe la solicitud de otra (ni su código de verificación). Conecta
 * como `adoptafacil_app` (no superusuario). Cada nombre lleva "no-leak".
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

describe('RLS cross-org no-leak (portal_custom_domains)', () => {
  const prisma = new PrismaClient({ datasources: { db: { url: APP_DATABASE_URL } } });
  const admin = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  const orgA = randomUUID();
  const orgB = randomUUID();
  const suffix = orgA.slice(0, 8);

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.organization.createMany({
      data: [
        { id: orgA, name: 'Org A' },
        { id: orgB, name: 'Org B' },
      ],
      skipDuplicates: true,
    });
    for (const [org, label] of [
      [orgA, 'a'],
      [orgB, 'b'],
    ] as const) {
      await withOrgContext(prisma, org, (tx) =>
        tx.portalCustomDomain.create({
          data: {
            id: randomUUID(),
            organizationId: org,
            domain: `www.${label}-${suffix}.org`,
            verificationToken: `token-${label}`,
          },
        }),
      );
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await purgeOrganizations(admin, [orgA, orgB]);
    await admin.$disconnect();
  });

  it('no-leak: Org A sees only its own domain request, never Org B (and inverse)', async () => {
    const a = await withOrgContext(prisma, orgA, (tx) => tx.portalCustomDomain.findMany());
    expect(a.map((r) => r.verificationToken)).toEqual(['token-a']);
    const b = await withOrgContext(prisma, orgB, (tx) => tx.portalCustomDomain.findMany());
    expect(b.map((r) => r.verificationToken)).toEqual(['token-b']);
  });

  it('no-leak: with no tenant context, nothing is visible', async () => {
    expect(await prisma.portalCustomDomain.findMany()).toHaveLength(0);
  });

  it('no-leak: WITH CHECK blocks activating another org domain', async () => {
    await expect(
      withOrgContext(prisma, orgA, (tx) =>
        tx.portalCustomDomain.update({
          where: { organizationId: orgB },
          data: { status: 'active' },
        }),
      ),
    ).rejects.toThrow();
    await expect(
      withOrgContext(prisma, orgA, (tx) =>
        tx.portalCustomDomain.create({
          data: {
            id: randomUUID(),
            organizationId: orgB,
            domain: `www.c-${suffix}.org`,
            verificationToken: 'x',
          },
        }),
      ),
    ).rejects.toThrow();
  });
});
