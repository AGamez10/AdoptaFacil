import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  Role,
  type DocumentPrefill,
  type OrganizationDocument,
  type UploadOrganizationDocumentFileResult,
  type UploadOrganizationDocumentInput,
  type UploadOrganizationDocumentResult,
  type VerificationLevel,
} from '@adoptafacil/contracts';
import type { RequestUser } from '../../core/auth/auth.types';
import { CurrentUser } from '../../core/auth/current-user.decorator';
import { JwtAuthGuard } from '../../core/auth/jwt-auth.guard';
import { ZodValidationPipe } from '../../core/auth/zod-validation.pipe';
import { Roles } from '../../core/rbac/roles.decorator';
import { RolesGuard } from '../../core/rbac/roles.guard';
import { DocumentsService } from './documents.service';
import { DocumentVerificationService } from './document-verification/document-verification.service';
import { DocumentUploadService, type UploadedDocumentFile } from './document-upload.service';
import { uploadDocumentFileSchema, uploadDocumentSchema } from './documents.schemas';

/** Tope duro del multipart (antes de leerlo entero en memoria); el límite fino
 *  es STORAGE_MAX_FILE_MB, que valida el servicio con su mensaje. */
const DOCUMENT_MULTIPART_LIMIT_BYTES = 100 * 1024 * 1024;

/**
 * M01 organization documents (RF03) — tenant-scoped (RLS). Uploading/renewing a
 * document is restricted to Owner/Administrator; viewing the documents and the
 * computed verification level additionally allows the ReadOnlyAuditor. Platform
 * REVIEW (cross-tenant) is a separate, platform-gated controller.
 */
@Controller('org/documents')
@UseGuards(JwtAuthGuard)
export class DocumentsController {
  constructor(
    private readonly service: DocumentsService,
    private readonly documentReader: DocumentVerificationService,
    private readonly fileUploads: DocumentUploadService,
  ) {}

  /** List the org's documents (effective status reflects expiry). */
  @Get()
  @UseGuards(RolesGuard)
  @Roles(Role.Owner, Role.Administrator, Role.ReadOnlyAuditor)
  list(): Promise<OrganizationDocument[]> {
    return this.service.list();
  }

  /** Verification level computed from Approved & current documents. */
  @Get('verification')
  @UseGuards(RolesGuard)
  @Roles(Role.Owner, Role.Administrator, Role.ReadOnlyAuditor)
  verification(): Promise<VerificationLevel> {
    return this.service.getVerification();
  }

  /** Upload a new document version / renew (subsanación). Owner/Administrator. */
  @Post()
  @UseGuards(RolesGuard)
  @Roles(Role.Owner, Role.Administrator)
  upload(
    @CurrentUser() actor: RequestUser,
    @Body(new ZodValidationPipe(uploadDocumentSchema)) dto: UploadOrganizationDocumentInput,
  ): Promise<UploadOrganizationDocumentResult> {
    return this.service.upload(actor.id, dto);
  }

  /**
   * Sube el documento con su archivo en una sola llamada (multipart: `file`,
   * `type`, `issuedAt?`, `expiresAt?`). El servidor valida el tipo REAL por el
   * contenido y rechaza (422) un PDF legible que no es el documento elegido.
   * Es la vía que usa la web; `POST /org/documents` + `PUT /storage/upload`
   * siguen para clientes existentes (contrato aditivo).
   */
  @Post('file')
  @UseGuards(RolesGuard)
  @Roles(Role.Owner, Role.Administrator)
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: DOCUMENT_MULTIPART_LIMIT_BYTES, files: 1 } }),
  )
  uploadFile(
    @CurrentUser() actor: RequestUser,
    @Body(new ZodValidationPipe(uploadDocumentFileSchema))
    dto: Omit<UploadOrganizationDocumentInput, 'filename' | 'contentType'>,
    @UploadedFile() file: UploadedDocumentFile | undefined,
  ): Promise<UploadOrganizationDocumentFileResult> {
    return this.fileUploads.upload(actor.id, dto, file);
  }

  /** Lee el RUT o el certificado de Cámara subido y devuelve NIT y razón social
   *  para llenar el perfil con un clic. Solo lectura. Owner/Administrator. */
  @Get(':id/prefill')
  @UseGuards(RolesGuard)
  @Roles(Role.Owner, Role.Administrator)
  prefill(@Param('id', new ParseUUIDPipe()) id: string): Promise<DocumentPrefill> {
    return this.documentReader.prefill(id);
  }
}
