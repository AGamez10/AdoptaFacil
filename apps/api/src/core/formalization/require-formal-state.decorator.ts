import { SetMetadata } from '@nestjs/common';
import type { OrganizationCapability } from '@adoptafacil/contracts';

export const REQUIRED_FORMAL_CAPABILITY_KEY = 'formalization:required-capability';

/**
 * Exige que el estado formal de la organización habilite `capability`
 * (matriz `CAPABILITY_RULES`). Con {@link FormalStateGuard}, DESPUÉS de
 * JwtAuthGuard y RolesGuard: la organización sale del JWT, nunca de un header.
 * Sin el estado responde 403 `FORMALIZATION_REQUIRED` con lo que falta.
 */
export const RequireFormalState = (
  capability: OrganizationCapability,
): MethodDecorator & ClassDecorator => SetMetadata(REQUIRED_FORMAL_CAPABILITY_KEY, capability);
