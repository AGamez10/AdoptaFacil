import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  OPEN_OFFER_CATEGORIES,
  type ClaimResourceOpenOfferInput,
  type ClaimResourceOpenOfferResult,
  type CreateResourceOpenOfferInput,
  type ResourceOpenOffer,
  type ResourceOpenOffersBoardPage,
} from '@adoptafacil/contracts';
import type { RequestUser } from '../../core/auth/auth.types';
import { CurrentUser } from '../../core/auth/current-user.decorator';
import { JwtAuthGuard } from '../../core/auth/jwt-auth.guard';
import { ZodValidationPipe } from '../../core/auth/zod-validation.pipe';
import { Roles } from '../../core/rbac/roles.decorator';
import { RolesGuard } from '../../core/rbac/roles.guard';
import { RequireFeature } from '../../core/features';
import { ResourceOpenOffersService } from './resource-open-offers.service';
import {
  claimResourceOpenOfferSchema,
  createResourceOpenOfferSchema,
} from './resource-open-offers.schemas';
import { RESOURCE_WRITE_ROLES } from './resource-needs.controller';

/**
 * M09 — ofrecimientos abiertos. Audiencias:
 *   - cualquier autenticado deja (`POST`), lista (`GET mine`) y retira
 *     (`PATCH :id/withdraw`) lo SUYO, en su propio tenant;
 *   - la organización (RESOURCE_WRITE_ROLES) ve el tablero (`GET board`, sin
 *     identidad del donante) y toma uno (`POST :id/claim`). Deny-by-default.
 */
@RequireFeature('resources')
@Controller('resources/open-offers')
export class ResourceOpenOffersController {
  constructor(private readonly service: ResourceOpenOffersService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  create(
    @CurrentUser() actor: RequestUser,
    @Body(new ZodValidationPipe(createResourceOpenOfferSchema)) dto: CreateResourceOpenOfferInput,
  ): Promise<ResourceOpenOffer> {
    return this.service.create(actor, dto);
  }

  @Get('mine')
  @UseGuards(JwtAuthGuard)
  listMine(@CurrentUser() actor: RequestUser): Promise<ResourceOpenOffer[]> {
    return this.service.listMine(actor);
  }

  @Patch(':id/withdraw')
  @UseGuards(JwtAuthGuard)
  withdraw(
    @CurrentUser() actor: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ResourceOpenOffer> {
    return this.service.withdraw(actor, id);
  }

  @Get('board')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(...RESOURCE_WRITE_ROLES)
  board(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('category') category?: string,
    @Query('city') city?: string,
  ): Promise<ResourceOpenOffersBoardPage> {
    const knownCategory = (OPEN_OFFER_CATEGORIES as readonly string[]).includes(category ?? '')
      ? category
      : undefined;
    return this.service.board(Number(limit), Number(offset), knownCategory, city?.slice(0, 80));
  }

  @Post(':id/claim')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(...RESOURCE_WRITE_ROLES)
  claim(
    @CurrentUser() actor: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(claimResourceOpenOfferSchema)) dto: ClaimResourceOpenOfferInput,
  ): Promise<ClaimResourceOpenOfferResult> {
    return this.service.claim(actor, id, dto);
  }
}
