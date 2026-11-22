import { Module } from '@nestjs/common';
import { AuthModule } from '../../core/auth/auth.module';
import { MyTeamWorkController, TeamAssignmentsController } from './team.controller';
import { TeamService } from './team.service';

/**
 * Trabajo del equipo por cargo: encargos (tareas y animales a cargo), "Mi
 * trabajo" de cada persona y la bitácora de cuidados. Usa los módulos globales
 * del núcleo (tenant, rbac, auditoría, almacenamiento, bandeja de avisos).
 */
@Module({
  imports: [AuthModule],
  controllers: [MyTeamWorkController, TeamAssignmentsController],
  providers: [TeamService],
})
export class TeamModule {}
