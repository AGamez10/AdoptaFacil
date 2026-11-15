import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import type { PublicCapabilities } from '@adoptafacil/contracts';
import { CapabilitiesProvider } from '../../../shell/capabilities';
import { OPEN_CAPABILITIES } from '../../../test-utils';
import { CommunityPulseSection } from './commerce-sections';

/**
 * Muro de la comunidad en la landing: muestra solo lo que las autoras dejaron
 * público, con sus contadores, y no promete nada si el módulo está apagado.
 */
const post = (over: Record<string, unknown> = {}) => ({
  id: 'p1',
  authorDisplayName: 'Laura',
  isOrganization: false,
  type: 'story',
  title: 'Luna encontró hogar',
  body: 'Después de dos meses en el refugio, Luna se fue a su casa nueva.',
  images: [],
  commentCount: 3,
  likeCount: 12,
  createdAt: '2026-10-01T00:00:00Z',
  ...over,
});

function renderWall(items: unknown[], capabilities: PublicCapabilities = OPEN_CAPABILITIES) {
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ items, total: items.length, limit: 6, offset: 0 }),
      }),
    ),
  );
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <CapabilitiesProvider value={capabilities}>
        <CommunityPulseSection />
      </CapabilitiesProvider>
    </MemoryRouter>,
  );
}

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('sección de comunidad de la landing (PR 101) — muro retirado', () => {
  it('con el muro apagado no se monta ni pide datos', async () => {
    renderWall([post()], {
      ...OPEN_CAPABILITIES,
      features: { ...OPEN_CAPABILITIES.features, communityWall: false, resources: false },
    });
    await settle();
    expect(screen.queryByTestId('landing-wall')).not.toBeInTheDocument();
    expect(screen.queryByTestId('landing-pulse')).not.toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });
});
