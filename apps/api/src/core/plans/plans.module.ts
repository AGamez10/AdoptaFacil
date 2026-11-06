import { BullModule } from '@nestjs/bullmq';
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
import { PlanRemindersService } from './plan-reminders.service';
import {
  PLAN_REMINDERS_QUEUE,
  PlanRemindersProcessor,
  PlanRemindersScheduler,
} from './plan-reminders.scheduler';

/** Planes y suscripciones. `@Global` so any module can use {@link PlanGuard}
 *  and {@link PlansService.assertWithinLimit} without importing this module. */
@Global()
@Module({
  imports: [BullModule.registerQueue({ name: PLAN_REMINDERS_QUEUE })],
  controllers: [OrgPlanController, PlatformPlansController, PlanBillingWebhookController],
  // ADR-PAG-003: plans are charged with AdoptaFácil's OWN Mercado Pago account.
  providers: [
    PlansService,
    PlanGuard,
    PlanBillingService,
    MercadoPagoBillingClient,
    // Avisos de vencimiento, cobro fallido y fin de un plan cancelado (diario).
    PlanRemindersService,
    PlanRemindersScheduler,
    PlanRemindersProcessor,
  ],
  exports: [PlansService, PlanGuard],
})
export class PlansModule {}
