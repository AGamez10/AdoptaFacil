import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PostType, Role, type Post } from '@adoptafacil/contracts';
import { renderShell } from '../../../test-utils';

const session = {
  session: {
    initialStatus: 'authenticated' as const,
    initialUser: {
      id: 'u1',
      name: 'Dueña',
      email: 'd@test.local',
      roles: [Role.Owner],
      organizationId: 'org-1',
      accountType: 'organization' as const,
    },
  },
};

const created: Post = {
  id: 'p1',
  organizationId: 'org-1',
  authorUserId: 'u1',
  authorName: 'Dueña',
  type: PostType.General,
  body: 'Una publicación con video de prueba.',
  images: [],
  commentCount: 0,
  likeCount: 0,
  status: 'published' as Post['status'],
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
};

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => 'blob:preview');
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => vi.unstubAllGlobals());

describe('PostComposer', () => {
  it('rejects a file that is not a photo or video, and deletes the post if an upload fails', async () => {
    const calls: Array<{ url: string; method?: string }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        calls.push({ url, method: init?.method });
        if (url.includes('/storage/upload')) {
          return Promise.resolve({
            ok: false,
            status: 500,
            headers: { get: () => null },
            json: async () => ({ message: 'boom' }),
          });
        }
        const body =
          init?.method === 'POST' && url.endsWith('/community/posts')
            ? {
                post: created,
                imageUploads: [{ key: 'public/org-1/x-photo.jpg', order: 0, url: '' }],
              }
            : { items: [], total: 0, limit: 50, offset: 0 };
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: { get: () => null },
          json: async () => body,
        });
      }),
    );
    renderShell({ route: '/comunidad', ...session });
    fireEvent.click(
      await screen.findByRole('button', { name: /¿Qué quieres compartir con la comunidad\?/ }),
    );
    const input = await screen.findByLabelText(/Fotos o video/);
    fireEvent.change(input, {
      target: { files: [new File(['x'], 'notas.pdf', { type: 'application/pdf' })] },
    });
    expect(await screen.findByText('No se pudo agregar')).toBeInTheDocument();

    fireEvent.change(input, {
      target: { files: [new File(['x'], 'foto.jpg', { type: 'image/jpeg' })] },
    });
    fireEvent.change(screen.getByLabelText('Tu publicación'), {
      target: { value: 'Una publicación con foto de prueba.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Publicar' }));
    await waitFor(() =>
      expect(
        calls.some((c) => c.method === 'DELETE' && c.url.endsWith('/community/posts/p1')),
      ).toBe(true),
    );
    expect(await screen.findByText('No se pudo publicar')).toBeInTheDocument();
  });
});
