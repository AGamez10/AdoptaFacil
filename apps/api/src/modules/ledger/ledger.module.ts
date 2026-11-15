import { Module } from '@nestjs/common';
import { AuthModule } from '../../core/auth/auth.module';
import { OrgLedgerController, PublicLedgerController } from './ledger.controller';
import { LedgerService } from './ledger.service';
import { NationalTransparencyService } from './national-transparency.service';

/** RF14 · Libro público de transparencia (movimientos manuales + donaciones en línea). */
@Module({
  imports: [AuthModule],
  controllers: [OrgLedgerController, PublicLedgerController],
  providers: [LedgerService, NationalTransparencyService],
})
export class LedgerModule {}
