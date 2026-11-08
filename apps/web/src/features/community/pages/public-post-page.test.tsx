import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PostType, Role, type Post, type PublicCommunityPost } from '@adoptafacil/contracts';
import { renderShell } from '../../../test-utils';

/**
 * Comunidad pública: `/comunidad/publicacion/:id` sin sesión (destino de los
 * enlaces compartidos) y el interruptor "pública y compartible" de la autora.
 */
function publicPost(over: Partial<PublicCommunityPost> = {}): PublicCommunityPost {
  return {
    id: 'p1',
    authorDisplayName: 'Laura',
    isOrganization: false,
    type: PostType.General,
    title: 'Un año con Toby',
    body: 'Hoy cumple un año Toby desde que lo adopté.',
    images: [],
    commentCount: 2,
    likeCount: 5,
    createdAt: '2026-10-01T00:00:00.000Z',
    ...over,
  };
}

function stubFetch(
  handler: (url: string, init?: RequestInit) => { status?: number; body: unknown },
) {
  const fn = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const { status = 200, body } = handler(String(input), init);
    return Promise.resolve({
      ok: status < 400,
      status,
      headers: { get: () => null },
      json: async () => body,
    });
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('PublicPostPage', () => {
  it('shows a shareable post without a session: first name only, share buttons and a join CTA', async () => {
    stubFetch(() => ({ body: publicPost() }));
    renderShell({ route: '/comunidad/publicacion/p1' });

    await screen.findByTestId('public-post');
    expect(screen.getByRole('heading', { level: 1, name: 'Un año con Toby' })).toBeInTheDocument();
    expect(screen.getByText('Laura')).toBeInTheDocument();
    const whatsapp = within(screen.getByTestId('share-post')).getByRole('link', {
      name: /WhatsApp/,
    });
    expect(decodeURIComponent(whatsapp.getAttribute('href') ?? '')).toContain('/c/p1?s=whatsapp');
    expect(whatsapp).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.getByRole('link', { name: 'Crear mi cuenta gratis' })).toHaveAttribute(
      'href',
      '/register',
    );
  });

  it('a post that is not public (404) explains it and offers a next step', async () => {
    stubFetch(() => ({ status: 404, body: { message: 'not found' } }));
    renderShell({ route: '/comunidad/publicacion/p1' });
    expect(await screen.findByText('Esta publicación ya no está disponible')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Conocer animales en adopción' })).toBeInTheDocument();
  });
});

describe('PostDetailPage · pública y compartible', () => {
  const post = (over: Partial<Post> = {}): Post => ({
    id: 'p1',
    organizationId: 'org-1',
    organizationName: 'Refugio Patitas',
    authorUserId: 'author-1',
    authorName: 'Autora',
    type: PostType.General,
    body: 'Cuerpo de la publicación de prueba.',
    images: [],
    commentCount: 0,
    likeCount: 0,
    status: 'published' as Post['status'],
    shareable: false,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    ...over,
  });
  const session = (id: string) => ({
    session: {
      initialStatus: 'authenticated' as const,
      initialUser: {
        id,
        name: 'Autora',
        email: 'a@test.local',
        roles: [Role.Owner],
        organizationId: 'org-1',
        accountType: 'organization' as const,
      },
    },
  });

  it('the author turns it public and the share buttons appear', async () => {
    const fetchMock = stubFetch((url, init) => {
      if (url.includes('/comments')) return { body: { items: [], total: 0, limit: 50, offset: 0 } };
      if (url.endsWith('/shareable') && init?.method === 'PATCH')
        return { body: { shareable: true } };
      return { body: post() };
    });
    renderShell({ route: '/comunidad/p1', ...session('author-1') });
    await screen.findByTestId('post-detail');
    expect(screen.queryByTestId('share-post')).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText(/Pública y compartible en redes/));
    await screen.findByTestId('share-post');
    const patch = fetchMock.mock.calls.find(([, init]) => init?.method === 'PATCH');
    expect(String(patch?.[0])).toContain('/community/posts/p1/shareable');
    expect(JSON.parse(String(patch?.[1]?.body))).toEqual({ shareable: true });
  });

  it('a viewer who is not the author never sees the switch', async () => {
    stubFetch((url) =>
      url.includes('/comments')
        ? { body: { items: [], total: 0, limit: 50, offset: 0 } }
        : { body: post({ shareable: true }) },
    );
    renderShell({ route: '/comunidad/p1', ...session('viewer-1') });
    await screen.findByTestId('share-post');
    await waitFor(() =>
      expect(screen.queryByLabelText(/Pública y compartible en redes/)).not.toBeInTheDocument(),
    );
  });
});
