import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CLOSED_CAPABILITIES } from '@adoptafacil/contracts';
import { CapabilitiesProvider, fetchCapabilities, useCapabilities } from './capabilities-context';

afterEach(() => vi.unstubAllGlobals());

function stubFetch(impl: () => Promise<unknown>) {
  vi.stubGlobal('fetch', vi.fn(impl));
}

describe('fetchCapabilities fails closed (Ola 1, R1-1)', () => {
  it('reads the flags the API publishes', async () => {
    stubFetch(async () => ({
      ok: true,
      json: async () => ({
        features: { ...CLOSED_CAPABILITIES.features, community: true },
        googleSignIn: true,
      }),
    }));
    const capabilities = await fetchCapabilities();
    expect(capabilities.features.community).toBe(true);
    expect(capabilities.features.payments).toBe(false);
    expect(capabilities.googleSignIn).toBe(true);
  });

  it('turns everything off when the API cannot be reached', async () => {
    stubFetch(async () => {
      throw new TypeError('Failed to fetch');
    });
    expect(await fetchCapabilities()).toEqual(CLOSED_CAPABILITIES);
  });

  it('turns everything off on an error status', async () => {
    stubFetch(async () => ({ ok: false, status: 500, json: async () => ({}) }));
    expect(await fetchCapabilities()).toEqual(CLOSED_CAPABILITIES);
  });

  it('only accepts a literal true (no "true" strings, no extra keys)', async () => {
    stubFetch(async () => ({
      ok: true,
      json: async () => ({ features: { payments: 'true', marketplace: 1, bogus: true } }),
    }));
    const capabilities = await fetchCapabilities();
    expect(capabilities).toEqual(CLOSED_CAPABILITIES);
    expect(Object.keys(capabilities.features)).not.toContain('bogus');
  });
});

function Probe() {
  const { status, capabilities } = useCapabilities();
  return (
    <p>
      {status}:{String(capabilities.features.payments)}
    </p>
  );
}

describe('CapabilitiesProvider', () => {
  it('is closed while loading, then applies what the loader returns', async () => {
    let resolve: (value: typeof CLOSED_CAPABILITIES) => void = () => undefined;
    const load = () => new Promise<typeof CLOSED_CAPABILITIES>((r) => (resolve = r));
    render(
      <CapabilitiesProvider load={load}>
        <Probe />
      </CapabilitiesProvider>,
    );
    expect(screen.getByText('loading:false')).toBeInTheDocument();
    resolve({
      ...CLOSED_CAPABILITIES,
      features: { ...CLOSED_CAPABILITIES.features, payments: true },
    });
    await waitFor(() => expect(screen.getByText('ready:true')).toBeInTheDocument());
  });

  it('reads as closed outside any provider', () => {
    render(<Probe />);
    expect(screen.getByText('ready:false')).toBeInTheDocument();
  });
});
