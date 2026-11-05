import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import {
  type ResourceOffer,
  type ResourceOfferProof,
  type ValidateResourceOfferProofInput,
} from '@adoptafacil/contracts';
import type { RequestUser } from '../../core/auth/auth.types';
import { CurrentUser } from '../../core/auth/current-user.decorator';
import { JwtAuthGuard } from '../../core/auth/jwt-auth.guard';
import { ZodValidationPipe } from '../../core/auth/zod-validation.pipe';
import { Roles } from '../../core/rbac/roles.decorator';
import { RolesGuard } from '../../core/rbac/roles.guard';
import { RESOURCE_VIEW_ROLES, RESOURCE_WRITE_ROLES } from './resource-needs.controller';
import { validateResourceOfferProofSchema } from './resource-offers.schemas';
import {
  ResourceOfferProofsService,
  type UploadedProofFile,
} from './resource-offer-proofs.service';
import { RequireFeature } from '../../core/features';
import { setServeHeaders } from '../../core/storage/serve-headers';

/**
 * M09 — prueba del donante y su validación, anidadas bajo la oferta.
 *   - `POST proofs` (multipart `file`): cualquier autenticado, SOLO sobre su
 *     propia oferta (cross-tenant por identidad; el servicio lo impone).
 *   - `GET proofs`, `GET proofs/:proofId/file`: Owner/Administrator/Operator/
 *     ReadOnlyAuditor de la organización beneficiaria (RLS).
 *   - `PATCH proof-validation`: aprobar/rechazar — Owner/Administrator/Operator.
 */
@RequireFeature('resources')
@Controller('resources/offers/:offerId')
export class ResourceOfferProofsController {
  constructor(private readonly service: ResourceOfferProofsService) {}

  @Post('proofs')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('file'))
  attach(
    @CurrentUser() actor: RequestUser,
    @Param('offerId', ParseUUIDPipe) offerId: string,
    @UploadedFile() file: UploadedProofFile | undefined,
  ): Promise<ResourceOfferProof> {
    return this.service.attach(actor, offerId, file);
  }

  @Get('proofs')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(...RESOURCE_VIEW_ROLES)
  list(@Param('offerId', ParseUUIDPipe) offerId: string): Promise<ResourceOfferProof[]> {
    return this.service.list(offerId);
  }

  @Get('proofs/:proofId/file')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(...RESOURCE_VIEW_ROLES)
  async file(
    @CurrentUser() actor: RequestUser,
    @Param('offerId', ParseUUIDPipe) offerId: string,
    @Param('proofId', ParseUUIDPipe) proofId: string,
    @Res() res: Response,
  ): Promise<void> {
    const proof = await this.service.download(actor.id, offerId, proofId);
    // Tipo real por los bytes, en línea si es PDF o imagen, aislado con `sandbox`.
    setServeHeaders(res, proof.filename, proof.data);
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(proof.data);
  }

  @Patch('proof-validation')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(...RESOURCE_WRITE_ROLES)
  validate(
    @CurrentUser() actor: RequestUser,
    @Param('offerId', ParseUUIDPipe) offerId: string,
    @Body(new ZodValidationPipe(validateResourceOfferProofSchema))
    dto: ValidateResourceOfferProofInput,
  ): Promise<ResourceOffer> {
    return this.service.validate(actor.id, offerId, dto);
  }
}
