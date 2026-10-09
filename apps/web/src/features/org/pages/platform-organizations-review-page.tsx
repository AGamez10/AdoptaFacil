import { useCallback, useEffect, useState } from 'react';
import {
  ORGANIZATION_STATUS_TRANSITIONS,
  OrganizationStatus,
  type OrganizationStatusView,
  type PlatformOrganizationListItem,
} from '@adoptafacil/contracts';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Input,
  Skeleton,
  useToast,
} from '@adoptafacil/ui';
import { PageContainer, PageHeader } from '../../_layout';
import { useApiClient } from '../../../shell/api';
import { ORGANIZATION_STATUS_VIEW } from '../model/organization-status-view';

const FILTERS: { value: OrganizationStatus | 'all'; label: string }[] = [
  { value: OrganizationStatus.PendingReview, label: 'En revisión' },
  { value: OrganizationStatus.Observed, label: 'Con observaciones' },
  { value: OrganizationStatus.Approved, label: 'Aprobadas' },
  { value: OrganizationStatus.Draft, label: 'Borradores' },
  { value: 'all', label: 'Todas' },
];

/** What the reviewer clicks for each target status; a reason is required
 *  for observed, rejected and suspended (contracts). */
const ACTIONS: Partial<
  Record<OrganizationStatus, { label: string; needsReason: boolean; primary?: boolean }>
> = {
  [OrganizationStatus.Approved]: { label: 'Aprobar', needsReason: false, primary: true },
  [OrganizationStatus.Observed]: { label: 'Pedir correcciones', needsReason: true },
  [OrganizationStatus.Rejected]: { label: 'Rechazar', needsReason: true },
  [OrganizationStatus.Suspended]: { label: 'Suspender', needsReason: true },
};

function formatCO(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString('es-CO', { timeZone: 'America/Bogota' }) : '—';
}

/** `/plataforma/organizaciones` — aprobación de organizaciones (R2-1). Solo
 *  las aprobadas son públicas; aquí el equipo de plataforma las aprueba, pide
 *  correcciones, rechaza o suspende, con motivo y auditoría en la API. */
export function PlatformOrganizationsReviewPage() {
  const client = useApiClient();
  const { toast } = useToast();
  const [filter, setFilter] = useState<OrganizationStatus | 'all'>(
    OrganizationStatus.PendingReview,
  );
  const [items, setItems] = useState<PlatformOrganizationListItem[] | null>(null);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setItems(null);
    const query = filter === 'all' ? '' : `?status=${filter}`;
    try {
      setItems(
        await client.request<PlatformOrganizationListItem[]>(`/platform/organizations${query}`),
      );
    } catch {
      setItems([]);
    }
  }, [client, filter]);

  useEffect(() => {
    void load();
  }, [load]);

  const change = async (org: PlatformOrganizationListItem, status: OrganizationStatus) => {
    const action = ACTIONS[status];
    const reason = reasons[org.organizationId]?.trim();
    if (action?.needsReason && !reason) {
      toast({
        title: 'Escribe el motivo',
        description: 'La organización lo verá para saber qué corregir.',
        variant: 'destructive',
      });
      return;
    }
    setBusy(org.organizationId);
    try {
      await client.request<OrganizationStatusView>(
        `/platform/organizations/${org.organizationId}/status`,
        { method: 'POST', json: reason ? { status, reason } : { status } },
      );
      toast({ title: `${org.name}: ${ORGANIZATION_STATUS_VIEW[status].label.toLowerCase()}` });
      setReasons((prev) => ({ ...prev, [org.organizationId]: '' }));
      await load();
    } catch (error) {
      toast({
        title: 'No se pudo cambiar el estado',
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
        variant: 'destructive',
      });
    } finally {
      setBusy(null);
    }
  };

  return (
    <PageContainer>
      <PageHeader
        title="Organizaciones"
        description="Aprueba las organizaciones para que su portal sea público. Revisa antes sus documentos en Revisión de documentos."
      />
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Button
            key={f.value}
            size="sm"
            variant={filter === f.value ? 'default' : 'outline'}
            onClick={() => setFilter(f.value)}
          >
            {f.label}
          </Button>
        ))}
      </div>
      {items === null && <Skeleton className="h-48 w-full" />}
      {items !== null && items.length === 0 && (
        <EmptyState title="No hay organizaciones en este estado." />
      )}
      <div className="grid gap-4">
        {items?.map((org) => {
          const meta = ORGANIZATION_STATUS_VIEW[org.status];
          const targets = ORGANIZATION_STATUS_TRANSITIONS[org.status].filter((t) => ACTIONS[t]);
          const anyNeedsReason = targets.some((t) => ACTIONS[t]?.needsReason);
          return (
            <Card key={org.organizationId}>
              <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
                <div className="space-y-1">
                  <CardTitle className="text-base">{org.name}</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Registrada: {formatCO(org.createdAt)}
                    {org.changedAt ? ` · Último cambio: ${formatCO(org.changedAt)}` : ''}
                  </p>
                </div>
                <Badge variant={meta.badge}>{meta.label}</Badge>
              </CardHeader>
              <CardContent className="space-y-3">
                {org.reason && (
                  <p className="text-sm">
                    <span className="font-medium">Motivo anterior: </span>
                    {org.reason}
                  </p>
                )}
                {org.status === OrganizationStatus.Draft && (
                  <p className="text-sm text-muted-foreground">
                    Aún no la envían a revisión; no hay nada que decidir todavía.
                  </p>
                )}
                {anyNeedsReason && (
                  <Input
                    id={`reason-${org.organizationId}`}
                    aria-label={`Motivo para ${org.name}`}
                    placeholder="Motivo (obligatorio para pedir correcciones, rechazar o suspender)"
                    value={reasons[org.organizationId] ?? ''}
                    onChange={(e) =>
                      setReasons((prev) => ({ ...prev, [org.organizationId]: e.target.value }))
                    }
                  />
                )}
                {targets.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {targets.map((t) => (
                      <Button
                        key={t}
                        variant={ACTIONS[t]?.primary ? 'default' : 'outline'}
                        disabled={busy === org.organizationId}
                        onClick={() => void change(org, t)}
                      >
                        {ACTIONS[t]?.label}
                      </Button>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </PageContainer>
  );
}
