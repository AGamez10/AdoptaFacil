import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { CLOSED_CAPABILITIES, Role, type PublicCapabilities } from '@adoptafacil/contracts';
import { AppProviders, type AppProvidersProps } from '../../../shell/app-providers';
import { OPEN_CAPABILITIES } from '../../../test-utils';
import { helpForPath } from '../model/guide-content';
import { GuideAssistant } from './guide-assistant';

function renderGuide(
  route: string,
  {
    session,
    capabilities = CLOSED_CAPABILITIES,
  }: { session?: AppProvidersProps['session']; capabilities?: PublicCapabilities } = {},
) {
  return render(
    <AppProviders session={session} capabilities={capabilities}>
      <MemoryRouter
        initialEntries={[route]}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <GuideAssistant />
      </MemoryRouter>
    </AppProviders>,
  );
}

function orgSession(roles: Role[]): AppProvidersProps['session'] {
  return {
    initialStatus: 'authenticated',
    initialUser: {
      id: 'u-1',
      name: 'Ana',
      email: 'ana@refugio.test',
      roles,
      organizationId: 'org-1',
      accountType: 'organization',
    },
  };
}

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: async () => ({}),
      }),
    ),
  );
});
afterEach(() => vi.unstubAllGlobals());

describe('helpForPath', () => {
  it('picks the most specific help and falls back to the generic one', () => {
    expect(helpForPath('/').title).toBe('Inicio de AdoptaFácil');
    expect(helpForPath('/o/patitas/animales/a1').title).toBe('Ficha del animal');
    expect(helpForPath('/o/patitas').title).toBe('Portal de una organización');
    expect(helpForPath('/organizacion/documentos').title).toBe('Documentos de la organización');
    expect(helpForPath('/algo-que-no-existe').title).toBe('Ayuda');
  });
});

describe('GuideAssistant (R3-8, D14)', () => {
  it('opens and closes accessibly, with help for the current page and official contact', () => {
    renderGuide('/');
    const toggle = screen.getByTestId('guide-toggle');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('dialog')).toBeNull();

    fireEvent.click(toggle);
    const panel = screen.getByRole('dialog', { name: '¿En qué te ayudo?' });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(within(panel).getByText('Inicio de AdoptaFácil')).toBeInTheDocument();
    expect(within(panel).getByTestId('contact-whatsapp')).toHaveAttribute(
      'href',
      expect.stringContaining('wa.me/573028528926'),
    );
    expect(within(panel).getByText(/no usa inteligencia artificial/)).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(toggle).toHaveFocus();
  });

  it('a visitor gets the visitor guides and a public map without switched-off modules', () => {
    renderGuide('/');
    fireEvent.click(screen.getByTestId('guide-toggle'));
    fireEvent.click(screen.getByRole('button', { name: 'Guías paso a paso' }));
    const flows = screen.getByRole('list', { name: 'Guías disponibles' });
    expect(within(flows).getByText('Quiero adoptar')).toBeInTheDocument();
    expect(within(flows).getByText('Registrar mi organización')).toBeInTheDocument();
    expect(within(flows).queryByText('Publicar un animal')).toBeNull();

    fireEvent.click(within(flows).getByText('Quiero adoptar'));
    const flow = screen.getByTestId('guide-flow');
    expect(within(flow).getByRole('link', { name: 'Crear cuenta' })).toHaveAttribute(
      'href',
      '/register',
    );

    fireEvent.click(screen.getByRole('button', { name: '¿A dónde voy?' }));
    const map = screen.getByRole('list', { name: 'Lugares a los que puedes ir' });
    expect(within(map).getByText('Animales en adopción')).toBeInTheDocument();
    expect(within(map).queryByText('Marketplace')).toBeNull();
    expect(within(map).queryByText('Banco de recursos')).toBeNull();
  });

  it('the public map shows a module once it is switched on', () => {
    renderGuide('/', { capabilities: OPEN_CAPABILITIES });
    fireEvent.click(screen.getByTestId('guide-toggle'));
    fireEvent.click(screen.getByRole('button', { name: '¿A dónde voy?' }));
    expect(screen.getByText('Marketplace')).toBeInTheDocument();
  });

  it('an org owner gets org guides and a role-filtered map without money modules', () => {
    renderGuide('/organizacion/documentos', { session: orgSession([Role.Owner]) });
    fireEvent.click(screen.getByTestId('guide-toggle'));
    expect(screen.getByText('Documentos de la organización')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Guías paso a paso' }));
    const flows = screen.getByRole('list', { name: 'Guías disponibles' });
    expect(within(flows).getByText('Publicar un animal')).toBeInTheDocument();
    expect(within(flows).getByText('Subir los documentos de la organización')).toBeInTheDocument();
    expect(within(flows).queryByText('Revisar documentos de organizaciones')).toBeNull();
    expect(within(flows).queryByText('Registrar mi organización')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '¿A dónde voy?' }));
    const map = screen.getByRole('list', { name: 'Lugares a los que puedes ir' });
    expect(within(map).getByText('Mi organización')).toBeInTheDocument();
    expect(within(map).getByText('Animales')).toBeInTheDocument();
    expect(within(map).queryByText('Donaciones recibidas')).toBeNull();
    expect(within(map).queryByText('Revisión de documentos')).toBeNull();
  });

  it('an operator does not get the documents guide (not their role)', () => {
    renderGuide('/inicio', { session: orgSession([Role.Operator]) });
    fireEvent.click(screen.getByTestId('guide-toggle'));
    fireEvent.click(screen.getByRole('button', { name: 'Guías paso a paso' }));
    expect(screen.queryByText('Subir los documentos de la organización')).toBeNull();
    expect(screen.getByText('Publicar un animal')).toBeInTheDocument();
  });

  it('never reads form values: typing in the page does not change what it shows', () => {
    const { container } = render(
      <AppProviders capabilities={CLOSED_CAPABILITIES}>
        <MemoryRouter
          initialEntries={['/register']}
          future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
        >
          <input aria-label="Correo" defaultValue="" />
          <GuideAssistant />
        </MemoryRouter>
      </AppProviders>,
    );
    fireEvent.click(screen.getByTestId('guide-toggle'));
    const before = screen.getByRole('dialog').innerHTML;
    fireEvent.change(screen.getByLabelText('Correo'), { target: { value: 'secreto@x.co' } });
    expect(screen.getByRole('dialog').innerHTML).toBe(before);
    expect(container.textContent).not.toContain('secreto@x.co');
  });
});
