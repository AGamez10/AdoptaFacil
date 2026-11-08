import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Role, type AddOrgSignerInput, type OrgSigner } from '@adoptafacil/contracts';
import { z } from 'zod';
import type { RequestUser } from '../../../core/auth/auth.types';
import { CurrentUser } from '../../../core/auth/current-user.decorator';
import { JwtAuthGuard } from '../../../core/auth/jwt-auth.guard';
import { Roles } from '../../../core/rbac/roles.decorator';
import { RolesGuard } from '../../../core/rbac/roles.guard';
import { ZodValidationPipe } from '../../../core/auth/zod-validation.pipe';
import { SignersService } from './signers.service';

const addSignerSchema = z
  .object({
    email: z.string().trim().toLowerCase().email().max(254),
    fullName: z.string().trim().min(1).max(200),
    role: z.enum(['accountant', 'fiscal_reviewer']),
    statutoryDeclaration: z.literal(true),
  })
  .strict();

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

  /** Vincula (o reemplaza) al contador o revisor fiscal por su correo. */
  @Post()
  @Roles(Role.Owner)
  add(
    @CurrentUser() actor: RequestUser,
    @Body(new ZodValidationPipe(addSignerSchema)) dto: AddOrgSignerInput,
  ): Promise<OrgSigner> {
    return this.signers.add(actor.id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @Roles(Role.Owner)
  revoke(@CurrentUser() actor: RequestUser, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.signers.revoke(actor.id, id);
  }
}
