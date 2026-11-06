import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import {
  Role,
  type AccountingOverview,
  type AccountingPeriodView,
  type AccountingReconciliation,
  type AccountingShareInfo,
  type AccountingSharePreview,
  type AccountingSyncResult,
  type CloseAccountingPeriodInput,
  type CloseAccountingPeriodResult,
} from '@adoptafacil/contracts';
import type { RequestUser } from '../../core/auth/auth.types';
import { CurrentUser } from '../../core/auth/current-user.decorator';
import { JwtAuthGuard } from '../../core/auth/jwt-auth.guard';
import { ZodValidationPipe } from '../../core/auth/zod-validation.pipe';
import { PlanGuard } from '../../core/plans/plan.guard';
import { RequirePlan } from '../../core/plans/require-plan.decorator';
import { Roles } from '../../core/rbac/roles.decorator';
import { RolesGuard } from '../../core/rbac/roles.guard';
import { AccountingService } from './accounting.service';
import {
  accountingShareExportSchema,
  accountingShareTokenSchema,
  closeAccountingPeriodSchema,
  createAccountingShareSchema,
} from './accounting.schemas';

/** Ven el libro, la conciliación y el exporte básico. */
const VIEW_ROLES = [Role.Owner, Role.Administrator, Role.ReadOnlyAuditor] as const;
/** Releen Mercado Pago, cierran el mes y comparten con el contador / revisor. */
const MANAGE_ROLES = [Role.Owner, Role.Administrator] as const;

function sendFile(
  res: Response,
  file: { filename: string; data: Buffer; contentType: string },
): void {
  res.setHeader('Content-Type', file.contentType);
  // El nombre lo arma el servidor (prefijo fijo + mes validado): nunca texto del usuario.
  res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.send(file.data);
}

function parseFormat(value: unknown): 'csv' | 'xlsx' {
  if (value === undefined || value === 'xlsx') return 'xlsx';
  if (value === 'csv') return 'csv';
  throw new BadRequestException('Formato inválido: usa csv o xlsx.');
}

function parseDetail(value: unknown): 'basic' | 'full' {
  if (value === undefined || value === 'basic') return 'basic';
  if (value === 'full') return 'full';
  throw new BadRequestException('Detalle inválido: usa basic o full.');
}

/**
 * Contabilidad de donaciones (sección 2A). Deny-by-default: cada ruta declara
 * sus roles; la organización es SIEMPRE la del JWT. Gratis: libro auxiliar,
 * conciliación, relectura de Mercado Pago y exporte básico. Plan de pago:
 * cierre de mes (`accountingClose`), exporte completo (`accountingFullExport`)
 * y compartir con el contador / revisor (`accountantPackage`).
 */
@Controller('org/accounting')
@UseGuards(JwtAuthGuard, RolesGuard, PlanGuard)
export class AccountingController {
  constructor(private readonly service: AccountingService) {}

  @Get()
  @Roles(...VIEW_ROLES)
  overview(): Promise<AccountingOverview> {
    return this.service.overview();
  }

  @Get('periods/:period')
  @Roles(...VIEW_ROLES)
  period(@Param('period') period: string): Promise<AccountingPeriodView> {
    return this.service.periodView(period);
  }

  @Get('periods/:period/reconciliation')
  @Roles(...VIEW_ROLES)
  reconciliation(@Param('period') period: string): Promise<AccountingReconciliation> {
    return this.service.reconciliation(period);
  }

  /** Relee Mercado Pago con el token del refugio (solo lectura en Mercado Pago). */
  @Post('periods/:period/reread')
  @HttpCode(200)
  @Roles(...MANAGE_ROLES)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 6, ttl: 10 * 60_000 } })
  reread(
    @CurrentUser() actor: RequestUser,
    @Param('period') period: string,
  ): Promise<AccountingSyncResult> {
    return this.service.reread(period, actor.id);
  }

  @Post('periods/:period/close')
  @HttpCode(200)
  @Roles(...MANAGE_ROLES)
  @RequirePlan('accountingClose')
  close(
    @CurrentUser() actor: RequestUser,
    @Param('period') period: string,
    @Body(new ZodValidationPipe(closeAccountingPeriodSchema)) dto: CloseAccountingPeriodInput,
  ): Promise<CloseAccountingPeriodResult> {
    return this.service.close(period, actor.id, dto);
  }

  /** `?format=csv|xlsx&detail=basic|full` (full exige `accountingFullExport`). */
  @Get('periods/:period/export')
  @Roles(...VIEW_ROLES)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 20, ttl: 10 * 60_000 } })
  async export(
    @CurrentUser() actor: RequestUser,
    @Param('period') period: string,
    @Query('format') format: unknown,
    @Query('detail') detail: unknown,
    @Res() res: Response,
  ): Promise<void> {
    sendFile(
      res,
      await this.service.export(period, parseFormat(format), parseDetail(detail), actor.id),
    );
  }

  @Post('periods/:period/shares')
  @Roles(...MANAGE_ROLES)
  @RequirePlan('accountantPackage')
  share(
    @CurrentUser() actor: RequestUser,
    @Param('period') period: string,
    @Body(new ZodValidationPipe(createAccountingShareSchema))
    dto: { signerRole: 'accountant' | 'fiscal_reviewer' },
  ): Promise<AccountingShareInfo> {
    return this.service.createShare(period, actor.id, dto.signerRole);
  }

  @Delete('shares/:id')
  @HttpCode(204)
  @Roles(...MANAGE_ROLES)
  revokeShare(
    @CurrentUser() actor: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.service.revokeShare(id, actor.id);
  }
}

/**
 * Enlaces SIN sesión del contador / revisor fiscal. El token viaja en el
 * cuerpo (nunca en la URL ni en los registros del proxy); límite por IP.
 */
@Controller('public/accounting')
@UseGuards(ThrottlerGuard)
@Throttle({ default: { limit: 20, ttl: 60_000 } })
export class AccountingPublicController {
  constructor(private readonly service: AccountingService) {}

  @Post('shares/preview')
  @HttpCode(200)
  preview(
    @Body(new ZodValidationPipe(accountingShareTokenSchema)) dto: { token: string },
    @Req() req: Request,
  ): Promise<AccountingSharePreview> {
    return this.service.sharePreview(dto.token, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Post('shares/export')
  @HttpCode(200)
  async shareExport(
    @Body(new ZodValidationPipe(accountingShareExportSchema))
    dto: { token: string; format: 'csv' | 'xlsx' },
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    sendFile(
      res,
      await this.service.shareExport(dto.token, dto.format, {
        ip: req.ip,
        userAgent: req.headers['user-agent'],
      }),
    );
  }

  /** Desde el enlace de FIRMA del libro auxiliar: el exporte completo del mes. */
  @Post('signature-package')
  @HttpCode(200)
  async signaturePackage(
    @Body(new ZodValidationPipe(accountingShareExportSchema))
    dto: { token: string; format: 'csv' | 'xlsx' },
    @Res() res: Response,
  ): Promise<void> {
    sendFile(res, await this.service.signaturePackage(dto.token, dto.format));
  }
}
