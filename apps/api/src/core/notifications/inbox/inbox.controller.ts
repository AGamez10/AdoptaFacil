import { Body, Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import type { MarkUserNotificationsReadInput, UserNotificationsPage } from '@adoptafacil/contracts';
import type { RequestUser } from '../../auth/auth.types';
import { CurrentUser } from '../../auth/current-user.decorator';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { ZodValidationPipe } from '../../auth/zod-validation.pipe';
import { InboxService } from './inbox.service';

const markReadSchema = z
  .object({
    ids: z.array(z.string().uuid()).min(1).max(50).optional(),
    all: z.literal(true).optional(),
  })
  .strict()
  .refine((value) => value.all === true || (value.ids?.length ?? 0) > 0, {
    message: 'Indica ids o all',
  });

/**
 * Bandeja de avisos de la persona autenticada (cualquier tipo de cuenta). Cada
 * quien lee y marca solo los suyos: el servicio filtra por su id y la RLS por
 * su tenant.
 */
@Controller('me/notifications')
@UseGuards(JwtAuthGuard)
export class InboxController {
  constructor(private readonly inbox: InboxService) {}

  @Get()
  list(@CurrentUser() actor: RequestUser): Promise<UserNotificationsPage> {
    return this.inbox.list(actor);
  }

  @Post('read')
  @HttpCode(200)
  async markRead(
    @CurrentUser() actor: RequestUser,
    @Body(new ZodValidationPipe(markReadSchema)) dto: MarkUserNotificationsReadInput,
  ): Promise<{ updated: number }> {
    return { updated: await this.inbox.markRead(actor, dto) };
  }
}
