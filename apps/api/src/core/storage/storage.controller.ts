import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  NotFoundException,
  PayloadTooLargeException,
  Put,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { Role } from '@adoptafacil/contracts';
import { AuditService } from '../audit/audit.service';
import type { Env } from '../../config/env.validation';
import { PrismaService } from '../../prisma/prisma.service';
import { PlansService } from '../plans/plans.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedRequest, RequestUser } from '../auth/auth.types';
import {
  PLATFORM_SECURITY_CONFIG,
  type PlatformSecurityConfig,
} from '../auth/mfa/platform-security.config';
import { enforcePlatformMfa } from '../rbac/platform-mfa.policy';
import { STORAGE_PORT, type StoragePort } from './storage.port';
import { isAllowedUpload, parseByteRange, parseStorageKey } from './storage-keys';
import { optimizeImage, sniffImageContentType } from './image-optimizer';

/** Minimal shape of a multer memory-storage file (no @types/multer installed). */
interface UploadedFileLike {
  buffer: Buffer;
  mimetype: string;
  size: number;
  originalname: string;
}

/**
 * Serves file bytes THROUGH the API (T-108) so access control runs before any
 * byte leaves the server — files live outside the webroot with unguessable keys.
 *
 *   PUT  /storage/upload?key=…   → JWT; upload only to your OWN org's key; size +
 *                                  type validated; audited.
 *   GET  /storage/public?key=…   → open (animal photos, org logos).
 *   GET  /storage/private?key=…  → JWT; only the OWNING org's Owner or a Platform
 *                                  admin; every download audited (UTC).
 *
 * Guards are per-method (the public GET has none). The key carries its own
 * visibility + org, validated on every request; a wrong org/role → 403/404.
 */
@Controller('storage')
export class StorageController {
  private readonly maxBytes: number;
  private readonly maxMb: number;

  constructor(
    @Inject(STORAGE_PORT) private readonly storage: StoragePort,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly plans: PlansService,
    config: ConfigService<Env, true>,
    @Inject(PLATFORM_SECURITY_CONFIG) private readonly platformSecurity: PlatformSecurityConfig,
  ) {
    this.maxMb = config.get('STORAGE_MAX_FILE_MB', { infer: true });
    this.maxBytes = this.maxMb * 1024 * 1024;
  }

  private async rolesOf(userId: string): Promise<Set<string>> {
    const rows = await this.prisma.withTenant((tx) => tx.userRole.findMany({ where: { userId } }));
    return new Set(rows.map((row) => row.role));
  }

