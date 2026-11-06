import { randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { purgeOrganizations } from './support/cleanup';

/**
 * RNF03 gate for `organization_mercadopago_connections` (ADR-PAG-003):
 * tenant-isolated (no cross-org visibility, write or delete), one Mercado
 * Pago account per org, and the renewal discovery function exposes ONLY
 * organization ids (never a token). Connects as the NON-SUPERUSER
 * `adoptafacil_app` role. Every test name carries "no-leak" so `test:rls`
 * runs it. Superuser only for teardown and catalog checks.
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

describe('RLS (organization_mercadopago_connections)', () => {
  const prisma = new PrismaClient({ datasources: { db: { url: APP_DATABASE_URL } } });
  const admin = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  const orgA = randomUUID();
  const orgB = randomUUID();
  // Unique per run so a leftover row never collides on the UNIQUE mp_user_id.
  const userA = String(Date.now()).slice(-9) + '1';
  const userB = String(Date.now()).slice(-9) + '2';

  const connection = (organizationId: string, mpUserId: string, tag: string, inDays = 2) => ({
    organizationId,
    mpUserId,
    accessTokenEnc: `enc-access-${tag}`,
    refreshTokenEnc: `enc-refresh-${tag}`,
    expiresAt: new Date(Date.now() + inDays * 24 * 60 * 60 * 1000),
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
      tx.organizationMercadoPagoConnection.create({ data: connection(orgA, userA, 'A') }),
    );
    await withOrgContext(prisma, orgB, (tx) =>
      tx.organizationMercadoPagoConnection.create({ data: connection(orgB, userB, 'B', 120) }),
    );
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await purgeOrganizations(admin, [orgA, orgB]);
    await admin.$disconnect();
  });

  it('no-leak: Org A sees only its own connection, never Org B (including the encrypted tokens)', async () => {
    const rows = await withOrgContext(prisma, orgA, (tx) =>
      tx.organizationMercadoPagoConnection.findMany(),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].organizationId).toBe(orgA);
    expect(rows.some((r) => r.accessTokenEnc.endsWith('-B'))).toBe(false);
  });

  it('no-leak: Org B sees only its own connection (inverse)', async () => {
    const rows = await withOrgContext(prisma, orgB, (tx) =>
      tx.organizationMercadoPagoConnection.findMany(),
    );
    expect(rows.map((r) => r.organizationId)).toEqual([orgB]);
  });

  it('no-leak: with no tenant context, nothing is visible', async () => {
    expect(await prisma.organizationMercadoPagoConnection.findMany()).toHaveLength(0);
  });

  it('no-leak: WITH CHECK blocks writing a connection for another org', async () => {
    await expect(
      withOrgContext(prisma, orgA, (tx) =>
        tx.organizationMercadoPagoConnection.create({
          data: connection(orgB, '7000001', 'hijack'),
        }),
      ),
    ).rejects.toThrow();
  });

  it("no-leak: Org A cannot update or delete Org B's connection", async () => {
    await withOrgContext(prisma, orgA, async (tx) => {
      await tx.organizationMercadoPagoConnection.updateMany({
        where: { organizationId: orgB },
        data: { accessTokenEnc: 'hijacked' },
      });
      await tx.organizationMercadoPagoConnection.deleteMany({ where: { organizationId: orgB } });
    });
    const survives = await withOrgContext(prisma, orgB, (tx) =>
      tx.organizationMercadoPagoConnection.findUnique({ where: { organizationId: orgB } }),
    );
    expect(survives?.accessTokenEnc).toBe('enc-access-B');
  });

  it('no-leak: one Mercado Pago account cannot back two organizations (UNIQUE mp_user_id)', async () => {
    const otherOrg = randomUUID();
    await prisma.organization.create({ data: { id: otherOrg, name: 'Org C' } });
    try {
      await expect(
        withOrgContext(prisma, otherOrg, (tx) =>
          tx.organizationMercadoPagoConnection.create({ data: connection(otherOrg, userA, 'C') }),
        ),
      ).rejects.toThrow();
    } finally {
      await purgeOrganizations(admin, [otherOrg]);
    }
  });

  it('no-leak: the renewal discovery returns only organization ids, only inside the window', async () => {
    const rows = await prisma.$queryRaw<Record<string, unknown>[]>(
      Prisma.sql`SELECT * FROM mercadopago_connections_due_for_refresh(${30}::int)`,
    );
    const ours = rows.filter((r) => r.organization_id === orgA || r.organization_id === orgB);
    expect(ours).toEqual([{ organization_id: orgA }]);
    for (const row of rows) expect(Object.keys(row)).toEqual(['organization_id']);
  });

  it('no-leak: the discovery function is SECURITY DEFINER with a fixed search_path and not executable by PUBLIC', async () => {
    const rows = await admin.$queryRaw<
      { prosecdef: boolean; proconfig: string[] | null; public_exec: boolean }[]
    >(Prisma.sql`
      SELECT p.prosecdef, p.proconfig,
             has_function_privilege('public', p.oid, 'EXECUTE') AS public_exec
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'mercadopago_connections_due_for_refresh'
    `);
    expect(rows).toHaveLength(1);
    expect(rows[0].prosecdef).toBe(true);
    expect(rows[0].proconfig).toEqual(['search_path=public, pg_temp']);
    expect(rows[0].public_exec).toBe(false);
  });
});
