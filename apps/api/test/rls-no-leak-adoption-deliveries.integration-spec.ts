import { randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { purgeOrganizations } from './support/cleanup';

/**
 * RNF03 gate extended to the delivery act (`adoption_deliveries`, ajuste 6): it
 * belongs to the owning organization and must never be visible under another
 * org's context. Connects as the NON-SUPERUSER `adoptafacil_app` role. Every test
 * name contains "no-leak" so the `test:rls` gate (-t "no-leak") runs it.
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

/** Seed request → signed contract → pending delivery for `organizationId`. */
async function seedDelivery(
  prisma: PrismaClient,
  organizationId: string,
  tag: string,
): Promise<void> {
  await withOrgContext(prisma, organizationId, async (tx) => {
    const animalId = randomUUID();
    const adopterUserId = randomUUID();
    const req = await tx.adoptionRequest.create({
      data: {
        organizationId,
        animalId,
        animalSnapshot: { animalId, name: tag, species: 'dog' },
        applicantUserId: adopterUserId,
        applicant: { fullName: tag, email: `${tag}@test.local` },
        message: `Solicitud ${tag} con un mensaje suficientemente largo para pasar la validación.`,
      },
    });
    const contract = await tx.adoptionContract.create({
      data: {
        organizationId,
        requestId: req.id,
        animalId,
        version: 1,
        status: 'signed',
        signers: [{ id: randomUUID(), role: 'adopter', fullName: tag, email: 'x@test.local' }],
        payload: { requestId: req.id, organizationId, animalId, terms: tag },
      },
    });
    await tx.adoptionDelivery.create({
      data: {
        id: randomUUID(),
        organizationId,
        contractId: contract.id,
        requestId: req.id,
        animalId,
        adopterUserId,
        adopterName: tag,
        adopterEmail: `${tag}@test.local`,
        animalName: tag,
        details: { healthStatus: tag },
        record: { animal: { name: tag } },
        milestonePlan: [],
        contentHash: 'a'.repeat(64),
        createdByUserId: adopterUserId,
      },
    });
  });
}

describe('RLS cross-org no-leak (adoption deliveries)', () => {
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
    await seedDelivery(prisma, orgA, 'secret-A');
    await seedDelivery(prisma, orgB, 'secret-B');
  });

  afterAll(async () => {
    await purgeOrganizations(admin, [orgA, orgB]);
    await prisma.$disconnect();
    await admin.$disconnect();
  });

  it('no-leak: Org A sees only its own deliveries, never Org B', async () => {
    const rows = await withOrgContext(prisma, orgA, (tx) =>
      tx.adoptionDelivery.findMany({ select: { organizationId: true } }),
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.organizationId === orgA)).toBe(true);
  });

  it('no-leak: Org B sees only its own deliveries, never Org A (inverse)', async () => {
    const rows = await withOrgContext(prisma, orgB, (tx) =>
      tx.adoptionDelivery.findMany({ select: { organizationId: true } }),
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.organizationId === orgB)).toBe(true);
  });

  it('no-leak: Org A cannot write a delivery into Org B', async () => {
    await expect(
      withOrgContext(prisma, orgA, (tx) =>
        tx.adoptionDelivery.updateMany({
          where: { organizationId: orgB },
          data: { animalName: 'hijacked' },
        }),
      ),
    ).resolves.toEqual({ count: 0 });
  });

  it('no-leak: with no org context set, no delivery is visible', async () => {
    expect(await prisma.adoptionDelivery.findMany()).toHaveLength(0);
  });
});
