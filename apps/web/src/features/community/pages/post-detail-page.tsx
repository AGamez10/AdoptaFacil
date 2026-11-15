import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { Comment, CommentsPage, Post } from '@adoptafacil/contracts';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Input,
  Skeleton,
  useToast,
} from '@adoptafacil/ui';
import { PageContainer, PageHeader } from '../../_layout';
import { SharePost } from '../components/share-post';
import { AuthorAvatar } from '../components/author-avatar';
import { MediaGallery } from '../components/media-gallery';
import { ReactionBar, ReactionSummary } from '../components/reaction-bar';
import { useReactions } from '../hooks/use-reactions';
import { useApiClient } from '../../../shell/api';
import { useSession } from '../../../shell/auth';
import {
  TYPE_LABELS,
  commentCountLabel,
  formatBogota,
  timeAgo,
  typeVariant,
} from '../model/community-view';

type LoadState = 'loading' | 'ready' | 'not-found' | 'error';

/**
 * `/comunidad/:id` (M11, F-8) — detalle de una publicación: cuerpo completo,
 * fotos, comentarios (agregar/ver/borrar el propio), like, y — solo para la
 * autora — editar/borrar. `likedByMe` NO viene del backend (el contrato no
 * expone estado por espectador); el botón refleja únicamente lo que el
 * usuario alternó EN ESTA SESIÓN, nunca una historia previa fingida.
 */
