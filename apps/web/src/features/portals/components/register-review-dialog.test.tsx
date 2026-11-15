import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Toaster } from '@adoptafacil/ui';
import { RegisterReviewDialog } from './register-review-dialog';

/**
 * S7-b (pedido del cliente): el botón "Registrar reseña" del portal público
 * abre un modal que NO exige cuenta y envía a
 * `POST /public/organizations/:slug/reviews` SIN header `Authorization` —
 * "no necesita estar registrado de ninguna forma". Desde 2026-11-05 el
 * visitante puede escribir su nombre (opcional) y un miembro con sesión lleva
 * el sello "Miembro de la comunidad" y elige si muestra el nombre de su cuenta.
 */
function stubFetch(response: { ok: boolean; status?: number; body: unknown }) {
  return vi.fn((_url: RequestInfo | URL, _init?: RequestInit) =>
    Promise.resolve({
      ok: response.ok,
      status: response.status ?? (response.ok ? 201 : 400),
      json: async () => response.body,
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('RegisterReviewDialog (S7-b — botón "Registrar reseña" del portal público)', () => {
  it('opens a modal with a 5-star picker, an optional comment and an OPTIONAL name — never email or password', async () => {
    const user = userEvent.setup();
    render(<RegisterReviewDialog slug="patitas" onSubmitted={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Registrar reseña' }));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getAllByRole('radio')).toHaveLength(5);
    expect(screen.getByLabelText('Comentario (opcional)')).toBeInTheDocument();
    expect(screen.getByLabelText('Tu nombre (opcional)')).toBeInTheDocument();
    expect(screen.queryByLabelText(/correo|email|contraseña/i)).not.toBeInTheDocument();
  });

  it('submits WITHOUT any Authorization header and reports the created review to the caller', async () => {
    const fetchMock = stubFetch({
      ok: true,
      body: {
        id: 'rev-1',
        organizationId: 'org-1',
        rating: 4,
        comment: 'Muy buena atención',
        isAnonymous: true,
        status: 'approved',
        createdAt: '2026-09-29T00:00:00.000Z',
      },
    });
    vi.stubGlobal('fetch', fetchMock);
    const onSubmitted = vi.fn();
    const user = userEvent.setup();
    render(<RegisterReviewDialog slug="patitas" onSubmitted={onSubmitted} />);

    await user.click(screen.getByRole('button', { name: 'Registrar reseña' }));
    await user.click(screen.getByRole('radio', { name: '4 de 5 estrellas' }));
    await user.type(screen.getByLabelText('Comentario (opcional)'), 'Muy buena atención');
    await user.click(screen.getByRole('button', { name: 'Enviar reseña' }));

    await waitFor(() => expect(onSubmitted).toHaveBeenCalledTimes(1));
    expect(onSubmitted).toHaveBeenCalledWith({
      review: expect.objectContaining({ id: 'rev-1', rating: 4, status: 'approved' }),
      authorName: undefined,
      isCommunityMember: false,
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    // La base de la URL depende de VITE_API_URL del entorno; lo que importa es la ruta.
    expect(url.endsWith('/public/organizations/patitas/reviews')).toBe(true);
    expect(init.headers).not.toHaveProperty('Authorization');
    expect(JSON.parse(init.body as string)).toEqual({ rating: 4, comment: 'Muy buena atención' });

    // The modal closes on success.
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('shows the backend error message and keeps the modal open on failure', async () => {
    vi.stubGlobal(
      'fetch',
      stubFetch({ ok: false, body: { message: 'El rating debe estar entre 1 y 5.' } }),
    );
    const user = userEvent.setup();
    render(
      <>
        <RegisterReviewDialog slug="patitas" onSubmitted={vi.fn()} />
        <Toaster />
      </>,
    );

    await user.click(screen.getByRole('button', { name: 'Registrar reseña' }));
    await user.click(screen.getByRole('button', { name: 'Enviar reseña' }));

    expect(await screen.findByText('No se pudo enviar tu reseña')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('a visitor can sign with their name — sent trimmed, still without Authorization, shown without badge', async () => {
    const fetchMock = stubFetch({
      ok: true,
      body: { id: 'rev-2', rating: 5, isAnonymous: false, status: 'approved', createdAt: 'x' },
    });
    vi.stubGlobal('fetch', fetchMock);
    const onSubmitted = vi.fn();
    const user = userEvent.setup();
    render(<RegisterReviewDialog slug="patitas" onSubmitted={onSubmitted} />);

    await user.click(screen.getByRole('button', { name: 'Registrar reseña' }));
    await user.type(screen.getByLabelText('Tu nombre (opcional)'), '  Laura   Gómez ');
    await user.click(screen.getByRole('button', { name: 'Enviar reseña' }));

    await waitFor(() => expect(onSubmitted).toHaveBeenCalledTimes(1));
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.headers).not.toHaveProperty('Authorization');
    expect(JSON.parse(init.body as string)).toEqual({ rating: 5, authorName: 'Laura Gómez' });
    expect(onSubmitted).toHaveBeenCalledWith(
      expect.objectContaining({ authorName: 'Laura Gómez', isCommunityMember: false }),
    );
  });

  it('a signed-in member gets the badge, no free name field, and is anonymous unless they opt in', async () => {
    const submit = vi.fn().mockResolvedValue({
      id: 'rev-3',
      organizationId: 'org-1',
      rating: 5,
      isAnonymous: true,
      status: 'approved',
      createdAt: 'x',
    });
    const onSubmitted = vi.fn();
    const user = userEvent.setup();
    render(
      <RegisterReviewDialog
        slug="patitas"
        onSubmitted={onSubmitted}
        member={{ name: 'Ana Pérez', isOwnOrganization: false }}
        submit={submit}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Registrar reseña' }));
    expect(screen.getByText('Miembro de la comunidad')).toBeInTheDocument();
    expect(screen.queryByLabelText('Tu nombre (opcional)')).not.toBeInTheDocument();
    const checkbox = screen.getByRole('checkbox', { name: /Mostrar mi nombre/ });
    expect(checkbox).not.toBeChecked();

    await user.click(screen.getByRole('button', { name: 'Enviar reseña' }));
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    expect(submit).toHaveBeenCalledWith('patitas', { rating: 5, isAnonymous: true });
    expect(onSubmitted).toHaveBeenCalledWith(
      expect.objectContaining({ authorName: undefined, isCommunityMember: true }),
    );
  });

  it('a member who opts in shows their ACCOUNT name', async () => {
    const submit = vi.fn().mockResolvedValue({ id: 'rev-4', rating: 5, createdAt: 'x' });
    const onSubmitted = vi.fn();
    const user = userEvent.setup();
    render(
      <RegisterReviewDialog
        slug="patitas"
        onSubmitted={onSubmitted}
        member={{ name: 'Ana Pérez', isOwnOrganization: false }}
        submit={submit}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Registrar reseña' }));
    await user.click(screen.getByRole('checkbox', { name: /Mostrar mi nombre/ }));
    await user.click(screen.getByRole('button', { name: 'Enviar reseña' }));

    await waitFor(() =>
      expect(submit).toHaveBeenCalledWith('patitas', { rating: 5, isAnonymous: false }),
    );
    expect(onSubmitted).toHaveBeenCalledWith(
      expect.objectContaining({ authorName: 'Ana Pérez', isCommunityMember: true }),
    );
  });

  it('blocks a member of the reviewed organization from reviewing it', async () => {
    const submit = vi.fn();
    const user = userEvent.setup();
    render(
      <RegisterReviewDialog
        slug="patitas"
        onSubmitted={vi.fn()}
        member={{ name: 'Refugio Patitas', isOwnOrganization: true }}
        submit={submit}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Registrar reseña' }));
    expect(screen.getByRole('alert')).toHaveTextContent(
      'No puedes reseñar tu propia organización.',
    );
    expect(screen.getByRole('button', { name: 'Enviar reseña' })).toBeDisabled();
  });
});
