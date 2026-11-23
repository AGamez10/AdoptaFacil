import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Role } from '@adoptafacil/contracts';
import { openNavSections, renderShell } from '../../test-utils';

function sessionWith(roles: Role[]) {
  return {
    session: {
      initialStatus: 'authenticated' as const,
      initialUser: {
        id: 'u1',
        name: 'Tester',
        email: 'tester@example.test',
        roles,
        organizationId: 'org-1',
        accountType: 'organization' as const,
      },
    },
  };
}

describe('Sidebar — org identity chip (REFACTOR-VISUAL v2, Fase 3)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('shows the real org name once GET /org/profile resolves', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({ id: 'org-1', name: 'Huellas de Vida' }),
      }),
    );

    renderShell({
      route: '/adopciones',
      session: {
        initialStatus: 'authenticated',
        initialUser: {
          id: 'u1',
          name: 'Laura Gómez',
          email: 'laura@example.test',
          roles: [Role.Owner],
          organizationId: 'org-1',
          accountType: 'organization',
        },
      },
    });

    // Rendered twice by design — the persistent desktop sidebar AND the
    // off-canvas mobile drawer both mount at once (only one is visible per
    // viewport via CSS, same pattern the pre-existing <Brand> already uses).
    const sidebar = screen.getByTestId('org-sidebar');
    expect(await within(sidebar).findByText('Huellas de Vida')).toBeInTheDocument();
  });

  it('renders nothing for a Persona session and never fetches the org profile', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    renderShell({
      route: '/adopciones',
      session: {
        initialStatus: 'authenticated',
        initialUser: {
          id: 'u2',
          name: 'Camila Torres',
          email: 'camila@example.test',
          roles: [],
          accountType: 'person',
        },
      },
    });

    // La compuerta legal consulta `/legal/me`, la campana `/me/notifications`
    // y el menú pregunta si la persona activó su panel de negocio
    // (`/community/business/me`); lo que no debe pasar para una Persona es
    // pedir el perfil de la organización.
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.filter(
          ([url]) => !/\/(legal\/me|me\/notifications|community\/business\/me)$/.test(String(url)),
        ),
      ).toHaveLength(0),
    );
  });

  it('degrades silently (no crash) when the org profile fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));

    renderShell({
      route: '/adopciones',
      session: {
        initialStatus: 'authenticated',
        initialUser: {
          id: 'u3',
          name: 'Laura Gómez',
          email: 'laura@example.test',
          roles: [Role.Owner],
          organizationId: 'org-1',
          accountType: 'organization',
        },
      },
    });

    // The shell still renders normally — no crash, just no identity chip.
    expect(
      await screen.findByRole('navigation', { name: 'Navegación principal' }),
    ).toBeInTheDocument();
  });

  it('MENU-SUBMENUS: the identity block links to "Mi organización" (replaces the removed nav entry)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({ id: 'org-1', name: 'Huellas de Vida' }),
      }),
    );

    renderShell({ route: '/adopciones', ...sessionWith([Role.Owner]) });

    const sidebar = screen.getByTestId('org-sidebar');
    const identityLink = await within(sidebar).findByRole('link', { name: /Huellas de Vida/ });
    expect(identityLink).toHaveAttribute('href', '/organizacion');
  });
});

