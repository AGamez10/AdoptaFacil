import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  DocumentType,
  FormalizationState,
  type DocumentPrefill,
  type DocumentVerificationReport,
} from '@adoptafacil/contracts';
import { TenantContextService } from '../../../core/tenant/tenant-context.service';
import { STORAGE_PORT, type StoragePort } from '../../../core/storage/storage.port';
import { PrismaService } from '../../../prisma/prisma.service';
import { PlatformDocumentsService } from '../platform-documents.service';
import { buildVerificationReport, extractLegalName, extractNit } from './document-checks';
import { isValidNit } from './nit';
import { DOCUMENT_TEXT_PORT, type DocumentTextPort } from './document-text.port';

/**
 * Informe de verificación automática de un documento en la cola de plataforma.
 * Solo lee: no cambia el documento ni el estado de la organización, y no guarda
 * el texto leído (el informe se recalcula cada vez; nada sensible persiste).
 * La decisión la sigue tomando una persona con `POST /platform/documents/:id/decision`.
 */
@Injectable()
export class DocumentVerificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
    private readonly platformDocuments: PlatformDocumentsService,
    @Inject(STORAGE_PORT) private readonly storage: StoragePort,
    @Inject(DOCUMENT_TEXT_PORT) private readonly reader: DocumentTextPort,
  ) {}

  async report(documentId: string, now: Date = new Date()): Promise<DocumentVerificationReport> {
    // La cola (función SECURITY DEFINER acotada) es la única vía cross-tenant:
    // solo se verifica lo que está pendiente de revisión.
    const item = (await this.platformDocuments.queue()).find((doc) => doc.id === documentId);
    if (!item) throw new NotFoundException('Document not found in the review queue');

    const { profile, rep } = await this.prisma.withOrgContext(item.organizationId, async (tx) => ({
      profile: await tx.organizationProfile.findUnique({
        where: { organizationId: item.organizationId },
        select: { nit: true, legalName: true, formalizationState: true },
      }),
      rep: await tx.legalRepresentative.findFirst({
        where: { organizationId: item.organizationId, role: 'legal_representative' },
        orderBy: { signedAt: 'desc' },
        select: { fullName: true, documentNumber: true },
      }),
    }));

    const stored = await this.storage.readObject(item.storageRef);
    const text = stored ? await this.reader.extractText(stored.data, stored.contentType) : null;

    return buildVerificationReport(item, text, {
      profileNit: profile?.nit,
      legalName: profile?.legalName,
      organizationName: item.organizationName,
      currentState:
        (profile?.formalizationState as FormalizationState | undefined) ??
        FormalizationState.Informal,
      legalRepresentative: rep,
      now,
    });
  }

  /**
   * Datos para llenar el perfil desde un RUT o certificado de Cámara que la
   * propia organización subió. Lee por RLS (solo documentos de su organización)
   * y no escribe nada: la organización decide si los usa.
   */
  async prefill(documentId: string): Promise<DocumentPrefill> {
    const organizationId = this.tenant.getOrganizationId();
    if (!organizationId) throw new ForbiddenException('Missing tenant context');
    const doc = await this.prisma.withOrgContext(organizationId, (tx) =>
      tx.organizationDocument.findFirst({
        where: { id: documentId, organizationId },
        select: { id: true, type: true, storageRef: true },
      }),
    );
    if (
      !doc ||
      (doc.type !== DocumentType.Rut &&
        doc.type !== DocumentType.ExistenceRepresentationCertificate)
    ) {
      throw new NotFoundException('Document not found');
    }
    const stored = await this.storage.readObject(doc.storageRef);
    const text = stored ? await this.reader.extractText(stored.data, stored.contentType) : null;
    if (text === null) return { documentId: doc.id, readable: false };
    const nit = extractNit(text);
    const legalName = extractLegalName(text);
    return {
      documentId: doc.id,
      readable: true,
      ...(nit && isValidNit(nit.base, nit.dv) ? { nit: `${nit.base}-${nit.dv}` } : {}),
      ...(legalName ? { legalName } : {}),
    };
  }
}
