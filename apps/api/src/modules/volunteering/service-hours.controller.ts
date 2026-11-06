import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import {
  type DecideServiceHoursInput,
  type LogServiceHoursInput,
  type Paginated,
  Role,
  type ServiceHours,
  type ServiceHoursPhoto,
} from '@adoptafacil/contracts';
import { setServeHeaders } from '../../core/storage/serve-headers';
import type { RequestUser } from '../../core/auth/auth.types';
import { CurrentUser } from '../../core/auth/current-user.decorator';
import { JwtAuthGuard } from '../../core/auth/jwt-auth.guard';
import { ZodValidationPipe } from '../../core/auth/zod-validation.pipe';
import { Roles } from '../../core/rbac/roles.decorator';
import { RolesGuard } from '../../core/rbac/roles.guard';
import { ServiceHoursService } from './service-hours.service';
import {
  SERVICE_HOURS_PHOTO_MAX_UPLOAD_BYTES,
  ServiceHoursPhotosService,
  type UploadedPhotoFile,
} from './service-hours-photos.service';
import { decideServiceHoursSchema, logServiceHoursSchema } from './service-hours.schemas';

/** Roles that may decide a service-hours entry (RF18/RF19). */
const MANAGE_ROLES = [Role.Owner, Role.Administrator] as const;
/** Roles that may VIEW internally (manage roles + the read-only auditor). */
const VIEW_ROLES = [...MANAGE_ROLES, Role.ReadOnlyAuditor] as const;

/**
 * M08 service hours (RF18/RF19) — tenant-scoped (RLS). Logging is open to ANY
 * authenticated Person against their OWN accepted enrollment (cross-tenant by
 * design); deciding and viewing by enrollment internally is
 * Owner/Administrator (+ ReadOnlyAuditor for viewing).
 */
@Controller('service-hours')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ServiceHoursController {
  constructor(
    private readonly service: ServiceHoursService,
    private readonly photos: ServiceHoursPhotosService,
  ) {}

  /** El voluntario adjunta una foto de la jornada a SU sesión (cualquier
   *  persona autenticada; la propiedad la valida la base de datos). */
  @Post(':id/photos')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: SERVICE_HOURS_PHOTO_MAX_UPLOAD_BYTES } }),
  )
  attachPhoto(
    @CurrentUser() actor: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: UploadedPhotoFile | undefined,
  ): Promise<ServiceHoursPhoto> {
    return this.photos.attach(actor, id, file);
  }

  /** La organización descarga una foto de la jornada (su tenant, auditado). */
  @Get(':id/photos/:photoId/file')
  @Roles(...VIEW_ROLES)
  async photoFile(
    @CurrentUser() actor: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('photoId', ParseUUIDPipe) photoId: string,
    @Res() res: Response,
  ): Promise<void> {
    const photo = await this.photos.download(actor.id, id, photoId);
    setServeHeaders(res, photo.filename, photo.data);
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(photo.data);
  }

  /** Log a session — any authenticated Person (no @Roles gate). */
  @Post()
  create(
    @CurrentUser() actor: RequestUser,
    @Body(new ZodValidationPipe(logServiceHoursSchema)) dto: LogServiceHoursInput,
  ): Promise<ServiceHours> {
    return this.service.log(actor, dto);
  }

  @Get('mine')
  listMine(@CurrentUser() actor: RequestUser): Promise<ServiceHours[]> {
    return this.service.listMine(actor);
  }

  @Get()
  @Roles(...VIEW_ROLES)
  listByEnrollment(
    @Query('enrollmentId', ParseUUIDPipe) enrollmentId: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ): Promise<Paginated<ServiceHours>> {
    return this.service.listByEnrollment(enrollmentId, Number(limit), Number(offset));
  }

  @Post(':id/decision')
  @HttpCode(200)
  @Roles(...MANAGE_ROLES)
  decide(
    @CurrentUser() actor: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(decideServiceHoursSchema)) dto: DecideServiceHoursInput,
  ): Promise<ServiceHours> {
    return this.service.decide(actor.id, id, dto);
  }
}
