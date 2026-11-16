import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type {
  CustodyPublicCheckout,
  CustodyPublicPayment,
  CustodyPublicPaymentStatus,
} from '@adoptafacil/contracts';
import { ZodValidationPipe } from '../../core/auth/zod-validation.pipe';
import { CustodyOnlinePaymentsService } from './custody-online-payments.service';
import { publicCheckoutSchema } from './custody.schemas';

/**
 * Página pública de pago de un cobro de guardería o custodia. SIN sesión: el
 * enlace que la organización comparte es la credencial, y solo deja ver ese
 * cobro (sin datos del responsable) y pagarlo. Un enlace o una referencia que
 * no existen responden el mismo 404 genérico.
 */
@Controller('public/custody')
@Throttle({ default: { limit: 60, ttl: 60_000 } })
export class CustodyPublicPaymentsController {
  constructor(private readonly service: CustodyOnlinePaymentsService) {}

  @Get('pay/status/:reference')
  status(@Param('reference') reference: string): Promise<CustodyPublicPaymentStatus> {
    return this.service.publicStatus(reference);
  }

  @Get('pay/:token')
  get(@Param('token') token: string): Promise<CustodyPublicPayment> {
    return this.service.getPublic(token);
  }

  @Post('pay/:token/checkout')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 10 * 60_000 } })
  checkout(
    @Param('token') token: string,
    @Body(new ZodValidationPipe(publicCheckoutSchema)) dto: { amountCop?: number },
  ): Promise<CustodyPublicCheckout> {
    return this.service.checkout(token, dto);
  }
}
