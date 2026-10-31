import { Module } from '@nestjs/common';
import { AuthModule } from '../../core/auth/auth.module';
import { OrgModule } from '../org/org.module';
import {
  ReportsController,
  ReportsPublicController,
  SignatureRequestsPublicController,
} from './reports.controller';
import { ReportsService } from './reports.service';

/**
 * M13 · Reportes de la organización: informe de donaciones y reporte de
 * servicio social, sellados (folio + SHA-256), idempotentes y con las firmas
 * del representante legal / revisor fiscal / contador que correspondan.
 * `OrgModule` se importa SOLO por `LegalRepresentativeService` (firmas).
 */
@Module({
  imports: [AuthModule, OrgModule],
  controllers: [ReportsController, ReportsPublicController, SignatureRequestsPublicController],
  providers: [ReportsService],
})
export class ReportsModule {}
