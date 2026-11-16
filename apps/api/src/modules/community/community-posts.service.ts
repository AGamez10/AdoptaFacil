import {
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Post as PostRow, PostImage as PostImageRow } from '@prisma/client';
import {
  type CreatePostInput,
  type CreatePostResult,
  type Post,
  type PostImage,
  type PostImageInput,
  type PostMediaKind,
  type PostReactionCounts,
  PostType,
  type PostsPage,
  Role,
  type UpdatePostInput,
} from '@adoptafacil/contracts';
import type { RequestUser } from '../../core/auth/auth.types';
import { PrismaService } from '../../prisma/prisma.service';
import { InboxService } from '../../core/notifications/inbox/inbox.service';
import { STORAGE_PORT, type StoragePort } from '../../core/storage/storage.port';
import { posterKeyFor } from '../../core/media/video-transcoder';
import {
  NOTIFICATION_PORT,
  type NotificationPort,
} from '../../core/notifications/notification.port';

const MAX_PAGE = 50;
const DEFAULT_PAGE = 20;
/** Best-effort cap on how many past donors get emailed for one campaign post
 *  — a community post is not a mailing-list feature; this is a courtesy
 *  notification to people who have already supported this specific org. */
// Emails only go into the delivery queue here (the worker sends them at the
// provider's pace), so this cap guards memory, not SMTP throughput.
const MAX_CAMPAIGN_NOTIFY_RECIPIENTS = 5_000;

/**
 * Security remediation `community-campaign-post-donor-broadcast-no-role-check`:
 * a `campaign` post e-mails the organization's donors under its name, so only
 * the roles that speak for the organization publish one. Operator stays out
 * until the client decides otherwise. TODO(client): ¿Operator también?
 */
export const CAMPAIGN_POST_ORG_ROLES: readonly string[] = [Role.Owner, Role.Administrator];

/**
 * At most this many donor broadcasts per organization in a rolling 24 h. A
 * campaign post beyond it is still published on the wall, without e-mailing
 * the donors again. TODO(client): ajustar el tope.
 */
export const MAX_CAMPAIGN_BROADCASTS_PER_DAY = 3;
const BROADCAST_WINDOW_MS = 24 * 60 * 60 * 1000;
// Recipients enqueued in parallel per round trip batch.
const NOTIFY_ENQUEUE_BATCH = 100;

/** Clamp a requested page size to [1, MAX_PAGE] — shared by every list read
 *  in this module. */
export function clampLimit(limit: number | undefined): number {
  if (!limit || Number.isNaN(limit)) return DEFAULT_PAGE;
  return Math.min(Math.max(Math.trunc(limit), 1), MAX_PAGE);
}

type PostWithImages = PostRow & { images: PostImageRow[] };

/** Row emitted by the SECURITY DEFINER functions (camelCase — I control the
 *  jsonb_build_object keys, so no snake_case mapping is needed here, unlike
 *  a genuine Prisma-model row). */
interface RawPost {
  id: string;
  organizationId: string | null;
  organizationName?: string | null;
  authorUserId: string;
  authorName: string;
  type: string;
  title: string | null;
  body: string;
  status: string;
  commentCount: number;
  likeCount: number;
  moderationReason?: string | null;
  shareable?: boolean;
  reactionCounts?: PostReactionCounts | null;
  images: Array<{
    id: string;
    storageRef: string;
    order: number;
    kind?: string | null;
    posterRef?: string | null;
    durationSeconds?: number | null;
  }>;
  createdAt: string;
  updatedAt: string;
}

/**
 * M11 (comunidad) — publicaciones. El feed es CRUZADO por diseño (todas las
 * organizaciones + publicaciones de plataforma); ver `community.prisma` para
 * el criterio de `organizationId`. Una cuenta de organización publica bajo su
 * propio tenant (RLS normal); una Persona publica vía la función SECURITY
 * DEFINER `create_community_post_platform` (su fila no tiene organización, y
 * ninguna WITH CHECK de tenant_isolation la aceptaría bajo ningún contexto).
 */
