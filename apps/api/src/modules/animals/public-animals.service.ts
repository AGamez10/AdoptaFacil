import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  AnimalSex,
  AnimalSize,
  AnimalSpecies,
  AnimalStatus,
  AnimalSummary,
  AnimalSummaryPage,
  PublicAnimalsPage,
} from '@adoptafacil/contracts';
import { PrismaService } from '../../prisma/prisma.service';
import { STORAGE_PORT, type StoragePort } from '../../core/storage/storage.port';
import { computeAge } from './animal-age';
import type { PublicAnimalsGlobalQuery, PublicAnimalsQuery } from './public-animals.schemas';

/** Raw item shape emitted by the SECURITY DEFINER function (public-safe only). */
interface RawItem {
  id: string;
  /** Present once the 20261030 migration ran (public URL code). */
  publicCode?: string | null;
  organizationId: string;
  name: string;
  species: AnimalSpecies;
  sex: AnimalSex;
  size: AnimalSize;
  status: AnimalStatus;
  breed: string | null;
  primaryPhotoRef: string | null;
  birthDate: string | null;
  approximateAgeMonths: number | null;
  createdAt: string;
}

interface RawGlobalItem extends RawItem {
  organization: {
    id: string;
    name: string;
    slug: string;
    logoUrl: string | null;
    city: string | null;
  };
}

interface RawGlobalPage {
  items: RawGlobalItem[];
  total: number | string;
}

/** Opaque keyset cursor over `(createdAt, id)` for the global catalog. */
export function encodeCursor(createdAt: string, id: string): string {
  return Buffer.from(`${createdAt}|${id}`, 'utf8').toString('base64url');
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Decode a cursor; a malformed one is ignored (first page), never a 500. */
export function decodeCursor(cursor: string): { createdAt: string; id: string } | null {
  const [createdAt, id] = Buffer.from(cursor, 'base64url').toString('utf8').split('|');
  if (!createdAt || !id || !UUID_RE.test(id) || Number.isNaN(Date.parse(createdAt))) {
    return null;
  }
  return { createdAt, id };
}

interface RawPage {
  items: RawItem[];
  total: number | string;
  limit: number;
  offset: number;
}

/**
 * Public adoption catalog (T-029). No tenant context (anonymous visitor): reads
 * go through the bounded SECURITY DEFINER function `public_org_adoptable_animals`,
 * which returns ONLY public AnimalSummary columns for adoptable animals. The
 * service DERIVES `computedAge` from the raw age inputs (never surfacing a raw
 * DOB) and resolves `photoUrl` from the primary photo ref — no clinical/internal
 * data is ever touched.
 */
@Injectable()
export class PublicAnimalsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_PORT) private readonly storage: StoragePort,
  ) {}

  /** Returns the paginated adoptable catalog, or null when the slug resolves to
   *  no public organization (→ 404 at the controller). */
  async listAdoptable(slug: string, query: PublicAnimalsQuery): Promise<AnimalSummaryPage | null> {
    const limit = query.limit ?? null;
    const offset = query.offset ?? null;
    const species = query.species ?? null;

    const rows = await this.prisma.$queryRaw<Array<{ data: RawPage | null }>>(
      Prisma.sql`SELECT public_org_adoptable_animals(${slug}, ${limit}::int, ${offset}::int, ${species}::text) AS data`,
    );
    const page = rows[0]?.data;
    if (!page) {
      return null;
    }

    const now = new Date();
    return {
      items: page.items.map((item) => this.toSummary(item, now)),
      total: Number(page.total),
      limit: page.limit,
      offset: page.offset,
    };
  }

  /**
   * ONE adoptable animal of a public organization, by its public code or (for
   * links published before public codes existed) its id. Goes through the
   * bounded SECURITY DEFINER function `public_org_adoptable_animal`, with the
   * same filters and projection as the catalog: null (→ 404) for an unknown
   * org, an inactive/adopted animal or another org's animal alike, so the
   * response never reveals whether a non-public animal exists.
   */
  async findAdoptable(slug: string, ref: string): Promise<AnimalSummary | null> {
    const rows = await this.prisma.$queryRaw<Array<{ data: RawItem | null }>>(
      Prisma.sql`SELECT public_org_adoptable_animal(${slug}, ${ref}) AS data`,
    );
    const item = rows[0]?.data;
    return item ? this.toSummary(item, new Date()) : null;
  }

  /**
   * The GLOBAL adoptable catalog across EVERY approved organization with a
   * public profile (S1-07), for the public landing page.
   *
   * One query per request, whatever the number of organizations (plan de
   * escala, B1): the bounded SECURITY DEFINER function
   * `public_adoptable_animals` joins organizations + public profiles and pages
   * in Postgres over a partial index. It returns the same public-safe columns
   * as the per-org function plus the organization's public summary.
   *
   * Paging: `page`/`limit` (the web's pager) or `cursor` (keyset over
   * `(createdAt, id)`, no OFFSET) — `nextCursor` is set while more items remain.
   */
  async listAllAdoptable(query: PublicAnimalsGlobalQuery): Promise<PublicAnimalsPage> {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 50);
    const after = query.cursor ? decodeCursor(query.cursor) : null;
    const offset = after ? 0 : (page - 1) * limit;

    const rows = await this.prisma.$queryRaw<Array<{ data: RawGlobalPage | null }>>(
      Prisma.sql`SELECT public_adoptable_animals(${limit}::int, ${offset}::int, ${query.species ?? null}::text, ${query.city ?? null}::text, ${after?.createdAt ?? null}::timestamp(3), ${after?.id ?? null}::uuid) AS data`,
    );
    const result = rows[0]?.data;
    const items = result?.items ?? [];
    const total = Number(result?.total ?? 0);

    const now = new Date();
    const data = items.map(({ organization, ...item }) => ({
      ...this.toSummary(item, now),
      organization: {
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        logoUrl: organization.logoUrl ?? undefined,
        city: organization.city ?? undefined,
      },
    }));
    const last = items[items.length - 1];
    const hasMore = items.length === limit && (after ? true : offset + items.length < total);
    return {
      data,
      total,
      page: after ? 1 : page,
      limit,
      ...(hasMore && last ? { nextCursor: encodeCursor(last.createdAt, last.id) } : {}),
    };
  }

  private toSummary(item: RawItem, now: Date): AnimalSummary {
    const birthDate = item.birthDate ? new Date(item.birthDate) : null;
    return {
      id: item.id,
      organizationId: item.organizationId,
      name: item.name,
      species: item.species,
      sex: item.sex,
      size: item.size,
      status: item.status,
      breed: item.breed ?? undefined,
      computedAge: computeAge(birthDate, item.approximateAgeMonths, now),
      primaryPhotoRef: item.primaryPhotoRef ?? undefined,
      photoUrl: item.primaryPhotoRef
        ? this.storage.resolvePublicUrl(item.primaryPhotoRef)
        : undefined,
      isActive: true,
      createdAt: item.createdAt,
      publicCode: item.publicCode ?? undefined,
    };
  }
}
