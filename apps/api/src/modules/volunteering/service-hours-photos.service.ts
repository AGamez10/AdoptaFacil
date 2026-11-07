import { createHash } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import sharp from 'sharp';
import { SERVICE_HOURS_MAX_PHOTOS, type ServiceHoursPhoto } from '@adoptafacil/contracts';
import { AuditService } from '../../core/audit/audit.service';
import type { RequestUser } from '../../core/auth/auth.types';
import { sniffImageContentType } from '../../core/storage/image-optimizer';
import { STORAGE_PORT, type StoragePort } from '../../core/storage/storage.port';
import { TenantContextService } from '../../core/tenant/tenant-context.service';
import { PrismaService } from '../../prisma/prisma.service';

/** Minimal shape of a multer memory-storage file (no @types/multer installed). */
export interface UploadedPhotoFile {
  buffer: Buffer;
  mimetype: string;
  size: number;
  originalname: string;
}

/** Tope de lo que se recibe (antes de normalizar): una foto de celular cabe. */
export const SERVICE_HOURS_PHOTO_MAX_UPLOAD_BYTES = 12 * 1024 * 1024;
/** Lado mayor tras normalizar: se lee bien en el reporte y pesa poco. */
const PHOTO_MAX_EDGE_PX = 1280;
const PHOTO_INPUT_PIXEL_LIMIT = 80_000_000;

/** Fila de `add_service_hours_photo` (SQL crudo, snake_case). */
interface PhotoSqlRow {
  id: string;
  service_hours_id: string;
  content_type: string;
  size_bytes: number;
  created_at: Date;
}

const PHOTO_DB_ERRORS: ReadonlyArray<readonly [RegExp, string]> = [
  [
    /certificate has already been issued/i,
    'Ya se emitió el certificado de esta inscripción: no se pueden agregar más fotos.',
  ],
  [/entry was rejected/i, 'La organización rechazó esta sesión: no se le pueden agregar fotos.'],
  [
    /photo limit reached/i,
    `Cada sesión admite hasta ${SERVICE_HOURS_MAX_PHOTOS} fotos de la jornada.`,
  ],
];

