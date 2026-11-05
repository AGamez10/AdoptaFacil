import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  PostType,
  PublicCommunityPost,
  PublicCommunityPostsPage,
} from '@adoptafacil/contracts';
import { PrismaService } from '../../prisma/prisma.service';
import { STORAGE_PORT, type StoragePort } from '../../core/storage/storage.port';

const MAX_PUBLIC_PAGE = 24;
const DEFAULT_PUBLIC_PAGE = 6;

/** Row emitted by `public_community_post_json` (already minimized in SQL). */
interface RawPublicPost {
  id: string;
  authorDisplayName: string;
  isOrganization: boolean;
  organizationName: string | null;
  type: string;
  title: string | null;
  body: string;
  commentCount: number;
  likeCount: number;
  images: Array<{ id: string; storageRef: string; order: number }>;
  createdAt: string;
}

/**
 * Comunidad PÚBLICA (sin sesión): solo publicaciones activas que su autora
 * marcó como compartibles, vía funciones SECURITY DEFINER acotadas que nunca
 * devuelven el id ni el nombre completo de una persona.
 */
@Injectable()
export class PublicCommunityService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_PORT) private readonly storage: StoragePort,
  ) {}

  private fromRaw(raw: RawPublicPost): PublicCommunityPost {
    return {
      id: raw.id,
      authorDisplayName: raw.authorDisplayName,
      isOrganization: raw.isOrganization,
      organizationName: raw.organizationName ?? undefined,
      type: raw.type as PostType,
      title: raw.title ?? undefined,
      body: raw.body,
      commentCount: raw.commentCount,
      likeCount: raw.likeCount,
      images: [...(raw.images ?? [])]
        .sort((a, b) => a.order - b.order)
        .map((i) => ({
          id: i.id,
          storageRef: i.storageRef,
          order: i.order,
          url: this.storage.resolvePublicUrl(i.storageRef),
        })),
      createdAt: raw.createdAt,
    };
  }

  async list(limit: number, offset: number): Promise<PublicCommunityPostsPage> {
    const take =
      !limit || Number.isNaN(limit)
        ? DEFAULT_PUBLIC_PAGE
        : Math.min(Math.max(Math.trunc(limit), 1), MAX_PUBLIC_PAGE);
    const skip = Math.max(Math.trunc(offset) || 0, 0);
    const rows = await this.prisma.$queryRaw<
      Array<{ data: { items: RawPublicPost[]; total: number } }>
    >(Prisma.sql`SELECT public_community_posts(${take}::int, ${skip}::int) AS data`);
    const data = rows[0]?.data ?? { items: [], total: 0 };
    return {
      items: (data.items ?? []).map((r) => this.fromRaw(r)),
      total: Number(data.total ?? 0),
      limit: take,
      offset: skip,
    };
  }

  async get(id: string): Promise<PublicCommunityPost | null> {
    const rows = await this.prisma.$queryRaw<Array<{ data: RawPublicPost | null }>>(
      Prisma.sql`SELECT public_community_post(${id}::uuid) AS data`,
    );
    const raw = rows[0]?.data;
    return raw ? this.fromRaw(raw) : null;
  }
}
