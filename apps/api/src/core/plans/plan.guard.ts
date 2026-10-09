import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { PlanCapability } from '@adoptafacil/contracts';
import type { AuthenticatedRequest } from '../auth/auth.types';
import { PlansService } from './plans.service';
import { REQUIRED_PLAN_CAPABILITY_KEY } from './require-plan.decorator';

/** Enforces {@link RequirePlan}. Routes without the decorator are untouched. */
@Injectable()
export class PlanGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly plans: PlansService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const capability = this.reflector.getAllAndOverride<PlanCapability | undefined>(
      REQUIRED_PLAN_CAPABILITY_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!capability) {
      return true;
    }
    const user = context.switchToHttp().getRequest<AuthenticatedRequest>().user;
    if (!user) {
      throw new ForbiddenException('Missing authenticated principal');
    }
    await this.plans.assertCapability(user.organizationId, capability);
    return true;
  }
}
