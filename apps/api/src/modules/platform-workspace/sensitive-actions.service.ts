import { randomBytes } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import {
  type AuditExportPayload,
  type CreateSensitiveActionInput,
  PLATFORM_ROLES,
  Role,
  type SensitiveActionPayload,
  type SensitiveActionRequest,
  type SensitiveActionStatus,
  type SensitiveActionType,
  type StaffInvitePayload,
  type StaffMfaResetPayload,
  type StaffRolePayload,
} from '@adoptafacil/contracts';
import type { Env } from '../../config/env.validation';
import { AuditService } from '../../core/audit/audit.service';
import type { RequestUser } from '../../core/auth/auth.types';
import { MfaService } from '../../core/auth/mfa/mfa.service';
import {
  PLATFORM_SECURITY_CONFIG,
  type PlatformSecurityConfig,
} from '../../core/auth/mfa/platform-security.config';
import { TokenService } from '../../core/auth/token.service';
import {
  NOTIFICATION_PORT,
  type NotificationPort,
} from '../../core/notifications/notification.port';
import { PrismaService } from '../../prisma/prisma.service';
import {
  buildInvitationLink,
  hashInvitationToken,
  INVITATION_TTL_MS,
} from '../org/governance/invitations.service';
import { PAYLOAD_SCHEMAS } from './workspace.schemas';
import { isConcurrentAppend, triggerRejection } from './workspace.errors';

/** An approved export can be downloaded by its requester for this long. */
export const EXPORT_DOWNLOAD_WINDOW_MS = 24 * 60 * 60 * 1000;
/** Hard cap of rows in one export. */
const EXPORT_MAX_ROWS = 50_000;
/** Actions only a PlatformSuperAdmin may even ask for. */
const LEAD_ONLY: readonly SensitiveActionType[] = [
  'staff.invite',
  'staff.role_grant',
  'staff.role_revoke',
  'staff.mfa_reset',
];

type ActionRow = Prisma.PlatformSensitiveActionGetPayload<{ include: { decisions: true } }>;
type Tx = Prisma.TransactionClient;

interface Actor {
  user: RequestUser;
  roles: Role[];
}

/** What runs after the decision commits (e-mails, session revocation). */
type AfterCommit = () => Promise<void>;

/**
 * Four-eyes approvals (F19 security). A sensitive action — invite staff,
 * grant or revoke a platform role, reset someone's second factor, export the
 * team's audit trail — is first REQUESTED with a reason, and only runs when a
 * DIFFERENT PlatformSuperAdmin of the SAME team approves it with a fresh TOTP
 * code. The rule is enforced three times: here, in RBAC, and by a database
 * trigger on the decisions table (so not even a bug here can approve one's own
 * request). Requests and decisions are append-only; an undecided request
 * expires. Everything lives under the team's RLS context and is audited.
 */
