import { randomUUID } from 'node:crypto';
import { PrismaService } from '../src/prisma/prisma.service';
import { TenantContextService } from '../src/core/tenant/tenant-context.service';

/**
 * Plan de escala (B4): every tenant transaction carries a statement timeout, so
 * a runaway query releases its pooled connection instead of holding it, and the
 * tenant setting still applies in the same round trip.
 */
describe('Postgres pool guard rails (plan de escala, B4)', () => {
  const previous = process.env.DATABASE_STATEMENT_TIMEOUT_MS;
  let prisma: PrismaService;

  beforeAll(async () => {
    prisma = new PrismaService(new TenantContextService());
    await prisma.$connect();
  });

  afterAll(async () => {
    process.env.DATABASE_STATEMENT_TIMEOUT_MS = previous;
    await prisma.$disconnect();
  });

  it('cancels a statement that runs past DATABASE_STATEMENT_TIMEOUT_MS', async () => {
    process.env.DATABASE_STATEMENT_TIMEOUT_MS = '200';
    await expect(
      prisma.withOrgContext(randomUUID(), (tx) => tx.$queryRaw`SELECT pg_sleep(2)`),
    ).rejects.toThrow(/statement timeout|canceling statement/i);
  });

  it('keeps the tenant setting and the timeout inside the same transaction', async () => {
    process.env.DATABASE_STATEMENT_TIMEOUT_MS = '15000';
    const org = randomUUID();
    const rows = await prisma.withOrgContext(
      org,
      (tx) =>
        tx.$queryRaw<Array<{ org: string; timeout: string }>>`
          SELECT current_setting('app.current_org_id') AS org,
                 current_setting('statement_timeout') AS timeout`,
    );
    expect(rows[0]).toEqual({ org, timeout: '15s' });
  });
});
