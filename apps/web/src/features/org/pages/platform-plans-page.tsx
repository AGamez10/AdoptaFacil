import { useCallback, useEffect, useState } from 'react';
import {
  OrganizationStatus,
  PLAN_CATALOG,
  PLAN_KEYS,
  SUBSCRIPTION_STATUSES,
  type AssignOrganizationPlanInput,
  type OrganizationPlanView,
  type PlanKey,
  type PlatformOrganizationListItem,
  type SubscriptionStatus,
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

const STATUS_LABEL: Record<SubscriptionStatus, string> = {
  trialing: 'Prueba',
  active: 'Activo',
  past_due: 'Pago vencido',
  canceled: 'Cancelado',
};

const colombiaDate = new Intl.DateTimeFormat('es-CO', {
  dateStyle: 'long',
  timeZone: 'America/Bogota',
});

/** `AAAA-MM-DD` del input de fecha → fin de ese día en Colombia (UTC-5), ISO. */
export function endOfColombiaDay(ymd: string): string {
  return new Date(`${ymd}T23:59:59-05:00`).toISOString();
}

interface Draft {
  plan: PlanKey;
  status: SubscriptionStatus;
  periodEnd: string;
  reference: string;
  discount: string;
}

function draftFrom(view: OrganizationPlanView): Draft {
  const sub = view.subscription;
  return {
    plan: sub?.plan ?? 'crece',
    status: sub?.status ?? 'active',
    periodEnd: sub?.currentPeriodEnd ? sub.currentPeriodEnd.slice(0, 10) : '',
    reference: sub?.providerReference ?? '',
    discount: String(sub?.discountPercent ?? 0),
  };
}

const selectClass =
  'h-10 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring';

/** Plan de UNA organización: lo que tiene hoy y el formulario para cambiarlo. */
function OrganizationPlanEditor({ org }: { org: PlatformOrganizationListItem }) {
  const client = useApiClient();
  const { toast } = useToast();
  const [view, setView] = useState<OrganizationPlanView | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const base = `/platform/organizations/${org.organizationId}/plan`;

  const load = useCallback(async () => {
    const next = await client.request<OrganizationPlanView>(base);
    setView(next);
    setDraft(draftFrom(next));
  }, [client, base]);

  useEffect(() => {
    void load().catch(() => setView(null));
  }, [load]);

  if (!view || !draft) return <Skeleton className="h-24 w-full" />;

  const sub = view.subscription;
  const paysOnline = sub?.provider === 'mercadopago' && sub.status !== 'canceled';
  const needsDate = draft.status !== 'canceled';

  const save = async () => {
    if (needsDate && !draft.periodEnd) {
      toast({ title: 'Indica hasta cuándo va el plan', variant: 'destructive' });
      return;
    }
    const body: AssignOrganizationPlanInput = {
      plan: draft.plan,
      status: draft.status,
      currentPeriodEnd: draft.periodEnd ? endOfColombiaDay(draft.periodEnd) : null,
      providerReference: draft.reference.trim() || null,
      discountPercent: Math.min(100, Math.max(0, Number(draft.discount) || 0)),
    };
    setBusy(true);
    try {
      await client.request(base, { method: 'PUT', json: body });
      toast({ title: `${org.name}: plan actualizado` });
      await load();
    } catch (error) {
      toast({
        title: 'No se pudo cambiar el plan',
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-sm">
        Plan vigente: <strong>{PLAN_CATALOG[view.effectivePlan].name}</strong>
        {sub && (
          <>
            {' '}
            · {STATUS_LABEL[sub.status]} ·{' '}
            {sub.provider === 'mercadopago' ? 'Mercado Pago' : 'Manual'}
            {sub.currentPeriodEnd &&
              ` · hasta el ${colombiaDate.format(new Date(sub.currentPeriodEnd))}`}
          </>
        )}
        {!sub && ' · sin suscripción'}
        {!view.enforced && ' (los planes están apagados: hoy todas tienen Pro)'}
      </p>
      {paysOnline && (
        <p className="text-sm text-amber-700" role="note">
          Esta organización paga con Mercado Pago. Si guardas un cambio aquí, se cancela su cobro
          mensual en Mercado Pago y el plan pasa a manejarse a mano.
        </p>
      )}
      <div className="grid gap-2 sm:grid-cols-5">
        <label className="grid gap-1 text-sm">
          Plan
          <select
            className={selectClass}
            value={draft.plan}
            onChange={(e) => setDraft({ ...draft, plan: e.target.value as PlanKey })}
          >
            {PLAN_KEYS.map((key) => (
              <option key={key} value={key}>
                {PLAN_CATALOG[key].name}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          Estado
          <select
            className={selectClass}
            value={draft.status}
            onChange={(e) => setDraft({ ...draft, status: e.target.value as SubscriptionStatus })}
          >
            {SUBSCRIPTION_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          Pagado hasta
          <Input
            type="date"
            value={draft.periodEnd}
            onChange={(e) => setDraft({ ...draft, periodEnd: e.target.value })}
          />
        </label>
        <label className="grid gap-1 text-sm">
          Factura o referencia
          <Input
            value={draft.reference}
            maxLength={200}
            onChange={(e) => setDraft({ ...draft, reference: e.target.value })}
          />
        </label>
        <label className="grid gap-1 text-sm">
          Descuento fundador (%)
          <Input
            type="number"
            min={0}
            max={100}
            value={draft.discount}
            onChange={(e) => setDraft({ ...draft, discount: e.target.value })}
          />
        </label>
      </div>
      <p className="text-xs text-muted-foreground">
        Cancelado sin fecha = Gratis de inmediato. Cancelado con fecha = sigue hasta ese día.
      </p>
      <Button onClick={() => void save()} disabled={busy}>
        Guardar plan
      </Button>
    </div>
  );
}

/**
 * `/plataforma/planes` — el equipo de plataforma asigna, extiende o cancela el
 * plan de una organización (pago por transferencia + factura). Usa
 * `GET`/`PUT /platform/organizations/:id/plan`, que audita cada cambio.
 */
export function PlatformPlansPage() {
  const client = useApiClient();
  const [items, setItems] = useState<PlatformOrganizationListItem[] | null>(null);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    client
      .request<PlatformOrganizationListItem[]>(
        `/platform/organizations?status=${OrganizationStatus.Approved}`,
      )
      .then(setItems)
      .catch(() => setItems([]));
  }, [client]);

  const shown =
    items?.filter((org) => org.name.toLowerCase().includes(query.trim().toLowerCase())) ?? null;

  return (
    <PageContainer>
      <PageHeader
        title="Planes de organizaciones"
        description="Activa, extiende o cancela el plan de una organización que pagó por transferencia. Cada cambio queda en la auditoría de esa organización."
      />
      <Input
        aria-label="Buscar organización"
        placeholder="Buscar por nombre"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {shown === null && <Skeleton className="mt-4 h-48 w-full" />}
      {shown !== null && shown.length === 0 && (
        <EmptyState title="No hay organizaciones aprobadas con ese nombre." />
      )}
      <div className="mt-4 grid gap-4">
        {shown?.map((org) => (
          <Card key={org.organizationId}>
            <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
              <CardTitle className="text-base">{org.name}</CardTitle>
              {open === org.organizationId ? (
                <Badge variant="info">Editando</Badge>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setOpen(org.organizationId)}
                  data-testid={`plan-open-${org.organizationId}`}
                >
                  Ver plan
                </Button>
              )}
            </CardHeader>
            {open === org.organizationId && (
              <CardContent>
                <OrganizationPlanEditor org={org} />
              </CardContent>
            )}
          </Card>
        ))}
      </div>
    </PageContainer>
  );
}
