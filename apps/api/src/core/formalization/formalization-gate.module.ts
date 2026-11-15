import { Global, Module } from '@nestjs/common';
import { FormalCapabilitiesService } from './formal-capabilities.service';
import { FormalStateGuard } from './formal-state.guard';

/** Funciones por estado formal. `@Global` para que cualquier módulo use
 *  {@link FormalStateGuard} sin importarlo. */
@Global()
@Module({
  providers: [FormalCapabilitiesService, FormalStateGuard],
  exports: [FormalCapabilitiesService, FormalStateGuard],
})
export class FormalizationGateModule {}
