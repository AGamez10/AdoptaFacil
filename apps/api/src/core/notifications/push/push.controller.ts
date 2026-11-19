import { Body, Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import type { RequestUser } from '../../auth/auth.types';
import { CurrentUser } from '../../auth/current-user.decorator';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { ZodValidationPipe } from '../../auth/zod-validation.pipe';
import { WebPushService } from './web-push.service';

const subscribeSchema = z
  .object({
    endpoint: z.string().url().max(2000).startsWith('https://'),
    keys: z.object({
      p256dh: z.string().min(10).max(200),
      auth: z.string().min(5).max(200),
    }),
    userAgent: z.string().max(300).optional(),
  })
  .strict();

const unsubscribeSchema = z.object({ endpoint: z.string().url().max(2000) }).strict();

/** Avisos push del navegador o app instalada de la persona autenticada. */
@Controller('me/push')
@UseGuards(JwtAuthGuard)
export class PushController {
  constructor(private readonly push: WebPushService) {}

  /** Clave pública VAPID para suscribirse; `publicKey` es `null` si el push está apagado. */
  @Get('config')
  config(): { publicKey: string | null } {
    return { publicKey: this.push.publicKeyOrNull() };
  }

  @Post('subscriptions')
  @HttpCode(204)
  async subscribe(
    @CurrentUser() actor: RequestUser,
    @Body(new ZodValidationPipe(subscribeSchema))
    dto: z.infer<typeof subscribeSchema>,
  ): Promise<void> {
    await this.push.subscribe(actor, dto);
  }

  @Post('subscriptions/remove')
  @HttpCode(200)
  async unsubscribe(
    @CurrentUser() actor: RequestUser,
    @Body(new ZodValidationPipe(unsubscribeSchema))
    dto: z.infer<typeof unsubscribeSchema>,
  ): Promise<{ removed: number }> {
    return { removed: await this.push.unsubscribe(actor, dto.endpoint) };
  }
}
