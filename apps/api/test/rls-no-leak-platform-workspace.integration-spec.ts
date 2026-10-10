import { randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { purgeOrganizations } from './support/cleanup';

/**
 * RNF03 gate extended to the platform team workspace (F19): tasks, task
 * events, sensitive-action requests and their decisions belong to ONE team
 * (organization) and must never be visible — or creatable — under another
 * team's context. Also proves they are append-only in the database: the app
 * role cannot UPDATE/DELETE them, and the triggers abort the mutation even for
 * a superuser. Connects as the NON-SUPERUSER `adoptafacil_app` role. Every
 * test name contains "no-leak" so the `test:rls` gate runs it.
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

describe('RLS cross-team no-leak (platform workspace)', () => {
  const prisma = new PrismaClient({ datasources: { db: { url: APP_DATABASE_URL } } });
  const admin = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  const teamA = randomUUID();
  const teamB = randomUUID();
  const subject = randomUUID();
  const leadA1 = randomUUID();
  const leadA2 = randomUUID();
  const leadB = randomUUID();
  const ticket: Record<string, string> = {};
  const action: Record<string, string> = {};

  beforeAll(async () => {
    await prisma.$connect();
    await admin.organization.createMany({
      data: [
        { id: teamA, name: 'Equipo A (Platform)', status: 'approved' },
        { id: teamB, name: 'Equipo B (Platform)', status: 'approved' },
        { id: subject, name: 'Fundación en revisión', status: 'pending_review' },
      ],
    });
    await admin.user.createMany({
      data: [
        {
          id: leadA1,
          organizationId: teamA,
          accountType: 'person',
          email: `a1-${teamA}@t.local`,
          displayName: 'A1',
        },
        {
          id: leadA2,
          organizationId: teamA,
          accountType: 'person',
          email: `a2-${teamA}@t.local`,
          displayName: 'A2',
        },
        {
          id: leadB,
          organizationId: teamB,
          accountType: 'person',
          email: `b-${teamB}@t.local`,
          displayName: 'B',
        },
      ],
    });
    await admin.userRole.createMany({
      data: [
        { organizationId: teamA, userId: leadA1, role: 'platform_super_admin' },
        { organizationId: teamA, userId: leadA2, role: 'platform_super_admin' },
        { organizationId: teamB, userId: leadB, role: 'platform_super_admin' },
      ],
    });

    for (const [team, actor] of [
      [teamA, leadA1],
      [teamB, leadB],
    ] as const) {
      await withOrgContext(prisma, team, async (tx) => {
        const t = await tx.platformWorkspaceTicket.create({
          data: { organizationId: team, subjectOrganizationId: subject },
        });
        await tx.platformWorkspaceTicketEvent.create({
          data: {
            organizationId: team,
            ticketId: t.id,
            seq: 1,
            type: 'created',
            status: 'open',
            note: `note-${team}`,
          },
        });
        const a = await tx.platformSensitiveAction.create({
          data: {
            organizationId: team,
            type: 'audit.export',
            payload: { from: '2026-01-01', to: '2026-01-31' },
            reason: `reason-${team}`,
            requestedByUserId: actor,
            expiresAt: new Date(Date.now() + 86_400_000),
          },
        });
        ticket[team] = t.id;
        action[team] = a.id;
      });
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await purgeOrganizations(admin, [teamA, teamB, subject]);
    await admin.$disconnect();
  });

  it('no-leak: team A sees only its own tasks, events and requests, never team B', async () => {
    const seen = await withOrgContext(prisma, teamA, async (tx) => ({
      tickets: await tx.platformWorkspaceTicket.findMany(),
      events: await tx.platformWorkspaceTicketEvent.findMany(),
      actions: await tx.platformSensitiveAction.findMany(),
    }));
    expect(seen.tickets.map((t) => t.id)).toEqual([ticket[teamA]]);
    expect(seen.events.every((e) => e.organizationId === teamA)).toBe(true);
    expect(seen.events.some((e) => e.note === `note-${teamB}`)).toBe(false);
    expect(seen.actions.map((a) => a.id)).toEqual([action[teamA]]);
  });

  it('no-leak: team B sees only its own rows (inverse)', async () => {
    const seen = await withOrgContext(prisma, teamB, async (tx) => ({
      tickets: await tx.platformWorkspaceTicket.findMany(),
      actions: await tx.platformSensitiveAction.findMany(),
    }));
    expect(seen.tickets.map((t) => t.id)).toEqual([ticket[teamB]]);
    expect(seen.actions.map((a) => a.id)).toEqual([action[teamB]]);
  });

  it('no-leak: with no team context nothing is visible', async () => {
    expect(await prisma.platformWorkspaceTicket.findMany()).toEqual([]);
    expect(await prisma.platformWorkspaceTicketEvent.findMany()).toEqual([]);
    expect(await prisma.platformSensitiveAction.findMany()).toEqual([]);
    expect(await prisma.platformSensitiveActionDecision.findMany()).toEqual([]);
  });

  it('no-leak: team B cannot write into team A (WITH CHECK + composite FK)', async () => {
    await expect(
      withOrgContext(prisma, teamB, (tx) =>
        tx.platformWorkspaceTicket.create({
          data: { organizationId: teamA, subjectOrganizationId: randomUUID() },
        }),
      ),
    ).rejects.toThrow();
    // An event of team B hung on team A's task: rejected by the composite FK.
    await expect(
      withOrgContext(prisma, teamB, (tx) =>
        tx.platformWorkspaceTicketEvent.create({
          data: {
            organizationId: teamB,
            ticketId: ticket[teamA],
            seq: 2,
            type: 'note',
            status: 'open',
          },
        }),
      ),
    ).rejects.toThrow();
  });

  it('no-leak: a lead of team B cannot decide a request of team A, even bypassing the API', async () => {
    await expect(
      withOrgContext(prisma, teamB, (tx) =>
        tx.platformSensitiveActionDecision.create({
          data: {
            organizationId: teamB,
            actionId: action[teamA],
            decision: 'approved',
            decidedByUserId: leadB,
          },
        }),
      ),
    ).rejects.toThrow();
    await expect(
      withOrgContext(prisma, teamA, (tx) =>
        tx.platformSensitiveActionDecision.create({
          data: {
            organizationId: teamA,
            actionId: action[teamA],
            decision: 'approved',
            decidedByUserId: leadB,
          },
        }),
      ),
    ).rejects.toThrow(/four eyes/);
  });

  it('no-leak: four eyes in the database — the requester cannot approve their own request', async () => {
    await expect(
      withOrgContext(prisma, teamA, (tx) =>
        tx.platformSensitiveActionDecision.create({
          data: {
            organizationId: teamA,
            actionId: action[teamA],
            decision: 'approved',
            decidedByUserId: leadA1,
          },
        }),
      ),
    ).rejects.toThrow(/four eyes/);
    const decision = await withOrgContext(prisma, teamA, (tx) =>
      tx.platformSensitiveActionDecision.create({
        data: {
          organizationId: teamA,
          actionId: action[teamA],
          decision: 'approved',
          decidedByUserId: leadA2,
        },
      }),
    );
    expect(decision.decision).toBe('approved');
    // One decision per request.
    await expect(
      withOrgContext(prisma, teamA, (tx) =>
        tx.platformSensitiveActionDecision.create({
          data: {
            organizationId: teamA,
            actionId: action[teamA],
            decision: 'rejected',
            decidedByUserId: leadA2,
          },
        }),
      ),
    ).rejects.toThrow();
  });

  it('no-leak: task history follows its sequence (no gaps, no rewrites of an earlier step)', async () => {
    await expect(
      withOrgContext(prisma, teamA, (tx) =>
        tx.platformWorkspaceTicketEvent.create({
          data: {
            organizationId: teamA,
            ticketId: ticket[teamA],
            seq: 5,
            type: 'note',
            status: 'open',
          },
        }),
      ),
    ).rejects.toThrow();
    const next = await withOrgContext(prisma, teamA, (tx) =>
      tx.platformWorkspaceTicketEvent.create({
        data: {
          organizationId: teamA,
          ticketId: ticket[teamA],
          seq: 2,
          type: 'note',
          status: 'open',
        },
      }),
    );
    expect(next.seq).toBe(2);
  });

  it.each([
    'platform_workspace_tickets',
    'platform_workspace_ticket_events',
    'platform_sensitive_actions',
    'platform_sensitive_action_decisions',
  ])('no-leak: %s is append-only for the app role and for a superuser', async (table) => {
    // App role: no UPDATE/DELETE privilege at all.
    await expect(
      withOrgContext(prisma, teamA, (tx) =>
        tx.$executeRawUnsafe(`UPDATE ${table} SET organization_id = organization_id`),
      ),
    ).rejects.toThrow();
    await expect(
      withOrgContext(prisma, teamA, (tx) => tx.$executeRawUnsafe(`DELETE FROM ${table}`)),
    ).rejects.toThrow();
    // Superuser: the triggers still abort the mutation.
    await expect(
      admin.$executeRawUnsafe(`UPDATE ${table} SET organization_id = organization_id`),
    ).rejects.toThrow(/append-only/);
    await expect(admin.$executeRawUnsafe(`DELETE FROM ${table}`)).rejects.toThrow(/append-only/);
  });
});