@Injectable()
export class CommunityPostsService {
  private readonly logger = new Logger('CommunityPosts');

  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_PORT) private readonly storage: StoragePort,
    @Inject(NOTIFICATION_PORT) private readonly notifications: NotificationPort,
    @Optional() private readonly inbox?: InboxService,
  ) {}

  private toImage(row: {
    id: string;
    storageRef: string;
    order: number;
    kind?: string | null;
    posterRef?: string | null;
    durationSeconds?: number | null;
  }): PostImage {
    const isVideo = row.kind === 'video';
    return {
      id: row.id,
      storageRef: row.storageRef,
      order: row.order,
      url: this.storage.resolvePublicUrl(row.storageRef),
      kind: (isVideo ? 'video' : 'image') as PostMediaKind,
      ...(isVideo && row.posterRef
        ? { posterUrl: this.storage.resolvePublicUrl(row.posterRef) }
        : {}),
      ...(isVideo && row.durationSeconds ? { durationSeconds: row.durationSeconds } : {}),
    };
  }

  private toPost(row: PostWithImages): Post {
    return {
      id: row.id,
      organizationId: row.organizationId ?? undefined,
      authorUserId: row.authorUserId,
      authorName: row.authorName,
      type: row.type as PostType,
      title: row.title ?? undefined,
      body: row.body,
      images: [...row.images].sort((a, b) => a.order - b.order).map((i) => this.toImage(i)),
      commentCount: row.commentCount,
      likeCount: row.likeCount,
      reactionCounts: (row.reactionCounts ?? {}) as PostReactionCounts,
      status: row.status as Post['status'],
      moderationReason: row.moderationReason ?? undefined,
      shareable: row.shareable,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private fromRaw(raw: RawPost): Post {
    return {
      id: raw.id,
      organizationId: raw.organizationId ?? undefined,
      organizationName: raw.organizationName ?? undefined,
      authorUserId: raw.authorUserId,
      authorName: raw.authorName,
      type: raw.type as PostType,
      title: raw.title ?? undefined,
      body: raw.body,
      images: [...(raw.images ?? [])].sort((a, b) => a.order - b.order).map((i) => this.toImage(i)),
      commentCount: raw.commentCount,
      likeCount: raw.likeCount,
      reactionCounts: raw.reactionCounts ?? {},
      status: raw.status as Post['status'],
      moderationReason: raw.moderationReason ?? undefined,
      shareable: raw.shareable ?? false,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
    };
  }

  /** The actor's display name, resolved under their OWN tenant (works for
   *  both an org member and a Persona — every user has exactly one). */
  private async resolveAuthorName(actor: RequestUser): Promise<string> {
    const user = await this.prisma.withOrgContext(actor.organizationId, (tx) =>
      tx.user.findUnique({ where: { id: actor.id } }),
    );
    return user?.displayName ?? actor.email;
  }

  /** Publicar. Ramifica por tipo de cuenta: una organización publica bajo su
   *  propio tenant (RLS normal); una Persona publica sin organización, vía
   *  la función SECURITY DEFINER (ver nota de criterio en community.prisma). */
  async create(actor: RequestUser, input: CreatePostInput): Promise<CreatePostResult> {
    const authorName = await this.resolveAuthorName(actor);
    if (actor.accountType === 'person') {
      const created = await this.createPlatformPost(actor, authorName, input);
      let { post } = created;
      const { imageUploads } = created;
      if (input.shareable) {
        post = { ...post, shareable: await this.setShareable(actor, post.id, true) };
      }
      return { post, imageUploads };
    }
    return this.createOrgPost(actor, authorName, input);
  }

  /**
   * Reserva los destinos de subida FUERA de la transacción (igual que animales
   * y marketplace). `uploadUrl` es el destino PUT al que el cliente sube los
   * bytes; nunca se persiste (solo `storageRef`). Un video se guarda siempre
   * como `.mp4` (el servidor lo comprime) y trae la llave de su portada.
   */
  private async reserveMedia(
    organizationId: string,
    media: PostImageInput[],
  ): Promise<
    Array<{
      storageRef: string;
      uploadUrl: string;
      order: number;
      kind: PostMediaKind;
      posterRef: string | null;
    }>
  > {
    return Promise.all(
      media.map(async (item, index) => {
        const isVideo = item.contentType.startsWith('video/');
        const stored = await this.storage.createUploadTarget({
          organizationId,
          filename: isVideo ? 'video.mp4' : item.filename,
          contentType: isVideo ? 'video/mp4' : item.contentType,
          // Las fotos y videos de la comunidad son públicos (se ven en el muro).
          visibility: 'public',
        });
        return {
          storageRef: stored.key,
          uploadUrl: stored.url,
          order: item.order ?? index,
          kind: (isVideo ? 'video' : 'image') as PostMediaKind,
          posterRef: isVideo ? posterKeyFor(stored.key) : null,
        };
      }),
    );
  }

  private async createOrgPost(
    actor: RequestUser,
    authorName: string,
    input: CreatePostInput,
  ): Promise<CreatePostResult> {
    const organizationId = actor.organizationId;

    const reserved = await this.reserveMedia(organizationId, input.images ?? []);

    const created = await this.prisma.withOrgContext(organizationId, async (tx) => {
      // An organization account posts only while it is a member (a removed
      // person keeps the credential, never the role), and only the roles that
      // speak for the organization may e-mail its donors (deny-by-default).
      const held = (await tx.userRole.findMany({ where: { userId: actor.id } })).map(
        (r) => r.role as string,
      );
      if (held.length === 0) {
        throw new ForbiddenException('Ya no haces parte de esta organización.');
      }
      if (
        input.type === PostType.Campaign &&
        !held.some((role) => CAMPAIGN_POST_ORG_ROLES.includes(role))
      ) {
        throw new ForbiddenException(
          'Solo el propietario o un administrador publican campañas que se envían a los donantes.',
        );
      }
      const broadcastsToday =
        input.type === PostType.Campaign
          ? await tx.post.count({
              where: {
                organizationId,
                type: PostType.Campaign,
                createdAt: { gt: new Date(Date.now() - BROADCAST_WINDOW_MS) },
              },
            })
          : 0;

      const row = await tx.post.create({
        data: {
          organizationId,
          authorUserId: actor.id,
          authorName,
          type: input.type,
          title: input.title ?? null,
          body: input.body,
          shareable: input.shareable ?? false,
          images:
            reserved.length > 0
              ? {
                  create: reserved.map((r) => ({
                    organizationId,
                    storageRef: r.storageRef,
                    order: r.order,
                    kind: r.kind,
                    posterRef: r.posterRef,
                  })),
                }
              : undefined,
        },
        include: { images: true },
      });

      if (input.type === PostType.Campaign && broadcastsToday < MAX_CAMPAIGN_BROADCASTS_PER_DAY) {
        const donations = await tx.donation.findMany({
          where: { organizationId, status: 'approved', reversal: null },
          select: { payer: true, donorUserId: true },
        });
        // One entry per address (first name seen wins), for a personal greeting.
        const recipients = new Map<string, CampaignRecipient>();
        for (const d of donations) {
          const payer = d.payer as { email?: string; fullName?: string } | null;
          const email = payer?.email?.trim();
          if (!email || recipients.has(email.toLowerCase())) continue;
          recipients.set(email.toLowerCase(), {
            email,
            name: payer?.fullName?.trim(),
            userId: d.donorUserId ?? undefined,
          });
          if (recipients.size >= MAX_CAMPAIGN_NOTIFY_RECIPIENTS) break;
        }
        const emails = [...recipients.values()];
        return { post: this.toPost(row), images: row.images, notifyEmails: emails };
      }
      return {
        post: this.toPost(row),
        images: row.images,
        notifyEmails: [] as CampaignRecipient[],
      };
    });

    if (created.notifyEmails.length > 0) {
      await this.notifyDonorsBestEffort(organizationId, created.post, created.notifyEmails);
    }

    const imageUploads = created.images.map((img) => {
      const match = reserved.find((r) => r.storageRef === img.storageRef);
      return {
        imageId: img.id,
        order: img.order,
        key: img.storageRef,
        url: match?.uploadUrl ?? '',
      };
    });
    return { post: created.post, imageUploads };
  }

  /** Best-effort, personalized email to the org's own past donors about a new
   *  campaign post. Only enqueues (see QueuedNotificationPort), in parallel
   *  batches, so even thousands of donors never slow the post creation. */
  private async notifyDonorsBestEffort(
    organizationId: string,
    post: Post,
    recipients: CampaignRecipient[],
  ): Promise<void> {
    const org = await this.prisma.organization.findUnique({ where: { id: organizationId } });
    const orgName = org?.name ?? 'una organización de AdoptaFácil';
    const subject = `${orgName} publicó novedades sobre una campaña`;
    const body = post.title ? `"${post.title}": ${post.body}` : post.body;
    const noticed = new Set<string>();
    for (const { userId } of recipients) {
      if (!userId || noticed.has(userId)) continue;
      noticed.add(userId);
      await this.inbox?.toUser(userId, {
        kind: 'community.campaign_update',
        tone: 'info',
        title: `${orgName} publicó novedades de una campaña que apoyaste`,
        body: post.title ?? post.body.slice(0, 200),
        href: `/comunidad/${post.id}`,
        dedupeKey: `community_campaign_update:${post.id}`,
      });
    }
    for (let i = 0; i < recipients.length; i += NOTIFY_ENQUEUE_BATCH) {
      const batch = recipients.slice(i, i + NOTIFY_ENQUEUE_BATCH);
      await Promise.all(
        batch.map(async ({ email, name }) => {
          try {
            // Bulk event: the template layer adds the unsubscribe link and
            // skips anyone who opted out (Ley 1581).
            await this.notifications.send({
              to: email,
              subject,
              body,
              // One email per donor per post, whatever retries happen.
              idempotencyKey: `community.campaign_update:${post.id}:${email.toLowerCase()}`,
              template: {
                event: 'community.campaign_update',
                organizationName: org?.name ?? undefined,
                organizationId,
                data: {
                  organizacion: orgName,
                  nombre: firstName(name) ?? 'amigo(a)',
                  titulo: post.title ?? `Novedades de ${orgName}`,
                  mensaje: post.body,
                },
              },
            });
          } catch (error) {
            // Never the recipient address in the log (Ley 1581).
            this.logger.warn(
              `No se pudo notificar a un donante sobre la publicación ${post.id}: ${(error as Error).message}`,
            );
          }
        }),
      );
    }
  }

  private async createPlatformPost(
    actor: RequestUser,
    authorName: string,
    input: CreatePostInput,
  ): Promise<{ post: Post; imageUploads: CreatePostResult['imageUploads'] }> {
    const rows = await this.prisma.$queryRaw<Array<{ data: RawPost }>>(
      Prisma.sql`SELECT create_community_post_platform(${actor.id}::uuid, ${authorName}, ${input.type}, ${input.title ?? null}, ${input.body}) AS data`,
    );
    let post = this.fromRaw(rows[0].data);
    const media = input.images ?? [];
    if (media.length === 0) return { post, imageUploads: [] };

    // Las fotos y videos de una Persona viven en su propio espacio de
    // almacenamiento (el de su cuenta) y se registran con una función acotada.
    const reserved = await this.reserveMedia(actor.organizationId, media);
    const ids = await this.prisma.$queryRaw<Array<{ ids: string[] }>>(
      Prisma.sql`SELECT community_post_attach_media(${post.id}::uuid, ${actor.id}::uuid, ${JSON.stringify(
        reserved.map((r) => ({
          storageRef: r.storageRef,
          order: r.order,
          kind: r.kind,
          posterRef: r.posterRef,
        })),
      )}::jsonb) AS ids`,
    );
    post = await this.get(post.id);
    const imageIds = ids[0]?.ids ?? [];
    return {
      post,
      imageUploads: reserved.map((r, index) => ({
        imageId: imageIds[index] ?? '',
        order: r.order,
        key: r.storageRef,
        url: r.uploadUrl,
      })),
    };
  }

  /** El feed cruzado: publicaciones activas de todas las organizaciones +
   *  de plataforma, más recientes primero, filtro opcional por tipo. */
  async feed(limit: number, offset: number, type?: PostType): Promise<PostsPage> {
    const take = clampLimit(limit);
    const skip = Math.max(offset || 0, 0);
    const rows = await this.prisma.$queryRaw<Array<{ data: { items: RawPost[]; total: number } }>>(
      Prisma.sql`SELECT community_posts_feed(${take}::int, ${skip}::int, ${type ?? null}::text) AS data`,
    );
    const data = rows[0]?.data ?? { items: [], total: 0 };
    return {
      items: (data.items ?? []).map((r) => this.fromRaw(r)),
      total: data.total ?? 0,
      limit: take,
      offset: skip,
    };
  }

  /** "Mis publicaciones": las propias, cualquier estado, por identidad de autor. */
  async mine(actor: RequestUser, limit: number, offset: number): Promise<PostsPage> {
    const take = clampLimit(limit);
    const skip = Math.max(offset || 0, 0);
    const rows = await this.prisma.$queryRaw<Array<{ data: { items: RawPost[]; total: number } }>>(
      Prisma.sql`SELECT community_posts_by_author(${actor.id}::uuid, ${take}::int, ${skip}::int) AS data`,
    );
    const data = rows[0]?.data ?? { items: [], total: 0 };
    return {
      items: (data.items ?? []).map((r) => this.fromRaw(r)),
      total: data.total ?? 0,
      limit: take,
      offset: skip,
    };
  }

  /** Una publicación (activa), para permalink. */
  async get(id: string): Promise<Post> {
    const rows = await this.prisma.$queryRaw<Array<{ data: RawPost | null }>>(
      Prisma.sql`SELECT community_post_get(${id}::uuid) AS data`,
    );
    const raw = rows[0]?.data;
    if (!raw) {
      throw new NotFoundException('Post not found');
    }
    return this.fromRaw(raw);
  }

  /** La autora decide si su publicación se ve sin sesión y se comparte en
   *  redes. Por identidad de autora (una Persona no tiene tenant que la cubra). */
  async setShareable(actor: RequestUser, id: string, shareable: boolean): Promise<boolean> {
    const rows = await this.prisma.$queryRaw<Array<{ ok: boolean }>>(
      Prisma.sql`SELECT community_post_set_shareable(${id}::uuid, ${actor.id}::uuid, ${shareable}::boolean) AS ok`,
    );
    if (!rows[0]?.ok) {
      throw new NotFoundException('Post not found');
    }
    return shareable;
  }

  /** Editar la publicación propia (solo título/cuerpo). */
  async update(actor: RequestUser, id: string, input: UpdatePostInput): Promise<Post> {
    try {
      const rows = await this.prisma.$queryRaw<Array<{ data: RawPost }>>(
        Prisma.sql`SELECT community_post_update_own(${id}::uuid, ${actor.id}::uuid, ${input.title ?? null}, ${input.body ?? null}) AS data`,
      );
      return this.fromRaw(rows[0].data);
    } catch (error) {
      throw this.translateOwnershipError(error);
    }
  }

  /** Borrar la publicación propia (física; cascada a fotos/comentarios/likes). */
  async remove(actor: RequestUser, id: string): Promise<void> {
    try {
      await this.prisma.$queryRaw(
        Prisma.sql`SELECT community_post_delete_own(${id}::uuid, ${actor.id}::uuid)`,
      );
    } catch (error) {
      throw this.translateOwnershipError(error);
    }
  }

  private translateOwnershipError(error: unknown): Error {
    const message = error instanceof Error ? error.message : String(error);
    if (/post not found/i.test(message)) {
      return new NotFoundException('Post not found');
    }
    if (/not the author/i.test(message)) {
      return new ForbiddenException('You are not the author of this post');
    }
    if (/cannot edit a removed post/i.test(message)) {
      return new ForbiddenException(
        'This post was removed by moderation and can no longer be edited',
      );
    }
    return error instanceof Error ? error : new Error(message);
  }
}

interface CampaignRecipient {
  email: string;
  name?: string;
  /** Cuenta de quien donó (si donó con sesión): también recibe el aviso en su campana. */
  userId?: string;
}

function firstName(fullName: string | undefined): string | undefined {
  const first = fullName?.split(/\s+/)[0];
  return first ? first : undefined;
}
