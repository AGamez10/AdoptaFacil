import { Body, Controller, HttpCode, Post, Query, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { EmailUnsubscribeInput, EmailUnsubscribeResult } from '@adoptafacil/contracts';
import { ZodValidationPipe } from '../auth/zod-validation.pipe';
import { emailUnsubscribeSchema } from './email-templates.schemas';
import { EmailTemplateService } from './templates/email-template.service';

/**
 * Public, no session: opt out of bulk emails (Ley 1581, revocatoria). Two
 * entry points, same idempotent effect:
 *  - the "No quiero recibir más correos" page (`/correo/baja`) POSTs `{h,t}`;
 *  - inbox one-click buttons (RFC 8058) POST `?h=&t=` with a form body.
 * The link proves itself with an HMAC; it never carries the address.
 */
@Controller('public/email')
@UseGuards(ThrottlerGuard)
@Throttle({ default: { limit: 20, ttl: 60_000 } })
export class PublicEmailController {
  constructor(private readonly templates: EmailTemplateService) {}

  @Post('unsubscribe')
  @HttpCode(200)
  async unsubscribe(
    @Query() query: Record<string, unknown>,
    @Body() body: unknown,
  ): Promise<EmailUnsubscribeResult> {
    const fromBody = body && typeof body === 'object' && 'h' in body ? body : undefined;
    const input = new ZodValidationPipe(emailUnsubscribeSchema).transform(
      fromBody ?? query,
    ) as EmailUnsubscribeInput;
    await this.templates.unsubscribe(input.h, input.t, fromBody ? 'link' : 'one_click');
    return { unsubscribed: true };
  }
}
