import { useEffect, useState } from 'react';
import {
  COMMUNITY_POINTS,
  POST_TYPES,
  PostType,
  communityTier,
  type Post,
  type PostsPage,
  type PublicCommunityLeader,
} from '@adoptafacil/contracts';
import { EmptyState, Skeleton, cn } from '@adoptafacil/ui';
import { PageContainer, PageHeader } from '../../_layout';
import { useApiClient } from '../../../shell/api';
import { useSession } from '../../../shell/auth';
import { listPublicLeaders } from '../api/public-community';
import { PostCard } from '../components/post-card';
import { PostComposer } from '../components/post-composer';
import { useReactions } from '../hooks/use-reactions';
import { TYPE_LABELS } from '../model/community-view';

const MEDALS = ['🥇', '🥈', '🥉'];

function Leaders({ leaders }: { leaders: PublicCommunityLeader[] }) {
  return (
    <aside
      className="rounded-2xl border bg-card p-4 shadow-sm"
      aria-labelledby="feed-leaders-title"
      data-testid="feed-leaders"
    >
      <h2 id="feed-leaders-title" className="text-base font-bold">
        Escalafón de la manada
      </h2>
      <p className="mb-3 text-sm text-muted-foreground">Quienes más mueven la comunidad.</p>
      <ol className="space-y-2">
        {leaders.map((leader, index) => (
          <li key={`${leader.displayName}-${index}`} className="flex items-center gap-2 text-sm">
            <span className="w-6 text-center" aria-hidden="true">
              {MEDALS[index] ?? index + 1}
            </span>
            <span className="min-w-0 flex-1">
              <strong className="block truncate">{leader.displayName}</strong>
              <span className="text-xs text-muted-foreground">
                {communityTier(leader.points).label}
              </span>
            </span>
            <span className="font-bold">{leader.points.toLocaleString('es-CO')} pts</span>
          </li>
        ))}
      </ol>
      <p className="mt-3 text-xs text-muted-foreground">
        {COMMUNITY_POINTS.post} pts por publicación pública, {COMMUNITY_POINTS.comment} por
        comentario y {COMMUNITY_POINTS.like} por me gusta.
      </p>
    </aside>
  );
}

/**
 * `/comunidad` — el muro de la comunidad: publicar (fotos o video), filtrar
 * por categoría y reaccionar sin salir de la página. Cualquier usuario
 * autenticado (organización o Persona) puede publicar.
 */
export function CommunityFeedPage() {
  const client = useApiClient();
  const { user } = useSession();

  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<PostType | 'all'>('all');
  const [leaders, setLeaders] = useState<PublicCommunityLeader[]>([]);
  const { stateOf, react } = useReactions(posts);

  const load = async (activeFilter: PostType | 'all'): Promise<void> => {
    const qs = activeFilter !== 'all' ? `?type=${activeFilter}&limit=50` : '?limit=50';
    const page = await client.request<Partial<PostsPage>>(`/community/posts${qs}`);
    setPosts(Array.isArray(page?.items) ? page.items : []);
  };

  useEffect(() => {
    let active = true;
    setLoading(true);
    void (async () => {
      try {
        await load(filter);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [client, filter]);

  useEffect(() => {
    const controller = new AbortController();
    listPublicLeaders(5, controller.signal)
      .then(setLeaders)
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  const userName = user?.name ?? 'Tú';

  return (
    <PageContainer>
      <PageHeader
        title="Comunidad"
        description="Historias, avisos y campañas de personas y organizaciones de AdoptaFácil."
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="mx-auto w-full max-w-2xl space-y-4 lg:mx-0 lg:max-w-none">
          <PostComposer
            userName={userName}
            isOrganization={Boolean(user?.organizationId)}
            onCreated={(post) => {
              if (filter === 'all' || filter === post.type) setPosts((prev) => [post, ...prev]);
            }}
          />

          <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por categoría">
            {(['all', ...POST_TYPES] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setFilter(value)}
                aria-pressed={filter === value}
                className={cn(
                  'rounded-full border px-4 py-1.5 text-sm font-semibold transition-colors',
                  filter === value
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-input hover:bg-muted',
                )}
              >
                {value === 'all' ? 'Todas' : TYPE_LABELS[value]}
              </button>
            ))}
          </div>

          {loading && (
            <div className="space-y-4">
              <Skeleton className="h-64 w-full rounded-2xl" />
              <Skeleton className="h-64 w-full rounded-2xl" />
            </div>
          )}
          {!loading &&
            (posts.length === 0 ? (
              <EmptyState
                icon={<span aria-hidden>💬</span>}
                title="Aún no hay publicaciones"
                description="Sé la primera persona en publicar algo en la comunidad."
              />
            ) : (
              <div className="space-y-4">
                {posts.map((post) => (
                  <PostCard
                    key={post.id}
                    post={post}
                    reaction={stateOf(post)}
                    onReact={(p, next) => void react(p, next)}
                  />
                ))}
              </div>
            ))}
        </div>

        {leaders.length > 0 && (
          <div className="hidden lg:block">
            <div className="sticky top-4">
              <Leaders leaders={leaders} />
            </div>
          </div>
        )}
      </div>
    </PageContainer>
  );
}
