import { BadRequestException, Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { Response } from 'express';
import { Role } from '@adoptafacil/contracts';
import type { RequestUser } from '../../core/auth/auth.types';
import { CurrentUser } from '../../core/auth/current-user.decorator';
import { JwtAuthGuard } from '../../core/auth/jwt-auth.guard';
import { PlanGuard } from '../../core/plans/plan.guard';
import { RequirePlan } from '../../core/plans/require-plan.decorator';
import { Roles } from '../../core/rbac/roles.decorator';
import { RolesGuard } from '../../core/rbac/roles.guard';
import { OrgExportsService } from './org-exports.service';

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function sendFile(res: Response, file: { filename: string; data: Buffer }, type: string): void {
  res.setHeader('Content-Type', type);
  // El nombre lo arma el servidor (prefijo fijo + fecha): nunca texto del usuario.
  res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.send(file.data);
}

/**
 * Exportaciones de la organización (planes Crece y Pro). Deny-by-default: solo
 * Owner y Administrator, la organización es la del JWT y el plan se verifica
 * con {@link PlanGuard} (apagado mientras `PLAN_ENFORCEMENT` no se encienda).
 * Generar un archivo usa CPU: el throttle evita que un clic repetido o un
 * script lo conviertan en carga para todos.
 */
@Controller('org/exports')
@UseGuards(JwtAuthGuard, RolesGuard, PlanGuard, ThrottlerGuard)
export class OrgExportsController {
  constructor(private readonly service: OrgExportsService) {}

  @Get('data.xlsx')
  @Roles(Role.Owner, Role.Administrator)
  @RequirePlan('dataExport')
  @Throttle({ default: { limit: 5, ttl: 10 * 60_000 } })
  async data(@CurrentUser() actor: RequestUser, @Res() res: Response): Promise<void> {
    sendFile(res, await this.service.exportData(actor.organizationId, actor.id), XLSX);
  }

  /** Reporte de impacto en PDF: `?start=AAAA-MM-DD&end=AAAA-MM-DD` (hora de Colombia, máximo un año). */
  @Get('impact-report.pdf')
  @Roles(Role.Owner, Role.Administrator)
  @RequirePlan('impactReport')
  @Throttle({ default: { limit: 10, ttl: 10 * 60_000 } })
  async impact(
    @CurrentUser() actor: RequestUser,
    @Query('start') start: unknown,
    @Query('end') end: unknown,
    @Res() res: Response,
  ): Promise<void> {
    if (typeof start !== 'string' || typeof end !== 'string') {
      throw new BadRequestException('Indica el período con start y end (AAAA-MM-DD).');
    }
    sendFile(
      res,
      await this.service.impactReport(actor.organizationId, actor.id, start, end),
      'application/pdf',
    );
  }
}
