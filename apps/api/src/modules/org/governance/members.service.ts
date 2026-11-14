import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  ORG_ROLES,
  PLAN_CATALOG,
  Role,
  type OrgTeamMember,
  type OrgTeamView,
} from '@adoptafacil/contracts';
import { AuditService } from '../../../core/audit/audit.service';
import { PlansService } from '../../../core/plans/plans.service';
import { TenantContextService } from '../../../core/tenant/tenant-context.service';
import { PrismaService } from '../../../prisma/prisma.service';

/** Orden de la lista: de más a menos autoridad. */
const ROLE_ORDER: Role[] = [
  Role.Owner,
  Role.Administrator,
  Role.Operator,
  Role.Veterinarian,
  Role.Volunteer,
  Role.TemporaryCollaborator,
  Role.ReadOnlyAuditor,
];

function rank(roles: Role[]): number {
  const positions = roles.map((role) => ROLE_ORDER.indexOf(role)).filter((i) => i >= 0);
  return positions.length ? Math.min(...positions) : ROLE_ORDER.length;
}

/**
 * Equipo de la organización (pantalla "Miembros"). Propietario y
 * administradores ven el equipo, cambian el cargo de una persona y la retiran.
 * Reglas (las mismas de las invitaciones y del RBAC):
 *   - solo un propietario da, quita o cambia el cargo de propietario;
 *   - la organización nunca queda sin propietario (filas bloqueadas FOR UPDATE);
 *   - nadie se retira a sí mismo (evita dejar la cuenta sin quien la gestione);
 *   - los firmantes se gestionan en "Firmantes" y no ocupan puesto del plan;
 *   - devolverle un cargo a una persona retirada vuelve a ocupar puesto (plan).
 * Todo corre bajo el contexto del tenant (RLS) y queda en la auditoría en la
 * misma transacción. Los cargos se leen en cada petición (RolesGuard), así que
 * un cambio aplica de inmediato; al retirar a alguien también se cierran sus
 * sesiones.
 */
