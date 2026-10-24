import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import {
  Role,
  type AdoptionDelivery,
  type AdoptionDeliveryCodeIssued,
  type AdoptionDeliveryPhotoTarget,
  type ConfirmAdoptionDeliveryInput,
  type StartAdoptionDeliveryInput,
} from '@adoptafacil/contracts';
import type { RequestUser } from '../../core/auth/auth.types';
import { CurrentUser } from '../../core/auth/current-user.decorator';
import { JwtAuthGuard } from '../../core/auth/jwt-auth.guard';
import { ZodValidationPipe } from '../../core/auth/zod-validation.pipe';
import { Roles } from '../../core/rbac/roles.decorator';
import { RolesGuard } from '../../core/rbac/roles.guard';
import { AdoptionDeliveryService } from './adoption-delivery.service';
import {
  confirmDeliverySchema,
  deliveryPhotoTargetSchema,
  startDeliverySchema,
} from './adoption-delivery.schemas';

/** Quién entrega en nombre de la organización: mismos roles que el contrato y
 *  el seguimiento (Owner/Administrator/Operator). */
const MANAGE_ROLES = [Role.Owner, Role.Administrator, Role.Operator] as const;

/**
 * Acta de ENTREGA (ajuste 6). Dos públicos bajo el mismo guard autenticado:
 *   - la organización registra la entrega, regenera el código o la cancela
 *     (deny-by-default, MANAGE_ROLES);
 *   - el adoptante ve y confirma SUS entregas (autorización por identidad,
 *     resuelta vía funciones SECURITY DEFINER acotadas).
 */
@Controller('adoptions/deliveries')
@UseGuards(JwtAuthGuard)
export class AdoptionDeliveryController {
  constructor(private readonly service: AdoptionDeliveryService) {}

  @Post('photo-target')
  @UseGuards(RolesGuard)
  @Roles(...MANAGE_ROLES)
  photoTarget(
    @Body(new ZodValidationPipe(deliveryPhotoTargetSchema)) dto: { filename: string },
  ): Promise<AdoptionDeliveryPhotoTarget> {
    return this.service.createPhotoTarget(dto.filename);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles(...MANAGE_ROLES)
  start(
    @CurrentUser() actor: RequestUser,
    @Body(new ZodValidationPipe(startDeliverySchema)) dto: StartAdoptionDeliveryInput,
  ): Promise<AdoptionDeliveryCodeIssued> {
    return this.service.start(actor, dto);
  }

  @Get('by-contract/:contractId')
  @UseGuards(RolesGuard)
  @Roles(...MANAGE_ROLES)
  getForContract(
    @Param('contractId', ParseUUIDPipe) contractId: string,
  ): Promise<AdoptionDelivery | null> {
    return this.service.getForContract(contractId);
  }

  @Post(':id/code')
  @UseGuards(RolesGuard)
  @Roles(...MANAGE_ROLES)
  regenerateCode(
    @CurrentUser() actor: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<AdoptionDeliveryCodeIssued> {
    return this.service.regenerateCode(actor, id);
  }

  @Post(':id/cancel')
  @UseGuards(RolesGuard)
  @Roles(...MANAGE_ROLES)
  cancel(
    @CurrentUser() actor: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<AdoptionDelivery> {
    return this.service.cancel(actor, id);
  }

  /** Las entregas del adoptante ("Mis animales"). */
  @Get('mine')
  listMine(@CurrentUser() actor: RequestUser): Promise<AdoptionDelivery[]> {
    return this.service.listMine(actor);
  }

  @Get('mine/:id')
  getMine(
    @CurrentUser() actor: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<AdoptionDelivery> {
    return this.service.getMine(actor, id);
  }

  @Post(':id/confirm')
  confirm(
    @CurrentUser() actor: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(confirmDeliverySchema)) dto: ConfirmAdoptionDeliveryInput,
  ): Promise<AdoptionDelivery> {
    return this.service.confirm(actor, id, dto.code);
  }
}
