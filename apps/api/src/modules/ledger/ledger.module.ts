import { Module } from '@nestjs/common';
import { AuthModule } from '../../core/auth/auth.module';
import { OrgLedgerController, PublicLedgerController } from './ledger.controller';
import { LedgerService } from './ledger.service';

/** RF14 · Libro público de transparencia (movimientos manuales + donaciones en línea). */
@Module({
  imports: [AuthModule],
  controllers: [OrgLedgerController, PublicLedgerController],
  providers: [LedgerService],
})
export class LedgerModule {}
