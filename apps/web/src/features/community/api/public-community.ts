import type {
  PublicCommunityLeader,
  PublicCommunityPost,
  PublicCommunityPostsPage,
} from '@adoptafacil/contracts';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

/** Últimas publicaciones públicas de la comunidad (`.items` siempre array). */
export async function listPublicPosts(
  limit = 3,
  signal?: AbortSignal,
): Promise<PublicCommunityPostsPage> {
  const response = await fetch(
    `${API_BASE}/public/community/posts?limit=${limit}`,
    signal ? { signal } : undefined,
  );
  if (!response.ok) throw new Error('error');
  const body = (await response.json()) as Partial<PublicCommunityPostsPage> | null;
  const items = Array.isArray(body?.items) ? body.items : [];
  return {
    items,
    total: typeof body?.total === 'number' ? body.total : items.length,
    limit: typeof body?.limit === 'number' ? body.limit : items.length,
    offset: typeof body?.offset === 'number' ? body.offset : 0,
  };
}

/** Una publicación pública, o `null` si no existe o su autora no la hizo pública. */
export async function getPublicPost(
  id: string,
  signal?: AbortSignal,
): Promise<PublicCommunityPost | null> {
  const response = await fetch(
    `${API_BASE}/public/community/posts/${encodeURIComponent(id)}`,
    signal ? { signal } : undefined,
  );
  if (response.status === 404) return null;
  if (!response.ok) throw new Error('error');
  return (await response.json()) as PublicCommunityPost;
}

/** Escalafón público de la comunidad (siempre un array; vacío ante un cuerpo raro). */
export async function listPublicLeaders(
  limit = 5,
  signal?: AbortSignal,
): Promise<PublicCommunityLeader[]> {
  const response = await fetch(
    `${API_BASE}/public/community/leaders?limit=${limit}`,
    signal ? { signal } : undefined,
  );
  if (!response.ok) throw new Error('error');
  const body = (await response.json()) as unknown;
  return Array.isArray(body) ? (body as PublicCommunityLeader[]) : [];
}