export function toPhoto(row: {
  id: string;
  serviceHoursId: string;
  contentType: string;
  sizeBytes: number;
  createdAt: Date;
}): ServiceHoursPhoto {
  return {
    id: row.id,
    serviceHoursId: row.serviceHoursId,
    contentType: row.contentType,
    sizeBytes: row.sizeBytes,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Normaliza una foto a JPEG (orientación EXIF aplicada, metadatos y GPS fuera,
 * lado mayor ≤ 1280 px). JPEG porque el reporte en PDF (pdf-lib) solo incrusta
 * JPEG/PNG. `null` si los bytes no son una imagen que se pueda leer.
 */
export async function normalizeServiceHoursPhoto(buffer: Buffer): Promise<Buffer | null> {
  const type = sniffImageContentType(buffer);
  if (!type || type === 'image/gif') return null;
  try {
    return await sharp(buffer, { limitInputPixels: PHOTO_INPUT_PIXEL_LIMIT })
      .rotate()
      .resize({
        width: PHOTO_MAX_EDGE_PX,
        height: PHOTO_MAX_EDGE_PX,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: 78, mozjpeg: true })
      .toBuffer();
  } catch {
    return null;
  }
}

/**
 * Fotos de la jornada (RF18). El voluntario las adjunta a SU sesión de horas
 * (cross-tenant por identidad, `add_service_hours_photo`); la organización las
 * ve y las descarga dentro de su tenant (RLS), y entran a su reporte de
 * voluntariado. Archivo PRIVADO: nunca se sirve en público.
 */
@Injectable()
export class ServiceHoursPhotosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
    private readonly audit: AuditService,
    @Inject(STORAGE_PORT) private readonly storage: StoragePort,
  ) {}

  private requireOrgId(): string {
    const organizationId = this.tenant.getOrganizationId();
    if (!organizationId) {
      throw new ForbiddenException('Missing tenant context');
    }
    return organizationId;
  }

  async attach(
    actor: RequestUser,
    serviceHoursId: string,
    file: UploadedPhotoFile | undefined,
  ): Promise<ServiceHoursPhoto> {
    if (!file || !file.buffer) {
      throw new BadRequestException('Se requiere una foto (campo multipart "file").');
    }
    if (file.size > SERVICE_HOURS_PHOTO_MAX_UPLOAD_BYTES) {
      throw new PayloadTooLargeException('La foto supera el límite de 12 MB.');
    }
    const jpeg = await normalizeServiceHoursPhoto(file.buffer);
    if (!jpeg) {
      throw new BadRequestException('El archivo no es una foto válida (JPG, PNG o WebP).');
    }

    // Antes de guardar bytes: una sesión ajena o inexistente no deja archivos huérfanos.
    const owner = await this.prisma.$queryRaw<Array<{ organization_id: string }>>(
      Prisma.sql`SELECT organization_id FROM service_hours_owner_org(${serviceHoursId}::uuid, ${actor.id}::uuid)`,
    );
    const organizationId = owner[0]?.organization_id;
    if (!organizationId) {
      throw new NotFoundException('Esa sesión de horas no existe o no es tuya.');
    }

    const stored = await this.storage.createUploadTarget({
      organizationId,
      filename: 'jornada.jpg',
      contentType: 'image/jpeg',
      visibility: 'private',
    });
    await this.storage.saveObject(stored.key, jpeg, 'image/jpeg');
    const sha256 = createHash('sha256').update(jpeg).digest('hex');

    let rows: PhotoSqlRow[];
    try {
      rows = await this.prisma.$queryRaw<PhotoSqlRow[]>(Prisma.sql`
        SELECT * FROM add_service_hours_photo(
          ${serviceHoursId}::uuid, ${actor.id}::uuid, ${stored.key}, ${'image/jpeg'},
          ${jpeg.length}::int, ${sha256}, ${SERVICE_HOURS_MAX_PHOTOS}::int
        )
      `);
    } catch (error) {
      await this.storage.deleteObject?.(stored.key).catch(() => undefined);
      const message = error instanceof Error ? error.message : String(error);
      const friendly = PHOTO_DB_ERRORS.find(([pattern]) => pattern.test(message));
      if (friendly) throw new BadRequestException(friendly[1]);
      throw error;
    }
    const row = rows[0];
    if (!row) {
      await this.storage.deleteObject?.(stored.key).catch(() => undefined);
      throw new NotFoundException('Esa sesión de horas no existe o no es tuya.');
    }
    await this.audit.record({
      organizationId,
      actorUserId: actor.id,
      action: 'volunteering.service_hours_photo_added',
      entityType: 'service_hours_photo',
      entityId: row.id,
      metadata: { serviceHoursId, sizeBytes: row.size_bytes },
    });
    return {
      id: row.id,
      serviceHoursId: row.service_hours_id,
      contentType: row.content_type,
      sizeBytes: row.size_bytes,
      createdAt: row.created_at.toISOString(),
    };
  }

  /** Bytes de una foto para la organización dueña (RLS + filtro explícito). */
  async download(
    actorUserId: string,
    serviceHoursId: string,
    photoId: string,
  ): Promise<{ data: Buffer; filename: string }> {
    const organizationId = this.requireOrgId();
    const photo = await this.prisma.withOrgContext(organizationId, (tx) =>
      tx.serviceHoursPhoto.findFirst({
        where: { id: photoId, serviceHoursId, organizationId },
      }),
    );
    if (!photo) {
      throw new NotFoundException('Foto no encontrada');
    }
    const stored = await this.storage.readObject(photo.storageRef);
    if (!stored) {
      throw new NotFoundException('Foto no encontrada');
    }
    await this.audit.record({
      organizationId,
      actorUserId,
      action: 'volunteering.service_hours_photo_downloaded',
      entityType: 'service_hours_photo',
      entityId: photo.id,
      metadata: { serviceHoursId },
    });
    return { data: stored.data, filename: `jornada-${photo.id.slice(0, 8)}.jpg` };
  }
}
