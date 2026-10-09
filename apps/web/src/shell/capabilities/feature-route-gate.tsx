import type { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { NotFoundPage } from '../../features/_layout';
import { useCapabilities } from './capabilities-context';
import { featureForPath } from './feature-paths';

/**
 * Route-level barrier for switched-off modules (Ola 1, R1-1): a gated path
 * renders the not-found page, mirroring the API's 404. While capabilities
 * load, a gated path renders nothing instead of flashing either page.
 */
export function FeatureRouteGate({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const { status, capabilities } = useCapabilities();
  const feature = featureForPath(pathname);
  if (feature && !capabilities.features[feature]) {
    return status === 'loading' ? null : <NotFoundPage />;
  }
  return <>{children}</>;
}
