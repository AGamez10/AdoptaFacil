import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import type { Prisma, LegalRepresentative as LegalRepresentativeRow } from '@prisma/client';
import {
  Role,
  type LegalRepresentative,
  type LegalRepresentativeDocumentType,
  type LegalRepresentativeRole,
  type LegalRepresentativeStatus,
  type RegisterLegalRepresentativeInput,
} from '@adoptafacil/contracts';
import { AuditService } from '../../core/audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContextService } from '../../core/tenant/tenant-context.service';
import { STORAGE_PORT, type StoragePort } from '../../core/storage/storage.port';
import {
  SIGNATURE_ENCRYPTION_CONFIG,
  decryptSignature,
  encryptSignature,
  hashSignature,
  type SignatureEncryptionConfig,
} from '../../core/crypto/signature-crypto';

/** The CURRENT legal representative's public identity + DECRYPTED signature
 *  image bytes — for another module to print on an official document (e.g.
 *  M08's volunteer certificate). Never the encrypted payload nor the key. */
export interface LegalRepresentativeSigner {
  fullName: string;
  position: string;
  /** Raw image bytes (PNG, from `SignaturePad`'s canvas export) — ready to
   *  embed directly in a PDF via `pdf-lib`'s `embedPng`. */
  signatureImage: Buffer;
  /** Clave opaca (StoragePort) del archivo CIFRADO de esa firma y su SHA-256.
   *  Aditivo: permite que un documento firmado congele qué firma se usó, aunque
   *  después se registre otro representante (append-only). */
  signatureFileRef: string;
  signatureHash: string;
}

