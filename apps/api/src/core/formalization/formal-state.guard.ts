import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { OrganizationCapability } from '@adoptafacil/contracts';
import type { AuthenticatedRequest } from '../auth/auth.types';
import { FormalCapabilitiesService } from './formal-capabilities.service';
import { REQUIRED_FORMAL_CAPABILITY_KEY } from './require-formal-state.decorator';

/** Hace cumplir {@link RequireFormalState}. Rutas sin el decorador pasan intactas. */
@Injectable()
export class FormalStateGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly capabilities: FormalCapabilitiesService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const capability = this.reflector.getAllAndOverride<OrganizationCapability | undefined>(
      REQUIRED_FORMAL_CAPABILITY_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!capability) {
      return true;
    }
    const user = context.switchToHttp().getRequest<AuthenticatedRequest>().user;
    if (!user?.organizationId) {
      throw new ForbiddenException('Missing authenticated principal');
    }
    await this.capabilities.assertCapability(user.organizationId, capability);
    return true;
  }
}
