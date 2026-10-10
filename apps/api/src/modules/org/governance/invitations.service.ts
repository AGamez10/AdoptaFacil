import { createHash, randomBytes, randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { OrganizationInvitation as InvitationRow } from '@prisma/client';
import {
  type AcceptInvitationInput,
  type AuthSession,
  type CreateInvitationInput,
  type InvitationPreview,
  type OrganizationInvitation,
  OrganizationStatus,
  Role,
} from '@adoptafacil/contracts';
import type { Env } from '../../../config/env.validation';
import { AuditService } from '../../../core/audit/audit.service';
import { PasswordService } from '../../../core/auth/password.service';
import { TokenService } from '../../../core/auth/token.service';
import { isUniqueConstraintViolation } from '../../../core/errors/prisma-conflict.util';
import {
  NOTIFICATION_PORT,
  type NotificationPort,
} from '../../../core/notifications/notification.port';
import { TenantContextService } from '../../../core/tenant/tenant-context.service';
import { PrismaService } from '../../../prisma/prisma.service';

/**
 * How long an invitation link stays valid. The base document does not fix it:
 * TODO(client) confirm the expiry (7 days by default).
 */
export const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** One answer for every unusable token (unknown, expired, used, revoked), so
 *  the endpoint never reveals which condition failed. */
const INVALID_INVITATION = 'Invalid or expired invitation';

/** Organizations whose invitations can no longer be accepted. */
const CLOSED_STATUSES: readonly string[] = [
  OrganizationStatus.Rejected,
  OrganizationStatus.Suspended,
];

export function hashInvitationToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** `{WEB_BASE_URL}/invitacion#token=…`: in the fragment, so the token never
 *  reaches a server log, a proxy or a Referer header. */
export function buildInvitationLink(webBaseUrl: string, token: string): string {
  return `${webBaseUrl.replace(/\/+$/, '')}/invitacion#token=${encodeURIComponent(token)}`;
}

function statusOf(row: InvitationRow, now = Date.now()): OrganizationInvitation['status'] {
  if (row.acceptedAt) return 'accepted';
  if (row.revokedAt) return 'revoked';
  if (row.expiresAt.getTime() <= now) return 'expired';
  return 'pending';
}

function toInvitation(row: InvitationRow): OrganizationInvitation {
  return {
    id: row.id,
    organizationId: row.organizationId,
    email: row.email,
    role: row.role as Role,
    ...(row.signerRole
      ? { signerRole: row.signerRole as NonNullable<OrganizationInvitation['signerRole']> }
      : {}),
    status: statusOf(row),
    invitedByUserId: row.invitedByUserId,
    expiresAt: row.expiresAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Member invitations (R2-3, AF-017, condition C9). An Owner or Administrator
 * invites an email with an organization role; only an Owner invites an Owner.
 * The raw token exists only in the emailed link: the database keeps its
 * SHA-256 hash, and neither the token nor the link is ever logged or returned.
 * Accepting creates the account INSIDE the inviting organization with the
 * invited role (single use, conditional update against races).
 */
@Injectable()
export class InvitationsService {
  private readonly webBaseUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
    private readonly audit: AuditService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    @Inject(NOTIFICATION_PORT) private readonly notifications: NotificationPort,
    config: ConfigService<Env, true>,
  ) {
    this.webBaseUrl = config.get('WEB_BASE_URL', { infer: true });
  }

  private requireOrgId(): string {
    const organizationId = this.tenant.getOrganizationId();
    if (!organizationId) {
      throw new ForbiddenException('Missing tenant context');
    }
    return organizationId;
  }

  /** Invitations of the caller's organization, newest first. */
  async list(): Promise<OrganizationInvitation[]> {
    const rows = await this.prisma.withTenant((tx) =>
      tx.organizationInvitation.findMany({ orderBy: { createdAt: 'desc' }, take: 200 }),
    );
    return rows.map(toInvitation);
  }

  async create(actorUserId: string, input: CreateInvitationInput): Promise<OrganizationInvitation> {
    const organizationId = this.requireOrgId();
    const email = input.email.trim().toLowerCase();

    // An email already tied to an account cannot be invited: a user belongs to
    // exactly one organization and the email is unique platform-wide.
    const existing = await this.prisma.authCredential.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException('This email already has an AdoptaFácil account');
    }

    const token = randomBytes(32).toString('base64url');
    const row = await this.prisma.withOrgContext(organizationId, async (tx) => {
      if (input.signerRole) {
        // Vincular un firmante (contador / revisor fiscal) es decisión del
        // propietario de la organización, no de la plataforma ni de un
        // administrador. La persona entra con el rol de menor poder.
        if (input.role !== Role.ReadOnlyAuditor) {
          throw new BadRequestException(
            'Un firmante adicional entra con el rol de auditor de solo lectura.',
          );
        }
        const actorIsOwner = await tx.userRole.findFirst({
          where: { organizationId, userId: actorUserId, role: Role.Owner },
        });
        if (!actorIsOwner) {
          throw new ForbiddenException('Solo el propietario puede vincular un firmante.');
        }
        const taken = await tx.orgSignerDesignation.findFirst({
          where: { organizationId, role: input.signerRole, revokedAt: null },
        });
        if (taken) {
          throw new ConflictException(
            'Ya hay un firmante vigente con ese cargo; revócalo antes de invitar a otro.',
          );
        }
      }
      if (input.role === Role.Owner) {
        const actorIsOwner = await tx.userRole.findFirst({
          where: { organizationId, userId: actorUserId, role: Role.Owner },
        });
        if (!actorIsOwner) {
          throw new ForbiddenException('Only an Owner can invite another Owner');
        }
      }
      // Re-inviting replaces the pending invitation (its link stops working).
      await tx.organizationInvitation.updateMany({
        where: { organizationId, email, acceptedAt: null, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      const created = await tx.organizationInvitation.create({
        data: {
          organizationId,
          email,
          role: input.role,
          signerRole: input.signerRole ?? null,
          tokenHash: hashInvitationToken(token),
          invitedByUserId: actorUserId,
          expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
        },
      });
      await this.audit.recordWithTx(tx, {
        organizationId,
        actorUserId,
        action: 'invitation.created',
        entityType: 'organization_invitation',
        entityId: created.id,
        metadata: {
          role: input.role,
          ...(input.signerRole ? { signerRole: input.signerRole } : {}),
        },
      });
      return created;
    });

    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { name: true },
    });
    await this.notifications.send({
      to: email,
      subject: `Te invitaron a ${organization?.name ?? 'una organización'} en AdoptaFácil`,
      body:
        'Hola,\n\n' +
        `${organization?.name ?? 'Una organización'} te invitó a unirte a su equipo en AdoptaFácil.\n` +
        'Abre este enlace para crear tu cuenta (caduca en 7 días y solo sirve una vez):\n\n' +
        `${buildInvitationLink(this.webBaseUrl, token)}\n\n` +
        'Si no esperabas esta invitación, ignora este correo.',
    });
    return toInvitation(row);
  }

  async revoke(actorUserId: string, invitationId: string): Promise<void> {
    const organizationId = this.requireOrgId();
    await this.prisma.withOrgContext(organizationId, async (tx) => {
      const row = await tx.organizationInvitation.findFirst({
        where: { id: invitationId, organizationId },
      });
      if (!row) {
        throw new NotFoundException('Invitation not found');
      }
      if (row.role === Role.Owner) {
        const actorIsOwner = await tx.userRole.findFirst({
          where: { organizationId, userId: actorUserId, role: Role.Owner },
        });
        if (!actorIsOwner) {
          throw new ForbiddenException('Only an Owner can revoke an Owner invitation');
        }
      }
      const updated = await tx.organizationInvitation.updateMany({
        where: { id: invitationId, organizationId, acceptedAt: null, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      if (updated.count !== 1) {
        throw new ConflictException('The invitation is no longer pending');
      }
      await this.audit.recordWithTx(tx, {
        organizationId,
        actorUserId,
        action: 'invitation.revoked',
        entityType: 'organization_invitation',
        entityId: invitationId,
      });
    });
  }

  /** Resolve a raw token to a usable invitation, or 400 with one message. The
   *  invitee has no tenant yet: the bounded SECURITY DEFINER lookup gives the
   *  organization, then the row is read under that organization's context. */
  private async resolve(token: string): Promise<{ row: InvitationRow; organizationName: string }> {
    const found = await this.prisma.$queryRaw<
      Array<{ invitation: { id: string; organizationId: string } | null }>
    >`
      SELECT organization_invitation_by_token_hash(${hashInvitationToken(token)}) AS invitation
    `;
    const ref = found[0]?.invitation;
    if (!ref) {
      throw new BadRequestException(INVALID_INVITATION);
    }
    const row = await this.prisma.withOrgContext(ref.organizationId, (tx) =>
      tx.organizationInvitation.findFirst({ where: { id: ref.id } }),
    );
    if (!row || statusOf(row) !== 'pending') {
      throw new BadRequestException(INVALID_INVITATION);
    }
    const organization = await this.prisma.organization.findUnique({
      where: { id: row.organizationId },
      select: { name: true, status: true },
    });
    if (!organization || CLOSED_STATUSES.includes(organization.status)) {
      throw new BadRequestException(INVALID_INVITATION);
    }
    return { row, organizationName: organization.name };
  }

  async preview(token: string): Promise<InvitationPreview> {
    const { row, organizationName } = await this.resolve(token);
    return {
      organizationName,
      email: row.email,
      role: row.role as Role,
      expiresAt: row.expiresAt.toISOString(),
    };
  }

  async accept(input: AcceptInvitationInput): Promise<AuthSession> {
    const { row } = await this.resolve(input.token);
    const { organizationId, email } = row;
    const existing = await this.prisma.authCredential.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException('This email already has an AdoptaFácil account');
    }

    const passwordHash = await this.passwords.hash(input.password);
    const userId = randomUUID();
    const displayName = input.displayName.trim();
    try {
      await this.prisma.withOrgContext(organizationId, async (tx) => {
        // Single use: only one acceptance wins, even under concurrent requests.
        const claimed = await tx.organizationInvitation.updateMany({
          where: {
            id: row.id,
            acceptedAt: null,
            revokedAt: null,
            expiresAt: { gt: new Date() },
          },
          data: { acceptedAt: new Date(), acceptedUserId: userId },
        });
        if (claimed.count !== 1) {
          throw new BadRequestException(INVALID_INVITATION);
        }
        await tx.user.create({
          data: { id: userId, organizationId, accountType: 'organization', email, displayName },
        });
        // The unique email turns a concurrent sign-up with the same email into a
        // failed transaction (nothing is left half-created, see the catch).
        await tx.authCredential.create({
          data: { userId, organizationId, accountType: 'organization', email, passwordHash },
        });
        await tx.userRole.create({ data: { organizationId, userId, role: row.role } });
        if (row.signerRole) {
          // La persona acaba de crear su propia cuenta y contraseña con el
          // enlace de la invitación: queda vinculada como firmante.
          await tx.orgSignerDesignation.create({
            data: {
              organizationId,
              userId,
              role: row.signerRole,
              designatedByUserId: row.invitedByUserId,
            },
          });
          await this.audit.recordWithTx(tx, {
            organizationId,
            actorUserId: userId,
            action: 'signer.designated',
            entityType: 'org_signer_designation',
            entityId: userId,
            metadata: { signerRole: row.signerRole, designatedByUserId: row.invitedByUserId },
          });
        }
        await this.audit.recordWithTx(tx, {
          organizationId,
          actorUserId: userId,
          action: 'invitation.accepted',
          entityType: 'organization_invitation',
          entityId: row.id,
          metadata: { role: row.role, invitedByUserId: row.invitedByUserId },
        });
      });
    } catch (error) {
      // The unique email lost a race against a concurrent sign-up.
      if (isUniqueConstraintViolation(error)) {
        throw new ConflictException('This email already has an AdoptaFácil account');
      }
      throw error;
    }

    const tokens = await this.tokens.issueTokens({
      userId,
      organizationId,
      accountType: 'organization',
      email,
    });
    return {
      user: { id: userId, email, displayName, accountType: 'organization', organizationId },
      tokens,
    };
  }
}
