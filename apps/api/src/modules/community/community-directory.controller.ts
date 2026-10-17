import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  Role,
  ServiceCategory,
  ServiceListingStatus,
  type CreatePetProfileInput,
  type CreateServiceListingInput,
  type CreateServiceReviewInput,
  type ModerateServiceListingInput,
  type ModerateServiceReviewInput,
  type PetProfile,
  type ServiceListing,
  type ServiceListingPublic,
  type ServiceListingsPage,
  type ServiceReview,
  type ServiceReviewsPage,
  type SetServiceListingPartnerInput,
  type UpdatePetProfileInput,
  type UpdateServiceListingInput,
} from '@adoptafacil/contracts';
import type { RequestUser } from '../../core/auth/auth.types';
import { CurrentUser } from '../../core/auth/current-user.decorator';
import { JwtAuthGuard } from '../../core/auth/jwt-auth.guard';
import { ZodValidationPipe } from '../../core/auth/zod-validation.pipe';
import { RequireFeature } from '../../core/features';
import { Roles } from '../../core/rbac/roles.decorator';
import { RolesGuard } from '../../core/rbac/roles.guard';
import { CommunityDirectoryService } from './community-directory.service';
import { CommunityPetsService } from './community-pets.service';
import {
  createPetProfileSchema,
  createServiceListingSchema,
  createServiceReviewSchema,
  moderateServiceSchema,
  setServicePartnerSchema,
  updatePetProfileSchema,
  updateServiceListingSchema,
} from './community-directory.schemas';

function parseCategory(value?: string): ServiceCategory | undefined {
  return value && (Object.values(ServiceCategory) as string[]).includes(value)
    ? (value as ServiceCategory)
    : undefined;
}

function parseStatus(value?: string): ServiceListingStatus | undefined {
  return value && (Object.values(ServiceListingStatus) as string[]).includes(value)
    ? (value as ServiceListingStatus)
    : undefined;
}

function parseCity(value?: string): string | undefined {
  const city = value?.trim();
  return city ? city.slice(0, 80) : undefined;
}

/**
 * Directorio PÚBLICO de servicios (sin sesión): solo perfiles aprobados y sus
 * reseñas aprobadas, vía funciones SECURITY DEFINER acotadas.
 */
@RequireFeature('community')
@Controller('public/community/services')
export class PublicCommunityServicesController {
  constructor(private readonly service: CommunityDirectoryService) {}

  @Get()
  list(
    @Query('category') category?: string,
    @Query('city') city?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ): Promise<ServiceListingsPage> {
    return this.service.listPublic(
      Number(limit),
      Number(offset),
      parseCategory(category),
      parseCity(city),
    );
  }

  @Get(':id')
  async get(@Param('id', ParseUUIDPipe) id: string): Promise<ServiceListingPublic> {
    const found = await this.service.getPublic(id);
    if (!found) throw new NotFoundException('Listing not found');
    return found;
  }

  @Get(':id/reviews')
  reviews(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ): Promise<ServiceReviewsPage> {
    return this.service.listPublicReviews(id, Number(limit), Number(offset));
  }
}

/**
 * Perfiles propios y reseñas (cualquier cuenta autenticada). Sin `@Roles`
 * porque una Persona no tiene roles de organización: el servicio exige
 * Owner/Administrator cuando la cuenta es de organización (deny-by-default).
 */
@RequireFeature('community')
@Controller('community/services')
@UseGuards(JwtAuthGuard)
export class CommunityServicesController {
  constructor(private readonly service: CommunityDirectoryService) {}

  @Post()
  create(
    @CurrentUser() actor: RequestUser,
    @Body(new ZodValidationPipe(createServiceListingSchema)) dto: CreateServiceListingInput,
  ): Promise<ServiceListing> {
    return this.service.create(actor, dto);
  }

  @Get('mine')
  mine(@CurrentUser() actor: RequestUser): Promise<ServiceListing[]> {
    return this.service.mine(actor);
  }

  @Patch(':id')
  update(
    @CurrentUser() actor: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateServiceListingSchema)) dto: UpdateServiceListingInput,
  ): Promise<ServiceListing> {
    return this.service.update(actor, id, dto);
  }

  @Post(':id/reviews')
  review(
    @CurrentUser() actor: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(createServiceReviewSchema)) dto: CreateServiceReviewInput,
  ): Promise<{ id: string; status: string }> {
    return this.service.createReview(actor, id, dto);
  }
}

/** Ficha privada de mascota (solo cuentas Persona; lo aplica el servicio). */
@RequireFeature('community')
@Controller('community/pets')
@UseGuards(JwtAuthGuard)
export class CommunityPetsController {
  constructor(private readonly pets: CommunityPetsService) {}

  @Get()
  list(@CurrentUser() actor: RequestUser): Promise<PetProfile[]> {
    return this.pets.list(actor);
  }

  @Post()
  create(
    @CurrentUser() actor: RequestUser,
    @Body(new ZodValidationPipe(createPetProfileSchema)) dto: CreatePetProfileInput,
  ): Promise<PetProfile> {
    return this.pets.create(actor, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() actor: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updatePetProfileSchema)) dto: UpdatePetProfileInput,
  ): Promise<PetProfile> {
    return this.pets.update(actor, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentUser() actor: RequestUser, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.pets.remove(actor, id);
  }
}

/** Moderación de plataforma de perfiles y reseñas del directorio. */
@RequireFeature('community')
@Controller('platform/community')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.PlatformAdmin, Role.PlatformSuperAdmin)
export class CommunityDirectoryModerationController {
  constructor(private readonly service: CommunityDirectoryService) {}

  @Get('services')
  listings(
    @Query('status') status?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ): Promise<ServiceListingsPage<ServiceListing>> {
    return this.service.listingsQueue(Number(limit), Number(offset), parseStatus(status));
  }

  @Patch('services/:id/moderate')
  moderateListing(
    @CurrentUser() actor: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(moderateServiceSchema)) dto: ModerateServiceListingInput,
  ): Promise<ServiceListing> {
    return this.service.moderateListing(actor.id, id, dto);
  }

  /** Marca o quita "Aliado AdoptaFácil". El negocio nunca puede hacerlo. */
  @Patch('services/:id/partner')
  setPartner(
    @CurrentUser() actor: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(setServicePartnerSchema)) dto: SetServiceListingPartnerInput,
  ): Promise<ServiceListing> {
    return this.service.setPartner(actor.id, id, dto);
  }

  @Get('service-reviews')
  reviews(
    @Query('status') status?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ): Promise<ServiceReviewsPage<ServiceReview>> {
    return this.service.reviewsQueue(Number(limit), Number(offset), parseStatus(status));
  }

  @Patch('service-reviews/:id/moderate')
  moderateReview(
    @CurrentUser() actor: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(moderateServiceSchema)) dto: ModerateServiceReviewInput,
  ): Promise<ServiceReview> {
    return this.service.moderateReview(actor.id, id, dto);
  }
}
