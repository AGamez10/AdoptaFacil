import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Put,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import {
  Role,
  type ActivateEmailTemplateInput,
  type CreateEmailTemplateVersionInput,
  type EmailPreview,
  type EmailTemplateDetail,
  type EmailTemplateSummary,
  type PreviewEmailTemplateInput,
  type SendTestEmailResult,
  type SetEmailTemplateEnabledInput,
} from '@adoptafacil/contracts';
import type { RequestUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ZodValidationPipe } from '../auth/zod-validation.pipe';
import { Roles } from '../rbac/roles.decorator';
import { RolesGuard } from '../rbac/roles.guard';
import { AuditService } from '../audit/audit.service';
import { TenantContextService } from '../tenant/tenant-context.service';
import { NOTIFICATION_TRANSPORT } from './notification.module';
import type { NotificationPort } from './notification.port';
import {
  activateEmailTemplateSchema,
  createEmailTemplateVersionSchema,
  previewEmailTemplateSchema,
  setEmailTemplateEnabledSchema,
} from './email-templates.schemas';
import { EmailTemplateService } from './templates/email-template.service';
import { maskEmail } from './mask-email';

/**
 * Superadmin panel → "Correos". Platform roles only (deny-by-default: the
 * RolesGuard resolves the caller's role in their own tenant, so no org role —
 * not even an Owner — reaches these routes). Every change is audited by the
 * service. The event catalog, its variables and its button URLs are fixed in
 * code; only the copy is editable.
 */
@Controller('platform/email-templates')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.PlatformAdmin, Role.PlatformSuperAdmin)
export class EmailTemplatesController {
  constructor(
    private readonly templates: EmailTemplateService,
    private readonly audit: AuditService,
    private readonly tenant: TenantContextService,
    @Inject(NOTIFICATION_TRANSPORT) private readonly transport: NotificationPort,
  ) {}

  @Get()
  list(): Promise<EmailTemplateSummary[]> {
    return this.templates.list();
  }

  @Get(':event')
  detail(@Param('event') event: string): Promise<EmailTemplateDetail> {
    return this.templates.detail(event);
  }

  @Post(':event/versions')
  createVersion(
    @CurrentUser() actor: RequestUser,
    @Param('event') event: string,
    @Body(new ZodValidationPipe(createEmailTemplateVersionSchema))
    dto: CreateEmailTemplateVersionInput,
  ): Promise<EmailTemplateDetail> {
    return this.templates.createVersion(actor.id, event, dto);
  }

  @Put(':event/active')
  activate(
    @CurrentUser() actor: RequestUser,
    @Param('event') event: string,
    @Body(new ZodValidationPipe(activateEmailTemplateSchema)) dto: ActivateEmailTemplateInput,
  ): Promise<EmailTemplateDetail> {
    return this.templates.activate(actor.id, event, dto.version);
  }

  @Put(':event/enabled')
  setEnabled(
    @CurrentUser() actor: RequestUser,
    @Param('event') event: string,
    @Body(new ZodValidationPipe(setEmailTemplateEnabledSchema)) dto: SetEmailTemplateEnabledInput,
  ): Promise<EmailTemplateDetail> {
    return this.templates.setEnabled(actor.id, event, dto.enabled);
  }

  @Post(':event/preview')
  @HttpCode(200)
  preview(
    @Param('event') event: string,
    @Body(new ZodValidationPipe(previewEmailTemplateSchema)) dto: PreviewEmailTemplateInput,
  ): Promise<EmailPreview> {
    return this.templates.preview(event, dto.content, dto.organizationName);
  }

  /** Send the preview to the acting admin's OWN address only (never to a
   *  typed address, so this can't be used to spam anyone). Rate-limited. */
  @Post(':event/test-send')
  @HttpCode(200)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async testSend(
    @CurrentUser() actor: RequestUser,
    @Param('event') event: string,
    @Body(new ZodValidationPipe(previewEmailTemplateSchema)) dto: PreviewEmailTemplateInput,
  ): Promise<SendTestEmailResult> {
    const preview = await this.templates.preview(event, dto.content, dto.organizationName);
    // Straight to the transport (not the queue): the admin is waiting for it.
    try {
      await this.transport.send({
        to: actor.email,
        subject: `[Prueba] ${preview.subject}`,
        body: preview.text,
        html: preview.html,
      });
    } catch {
      throw new ServiceUnavailableException(
        'No se pudo enviar la prueba: el servidor de correo no respondió. Intenta de nuevo.',
      );
    }
    const organizationId = this.tenant.getOrganizationId();
    if (organizationId) {
      await this.audit.record({
        organizationId,
        actorUserId: actor.id,
        action: 'platform.email_template.test_sent',
        entityType: 'email_template',
        entityId: event,
        metadata: {},
      });
    }
    return { sentTo: maskEmail(actor.email) };
  }
}
