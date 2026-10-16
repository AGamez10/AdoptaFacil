import { randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { purgeOrganizations } from './support/cleanup';

/**
 * RNF03 gate · Comunidad, primer corte del ecosistema:
 * community_service_listings, community_service_listing_reviews,
 * community_pet_profiles. Conecta como el rol NO superusuario de la app.
 * Además prueba que la app no puede auto-aprobar un perfil (GRANT por columna)
 * ni escribir reseñas directo (solo vía función SECURITY DEFINER).
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

interface Seeded {
  listingId: string;
  petId: string;
}

async function seed(prisma: PrismaClient, orgId: string, tag: string): Promise<Seeded> {
  return withOrgContext(prisma, orgId, async (tx) => {
    const listing = await tx.serviceListing.create({
      data: {
        organizationId: orgId,
        createdByUserId: randomUUID(),
        category: 'veterinary',
        name: `Veterinaria ${tag}`,
        department: 'Antioquia',
        city: 'Medellín',
      },
    });
    const pet = await tx.petProfile.create({
      data: {
        organizationId: orgId,
        ownerUserId: randomUUID(),
        name: `Luna ${tag}`,
        species: 'dog',
      },
    });
    return { listingId: listing.id, petId: pet.id };
  });
}

describe('RLS (community_service_listings, community_service_listing_reviews, community_pet_profiles)', () => {
  const prisma = new PrismaClient({ datasources: { db: { url: APP_DATABASE_URL } } });
  const admin = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  const orgA = randomUUID();
  const orgB = randomUUID();
  let seededA: Seeded;
  let seededB: Seeded;

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.organization.createMany({
      data: [
        { id: orgA, name: 'Org A' },
        { id: orgB, name: 'Org B' },
      ],
      skipDuplicates: true,
    });
    seededA = await seed(prisma, orgA, 'A');
    seededB = await seed(prisma, orgB, 'B');
    // B's listing approved and reviewed (superuser seeds the moderation state).
    await admin.serviceListing.update({
      where: { id: seededB.listingId },
      data: { status: 'approved' },
    });
    await admin.serviceListingReview.create({
      data: {
        organizationId: orgB,
        listingId: seededB.listingId,
        authorUserId: randomUUID(),
        authorName: 'Ana',
        rating: 5,
      },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await purgeOrganizations(admin, [orgA, orgB]);
    await admin.$disconnect();
  });

  it('no-leak: Org A sees only its own listings, reviews and pets, never Org B', async () => {
    await withOrgContext(prisma, orgA, async (tx) => {
      const listings = await tx.serviceListing.findMany();
      const reviews = await tx.serviceListingReview.findMany();
      const pets = await tx.petProfile.findMany();
      expect(listings.map((r) => r.id)).toEqual([seededA.listingId]);
      expect(reviews).toHaveLength(0);
      expect(pets.map((r) => r.id)).toEqual([seededA.petId]);
    });
  });

  it('no-leak: with no tenant context, nothing is visible in any table', async () => {
    expect(await prisma.serviceListing.findMany()).toHaveLength(0);
    expect(await prisma.serviceListingReview.findMany()).toHaveLength(0);
    expect(await prisma.petProfile.findMany()).toHaveLength(0);
  });

  it('no-leak: WITH CHECK blocks writing a listing or a pet for another org', async () => {
    await expect(
      withOrgContext(prisma, orgA, (tx) =>
        tx.serviceListing.create({
          data: {
            organizationId: orgB,
            createdByUserId: randomUUID(),
            category: 'grooming',
            name: 'Cruce',
            department: 'Antioquia',
            city: 'Medellín',
          },
        }),
      ),
    ).rejects.toThrow();
    await expect(
      withOrgContext(prisma, orgA, (tx) =>
        tx.petProfile.create({
          data: { organizationId: orgB, ownerUserId: randomUUID(), name: 'X', species: 'cat' },
        }),
      ),
    ).rejects.toThrow();
  });

  it('no-leak: Org A cannot update or delete Org B rows (0 rows affected)', async () => {
    await withOrgContext(prisma, orgA, async (tx) => {
      const listing = await tx.serviceListing.updateMany({
        where: { id: seededB.listingId },
        data: { name: 'Secuestrado' },
      });
      const pet = await tx.petProfile.deleteMany({ where: { id: seededB.petId } });
      expect(listing.count).toBe(0);
      expect(pet.count).toBe(0);
    });
  });

  it('no-leak: the app role cannot self-approve a listing (status is not writable)', async () => {
    await expect(
      withOrgContext(prisma, orgA, (tx) =>
        tx.serviceListing.update({
          where: { id: seededA.listingId },
          data: { status: 'approved' },
        }),
      ),
    ).rejects.toThrow();
  });

  it('no-leak: the app role cannot mark its own listing as a partner', async () => {
    await expect(
      withOrgContext(prisma, orgA, (tx) =>
        tx.serviceListing.update({
          where: { id: seededA.listingId },
          data: { isPartner: true },
        }),
      ),
    ).rejects.toThrow();
  });

  it('no-leak: a listing inserted as approved or partner is forced back to pending, no partner', async () => {
    const row = await withOrgContext(prisma, orgA, (tx) =>
      tx.serviceListing.create({
        data: {
          organizationId: orgA,
          createdByUserId: randomUUID(),
          category: 'walking',
          name: 'Paseos auto-aprobados',
          department: 'Antioquia',
          city: 'Medellín',
          status: 'approved',
          isPartner: true,
          partnerSince: new Date(),
        },
      }),
    );
    expect(row.status).toBe('pending');
    expect(row.isPartner).toBe(false);
    expect(row.partnerSince).toBeNull();
  });

  it('no-leak: the app role cannot write reviews directly', async () => {
    await expect(
      withOrgContext(prisma, orgB, (tx) =>
        tx.serviceListingReview.create({
          data: {
            organizationId: orgB,
            listingId: seededB.listingId,
            authorUserId: randomUUID(),
            authorName: 'Falsa',
            rating: 5,
          },
        }),
      ),
    ).rejects.toThrow();
  });

  it('no-leak: the public directory exposes only approved listings', async () => {
    const rows = await prisma.$queryRaw<Array<{ data: { items: Array<{ id: string }> } }>>(
      Prisma.sql`SELECT public_service_listings(50, 0, NULL, 'medellín') AS data`,
    );
    const ids = rows[0].data.items.map((i) => i.id);
    expect(ids).toContain(seededB.listingId);
    expect(ids).not.toContain(seededA.listingId);
  });
});
