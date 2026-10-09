import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import {
  CLOSED_CAPABILITIES,
  type FeatureKey,
  type PublicCapabilities,
} from '@adoptafacil/contracts';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

export interface CapabilitiesState {
  /** `loading` until the API answered (or failed); gated UI stays hidden meanwhile. */
  status: 'loading' | 'ready';
  capabilities: PublicCapabilities;
}

/** Outside a provider everything is off (fail closed). */
const CapabilitiesContext = createContext<CapabilitiesState>({
  status: 'ready',
  capabilities: CLOSED_CAPABILITIES,
});

/** `GET /public/config/features` (Ola 1, R1-1). Any failure → everything off. */
export async function fetchCapabilities(): Promise<PublicCapabilities> {
  try {
    const response = await fetch(`${API_BASE}/public/config/features`);
    if (!response.ok) return CLOSED_CAPABILITIES;
    const body = (await response.json()) as Partial<PublicCapabilities>;
    // Only `true` turns something on; anything missing or malformed stays off.
    const features = { ...CLOSED_CAPABILITIES.features };
    for (const key of Object.keys(features) as FeatureKey[]) {
      features[key] = body.features?.[key] === true;
    }
    return { features, googleSignIn: body.googleSignIn === true };
  } catch {
    return CLOSED_CAPABILITIES;
  }
}

export interface CapabilitiesProviderProps {
  children: ReactNode;
  /** Pin the capabilities instead of asking the API (tests, previews). */
  value?: PublicCapabilities;
  /** Override the loader (tests). */
  load?: () => Promise<PublicCapabilities>;
}

/**
 * Which modules the API serves (Ola 1, R1-1): the web hides switched-off
 * modules — menu entries, public links, their routes and the Google button —
 * so it never promises donations, sponsorships or certificates that the API
 * answers with 404. Fails closed: until the API answers, and if it cannot be
 * reached, every flag reads as off.
 */
export function CapabilitiesProvider({ children, value, load }: CapabilitiesProviderProps) {
  const [state, setState] = useState<CapabilitiesState>(
    value
      ? { status: 'ready', capabilities: value }
      : { status: 'loading', capabilities: CLOSED_CAPABILITIES },
  );

  useEffect(() => {
    if (value) {
      setState({ status: 'ready', capabilities: value });
      return;
    }
    let cancelled = false;
    void (load ?? fetchCapabilities)().then((capabilities) => {
      if (!cancelled) setState({ status: 'ready', capabilities });
    });
    return () => {
      cancelled = true;
    };
  }, [value, load]);

  return <CapabilitiesContext.Provider value={state}>{children}</CapabilitiesContext.Provider>;
}

export function useCapabilities(): CapabilitiesState {
  return useContext(CapabilitiesContext);
}

/** Whether one module is on. False while loading and when unknown. */
export function useFeature(feature: FeatureKey): boolean {
  return useCapabilities().capabilities.features[feature];
}
