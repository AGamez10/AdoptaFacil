import { render, type RenderResult } from '@testing-library/react';
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
