import { Module } from '@nestjs/common';
import { AuthModule } from '../../core/auth/auth.module';
import { PrivacyController } from './privacy.controller';
import { PrivacyService } from './privacy.service';

/** Consulta y supresión del titular (Ley 1581; auditoría run-2 C-01). */
@Module({
  imports: [AuthModule],
  controllers: [PrivacyController],
  providers: [PrivacyService],
})
export class PrivacyModule {}
