import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  PayloadTooLargeException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DocumentType,
  type DocumentPrefill,
  type UploadOrganizationDocumentFileResult,
  type UploadOrganizationDocumentInput,
} from '@adoptafacil/contracts';
import type { Env } from '../../config/env.validation';
import { PlansService } from '../../core/plans/plans.service';
import { TenantContextService } from '../../core/tenant/tenant-context.service';
import { STORAGE_PORT, type StoragePort } from '../../core/storage/storage.port';
import { ALLOWED_CONTENT_TYPES } from '../../core/storage/storage-keys';
import { sniffContentType } from '../../core/storage/file-sniff';
import { optimizeImage } from '../../core/storage/image-optimizer';
import { DocumentsService } from './documents.service';
import {
  checkDocumentKind,
  extractLegalName,
  extractNit,
} from './document-verification/document-checks';
import {
  DOCUMENT_TEXT_PORT,
  type DocumentTextPort,
} from './document-verification/document-text.port';
import { isValidNit } from './document-verification/nit';

/** Lo mínimo de un archivo de multer en memoria (no hay @types/multer). */
export interface UploadedDocumentFile {
  buffer: Buffer;
  originalname: string;
  size: number;
}

const PREFILL_TYPES: readonly DocumentType[] = [
  DocumentType.Rut,
  DocumentType.ExistenceRepresentationCertificate,
];

/**
 * Subida de un documento legal EN UNA SOLA LLAMADA: el servidor recibe los
 * bytes, decide el tipo real por el contenido, lee el PDF y, si el archivo
 * claramente no es el documento pedido (una foto de un perro como "RUT", un
 * certificado de Cámara en la tarjeta del RUT), lo rechaza con un mensaje claro
 * ANTES de crear la versión. Así la cola del equipo solo recibe archivos que
 * pueden ser lo que dicen ser. Nada del contenido se registra ni se guarda
 * aparte del archivo (Ley 1581).
 */
@Injectable()
export class DocumentUploadService {
  private readonly maxMb: number;

  constructor(
    private readonly documents: DocumentsService,
    private readonly tenant: TenantContextService,
    private readonly plans: PlansService,
    @Inject(STORAGE_PORT) private readonly storage: StoragePort,
    @Inject(DOCUMENT_TEXT_PORT) private readonly reader: DocumentTextPort,
    config: ConfigService<Env, true>,
  ) {
    this.maxMb = config.get('STORAGE_MAX_FILE_MB', { infer: true });
  }

  async upload(
    actorUserId: string,
    input: Omit<UploadOrganizationDocumentInput, 'filename' | 'contentType'>,
    file: UploadedDocumentFile | undefined,
  ): Promise<UploadOrganizationDocumentFileResult> {
    const organizationId = this.tenant.getOrganizationId();
    if (!organizationId) throw new ForbiddenException('Missing tenant context');
    if (!file?.buffer?.length) {
      throw new BadRequestException('Adjunta el archivo del documento (campo "file").');
    }
    if (file.size > this.maxMb * 1024 * 1024) {
      throw new PayloadTooLargeException(`El archivo supera el límite de ${this.maxMb} MB.`);
    }
    const realType = sniffContentType(file.buffer);
    if (!realType || !ALLOWED_CONTENT_TYPES.includes(realType)) {
      throw new BadRequestException(
        'Ese archivo no es un PDF ni una imagen (JPG, PNG, WebP o GIF). Sube el documento en PDF o una foto clara.',
      );
    }

    const text =
      realType === 'application/pdf' ? await this.reader.extractText(file.buffer, realType) : null;
    const verdict = checkDocumentKind(input.type, text);
    if (verdict.result === 'mismatch') {
      throw new UnprocessableEntityException({
        statusCode: 422,
        error: 'document_kind_mismatch',
        message: verdict.message,
        ...(verdict.looksLike ? { looksLike: verdict.looksLike } : {}),
      });
    }

    const optimized = await optimizeImage(file.buffer, realType);
    if (!optimized) {
      throw new BadRequestException('La imagen está dañada y no se pudo abrir. Toma otra foto.');
    }
    await this.plans.assertStorageAvailable(organizationId, optimized.buffer.length);

    // Bytes primero, versión después: si algo falla entre los dos pasos queda a
    // lo sumo un archivo huérfano, nunca una versión "pendiente" sin archivo.
    const filename = file.originalname || 'documento';
    const reserved = await this.storage.createUploadTarget({
      organizationId,
      filename,
      contentType: optimized.contentType,
    });
    await this.storage.saveObject(reserved.key, optimized.buffer, optimized.contentType);
    const { document } = await this.documents.upload(
      actorUserId,
      { ...input, filename, contentType: optimized.contentType },
      reserved,
    );

    const prefill =
      verdict.result === 'match' && text && PREFILL_TYPES.includes(input.type)
        ? prefillFrom(document.id, text)
        : undefined;
    return {
      document,
      check: { result: verdict.result, message: verdict.message },
      ...(prefill ? { prefill } : {}),
    };
  }
}

function prefillFrom(documentId: string, text: string): DocumentPrefill | undefined {
  const nit = extractNit(text);
  const legalName = extractLegalName(text);
  const validNit = nit && isValidNit(nit.base, nit.dv) ? `${nit.base}-${nit.dv}` : undefined;
  if (!validNit && !legalName) return undefined;
  return {
    documentId,
    readable: true,
    ...(validNit ? { nit: validNit } : {}),
    ...(legalName ? { legalName } : {}),
  };
}
