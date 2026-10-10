import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  type ChangeWorkspaceTicketStatusInput,
  OrganizationStatus,
  Role,
  type WorkspaceTicket,
  type WorkspaceTicketDetail,
  type WorkspaceTicketEvent,
  type WorkspaceTicketEventType,
  type WorkspaceTicketStatus,
} from '@adoptafacil/contracts';
import { AuditService } from '../../core/audit/audit.service';
import type { RequestUser } from '../../core/auth/auth.types';
import { PrismaService } from '../../prisma/prisma.service';
import { isConcurrentAppend } from './workspace.errors';

const KIND = 'organization_review';
/** Organizations waiting for the platform: they become (or reopen) tasks. */
const NEEDS_REVIEW: readonly string[] = [OrganizationStatus.PendingReview];
/** Platform decisions that close a review task on their own. */
const DECIDED: readonly string[] = [
  OrganizationStatus.Approved,
  OrganizationStatus.Rejected,
  OrganizationStatus.Suspended,
];
/** Scan cap per sync: the review queue of a pilot is far smaller. */
const SYNC_LIMIT = 500;
const RECENT_RESOLVED = 50;

type TicketRow = Prisma.PlatformWorkspaceTicketGetPayload<{
  include: { events: true };
}>;
type EventRow = TicketRow['events'][number];

interface Actor {
  user: RequestUser;
  roles: Role[];
}

/**
 * Team tasks (F19): every organization waiting for platform review is a task
 * that one person of the team takes, so it is always visible who is on what
 * and two people never work the same case by accident.
 *
 * Append-only: the task row never changes; each assignment, status change or
 * note is a new event and the task's state is its LAST event. Concurrency is
 * optimistic — a change carries the version (last `seq`) it saw; a stale one
 * gets 409 with the current task instead of silently overwriting.
 *
 * Automatic: listing syncs the team's tasks with the platform catalog — new
 * pending organizations become open tasks, an organization that comes back to
 * review reopens its task, and a task whose organization was already decided
 * resolves itself. Everything runs under the team's RLS context and is
 * audited in the team's trail.
 */
