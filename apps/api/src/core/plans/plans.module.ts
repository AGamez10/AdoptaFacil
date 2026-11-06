import { Global, Module } from '@nestjs/common';
import { PlanGuard } from './plan.guard';
import { MercadoPagoBillingClient } from '../payments/mercadopago-billing.client';
import { PlanBillingService } from './plan-billing.service';
import {
  OrgPlanController,
  PlanBillingWebhookController,
  PlatformPlansController,
} from './plans.controller';
import { PlansService } from './plans.service';

/** Planes y suscripciones. `@Global` so any module can use {@link PlanGuard}
 *  and {@link PlansService.assertWithinLimit} without importing this module. */
@Global()
@Module({
  controllers: [OrgPlanController, PlatformPlansController, PlanBillingWebhookController],
  // ADR-PAG-003: plans are charged with AdoptaFácil's OWN Mercado Pago account.
  providers: [PlansService, PlanGuard, PlanBillingService, MercadoPagoBillingClient],
  exports: [PlansService, PlanGuard],
})
export class PlansModule {}
