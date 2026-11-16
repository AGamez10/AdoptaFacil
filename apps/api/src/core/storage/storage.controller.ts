import {
  BadRequestException,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  NotFoundException,
  PayloadTooLargeException,
  Put,
  ServiceUnavailableException,
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
import { COMMUNITY_MEDIA_LIMITS, PORTAL_COVER_VIDEO_LIMITS, Role } from '@adoptafacil/contracts';
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
import { STORAGE_PORT, StorageObjectExistsError, type StoragePort } from './storage.port';
import { isAllowedUpload, parseByteRange, parseStorageKey } from './storage-keys';
import { optimizeImage } from './image-optimizer';
import { VideoRejectedError, VideoTranscoder, posterKeyFor } from '../media/video-transcoder';
import { sniffContentType } from './file-sniff';
import { setServeHeaders } from './serve-headers';
import { MULTIPART_HARD_LIMIT_BYTES } from './upload-limits';

/**
 * Org roles that may write bytes through `PUT /storage/upload`. Every org role
 * that creates information somewhere in the product; ReadOnlyAuditor does not
 * (packages/contracts/src/invitation-roles.ts). Which key a role may reserve is
 * still decided by each module's role-checked reservation endpoint.
 */
const UPLOAD_ORG_ROLES: ReadonlySet<string> = new Set<string>([
  Role.Owner,
  Role.Administrator,
  Role.Operator,
  Role.Veterinarian,
  Role.Volunteer,
  Role.TemporaryCollaborator,
]);

const ALREADY_UPLOADED =
  'Este archivo ya se subió y no se puede reemplazar. Sube una versión nueva.';

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
 *   PUT  /storage/upload?key=…   → JWT; upload only to your OWN org's key, with an
 *                                  active org role (organization accounts); each
 *                                  key written once; size + type validated; audited.
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
    private readonly videos: VideoTranscoder,
    config: ConfigService<Env, true>,
    @Inject(PLATFORM_SECURITY_CONFIG) private readonly platformSecurity: PlatformSecurityConfig,
  ) {
    this.maxMb = config.get('STORAGE_MAX_FILE_MB', { infer: true });
    this.maxBytes = this.maxMb * 1024 * 1024;
  }

  /** Atomic write-once in the adapter: a concurrent writer that got there
   *  first (the check above is not atomic) turns into the same 409. */
  private async writeOnce(write: () => Promise<void>): Promise<void> {
    try {
      await write();
    } catch (error) {
      if (error instanceof StorageObjectExistsError) {
        throw new ConflictException(ALREADY_UPLOADED);
      }
      throw error;
    }
  }

  private async rolesOf(userId: string): Promise<Set<string>> {
    const rows = await this.prisma.withTenant((tx) => tx.userRole.findMany({ where: { userId } }));
    return new Set(rows.map((row) => row.role));
  }

  @Put('upload')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MULTIPART_HARD_LIMIT_BYTES, files: 1 } }),
  )
  async upload(
    @CurrentUser() user: RequestUser,
    @Query('key') key: string,
    @UploadedFile() file: UploadedFileLike | undefined,
    @Query('media') media?: string,
  ): Promise<{ key: string; url: string }> {
    const parsed = parseStorageKey(key ?? '');
    if (!parsed) {
      throw new BadRequestException('Invalid storage key');
    }
    // You can only upload bytes to a key reserved for YOUR organization.
    if (user.organizationId !== parsed.organizationId) {
      throw new ForbiddenException('Cannot upload to another organization');
    }
    // Security remediation (`storage-upload-public-key-overwrite-no-rbac`,
    // `tenant-membership-not-revalidated`): an ORGANIZATION account writes bytes
    // only while it holds an org role that may create information. A removed
    // member (no role left) and a ReadOnlyAuditor get 403. Person accounts own
    // their personal organization without a role, so they are not checked here.
    if (user.accountType === 'organization') {
      const held = await this.rolesOf(user.id);
      if (![...held].some((role) => UPLOAD_ORG_ROLES.has(role))) {
        throw new ForbiddenException('Tu cargo no permite subir archivos a esta organización.');
      }
    }
    if (!file || !file.buffer) {
      throw new BadRequestException('A file is required (multipart field "file")');
    }
    // Un video de la comunidad (`media=post`) o el de portada del portal
    // (`media=portal`) puede pesar más antes de comprimirse; el resto de
    // archivos sigue con el límite general.
    const videoLimits =
      media === 'post'
        ? { mb: COMMUNITY_MEDIA_LIMITS.maxVideoMb, seconds: COMMUNITY_MEDIA_LIMITS.maxVideoSeconds }
        : media === 'portal'
          ? { mb: PORTAL_COVER_VIDEO_LIMITS.maxMb, seconds: PORTAL_COVER_VIDEO_LIMITS.maxSeconds }
          : null;
    const videoMaxBytes = (videoLimits?.mb ?? 0) * 1024 * 1024;
    if (file.size > Math.max(this.maxBytes, videoMaxBytes)) {
      throw new PayloadTooLargeException(`File exceeds the ${this.maxMb} MB limit`);
    }
    // El tipo se decide por el CONTENIDO, no por lo que declara el navegador ni
    // por la extensión: un "rut.pdf" que en realidad es HTML o un ejecutable no
    // entra, y lo guardado siempre se sirve con su tipo real.
    const realType = sniffContentType(file.buffer);
    const isMediaVideo =
      videoLimits !== null && parsed.visibility === 'public' && realType?.startsWith('video/');
    if (!realType || !(isMediaVideo || isAllowedUpload(realType, parsed.visibility))) {
      throw new BadRequestException(
        'El archivo no es un PDF ni una imagen válida (JPG, PNG, WebP o GIF). Revisa que no esté dañado y vuelve a intentarlo.',
      );
    }
    // Every key is written ONCE, public or private: a published file (campaign
    // accountability evidence, logo, animal photo) never changes behind the
    // same URL — the CDN even caches it as `immutable`. A correction is a new
    // reservation, i.e. a new key. Checked before any transcoding work.
    if (await this.storage.readObject(key)) {
      throw new ConflictException(ALREADY_UPLOADED);
    }
    // Video de una publicación de la comunidad o de la portada del portal: se
    // comprime a MP4 y se le saca la portada (sharp no procesa video; se usa
    // ffmpeg). Solo a llaves públicas.
    if (videoLimits && realType.startsWith('video/') && parsed.visibility === 'public') {
      // Security remediation run-2 F-01 (`storage-upload-video-poster-derived-key-overwrite`):
      // a video also writes a DERIVED key (`<key sin extensión>.poster.webp`).
      // Every video reservation ends in `.mp4`, so any other extension is not
      // a reservation (`…-video.mov` would derive the poster of an existing
      // `…-video.mp4`); and the derived poster is write-once too.
      if (!key.endsWith('.mp4')) {
        throw new BadRequestException('La llave de un video debe terminar en .mp4.');
      }
      if (await this.storage.readObject(posterKeyFor(key))) {
        throw new ConflictException(ALREADY_UPLOADED);
      }
      if (file.size > videoMaxBytes) {
        throw new PayloadTooLargeException(`El video supera el límite de ${videoLimits.mb} MB.`);
      }
      let result;
      try {
        result = await this.videos.transcode(file.buffer, { maxSeconds: videoLimits.seconds });
      } catch (error) {
        if (error instanceof VideoRejectedError) {
          // Sin ffmpeg en el equipo (desarrollo local sin instalarlo): el video
          // de portada se guarda tal cual si ya es liviano y el navegador lo
          // reproduce. Un video grande o .mov sí necesita comprimirse.
          if (
            error.kind === 'unavailable' &&
            media === 'portal' &&
            file.size <= this.maxBytes &&
            (realType === 'video/mp4' || realType === 'video/webm')
          ) {
            result = null;
          } else if (error.kind === 'unavailable') {
            throw new ServiceUnavailableException(error.message);
          } else {
            throw new BadRequestException(error.message);
          }
        } else {
          throw error;
        }
      }
      if (result) {
        await this.plans.assertStorageAvailable(
          parsed.organizationId,
          result.video.length + result.poster.length,
        );
        const stored = { maxBytes: Math.max(this.maxBytes, videoMaxBytes), ifNotExists: true };
        await this.writeOnce(() =>
          this.storage.saveObject(posterKeyFor(key), result.poster, 'image/webp', stored),
        );
        await this.writeOnce(() => this.storage.saveObject(key, result.video, 'video/mp4', stored));
        await this.audit.record({
          organizationId: parsed.organizationId,
          actorUserId: user.id,
          action: 'storage.uploaded',
          entityType: 'storage_object',
          entityId: key,
          metadata: {
            visibility: parsed.visibility,
            kind: 'video',
            seconds: result.durationSeconds,
          },
        });
        return { key, url: this.storage.resolvePublicUrl(key) };
      }
    }
    if (realType.startsWith('video/') && file.size > this.maxBytes) {
      throw new PayloadTooLargeException(`File exceeds the ${this.maxMb} MB limit`);
    }

    // Las fotos se recomprimen a WebP antes de guardar; el original ya pasó el límite.
    const optimized = await optimizeImage(file.buffer, realType);
    if (!optimized) {
      throw new BadRequestException('La imagen no se pudo procesar');
    }

    // Cuota de espacio del plan (solo con los planes encendidos).
    await this.plans.assertStorageAvailable(parsed.organizationId, optimized.buffer.length);
    await this.writeOnce(() =>
      this.storage.saveObject(key, optimized.buffer, optimized.contentType, {
        ifNotExists: true,
      }),
    );
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
    setServeHeaders(res, key, object.data);
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
    setServeHeaders(res, key, object.data);
    // Un documento legal no se queda en cachés del navegador ni de intermediarios.
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(object.data);
  }
}