@Injectable()
export class MembersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
    private readonly audit: AuditService,
    private readonly plans: PlansService,
  ) {}

  private requireOrgId(): string {
    const organizationId = this.tenant.getOrganizationId();
    if (!organizationId) {
      throw new ForbiddenException('Missing tenant context');
    }
    return organizationId;
  }

  async list(): Promise<OrgTeamView> {
    const organizationId = this.requireOrgId();
    const plan = await this.plans.effectivePlan(organizationId);
    const { users, roles, signers, used, pending } = await this.prisma.withOrgContext(
      organizationId,
      async (tx) => ({
        users: await tx.user.findMany({
          where: { organizationId, accountType: 'organization' },
          select: { id: true, displayName: true, email: true, createdAt: true },
          orderBy: { createdAt: 'asc' },
          take: 500,
        }),
        roles: await tx.userRole.findMany({
          where: { organizationId },
          select: { userId: true, role: true },
        }),
        signers: await tx.orgSignerDesignation.findMany({
          where: { organizationId, revokedAt: null },
          select: { userId: true, role: true },
        }),
        used: await this.plans.countMembers(tx, organizationId),
        pending: await tx.organizationInvitation.count({
          where: {
            organizationId,
            signerRole: null,
            acceptedAt: null,
            revokedAt: null,
            expiresAt: { gt: new Date() },
          },
        }),
      }),
    );

    const rolesByUser = new Map<string, Role[]>();
    for (const row of roles) {
      if (!ORG_ROLES.includes(row.role as Role)) continue;
      rolesByUser.set(row.userId, [...(rolesByUser.get(row.userId) ?? []), row.role as Role]);
    }
    const signerByUser = new Map(signers.map((s) => [s.userId, s.role]));

    const all: OrgTeamMember[] = users.map((user) => {
      const userRoles = (rolesByUser.get(user.id) ?? []).sort(
        (a, b) => ROLE_ORDER.indexOf(a) - ROLE_ORDER.indexOf(b),
      );
      const signerRole = signerByUser.get(user.id);
      return {
        userId: user.id,
        displayName: user.displayName,
        email: user.email,
        roles: userRoles,
        ...(signerRole === 'accountant' || signerRole === 'fiscal_reviewer' ? { signerRole } : {}),
        joinedAt: user.createdAt.toISOString(),
      };
    });

    const definition = PLAN_CATALOG[plan];
    return {
      members: all.filter((m) => m.roles.length > 0).sort((a, b) => rank(a.roles) - rank(b.roles)),
      formerMembers: all.filter((m) => m.roles.length === 0 && !m.signerRole),
      seats: {
        used,
        pendingInvitations: pending,
        limit: this.plans.enforced ? definition.limits.members : null,
        planName: definition.name,
      },
    };
  }

  /** Deja a la persona con UN solo cargo (reemplaza los que tenga). */
  async changeRole(actorUserId: string, userId: string, role: Role): Promise<void> {
    const organizationId = this.requireOrgId();
    if (!ORG_ROLES.includes(role)) {
      throw new BadRequestException('Only organization roles can be managed here');
    }
    const plan = this.plans.enforced ? await this.plans.effectivePlan(organizationId) : null;
    await this.prisma.withOrgContext(organizationId, async (tx) => {
      const { target, current, actorIsOwner } = await this.loadTarget(
        tx,
        organizationId,
        actorUserId,
        userId,
      );
      const touchesOwner = role === Role.Owner || current.includes(Role.Owner);
      if (touchesOwner && !actorIsOwner) {
        throw new ForbiddenException(
          'Solo el propietario puede dar o quitar el cargo de propietario.',
        );
      }
      if (current.length === 1 && current[0] === role) {
        return; // Sin cambios.
      }
      if (current.includes(Role.Owner) && role !== Role.Owner) {
        await this.assertAnotherOwner(tx, organizationId, userId);
      }
      // Devolverle un cargo a alguien retirado lo vuelve a sumar al equipo.
      if (plan && current.length === 0) {
        const members = await this.plans.countMembers(tx, organizationId);
        await this.plans.assertWithinLimit(organizationId, 'members', members + 1, plan);
      }
      await tx.userRole.deleteMany({ where: { organizationId, userId, role: { not: role } } });
      await tx.userRole.upsert({
        where: { organizationId_userId_role: { organizationId, userId, role } },
        create: { organizationId, userId, role },
        update: {},
      });
      await this.audit.recordWithTx(tx, {
        organizationId,
        actorUserId,
        action: current.length === 0 ? 'member.restored' : 'member.role_changed',
        entityType: 'user',
        entityId: target.id,
        metadata: { from: current, to: role },
      });
    });
  }

  /** Retira a la persona: pierde todos sus cargos y se cierran sus sesiones.
   *  Su cuenta y su historial se conservan (la auditoría la sigue nombrando). */
  async remove(actorUserId: string, userId: string): Promise<void> {
    const organizationId = this.requireOrgId();
    if (userId === actorUserId) {
      throw new BadRequestException('No puedes retirarte a ti mismo del equipo.');
    }
    await this.prisma.withOrgContext(organizationId, async (tx) => {
      const { target, current, actorIsOwner } = await this.loadTarget(
        tx,
        organizationId,
        actorUserId,
        userId,
      );
      if (current.length === 0) {
        throw new ConflictException('Esta persona ya no hace parte del equipo.');
      }
      if (current.includes(Role.Owner)) {
        if (!actorIsOwner) {
          throw new ForbiddenException('Solo el propietario puede retirar a un propietario.');
        }
        await this.assertAnotherOwner(tx, organizationId, userId);
      }
      await tx.userRole.deleteMany({ where: { organizationId, userId } });
      await tx.refreshToken.deleteMany({ where: { userId } });
      await this.audit.recordWithTx(tx, {
        organizationId,
        actorUserId,
        action: 'member.removed',
        entityType: 'user',
        entityId: target.id,
        metadata: { roles: current },
      });
    });
  }

  private async loadTarget(
    tx: Prisma.TransactionClient,
    organizationId: string,
    actorUserId: string,
    userId: string,
  ): Promise<{ target: { id: string }; current: Role[]; actorIsOwner: boolean }> {
    // RLS: una persona de otra organización simplemente "no existe".
    const target = await tx.user.findFirst({
      where: { id: userId, organizationId, accountType: 'organization' },
      select: { id: true },
    });
    if (!target) {
      throw new NotFoundException('Esta persona no hace parte de tu organización.');
    }
    const signer = await tx.orgSignerDesignation.findFirst({
      where: { organizationId, userId, revokedAt: null },
      select: { id: true },
    });
    if (signer) {
      throw new ConflictException('Los firmantes se gestionan en la sección Firmantes.');
    }
    const [rows, actorOwner] = await Promise.all([
      tx.userRole.findMany({ where: { organizationId, userId }, select: { role: true } }),
      tx.userRole.findFirst({
        where: { organizationId, userId: actorUserId, role: Role.Owner },
        select: { id: true },
      }),
    ]);
    return {
      target,
      current: rows.map((row) => row.role as Role).filter((r) => ORG_ROLES.includes(r)),
      actorIsOwner: Boolean(actorOwner),
    };
  }

  /** La organización nunca queda sin propietario. Bloquea las filas de los
   *  propietarios para que dos cambios simultáneos no la dejen sin ninguno. */
  private async assertAnotherOwner(
    tx: Prisma.TransactionClient,
    organizationId: string,
    userId: string,
  ): Promise<void> {
    const owners = await tx.$queryRaw<{ user_id: string }[]>`
      SELECT user_id FROM user_roles
      WHERE organization_id = ${organizationId}::uuid AND role = ${Role.Owner}
      FOR UPDATE`;
    if (!owners.some((row) => row.user_id !== userId)) {
      throw new ConflictException('La organización debe conservar al menos un propietario.');
    }
  }
}
