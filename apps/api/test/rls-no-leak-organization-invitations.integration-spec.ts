import { createHash, randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { purgeOrganizations } from './support/cleanup';

/**
 * RNF03 gate extended to `organization_invitations` (Ola 1 · R2-3, AF-017): an
 * invitation belongs to one organization and must never be visible — or
 * creatable — under another org's context. Connects as the NON-SUPERUSER
 * `adoptafacil_app` role. Every test name contains "no-leak" so the `test:rls`
 * gate (-t "no-leak") runs it. Also checks the bounded SECURITY DEFINER lookup
 * by token hash (the only cross-tenant door) and that the history cannot be
 * deleted by the app role.
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

const hash = (token: string) => createHash('sha256').update(token).digest('hex');

describe('RLS cross-org no-leak (organization_invitations)', () => {
  const prisma = new PrismaClient({ datasources: { db: { url: APP_DATABASE_URL } } });
  const admin = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  const orgA = randomUUID();
  const orgB = randomUUID();
  const tokenA = `token-a-${randomUUID()}`;
  const tokenB = `token-b-${randomUUID()}`;
  let invitationA: string;

  const invitation = (organizationId: string, email: string, token: string) => ({
    organizationId,
    email,
    role: 'operator',
    tokenHash: hash(token),
    invitedByUserId: randomUUID(),
    expiresAt: new Date(Date.now() + 86_400_000),
  });

  beforeAll(async () => {
    await prisma.$connect();
    await admin.organization.createMany({
      data: [
        { id: orgA, name: 'Org A' },
        { id: orgB, name: 'Org B' },
      ],
      skipDuplicates: true,
    });
    const a = await withOrgContext(prisma, orgA, (tx) =>
      tx.organizationInvitation.create({ data: invitation(orgA, 'a@inv.test', tokenA) }),
    );
    invitationA = a.id;
    await withOrgContext(prisma, orgB, (tx) =>
      tx.organizationInvitation.create({ data: invitation(orgB, 'b@inv.test', tokenB) }),
    );
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await purgeOrganizations(admin, [orgA, orgB]);
    await admin.$disconnect();
  });

  it('no-leak: Org A sees only its own invitations, never Org B', async () => {
    const rows = await withOrgContext(prisma, orgA, (tx) => tx.organizationInvitation.findMany());
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.organizationId === orgA)).toBe(true);
    expect(rows.some((row) => row.email === 'b@inv.test')).toBe(false);
  });

  it('no-leak: Org B sees only its own invitations, never Org A (inverse)', async () => {
    const rows = await withOrgContext(prisma, orgB, (tx) => tx.organizationInvitation.findMany());
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.organizationId === orgB)).toBe(true);
    expect(rows.some((row) => row.email === 'a@inv.test')).toBe(false);
  });

  it('no-leak: with no tenant context, no invitations are visible', async () => {
    expect(await prisma.organizationInvitation.findMany()).toHaveLength(0);
  });

  it('no-leak: WITH CHECK blocks creating an invitation for a different org than the context', async () => {
    await expect(
      withOrgContext(prisma, orgA, (tx) =>
        tx.organizationInvitation.create({ data: invitation(orgB, 'x@inv.test', 'x') }),
      ),
    ).rejects.toThrow();
  });

  it('no-leak: Org B cannot update (revoke or accept) an invitation of Org A', async () => {
    const res = await withOrgContext(prisma, orgB, (tx) =>
      tx.organizationInvitation.updateMany({
        where: { id: invitationA },
        data: { revokedAt: new Date() },
      }),
    );
    expect(res.count).toBe(0);
  });

  it('no-leak: the app role cannot delete invitation history', async () => {
    await expect(
      withOrgContext(prisma, orgA, (tx) =>
        tx.organizationInvitation.deleteMany({ where: { id: invitationA } }),
      ),
    ).rejects.toThrow();
  });

  it('no-leak: the token lookup returns only the matching invitation and never the hash', async () => {
    const rows = await prisma.$queryRaw<Array<{ invitation: Record<string, unknown> | null }>>`
      SELECT organization_invitation_by_token_hash(${hash(tokenA)}) AS invitation
    `;
    expect(rows[0].invitation).toMatchObject({ id: invitationA, organizationId: orgA });
    expect(Object.keys(rows[0].invitation ?? {})).not.toContain('tokenHash');
    expect(JSON.stringify(rows[0].invitation)).not.toContain(hash(tokenA));

    const none = await prisma.$queryRaw<Array<{ invitation: unknown }>>`
      SELECT organization_invitation_by_token_hash(${hash('unknown')}) AS invitation
    `;
    expect(none[0].invitation).toBeNull();
  });
});
