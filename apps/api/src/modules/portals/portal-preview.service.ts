import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import {
  FormalizationState,
  type AnimalSex,
  type AnimalSize,
  type AnimalSpecies,
  type AnimalStatus,
  type AnimalSummaryPage,
  type CampaignCategory,
  type CampaignPublic,
  type CampaignStatus,
  type OrganizationExtendedContact,
  type OrganizationLocation,
  type OrganizationPublic,
  type OrganizationSocialLinks,
  type OrganizationType,
  type Paginated,
  type VerificationLevel,
} from '@adoptafacil/contracts';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContextService } from '../../core/tenant/tenant-context.service';
import { STORAGE_PORT, type StoragePort } from '../../core/storage/storage.port';
import { computeAge } from '../animals/animal-age';
import { computeProgress } from '../campaigns/campaign-progress';
import type { PublicAnimalsQuery } from '../animals/public-animals.schemas';

/** States where the NIT and the organization type become public (same rule as
 *  the `organization_public` SQL function). */
const FORMALIZED: readonly string[] = [
  FormalizationState.Formalizada,
  FormalizationState.ESAL,
  FormalizationState.ESAL_RTE,
];

const MAX_PAGE = 50;

/**
 * Owner preview of the organization's own public portal (R2-1 follow-up).
 *
 * The public portal only exists for APPROVED organizations, so a new owner who
 * opens their portal link used to get "Organización no encontrada". The
 * preview shows the members of the organization exactly what visitors will see
 * once it is approved, built with the SAME public-only projection as the
 * public SECURITY DEFINER functions (no phone, no legal name, NIT/type only
 * when formalized), but read inside the caller's own tenant context (RLS), so
 * it never reaches another organization's data and needs no new SQL function.
 */
@Injectable()
export class PortalPreviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
    @Inject(STORAGE_PORT) private readonly storage: StoragePort,
  ) {}

  private requireOrgId(): string {
    const organizationId = this.tenant.getOrganizationId();
    if (!organizationId) {
      throw new ForbiddenException('Missing tenant context');
    }
    return organizationId;
  }

  async getOrganization(): Promise<OrganizationPublic> {
    const organizationId = this.requireOrgId();
    const settings = await this.prisma.platformSettings.findUnique({ where: { id: 'global' } });
    const showAllTypes = settings?.showOrganizationType === 'all';
    return this.prisma.withOrgContext(organizationId, async (tx) => {
      const [org, p] = await Promise.all([
        tx.organization.findUniqueOrThrow({ where: { id: organizationId } }),
        tx.organizationProfile.findUnique({ where: { organizationId } }),
      ]);
      const formalized = FORMALIZED.includes(p?.formalizationState ?? '');
      return {
        id: org.id,
        name: org.name,
        slug: p?.slug ?? undefined,
        subdomain: p?.subdomain ?? undefined,
        description: p?.description ?? undefined,
        logoUrl: p?.logoUrl ?? undefined,
        coverPhotos: p?.coverPhotos ?? [],
        location: (p?.location as OrganizationLocation | null) ?? undefined,
        socialLinks: (p?.socialLinks as OrganizationSocialLinks | null) ?? undefined,
        whatsapp: p?.whatsapp ?? undefined,
        contactEmail: p?.contactEmail ?? undefined,
        formalizationState:
          (p?.formalizationState as FormalizationState | undefined) ?? FormalizationState.Informal,
        rteVigente: p?.rteVigente ?? false,
        verificationLevel: (p?.verificationLevel as VerificationLevel | null) ?? undefined,
        nit: formalized ? (p?.nit ?? undefined) : undefined,
        organizationType:
          showAllTypes || formalized
            ? ((p?.organizationType as OrganizationType | null) ?? undefined)
            : undefined,
        aboutUs: p?.aboutUs ?? undefined,
        extendedContact: (p?.extendedContact as OrganizationExtendedContact | null) ?? undefined,
      };
    });
  }

  /** Same catalog as `public_org_adoptable_animals`: active, available animals. */
  async listAnimals(query: PublicAnimalsQuery): Promise<AnimalSummaryPage> {
    const organizationId = this.requireOrgId();
    const limit = Math.min(Math.max(query.limit ?? 20, 1), MAX_PAGE);
    const offset = Math.max(query.offset ?? 0, 0);
    const where = {
      organizationId,
      isActive: true,
      status: 'available',
      ...(query.species ? { species: query.species } : {}),
    };
    const now = new Date();
    return this.prisma.withOrgContext(organizationId, async (tx) => {
      const [rows, total] = await Promise.all([
        tx.animal.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          take: limit,
          skip: offset,
          select: {
            id: true,
            organizationId: true,
            name: true,
            species: true,
            sex: true,
            size: true,
            status: true,
            customBreed: true,
            birthDate: true,
            approximateAgeMonths: true,
            createdAt: true,
            breed: { select: { name: true } },
            photos: {
              select: { storageRef: true },
              orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
              take: 1,
            },
          },
        }),
        tx.animal.count({ where }),
      ]);
      return {
        items: rows.map((a) => {
          const photoRef = a.photos[0]?.storageRef;
          const breed = a.breed?.name ?? a.customBreed;
          return {
            id: a.id,
            organizationId: a.organizationId,
            name: a.name,
            species: a.species as AnimalSpecies,
            sex: a.sex as AnimalSex,
            size: a.size as AnimalSize,
            status: a.status as AnimalStatus,
            breed: breed ?? undefined,
            computedAge: computeAge(a.birthDate, a.approximateAgeMonths, now),
            primaryPhotoRef: photoRef,
            photoUrl: photoRef ? this.storage.resolvePublicUrl(photoRef) : undefined,
            isActive: true,
            createdAt: a.createdAt.toISOString(),
          };
        }),
        total,
        limit,
        offset,
      };
    });
  }

  /** Same feed as `GET /public/organizations/:slug/campaigns`: active campaigns. */
  async listCampaigns(limit = 20, offset = 0): Promise<Paginated<CampaignPublic>> {
    const organizationId = this.requireOrgId();
    const take = Math.min(Math.max(limit, 1), MAX_PAGE);
    const skip = Math.max(offset, 0);
    return this.prisma.withOrgContext(organizationId, async (tx) => {
      const where = { organizationId, status: 'active' };
      const [org, rows, total] = await Promise.all([
        tx.organization.findUniqueOrThrow({ where: { id: organizationId } }),
        tx.campaign.findMany({ where, orderBy: { createdAt: 'desc' }, take, skip }),
        tx.campaign.count({ where }),
      ]);
      return {
        items: rows.map((row) => ({
          id: row.id,
          organizationId: row.organizationId,
          organizationName: org.name,
          title: row.title,
          description: row.description ?? undefined,
          category: row.category as CampaignCategory,
          goalAmount: row.goalAmount,
          raisedAmount: row.raisedAmount,
          progress: computeProgress(row.raisedAmount, row.goalAmount),
          deadline: row.deadline.toISOString(),
          status: row.status as CampaignStatus,
          createdAt: row.createdAt.toISOString(),
        })),
        total,
        limit: take,
        offset: skip,
      };
    });
  }
}
