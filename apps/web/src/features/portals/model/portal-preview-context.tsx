import { createContext, useContext } from 'react';
import type { ApiClient } from '../../../shell/api';

/**
 * Owner preview of the organization's own portal (`/o/:slug?vista-previa=1`).
 * When set, the portal sections read through the authenticated
 * `/org/portal/preview/*` endpoints instead of the public ones, which answer
 * 404 until the platform approves the organization. `null` = public visitor.
 */
export const PortalPreviewContext = createContext<ApiClient | null>(null);

export function usePortalPreviewClient(): ApiClient | null {
  return useContext(PortalPreviewContext);
}
