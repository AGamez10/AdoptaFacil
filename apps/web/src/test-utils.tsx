import { fireEvent, render, screen, type RenderResult } from '@testing-library/react';
import { FEATURE_KEYS, type PublicCapabilities } from '@adoptafacil/contracts';
import { MemoryRouter } from 'react-router-dom';
import { AppProviders, type AppProvidersProps } from './shell/app-providers';
import { AppRoutes } from './shell/router/routes';

export interface RenderShellOptions {
  /** Initial route(s) for the MemoryRouter. Defaults to '/'. */
  route?: string;
  session?: AppProvidersProps['session'];
  transparency?: AppProvidersProps['transparency'];
  /** Module capabilities (Ola 1, R1-1). Defaults to everything on. */
  capabilities?: PublicCapabilities;
}

/** Every module on — what the shell tests exercised before feature flags. */
export const OPEN_CAPABILITIES: PublicCapabilities = {
  features: Object.fromEntries(
    FEATURE_KEYS.map((key) => [key, true]),
  ) as PublicCapabilities['features'],
  googleSignIn: true,
};

/**
 * Renders the full shell (providers + routes) under a MemoryRouter so tests can
 * drive public vs protected routing and inspect the layout/indicator.
 */
export function renderShell({
  route = '/',
  session,
  transparency,
  capabilities = OPEN_CAPABILITIES,
}: RenderShellOptions = {}): RenderResult {
  return render(
    <AppProviders session={session} transparency={transparency} capabilities={capabilities}>
      <MemoryRouter
        initialEntries={[route]}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <AppRoutes />
      </MemoryRouter>
    </AppProviders>,
  );
}

/**
 * NAV-SECCIONES: abre todas las secciones del menú de trabajo (empiezan
 * cerradas salvo la de la pantalla actual) para que una prueba de permisos vea
 * TODAS las entradas que el rol puede ver.
 */
export function expandNavSections(root: ParentNode = document): void {
  root
    .querySelectorAll<HTMLButtonElement>('button[data-nav-section][aria-expanded="false"]')
    .forEach((button) => fireEvent.click(button));
}

/** Espera a que el menú pinte y abre todas sus secciones. */
export async function openNavSections(): Promise<void> {
  const nav = await screen.findByRole('navigation', { name: 'Navegación principal' });
  expandNavSections(nav);
}
