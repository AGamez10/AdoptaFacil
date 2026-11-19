import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import {
  Role,
  type CoffeeCampaignOption,
  type CoffeeCheckoutInput,
  type CoffeeCheckoutResult,
  type CoffeeDashboard,
  type CoffeeDeliveryView,
  type CoffeeOrderStatus,
  type CoffeeOrderView,
  type CreateCoffeeDeliveryInput,
  type CreateCoffeeLotInput,
  type CreateCoffeeProductInput,
  type PublicCoffeeCampaigns,
  type PublicCoffeeOffer,
  type PublicCoffeeOrderStatus,
  type UpdateCoffeeLotInput,
} from '@adoptafacil/contracts';
import type { RequestUser } from '../../core/auth/auth.types';
import { CurrentUser } from '../../core/auth/current-user.decorator';
import { JwtAuthGuard } from '../../core/auth/jwt-auth.guard';
import { ZodValidationPipe } from '../../core/auth/zod-validation.pipe';
import { Roles } from '../../core/rbac/roles.decorator';
import { RolesGuard } from '../../core/rbac/roles.guard';
import { CoffeeAdminService } from './coffee-admin.service';
import { type CoffeeWebhookOutcome, CoffeePublicService } from './coffee-public.service';
import {
  checkoutSchema,
  createDeliverySchema,
  createLotSchema,
  createProductSchema,
  offerQuerySchema,
  orderStatusQuerySchema,
  updateLotSchema,
} from './coffee.schemas';

/**
 * Panel del café (equipo de plataforma, deny-by-default). Todo bajo la RLS del
 * equipo. Publicar un lote y cambiar su campaña sugerida se piden en
 * `POST /platform/workspace/approvals` (doble aprobación).
 */
@Controller('platform/coffee')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.PlatformAdmin, Role.PlatformSuperAdmin)
export class PlatformCoffeeController {
  constructor(private readonly admin: CoffeeAdminService) {}

  @Get()
  dashboard(): Promise<CoffeeDashboard> {
    return this.admin.dashboard();
  }

  @Get('campaigns')
  campaigns(): Promise<CoffeeCampaignOption[]> {
    return this.admin.campaigns();
  }

  @Post('products')
  @HttpCode(204)
  createProduct(
    @CurrentUser() actor: RequestUser,
    @Body(new ZodValidationPipe(createProductSchema)) dto: CreateCoffeeProductInput,
  ): Promise<void> {
    return this.admin.createProduct(actor, dto);
  }

  @Post('products/:id/lots')
  @HttpCode(204)
  createLot(
    @CurrentUser() actor: RequestUser,
    @Param('id', ParseUUIDPipe) productId: string,
    @Body(new ZodValidationPipe(createLotSchema)) dto: CreateCoffeeLotInput,
  ): Promise<void> {
    return this.admin.createLot(actor, productId, dto);
  }

  @Patch('lots/:id')
  @HttpCode(204)
  updateLot(
    @CurrentUser() actor: RequestUser,
    @Param('id', ParseUUIDPipe) lotId: string,
    @Body(new ZodValidationPipe(updateLotSchema)) dto: UpdateCoffeeLotInput,
  ): Promise<void> {
    return this.admin.updateLot(actor, lotId, dto);
  }

  @Post('lots/:id/pause')
  @HttpCode(204)
  pause(@CurrentUser() actor: RequestUser, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.admin.setLotStatus(actor, id, 'pause');
  }

  @Post('lots/:id/resume')
  @HttpCode(204)
  resume(@CurrentUser() actor: RequestUser, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.admin.setLotStatus(actor, id, 'resume');
  }

  @Post('lots/:id/close')
  @HttpCode(204)
  close(@CurrentUser() actor: RequestUser, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.admin.setLotStatus(actor, id, 'close');
  }

  @Get('orders')
  orders(
    @Query(new ZodValidationPipe(orderStatusQuerySchema)) query: { status?: CoffeeOrderStatus },
  ): Promise<CoffeeOrderView[]> {
    return this.admin.listOrders(query.status);
  }

  @Post('orders/:id/shipped')
  @HttpCode(204)
  shipped(
    @CurrentUser() actor: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.admin.markShipped(actor, id);
  }

  @Get('deliveries')
  deliveries(): Promise<CoffeeDeliveryView[]> {
    return this.admin.listDeliveries();
  }

  @Post('deliveries')
  @HttpCode(204)
  createDelivery(
    @CurrentUser() actor: RequestUser,
    @Body(new ZodValidationPipe(createDeliverySchema)) dto: CreateCoffeeDeliveryInput,
  ): Promise<void> {
    return this.admin.createDelivery(actor, dto);
  }
}

/**
 * Café público (sin sesión): la página del QR, las campañas elegibles, el
 * checkout y el estado del pedido. Con límite propio por IP.
 */
@Controller('public/coffee')
@UseGuards(ThrottlerGuard)
@Throttle({ default: { limit: 60, ttl: 60_000 } })
export class PublicCoffeeController {
  constructor(private readonly coffee: CoffeePublicService) {}

  @Get('campaigns')
  async campaigns(): Promise<PublicCoffeeCampaigns> {
    return { items: await this.coffee.campaigns() };
  }

  @Get('orders/:reference')
  order(@Param('reference') reference: string): Promise<PublicCoffeeOrderStatus> {
    return this.coffee.orderStatus(reference);
  }

  @Get(':code')
  offer(
    @Param('code') code: string,
    @Query(new ZodValidationPipe(offerQuerySchema)) query: { o?: 'qr' | 'web' },
  ): Promise<PublicCoffeeOffer> {
    return this.coffee.offer(code, query.o ?? 'web');
  }

  @Post(':code/checkout')
  @HttpCode(201)
  @Throttle({ default: { limit: 10, ttl: 10 * 60_000 } })
  checkout(
    @Param('code') code: string,
    @Body(new ZodValidationPipe(checkoutSchema)) dto: CoffeeCheckoutInput,
  ): Promise<CoffeeCheckoutResult> {
    return this.coffee.startCheckout(code, dto);
  }
}

/** Notificaciones de pago de Mercado Pago de las ventas de café (públicas). */
@Controller('coffee/webhooks')
export class CoffeeWebhookController {
  constructor(private readonly coffee: CoffeePublicService) {}

  @Post('mercadopago')
  @HttpCode(200)
  async mercadopago(
    @Body() payload: unknown,
    @Headers('x-signature') signature: string | undefined,
    @Headers('x-request-id') requestId: string | undefined,
    @Query() query: Record<string, string | undefined>,
  ): Promise<CoffeeWebhookOutcome> {
    try {
      return await this.coffee.applyWebhook(payload, signature ?? '', {
        headers: { 'x-request-id': requestId },
        query,
      });
    } catch (error) {
      if ((error as { status?: number }).status === 404) throw error;
      throw new ForbiddenException('Webhook verification failed.');
    }
  }
}
