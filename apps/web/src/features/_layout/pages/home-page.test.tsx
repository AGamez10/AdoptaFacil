import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { Role } from '@adoptafacil/contracts';
import { SessionProvider } from '../../../shell/auth';
import { HomePage } from './home-page';

const ORG_SUMMARY_BODY = {
  animalsActive: 45,
  adoptionRequestsPending: 6,
  sponsorshipsActive: 9,
  documentsExpiringSoon: 1,
  documentsRejected: 2,
  donationsReceivedTotal: 1240000,
  formalizationLevel: 3,
  formalizationPercent: 60,
};

/**
 * F-VISUAL-02 — the "Estado del sistema" block (raw `/health`, db/redis
 * wording) is internal/technical and must stay invisible to a Persona or Org
 * user; only a platform admin (PlatformAdmin/PlatformSuperAdmin) sees it.
 * S2-08 — the org summary block (`GET /org/summary`) is the mirror image:
 * only Owner/Administrator/Operator see it, matching the backend's
 * `VIEW_ROLES` exactly. Both gates reuse the session's `hasAnyRole` (T-025)
 * and skip their fetch entirely for a role that can't see the block — not
 * just hide the result.
 */
function renderHome(roles: Role[]) {
  return render(
    <SessionProvider
      initialStatus="authenticated"
      initialUser={{
        id: 'u1',
        name: 'Tester',
        email: 'tester@example.test',
        roles,
        organizationId: 'org-1',
        accountType: roles.length ? 'organization' : 'person',
      }}
    >
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>
    </SessionProvider>,
  );
}

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      const body = url.includes('/org/summary')
        ? ORG_SUMMARY_BODY
        : { status: 'ok', db: 'up', redis: 'up' };
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => body,
      });
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('HomePage — system-health block is platform-admin only (F-VISUAL-02)', () => {
  it('hides both blocks from a Persona (no roles) and fetches nothing', async () => {
    renderHome([]);
    expect(screen.getByRole('heading', { name: 'Inicio' })).toBeInTheDocument();
    expect(screen.queryByText('Estado del sistema')).not.toBeInTheDocument();
    expect(screen.queryByText('Animales activos')).not.toBeInTheDocument();
    // Give any stray effect a tick, then assert the fetch never fired.
    await waitFor(() => expect(fetch).not.toHaveBeenCalled());
  });

  it('hides the health block from an org role that is NOT a platform admin', async () => {
    renderHome([Role.Owner]);
    expect(screen.getByRole('heading', { name: 'Inicio' })).toBeInTheDocument();
    expect(screen.queryByText('Estado del sistema')).not.toBeInTheDocument();
    // Resumen de Inicio + estado de la organización + perfil (para "Primeros
    // pasos"). Sin el módulo de pagos encendido (sin CapabilitiesProvider =
    // todo apagado) no pide el detalle de donaciones/campañas, que la API
    // respondería con 404, ni el estado de los cobros.
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(3));
    const urls = vi.mocked(fetch).mock.calls.map((call) => String(call[0]));
    expect(urls.some((url) => url.includes('/org/summary'))).toBe(true);
    expect(urls.some((url) => url.includes('/org/status'))).toBe(true);
    expect(urls.some((url) => url.includes('/org/profile'))).toBe(true);
    expect(urls.some((url) => url.includes('/org/mercadopago/status'))).toBe(false);
    expect(urls.some((url) => url.includes('/org/dashboard/donations'))).toBe(false);
  });

  it('shows the block with real data for a PlatformAdmin', async () => {
    renderHome([Role.PlatformAdmin]);
    expect(screen.getByRole('heading', { name: 'Inicio' })).toBeInTheDocument();
    expect(screen.getByText('Estado del sistema')).toBeInTheDocument();
    expect(await screen.findByText('status')).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Animales activos')).not.toBeInTheDocument();
  });

  it('shows the block for a PlatformSuperAdmin too', async () => {
    renderHome([Role.PlatformSuperAdmin]);
    expect(screen.getByText('Estado del sistema')).toBeInTheDocument();
    expect(await screen.findByText('status')).toBeInTheDocument();
  });
});

