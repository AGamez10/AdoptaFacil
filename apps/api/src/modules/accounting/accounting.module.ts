import { Module } from '@nestjs/common';
import { AuthModule } from '../../core/auth/auth.module';
import { DonationsModule } from '../donations/donations.module';
import { ReportsModule } from '../reports/reports.module';
import { AccountingController, AccountingPublicController } from './accounting.controller';
import { AccountingService } from './accounting.service';

/**
 * Contabilidad de donaciones por detrás (sección 2A): libro auxiliar inmutable,
 * conciliación mensual contra Mercado Pago, cierre de mes, exportes para el
 * contador y el paquete "listo para firmar" del contador / revisor fiscal.
 * `DonationsModule` relee Mercado Pago; `ReportsModule` genera el libro
 * firmable y su flujo de firma por correo.
 */
@Module({
  imports: [AuthModule, DonationsModule, ReportsModule],
  controllers: [AccountingController, AccountingPublicController],
  providers: [AccountingService],
})
export class AccountingModule {}
