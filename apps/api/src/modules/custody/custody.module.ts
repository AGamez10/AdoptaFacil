import { Module } from '@nestjs/common';
import { AuthModule } from '../../core/auth/auth.module';
import { MercadoPagoAccountsModule } from '../payments/mercadopago-accounts.module';
import { CustodyBillingService } from './custody-billing.service';
import { CustodyContractsService } from './custody-contracts.service';
import { CustodyCoreService } from './custody-core.service';
import { CustodyOnlinePaymentsService } from './custody-online-payments.service';
import { CustodyPublicPaymentsController } from './custody-public-payments.controller';
import { CustodyRecordsService } from './custody-records.service';
import { CustodyReportsService } from './custody-reports.service';
import { CustodyController } from './custody.controller';

/**
 * Documentación, ingreso, custodia y guardería de animales: actas, contratos,
 * cuenta del responsable (cobros, pagos, prórrogas) y reportes de animales.
 */
@Module({
  // MercadoPagoAccountsModule: el pago en línea usa la cuenta de Mercado Pago
  // de la PROPIA organización (la misma conexión de donaciones), nunca la de
  // AdoptaFácil.
  imports: [AuthModule, MercadoPagoAccountsModule],
  controllers: [CustodyController, CustodyPublicPaymentsController],
  providers: [
    CustodyCoreService,
    CustodyRecordsService,
    CustodyContractsService,
    CustodyBillingService,
    CustodyReportsService,
    CustodyOnlinePaymentsService,
  ],
  // El aviso de órdenes de Mercado Pago llega a una sola URL (DonationsModule),
  // que entrega aquí las referencias de pagos de guardería.
  exports: [CustodyOnlinePaymentsService],
})
export class CustodyModule {}
