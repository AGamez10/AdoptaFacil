import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { UserRole as UserRoleRow } from '@prisma/client';
import { Role, type RoleAssignment } from '@adoptafacil/contracts';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContextService } from '../tenant/tenant-context.service';

function toRoleAssignment(row: UserRoleRow): RoleAssignment {
  return {
    userId: row.userId,
    role: row.role as Role,
    organizationId: row.organizationId,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Reads and writes role assignments, always through the request's tenant
 * context — every query/write is RLS-scoped to the caller's organization, so an
 * admin can only manage authority within their own org.
 */
@Injectable()
export class RbacService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
    private readonly audit: AuditService,
  ) {}

  /** Roles held by a user in the caller's organization. */
  async rolesForUser(userId: string): Promise<Role[]> {
    const rows = await this.prisma.withTenant((tx) => tx.userRole.findMany({ where: { userId } }));
    return rows.map((row) => row.role as Role);
  }

  /** All role assignments in the caller's organization. */
  async listRolesForOrg(): Promise<RoleAssignment[]> {
    const rows = await this.prisma.withTenant((tx) => tx.userRole.findMany());
    return rows.map(toRoleAssignment);
  }

  /** Grant a role to a user of the caller's organization (idempotent). Records
   *  an append-only audit event in the SAME transaction as the assignment.
   *  Only an Owner may grant `owner` (AF-007): an Administrator cannot promote
   *  itself or anyone else to the organization's top authority. */
  async assignRole(actorUserId: string, userId: string, role: Role): Promise<RoleAssignment> {
    const organizationId = this.tenant.getOrganizationId();
    if (!organizationId) {
      throw new ForbiddenException('Missing tenant context');
    }
    return this.prisma.withTenant(async (tx) => {
      if (role === Role.Owner) {
        const actorIsOwner = await tx.userRole.findFirst({
          where: { userId: actorUserId, role: Role.Owner },
        });
        if (!actorIsOwner) {
          throw new ForbiddenException('Only an Owner can grant the Owner role');
        }
      }
      // RLS makes only same-org users visible: assigning to a user outside the
      // caller's organization yields "not found", never cross-tenant authority.
      const target = await tx.user.findUnique({ where: { id: userId } });
      if (!target) {
        throw new NotFoundException('User not found in this organization');
      }
      const row = await tx.userRole.upsert({
        where: { organizationId_userId_role: { organizationId, userId, role } },
        create: { organizationId, userId, role },
        update: {},
      });
      await this.audit.recordWithTx(tx, {
        organizationId,
        actorUserId,
        action: 'role.assigned',
        entityType: 'user',
        entityId: userId,
        metadata: { role },
      });
      return toRoleAssignment(row);
    });
  }

  /**
   * Revoke a role from a user of the caller's organization (idempotent: a role
   * the user does not hold is a no-op). An organization is never left without
   * an Owner (AF-008): revoking the last one is a 409. The Owner rows are
   * locked (`FOR UPDATE`) before counting, so two Owners revoking each other
   * concurrently cannot both succeed. An effective revocation is audited in the
   * same transaction.
   */
  async revokeRole(actorUserId: string, userId: string, role: Role): Promise<void> {
    const organizationId = this.tenant.getOrganizationId();
    if (!organizationId) {
      throw new ForbiddenException('Missing tenant context');
    }
    await this.prisma.withTenant(async (tx) => {
      if (role === Role.Owner) {
        // RLS scopes this to the caller's organization.
        const owners = await tx.$queryRaw<{ user_id: string }[]>`
          SELECT user_id FROM user_roles WHERE role = ${Role.Owner} FOR UPDATE`;
        const targetIsOwner = owners.some((row) => row.user_id === userId);
        if (targetIsOwner && owners.length <= 1) {
          throw new ConflictException('An organization must keep at least one Owner');
        }
      }
      const { count } = await tx.userRole.deleteMany({ where: { userId, role } });
      if (count > 0) {
        await this.audit.recordWithTx(tx, {
          organizationId,
          actorUserId,
          action: 'role.revoked',
          entityType: 'user',
          entityId: userId,
          metadata: { role },
        });
      }
    });
  }
}
