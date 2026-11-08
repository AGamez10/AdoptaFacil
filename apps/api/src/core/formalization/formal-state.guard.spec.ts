import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { OrganizationCapability } from '@adoptafacil/contracts';
import type { FormalCapabilitiesService } from './formal-capabilities.service';
import { FormalStateGuard } from './formal-state.guard';
import { RequireFormalState } from './require-formal-state.decorator';

class Gated {
  @RequireFormalState(OrganizationCapability.MarketplaceSales)
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

describe('FormalStateGuard', () => {
  const assertCapability = jest.fn();
  const guard = new FormalStateGuard(new Reflector(), {
    assertCapability,
  } as unknown as FormalCapabilitiesService);

  beforeEach(() => assertCapability.mockReset());

  it('deja pasar rutas sin @RequireFormalState sin consultar el estado', async () => {
    await expect(guard.canActivate(contextFor('open'))).resolves.toBe(true);
    expect(assertCapability).not.toHaveBeenCalled();
  });

  it('verifica la función contra la organización del JWT', async () => {
    assertCapability.mockResolvedValue(undefined);
    await expect(
      guard.canActivate(contextFor('handler', { organizationId: 'org-a' })),
    ).resolves.toBe(true);
    expect(assertCapability).toHaveBeenCalledWith('org-a', OrganizationCapability.MarketplaceSales);
  });

  it('propaga FORMALIZATION_REQUIRED cuando el estado no la habilita', async () => {
    assertCapability.mockRejectedValue(new ForbiddenException({ code: 'FORMALIZATION_REQUIRED' }));
    await expect(
      guard.canActivate(contextFor('handler', { organizationId: 'org-a' })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('niega una ruta protegida sin sesión', async () => {
    await expect(guard.canActivate(contextFor('handler'))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
