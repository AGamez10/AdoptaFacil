import { Module } from '@nestjs/common';
import { AuthModule } from '../../core/auth/auth.module';
import { CoffeeAdminService } from './coffee-admin.service';
import { CoffeeCheckoutClient } from './coffee-checkout.client';
import { CoffeePublicService } from './coffee-public.service';
import {
  CoffeeWebhookController,
  PlatformCoffeeController,
  PublicCoffeeController,
} from './coffee.controller';

/**
 * Café de AdoptaFácil: presentaciones con QR fijo, lotes con stock, checkout
 * con la cuenta de Mercado Pago de AdoptaFácil y aporte del 20 % del margen
 * bruto a la campaña que elige el comprador.
 */
@Module({
  imports: [AuthModule],
  controllers: [PlatformCoffeeController, PublicCoffeeController, CoffeeWebhookController],
  providers: [CoffeeAdminService, CoffeePublicService, CoffeeCheckoutClient],
})
export class CoffeeModule {}