describe('HomePage — org summary block is Owner/Administrator/Operator only (S2-08)', () => {
  it('renders real stat cards for an Owner', async () => {
    renderHome([Role.Owner]);
    expect(await screen.findByText('Animales activos')).toBeInTheDocument();
    expect(screen.getByText('45')).toBeInTheDocument();
    expect(screen.getByText('6')).toBeInTheDocument();
    expect(screen.getByText('Nivel 3')).toBeInTheDocument();
    expect(screen.getByText('60%')).toBeInTheDocument();
    expect(screen.getByText('Revisar')).toBeInTheDocument();
    expect(screen.getByText('Subsanar')).toBeInTheDocument();
  });

  it("shows a real greeting with the user name and today's date instead of the generic subtitle", async () => {
    renderHome([Role.Owner]);
    await screen.findByText('Animales activos');
    expect(
      screen.getByText(/^(Buenos días|Buenas tardes|Buenas noches), Tester ·/),
    ).toBeInTheDocument();
  });

  it('derives "Requiere tu acción" only from real summary counts (no invented detail)', async () => {
    renderHome([Role.Owner]);
    expect(await screen.findByText('Requiere tu acción · 3')).toBeInTheDocument();
    expect(screen.getByText('6 solicitudes de adopción sin revisar')).toBeInTheDocument();
    expect(screen.getByText('1 documento institucional por vencer')).toBeInTheDocument();
    expect(screen.getByText('2 documentos rechazados · pendiente de subsanar')).toBeInTheDocument();
  });

  it('renders the formalization stepper at the step matching the real percent', async () => {
    renderHome([Role.Owner]);
    // ORG_SUMMARY_BODY.formalizationPercent = 60 → step index 2 (Formalizada).
    expect(await screen.findByText('Formalizada')).toBeInTheDocument();
    expect(screen.getByText('Formalizada').className).toMatch(/stepper__label--current/);
    expect(screen.getByText('Informal').className).toMatch(/stepper__label--done/);
    expect(screen.getByText('ESAL + RTE').className).not.toMatch(/stepper__label--(done|current)/);
  });

  it('hides the block for a Volunteer (org role, but outside VIEW_ROLES)', async () => {
    renderHome([Role.Volunteer]);
    expect(screen.getByRole('heading', { name: 'Inicio' })).toBeInTheDocument();
    expect(screen.queryByText('Animales activos')).not.toBeInTheDocument();
    await waitFor(() => expect(fetch).not.toHaveBeenCalled());
  });

  it('omits "Requiere tu acción" entirely when every real count is zero (no filler)', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({
        ...ORG_SUMMARY_BODY,
        adoptionRequestsPending: 0,
        documentsExpiringSoon: 0,
        documentsRejected: 0,
      }),
    } as never);
    renderHome([Role.Owner]);
    await screen.findByText('Animales activos');
    expect(screen.queryByText(/Requiere tu acción/)).not.toBeInTheDocument();
  });

  it('shows a retry affordance when the summary fetch fails', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 500,
      headers: new Headers(),
      json: async () => ({}),
    } as never);
    renderHome([Role.Administrator]);
    expect(await screen.findByText('No se pudo cargar el resumen.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
  });
});

describe('HomePage — "Primeros pasos" para un refugio que empieza (NAV-SECCIONES)', () => {
  beforeEach(() => window.localStorage.clear());

  it('muestra los pasos pendientes con enlace directo y el siguiente resaltado', async () => {
    renderHome([Role.Owner]);
    const card = await screen.findByTestId('first-steps-card');
    // ORG_SUMMARY_BODY: 45 animales y 60% de formalización → 2 de 3 listos; el
    // perfil (sin logo ni descripción en el mock) es lo que falta.
    expect(card).toHaveTextContent('2 de 3 listos');
    expect(screen.getByRole('link', { name: 'Completar perfil' })).toHaveAttribute(
      'href',
      '/organizacion',
    );
  });

  it('se puede ocultar y no vuelve a aparecer', async () => {
    renderHome([Role.Owner]);
    fireEvent.click(
      within(await screen.findByTestId('first-steps-card')).getByRole('button', {
        name: 'Ocultar',
      }),
    );
    expect(screen.queryByTestId('first-steps-card')).not.toBeInTheDocument();
    expect(window.localStorage.getItem('adoptafacil.first-steps.hidden.org-1')).toBe('1');
  });

  it('un Operador no la ve (los primeros pasos son del dueño o administrador)', async () => {
    renderHome([Role.Operator]);
    await screen.findByText('Animales activos');
    expect(screen.queryByTestId('first-steps-card')).not.toBeInTheDocument();
  });
});
