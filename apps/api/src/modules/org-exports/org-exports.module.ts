import { Module } from '@nestjs/common';
import { AuthModule } from '../../core/auth/auth.module';
import { OrgExportsController } from './org-exports.controller';
import { OrgExportsService } from './org-exports.service';

/**
 * Exportaciones de la organización: sus datos a Excel (`dataExport`) y el
 * reporte de impacto en PDF para donantes (`impactReport`). Lo que
 * protege al animal, al adoptante o la transparencia (reportes regulatorios,
 * comprobantes) sigue gratis en sus propios módulos; aquí solo va comodidad.
 */
@Module({
  imports: [AuthModule],
  controllers: [OrgExportsController],
  providers: [OrgExportsService],
})
export class OrgExportsModule {}
