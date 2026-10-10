import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  type GenerateOrgReportInput,
  type OrgReport,
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
import { generateOrgReportSchema } from './reports.schemas';

/** Generan reportes (documentos que pueden llevar firmas legales). */
const GENERATE_ROLES = [Role.Owner, Role.Administrator] as const;
/** Ven y descargan los ya generados: + el auditor de solo lectura. */
const VIEW_ROLES = [Role.Owner, Role.Administrator, Role.ReadOnlyAuditor] as const;

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
  readiness(): Promise<OrgReportsReadiness> {
    return this.service.readiness();
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
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('kind') kind?: string,
  ): Promise<Paginated<OrgReport>> {
    return this.service.list(Number(limit), Number(offset), kind);
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
