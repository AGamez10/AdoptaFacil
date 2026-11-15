import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { Post, PostReaction } from '@adoptafacil/contracts';
import { Badge, Dialog, DialogContent, DialogDescription, DialogTitle } from '@adoptafacil/ui';
import {
  TYPE_LABELS,
  commentCountLabel,
  formatBogota,
  postDetailHref,
  timeAgo,
  typeVariant,
} from '../model/community-view';
import type { ReactionState } from '../hooks/use-reactions';
import { AuthorAvatar } from './author-avatar';
import { MediaGallery } from './media-gallery';
import { ReactionBar, ReactionSummary } from './reaction-bar';
import { SharePost } from './share-post';

export interface PostCardProps {
  post: Post;
  /** Mis reacciones y los contadores vigentes; sin esto, solo se ven los contadores de la publicación. */
  reaction?: ReactionState;
  onReact?: (post: Post, next: PostReaction | null) => void;
}

const LONG_BODY = 320;

/**
 * Tarjeta de una publicación del muro (`/comunidad`): quién publica, texto,
 * fotos o video, reacciones, comentarios y compartir. Una tarjeta completa:
 * se puede reaccionar sin entrar al detalle.
 */
export function PostCard({ post, reaction, onReact }: PostCardProps) {
  const [sharing, setSharing] = useState(false);
  const isOrg = Boolean(post.organizationName);
  const displayName = post.organizationName ?? post.authorName;
  const state: ReactionState = reaction ?? {
    mine: null,
    counts: post.reactionCounts ?? {},
    total: post.likeCount,
  };
  const long = post.body.length > LONG_BODY;

  return (
    <article
      className="overflow-hidden rounded-2xl border bg-card shadow-sm"
      data-testid="post-card"
      aria-label={`Publicación de ${displayName}`}
    >
      <header className="flex items-start gap-3 p-4 pb-3">
        <AuthorAvatar name={displayName} organization={isOrg} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold leading-tight">
            {displayName}
            {isOrg && (
              <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 align-middle text-[11px] font-bold uppercase tracking-wide text-primary">
                Organización
              </span>
            )}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {isOrg && post.authorName !== displayName ? `${post.authorName} · ` : ''}
            <time dateTime={post.createdAt} title={formatBogota(post.createdAt)}>
              {timeAgo(post.createdAt)}
            </time>
          </p>
        </div>
        <Badge variant={typeVariant(post.type)}>{TYPE_LABELS[post.type]}</Badge>
      </header>

      <div className="px-4 pb-3">
        {post.title && <h3 className="mb-1 text-lg font-bold leading-snug">{post.title}</h3>}
        <p
          className={`whitespace-pre-wrap text-[15px] leading-relaxed ${long ? 'line-clamp-6' : ''}`}
        >
          {post.body}
        </p>
        {long && (
          <Link
            to={postDetailHref(post.id)}
            className="mt-1 inline-block text-sm font-semibold text-primary hover:underline"
          >
            Ver publicación completa
          </Link>
        )}
      </div>

      <MediaGallery media={post.images} authorName={displayName} />

      <div className="flex min-h-[2.75rem] items-center justify-between gap-3 px-4 py-2">
        <ReactionSummary counts={state.counts} total={state.total} mine={state.mine !== null} />
        <Link
          to={postDetailHref(post.id)}
          className="ml-auto text-sm text-muted-foreground hover:text-foreground hover:underline"
        >
          {commentCountLabel(post.commentCount)}
        </Link>
      </div>

      <footer className="flex items-center gap-1 border-t px-2 py-1">
        {onReact ? (
          <ReactionBar value={state.mine} onChange={(next) => onReact(post, next)} />
        ) : null}
        <Link
          to={`${postDetailHref(post.id)}#comentarios`}
          className="inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold text-muted-foreground hover:bg-muted"
        >
          <span aria-hidden="true">💬</span> Comentar
        </Link>
        {post.shareable ? (
          <button
            type="button"
            onClick={() => setSharing(true)}
            className="inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span aria-hidden="true">↗</span> Compartir
          </button>
        ) : null}
      </footer>

      <Dialog open={sharing} onOpenChange={setSharing}>
        <DialogContent>
          <DialogTitle>Compartir esta publicación</DialogTitle>
          <DialogDescription>
            Quien abra el enlace verá la publicación sin necesidad de cuenta.
          </DialogDescription>
          <SharePost post={post} />
        </DialogContent>
      </Dialog>
    </article>
  );
}
