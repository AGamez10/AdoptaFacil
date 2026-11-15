import {
  POST_REACTIONS,
  POST_REACTION_LABELS,
  type PostReaction,
  type PostReactionCounts,
} from '@adoptafacil/contracts';

export interface ReactionMeta {
  emoji: string;
  label: string;
  /** Color del texto cuando es MI reacción (contraste ≥ 4.5:1 sobre blanco). */
  tone: string;
}

export const REACTION_META: Record<PostReaction, ReactionMeta> = {
  like: { emoji: '👍', label: POST_REACTION_LABELS.like, tone: 'text-sky-700' },
  love: { emoji: '❤️', label: POST_REACTION_LABELS.love, tone: 'text-rose-700' },
  tender: { emoji: '🥰', label: POST_REACTION_LABELS.tender, tone: 'text-amber-700' },
  celebrate: { emoji: '🎉', label: POST_REACTION_LABELS.celebrate, tone: 'text-emerald-700' },
  sad: { emoji: '😢', label: POST_REACTION_LABELS.sad, tone: 'text-indigo-700' },
};

export const REACTION_ORDER = POST_REACTIONS;

/** Las reacciones con votos, de la más usada a la menos (máximo `limit`). */
export function topReactions(
  counts: PostReactionCounts | undefined,
  limit = 3,
): Array<{ reaction: PostReaction; count: number }> {
  return REACTION_ORDER.map((reaction) => ({ reaction, count: counts?.[reaction] ?? 0 }))
    .filter((entry) => entry.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

/** "Tú y 3 personas más" / "Tú" / "12 personas" / "" — quién ha reaccionado. */
export function reactionSummaryText(total: number, mine: boolean): string {
  if (total <= 0) return '';
  if (mine) {
    if (total === 1) return 'Tú';
    const others = total - 1;
    return `Tú y ${others} ${others === 1 ? 'persona más' : 'personas más'}`;
  }
  return total === 1 ? '1 persona' : `${total.toLocaleString('es-CO')} personas`;
}

/** Cambia el contador de una reacción sin dejarlo en negativo (para lo optimista). */
export function applyReaction(
  counts: PostReactionCounts | undefined,
  previous: PostReaction | null,
  next: PostReaction | null,
): PostReactionCounts {
  const out: PostReactionCounts = { ...(counts ?? {}) };
  if (previous) out[previous] = Math.max((out[previous] ?? 0) - 1, 0);
  if (next) out[next] = (out[next] ?? 0) + 1;
  return out;
}

export function totalReactions(counts: PostReactionCounts | undefined): number {
  return REACTION_ORDER.reduce((sum, reaction) => sum + (counts?.[reaction] ?? 0), 0);
}
