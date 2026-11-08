import { ForbiddenException, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  FormalizationState,
  formalizationRequiredError,
  isCapabilityEnabled,
  type OrganizationCapability,
} from '@adoptafacil/contracts';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Aplica en el servidor la matriz estado formal → funciones
 * (`CAPABILITY_RULES` en contracts, docs/legal/estados-formales-y-funciones.md).
 * La web lee la misma matriz, así que lo que la pantalla muestra bloqueado la
 * API también lo rechaza: 403 `FORMALIZATION_REQUIRED` con el estado que falta.
 */
@Injectable()
export class FormalCapabilitiesService {
  constructor(private readonly prisma: PrismaService) {}

  private async stateOf(
    tx: Prisma.TransactionClient,
    organizationId: string,
  ): Promise<{ state: FormalizationState; rteVigente: boolean }> {
    const profile = await tx.organizationProfile.findUnique({
      where: { organizationId },
      select: { formalizationState: true, rteVigente: true },
    });
    return {
      state: (profile?.formalizationState as FormalizationState) ?? FormalizationState.Informal,
      rteVigente: profile?.rteVigente ?? false,
    };
  }

  /** 403 `FORMALIZATION_REQUIRED` si el estado formal de la organización no
   *  habilita `capability`. Pasa `tx` cuando ya hay una transacción abierta. */
  async assertCapability(
    organizationId: string,
    capability: OrganizationCapability,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const { state, rteVigente } = tx
      ? await this.stateOf(tx, organizationId)
      : await this.prisma.withOrgContext(organizationId, (t) => this.stateOf(t, organizationId));
    if (!isCapabilityEnabled(capability, state, rteVigente)) {
      throw new ForbiddenException(formalizationRequiredError(capability, state));
    }
  }
}
