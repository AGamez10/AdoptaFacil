import {
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { Response } from 'express';
import {
  type LedgerEntry,
  type OrgLedgerPage,
  type PublicLedgerPage,
  Role,
} from '@adoptafacil/contracts';
import type { RequestUser } from '../../core/auth/auth.types';
import { CurrentUser } from '../../core/auth/current-user.decorator';
import { JwtAuthGuard } from '../../core/auth/jwt-auth.guard';
import { ZodValidationPipe } from '../../core/auth/zod-validation.pipe';
import { Roles } from '../../core/rbac/roles.decorator';
import { RolesGuard } from '../../core/rbac/roles.guard';
import { LedgerService, type UploadedSupportFile } from './ledger.service';
import {
  type CreateLedgerEntryDto,
  createLedgerEntrySchema,
  voidLedgerEntrySchema,
} from './ledger.schemas';
import { setServeHeaders } from '../../core/storage/serve-headers';

/** Registran y anulan movimientos (es dinero: solo quien administra). */
const WRITE_ROLES = [Role.Owner, Role.Administrator] as const;
/** Ven el libro y los soportes: + operación diaria y auditor de solo lectura. */
const VIEW_ROLES = [Role.Owner, Role.Administrator, Role.Operator, Role.ReadOnlyAuditor] as const;

/**
 * RF14 · Libro público — lado de la organización. Deny-by-default: cada ruta
 * declara sus roles; la organización sale SIEMPRE del JWT (contexto de tenant).
 */
@Controller('org/ledger')
@UseGuards(JwtAuthGuard, RolesGuard)
export class OrgLedgerController {
  constructor(private readonly service: LedgerService) {}

  @Get()
  @Roles(...VIEW_ROLES)
  list(): Promise<OrgLedgerPage> {
    return this.service.listForOrg();
  }

  /** JSON o multipart (soporte opcional en el campo `support`). */
  @Post()
  @Roles(...WRITE_ROLES)
  @UseInterceptors(FileInterceptor('support'))
  create(
    @CurrentUser() actor: RequestUser,
    @Body(new ZodValidationPipe(createLedgerEntrySchema)) dto: CreateLedgerEntryDto,
    @UploadedFile() file: UploadedSupportFile | undefined,
  ): Promise<LedgerEntry> {
    return this.service.create(actor.id, dto, file);
  }

  @Post(':id/void')
  @HttpCode(200)
  @Roles(...WRITE_ROLES)
  void(
    @CurrentUser() actor: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(voidLedgerEntrySchema)) dto: { reason: string },
  ): Promise<LedgerEntry> {
    return this.service.void(actor.id, id, dto.reason);
  }

  @Get(':id/support')
  @Roles(...VIEW_ROLES)
  async support(
    @CurrentUser() actor: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ): Promise<void> {
    const file = await this.service.downloadSupport(actor.id, id);
    // Tipo real por los bytes, en línea si es PDF o imagen, aislado con `sandbox`.
    setServeHeaders(res, file.filename, file.data);
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(file.data);
  }
}

/**
 * RF14 · Libro público — lectura SIN sesión. Siempre encendido: la
 * transparencia es un pilar del producto, no un módulo opcional.
 */
@Controller()
export class PublicLedgerController {
  constructor(private readonly service: LedgerService) {}

  @Get('public/organizations/:slug/ledger')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  async ledger(
    @Param('slug') slug: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ): Promise<PublicLedgerPage> {
    const page = await this.service.publicBySlug(slug, Number(limit), Number(offset));
    if (!page) {
      throw new NotFoundException('Organization not found');
    }
    return page;
  }
}
