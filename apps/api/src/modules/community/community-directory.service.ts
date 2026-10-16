import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type ServiceListing as ServiceListingRow } from '@prisma/client';
import {
  Role,
  type CreateServiceListingInput,
  type CreateServiceReviewInput,
  type ModerateServiceListingInput,
  type ModerateServiceReviewInput,
  type ServiceCategory,
  type ServiceListing,
  type ServiceListingPublic,
  type ServiceListingStatus,
  type ServiceListingsPage,
  type ServiceReview,
  type ServiceReviewPublic,
  type ServiceReviewsPage,
  type UpdateServiceListingInput,
} from '@adoptafacil/contracts';
import type { RequestUser } from '../../core/auth/auth.types';
import { AuditService } from '../../core/audit/audit.service';
import { isUniqueConstraintViolation } from '../../core/errors/prisma-conflict.util';
import { PrismaService } from '../../prisma/prisma.service';
import { clampLimit } from './community-posts.service';

/** Roles de una cuenta de ORGANIZACIÓN que pueden publicar el perfil de un
 *  servicio de su organización. Una cuenta Persona gestiona su propio tenant. */
export const SERVICE_LISTING_ORG_ROLES: readonly string[] = [Role.Owner, Role.Administrator];

type RawPublicListing = Omit<ServiceListingPublic, 'ratingAverage'> & {
  ratingAverage: number | string | null;
  description: string | null;
  address: string | null;
  phone: string | null;
  whatsapp: string | null;
  website: string | null;
  email: string | null;
};

type RawQueueListing = RawPublicListing & {
  organizationId: string;
  status: string;
  moderationReason: string | null;
  updatedAt: string;
};

interface RawReview {
  id: string;
  listingId?: string;
  listingName?: string;
  rating: number;
  comment: string | null;
  authorName: string;
  status?: string;
  moderationReason?: string | null;
  createdAt: string;
}

function opt<T>(value: T | null | undefined): T | undefined {
  return value ?? undefined;
}

function toPublicListing(raw: RawPublicListing): ServiceListingPublic {
  return {
    id: raw.id,
    category: raw.category,
    name: raw.name,
    description: opt(raw.description),
    department: raw.department,
    city: raw.city,
    address: opt(raw.address),
    phone: opt(raw.phone),
    whatsapp: opt(raw.whatsapp),
    website: opt(raw.website),
    email: opt(raw.email),
    ratingAverage: raw.ratingAverage === null ? undefined : Number(raw.ratingAverage),
    ratingCount: Number(raw.ratingCount ?? 0),
    createdAt: raw.createdAt,
  };
}

function toPublicReview(raw: RawReview): ServiceReviewPublic {
  return {
    id: raw.id,
    rating: raw.rating,
    comment: opt(raw.comment),
    authorName: raw.authorName,
    createdAt: raw.createdAt,
  };
}

function toQueueReview(raw: RawReview): ServiceReview {
  return {
    ...toPublicReview(raw),
    listingId: raw.listingId ?? '',
    listingName: raw.listingName ?? '',
    status: raw.status as ServiceReview['status'],
    moderationReason: opt(raw.moderationReason),
  };
}

/** Solo el primer nombre de quien reseña se muestra en público. */
export function publicAuthorName(displayName: string | undefined | null): string {
  const first = (displayName ?? '').trim().split(/\s+/)[0];
  return first ? first.slice(0, 40) : 'Persona de la comunidad';
}

/**
 * Comunidad · directorio de servicios del ecosistema (veterinarias,
 * peluquerías, paseadores y tiendas) con reseñas moderadas.
 *
 * - El perfil vive en el tenant de quien lo publica (RLS normal). La app no
 *   puede escribir su estado (GRANT por columna); editar su contenido lo
 *   devuelve a revisión (trigger en la base).
 * - Lo público y lo de plataforma pasa por funciones SECURITY DEFINER
 *   acotadas; nunca un select que evada la RLS.
 */
