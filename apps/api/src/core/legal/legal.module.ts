import { Global, Module } from '@nestjs/common';
import { LegalController } from './legal.controller';
import { LegalService } from './legal.service';

/**
 * Aceptación versionada de documentos legales. `@Global` para que el registro
 * (auth) y la donación invitada registren la aceptación en su misma transacción.
 */
@Global()
@Module({
  controllers: [LegalController],
  providers: [LegalService],
  exports: [LegalService],
})
export class LegalModule {}