export function PostDetailPage() {
  const { id } = useParams<{ id: string }>();
  const client = useApiClient();
  const { user } = useSession();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [state, setState] = useState<LoadState>('loading');
  const [post, setPost] = useState<Post | null>(null);

  const [comments, setComments] = useState<Comment[]>([]);
  const [commentBody, setCommentBody] = useState('');
  const [postingComment, setPostingComment] = useState(false);

  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editBody, setEditBody] = useState('');
  const [saving, setSaving] = useState(false);
  const [togglingShare, setTogglingShare] = useState(false);

  const { stateOf, react } = useReactions(post ? [post] : []);
  const myUserId = user?.id;
  const isAuthor = !!post && !!myUserId && post.authorUserId === myUserId;

  const loadComments = async (): Promise<void> => {
    if (!id) return;
    const page = await client.request<Partial<CommentsPage>>(
      `/community/posts/${encodeURIComponent(id)}/comments?limit=50`,
    );
    setComments(Array.isArray(page?.items) ? page.items : []);
  };

  useEffect(() => {
    if (!id) {
      setState('not-found');
      return;
    }
    let active = true;
    void (async () => {
      try {
        const found = await client.request<Post>(`/community/posts/${encodeURIComponent(id)}`);
        if (active) {
          setPost(found);
          setEditTitle(found.title ?? '');
          setEditBody(found.body);
          setState('ready');
        }
      } catch {
        if (active) setState('error');
      }
    })();
    void loadComments();
    return () => {
      active = false;
    };
  }, [client, id]);

  const submitComment = async (): Promise<void> => {
    if (!id || !commentBody.trim()) return;
    setPostingComment(true);
    try {
      await client.request<Comment>(`/community/posts/${encodeURIComponent(id)}/comments`, {
        method: 'POST',
        json: { body: commentBody.trim() },
      });
      setCommentBody('');
      await loadComments();
      setPost((prev) => (prev ? { ...prev, commentCount: prev.commentCount + 1 } : prev));
      toast({ title: 'Comentario agregado', variant: 'success' });
    } catch (error) {
      toast({
        title: 'No se pudo comentar',
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
        variant: 'destructive',
      });
    } finally {
      setPostingComment(false);
    }
  };

  const removeComment = async (commentId: string): Promise<void> => {
    try {
      await client.request(`/community/comments/${encodeURIComponent(commentId)}`, {
        method: 'DELETE',
      });
      await loadComments();
      setPost((prev) =>
        prev ? { ...prev, commentCount: Math.max(prev.commentCount - 1, 0) } : prev,
      );
    } catch (error) {
      toast({
        title: 'No se pudo eliminar el comentario',
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
        variant: 'destructive',
      });
    }
  };

  const saveEdit = async (): Promise<void> => {
    if (!id || editBody.trim().length < 10) {
      toast({
        title: 'Publicación muy corta',
        description: 'Escribe al menos 10 caracteres.',
        variant: 'warning',
      });
      return;
    }
    setSaving(true);
    try {
      const updated = await client.request<Post>(`/community/posts/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        json: { title: editTitle.trim() || undefined, body: editBody.trim() },
      });
      setPost(updated);
      setEditing(false);
      toast({ title: 'Publicación actualizada', variant: 'success' });
    } catch (error) {
      toast({
        title: 'No se pudo actualizar',
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const toggleShareable = async (shareable: boolean): Promise<void> => {
    if (!id || !post) return;
    setTogglingShare(true);
    try {
      await client.request(`/community/posts/${encodeURIComponent(id)}/shareable`, {
        method: 'PATCH',
        json: { shareable },
      });
      setPost({ ...post, shareable });
      toast({
        title: shareable
          ? 'Tu publicación ya se puede compartir'
          : 'Tu publicación ya no es pública',
        variant: 'success',
      });
    } catch (error) {
      toast({
        title: 'No se pudo cambiar',
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
        variant: 'destructive',
      });
    } finally {
      setTogglingShare(false);
    }
  };

  const remove = async (): Promise<void> => {
    if (!id) return;
    try {
      await client.request(`/community/posts/${encodeURIComponent(id)}`, { method: 'DELETE' });
      toast({ title: 'Publicación eliminada', variant: 'success' });
      navigate('/comunidad');
    } catch (error) {
      toast({
        title: 'No se pudo eliminar la publicación',
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
        variant: 'destructive',
      });
    }
  };

  return (
    <PageContainer>
      <PageHeader title="Publicación" description="Detalle, reacciones y comentarios." />
      <Link
        to="/comunidad"
        className="mb-4 inline-block text-sm text-muted-foreground underline-offset-4 hover:underline"
      >
        ← Volver a la comunidad
      </Link>

      {state === 'loading' && <Skeleton className="h-64 w-full" />}
      {state === 'not-found' && (
        <EmptyState title="Publicación no encontrada" description="Falta el identificador." />
      )}
      {state === 'error' && (
        <EmptyState
          title="No se pudo cargar"
          description="La publicación no existe, fue retirada por moderación, o inténtalo de nuevo más tarde."
        />
      )}

      {state === 'ready' && post && (
        <div className="space-y-6">
          <Card data-testid="post-detail">
            <CardHeader className="gap-2">
              <Badge variant={typeVariant(post.type)}>{TYPE_LABELS[post.type]}</Badge>
              <CardTitle>{post.title ?? post.authorName}</CardTitle>
              <p className="text-sm text-muted-foreground">
                {post.authorName}
                {post.organizationName ? ` · ${post.organizationName}` : ''} ·{' '}
                {formatBogota(post.createdAt)}
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {editing ? (
                <div className="space-y-3">
                  <Input
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    aria-label="Título"
                  />
                  <textarea
                    value={editBody}
                    onChange={(e) => setEditBody(e.target.value)}
                    rows={6}
                    aria-label="Cuerpo"
                    className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  />
                  <div className="flex gap-2">
                    <Button disabled={saving} onClick={() => void saveEdit()}>
                      {saving ? 'Guardando…' : 'Guardar'}
                    </Button>
                    <Button variant="outline" onClick={() => setEditing(false)}>
                      Cancelar
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="whitespace-pre-wrap text-sm text-foreground">{post.body}</p>
              )}

              <MediaGallery
                media={post.images}
                authorName={post.organizationName ?? post.authorName}
              />

              {(() => {
                const reaction = stateOf(post);
                return (
                  <>
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <ReactionSummary
                        counts={reaction.counts}
                        total={reaction.total}
                        mine={reaction.mine !== null}
                      />
                      <a href="#comentarios" className="text-muted-foreground hover:underline">
                        {commentCountLabel(post.commentCount)}
                      </a>
                    </div>
                    <div className="flex gap-1 border-y py-1">
                      <ReactionBar
                        value={reaction.mine}
                        onChange={(next) => void react(post, next)}
                      />
                    </div>
                  </>
                );
              })()}

              {isAuthor && (
                <label className="flex items-start gap-2 text-sm" htmlFor="post-detail-shareable">
                  <input
                    id="post-detail-shareable"
                    type="checkbox"
                    className="mt-1 h-4 w-4"
                    checked={!!post.shareable}
                    disabled={togglingShare}
                    onChange={(e) => void toggleShareable(e.target.checked)}
                  />
                  <span>
                    <span className="font-medium">Pública y compartible en redes.</span>{' '}
                    <span className="text-muted-foreground">
                      Sin cuenta se ve tu publicación, sin comentarios y, si publicas como persona,
                      solo con tu primer nombre.
                    </span>
                  </span>
                </label>
              )}
              {post.shareable && <SharePost post={post} />}

              {isAuthor && !editing && (
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                    Editar
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => void remove()}>
                    Eliminar
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          <Card id="comentarios">
            <CardHeader>
              <CardTitle className="text-base">Comentarios</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input
                  value={commentBody}
                  onChange={(e) => setCommentBody(e.target.value)}
                  placeholder="Escribe un comentario…"
                  aria-label="Comentario"
                />
                <Button
                  disabled={postingComment || !commentBody.trim()}
                  onClick={() => void submitComment()}
                >
                  {postingComment ? 'Enviando…' : 'Comentar'}
                </Button>
              </div>
              {comments.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aún no hay comentarios.</p>
              ) : (
                <ul className="space-y-3">
                  {comments.map((comment) => (
                    <li key={comment.id} className="flex gap-2.5 text-sm">
                      <AuthorAvatar name={comment.authorName} className="h-9 w-9" />
                      <div className="min-w-0 flex-1">
                        <div className="inline-block max-w-full rounded-2xl bg-muted px-3.5 py-2">
                          <p className="font-semibold">{comment.authorName}</p>
                          <p className="whitespace-pre-wrap break-words text-foreground">
                            {comment.body}
                          </p>
                        </div>
                        <p className="mt-1 flex items-center gap-3 pl-2 text-xs text-muted-foreground">
                          <span title={formatBogota(comment.createdAt)}>
                            {timeAgo(comment.createdAt, new Date())}
                          </span>
                          {myUserId === comment.authorUserId && (
                            <button
                              type="button"
                              className="font-semibold hover:underline"
                              onClick={() => void removeComment(comment.id)}
                            >
                              Eliminar
                            </button>
                          )}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </PageContainer>
  );
}
