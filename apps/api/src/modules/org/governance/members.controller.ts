import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Put,
  UseGuards,
} from '@nestjs/common';
import { type ChangeMemberRoleInput, type OrgTeamView, Role } from '@adoptafacil/contracts';
import type { RequestUser } from '../../../core/auth/auth.types';
import { CurrentUser } from '../../../core/auth/current-user.decorator';
import { JwtAuthGuard } from '../../../core/auth/jwt-auth.guard';
import { ZodValidationPipe } from '../../../core/auth/zod-validation.pipe';
import { Roles } from '../../../core/rbac/roles.decorator';
import { RolesGuard } from '../../../core/rbac/roles.guard';
import { changeMemberRoleSchema } from './governance.schemas';
import { MembersService } from './members.service';

/** Equipo de la organización (pantalla "Miembros"). Propietario y
 *  administradores; lo que toca a un propietario lo decide el servicio. */
@Controller('org/members')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.Owner, Role.Administrator)
export class MembersController {
  constructor(private readonly members: MembersService) {}

  @Get()
  list(): Promise<OrgTeamView> {
    return this.members.list();
  }

  @Put(':userId/role')
  @HttpCode(204)
  changeRole(
    @CurrentUser() actor: RequestUser,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body(new ZodValidationPipe(changeMemberRoleSchema)) dto: ChangeMemberRoleInput,
  ): Promise<void> {
    return this.members.changeRole(actor.id, userId, dto.role);
  }

  @Delete(':userId')
  @HttpCode(204)
  remove(
    @CurrentUser() actor: RequestUser,
    @Param('userId', ParseUUIDPipe) userId: string,
  ): Promise<void> {
    return this.members.remove(actor.id, userId);
  }
}
