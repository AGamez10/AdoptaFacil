import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  MyReactions,
  PostReaction,
  SetReactionResult,
  ToggleLikeResult,
} from '@adoptafacil/contracts';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * M11 (comunidad) — likes. SIEMPRE cross-tenant por identidad; togglear pasa
 * por una función SECURITY DEFINER que inserta/elimina la fila y mantiene el
 * contador desnormalizado de la publicación en la misma transacción SQL.
 */
@Injectable()
export class CommunityLikesService {
  constructor(private readonly prisma: PrismaService) {}

  async toggle(userId: string, postId: string): Promise<ToggleLikeResult> {
    try {
      const rows = await this.prisma.$queryRaw<Array<{ data: ToggleLikeResult }>>(
        Prisma.sql`SELECT toggle_community_post_like(${postId}::uuid, ${userId}::uuid) AS data`,
      );
      return rows[0].data;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/post not found/i.test(message)) {
        throw new NotFoundException('Post not found');
      }
      if (/cannot like a removed post/i.test(message)) {
        throw new ForbiddenException(
          'This post was removed by moderation and can no longer be liked',
        );
      }
      throw error;
    }
  }

  /** Poner, cambiar o quitar (`null`) la reacción propia. */
  async react(
    userId: string,
    postId: string,
    reaction: PostReaction | null,
  ): Promise<SetReactionResult> {
    try {
      const rows = await this.prisma.$queryRaw<Array<{ data: SetReactionResult }>>(
        Prisma.sql`SELECT set_community_post_reaction(${postId}::uuid, ${userId}::uuid, ${reaction}::text) AS data`,
      );
      return rows[0].data;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/post not found/i.test(message)) throw new NotFoundException('Post not found');
      if (/cannot like a removed post/i.test(message)) {
        throw new ForbiddenException('Esta publicación fue retirada y ya no admite reacciones');
      }
      throw error;
    }
  }

  /** Mis reacciones sobre varias publicaciones (para pintar el feed). */
  async mine(userId: string, postIds: string[]): Promise<MyReactions> {
    if (postIds.length === 0) return {};
    const rows = await this.prisma.$queryRaw<Array<{ data: MyReactions }>>(
      Prisma.sql`SELECT community_my_reactions(${userId}::uuid, ${postIds}::uuid[]) AS data`,
    );
    return rows[0]?.data ?? {};
  }
}
