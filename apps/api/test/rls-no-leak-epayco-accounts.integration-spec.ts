import { randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { purgeOrganizations } from './support/cleanup';

/**
 * RNF03 gate for `organization_epayco_accounts` (ADR-PAG-002): tenant-isolated
 * (no cross-org visibility, write or delete), one ePayco account per org, and
 * the merchant→organization lookup exposes ONLY the organization id. Connects
 * as the NON-SUPERUSER `adoptafacil_app` role. Every test name carries
 * "no-leak" so `test:rls` (-t "no-leak") runs it. Superuser only for teardown.
 *
 * RETIRADA: ePayco salió del producto el 2026-10-29 y ningún código usa la
 * tabla, pero mientras exista (guarda llaves cifradas) su RLS se sigue
 * probando. Este archivo se borra junto con la migración que la elimina.
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

describe('RLS (organization_epayco_accounts)', () => {
  const prisma = new PrismaClient({ datasources: { db: { url: APP_DATABASE_URL } } });
  const admin = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  const orgA = randomUUID();
  const orgB = randomUUID();
  // Unique per run so a leftover row never collides on the UNIQUE cust_id.
  const custA = String(Date.now()).slice(-9) + '1';
  const custB = String(Date.now()).slice(-9) + '2';

  const account = (organizationId: string, custId: string, tag: string) => ({
    organizationId,
    custId,
    publicKey: `public-${tag}`,
    pKeyEnc: `enc-p-key-${tag}`,
    privateKeyEnc: `enc-private-${tag}`,
  });

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
      tx.organizationEpaycoAccount.create({ data: account(orgA, custA, 'A') }),
    );
    await withOrgContext(prisma, orgB, (tx) =>
      tx.organizationEpaycoAccount.create({ data: account(orgB, custB, 'B') }),
    );
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await purgeOrganizations(admin, [orgA, orgB]);
    await admin.$disconnect();
  });

  it('no-leak: Org A sees only its own ePayco account, never Org B (including the encrypted keys)', async () => {
    const rows = await withOrgContext(prisma, orgA, (tx) =>
      tx.organizationEpaycoAccount.findMany(),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].organizationId).toBe(orgA);
    expect(rows.some((r) => r.pKeyEnc.endsWith('-B'))).toBe(false);
  });

  it('no-leak: Org B sees only its own ePayco account (inverse)', async () => {
    const rows = await withOrgContext(prisma, orgB, (tx) =>
      tx.organizationEpaycoAccount.findMany(),
    );
    expect(rows.map((r) => r.organizationId)).toEqual([orgB]);
  });

  it('no-leak: with no tenant context, nothing is visible', async () => {
    expect(await prisma.organizationEpaycoAccount.findMany()).toHaveLength(0);
  });

  it('no-leak: WITH CHECK blocks writing an account for another org', async () => {
    await expect(
      withOrgContext(prisma, orgA, (tx) =>
        tx.organizationEpaycoAccount.create({ data: account(orgB, '7000001', 'hijack') }),
      ),
    ).rejects.toThrow();
  });

  it("no-leak: Org A cannot update or delete Org B's account", async () => {
    await withOrgContext(prisma, orgA, async (tx) => {
      await tx.organizationEpaycoAccount.updateMany({
        where: { organizationId: orgB },
        data: { publicKey: 'hijacked' },
      });
      await tx.organizationEpaycoAccount.deleteMany({ where: { organizationId: orgB } });
    });
    const survives = await withOrgContext(prisma, orgB, (tx) =>
      tx.organizationEpaycoAccount.findUnique({ where: { organizationId: orgB } }),
    );
    expect(survives?.publicKey).toBe('public-B');
  });

  it('no-leak: one ePayco account cannot back two organizations (UNIQUE cust_id, even across tenants)', async () => {
    const otherOrg = randomUUID();
    await prisma.organization.create({ data: { id: otherOrg, name: 'Org C' } });
    try {
      await expect(
        withOrgContext(prisma, otherOrg, (tx) =>
          tx.organizationEpaycoAccount.create({ data: account(otherOrg, custA, 'C') }),
        ),
      ).rejects.toThrow();
    } finally {
      await purgeOrganizations(admin, [otherOrg]);
    }
  });

  it('no-leak: the merchant→organization lookup returns only the organization id', async () => {
    const rows = await prisma.$queryRaw<Record<string, unknown>[]>(
      Prisma.sql`SELECT * FROM epayco_account_organization_id(${custA})`,
    );
    expect(rows).toEqual([{ organization_id: orgA }]);
    const none = await prisma.$queryRaw<Record<string, unknown>[]>(
      Prisma.sql`SELECT * FROM epayco_account_organization_id(${'0'})`,
    );
    expect(none).toEqual([]);
  });

  it('no-leak: the lookup function is SECURITY DEFINER with a fixed search_path and not executable by PUBLIC', async () => {
    const rows = await admin.$queryRaw<
      { prosecdef: boolean; proconfig: string[] | null; public_exec: boolean }[]
    >(Prisma.sql`
      SELECT p.prosecdef, p.proconfig,
             has_function_privilege('public', p.oid, 'EXECUTE') AS public_exec
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'epayco_account_organization_id'
    `);
    expect(rows).toHaveLength(1);
    expect(rows[0].prosecdef).toBe(true);
    expect(rows[0].proconfig).toEqual(['search_path=public, pg_temp']);
    expect(rows[0].public_exec).toBe(false);
  });
});
