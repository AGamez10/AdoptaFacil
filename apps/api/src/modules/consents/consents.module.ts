import { Module } from '@nestjs/common';
import { AuthModule } from '../../core/auth/auth.module';
import { ConsentsController } from './consents.controller';
import { ConsentsService } from './consents.service';

/** Consentimiento de terceros para reportes y certificados (M13). */
@Module({
  imports: [AuthModule],
  controllers: [ConsentsController],
  providers: [ConsentsService],
})
export class ConsentsModule {}
