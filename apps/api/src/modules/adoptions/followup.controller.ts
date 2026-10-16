import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  PayloadTooLargeException,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  Role,
  type AdoptionFollowUpMilestone,
  type ScheduleFollowUpMilestoneInput,
  type SubmitFollowUpInput,
} from '@adoptafacil/contracts';
import type { Env } from '../../config/env.validation';
import type { RequestUser } from '../../core/auth/auth.types';
import { CurrentUser } from '../../core/auth/current-user.decorator';
import { JwtAuthGuard } from '../../core/auth/jwt-auth.guard';
import { ZodValidationPipe } from '../../core/auth/zod-validation.pipe';
import { Roles } from '../../core/rbac/roles.decorator';
import { RolesGuard } from '../../core/rbac/roles.guard';
import { FollowUpService } from './followup.service';
import {
  FOLLOWUP_PHOTO_CONTENT_TYPES,
  parseFollowUpPhotoFields,
  scheduleFollowUpSchema,
  submitFollowUpSchema,
} from './followup.schemas';

/** Minimal shape of a multer memory-storage file (no @types/multer installed). */
interface UploadedFileLike {
  buffer: Buffer;
  mimetype: string;
  size: number;
  originalname: string;
}

/** Roles that SCHEDULE/CLOSE follow-up (§13) — org set (Owner/Administrator/
 *  Operator), same as evaluation/contract. NOT the platform admin. The adopter
 *  (Persona) only responds their own milestones. */
const MANAGE_ROLES = [Role.Owner, Role.Administrator, Role.Operator] as const;

/**
 * M04 post-adoption FOLLOW-UP (T-028c, RF12). Two audiences under one authenticated
 * guard:
 *   - the OWNING organization schedules milestones and closes them (deny-by-default,
 *     MANAGE_ROLES only);
 *   - the ADOPTER (Persona) lists and responds THEIR OWN milestones — authorization
 *     by adopter identity in the service, resolved cross-tenant via SECURITY DEFINER.
 * All rows are tenant-scoped (RLS).
 */
@Controller('adoptions/followups')
@UseGuards(JwtAuthGuard)
export class FollowUpController {
  private readonly maxMb: number;

  constructor(
    private readonly service: FollowUpService,
    config: ConfigService<Env, true>,
  ) {
    this.maxMb = config.get('STORAGE_MAX_FILE_MB', { infer: true });
  }

  /** Schedule a milestone on a signed contract (org). */
  @Post()
  @UseGuards(RolesGuard)
  @Roles(...MANAGE_ROLES)
  schedule(
    @CurrentUser() actor: RequestUser,
    @Body(new ZodValidationPipe(scheduleFollowUpSchema)) dto: ScheduleFollowUpMilestoneInput,
  ): Promise<AdoptionFollowUpMilestone> {
    return this.service.schedule(actor, dto);
  }

  /** Milestones of a contract, for the owning org. */
  @Get('by-contract/:contractId')
  @UseGuards(RolesGuard)
  @Roles(...MANAGE_ROLES)
  listForContract(
    @Param('contractId', ParseUUIDPipe) contractId: string,
  ): Promise<AdoptionFollowUpMilestone[]> {
    return this.service.listForContract(contractId);
  }

  /** The adopter's own milestones (cross-tenant, by identity). */
  @Get('mine')
  listMine(@CurrentUser() actor: RequestUser): Promise<AdoptionFollowUpMilestone[]> {
    return this.service.listMine(actor);
  }

  /** The adopter responds a milestone (answers and/or a photo). */
  @Post(':id/submit')
  submit(
    @CurrentUser() actor: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(submitFollowUpSchema)) dto: SubmitFollowUpInput,
  ): Promise<AdoptionFollowUpMilestone> {
    return this.service.submit(actor, id, dto);
  }

  /**
   * The adopter responds a milestone WITH a photo (multipart: `file`, plus the
   * optional text fields `answers` as JSON and `complete`). Only images; size
   * capped like every other upload (STORAGE_MAX_FILE_MB).
   */
  @Post(':id/photo')
  @UseInterceptors(FileInterceptor('file'))
  submitWithPhoto(
    @CurrentUser() actor: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: UploadedFileLike | undefined,
    @Body() fields: Record<string, unknown>,
  ): Promise<AdoptionFollowUpMilestone> {
    if (!file || !file.buffer) {
      throw new BadRequestException('Adjunta la foto (campo "file").');
    }
    if (file.size > this.maxMb * 1024 * 1024) {
      throw new PayloadTooLargeException(`La foto supera el límite de ${this.maxMb} MB.`);
    }
    if (!FOLLOWUP_PHOTO_CONTENT_TYPES.includes(file.mimetype)) {
      throw new BadRequestException('Formato no permitido. Sube una foto JPG, PNG o WebP.');
    }
    return this.service.submitWithPhoto(actor, id, file, parseFollowUpPhotoFields(fields));
  }

  /** The org closes (completes) a milestone. */
  @Post(':id/complete')
  @UseGuards(RolesGuard)
  @Roles(...MANAGE_ROLES)
  complete(
    @CurrentUser() actor: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<AdoptionFollowUpMilestone> {
    return this.service.complete(actor, id);
  }
}
