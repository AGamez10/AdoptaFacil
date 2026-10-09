import { Global, Module } from '@nestjs/common';
import { PlanGuard } from './plan.guard';
import { OrgPlanController, PlatformPlansController } from './plans.controller';
import { PlansService } from './plans.service';

/** Planes y suscripciones. `@Global` so any module can use {@link PlanGuard}
 *  and {@link PlansService.assertWithinLimit} without importing this module. */
@Global()
@Module({
  controllers: [OrgPlanController, PlatformPlansController],
  providers: [PlansService, PlanGuard],
  exports: [PlansService, PlanGuard],
})
export class PlansModule {}
