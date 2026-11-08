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
  invitationRoleCopy,
  type LegalAcceptanceItem,
  type OrganizationInvitation,
  OrganizationStatus,
  requiredLegalDocuments,
  Role,
} from '@adoptafacil/contracts';
import type { Env } from '../../../config/env.validation';
import { AuditService } from '../../../core/audit/audit.service';
import { LegalService, type LegalRequestContext } from '../../../core/legal';
import { PlansService } from '../../../core/plans/plans.service';
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

/** Funciones del cargo como lista con viñetas (el correo la dibuja en un recuadro). */
export function dutiesAsList(duties: readonly string[]): string {
  return duties.map((duty) => `• ${duty}`).join('\n');
}

const DATE_CO = new Intl.DateTimeFormat('es-CO', {
  dateStyle: 'long',
  timeStyle: 'short',
  timeZone: 'America/Bogota',
});

/**
 * Correo de invitación de una organización: el cargo y sus funciones salen de
 * la invitación guardada (rol + cargo de firmante), nunca de texto fijo. El
 * texto plano es el respaldo si la plantilla no se puede dibujar.
 */
export function buildOrgInvitationEmail(input: {
  organizationName: string;
  inviterName: string;
  role: string;
  signerRole?: string | null;
  expiresAt: Date;
  link: string;
}): { subject: string; body: string; data: Record<string, string> } {
  const copy = invitationRoleCopy(
    input.role,
    input.signerRole as Parameters<typeof invitationRoleCopy>[1],
  );
  const funciones = dutiesAsList(copy.duties);
  const vence = DATE_CO.format(input.expiresAt);
  return {
    subject: `${input.organizationName} te invita a su equipo como ${copy.label}`,
    body:
      'Hola,\n\n' +
      `${input.inviterName} te invitó a unirte a ${input.organizationName} en AdoptaFácil ` +
      `con el cargo de ${copy.label}.\n\n` +
      `Con este cargo podrás:\n${funciones}\n\n` +
      `Crea tu cuenta con este enlace (caduca el ${vence} y sirve una sola vez):\n\n` +
      `${input.link}\n\n` +
      'Si no esperabas esta invitación, ignora este correo: sin abrir el enlace no se crea ninguna cuenta.',
    data: {
      cargo: copy.label,
      funciones,
      invitado_por: input.inviterName,
      vence: input.expiresAt.toISOString(),
      enlace: input.link,
    },
  };
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
  /** Sin proveedor de correo real (`NOTIFICATION_DRIVER=log`) nada llega. */
  private readonly emailSimulated: boolean;
  /** Solo en desarrollo local el enlace simulado se devuelve para copiarlo a mano. */
  private readonly exposeSimulatedLink: boolean;

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
    private readonly audit: AuditService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    @Inject(NOTIFICATION_PORT) private readonly notifications: NotificationPort,
    private readonly plans: PlansService,
    config: ConfigService<Env, true>,
    private readonly legal: LegalService,
  ) {
    this.webBaseUrl = config.get('WEB_BASE_URL', { infer: true });
    this.emailSimulated = config.get('NOTIFICATION_DRIVER', { infer: true }) !== 'smtp';
    this.exposeSimulatedLink = config.get('NODE_ENV', { infer: true }) === 'development';
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
    const plan = this.plans.enforced ? await this.plans.effectivePlan(organizationId) : null;
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
      // Límite de miembros del plan (solo con PLAN_ENFORCEMENT): cuenta el
      // equipo actual más las invitaciones pendientes de OTROS correos, porque
      // cada una ocupará un puesto al aceptarse. Reinvitar al mismo correo no
      // ocupa un puesto nuevo.
      if (plan) {
        const [members, pending] = await Promise.all([
          this.plans.countMembers(tx, organizationId),
          tx.organizationInvitation.count({
            where: {
              organizationId,
              acceptedAt: null,
              revokedAt: null,
              expiresAt: { gt: new Date() },
              email: { not: email },
            },
          }),
        ]);
        await this.plans.assertWithinLimit(organizationId, 'members', members + pending + 1, plan);
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
      // Quién invita, leído dentro del mismo tenant (RLS): nunca de otra organización.
      const inviter = await tx.user.findFirst({
        where: { id: actorUserId, organizationId },
        select: { displayName: true },
      });
      return { ...created, inviterName: inviter?.displayName?.trim() || null };
    });

    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { name: true },
    });
    const organizationName = organization?.name ?? 'Una organización';
    const email_ = buildOrgInvitationEmail({
      organizationName,
      inviterName: row.inviterName ?? `El equipo de ${organizationName}`,
      role: row.role,
      signerRole: row.signerRole,
      expiresAt: row.expiresAt,
      link: buildInvitationLink(this.webBaseUrl, token),
    });
    await this.notifications.send({
      to: email,
      subject: email_.subject,
      body: email_.body,
      template: {
        event: 'org.invitation',
        data: email_.data,
        organizationName,
        organizationId,
      },
      // Cada invitación es un correo distinto (reinvitar crea otra y anula la anterior).
      idempotencyKey: `org.invitation:${row.id}`,
    });
    if (!this.emailSimulated) {
      return { ...toInvitation(row), emailDelivery: 'sent' };
    }
    return {
      ...toInvitation(row),
      emailDelivery: 'simulated',
      ...(this.exposeSimulatedLink
        ? { simulatedInviteLink: buildInvitationLink(this.webBaseUrl, token) }
        : {}),
    };
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
      ...(row.signerRole
        ? { signerRole: row.signerRole as NonNullable<InvitationPreview['signerRole']> }
        : {}),
      expiresAt: row.expiresAt.toISOString(),
    };
  }

  async accept(
    input: AcceptInvitationInput,
    context: LegalRequestContext = {},
  ): Promise<AuthSession> {
    // Autorización previa (Ley 1581 art. 9), igual que el registro: la persona
    // entra a una cuenta de organización, así que acepta los mismos documentos.
    const acceptances: LegalAcceptanceItem[] = this.legal.assertAcceptances(
      input.legalAcceptances,
      requiredLegalDocuments('organization'),
    );
    const { row } = await this.resolve(input.token);
    const { organizationId, email } = row;
    const existing = await this.prisma.authCredential.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException('This email already has an AdoptaFácil account');
    }

    const passwordHash = await this.passwords.hash(input.password);
    const userId = randomUUID();
    const displayName = input.displayName.trim();
    const plan = this.plans.enforced ? await this.plans.effectivePlan(organizationId) : null;
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
        // El plan pudo bajar entre la invitación y la aceptación.
        if (plan) {
          const members = await this.plans.countMembers(tx, organizationId);
          await this.plans.assertWithinLimit(organizationId, 'members', members + 1, plan);
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
        // Prueba de la autorización en la MISMA transacción que la cuenta.
        await this.legal.recordWithTx(tx, {
          organizationId,
          actorUserId: userId,
          subject: { type: 'user', userId },
          items: acceptances,
          channel: 'registration',
          context,
        });
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
    await this.legal.notifyAcceptance(email, acceptances);

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
