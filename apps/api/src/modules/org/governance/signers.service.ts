import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role, type AdditionalSignerRole, type OrgSigner } from '@adoptafacil/contracts';
import { AuditService } from '../../../core/audit/audit.service';
import { TenantContextService } from '../../../core/tenant/tenant-context.service';
import { PrismaService } from '../../../prisma/prisma.service';

/**
 * Firmantes adicionales (contador / revisor fiscal) de la organización.
 *
 * La vinculación es de la ORGANIZACIÓN: la invita su propietario (por defecto
 * el representante legal) con `POST /org/invitations { signerRole }`, la
 * persona crea su propia cuenta y contraseña con el enlace (la plataforma
 * nunca las conoce) y aquí el propietario ve, cambia o revoca ese acceso.
 * Todo corre en el tenant del JWT bajo RLS; cada alta, cambio y revocación
 * queda en la auditoría con quién lo hizo.
 */
@Injectable()
export class SignersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
    private readonly audit: AuditService,
  ) {}

  private requireOrgId(): string {
    const organizationId = this.tenant.getOrganizationId();
    if (!organizationId) {
      throw new ForbiddenException('Missing tenant context');
    }
    return organizationId;
  }

  /** Firmantes vigentes + invitaciones de firmante pendientes. */
  async list(): Promise<OrgSigner[]> {
    const organizationId = this.requireOrgId();
    return this.prisma.withOrgContext(organizationId, async (tx) => {
      const [designations, invitations] = await Promise.all([
        tx.orgSignerDesignation.findMany({
          where: { organizationId },
          include: { user: { select: { email: true, displayName: true } } },
          orderBy: { createdAt: 'desc' },
          take: 100,
        }),
        tx.organizationInvitation.findMany({
          where: {
            organizationId,
            signerRole: { not: null },
            acceptedAt: null,
            revokedAt: null,
            expiresAt: { gt: new Date() },
          },
          orderBy: { createdAt: 'desc' },
          take: 100,
        }),
      ]);
      return [
        ...invitations.map((i): OrgSigner => ({
          id: i.id,
          role: i.signerRole as AdditionalSignerRole,
          status: 'invited',
          email: i.email,
          createdAt: i.createdAt.toISOString(),
        })),
        ...designations.map((d): OrgSigner => ({
          id: d.id,
          role: d.role as AdditionalSignerRole,
          status: d.revokedAt ? 'revoked' : 'active',
          email: d.user.email,
          displayName: d.user.displayName,
          createdAt: d.createdAt.toISOString(),
          ...(d.revokedAt ? { revokedAt: d.revokedAt.toISOString() } : {}),
        })),
      ];
    });
  }

  /**
   * Revoca un firmante (o retira su invitación pendiente). Solo el propietario.
   * La persona deja de poder firmar y de entrar a la organización: se le
   * retira el rol y se cierran sus sesiones; el historial de lo que ya firmó
   * se conserva.
   */
  async revoke(actorUserId: string, id: string): Promise<void> {
    const organizationId = this.requireOrgId();
    await this.prisma.withOrgContext(organizationId, async (tx) => {
      const actorIsOwner = await tx.userRole.findFirst({
        where: { organizationId, userId: actorUserId, role: Role.Owner },
      });
      if (!actorIsOwner) {
        throw new ForbiddenException('Solo el propietario puede revocar un firmante.');
      }

      const designation = await tx.orgSignerDesignation.findFirst({
        where: { id, organizationId },
      });
      if (designation) {
        if (designation.revokedAt) {
          throw new ConflictException('Este firmante ya fue revocado.');
        }
        await tx.orgSignerDesignation.update({
          where: { id },
          data: { revokedAt: new Date(), revokedByUserId: actorUserId },
        });
        await tx.userRole.deleteMany({ where: { organizationId, userId: designation.userId } });
        await tx.refreshToken.deleteMany({ where: { userId: designation.userId } });
        await this.audit.recordWithTx(tx, {
          organizationId,
          actorUserId,
          action: 'signer.revoked',
          entityType: 'org_signer_designation',
          entityId: id,
          metadata: { signerRole: designation.role, signerUserId: designation.userId },
        });
        return;
      }

      const invitation = await tx.organizationInvitation.findFirst({
        where: { id, organizationId, signerRole: { not: null } },
      });
      if (!invitation) {
        throw new NotFoundException('Firmante no encontrado.');
      }
      const updated = await tx.organizationInvitation.updateMany({
        where: { id, organizationId, acceptedAt: null, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      if (updated.count !== 1) {
        throw new ConflictException('La invitación ya no está pendiente.');
      }
      await this.audit.recordWithTx(tx, {
        organizationId,
        actorUserId,
        action: 'signer.invitation_revoked',
        entityType: 'organization_invitation',
        entityId: id,
        metadata: { signerRole: invitation.signerRole },
      });
    });
  }
}
