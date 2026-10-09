import { useEffect, useState } from 'react';
import {
  ORGANIZATION_SUBMITTABLE_STATUSES,
  OrganizationStatus,
  Role,
  type OrganizationStatusView,
} from '@adoptafacil/contracts';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  useToast,
} from '@adoptafacil/ui';
import { useApiClient } from '../../../shell/api';
import { useSession } from '../../../shell/auth';
import { ORGANIZATION_STATUS_VIEW } from '../model/organization-status-view';

export interface OrgStatusCardProps {
  /** Hide the card once the organization is approved (nothing to do). */
  hideWhenApproved?: boolean;
  /** Reports the loaded status, e.g. to decide whether the public portal exists. */
  onStatus?: (status: OrganizationStatus) => void;
}

/** Where the organization stands in the platform review (R2-1) and, for the
 *  Owner, the button to send it to review. Only approved organizations are
 *  public, so this is what explains a portal that "does not exist" yet. */
export function OrgStatusCard({ hideWhenApproved = false, onStatus }: OrgStatusCardProps) {
  const client = useApiClient();
  const { hasRole } = useSession();
  const isOwner = hasRole(Role.Owner);
  const { toast } = useToast();
  const [view, setView] = useState<OrganizationStatusView | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    client
      .request<OrganizationStatusView>('/org/status')
      .then((data) => {
        // Unknown payload (older API, mocked client): show nothing.
        if (!active || !data || !(data.status in ORGANIZATION_STATUS_VIEW)) return;
        setView(data);
        onStatus?.(data.status);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [client, onStatus]);

  if (!view) return null;
  if (hideWhenApproved && view.status === OrganizationStatus.Approved) return null;

  const meta = ORGANIZATION_STATUS_VIEW[view.status];
  const canSubmit = isOwner && ORGANIZATION_SUBMITTABLE_STATUSES.includes(view.status);

  const submit = async (): Promise<void> => {
    setSubmitting(true);
    try {
      const next = await client.request<OrganizationStatusView>('/org/status/submit', {
        method: 'POST',
      });
      setView(next);
      onStatus?.(next.status);
      toast({
        title: 'Enviada a revisión',
        description: 'Te avisaremos cuando el equipo de AdoptaFácil la revise.',
      });
    } catch (error) {
      toast({
        title: 'No se pudo enviar a revisión',
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card className="max-w-3xl" data-testid="org-status-card">
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div className="space-y-1">
          <CardTitle>Estado de tu organización</CardTitle>
          <CardDescription>{meta.ownerHint}</CardDescription>
        </div>
        <Badge variant={meta.badge}>{meta.label}</Badge>
      </CardHeader>
      {(view.reason || canSubmit) && (
        <CardContent className="space-y-3">
          {view.reason && (
            <p className="text-sm">
              <span className="font-medium">Motivo: </span>
              {view.reason}
            </p>
          )}
          {canSubmit && (
            <Button onClick={() => void submit()} disabled={submitting}>
              {submitting ? 'Enviando…' : 'Enviar a revisión'}
            </Button>
          )}
        </CardContent>
      )}
    </Card>
  );
}