describe('Sidebar — NAV-SECCIONES y grupos desplegables', () => {
  afterEach(() => vi.unstubAllGlobals());

  function stubGenericFetch() {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => [],
      }),
    );
  }

  function sectionToggle(sidebar: HTMLElement, name: string) {
    return within(sidebar).getByRole('button', { name: new RegExp(`^${name}`) });
  }

  function sectionLabels(sidebar: HTMLElement) {
    return Array.from(sidebar.querySelectorAll('button[data-nav-section]')).map((el) =>
      (el.textContent ?? '').trim(),
    );
  }

  it('NAV-SECCIONES: el dueño ve el menú agrupado por tareas, con solo "Animales y adopciones" abierta al entrar', async () => {
    stubGenericFetch();
    renderShell({ route: '/inicio', ...sessionWith([Role.Owner]) });

    const sidebar = screen.getByTestId('org-sidebar');
    await within(sidebar).findByRole('link', { name: 'Inicio' });
    expect(sectionLabels(sidebar)).toEqual([
      'Animales y adopciones',
      'Recaudación',
      'Comunidad',
      'Organización',
      'Mi actividad',
    ]);
    expect(sectionToggle(sidebar, 'Animales y adopciones')).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    for (const name of ['Recaudación', 'Comunidad', 'Organización', 'Mi actividad']) {
      expect(sectionToggle(sidebar, name)).toHaveAttribute('aria-expanded', 'false');
    }
    for (const name of ['Animales', 'Adopciones', 'Reportes de animales', 'Custodia y guardería']) {
      expect(within(sidebar).getByRole('link', { name })).toBeInTheDocument();
    }
    // Lo cerrado no se pinta: menos de la mitad de entradas a la vista.
    expect(within(sidebar).queryByRole('link', { name: 'Campañas' })).not.toBeInTheDocument();
    expect(within(sidebar).queryByRole('link', { name: 'Mis donaciones' })).not.toBeInTheDocument();
  });

  it('NAV-SECCIONES: abrir una sección muestra sus entradas y el navegador lo recuerda', async () => {
    stubGenericFetch();
    const first = renderShell({ route: '/inicio', ...sessionWith([Role.Owner]) });

    let sidebar = screen.getByTestId('org-sidebar');
    fireEvent.click(await within(sidebar).findByRole('button', { name: /^Recaudación/ }));
    expect(sectionToggle(sidebar, 'Recaudación')).toHaveAttribute('aria-expanded', 'true');
    expect(within(sidebar).getByRole('link', { name: 'Campañas' })).toHaveAttribute(
      'href',
      '/organizacion/campanas',
    );
    expect(within(sidebar).getByRole('link', { name: 'Donaciones' })).toHaveAttribute(
      'href',
      '/donaciones-recibidas',
    );
    first.unmount();

    renderShell({ route: '/inicio', ...sessionWith([Role.Owner]) });
    sidebar = screen.getByTestId('org-sidebar');
    expect(await within(sidebar).findByRole('link', { name: 'Campañas' })).toBeInTheDocument();

    fireEvent.click(sectionToggle(sidebar, 'Recaudación'));
    expect(within(sidebar).queryByRole('link', { name: 'Campañas' })).not.toBeInTheDocument();
  });

  it('NAV-SECCIONES: la sección de la pantalla actual se abre sola y marca la entrada activa', async () => {
    stubGenericFetch();
    renderShell({ route: '/organizacion/apadrinamientos', ...sessionWith([Role.Owner]) });

    const sidebar = screen.getByTestId('org-sidebar');
    expect(await within(sidebar).findByRole('link', { name: 'Apadrinamientos' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(sectionToggle(sidebar, 'Recaudación')).toHaveAttribute('aria-expanded', 'true');
  });

  it('NAV-SECCIONES: "Reseñas" ya no aparece dos veces — "Reseñas recibidas" (del portal) y "Mis reseñas" (las propias)', async () => {
    stubGenericFetch();
    renderShell({ route: '/inicio', ...sessionWith([Role.Owner]) });
    await openNavSections();

    const sidebar = screen.getByTestId('org-sidebar');
    expect(within(sidebar).getByRole('link', { name: 'Reseñas recibidas' })).toHaveAttribute(
      'href',
      '/organizacion/resenas',
    );
    expect(within(sidebar).getByRole('link', { name: 'Mis reseñas' })).toHaveAttribute(
      'href',
      '/resenas',
    );
    expect(within(sidebar).queryByRole('link', { name: 'Reseñas' })).not.toBeInTheDocument();
    expect(
      within(sidebar).queryByRole('link', { name: 'Reseñas del portal' }),
    ).not.toBeInTheDocument();
  });

  it('NAV-SECCIONES: lo personal del dueño (sus donaciones, voluntariado, datos) vive en "Mi actividad"', async () => {
    stubGenericFetch();
    renderShell({ route: '/inicio', ...sessionWith([Role.Owner]) });

    const sidebar = screen.getByTestId('org-sidebar');
    fireEvent.click(await within(sidebar).findByRole('button', { name: /^Mi actividad/ }));
    for (const [name, href] of [
      ['Mis donaciones', '/mis-donaciones'],
      ['Mis apadrinamientos', '/apadrinar'],
      ['Mi voluntariado', '/voluntariado'],
      ['Mis ofertas', '/mis-ofertas'],
      ['Uso de mis datos', '/uso-de-mis-datos'],
    ]) {
      expect(within(sidebar).getByRole('link', { name })).toHaveAttribute('href', href);
    }
  });

  it('NAV-SECCIONES: un voluntario (sin gestión) ve su actividad abierta y no ve la gestión de voluntariado', async () => {
    stubGenericFetch();
    renderShell({ route: '/inicio', ...sessionWith([Role.Volunteer]) });

    const sidebar = screen.getByTestId('org-sidebar');
    expect(await within(sidebar).findByRole('link', { name: 'Mi voluntariado' })).toHaveAttribute(
      'href',
      '/voluntariado',
    );
    await openNavSections();
    expect(within(sidebar).queryByRole('link', { name: 'Voluntariado' })).not.toBeInTheDocument();
    expect(within(sidebar).queryByRole('link', { name: 'Animales' })).not.toBeInTheDocument();
  });

  it('NAV-SECCIONES: una persona sin cargo conserva su menú corto, sin secciones', async () => {
    stubGenericFetch();
    renderShell({
      route: '/inicio',
      session: {
        initialStatus: 'authenticated' as const,
        initialUser: {
          id: 'u2',
          name: 'Donante',
          email: 'donante@example.test',
          roles: [],
          organizationId: 'personal-1',
          accountType: 'person' as const,
        },
      },
    });

    const sidebar = screen.getByTestId('org-sidebar');
    const toggle = await within(sidebar).findByRole('button', { name: 'Donaciones' });
    expect(sidebar.querySelector('button[data-nav-section]')).toBeNull();
    fireEvent.click(toggle);
    expect(within(sidebar).getByRole('link', { name: 'Mis donaciones' })).toHaveAttribute(
      'href',
      '/mis-donaciones',
    );
    expect(within(sidebar).getByRole('link', { name: 'Mis solicitudes' })).toBeInTheDocument();
  });

  it('"Recordatorios" ya no es entrada del menú y "Inicio" se resalta en /recordatorios', async () => {
    stubGenericFetch();
    renderShell({ route: '/recordatorios', ...sessionWith([Role.Owner]) });

    const sidebar = screen.getByTestId('org-sidebar');
    const inicio = await within(sidebar).findByRole('link', { name: 'Inicio' });
    expect(within(sidebar).queryByRole('link', { name: 'Recordatorios' })).not.toBeInTheDocument();
    expect(inicio.className).toContain('active');
  });

  it('"Donaciones y campañas" ya no es una entrada del menú (vive dentro de Inicio)', async () => {
    stubGenericFetch();
    renderShell({ route: '/inicio', ...sessionWith([Role.Owner]) });
    await openNavSections();

    const sidebar = screen.getByTestId('org-sidebar');
    expect(
      within(sidebar).queryByRole('link', { name: 'Donaciones y campañas' }),
    ).not.toBeInTheDocument();
  });

  it('el logo del menú lleva a /inicio', async () => {
    stubGenericFetch();
    renderShell({ route: '/adopciones', ...sessionWith([Role.Owner]) });

    const sidebar = screen.getByTestId('org-sidebar');
    expect(within(sidebar).getByRole('link', { name: 'Ir al inicio' })).toHaveAttribute(
      'href',
      '/inicio',
    );
  });

  it('"Documentos": the label navigates to the real module; the chevron only expands/collapses its children', async () => {
    stubGenericFetch();
    renderShell({ route: '/inicio', ...sessionWith([Role.Owner]) });
    await openNavSections();

    const sidebar = screen.getByTestId('org-sidebar');
    const link = await within(sidebar).findByRole('link', { name: 'Documentos' });
    expect(link).toHaveAttribute('href', '/organizacion/documentos');

    const chevron = within(sidebar).getByRole('button', { name: 'Expandir Documentos' });
    expect(chevron).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(chevron);

    expect(chevron).toHaveAttribute('aria-expanded', 'true');
    expect(within(sidebar).getByRole('link', { name: /Transparencia nacional/ })).toHaveAttribute(
      'href',
      '/organizacion/transparencia-nacional',
    );
    expect(
      within(sidebar).getByRole('link', { name: /^Reportes(?! de animales)/ }),
    ).toHaveAttribute('href', '/organizacion/reportes');
    // The label link itself is untouched by the chevron toggle.
    expect(link).toHaveAttribute('href', '/organizacion/documentos');
  });

  it('firmantes: la auditora con cargo solo ve "Documentos por firmar"; sin cargo ve "Reportes"; el Owner ve ambos', async () => {
    const stubReadiness = (body: unknown) =>
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => body,
        }),
      );

    stubReadiness({ mySignerRole: 'fiscal_reviewer' });
    const signer = renderShell({ route: '/inicio', ...sessionWith([Role.ReadOnlyAuditor]) });
    await openNavSections();
    let sidebar = screen.getByTestId('org-sidebar');
    fireEvent.click(await within(sidebar).findByRole('button', { name: 'Expandir Documentos' }));
    expect(
      await within(sidebar).findByRole('link', { name: 'Documentos por firmar' }),
    ).toBeInTheDocument();
    expect(
      within(sidebar).queryByRole('link', { name: /^Reportes(?! de animales)/ }),
    ).not.toBeInTheDocument();
    signer.unmount();

    stubReadiness({});
    const plain = renderShell({ route: '/inicio', ...sessionWith([Role.ReadOnlyAuditor]) });
    await openNavSections();
    sidebar = screen.getByTestId('org-sidebar');
    fireEvent.click(await within(sidebar).findByRole('button', { name: 'Expandir Documentos' }));
    expect(
      await within(sidebar).findByRole('link', { name: /^Reportes(?! de animales)/ }),
    ).toBeInTheDocument();
    expect(
      within(sidebar).queryByRole('link', { name: 'Documentos por firmar' }),
    ).not.toBeInTheDocument();
    plain.unmount();

    stubGenericFetch();
    renderShell({ route: '/inicio', ...sessionWith([Role.Owner]) });
    await openNavSections();
    sidebar = screen.getByTestId('org-sidebar');
    fireEvent.click(await within(sidebar).findByRole('button', { name: 'Expandir Documentos' }));
    expect(
      within(sidebar).getByRole('link', { name: 'Documentos por firmar' }),
    ).toBeInTheDocument();
    expect(
      within(sidebar).getByRole('link', { name: /^Reportes(?! de animales)/ }),
    ).toBeInTheDocument();
  });
});
