import { randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { purgeOrganizations } from './support/cleanup';

/**
 * RNF03 gate · Comunidad, Negocios aliados: community_business_accounts,
 * community_business_benefits y community_benefit_passes. Conecta como el rol
 * NO superusuario de la app. Además prueba que la app no puede auto-aprobar un
 * beneficio, ni colgarlo del perfil de otro tenant, ni tocar la tabla de pases.
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
  benefitId: string;
}

async function seed(prisma: PrismaClient, orgId: string, tag: string): Promise<Seeded> {
  return withOrgContext(prisma, orgId, async (tx) => {
    const userId = randomUUID();
    await tx.businessAccount.create({ data: { organizationId: orgId, userId } });
    const listing = await tx.serviceListing.create({
      data: {
        organizationId: orgId,
        createdByUserId: userId,
        category: 'grooming',
        name: `Peluquería ${tag}`,
        department: 'Antioquia',
        city: 'Medellín',
      },
    });
    const benefit = await tx.businessBenefit.create({
      data: {
        organizationId: orgId,
        listingId: listing.id,
        createdByUserId: userId,
        title: `Baño gratis ${tag}`,
      },
    });
    return { listingId: listing.id, benefitId: benefit.id };
  });
}

describe('RLS (community_business_accounts, community_business_benefits, community_benefit_passes)', () => {
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
        { id: orgA, name: 'Negocio A' },
        { id: orgB, name: 'Negocio B' },
      ],
      skipDuplicates: true,
    });
    seededA = await seed(prisma, orgA, 'A');
    seededB = await seed(prisma, orgB, 'B');
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await purgeOrganizations(admin, [orgA, orgB]);
    await admin.$disconnect();
  });

  it('no-leak: Org A sees only its own business account and benefits', async () => {
    await withOrgContext(prisma, orgA, async (tx) => {
      const accounts = await tx.businessAccount.findMany();
      const benefits = await tx.businessBenefit.findMany();
      expect(accounts.map((a) => a.organizationId)).toEqual([orgA]);
      expect(benefits.map((b) => b.id)).toEqual([seededA.benefitId]);
    });
  });

  it('no-leak: with no tenant context, nothing is visible', async () => {
    expect(await prisma.businessAccount.findMany()).toHaveLength(0);
    expect(await prisma.businessBenefit.findMany()).toHaveLength(0);
  });

  it('no-leak: Org A cannot hang a benefit on Org B listing, nor write as Org B', async () => {
    await expect(
      withOrgContext(prisma, orgA, (tx) =>
        tx.businessBenefit.create({
          data: {
            organizationId: orgA,
            listingId: seededB.listingId,
            createdByUserId: randomUUID(),
            title: 'Cruce de tenants',
          },
        }),
      ),
    ).rejects.toThrow();
    await expect(
      withOrgContext(prisma, orgA, (tx) =>
        tx.businessBenefit.create({
          data: {
            organizationId: orgB,
            listingId: seededB.listingId,
            createdByUserId: randomUUID(),
            title: 'Cruce de tenants',
          },
        }),
      ),
    ).rejects.toThrow();
  });

  it('no-leak: Org A cannot update Org B benefits (0 rows affected)', async () => {
    await withOrgContext(prisma, orgA, async (tx) => {
      const res = await tx.businessBenefit.updateMany({
        where: { id: seededB.benefitId },
        data: { title: 'Secuestrado' },
      });
      expect(res.count).toBe(0);
    });
  });

  it('no-leak: a benefit is born pending and its status is not writable by the app', async () => {
    const row = await withOrgContext(prisma, orgA, (tx) =>
      tx.businessBenefit.create({
        data: {
          organizationId: orgA,
          listingId: seededA.listingId,
          createdByUserId: randomUUID(),
          title: 'Auto aprobado',
          status: 'approved',
        },
      }),
    );
    expect(row.status).toBe('pending');
    await expect(
      withOrgContext(prisma, orgA, (tx) =>
        tx.businessBenefit.update({ where: { id: row.id }, data: { status: 'approved' } }),
      ),
    ).rejects.toThrow();
  });

  it('no-leak: the app role has no privilege at all on the passes table', async () => {
    await expect(withOrgContext(prisma, orgA, (tx) => tx.benefitPass.findMany())).rejects.toThrow(
      /permission denied/i,
    );
  });
});