function toContract(row: LegalRepresentativeRow): LegalRepresentative {
  return {
    id: row.id,
    organizationId: row.organizationId,
    memberId: row.memberId,
    role: row.role as LegalRepresentativeRole,
    fullName: row.fullName,
    documentType: row.documentType as LegalRepresentativeDocumentType,
    documentNumber: row.documentNumber,
    position: row.position,
    signatureFileRef: row.signatureFileRef,
    signatureHash: row.signatureHash,
    status: row.status as LegalRepresentativeStatus,
    signedAt: row.signedAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * M01 legal representative signature (S-1, RF14 relacionado / RNF10),
 * tenant-scoped via RLS. `legal_representatives` is append-only (DB-enforced,
 * see the migration): registering again never mutates the previous row — it
 * inserts a new one, and "vigente" is always the most recently `signedAt`
 * record for the organization, computed here at read time.
 */
@Injectable()
export class LegalRepresentativeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
    private readonly audit: AuditService,
    @Inject(STORAGE_PORT) private readonly storage: StoragePort,
    @Inject(SIGNATURE_ENCRYPTION_CONFIG) private readonly config: SignatureEncryptionConfig,
  ) {}

  private requireOrgId(): string {
    const organizationId = this.tenant.getOrganizationId();
    if (!organizationId) {
      throw new ForbiddenException('Missing tenant context');
    }
    return organizationId;
  }

  /**
   * Quién puede registrar QUÉ firma. Nadie firma por otro ni acumula cargos:
   * - `legal_representative`: solo un Owner de la organización (por defecto el
   *   representante legal es quien controla la cuenta de la organización).
   * - `accountant` / `fiscal_reviewer`: solo la persona que la organización
   *   vinculó con ese cargo (designación vigente, creada por invitación del
   *   Owner). Un Owner NO puede registrarlas a su nombre.
   * - Una misma persona no puede ser vigente en dos cargos de firma.
   */
  private async assertMayRegister(
    tx: Prisma.TransactionClient,
    organizationId: string,
    actorUserId: string,
    role: LegalRepresentativeRole,
  ): Promise<void> {
    if (role === 'legal_representative') {
      const isOwner = await tx.userRole.findFirst({
        where: { organizationId, userId: actorUserId, role: Role.Owner },
        select: { id: true },
      });
      if (!isOwner) {
        throw new ForbiddenException(
          'Solo el propietario de la organización registra la firma del representante legal.',
        );
      }
    } else {
      const designation = await tx.orgSignerDesignation.findFirst({
        where: { organizationId, userId: actorUserId, role, revokedAt: null },
        select: { id: true },
      });
      if (!designation) {
        throw new ForbiddenException(
          'Esta firma solo la registra la persona que la organización vinculó con ese cargo.',
        );
      }
    }
    const others = await tx.legalRepresentative.findMany({
      where: { organizationId, memberId: actorUserId, role: { not: role } },
      select: { role: true },
      take: 1,
    });
    if (others.length > 0) {
      throw new ConflictException(
        'Una misma persona no puede firmar en dos cargos distintos de la organización.',
      );
    }
  }

  /**
   * Register (or re-register, e.g. a change of representative/accountant/
   * fiscal reviewer) the CALLER's own signature UNDER `input.role`. `memberId`
   * is ALWAYS the authenticated actor, never a client-supplied id — combined
   * with the controller's `@Roles(Role.Owner)` gate, this makes "only the
   * Owner can create/update THEIR OWN signature" structurally true rather
   * than an extra check to remember.
   *
   * Requerimiento #16: registering a role never replaces another role's
   * current record — "vigente" is scoped to `(organizationId, role)`, so an
   * org can keep a legal representative, an accountant, AND a fiscal reviewer
   * all current at once, each independently re-signable.
   *
   * The signature is encrypted (AES-256-GCM) BEFORE it ever reaches
   * StoragePort — no plaintext bytes are written anywhere, not even
   * transiently — and only its SHA-256 hash + the encrypted file's opaque key
   * are persisted. Audit metadata never includes the signature content.
   */
  async register(
    actorUserId: string,
    input: RegisterLegalRepresentativeInput,
    /** Solo para el enlace de firma por correo (sin sesión): la organización
     *  sale del token, no del JWT. Las mismas reglas de `assertMayRegister`. */
    organizationIdFromToken?: string,
  ): Promise<LegalRepresentative> {
    const organizationId = organizationIdFromToken ?? this.requireOrgId();

    // Antes de escribir nada en el almacenamiento: quien no puede firmar bajo
    // este cargo no deja ni un archivo huérfano.
    await this.prisma.withOrgContext(organizationId, (tx) =>
      this.assertMayRegister(tx, organizationId, actorUserId, input.role),
    );

    const plaintext = Buffer.from(input.signatureBase64, 'base64');
    if (plaintext.length === 0) {
      throw new BadRequestException('La firma está vacía o no es una imagen válida.');
    }

    const signatureHash = hashSignature(plaintext);
    const encrypted = encryptSignature(plaintext, this.config.signatureEncryptionKey);

    const stored = await this.storage.createUploadTarget({
      organizationId,
      filename: 'signature.enc',
      visibility: 'private',
    });
    await this.storage.saveObject(stored.key, encrypted, 'application/octet-stream');

    return this.prisma.withOrgContext(organizationId, async (tx) => {
      await this.assertMayRegister(tx, organizationId, actorUserId, input.role);
      const signedAt = new Date();
      const row = await tx.legalRepresentative.create({
        data: {
          organizationId,
          memberId: actorUserId,
          role: input.role,
          fullName: input.fullName.trim(),
          documentType: input.documentType,
          documentNumber: input.documentNumber.trim(),
          position: input.position.trim(),
          signatureFileRef: stored.key,
          signatureHash,
          signedAt,
        },
      });

      await this.audit.recordWithTx(tx, {
        organizationId,
        actorUserId,
        action: 'organization.legal_representative_registered',
        entityType: 'legal_representative',
        entityId: row.id,
        // Metadata only — NEVER the signature bytes/content, only identifiers.
        metadata: { role: row.role, fullName: row.fullName, position: row.position },
      });

      return toContract(row);
    });
  }

  /** The CURRENT (most recently signed) record for EACH role the caller's org
   *  has ever registered — at most one entry per role, never empty slots for
   *  roles nobody has registered yet (requerimiento #16). */
  async getAllCurrent(): Promise<LegalRepresentative[]> {
    const organizationId = this.requireOrgId();
    return this.prisma.withOrgContext(organizationId, async (tx) => {
      const latestPerRole = await tx.legalRepresentative.groupBy({
        by: ['role'],
        where: { organizationId },
        _max: { signedAt: true },
      });
      if (latestPerRole.length === 0) {
        return [];
      }
      const rows = await tx.legalRepresentative.findMany({
        where: {
          organizationId,
          OR: latestPerRole.map((group) => ({
            role: group.role,
            signedAt: group._max.signedAt ?? undefined,
          })),
        },
        orderBy: { role: 'asc' },
      });
      return rows.map(toContract);
    });
  }

  /**
   * Same lookup as {@link getAllCurrent}, scoped to ONE role, but by an
   * EXPLICIT `organizationId` instead of the caller's own tenant context —
   * for a cross-module reader that renders ANOTHER organization's official
   * document (e.g. M08's volunteer certificate, viewed by the cross-tenant
   * volunteer themselves, who has no tenant context matching the issuing
   * org). Also decrypts the signature image here, so the encryption key never
   * leaves this service. Defaults to `'legal_representative'` — the only role
   * that existed before requerimiento #16 — so existing callers don't need to
   * change.
   *
   * Returns `null` — never throws — when no signer of that role has been
   * registered, or if the stored bytes fail to decrypt (tampered/corrupted):
   * a broken signature must never take down certificate generation; the
   * caller falls back to a generic "Representante Legal" placeholder.
   */
  async getCurrentSignerForOrg(
    organizationId: string,
    role: LegalRepresentativeRole = 'legal_representative',
  ): Promise<LegalRepresentativeSigner | null> {
    const row = await this.prisma.withOrgContext(organizationId, (tx) =>
      tx.legalRepresentative.findFirst({
        where: { organizationId, role },
        orderBy: { signedAt: 'desc' },
      }),
    );
    if (!row) {
      return null;
    }

    const stored = await this.storage.readObject(row.signatureFileRef);
    if (!stored) {
      return null;
    }

    try {
      const signatureImage = decryptSignature(stored.data, this.config.signatureEncryptionKey);
      return {
        fullName: row.fullName,
        position: row.position,
        signatureImage,
        signatureFileRef: row.signatureFileRef,
        signatureHash: row.signatureHash,
      };
    } catch {
      return null;
    }
  }

  /**
   * M13 (reportes): la imagen de UNA firma concreta, por el id del registro
   * (append-only, así que un id siempre apunta a la misma firma). Se usa para
   * volver a dibujar un reporte sellado con LAS MISMAS firmas con las que se
   * generó, aunque después se haya registrado una firma nueva. Verifica que el
   * SHA-256 de los bytes descifrados coincida con `expectedHash` (el sellado en
   * el reporte); si no coincide, no se puede leer o no existe, devuelve `null`
   * — nunca lanza, y nunca devuelve una firma de otra organización (RLS +
   * filtro explícito por `organizationId`).
   */
  async getSignatureImageById(
    organizationId: string,
    legalRepresentativeId: string,
    expectedHash: string,
  ): Promise<Buffer | null> {
    try {
      const row = await this.prisma.withOrgContext(organizationId, (tx) =>
        tx.legalRepresentative.findFirst({
          where: { id: legalRepresentativeId, organizationId },
        }),
      );
      if (!row || row.signatureHash !== expectedHash) {
        return null;
      }
      const stored = await this.storage.readObject(row.signatureFileRef);
      if (!stored) {
        return null;
      }
      const image = decryptSignature(stored.data, this.config.signatureEncryptionKey);
      return hashSignature(image) === expectedHash ? image : null;
    } catch {
      return null;
    }
  }
}
