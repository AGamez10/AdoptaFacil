import { Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import { Role, type OrgSigner } from '@adoptafacil/contracts';
import type { RequestUser } from '../../../core/auth/auth.types';
import { CurrentUser } from '../../../core/auth/current-user.decorator';
import { JwtAuthGuard } from '../../../core/auth/jwt-auth.guard';
import { Roles } from '../../../core/rbac/roles.decorator';
import { RolesGuard } from '../../../core/rbac/roles.guard';
import { SignersService } from './signers.service';

/** Firmantes adicionales de la organización (M13). Ver `SignersService`. */
@Controller('org/signers')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SignersController {
  constructor(private readonly signers: SignersService) {}

  @Get()
  @Roles(Role.Owner, Role.Administrator)
  list(): Promise<OrgSigner[]> {
    return this.signers.list();
  }

  @Delete(':id')
  @HttpCode(204)
  @Roles(Role.Owner)
  revoke(@CurrentUser() actor: RequestUser, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.signers.revoke(actor.id, id);
  }
}
