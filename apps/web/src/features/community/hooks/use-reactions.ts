import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  MyReactions,
  PostReaction,
  PostReactionCounts,
  SetReactionResult,
} from '@adoptafacil/contracts';
import { useToast } from '@adoptafacil/ui';
import { useApiClient } from '../../../shell/api';
import { applyReaction, totalReactions } from '../lib/reactions';

export interface ReactionState {
  mine: PostReaction | null;
  counts: PostReactionCounts;
  total: number;
}

interface PostLike {
  id: string;
  likeCount: number;
  reactionCounts?: PostReactionCounts;
}

/**
 * Reacciones de una lista de publicaciones: pide MIS reacciones de una vez,
 * pinta el cambio al instante (optimista) y lo revierte con un aviso si el
 * servidor lo rechaza. Los contadores salen de la publicación; el servidor
 * manda la verdad al confirmar.
 */
export function useReactions(posts: PostLike[]) {
  const client = useApiClient();
  const { toast } = useToast();
  const [mine, setMine] = useState<MyReactions>({});
  const [overrides, setOverrides] = useState<Record<string, ReactionState>>({});
  const inflight = useRef(new Set<string>());

  const ids = posts.map((p) => p.id).join(',');
  useEffect(() => {
    if (!ids) return;
    let active = true;
    client
      .request<MyReactions>('/community/reactions/mine', {
        method: 'POST',
        json: { postIds: ids.split(',') },
      })
      .then((found) => {
        if (active && found && typeof found === 'object')
          setMine((prev) => ({ ...prev, ...found }));
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [client, ids]);

  const stateOf = useCallback(
    (post: PostLike): ReactionState => {
      const override = overrides[post.id];
      if (override) return override;
      const counts = post.reactionCounts ?? {};
      return {
        mine: mine[post.id] ?? null,
        counts,
        total: Math.max(post.likeCount, totalReactions(counts)),
      };
    },
    [mine, overrides],
  );

  const react = useCallback(
    async (post: PostLike, next: PostReaction | null): Promise<void> => {
      if (inflight.current.has(post.id)) return;
      inflight.current.add(post.id);
      const before = stateOf(post);
      const counts = applyReaction(before.counts, before.mine, next);
      const delta = (next ? 1 : 0) - (before.mine ? 1 : 0);
      const optimistic: ReactionState = {
        mine: next,
        counts,
        total: Math.max(before.total + delta, totalReactions(counts)),
      };
      setOverrides((prev) => ({ ...prev, [post.id]: optimistic }));
      try {
        const result = await client.request<SetReactionResult>(
          `/community/posts/${encodeURIComponent(post.id)}/reaction`,
          { method: 'PUT', json: { reaction: next } },
        );
        setOverrides((prev) => ({
          ...prev,
          [post.id]: {
            mine: result.myReaction,
            counts: result.reactionCounts ?? counts,
            total: result.likeCount,
          },
        }));
      } catch {
        setOverrides((prev) => ({ ...prev, [post.id]: before }));
        toast({
          title: 'No pudimos guardar tu reacción',
          description: 'Revisa tu conexión e inténtalo de nuevo.',
          variant: 'warning',
        });
      } finally {
        inflight.current.delete(post.id);
      }
    },
    [client, stateOf, toast],
  );

  return { stateOf, react };
}
