import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import {
  type DecideOrgReportInput,
  type DecideSignatureRequestInput,
  type SignatureRequestDecisionResult,
  type SignatureRequestPreview,
  type GenerateOrgReportInput,
  type OrgReport,
  type OrgReportPendingSignature,
  type OrgReportPolicy,
  type SetOrgReportPolicyInput,
  type OrgReportVerification,
  type OrgReportsReadiness,
  type Paginated,
  Role,
} from '@adoptafacil/contracts';
import type { RequestUser } from '../../core/auth/auth.types';
import { CurrentUser } from '../../core/auth/current-user.decorator';
import { JwtAuthGuard } from '../../core/auth/jwt-auth.guard';
import { ZodValidationPipe } from '../../core/auth/zod-validation.pipe';
import { Roles } from '../../core/rbac/roles.decorator';
import { RolesGuard } from '../../core/rbac/roles.guard';
import { ReportsService } from './reports.service';
import {
  decideOrgReportSchema,
  decideSignatureRequestSchema,
  signatureRequestTokenSchema,
  generateOrgReportSchema,
  setOrgReportPolicySchema,
} from './reports.schemas';

/** Generan reportes (documentos que pueden llevar firmas legales). */
const GENERATE_ROLES = [Role.Owner, Role.Administrator] as const;
/** Ven y descargan los ya generados: + el auditor de solo lectura. */
const VIEW_ROLES = [Role.Owner, Role.Administrator, Role.ReadOnlyAuditor] as const;

/** Quien firma (el representante legal es Owner; los demás, auditores vinculados). */
const SIGNER_ROLES = [Role.Owner, Role.ReadOnlyAuditor] as const;

function sendFile(res: Response, file: { filename: string; data: Buffer }, type: string): void {
  res.setHeader('Content-Type', type);
  // El nombre es el folio (alfanumérico, generado por el servidor): nunca texto del usuario.
  res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.send(file.data);
}

/**
 * M13 · Reportes de la organización (donaciones y servicio social).
 * Deny-by-default: cada ruta declara sus roles; la organización siempre es la
 * del JWT (contexto de tenant), nunca un parámetro.
 */
@Controller('org/reports')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ReportsController {
  constructor(private readonly service: ReportsService) {}

  @Get('readiness')
  @Roles(...VIEW_ROLES)
  readiness(@CurrentUser() actor: RequestUser): Promise<OrgReportsReadiness> {
    return this.service.readiness(actor.id);
  }

  @Post()
  @Roles(...GENERATE_ROLES)
  generate(
    @CurrentUser() actor: RequestUser,
    @Body(new ZodValidationPipe(generateOrgReportSchema)) dto: GenerateOrgReportInput,
  ): Promise<OrgReport> {
    return this.service.generate(actor.id, dto);
  }

  @Get()
  @Roles(...VIEW_ROLES)
  list(
    @CurrentUser() actor: RequestUser,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('kind') kind?: string,
  ): Promise<Paginated<OrgReport>> {
    return this.service.list(actor.id, Number(limit), Number(offset), kind);
  }

  /** Firmas que la organización declara exigidas por sus estatutos. */
  @Put('policy')
  @Roles(Role.Owner)
  setPolicy(
    @CurrentUser() actor: RequestUser,
    @Body(new ZodValidationPipe(setOrgReportPolicySchema)) dto: SetOrgReportPolicyInput,
  ): Promise<OrgReportPolicy> {
    return this.service.setPolicy(actor.id, dto);
  }

  /** Bandeja del firmante: documentos que debe aprobar o rechazar. */
  @Get('pending-signatures')
  @Roles(...SIGNER_ROLES)
  pending(@CurrentUser() actor: RequestUser): Promise<OrgReportPendingSignature[]> {
    return this.service.pending(actor.id);
  }

  /** Aprobar o rechazar: solo la propia cuenta del firmante (el servicio lo exige). */
  @Post(':id/decision')
  @HttpCode(200)
  @Roles(...SIGNER_ROLES)
  decide(
    @CurrentUser() actor: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(decideOrgReportSchema)) dto: DecideOrgReportInput,
  ): Promise<OrgReport> {
    return this.service.decide(actor.id, id, dto);
  }

  /** Reenvía el enlace de firma a quien aún no decide (p. ej. si venció). */
  @Post(':id/signature-requests')
  @HttpCode(200)
  @Roles(...GENERATE_ROLES)
  resendSignatureRequests(@Param('id', ParseUUIDPipe) id: string): Promise<{ sent: number }> {
    return this.service.resendSignatureRequests(id);
  }

  @Get(':id/pdf')
  @Roles(...VIEW_ROLES)
  async pdf(
    @CurrentUser() actor: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ): Promise<void> {
    sendFile(res, await this.service.renderPdf(id, actor.id), 'application/pdf');
  }

  @Get(':id/xlsx')
  @Roles(...VIEW_ROLES)
  async xlsx(
    @CurrentUser() actor: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ): Promise<void> {
    sendFile(
      res,
      await this.service.renderXlsx(id, actor.id),
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
  }
}

/** Verificación PÚBLICA de un reporte por folio (sin sesión, sin datos personales). */
@Controller()
export class ReportsPublicController {
  constructor(private readonly service: ReportsService) {}

  @Get('public/reports/:code')
  verify(@Param('code') code: string): Promise<OrgReportVerification> {
    return this.service.verifyPublic(code);
  }
}

/**
 * Firma por enlace de correo (contador / revisor fiscal, sin sesión). El token
 * viaja en el cuerpo, nunca en la URL, y las rutas están limitadas por IP.
 */
@Controller('public/signature-requests')
@UseGuards(ThrottlerGuard)
@Throttle({ default: { limit: 20, ttl: 60_000 } })
export class SignatureRequestsPublicController {
  constructor(private readonly service: ReportsService) {}

  @Post('preview')
  @HttpCode(200)
  preview(
    @Body(new ZodValidationPipe(signatureRequestTokenSchema)) dto: { token: string },
  ): Promise<SignatureRequestPreview> {
    return this.service.previewSignatureRequest(dto.token);
  }

  @Post('pdf')
  @HttpCode(200)
  async pdf(
    @Body(new ZodValidationPipe(signatureRequestTokenSchema)) dto: { token: string },
    @Res() res: Response,
  ): Promise<void> {
    sendFile(res, await this.service.signatureRequestPdf(dto.token), 'application/pdf');
  }

  @Post('decision')
  @HttpCode(200)
  decide(
    @Body(new ZodValidationPipe(decideSignatureRequestSchema)) dto: DecideSignatureRequestInput,
    @Req() req: Request,
  ): Promise<SignatureRequestDecisionResult> {
    return this.service.decideSignatureRequest(dto, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }
}
