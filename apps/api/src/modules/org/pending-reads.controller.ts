import { Body, Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import { type MarkPendingReadInput, type PendingItemRead, Role } from '@adoptafacil/contracts';
import type { RequestUser } from '../../core/auth/auth.types';
import { CurrentUser } from '../../core/auth/current-user.decorator';
import { JwtAuthGuard } from '../../core/auth/jwt-auth.guard';
import { ZodValidationPipe } from '../../core/auth/zod-validation.pipe';
import { Roles } from '../../core/rbac/roles.decorator';
import { RolesGuard } from '../../core/rbac/roles.guard';
import { markPendingReadSchema } from './pending-reads.schemas';
import { PendingReadsService } from './pending-reads.service';

/** Everyone who sees the bell: the union of `GET /clinical-reminders` and
 *  `GET /org/summary` roles. Each person only reads/writes their own marks. */
const BELL_ROLES = [
  Role.Owner,
  Role.Administrator,
  Role.Operator,
  Role.Veterinarian,
  Role.ReadOnlyAuditor,
] as const;

/** Campana de pendientes: avisos que la persona ya marcó como leídos. */
@Controller('org/pending-reads')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PendingReadsController {
  constructor(private readonly service: PendingReadsService) {}

  @Get()
  @Roles(...BELL_ROLES)
  list(@CurrentUser() actor: RequestUser): Promise<PendingItemRead[]> {
    return this.service.list(actor.id);
  }

  @Post()
  @HttpCode(200)
  @Roles(...BELL_ROLES)
  markRead(
    @CurrentUser() actor: RequestUser,
    @Body(new ZodValidationPipe(markPendingReadSchema)) dto: MarkPendingReadInput,
  ): Promise<PendingItemRead[]> {
    return this.service.markRead(actor.id, dto.keys);
  }
}
