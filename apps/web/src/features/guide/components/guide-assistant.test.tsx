import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { CLOSED_CAPABILITIES, Role, type PublicCapabilities } from '@adoptafacil/contracts';
import { AppProviders, type AppProvidersProps } from '../../../shell/app-providers';
import { OPEN_CAPABILITIES } from '../../../test-utils';
import { helpForPath } from '../model/guide-content';
import { useGuideContext, type GuideContext } from '../model/guide-context';
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

/** Lo que hace una página (portal, ficha, plantilla) al montarse. */
function PageWithContext({ context }: { context: GuideContext }) {
  useGuideContext(context);
  return null;
}

function renderWithContext(
  route: string,
  context: GuideContext,
  { session }: { session?: AppProvidersProps['session'] } = {},
) {
  return render(
    <AppProviders session={session} capabilities={OPEN_CAPABILITIES}>
      <MemoryRouter
        initialEntries={[route]}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <PageWithContext context={context} />
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

describe('GuideAssistant · ayuda según el contexto de la página', () => {
  const organization = {
    name: 'Huellitas',
    whatsapp: '300 123 4567',
    contactEmail: 'hola@huellitas.org',
  };

  it('en el portal de una organización: botón discreto, sin pestañas, y WhatsApp de ESA organización', () => {
    renderWithContext('/o/huellitas', { kind: 'portal', organization });
    const toggle = screen.getByTestId('guide-toggle');
    expect(toggle.className).toMatch(/toggle--subtle/);
    expect(toggle).toHaveAccessibleName('Ayuda');

    fireEvent.click(toggle);
    const panel = screen.getByRole('dialog');
    expect(within(panel).getByText('Estás en el portal de Huellitas')).toBeInTheDocument();
    expect(within(panel).queryByRole('group', { name: 'Tipo de ayuda' })).toBeNull();

    const whatsapp = within(panel).getByTestId('contact-whatsapp');
    expect(whatsapp).toHaveAttribute('href', expect.stringContaining('wa.me/573001234567'));
    expect(whatsapp).not.toHaveAttribute('href', expect.stringContaining('573028528926'));
    expect(whatsapp).toHaveTextContent('WhatsApp de Huellitas');
    expect(within(panel).getByTestId('contact-email')).toHaveAttribute(
      'href',
      expect.stringContaining('mailto:hola@huellitas.org'),
    );
    // AdoptaFácil queda solo para reportar fallas de la página, por correo.
    expect(within(panel).getByRole('link', { name: 'Avísale a AdoptaFácil' })).toHaveAttribute(
      'href',
      expect.stringContaining('mailto:adoptafacil.oficial@gmail.com'),
    );
  });

  it('en la ficha de un animal el mensaje de WhatsApp ya nombra al animal', () => {
    renderWithContext('/o/huellitas/animales/a1', {
      kind: 'portal',
      organization,
      animalName: 'Toby',
    });
    fireEvent.click(screen.getByTestId('guide-toggle'));
    expect(screen.getByText('Ficha de Toby')).toBeInTheDocument();
    const href = screen.getByTestId('contact-whatsapp').getAttribute('href') ?? '';
    expect(decodeURIComponent(href)).toContain('Vi a Toby en su portal de AdoptaFácil');
  });

  it('si la organización no publicó WhatsApp ni correo, lo dice y no manda al WhatsApp de AdoptaFácil', () => {
    renderWithContext('/o/sin-datos', { kind: 'portal', organization: { name: 'Sin Datos' } });
    fireEvent.click(screen.getByTestId('guide-toggle'));
    expect(screen.getByTestId('guide-org-no-contact')).toHaveTextContent(
      'Sin Datos todavía no publicó WhatsApp ni correo.',
    );
    expect(screen.queryByTestId('contact-whatsapp')).toBeNull();
  });

  it('un número inválido no se convierte en enlace', () => {
    renderWithContext('/o/x', {
      kind: 'portal',
      organization: { name: 'X', whatsapp: 'javascript:alert(1)' },
    });
    fireEvent.click(screen.getByTestId('guide-toggle'));
    expect(screen.queryByTestId('contact-whatsapp')).toBeNull();
    expect(screen.getByTestId('guide-org-no-contact')).toBeInTheDocument();
  });

  it('en la plantilla de ejemplo explica que los datos son de prueba y dónde se carga cada cosa', () => {
    renderWithContext('/plantillas/cartel', { kind: 'template-demo', templateName: 'Cartel' });
    fireEvent.click(screen.getByTestId('guide-toggle'));
    const panel = screen.getByRole('dialog');
    expect(within(panel).getByText('Plantilla Cartel: así se vería tu portal')).toBeInTheDocument();
    expect(
      within(panel).getByText(/su WhatsApp lleva al número de tu organización/),
    ).toBeInTheDocument();
    // Un visitante no ve enlaces a pantallas del panel que no puede abrir.
    expect(within(panel).queryByRole('navigation', { name: 'Dónde se gestiona' })).toBeNull();
  });

  it('la misma plantilla, vista por una organización, enlaza a donde se carga cada dato', () => {
    renderWithContext(
      '/plantillas/cartel',
      { kind: 'template-demo', templateName: 'Cartel' },
      { session: orgSession([Role.Owner]) },
    );
    fireEvent.click(screen.getByTestId('guide-toggle'));
    const related = screen.getByRole('navigation', { name: 'Dónde se gestiona' });
    expect(within(related).getByRole('link', { name: /Mi organización/ })).toHaveAttribute(
      'href',
      '/organizacion',
    );
    expect(within(related).getByRole('link', { name: /Personalización/ })).toHaveAttribute(
      'href',
      '/organizacion/portal',
    );
  });
});

describe('GuideAssistant · "Dónde se gestiona" respeta el rol', () => {
  it('formalización enlaza a Documentos para el propietario', () => {
    renderGuide('/organizacion/formalizacion', { session: orgSession([Role.Owner]) });
    fireEvent.click(screen.getByTestId('guide-toggle'));
    expect(screen.getByText('Formalización')).toBeInTheDocument();
    const related = screen.getByRole('navigation', { name: 'Dónde se gestiona' });
    expect(within(related).getByRole('link', { name: /Documentos/ })).toHaveAttribute(
      'href',
      '/organizacion/documentos',
    );
  });

  it('un operador no recibe el enlace a Documentos (no es su rol)', () => {
    renderGuide('/organizacion/formalizacion', { session: orgSession([Role.Operator]) });
    fireEvent.click(screen.getByTestId('guide-toggle'));
    expect(screen.queryByRole('link', { name: /Documentos/ })).toBeNull();
  });

  it('el inicio cambia según la cuenta', () => {
    expect(helpForPath('/inicio', new Set(['org'])).title).toBe('Inicio de tu organización');
    expect(helpForPath('/inicio', new Set(['person'])).title).toBe('Tu inicio');
    expect(helpForPath('/', new Set(['visitor'])).tips[0]).toMatch(/animales disponibles/);
    expect(helpForPath('/', new Set(['person'])).tips[0]).toMatch(/página pública/);
  });

  it('cada página del panel tiene su propia ayuda (no la genérica)', () => {
    for (const path of [
      '/organizacion',
      '/organizacion/firmantes',
      '/organizacion/reportes',
      '/organizacion/campanas',
      '/organizacion/recursos',
      '/organizacion/voluntariado',
      '/donaciones-recibidas',
      '/mis-donaciones',
      '/voluntariado',
      '/comunidad',
      '/recursos',
      '/plataforma/organizaciones',
    ]) {
      expect(helpForPath(path).title, path).not.toBe('Ayuda');
    }
  });
});