@Injectable()
export class SensitiveActionsService {
  private readonly logger = new Logger(SensitiveActionsService.name);
  private readonly webBaseUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly mfa: MfaService,
    private readonly tokens: TokenService,
    @Inject(NOTIFICATION_PORT) private readonly notifications: NotificationPort,
    @Inject(PLATFORM_SECURITY_CONFIG) private readonly config: PlatformSecurityConfig,
    configService: ConfigService<Env, true>,
  ) {
    this.webBaseUrl = configService.get('WEB_BASE_URL', { infer: true });
  }

  async list(): Promise<SensitiveActionRequest[]> {
    const rows = await this.prisma.withTenant((tx) =>
      tx.platformSensitiveAction.findMany({
        include: { decisions: true },
        orderBy: { requestedAt: 'desc' },
        take: 100,
      }),
    );
    return this.present(rows);
  }

  async request(actor: Actor, input: CreateSensitiveActionInput): Promise<SensitiveActionRequest> {
    if (LEAD_ONLY.includes(input.type) && !actor.roles.includes(Role.PlatformSuperAdmin)) {
      throw new ForbiddenException('Only a team lead (PlatformSuperAdmin) can ask for this.');
    }
    const payload = this.parsePayload(input.type, input.payload);
    const teamId = actor.user.organizationId;
    const row = await this.prisma.withTenant(async (tx) => {
      await this.precheck(tx, teamId, input.type, payload);
      const created = await tx.platformSensitiveAction.create({
        data: {
          organizationId: teamId,
          type: input.type,
          payload: payload as unknown as Prisma.InputJsonValue,
          reason: input.reason.trim(),
          requestedByUserId: actor.user.id,
          expiresAt: new Date(Date.now() + this.config.sensitiveActionTtlSeconds * 1000),
        },
        include: { decisions: true },
      });
      await this.audit.recordWithTx(tx, {
        organizationId: teamId,
        actorUserId: actor.user.id,
        action: 'workspace.approval.requested',
        entityType: 'sensitive_action',
        entityId: created.id,
        metadata: { type: input.type, ...this.auditablePayload(input.type, payload) },
      });
      return created;
    });
    const [presented] = await this.present([row]);
    return presented;
  }

  async approve(
    actor: Actor,
    actionId: string,
    code: string,
    note?: string,
  ): Promise<SensitiveActionRequest> {
    this.assertLead(actor);
    const action = await this.loadPending(actionId);
    if (action.requestedByUserId === actor.user.id) {
      throw new ForbiddenException({
        code: 'FOUR_EYES',
        message: 'Another lead of your team has to approve what you asked for.',
      });
    }
    // Step-up: approving needs a fresh code, not just a valid session.
    await this.mfa.assertFreshCode(actor.user, code);

    const afterCommit: AfterCommit[] = [];
    await this.decide(actor, action, 'approved', note, async (tx) => {
      const payload = action.payload as unknown as SensitiveActionPayload;
      return this.execute(tx, actor, action, payload, afterCommit);
    });
    for (const task of afterCommit) {
      try {
        await task();
      } catch (error) {
        this.logger.error(`post-approval step failed for ${action.id}: ${(error as Error).name}`);
      }
    }
    return this.one(actionId);
  }

  async reject(actor: Actor, actionId: string, note: string): Promise<SensitiveActionRequest> {
    this.assertLead(actor);
    const action = await this.loadPending(actionId);
    if (action.requestedByUserId === actor.user.id) {
      throw new ForbiddenException({
        code: 'FOUR_EYES',
        message: 'You cannot decide your own request; cancel it instead.',
      });
    }
    await this.decide(actor, action, 'rejected', note, async () => ({}));
    return this.one(actionId);
  }

  async cancel(actor: Actor, actionId: string): Promise<SensitiveActionRequest> {
    const action = await this.loadPending(actionId);
    if (action.requestedByUserId !== actor.user.id) {
      throw new ForbiddenException('Only the person who asked can cancel the request.');
    }
    await this.decide(actor, action, 'cancelled', undefined, async () => ({}));
    return this.one(actionId);
  }

  /**
   * CSV of the team's audit trail for an APPROVED export, only for the person
   * who asked for it and only inside the download window. Each download is
   * itself audited. Cells are neutralized against spreadsheet formula
   * injection.
   */
  async exportCsv(actor: Actor, actionId: string): Promise<{ filename: string; csv: string }> {
    const action = await this.loadAction(actionId);
    const decision = action.decisions[0];
    if (action.type !== 'audit.export' || decision?.decision !== 'approved') {
      throw new ForbiddenException('This export has not been approved.');
    }
    if (action.requestedByUserId !== actor.user.id) {
      throw new ForbiddenException('Only the person who asked for the export can download it.');
    }
    if (Date.now() - decision.createdAt.getTime() > EXPORT_DOWNLOAD_WINDOW_MS) {
      throw new GoneException('The download window of this export is over.');
    }
    const { from, to } = action.payload as unknown as AuditExportPayload;
    const teamId = actor.user.organizationId;
    const csv = await this.prisma.withTenant(async (tx) => {
      const rows = await tx.auditLog.findMany({
        where: {
          createdAt: {
            gte: new Date(`${from}T00:00:00.000Z`),
            lt: new Date(Date.parse(`${to}T00:00:00.000Z`) + 86_400_000),
          },
        },
        orderBy: { createdAt: 'asc' },
        take: EXPORT_MAX_ROWS,
      });
      const emails = await emailsOf(
        tx,
        rows.map((row) => row.actorUserId),
      );
      await this.audit.recordWithTx(tx, {
        organizationId: teamId,
        actorUserId: actor.user.id,
        action: 'workspace.audit_export.downloaded',
        entityType: 'sensitive_action',
        entityId: action.id,
        metadata: { from, to, rows: rows.length },
      });
      const header = [
        'created_at_utc',
        'actor_user_id',
        'actor_email',
        'action',
        'entity_type',
        'entity_id',
        'metadata',
      ];
      const lines = rows.map((row) =>
        [
          row.createdAt.toISOString(),
          row.actorUserId ?? '',
          row.actorUserId ? (emails.get(row.actorUserId) ?? '') : '',
          row.action,
          row.entityType,
          row.entityId ?? '',
          JSON.stringify(row.metadata ?? {}),
        ]
          .map(csvCell)
          .join(','),
      );
      return [header.join(','), ...lines].join('\r\n') + '\r\n';
    });
    return { filename: `bitacora-equipo_${from}_${to}.csv`, csv };
  }

  // ---------------------------------------------------------------------------

  private assertLead(actor: Actor): void {
    if (!actor.roles.includes(Role.PlatformSuperAdmin)) {
      throw new ForbiddenException('Only a team lead (PlatformSuperAdmin) can decide.');
    }
  }

  private parsePayload(type: SensitiveActionType, payload: unknown): SensitiveActionPayload {
    const parsed = PAYLOAD_SCHEMAS[type].safeParse(payload);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid details for this action',
        issues: parsed.error.issues.map((issue) => issue.message),
      });
    }
    return parsed.data as SensitiveActionPayload;
  }

  /** Fail early (at request time) on what would fail at approval anyway. */
  private async precheck(
    tx: Tx,
    teamId: string,
    type: SensitiveActionType,
    payload: SensitiveActionPayload,
  ): Promise<void> {
    if (type === 'staff.invite') {
      const { email } = payload as StaffInvitePayload;
      if (await this.prisma.authCredential.findUnique({ where: { email } })) {
        throw new ConflictException('This email already has an AdoptaFácil account.');
      }
      return;
    }
    if (type === 'audit.export') return;
    const { userId } = payload as StaffRolePayload | StaffMfaResetPayload;
    // RLS: only users of the caller's team are visible.
    const target = await tx.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!target) throw new NotFoundException('That person is not part of your team.');
    void teamId;
  }

  private async decide(
    actor: Actor,
    action: ActionRow,
    decision: 'approved' | 'rejected' | 'cancelled',
    note: string | undefined,
    run: (tx: Tx) => Promise<Record<string, unknown>>,
  ): Promise<void> {
    try {
      await this.prisma.withTenant(async (tx) => {
        const result = await run(tx);
        await tx.platformSensitiveActionDecision.create({
          data: {
            organizationId: action.organizationId,
            actionId: action.id,
            decision,
            decidedByUserId: actor.user.id,
            note: note?.trim() || null,
            result: result as Prisma.InputJsonValue,
          },
        });
        await this.audit.recordWithTx(tx, {
          organizationId: action.organizationId,
          actorUserId: actor.user.id,
          action: `workspace.approval.${decision}`,
          entityType: 'sensitive_action',
          entityId: action.id,
          metadata: { type: action.type, requestedByUserId: action.requestedByUserId, ...result },
        });
      });
    } catch (error) {
      if (isConcurrentAppend(error)) {
        throw new ConflictException('This request was already decided.');
      }
      const rejection = triggerRejection(error);
      if (rejection === 'four_eyes' || rejection === 'not_requester') {
        throw new ForbiddenException({ code: 'FOUR_EYES', message: 'Four-eyes rule violated.' });
      }
      if (rejection === 'expired') throw new GoneException('This request expired.');
      throw error;
    }
  }

  /** Runs the approved action INSIDE the decision's transaction. Returns a
   *  non-sensitive summary stored on the decision. */
  private async execute(
    tx: Tx,
    actor: Actor,
    action: ActionRow,
    payload: SensitiveActionPayload,
    afterCommit: AfterCommit[],
  ): Promise<Record<string, unknown>> {
    const teamId = action.organizationId;
    const type = action.type as SensitiveActionType;
    const base = { approvalId: action.id, requestedByUserId: action.requestedByUserId };

    if (type === 'staff.invite') {
      const { email, role } = payload as StaffInvitePayload;
      if (await this.prisma.authCredential.findUnique({ where: { email } })) {
        throw new ConflictException('This email already has an AdoptaFácil account.');
      }
      const token = randomBytes(32).toString('base64url');
      await tx.organizationInvitation.updateMany({
        where: { organizationId: teamId, email, acceptedAt: null, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      const invitation = await tx.organizationInvitation.create({
        data: {
          organizationId: teamId,
          email,
          role,
          tokenHash: hashInvitationToken(token),
          invitedByUserId: action.requestedByUserId,
          expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
        },
      });
      await this.audit.recordWithTx(tx, {
        organizationId: teamId,
        actorUserId: actor.user.id,
        action: 'invitation.created',
        entityType: 'organization_invitation',
        entityId: invitation.id,
        metadata: { role, ...base },
      });
      afterCommit.push(() => this.sendStaffInvitation(email, token));
      return { invitationId: invitation.id, role };
    }

    if (type === 'staff.role_grant') {
      const { userId, role } = payload as StaffRolePayload;
      await assertTeamMember(tx, userId);
      await tx.userRole.upsert({
        where: { organizationId_userId_role: { organizationId: teamId, userId, role } },
        create: { organizationId: teamId, userId, role },
        update: {},
      });
      await this.audit.recordWithTx(tx, {
        organizationId: teamId,
        actorUserId: actor.user.id,
        action: 'role.assigned',
        entityType: 'user',
        entityId: userId,
        metadata: { role, ...base },
      });
      return { userId, role };
    }

    if (type === 'staff.role_revoke') {
      const { userId, role } = payload as StaffRolePayload;
      await assertTeamMember(tx, userId);
      if (role === Role.PlatformSuperAdmin) {
        // Lock the leads before counting: two concurrent revocations can't
        // both leave the team without a lead.
        const leads = await tx.$queryRaw<{ user_id: string }[]>`
          SELECT user_id FROM user_roles WHERE role = ${Role.PlatformSuperAdmin} FOR UPDATE`;
        if (leads.some((row) => row.user_id === userId) && leads.length <= 1) {
          throw new ConflictException('The team must keep at least one lead.');
        }
      }
      const { count } = await tx.userRole.deleteMany({ where: { userId, role } });
      const remaining = await tx.userRole.count({
        where: { userId, role: { in: [...PLATFORM_ROLES] } },
      });
      await this.audit.recordWithTx(tx, {
        organizationId: teamId,
        actorUserId: actor.user.id,
        action: 'role.revoked',
        entityType: 'user',
        entityId: userId,
        metadata: { role, removed: count, ...base },
      });
      // Without platform roles RBAC already denies everything; ending the
      // sessions also stops the person from refreshing a staff session.
      if (remaining === 0) afterCommit.push(() => this.tokens.revokeAllSessions(userId));
      return { userId, role, removed: count };
    }

    if (type === 'staff.mfa_reset') {
      const { userId } = payload as StaffMfaResetPayload;
      await assertTeamMember(tx, userId);
      await this.audit.recordWithTx(tx, {
        organizationId: teamId,
        actorUserId: actor.user.id,
        action: 'auth.mfa.reset',
        entityType: 'user',
        entityId: userId,
        metadata: base,
      });
      afterCommit.push(async () => {
        await this.mfa.resetFactor(userId);
      });
      return { userId };
    }

    // audit.export: nothing runs now; the requester downloads it afterwards.
    const { from, to } = payload as AuditExportPayload;
    return {
      from,
      to,
      downloadableUntil: new Date(Date.now() + EXPORT_DOWNLOAD_WINDOW_MS).toISOString(),
    };
  }

  private async sendStaffInvitation(email: string, token: string): Promise<void> {
    await this.notifications.send({
      to: email,
      subject: 'Te invitaron al equipo de plataforma de AdoptaFácil',
      body:
        'Hola,\n\nTe invitaron a unirte al equipo que opera la plataforma AdoptaFácil.\n' +
        'Abre este enlace para crear tu cuenta (caduca en 7 días y solo sirve una vez):\n\n' +
        `${buildInvitationLink(this.webBaseUrl, token)}\n\n` +
        'Al entrar por primera vez te pediremos activar la verificación en dos pasos con una ' +
        'app de autenticación en tu celular.\n\nSi no esperabas esta invitación, ignora este correo.',
    });
  }

  private async loadAction(actionId: string): Promise<ActionRow> {
    const row = await this.prisma.withTenant((tx) =>
      tx.platformSensitiveAction.findFirst({
        where: { id: actionId },
        include: { decisions: true },
      }),
    );
    if (!row) throw new NotFoundException('Request not found');
    return row;
  }

  private async loadPending(actionId: string): Promise<ActionRow> {
    const row = await this.loadAction(actionId);
    const status = statusOf(row);
    if (status === 'expired') throw new GoneException('This request expired.');
    if (status !== 'pending') throw new ConflictException('This request was already decided.');
    return row;
  }

  private async one(actionId: string): Promise<SensitiveActionRequest> {
    const [presented] = await this.present([await this.loadAction(actionId)]);
    return presented;
  }

  private async present(rows: ActionRow[]): Promise<SensitiveActionRequest[]> {
    const ids = rows.flatMap((row) => [row.requestedByUserId, row.decisions[0]?.decidedByUserId]);
    const emails = await this.prisma.withTenant((tx) => emailsOf(tx, ids));
    return rows.map((row) => {
      const decision = row.decisions[0];
      const status = statusOf(row);
      return {
        id: row.id,
        type: row.type as SensitiveActionType,
        payload: row.payload as unknown as SensitiveActionPayload,
        reason: row.reason,
        status,
        requestedByUserId: row.requestedByUserId,
        requestedByEmail: emails.get(row.requestedByUserId) ?? null,
        requestedAt: row.requestedAt.toISOString(),
        expiresAt: row.expiresAt.toISOString(),
        decidedByUserId: decision?.decidedByUserId ?? null,
        decidedByEmail: decision ? (emails.get(decision.decidedByUserId) ?? null) : null,
        decidedAt: decision?.createdAt.toISOString() ?? null,
        decisionNote: decision?.note ?? null,
        downloadableUntil:
          row.type === 'audit.export' && status === 'approved' && decision
            ? new Date(decision.createdAt.getTime() + EXPORT_DOWNLOAD_WINDOW_MS).toISOString()
            : null,
      };
    });
  }

  /** What of a payload goes into the audit trail (no e-mail addresses). */
  private auditablePayload(
    type: SensitiveActionType,
    payload: SensitiveActionPayload,
  ): Record<string, unknown> {
    if (type === 'staff.invite') return { role: (payload as StaffInvitePayload).role };
    return { ...payload };
  }
}

function statusOf(row: ActionRow, now = Date.now()): SensitiveActionStatus {
  const decision = row.decisions[0];
  if (decision) return decision.decision as SensitiveActionStatus;
  return row.expiresAt.getTime() <= now ? 'expired' : 'pending';
}

async function assertTeamMember(tx: Tx, userId: string): Promise<void> {
  const target = await tx.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!target) throw new NotFoundException('That person is not part of your team.');
}

async function emailsOf(tx: Tx, ids: (string | null | undefined)[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  if (unique.length === 0) return new Map();
  const users = await tx.user.findMany({
    where: { id: { in: unique } },
    select: { id: true, email: true },
  });
  return new Map(users.map((u) => [u.id, u.email]));
}

/** RFC 4180 cell + neutralization of spreadsheet formulas (CSV injection). */
export function csvCell(value: string): string {
  const neutral = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(neutral) ? `"${neutral.replace(/"/g, '""')}"` : neutral;
}
