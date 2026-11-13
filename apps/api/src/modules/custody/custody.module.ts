import { Module } from '@nestjs/common';
import { AuthModule } from '../../core/auth/auth.module';
import { CustodyBillingService } from './custody-billing.service';
import { CustodyContractsService } from './custody-contracts.service';
import { CustodyCoreService } from './custody-core.service';
import { CustodyRecordsService } from './custody-records.service';
import { CustodyReportsService } from './custody-reports.service';
import { CustodyController } from './custody.controller';

/**
 * Documentación, ingreso, custodia y guardería de animales: actas, contratos,
 * cuenta del responsable (cobros, pagos, prórrogas) y reportes de animales.
 */
@Module({
  imports: [AuthModule],
  controllers: [CustodyController],
  providers: [
    CustodyCoreService,
    CustodyRecordsService,
    CustodyContractsService,
    CustodyBillingService,
    CustodyReportsService,
  ],
})
export class CustodyModule {}
