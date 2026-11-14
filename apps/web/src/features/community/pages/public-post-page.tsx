import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { PublicCommunityPost } from '@adoptafacil/contracts';
import { Badge, EmptyState, Skeleton, buttonVariants, cn } from '@adoptafacil/ui';
import { PublicFooter, PublicNavbar } from '../../../shell/layout';
import { useSession } from '../../../shell/auth';
import { useSeo } from '../../../seo/seo';
import { getPublicPost } from '../api/public-community';
import { SharePost } from '../components/share-post';
import { publicPostPath } from '../lib/share';
import {
  TYPE_LABELS,
  commentCountLabel,
  excerpt,
  formatBogota,
  likeCountLabel,
  typeVariant,
} from '../model/community-view';

type LoadState = 'loading' | 'ready' | 'not-found' | 'error';

/**
 * `/comunidad/publicacion/:id` — una publicación de la comunidad SIN sesión, a
 * donde llega quien abre un enlace compartido en redes. Solo existe si su
 * autora la marcó como compartible; sin comentarios (llevan nombres) y con
 * una invitación clara a unirse a AdoptaFácil.
 */
export function PublicPostPage() {
  const { id } = useParams<{ id: string }>();
  const { status } = useSession();
  const [state, setState] = useState<LoadState>('loading');
  const [post, setPost] = useState<PublicCommunityPost | null>(null);

  useEffect(() => {
    if (!id) {
      setState('not-found');
      return;
    }
    const controller = new AbortController();
    getPublicPost(id, controller.signal)
      .then((found) => {
        setPost(found);
        setState(found ? 'ready' : 'not-found');
      })
      .catch(() => {
        if (!controller.signal.aborted) setState('error');
      });
    return () => controller.abort();
  }, [id]);

  const headline = post ? (post.title ?? excerpt(post.body, 80)) : '';
  useSeo({
    title: post ? `${headline} · ${post.authorDisplayName}` : 'Comunidad',
    description: post ? excerpt(post.body, 155) : undefined,
    path: id ? publicPostPath(id) : undefined,
    type: 'article',
    noindex: state !== 'ready',
  });

  const signedIn = status === 'authenticated';

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <PublicNavbar />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-10 sm:px-6">
        {state === 'loading' && <Skeleton className="h-72 w-full" />}
        {(state === 'not-found' || state === 'error') && (
          <EmptyState
            title="Esta publicación ya no está disponible"
            description="Puede que su autora la haya retirado o que ya no sea pública. Mira lo que pasa hoy en AdoptaFácil."
            action={
              <Link to="/adoptar" className={cn(buttonVariants())}>
                Conocer animales en adopción
              </Link>
            }
          />
        )}
        {state === 'ready' && post && (
          <article className="space-y-6" data-testid="public-post">
            <header className="space-y-3">
              <Badge variant={typeVariant(post.type)}>{TYPE_LABELS[post.type]}</Badge>
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{headline}</h1>
              <p className="text-sm text-muted-foreground">
                {post.isOrganization ? 'Publicado por la organización ' : 'Publicado por '}
                <span className="font-medium text-foreground">{post.authorDisplayName}</span> ·{' '}
                {formatBogota(post.createdAt)}
              </p>
            </header>
            <p className="whitespace-pre-wrap leading-relaxed">{post.body}</p>
            {post.images.length > 0 && (
              <div
                className={cn('grid gap-2', post.images.length > 1 && 'sm:grid-cols-2')}
                data-testid="public-post-images"
              >
                {post.images.map((image, index) => (
                  <img
                    key={image.id}
                    src={image.url}
                    alt={`Foto ${index + 1} de la publicación de ${post.authorDisplayName}`}
                    loading={index === 0 ? 'eager' : 'lazy'}
                    className={cn(
                      'w-full rounded-xl border object-cover',
                      post.images.length === 1 || index === 0 ? 'aspect-[16/10]' : 'aspect-[4/3]',
                      post.images.length > 1 && index === 0 && 'sm:col-span-2',
                    )}
                  />
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              {likeCountLabel(post.likeCount)} · {commentCountLabel(post.commentCount)}
            </p>
            <SharePost post={post} />

            <section
              className="rounded-xl border border-border bg-muted/40 p-5"
              aria-labelledby="public-post-join"
            >
              <h2 id="public-post-join" className="text-lg font-semibold">
                {signedIn ? 'Sigue la conversación' : 'Únete a la comunidad de AdoptaFácil'}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Refugios, fundaciones y personas que adoptan, apadrinan y ayudan en toda Colombia.
                Comenta, publica y entérate de lo que necesitan los animales cerca de ti.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {signedIn ? (
                  <Link
                    to={`/comunidad/${encodeURIComponent(post.id)}`}
                    className={cn(buttonVariants())}
                  >
                    Comentar en la comunidad
                  </Link>
                ) : (
                  <Link to="/register" className={cn(buttonVariants())}>
                    Crear mi cuenta gratis
                  </Link>
                )}
                <Link to="/adoptar" className={cn(buttonVariants({ variant: 'outline' }))}>
                  Conocer animales en adopción
                </Link>
              </div>
            </section>
          </article>
        )}
      </main>
      <PublicFooter />
    </div>
  );
}
