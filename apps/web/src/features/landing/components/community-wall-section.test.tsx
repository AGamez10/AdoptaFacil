import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { CLOSED_CAPABILITIES, PostType, type PublicCommunityPost } from '@adoptafacil/contracts';
import { CapabilitiesProvider } from '../../../shell/capabilities';
import { OPEN_CAPABILITIES } from '../../../test-utils';
import { CommunityWallSection } from './community-wall-section';

function post(id: string, type: PostType, extra: Partial<PublicCommunityPost> = {}) {
  return {
    id,
    authorDisplayName: 'Laura',
    isOrganization: false,
    type,
    title: `Título ${id}`,
    body: `Cuerpo de ${id}`,
    images: [],
    likeCount: 3,
    commentCount: 2,
    createdAt: '2026-11-01T00:00:00.000Z',
    ...extra,
  } satisfies PublicCommunityPost;
}

function stubApi(posts: PublicCommunityPost[], leaders: unknown[]) {
  const fetchMock = vi.fn((url: string) => {
    const body = url.includes('/leaders')
      ? leaders
      : { items: posts, total: posts.length, limit: 12, offset: 0 };
    return Promise.resolve({ ok: true, status: 200, json: async () => body });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function renderSection(capabilities = OPEN_CAPABILITIES) {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <CapabilitiesProvider value={capabilities}>
        <CommunityWallSection />
      </CapabilitiesProvider>
    </MemoryRouter>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('CommunityWallSection (landing)', () => {
  it('stays out of the page and asks nothing when the wall is off', () => {
    const fetchMock = stubApi([], []);
    renderSection(CLOSED_CAPABILITIES);
    expect(screen.queryByTestId('landing-social')).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('shows public posts with likes, comments and a link to comment, plus the ranking with tiers', async () => {
    stubApi(
      [
        post('p1', PostType.General),
        post('p2', PostType.Event, { authorDisplayName: 'Huellitas', isOrganization: true }),
      ],
      [
        {
          displayName: 'Huellitas',
          isOrganization: true,
          publicPosts: 30,
          likesReceived: 100,
          commentsReceived: 50,
          points: 350,
        },
        {
          displayName: 'Laura',
          isOrganization: false,
          publicPosts: 2,
          likesReceived: 3,
          commentsReceived: 2,
          points: 17,
        },
      ],
    );
    renderSection();
    const section = screen.getByTestId('landing-social');
    expect(within(section).getByRole('link', { name: /Únete y publica/ })).toHaveAttribute(
      'href',
      '/register',
    );
    const cards = await screen.findAllByTestId('landing-social-post');
    expect(cards).toHaveLength(2);
    expect(cards[0]).toHaveAttribute('href', '/comunidad/publicacion/p1');
    expect(within(cards[0] as HTMLElement).getByLabelText('3 me gusta')).toBeInTheDocument();
    expect(within(cards[0] as HTMLElement).getByLabelText('2 comentarios')).toBeInTheDocument();

    const board = screen.getByTestId('landing-social-leaders');
    const rows = within(board).getAllByRole('listitem');
    expect(rows[0]).toHaveTextContent('Huellitas');
    expect(rows[0]).toHaveTextContent('Leyenda');
    expect(rows[1]).toHaveTextContent('Huella nueva');
  });

  it('filters the posts by category', async () => {
    stubApi([post('p1', PostType.General), post('p2', PostType.Event)], []);
    renderSection();
    await screen.findAllByTestId('landing-social-post');
    const filters = screen.getByRole('group', { name: 'Filtrar por categoría' });
    await userEvent.click(within(filters).getByRole('button', { name: 'Eventos' }));
    const cards = screen.getAllByTestId('landing-social-post');
    expect(cards).toHaveLength(1);
    expect(cards[0]).toHaveAttribute('href', '/comunidad/publicacion/p2');
    expect(within(filters).getByRole('button', { name: 'Eventos' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('invites to publish when there is nothing public yet, without a ranking', async () => {
    stubApi([], []);
    renderSection();
    expect(await screen.findByTestId('landing-social-empty')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByTestId('landing-social-leaders')).not.toBeInTheDocument(),
    );
  });
});
