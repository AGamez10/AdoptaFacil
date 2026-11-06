import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Role,
  type AddOrgSignerInput,
  type AdditionalSignerRole,
  type OrgSigner,
  SIGNER_DECLARATION_TEXT,
  SIGNER_DECLARATION_VERSION,
} from '@adoptafacil/contracts';
import { AuditService } from '../../../core/audit/audit.service';
import {
  NOTIFICATION_PORT,
  type NotificationPort,
} from '../../../core/notifications/notification.port';
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
const ROLE_LABEL: Record<AdditionalSignerRole, string> = {
  accountant: 'contador público',
  fiscal_reviewer: 'revisor fiscal',
};

@Injectable()
export class SignersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
    private readonly audit: AuditService,
    @Inject(NOTIFICATION_PORT) private readonly notifications: NotificationPort,
  ) {}

  /**
   * Bienvenida al contador / revisor fiscal recién vinculado: le explica, sin
   * pedirle cuenta ni contraseña, cómo le llegarán los documentos y cómo los
   * firma. Nunca bloquea la vinculación si el correo falla.
   */
  private async sendWelcome(
    email: string,
    fullName: string,
    role: AdditionalSignerRole,
    organizationName: string,
    designationId: string,
  ): Promise<void> {
    const label = ROLE_LABEL[role];
    await this.notifications
      .send({
        to: email,
        subject: `${organizationName} te vinculó como su ${label} en AdoptaFácil`,
        body:
          `Hola ${fullName},\n\n` +
          `${organizationName} te registró como su ${label} en AdoptaFácil, la plataforma con la ` +
          'que lleva sus adopciones y donaciones.\n\n' +
          'No necesitas crear una cuenta ni una contraseña. Así funciona:\n\n' +
          '1. Cuando la organización necesite tu firma en un documento (por ejemplo, el cierre ' +
          'mensual del libro de donaciones o el informe de donaciones), te llegará un correo con ' +
          'un enlace personal de un solo uso.\n' +
          '2. La primera vez, en ese enlace registras tu firma (dibujada o con una foto sobre papel ' +
          'blanco) y autorizas que se guarde cifrada solo en esta organización.\n' +
          '3. Las siguientes veces solo revisas el documento y lo apruebas con tu número de ' +
          'documento. Tu firma se estampa únicamente en lo que tú apruebes, uno por uno; también ' +
          'puedes rechazarlo.\n\n' +
          'La organización también puede compartirte la información contable de cada mes (libro ' +
          'auxiliar, conciliación con Mercado Pago y exporte para tu programa contable) con un ' +
          'enlace seguro.\n\n' +
          'AdoptaFácil prepara y concilia la información; no firma ni certifica por ti.\n\n' +
          `Si no reconoces a ${organizationName} o no eres su ${label}, ignora este correo: ` +
          'sin tu aprobación, tu firma nunca se usa.',
        idempotencyKey: `signer.welcome:${designationId}`,
      })
      .catch(() => undefined);
  }

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
   * Vincula al contador o revisor fiscal por su correo, sin contraseña ni
   * cuenta para iniciar sesión: la persona queda como perfil de la
   * organización (sin roles) y firma desde el enlace que le llega con cada
   * documento. Si ya había alguien vigente en ese cargo, se revoca (cambio de
   * contador / revisor); su historial y lo que ya firmó se conservan.
   */
  async add(actorUserId: string, input: AddOrgSignerInput): Promise<OrgSigner> {
    const organizationId = this.requireOrgId();
    const { signer, organizationName } = await this.prisma.withOrgContext(
      organizationId,
      async (tx) => {
        const actorIsOwner = await tx.userRole.findFirst({
          where: { organizationId, userId: actorUserId, role: Role.Owner },
        });
        if (!actorIsOwner) {
          throw new ForbiddenException('Solo el propietario vincula firmantes.');
        }
        const email = input.email.trim().toLowerCase();
        const user =
          (await tx.user.findFirst({ where: { organizationId, email } })) ??
          (await tx.user.create({
            data: {
              organizationId,
              accountType: 'organization',
              email,
              displayName: input.fullName.trim(),
            },
          }));
        if (user.id === actorUserId) {
          throw new ConflictException(
            'El representante legal no puede ser también contador o revisor fiscal.',
          );
        }
        const otherSeat = await tx.orgSignerDesignation.findFirst({
          where: { organizationId, userId: user.id, revokedAt: null, role: { not: input.role } },
        });
        if (otherSeat) {
          throw new ConflictException('Esa persona ya firma en otro cargo de la organización.');
        }
        const now = new Date();
        const previous = await tx.orgSignerDesignation.findMany({
          where: { organizationId, role: input.role, revokedAt: null },
        });
        for (const p of previous) {
          if (p.userId === user.id) {
            throw new ConflictException('Esa persona ya está vinculada en ese cargo.');
          }
          await tx.orgSignerDesignation.update({
            where: { id: p.id },
            data: { revokedAt: now, revokedByUserId: actorUserId },
          });
          await this.audit.recordWithTx(tx, {
            organizationId,
            actorUserId,
            action: 'signer.revoked',
            entityType: 'org_signer_designation',
            entityId: p.id,
            metadata: { signerRole: p.role, signerUserId: p.userId, replaced: true },
          });
        }
        const created = await tx.orgSignerDesignation.create({
          data: {
            organizationId,
            userId: user.id,
            role: input.role,
            designatedByUserId: actorUserId,
          },
        });
        await this.audit.recordWithTx(tx, {
          organizationId,
          actorUserId,
          action: 'signer.designated',
          entityType: 'org_signer_designation',
          entityId: created.id,
          metadata: {
            signerRole: input.role,
            signerUserId: user.id,
            channel: 'email_link',
            declarationVersion: SIGNER_DECLARATION_VERSION,
            declarationText: SIGNER_DECLARATION_TEXT,
          },
        });
        const org = await tx.organization.findUniqueOrThrow({
          where: { id: organizationId },
          select: { name: true },
        });
        const signer: OrgSigner = {
          id: created.id,
          role: input.role,
          status: 'active',
          email,
          displayName: user.displayName,
          createdAt: created.createdAt.toISOString(),
        };
        return { signer, organizationName: org.name };
      },
    );
    await this.sendWelcome(
      signer.email,
      signer.displayName ?? input.fullName,
      input.role,
      organizationName,
      signer.id,
    );
    return signer;
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