  @Put('upload')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @CurrentUser() user: RequestUser,
    @Query('key') key: string,
    @UploadedFile() file: UploadedFileLike | undefined,
  ): Promise<{ key: string; url: string }> {
    const parsed = parseStorageKey(key ?? '');
    if (!parsed) {
      throw new BadRequestException('Invalid storage key');
    }
    // You can only upload bytes to a key reserved for YOUR organization.
    if (user.organizationId !== parsed.organizationId) {
      throw new ForbiddenException('Cannot upload to another organization');
    }
    if (!file || !file.buffer) {
      throw new BadRequestException('A file is required (multipart field "file")');
    }
    if (file.size > this.maxBytes) {
      throw new PayloadTooLargeException(`File exceeds the ${this.maxMb} MB limit`);
    }
    if (!isAllowedUpload(file.mimetype, parsed.visibility)) {
      throw new BadRequestException(`Unsupported content type: ${file.mimetype}`);
    }

    // Las fotos se recomprimen a WebP antes de guardar; el original ya pasó el límite.
    const optimized = await optimizeImage(file.buffer, file.mimetype);
    if (!optimized) {
      throw new BadRequestException('La imagen no se pudo procesar');
    }

    // Cuota de espacio del plan (solo con los planes encendidos).
    await this.plans.assertStorageAvailable(parsed.organizationId, optimized.buffer.length);
    await this.storage.saveObject(key, optimized.buffer, optimized.contentType);
    await this.audit.record({
      organizationId: parsed.organizationId,
      actorUserId: user.id,
      action: 'storage.uploaded',
      entityType: 'storage_object',
      entityId: key,
      metadata: { visibility: parsed.visibility },
    });
    return { key, url: this.storage.resolvePublicUrl(key) };
  }

  @Get('public')
  async servePublic(
    @Query('key') key: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const parsed = parseStorageKey(key ?? '');
    if (!parsed || parsed.visibility !== 'public') {
      throw new NotFoundException();
    }
    const object = await this.storage.readObject(key);
    if (!object) {
      throw new NotFoundException();
    }
    res.setHeader('Content-Type', servedContentType(object));
    // Plan de escala (B2): la clave lleva un uuid nuevo por archivo, así que su
    // contenido no cambia; la CDN y el navegador la guardan 30 días y la API
    // solo atiende los fallos de caché. 30 días (no un año) para que una foto
    // borrada deje de circular pronto aunque nadie purgue la CDN.
    res.setHeader('Cache-Control', 'public, max-age=2592000, immutable');
    // Rangos de bytes: Safari en iPhone no reproduce un video sin ellos.
    res.setHeader('Accept-Ranges', 'bytes');
    const size = object.data.length;
    const range = parseByteRange(req.headers.range, size);
    if (range === 'invalid') {
      res.status(416).setHeader('Content-Range', `bytes */${size}`);
      res.end();
      return;
    }
    if (range) {
      res.status(206).setHeader('Content-Range', `bytes ${range.start}-${range.end}/${size}`);
      res.send(object.data.subarray(range.start, range.end + 1));
      return;
    }
    res.send(object.data);
  }

  @Get('private')
  @UseGuards(JwtAuthGuard)
  async servePrivate(
    @CurrentUser() user: RequestUser,
    @Query('key') key: string,
    @Req() req: AuthenticatedRequest,
    @Res() res: Response,
  ): Promise<void> {
    const parsed = parseStorageKey(key ?? '');
    if (!parsed || parsed.visibility !== 'private') {
      throw new NotFoundException();
    }
    // Legal/clinical documents: only the OWNING org's Owner, or a platform admin.
    const roles = await this.rolesOf(user.id);
    const isPlatform = roles.has(Role.PlatformAdmin) || roles.has(Role.PlatformSuperAdmin);
    const isOwnerOfOwningOrg =
      user.organizationId === parsed.organizationId && roles.has(Role.Owner);
    if (!isPlatform && !isOwnerOfOwningOrg) {
      throw new ForbiddenException('Not allowed to download this document');
    }
    // F19: reaching another org's document only through platform authority
    // needs a fresh second factor, and lands in the staff member's team trail.
    if (!isOwnerOfOwningOrg) {
      const platformRoles = [Role.PlatformAdmin, Role.PlatformSuperAdmin].filter((r) =>
        roles.has(r),
      );
      await enforcePlatformMfa(req, platformRoles, this.prisma, this.platformSecurity);
    }

    const object = await this.storage.readObject(key);
    if (!object) {
      throw new NotFoundException();
    }
    // Audit the access under the OWNING org (who downloaded which object), UTC,
    // no content — only the object id + visibility.
    await this.audit.record({
      organizationId: parsed.organizationId,
      actorUserId: user.id,
      action: 'storage.document_downloaded',
      entityType: 'storage_object',
      entityId: key,
      metadata: { visibility: 'private' },
    });
    res.setHeader('Content-Type', servedContentType(object));
    res.send(object.data);
  }
}

/**
 * Tipo con el que se sirve un objeto. Las fotos recomprimidas conservan la clave
 * .jpg/.png, así que el tipo real sale de los bytes cuando son imagen.
 */
function servedContentType(object: { data: Buffer; contentType?: string }): string {
  const declared = object.contentType ?? 'application/octet-stream';
  if (!declared.startsWith('image/')) return declared;
  return sniffImageContentType(object.data) ?? declared;
}
