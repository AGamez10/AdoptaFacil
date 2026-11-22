import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  type AnimalCareLog,
  CARE_LOG_VIEW_ROLES,
  type CompleteTeamAssignmentInput,
  type CreateAnimalCareLogInput,
  type CreateTeamAssignmentInput,
  type MyMemberPermissions,
  type MyTeamWork,
  Role,
  TEAM_ASSIGN_ROLES,
  TEAM_WORK_ROLES,
  type TeamAssignee,
  type TeamAssignment,
  type TeamAssignmentStatus,
} from '@adoptafacil/contracts';
import type { RequestUser } from '../../core/auth/auth.types';
import { CurrentUser } from '../../core/auth/current-user.decorator';
import { JwtAuthGuard } from '../../core/auth/jwt-auth.guard';
import { ZodValidationPipe } from '../../core/auth/zod-validation.pipe';
import { Roles } from '../../core/rbac/roles.decorator';
import { RolesGuard } from '../../core/rbac/roles.guard';
import {
  completeTeamAssignmentSchema,
  createAnimalCareLogSchema,
  createTeamAssignmentSchema,
  listTeamAssignmentsQuerySchema,
} from './team.schemas';
import { TeamService } from './team.service';

/**
 * Encargos del equipo: quien coordina (propietario, administrador, operador)
 * le encarga tareas y animales a una persona. El auditor solo consulta.
 */
@Controller('team')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TeamAssignmentsController {
  constructor(private readonly team: TeamService) {}

  @Get('assignees')
  @Roles(...TEAM_ASSIGN_ROLES)
  assignees(): Promise<TeamAssignee[]> {
    return this.team.listAssignees();
  }

  @Get('assignments')
  @Roles(...TEAM_ASSIGN_ROLES, Role.ReadOnlyAuditor)
  list(
    @Query(new ZodValidationPipe(listTeamAssignmentsQuerySchema))
    query: {
      assigneeUserId?: string;
      status?: TeamAssignmentStatus;
    },
  ): Promise<TeamAssignment[]> {
    return this.team.list(query);
  }

  @Post('assignments')
  @Roles(...TEAM_ASSIGN_ROLES)
  create(
    @CurrentUser() actor: RequestUser,
    @Body(new ZodValidationPipe(createTeamAssignmentSchema)) dto: CreateTeamAssignmentInput,
  ): Promise<TeamAssignment> {
    return this.team.create(actor.id, dto);
  }

  @Post('assignments/:id/cancel')
  @HttpCode(200)
  @Roles(...TEAM_ASSIGN_ROLES)
  cancel(
    @CurrentUser() actor: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<TeamAssignment> {
    return this.team.cancel(actor.id, id);
  }

  /** Bitácora de cuidados de cualquier animal, para quien lleva su ficha. */
  @Get('animals/:animalId/care-logs')
  @Roles(...CARE_LOG_VIEW_ROLES)
  careLogs(@Param('animalId', ParseUUIDPipe) animalId: string): Promise<AnimalCareLog[]> {
    return this.team.careLogs(animalId);
  }
}

/**
 * "Mi trabajo": lo que tiene a su cargo la persona que pregunta. Todo el equipo
 * operativo entra (también voluntario y colaborador temporal); el servicio solo
 * le muestra y le deja tocar lo suyo.
 */
@Controller('team/me')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...TEAM_WORK_ROLES)
export class MyTeamWorkController {
  constructor(private readonly team: TeamService) {}

  @Get('work')
  work(@CurrentUser() actor: RequestUser): Promise<MyTeamWork> {
    return this.team.myWork(actor.id);
  }

  @Get('permissions')
  permissions(@CurrentUser() actor: RequestUser): Promise<MyMemberPermissions> {
    return this.team.myPermissions(actor.id);
  }

  @Post('assignments/:id/complete')
  @HttpCode(200)
  complete(
    @CurrentUser() actor: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(completeTeamAssignmentSchema)) dto: CompleteTeamAssignmentInput,
  ): Promise<TeamAssignment> {
    return this.team.complete(actor.id, id, dto.note);
  }

  @Get('animals/:animalId/care-logs')
  careLogs(
    @CurrentUser() actor: RequestUser,
    @Param('animalId', ParseUUIDPipe) animalId: string,
  ): Promise<AnimalCareLog[]> {
    return this.team.myCareLogs(actor.id, animalId);
  }

  @Post('animals/:animalId/care-logs')
  addCareLog(
    @CurrentUser() actor: RequestUser,
    @Param('animalId', ParseUUIDPipe) animalId: string,
    @Body(new ZodValidationPipe(createAnimalCareLogSchema)) dto: CreateAnimalCareLogInput,
  ): Promise<AnimalCareLog> {
    return this.team.addCareLog(actor.id, animalId, dto);
  }
}