@Injectable()
export class WorkspaceTicketsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(actor: Actor): Promise<WorkspaceTicket[]> {
    await this.sync(actor.user);
    const rows = await this.prisma.withTenant((tx) =>
      tx.platformWorkspaceTicket.findMany({
        where: { kind: KIND },
        include: { events: { orderBy: { seq: 'desc' }, take: 1 } },
        orderBy: { createdAt: 'asc' },
      }),
    );
    const open = rows.filter((row) => row.events[0]?.status !== 'resolved');
    const resolved = rows
      .filter((row) => row.events[0]?.status === 'resolved')
      .sort((a, b) => b.events[0].createdAt.getTime() - a.events[0].createdAt.getTime())
      .slice(0, RECENT_RESOLVED);
    return this.present([...open, ...resolved]);
  }

  async detail(ticketId: string): Promise<WorkspaceTicketDetail> {
    const row = await this.prisma.withTenant((tx) =>
      tx.platformWorkspaceTicket.findFirst({
        where: { id: ticketId },
        include: { events: { orderBy: { seq: 'asc' } } },
      }),
    );
    if (!row) throw new NotFoundException('Task not found');
    const latestFirst = { ...row, events: [...row.events].reverse() };
    const [ticket] = await this.present([latestFirst]);
    const emails = await this.emailsOf(row.events.map((event) => event.actorUserId));
    return { ...ticket, events: row.events.map((event) => toEvent(event, emails)) };
  }

  /** Take the task (assign it to me). 409 if someone else holds it. */
  take(actor: Actor, ticketId: string, expectedVersion: number): Promise<WorkspaceTicket> {
    return this.append(actor, ticketId, expectedVersion, (last) => {
      if (last.status === 'resolved') {
        throw new ConflictException({ code: 'TICKET_RESOLVED', message: 'This task is closed.' });
      }
      if (last.assigneeUserId && last.assigneeUserId !== actor.user.id) {
        throw new ConflictException({
          code: 'TICKET_TAKEN',
          message: 'Someone else on the team already took this task.',
        });
      }
      return { type: 'assigned', status: 'in_progress', assigneeUserId: actor.user.id };
    });
  }

  /** Let the task go back to the queue (its holder, or a PlatformSuperAdmin). */
  release(actor: Actor, ticketId: string, expectedVersion: number): Promise<WorkspaceTicket> {
    return this.append(actor, ticketId, expectedVersion, (last) => {
      if (!last.assigneeUserId) {
        throw new ConflictException({ code: 'TICKET_FREE', message: 'Nobody holds this task.' });
      }
      this.assertHolderOrLead(actor, last);
      return { type: 'released', status: 'open', assigneeUserId: null };
    });
  }

  changeStatus(
    actor: Actor,
    ticketId: string,
    input: ChangeWorkspaceTicketStatusInput,
  ): Promise<WorkspaceTicket> {
    return this.append(actor, ticketId, input.expectedVersion, (last) => {
      if (last.status === input.status) {
        throw new ConflictException({ code: 'TICKET_SAME_STATUS', message: 'Nothing to change.' });
      }
      if (last.status === 'resolved') {
        // Reopening a closed task: anyone on the team; it goes back unassigned.
        return { type: 'reopened', status: 'open', assigneeUserId: null, note: input.note };
      }
      this.assertHolderOrLead(actor, last);
      return {
        type: 'status_changed',
        status: input.status,
        assigneeUserId: input.status === 'open' ? null : last.assigneeUserId,
        note: input.note,
      };
    });
  }

  /** A note anyone on the team can add; it never changes state or holder. */
  async addNote(actor: Actor, ticketId: string, note: string): Promise<WorkspaceTicket> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const current = await this.detail(ticketId);
      try {
        return await this.append(actor, ticketId, current.version, (last) => ({
          type: 'note',
          status: last.status as WorkspaceTicketStatus,
          assigneeUserId: last.assigneeUserId,
          note,
        }));
      } catch (error) {
        if (!(error instanceof ConflictException) || attempt === 2) throw error;
      }
    }
    throw new ConflictException('The task is changing too fast; try again.');
  }

  private assertHolderOrLead(actor: Actor, last: EventRow): void {
    const isLead = actor.roles.includes(Role.PlatformSuperAdmin);
    if (last.assigneeUserId !== actor.user.id && !isLead) {
      throw new ForbiddenException('Only the person holding the task (or a lead) can do this.');
    }
  }

  private async append(
    actor: Actor,
    ticketId: string,
    expectedVersion: number,
    next: (last: EventRow) => {
      type: WorkspaceTicketEventType;
      status: WorkspaceTicketStatus;
      assigneeUserId: string | null;
      note?: string;
    },
  ): Promise<WorkspaceTicket> {
    try {
      await this.prisma.withTenant(async (tx) => {
        const ticket = await tx.platformWorkspaceTicket.findFirst({
          where: { id: ticketId },
          include: { events: { orderBy: { seq: 'desc' }, take: 1 } },
        });
        if (!ticket) throw new NotFoundException('Task not found');
        const last = ticket.events[0];
        if (!last || last.seq !== expectedVersion) {
          throw new ConflictException({
            code: 'TICKET_CHANGED',
            message: 'The task changed since you opened it.',
            version: last?.seq ?? 0,
          });
        }
        const change = next(last);
        const event = await tx.platformWorkspaceTicketEvent.create({
          data: {
            organizationId: ticket.organizationId,
            ticketId: ticket.id,
            seq: last.seq + 1,
            type: change.type,
            status: change.status,
            assigneeUserId: change.assigneeUserId,
            actorUserId: actor.user.id,
            note: change.note?.trim() || null,
          },
        });
        await this.audit.recordWithTx(tx, {
          organizationId: ticket.organizationId,
          actorUserId: actor.user.id,
          action: `workspace.ticket.${change.type}`,
          entityType: 'workspace_ticket',
          entityId: ticket.id,
          metadata: {
            subjectOrganizationId: ticket.subjectOrganizationId,
            seq: event.seq,
            status: change.status,
            assigneeUserId: change.assigneeUserId,
            // Notes may carry personal data: the trail keeps only that one exists.
            noteLength: event.note?.length ?? 0,
          },
        });
      });
    } catch (error) {
      if (isConcurrentAppend(error)) {
        throw new ConflictException({
          code: 'TICKET_CHANGED',
          message: 'Someone changed the task at the same time. Reload and try again.',
        });
      }
      throw error;
    }
    const detail = await this.detail(ticketId);
    const { events: _events, ...ticket } = detail;
    return ticket;
  }

  /** Bring the team's tasks in line with the platform catalog (idempotent;
   *  safe under concurrency thanks to ON CONFLICT DO NOTHING). */
  private async sync(user: RequestUser): Promise<void> {
    const orgs = await this.prisma.organization.findMany({
      where: { status: { in: [...NEEDS_REVIEW, ...DECIDED] } },
      select: { id: true, status: true },
      orderBy: { statusChangedAt: 'desc' },
      take: SYNC_LIMIT,
    });
    const statusOf = new Map(orgs.map((org) => [org.id, org.status]));
    const pendingIds = orgs.filter((org) => NEEDS_REVIEW.includes(org.status)).map((org) => org.id);

    try {
      await this.syncTeam(user.organizationId, pendingIds, statusOf);
    } catch (error) {
      // Another member's list synced the same tasks at the same moment: their
      // events already cover it, so this pass has nothing left to add.
      if (!isConcurrentAppend(error)) throw error;
    }
  }

  private async syncTeam(
    teamId: string,
    pendingIds: string[],
    statusOf: Map<string, string>,
  ): Promise<void> {
    await this.prisma.withTenant(async (tx) => {
      await tx.platformWorkspaceTicket.createMany({
        data: pendingIds.map((subjectOrganizationId) => ({
          organizationId: teamId,
          subjectOrganizationId,
          kind: KIND,
          createdByUserId: null,
        })),
        skipDuplicates: true,
      });
      const tickets = await tx.platformWorkspaceTicket.findMany({
        where: { kind: KIND },
        include: { events: { orderBy: { seq: 'desc' }, take: 1 } },
      });
      const events: Prisma.PlatformWorkspaceTicketEventCreateManyInput[] = [];
      for (const ticket of tickets) {
        const last = ticket.events[0];
        const orgStatus = statusOf.get(ticket.subjectOrganizationId);
        if (!last) {
          events.push(systemEvent(teamId, ticket.id, 1, 'created', 'open', null));
        } else if (
          orgStatus &&
          NEEDS_REVIEW.includes(orgStatus) &&
          (last.status === 'resolved' || last.status === 'waiting_org')
        ) {
          events.push(
            systemEvent(
              teamId,
              ticket.id,
              last.seq + 1,
              'reopened',
              'open',
              null,
              'La organización volvió a enviar su información para revisión.',
            ),
          );
        } else if (orgStatus && DECIDED.includes(orgStatus) && last.status !== 'resolved') {
          events.push(
            systemEvent(
              teamId,
              ticket.id,
              last.seq + 1,
              'status_changed',
              'resolved',
              last.assigneeUserId,
              `La organización quedó en estado: ${orgStatus}.`,
            ),
          );
        }
      }
      if (events.length > 0) {
        await tx.platformWorkspaceTicketEvent.createMany({ data: events, skipDuplicates: true });
      }
    });
  }

  private async present(rows: TicketRow[]): Promise<WorkspaceTicket[]> {
    const subjects = await this.prisma.organization.findMany({
      where: { id: { in: rows.map((row) => row.subjectOrganizationId) } },
      select: { id: true, name: true, status: true },
    });
    const subjectOf = new Map(subjects.map((org) => [org.id, org]));
    const emails = await this.emailsOf(rows.map((row) => row.events[0]?.assigneeUserId ?? null));
    return rows
      .filter((row) => row.events.length > 0)
      .map((row) => {
        const last = row.events[0];
        const subject = subjectOf.get(row.subjectOrganizationId);
        return {
          id: row.id,
          kind: 'organization_review' as const,
          subjectOrganizationId: row.subjectOrganizationId,
          subjectOrganizationName: subject?.name ?? 'Organización no disponible',
          subjectOrganizationStatus: subject?.status ?? 'unknown',
          status: last.status as WorkspaceTicketStatus,
          assigneeUserId: last.assigneeUserId,
          assigneeEmail: last.assigneeUserId ? (emails.get(last.assigneeUserId) ?? null) : null,
          version: last.seq,
          createdAt: row.createdAt.toISOString(),
          updatedAt: last.createdAt.toISOString(),
        };
      });
  }

  /** Emails of team members (RLS: only users of the caller's team resolve). */
  private async emailsOf(ids: (string | null)[]): Promise<Map<string, string>> {
    const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
    if (unique.length === 0) return new Map();
    const users = await this.prisma.withTenant((tx) =>
      tx.user.findMany({ where: { id: { in: unique } }, select: { id: true, email: true } }),
    );
    return new Map(users.map((u) => [u.id, u.email]));
  }
}

function systemEvent(
  organizationId: string,
  ticketId: string,
  seq: number,
  type: WorkspaceTicketEventType,
  status: WorkspaceTicketStatus,
  assigneeUserId: string | null,
  note?: string,
): Prisma.PlatformWorkspaceTicketEventCreateManyInput {
  return {
    organizationId,
    ticketId,
    seq,
    type,
    status,
    assigneeUserId,
    actorUserId: null,
    note: note ?? null,
  };
}

function toEvent(event: EventRow, emails: Map<string, string>): WorkspaceTicketEvent {
  return {
    id: event.id,
    seq: event.seq,
    type: event.type as WorkspaceTicketEventType,
    status: event.status as WorkspaceTicketStatus,
    assigneeUserId: event.assigneeUserId,
    actorUserId: event.actorUserId,
    actorEmail: event.actorUserId ? (emails.get(event.actorUserId) ?? null) : null,
    note: event.note,
    createdAt: event.createdAt.toISOString(),
  };
}
