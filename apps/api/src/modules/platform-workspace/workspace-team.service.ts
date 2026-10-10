import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  PLATFORM_ROLES,
  type Role,
  type WorkspaceActivityItem,
  type WorkspaceMe,
  type WorkspaceTeamMember,
} from '@adoptafacil/contracts';
import type { RequestUser } from '../../core/auth/auth.types';
import { MfaService } from '../../core/auth/mfa/mfa.service';
import {
  PLATFORM_SECURITY_CONFIG,
  type PlatformSecurityConfig,
} from '../../core/auth/mfa/platform-security.config';
import { PrismaService } from '../../prisma/prisma.service';

export interface ActivityQuery {
  limit: number;
  before?: string;
  actorUserId?: string;
}

/**
 * Who the caller is in which team, the team's staff and its activity trail.
 * Every read runs under the team's RLS context: a team only ever sees its own
 * members and its own audit entries.
 */
@Injectable()
export class WorkspaceTeamService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mfa: MfaService,
    @Inject(PLATFORM_SECURITY_CONFIG) private readonly config: PlatformSecurityConfig,
  ) {}

  async me(user: RequestUser, roles: Role[]): Promise<WorkspaceMe> {
    const [profile, team, mfa] = await Promise.all([
      this.prisma.withTenant((tx) =>
        tx.user.findUnique({ where: { id: user.id }, select: { displayName: true } }),
      ),
      this.prisma.withTenant((tx) =>
        tx.organization.findUnique({
          where: { id: user.organizationId },
          select: { name: true },
        }),
      ),
      this.mfa.status(user),
    ]);
    return {
      userId: user.id,
      email: user.email,
      displayName: profile?.displayName ?? user.email,
      teamOrganizationId: user.organizationId,
      teamName: team?.name ?? '',
      roles: roles.filter((role) => PLATFORM_ROLES.includes(role)),
      mfa,
      policy: {
        accessTtlSeconds: this.config.accessTtlSeconds,
        mfaSessionMaxSeconds: this.config.mfaSessionMaxSeconds,
        idleTimeoutSeconds: this.config.idleTimeoutSeconds,
        sensitiveActionTtlSeconds: this.config.sensitiveActionTtlSeconds,
      },
    };
  }

  async team(): Promise<WorkspaceTeamMember[]> {
    const members = await this.prisma.withTenant(async (tx) => {
      const grants = await tx.userRole.findMany({
        where: { role: { in: [...PLATFORM_ROLES] } },
        select: { userId: true, role: true, createdAt: true },
      });
      const ids = [...new Set(grants.map((grant) => grant.userId))];
      const users = await tx.user.findMany({
        where: { id: { in: ids } },
        select: { id: true, email: true, displayName: true },
      });
      return { grants, users };
    });
    const factors = await this.prisma.authMfaFactor.findMany({
      where: { userId: { in: members.users.map((u) => u.id) }, confirmedAt: { not: null } },
      select: { userId: true },
    });
    const enrolled = new Set(factors.map((factor) => factor.userId));
    return members.users
      .map((u) => {
        const own = members.grants.filter((grant) => grant.userId === u.id);
        const joinedAt = own.reduce(
          (min, grant) => (grant.createdAt < min ? grant.createdAt : min),
          own[0].createdAt,
        );
        return {
          userId: u.id,
          email: u.email,
          displayName: u.displayName,
          roles: own.map((grant) => grant.role as Role),
          mfaEnrolled: enrolled.has(u.id),
          joinedAt: joinedAt.toISOString(),
        };
      })
      .sort((a, b) => a.displayName.localeCompare(b.displayName, 'es'));
  }

  async activity(query: ActivityQuery): Promise<WorkspaceActivityItem[]> {
    return this.prisma.withTenant(async (tx) => {
      const where: Prisma.AuditLogWhereInput = {};
      if (query.before) where.createdAt = { lt: new Date(query.before) };
      if (query.actorUserId) where.actorUserId = query.actorUserId;
      const rows = await tx.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: query.limit,
      });
      const ids = [...new Set(rows.map((row) => row.actorUserId).filter(Boolean))] as string[];
      const users = ids.length
        ? await tx.user.findMany({ where: { id: { in: ids } }, select: { id: true, email: true } })
        : [];
      const emails = new Map(users.map((u) => [u.id, u.email]));
      return rows.map((row) => ({
        id: row.id,
        organizationId: row.organizationId,
        actorUserId: row.actorUserId,
        actorEmail: row.actorUserId ? (emails.get(row.actorUserId) ?? null) : null,
        action: row.action,
        entityType: row.entityType,
        entityId: row.entityId,
        metadata: (row.metadata ?? {}) as Record<string, unknown>,
        createdAt: row.createdAt.toISOString(),
      }));
    });
  }
}
