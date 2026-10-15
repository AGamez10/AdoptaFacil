import { Body, Controller, Get, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import {
  type AcceptLegalDocumentsInput,
  LEGAL_DOCUMENTS,
  type LegalDocumentDescriptor,
  type LegalStatus,
  type RevokeLegalDocumentInput,
} from '@adoptafacil/contracts';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { RequestUser } from '../auth/auth.types';
import { ZodValidationPipe } from '../auth/zod-validation.pipe';
import { legalContextFrom, LegalService } from './legal.service';
import { acceptLegalDocumentsSchema, revokeLegalDocumentSchema } from './legal.schemas';

/**
 * Documentos legales y su aceptación. La lista de documentos vigentes es
 * pública; el estado y las aceptaciones son siempre del propio usuario
 * autenticado (su tenant personal, nunca otro): no hay `:userId` en la ruta.
 */
@Controller()
export class LegalController {
  constructor(private readonly legal: LegalService) {}

  /** Versiones vigentes con su hash (para clientes y verificación externa). */
  @Get('public/legal/documents')
  documents(): readonly LegalDocumentDescriptor[] {
    return LEGAL_DOCUMENTS;
  }

  @Get('legal/me')
  @UseGuards(JwtAuthGuard)
  status(@CurrentUser() user: RequestUser): Promise<LegalStatus> {
    return this.legal.getStatus(user);
  }

  @Post('legal/me/acceptances')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  accept(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(acceptLegalDocumentsSchema)) dto: AcceptLegalDocumentsInput,
    @Req() req: Request,
  ): Promise<LegalStatus> {
    return this.legal.accept(user, dto.documents, legalContextFrom(req));
  }

  @Post('legal/me/revocations')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  revoke(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(revokeLegalDocumentSchema)) dto: RevokeLegalDocumentInput,
    @Req() req: Request,
  ): Promise<LegalStatus> {
    return this.legal.revoke(user, dto.key, legalContextFrom(req));
  }
}