@Injectable()
export class CommunityDirectoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // -------------------------------------------------------------------------
  // Perfiles propios (dueño del negocio)
  // -------------------------------------------------------------------------

  /** Una Persona gestiona los perfiles de su tenant personal; en una cuenta
   *  de organización, solo Owner/Administrator (deny-by-default). */
  private async assertCanManage(actor: RequestUser, tx: Prisma.TransactionClient): Promise<void> {
    if (actor.accountType === 'person') return;
    const roles = await tx.userRole.findMany({ where: { userId: actor.id } });
    if (!roles.some((r) => SERVICE_LISTING_ORG_ROLES.includes(r.role))) {
      throw new ForbiddenException('Insufficient role');
    }
  }

  private toOwnListing(row: ServiceListingRow): ServiceListing {
    return {
      id: row.id,
      organizationId: row.organizationId,
      category: row.category as ServiceCategory,
      name: row.name,
      description: opt(row.description),
      department: row.department,
      city: row.city,
      address: opt(row.address),
      phone: opt(row.phone),
      whatsapp: opt(row.whatsapp),
      website: opt(row.website),
      email: opt(row.email),
      status: row.status as ServiceListingStatus,
      moderationReason: opt(row.moderationReason),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private conflict(name: string): ConflictException {
    return new ConflictException(`Ya tienes un perfil llamado "${name}".`);
  }

  async create(actor: RequestUser, input: CreateServiceListingInput): Promise<ServiceListing> {
    const organizationId = actor.organizationId;
    try {
      return await this.prisma.withOrgContext(organizationId, async (tx) => {
        await this.assertCanManage(actor, tx);
        const row = await tx.serviceListing.create({
          data: { ...input, organizationId, createdByUserId: actor.id },
        });
        await this.audit.recordWithTx(tx, {
          organizationId,
          actorUserId: actor.id,
          action: 'community_service_listing.created',
          entityType: 'community_service_listing',
          entityId: row.id,
          metadata: { category: input.category },
        });
        return this.toOwnListing(row);
      });
    } catch (error) {
      if (isUniqueConstraintViolation(error)) throw this.conflict(input.name);
      throw error;
    }
  }

  async mine(actor: RequestUser): Promise<ServiceListing[]> {
    return this.prisma.withOrgContext(actor.organizationId, async (tx) => {
      await this.assertCanManage(actor, tx);
      const rows = await tx.serviceListing.findMany({ orderBy: { createdAt: 'desc' }, take: 50 });
      return rows.map((r) => this.toOwnListing(r));
    });
  }

  /** Editar el contenido devuelve el perfil a `pending` (trigger en la base). */
  async update(
    actor: RequestUser,
    id: string,
    input: UpdateServiceListingInput,
  ): Promise<ServiceListing> {
    const organizationId = actor.organizationId;
    try {
      return await this.prisma.withOrgContext(organizationId, async (tx) => {
        await this.assertCanManage(actor, tx);
        // Bajo RLS, un id de otro tenant simplemente no existe → 404.
        const existing = await tx.serviceListing.findUnique({ where: { id } });
        if (!existing) throw new NotFoundException('Listing not found');
        const row = await tx.serviceListing.update({ where: { id }, data: input });
        await this.audit.recordWithTx(tx, {
          organizationId,
          actorUserId: actor.id,
          action: 'community_service_listing.updated',
          entityType: 'community_service_listing',
          entityId: id,
          metadata: { fields: Object.keys(input) },
        });
        return this.toOwnListing(row);
      });
    } catch (error) {
      if (isUniqueConstraintViolation(error)) throw this.conflict(input.name ?? '');
      throw error;
    }
  }

  // -------------------------------------------------------------------------
  // Reseñas (cualquier cuenta autenticada, nunca sobre su propio tenant)
  // -------------------------------------------------------------------------

  async createReview(
    actor: RequestUser,
    listingId: string,
    input: CreateServiceReviewInput,
  ): Promise<{ id: string; status: string }> {
    const user = await this.prisma.withOrgContext(actor.organizationId, (tx) =>
      tx.user.findUnique({ where: { id: actor.id } }),
    );
    try {
      const rows = await this.prisma.$queryRaw<Array<{ data: { id: string; status: string } }>>(
        Prisma.sql`SELECT create_service_listing_review(
          ${listingId}::uuid, ${actor.id}::uuid, ${actor.organizationId}::uuid,
          ${publicAuthorName(user?.displayName)}, ${input.rating}::int, ${input.comment ?? null}
        ) AS data`,
      );
      return rows[0].data;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/listing not found/i.test(message)) throw new NotFoundException('Listing not found');
      if (/cannot review own listing/i.test(message)) {
        throw new ForbiddenException('No puedes reseñar un perfil de tu propia cuenta.');
      }
      if (/already reviewed|23505|duplicate key/i.test(message)) {
        throw new ConflictException('Ya dejaste una reseña para este servicio.');
      }
      throw error;
    }
  }

  // -------------------------------------------------------------------------
  // Directorio público (sin sesión)
  // -------------------------------------------------------------------------

  async listPublic(
    limit: number,
    offset: number,
    category?: ServiceCategory,
    city?: string,
  ): Promise<ServiceListingsPage> {
    const take = clampLimit(limit);
    const skip = Math.max(offset || 0, 0);
    const rows = await this.prisma.$queryRaw<
      Array<{ data: { items: RawPublicListing[]; total: number } }>
    >(
      Prisma.sql`SELECT public_service_listings(${take}::int, ${skip}::int, ${category ?? null}::text, ${city ?? null}::text) AS data`,
    );
    const data = rows[0]?.data ?? { items: [], total: 0 };
    return {
      items: (data.items ?? []).map(toPublicListing),
      total: Number(data.total ?? 0),
      limit: take,
      offset: skip,
    };
  }

  async getPublic(id: string): Promise<ServiceListingPublic | null> {
    const rows = await this.prisma.$queryRaw<Array<{ data: RawPublicListing | null }>>(
      Prisma.sql`SELECT public_service_listing(${id}::uuid) AS data`,
    );
    const raw = rows[0]?.data ?? null;
    return raw ? toPublicListing(raw) : null;
  }

  async listPublicReviews(
    listingId: string,
    limit: number,
    offset: number,
  ): Promise<ServiceReviewsPage> {
    const take = clampLimit(limit);
    const skip = Math.max(offset || 0, 0);
    const rows = await this.prisma.$queryRaw<
      Array<{ data: { items: RawReview[]; total: number } }>
    >(
      Prisma.sql`SELECT public_service_listing_reviews(${listingId}::uuid, ${take}::int, ${skip}::int) AS data`,
    );
    const data = rows[0]?.data ?? { items: [], total: 0 };
    return {
      items: (data.items ?? []).map(toPublicReview),
      total: Number(data.total ?? 0),
      limit: take,
      offset: skip,
    };
  }

  // -------------------------------------------------------------------------
  // Moderación de plataforma
  // -------------------------------------------------------------------------

  private moderationError(error: unknown, entity: 'listing' | 'review'): never {
    const message = error instanceof Error ? error.message : String(error);
    if (new RegExp(`${entity} not found`, 'i').test(message)) {
      throw new NotFoundException(`${entity} not found`);
    }
    if (/reason is required/i.test(message)) {
      throw new BadRequestException('El motivo es obligatorio para rechazar u ocultar.');
    }
    throw error;
  }

  private toQueueListing(raw: RawQueueListing): ServiceListing {
    const { ratingAverage: _avg, ratingCount: _count, ...rest } = toPublicListing(raw);
    return {
      ...rest,
      organizationId: raw.organizationId,
      status: raw.status as ServiceListingStatus,
      moderationReason: opt(raw.moderationReason),
      updatedAt: raw.updatedAt,
    };
  }

  async listingsQueue(
    limit: number,
    offset: number,
    status?: string,
  ): Promise<ServiceListingsPage<ServiceListing>> {
    const take = clampLimit(limit);
    const skip = Math.max(offset || 0, 0);
    const rows = await this.prisma.$queryRaw<
      Array<{ data: { items: RawQueueListing[]; total: number } }>
    >(
      Prisma.sql`SELECT service_listings_moderation_queue(${take}::int, ${skip}::int, ${status ?? null}::text) AS data`,
    );
    const data = rows[0]?.data ?? { items: [], total: 0 };
    return {
      items: (data.items ?? []).map((r) => this.toQueueListing(r)),
      total: Number(data.total ?? 0),
      limit: take,
      offset: skip,
    };
  }

  async moderateListing(
    reviewerUserId: string,
    id: string,
    input: ModerateServiceListingInput,
  ): Promise<ServiceListing> {
    try {
      const rows = await this.prisma.$queryRaw<Array<{ data: RawQueueListing }>>(
        Prisma.sql`SELECT service_listing_moderate(${id}::uuid, ${input.decision}, ${reviewerUserId}::uuid, ${input.reason ?? null}) AS data`,
      );
      return this.toQueueListing(rows[0].data);
    } catch (error) {
      this.moderationError(error, 'listing');
    }
  }

  async reviewsQueue(
    limit: number,
    offset: number,
    status?: string,
  ): Promise<ServiceReviewsPage<ServiceReview>> {
    const take = clampLimit(limit);
    const skip = Math.max(offset || 0, 0);
    const rows = await this.prisma.$queryRaw<
      Array<{ data: { items: RawReview[]; total: number } }>
    >(
      Prisma.sql`SELECT service_reviews_moderation_queue(${take}::int, ${skip}::int, ${status ?? null}::text) AS data`,
    );
    const data = rows[0]?.data ?? { items: [], total: 0 };
    return {
      items: (data.items ?? []).map(toQueueReview),
      total: Number(data.total ?? 0),
      limit: take,
      offset: skip,
    };
  }

  async moderateReview(
    reviewerUserId: string,
    id: string,
    input: ModerateServiceReviewInput,
  ): Promise<ServiceReview> {
    try {
      const rows = await this.prisma.$queryRaw<Array<{ data: RawReview }>>(
        Prisma.sql`SELECT service_review_moderate(${id}::uuid, ${input.decision}, ${reviewerUserId}::uuid, ${input.reason ?? null}) AS data`,
      );
      return toQueueReview(rows[0].data);
    } catch (error) {
      this.moderationError(error, 'review');
    }
  }
}
