import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { FormalizationState, type DocumentVerificationReport } from '@adoptafacil/contracts';
import { STORAGE_PORT, type StoragePort } from '../../../core/storage/storage.port';
import { PrismaService } from '../../../prisma/prisma.service';
import { PlatformDocumentsService } from '../platform-documents.service';
import { buildVerificationReport } from './document-checks';
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
}
