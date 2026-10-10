import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Role, type MfaStatus } from '@adoptafacil/contracts';
import { useApiClient } from '../../../shell/api';
import { useSession } from '../../../shell/auth';
import { workspaceApi } from '../model/workspace-api';
import { MfaPanel } from './mfa-panel';

/** How often an open staff session re-checks that its second factor is valid. */
const RECHECK_MS = 5 * 60 * 1000;

function needsCode(status: MfaStatus | null): status is MfaStatus {
  return status?.required === true && status.verified === false;
}

/**
 * F19 · second-factor gate for platform staff. For accounts that hold a
 * platform role, asks for the TOTP code (or its setup) before showing the
 * portal, and again when the work-day window or the idle limit ends. Everyone
 * else is untouched. The API enforces the same rule on its own (403
 * MFA_REQUIRED), so a failed status check never blocks the page here.
 */
export function PlatformMfaGate({ children }: { children: ReactNode }) {
  const { hasAnyRole, isAuthenticated } = useSession();
  const client = useApiClient();
  const isStaff = isAuthenticated && hasAnyRole(Role.PlatformAdmin, Role.PlatformSuperAdmin);
  const [status, setStatus] = useState<MfaStatus | null>(null);

  const check = useCallback(async () => {
    try {
      setStatus(await workspaceApi(client).mfaStatus());
    } catch {
      setStatus(null);
    }
  }, [client]);

  useEffect(() => {
    if (!isStaff) {
      setStatus(null);
      return;
    }
    void check();
    const timer = setInterval(() => void check(), RECHECK_MS);
    return () => clearInterval(timer);
  }, [isStaff, check]);

  if (isStaff && needsCode(status)) {
    return <MfaPanel status={status} onVerified={() => void check()} />;
  }
  return <>{children}</>;
}
