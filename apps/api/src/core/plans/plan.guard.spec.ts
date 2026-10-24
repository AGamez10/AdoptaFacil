import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PlanGuard } from './plan.guard';
import type { PlansService } from './plans.service';
import { RequirePlan } from './require-plan.decorator';

class Gated {
  @RequirePlan('customDomain')
  handler(): void {}

  open(): void {}
}

function contextFor(
  method: 'handler' | 'open',
  user?: { organizationId: string },
): ExecutionContext {
  return {
    getHandler: () => Gated.prototype[method],
    getClass: () => Gated,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

describe('PlanGuard', () => {
  const assertCapability = jest.fn();
  const guard = new PlanGuard(new Reflector(), {
    assertCapability,
  } as unknown as PlansService);

  beforeEach(() => assertCapability.mockReset());

  it('lets routes without @RequirePlan through without looking up the plan', async () => {
    await expect(guard.canActivate(contextFor('open'))).resolves.toBe(true);
    expect(assertCapability).not.toHaveBeenCalled();
  });

  it('checks the capability against the org of the authenticated principal', async () => {
    assertCapability.mockResolvedValue(undefined);
    await expect(
      guard.canActivate(contextFor('handler', { organizationId: 'org-a' })),
    ).resolves.toBe(true);
    expect(assertCapability).toHaveBeenCalledWith('org-a', 'customDomain');
  });

  it('propagates PLAN_REQUIRED when the plan lacks the capability', async () => {
    assertCapability.mockRejectedValue(new ForbiddenException({ code: 'PLAN_REQUIRED' }));
    await expect(
      guard.canActivate(contextFor('handler', { organizationId: 'org-a' })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('denies a gated route without an authenticated principal', async () => {
    await expect(guard.canActivate(contextFor('handler'))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
