import { useCallback, useEffect, useState } from 'react';
import type { PublicDonationOrganization } from '@adoptafacil/contracts';
import { fetchDonationDirectory } from '../api/donations-api';

export type DonationDirectoryState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; items: PublicDonationOrganization[] };

/** Directorio público de donación (ya ordenado por la API), con reintento. */
export function useDonationDirectory(enabled = true): DonationDirectoryState & {
  retry: () => void;
} {
  const [state, setState] = useState<DonationDirectoryState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    setState({ status: 'loading' });
    fetchDonationDirectory(controller.signal)
      .then((directory) =>
        setState({
          status: 'ready',
          items: Array.isArray(directory?.items) ? directory.items : [],
        }),
      )
      .catch(() => {
        if (!controller.signal.aborted) setState({ status: 'error' });
      });
    return () => controller.abort();
  }, [enabled, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { ...state, retry };
}
