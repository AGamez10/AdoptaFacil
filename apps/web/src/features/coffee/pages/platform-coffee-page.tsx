import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import {
  coffeeContributionPerUnit,
  coffeeQrScanUrl,
  type CoffeeCampaignOption,
  type CoffeeDashboard,
  type CoffeeDeliveryView,
  type CoffeeLotView,
  type CoffeeOrderStatus,
  type CoffeeOrderView,
  type CoffeeProductView,
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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  useToast,
} from '@adoptafacil/ui';
import { qrDataUrl } from '../../../lib/qr';
import { useApiClient } from '../../../shell/api';
import { PageContainer, PageHeader } from '../../_layout';
import { coffeeAdminApi, type CoffeeAdminApi } from '../api/coffee-api';
import {
  formatColombiaDateTime,
  formatCop,
  LOT_STATUS_LABEL,
  ORDER_STATUS_LABEL,
} from '../model/coffee-format';

const selectClass =
  'h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring';

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1 text-sm">
      <span className="font-medium">{label}</span>
      {children}
    </label>
  );
}

function errorText(error: unknown): string {
  return error instanceof Error && error.message ? error.message : 'Inténtalo de nuevo.';
}

/** Hook mínimo: una acción con aviso de éxito o error y recarga. */
function useAction(reload: () => Promise<void>) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const run = useCallback(
    async (fn: () => Promise<unknown>, ok: string) => {
      setBusy(true);
      try {
        await fn();
        toast({ title: ok });
        await reload();
        return true;
      } catch (error) {
        toast({ title: 'No se pudo', description: errorText(error), variant: 'destructive' });
        return false;
      } finally {
        setBusy(false);
      }
    },
    [reload, toast],
  );
  return { busy, run };
}

function ProductQr({ product }: { product: CoffeeProductView }) {
  const [src, setSrc] = useState<string | null>(null);
  const scanUrl = coffeeQrScanUrl(product.qrDomain, product.code);
  useEffect(() => {
    let active = true;
    // Nivel M, margen de 4 módulos y sin logo (prueba de escaneo antes de imprimir).
    qrDataUrl(scanUrl, { width: 600, margin: 4, errorCorrectionLevel: 'M' })
      .then((url) => active && setSrc(url))
      .catch(() => active && setSrc(null));
    return () => {
      active = false;
    };
  }, [scanUrl]);
  return (
    <div className="flex flex-col items-center gap-2">
      {src ? (
        <img src={src} alt={`QR de ${product.name}`} className="h-36 w-36 rounded bg-white" />
      ) : (
        <Skeleton className="h-36 w-36" />
      )}
      <p className="break-all text-center text-xs text-muted-foreground">{product.qrUrl}</p>
      {src && (
        <a
          href={src}
          download={`qr-${product.code}.png`}
          className="text-xs font-bold text-[var(--af-teal-ink)] hover:underline"
        >
          Descargar QR (PNG)
        </a>
      )}
    </div>
  );
}

interface LotDraft {
  lotCode: string;
  salePriceCop: string;
  unitCostCop: string;
  shippingFeeCop: string;
  stockUnits: string;
  defaultCampaignId: string;
}

const EMPTY_LOT: LotDraft = {
  lotCode: '',
  salePriceCop: '',
  unitCostCop: '',
  shippingFeeCop: '0',
  stockUnits: '',
  defaultCampaignId: '',
};

function NewLotForm({
  product,
  campaigns,
  api,
  reload,
}: {
  product: CoffeeProductView;
  campaigns: CoffeeCampaignOption[];
  api: CoffeeAdminApi;
  reload: () => Promise<void>;
}) {
  const [draft, setDraft] = useState<LotDraft>(EMPTY_LOT);
  const { busy, run } = useAction(reload);
  const num = (v: string) => Math.round(Number(v) || 0);
  const perUnit = coffeeContributionPerUnit(num(draft.salePriceCop), num(draft.unitCostCop));
  const set = (key: keyof LotDraft) => (e: { target: { value: string } }) =>
    setDraft((d) => ({ ...d, [key]: e.target.value }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const ok = await run(
      () =>
        api.createLot(product.id, {
          lotCode: draft.lotCode.trim(),
          salePriceCop: num(draft.salePriceCop),
          unitCostCop: num(draft.unitCostCop),
          shippingFeeCop: num(draft.shippingFeeCop),
          stockUnits: num(draft.stockUnits),
          defaultCampaignId: draft.defaultCampaignId,
        }),
      'Lote creado en borrador',
    );
    if (ok) setDraft(EMPTY_LOT);
  };

  return (
    <form onSubmit={submit} className="grid gap-3 rounded-xl border p-4 sm:grid-cols-3">
      <p className="font-bold sm:col-span-3">Nuevo lote</p>
      <Field label="Código del lote (impreso)">
        <Input value={draft.lotCode} onChange={set('lotCode')} placeholder="L2-2026" required />
      </Field>
      <Field label="Precio de venta">
        <Input
          inputMode="numeric"
          value={draft.salePriceCop}
          onChange={set('salePriceCop')}
          required
        />
      </Field>
      <Field label="Precio de compra">
        <Input
          inputMode="numeric"
          value={draft.unitCostCop}
          onChange={set('unitCostCop')}
          required
        />
      </Field>
      <Field label="Envío por pedido">
        <Input inputMode="numeric" value={draft.shippingFeeCop} onChange={set('shippingFeeCop')} />
      </Field>
      <Field label="Bolsas que llegaron">
        <Input inputMode="numeric" value={draft.stockUnits} onChange={set('stockUnits')} required />
      </Field>
      <Field label="Campaña sugerida">
        <select
          className={selectClass}
          value={draft.defaultCampaignId}
          onChange={set('defaultCampaignId')}
          required
        >
          <option value="">Elige una campaña activa</option>
          {campaigns.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title} · {c.organizationName}
            </option>
          ))}
        </select>
      </Field>
      <p className="text-sm text-muted-foreground sm:col-span-2">
        Aporte por bolsa (20 % del margen bruto): <strong>{formatCop(perUnit)}</strong>
      </p>
      <Button type="submit" disabled={busy || !draft.defaultCampaignId}>
        Crear borrador
      </Button>
    </form>
  );
}

function LotRow({
  lot,
  product,
  campaigns,
  api,
  reload,
}: {
  lot: CoffeeLotView;
  product: CoffeeProductView;
  campaigns: CoffeeCampaignOption[];
  api: CoffeeAdminApi;
  reload: () => Promise<void>;
}) {
  const { busy, run } = useAction(reload);
  const [stock, setStock] = useState(String(lot.stockUnits));
  const [campaignId, setCampaignId] = useState('');
  const editable = lot.status !== 'closed';

  const askPublish = () =>
    run(
      () =>
        api.requestApproval({
          type: 'coffee.lot_publish',
          payload: {
            lotId: lot.id,
            salePriceCop: lot.salePriceCop,
            unitCostCop: lot.unitCostCop,
            shippingFeeCop: lot.shippingFeeCop,
            stockUnits: lot.stockUnits,
            defaultCampaignId: lot.defaultCampaignId ?? '',
          },
          reason: `Publicar el lote ${lot.lotCode} de ${product.name}`,
        }),
      'Pedimos la aprobación: otra persona líder la aprueba en Equipo y seguridad',
    );

  const askCampaign = () =>
    run(
      () =>
        api.requestApproval({
          type: 'coffee.lot_campaign',
          payload: { lotId: lot.id, campaignId },
          reason: `Cambiar la campaña sugerida del lote ${lot.lotCode} de ${product.name}`,
        }),
      'Pedimos la aprobación del cambio de campaña',
    );

  return (
    <li className="space-y-3 rounded-xl border p-4" data-testid={`lot-${lot.lotCode}`}>
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-bold">Lote {lot.lotCode}</p>
        <Badge variant={lot.status === 'on_sale' ? 'default' : 'outline'}>
          {LOT_STATUS_LABEL[lot.status]}
        </Badge>
        {lot.pendingApproval && (
          <Badge variant="outline">
            {lot.pendingApproval === 'coffee.lot_publish'
              ? 'Publicación por aprobar'
              : 'Cambio de campaña por aprobar'}
          </Badge>
        )}
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-muted-foreground">Venta / compra</dt>
          <dd>
            {formatCop(lot.salePriceCop)} / {formatCop(lot.unitCostCop)}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Aporte por bolsa</dt>
          <dd>{formatCop(lot.contributionPerUnitCop)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Stock</dt>
          <dd>
            {lot.stockUnits} · {lot.unitsSold} vendidas · {lot.unitsReserved} apartadas ·{' '}
            {lot.availableUnits} libres
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Ventas / aporte</dt>
          <dd>
            {formatCop(lot.revenueCop)} / {formatCop(lot.contributionCommittedCop)}
          </dd>
        </div>
        <div className="col-span-2 sm:col-span-4">
          <dt className="text-muted-foreground">Campaña sugerida</dt>
          <dd>{lot.defaultCampaignTitle ?? 'La campaña ya no está activa: elige otra'}</dd>
        </div>
      </dl>

      {editable && (
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Stock total">
            <Input
              className="w-28"
              inputMode="numeric"
              value={stock}
              onChange={(e) => setStock(e.target.value)}
            />
          </Field>
          <Button
            variant="outline"
            disabled={busy || Number(stock) === lot.stockUnits}
            onClick={() =>
              run(
                () => api.updateLot(lot.id, { stockUnits: Math.round(Number(stock) || 0) }),
                'Stock actualizado',
              )
            }
          >
            Guardar stock
          </Button>
          {lot.status === 'draft' && (
            <Button disabled={busy || !!lot.pendingApproval} onClick={askPublish}>
              Pedir publicación
            </Button>
          )}
          {lot.status === 'on_sale' && (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => run(() => api.setLotStatus(lot.id, 'pause'), 'Lote en pausa')}
            >
              Pausar
            </Button>
          )}
          {lot.status === 'paused' && (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => run(() => api.setLotStatus(lot.id, 'resume'), 'Lote a la venta')}
            >
              Reanudar
            </Button>
          )}
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => run(() => api.setLotStatus(lot.id, 'close'), 'Lote cerrado')}
          >
            Cerrar lote
          </Button>
        </div>
      )}

      {(lot.status === 'on_sale' || lot.status === 'paused') && (
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Cambiar campaña sugerida (doble aprobación)">
            <select
              className={selectClass}
              value={campaignId}
              onChange={(e) => setCampaignId(e.target.value)}
            >
              <option value="">Elige una campaña activa</option>
              {campaigns
                .filter((c) => c.id !== lot.defaultCampaignId)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title} · {c.organizationName}
                  </option>
                ))}
            </select>
          </Field>
          <Button
            variant="outline"
            disabled={busy || !campaignId || !!lot.pendingApproval}
            onClick={askCampaign}
          >
            Pedir cambio
          </Button>
        </div>
      )}
    </li>
  );
}

function ProductsTab({
  dashboard,
  campaigns,
  api,
  reload,
}: {
  dashboard: CoffeeDashboard;
  campaigns: CoffeeCampaignOption[];
  api: CoffeeAdminApi;
  reload: () => Promise<void>;
}) {
  const { busy, run } = useAction(reload);
  const [name, setName] = useState('');
  const [grams, setGrams] = useState('250');
  const [description, setDescription] = useState('');
  const [domain, setDomain] = useState(dashboard.qrDomains[0] ?? '');

  const create = async (event: FormEvent) => {
    event.preventDefault();
    const ok = await run(
      () =>
        api.createProduct({
          name: name.trim(),
          presentationGrams: Math.round(Number(grams) || 0),
          description: description.trim() || undefined,
          qrDomain: domain,
        }),
      'Presentación creada con su QR',
    );
    if (ok) {
      setName('');
      setDescription('');
    }
  };

  return (
    <div className="space-y-6">
      {!dashboard.checkoutEnabled && (
        <p className="rounded-xl bg-amber-100 p-3 text-sm text-amber-900">
          El pago en línea está apagado: falta configurar la cuenta de Mercado Pago de AdoptaFácil
          (MERCADOPAGO_PLATFORM_ACCESS_TOKEN). La página del QR se ve, pero no se puede comprar.
        </p>
      )}
      {dashboard.products.map((product) => (
        <Card key={product.id}>
          <CardHeader>
            <CardTitle>{product.name}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-4 sm:flex-row">
              <ProductQr product={product} />
              <dl className="grid flex-1 grid-cols-2 gap-2 text-sm">
                <div>
                  <dt className="text-muted-foreground">Código impreso</dt>
                  <dd className="font-mono">{product.code}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Presentación</dt>
                  <dd>{product.presentationGrams} g</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Escaneos (30 días / total)</dt>
                  <dd>
                    {product.visitsLast30Days.qr} / {product.visitsTotal.qr}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Visitas web (30 días / total)</dt>
                  <dd>
                    {product.visitsLast30Days.web} / {product.visitsTotal.web}
                  </dd>
                </div>
                <p className="col-span-2 text-xs text-muted-foreground">
                  El QR es el mismo para todos los lotes de esta presentación: lleva al lote más
                  antiguo que aún tiene bolsas.
                </p>
              </dl>
            </div>
            <ul className="space-y-3">
              {product.lots.map((lot) => (
                <LotRow
                  key={lot.id}
                  lot={lot}
                  product={product}
                  campaigns={campaigns}
                  api={api}
                  reload={reload}
                />
              ))}
            </ul>
            <NewLotForm product={product} campaigns={campaigns} api={api} reload={reload} />
          </CardContent>
        </Card>
      ))}

      <Card>
        <CardHeader>
          <CardTitle>Nueva presentación</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={create} className="grid gap-3 sm:grid-cols-2">
            <Field label="Nombre">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Café San Pedro 250 g"
                required
              />
            </Field>
            <Field label="Gramos">
              <Input
                inputMode="numeric"
                value={grams}
                onChange={(e) => setGrams(e.target.value)}
                required
              />
            </Field>
            <Field label="Descripción (opcional)">
              <Input value={description} onChange={(e) => setDescription(e.target.value)} />
            </Field>
            <Field label="Dominio del QR (queda fijo al imprimir)">
              <select
                className={selectClass}
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
              >
                {dashboard.qrDomains.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </Field>
            <Button type="submit" disabled={busy || !name.trim()} className="sm:col-span-2">
              Crear presentación y QR
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

const ORDER_FILTERS: Array<{ value: CoffeeOrderStatus | ''; label: string }> = [
  { value: 'paid', label: 'Pagados' },
  { value: 'needs_refund', label: 'Por devolver' },
  { value: 'pending', label: 'Esperando pago' },
  { value: '', label: 'Todos' },
];

function OrdersTab({ api }: { api: CoffeeAdminApi }) {
  const [filter, setFilter] = useState<CoffeeOrderStatus | ''>('paid');
  const [orders, setOrders] = useState<CoffeeOrderView[] | null>(null);
  const load = useCallback(async () => {
    setOrders(await api.orders(filter || undefined));
  }, [api, filter]);
  const { busy, run } = useAction(load);

  useEffect(() => {
    setOrders(null);
    void load().catch(() => setOrders([]));
  }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {ORDER_FILTERS.map((f) => (
          <Button
            key={f.label}
            variant={filter === f.value ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter(f.value)}
          >
            {f.label}
          </Button>
        ))}
      </div>
      {!orders && <Skeleton className="h-32 w-full" />}
      {orders?.length === 0 && <EmptyState title="No hay pedidos aquí" description="" />}
      <ul className="space-y-3">
        {orders?.map((o) => (
          <li key={o.id} className="space-y-2 rounded-xl border bg-background p-4 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-bold">
                {o.quantity} × {o.productName} · lote {o.lotCode}
              </p>
              <Badge variant={o.status === 'needs_refund' ? 'destructive' : 'outline'}>
                {ORDER_STATUS_LABEL[o.status]}
              </Badge>
              {o.shippedAt && <Badge variant="outline">Enviado</Badge>}
            </div>
            <p>
              {formatCop(o.totalCop)} · aporte {formatCop(o.contributionTotalCop)} a{' '}
              <strong>{o.campaignTitle}</strong> ({o.organizationName})
            </p>
            <p className="text-muted-foreground">
              {o.buyer.fullName} · {o.buyer.phone} · {o.buyer.email}
              <br />
              {o.buyer.address}, {o.buyer.city}, {o.buyer.department}
            </p>
            <p className="text-xs text-muted-foreground">
              {o.reference} · {formatColombiaDateTime(o.createdAt)}
              {o.receiptSentAt ? ' · comprobante enviado' : ''}
            </p>
            {o.status === 'paid' && !o.shippedAt && (
              <Button
                size="sm"
                disabled={busy}
                onClick={() => run(() => api.markShipped(o.id), 'Pedido marcado como enviado')}
              >
                Marcar enviado
              </Button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ContributionsTab({
  dashboard,
  api,
  reload,
}: {
  dashboard: CoffeeDashboard;
  api: CoffeeAdminApi;
  reload: () => Promise<void>;
}) {
  const [deliveries, setDeliveries] = useState<CoffeeDeliveryView[] | null>(null);
  const loadAll = useCallback(async () => {
    await reload();
    setDeliveries(await api.deliveries());
  }, [api, reload]);
  const { busy, run } = useAction(loadAll);
  const [campaignId, setCampaignId] = useState('');
  const [amount, setAmount] = useState('');
  const [day, setDay] = useState(new Date().toISOString().slice(0, 10));
  const [evidence, setEvidence] = useState('');

  useEffect(() => {
    void api
      .deliveries()
      .then(setDeliveries)
      .catch(() => setDeliveries([]));
  }, [api]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const ok = await run(
      () =>
        api.createDelivery({
          campaignId,
          amountCop: Math.round(Number(amount) || 0),
          deliveredOn: day,
          evidence: evidence.trim(),
        }),
      'Entrega registrada',
    );
    if (ok) {
      setAmount('');
      setEvidence('');
    }
  };

  return (
    <div className="space-y-6">
      {dashboard.campaigns.length === 0 ? (
        <EmptyState
          title="Aún no hay aportes"
          description="Aparecen cuando se paga la primera bolsa."
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground">
              <tr>
                <th className="py-2">Campaña</th>
                <th>Comprometido</th>
                <th>Entregado</th>
                <th>Por entregar</th>
              </tr>
            </thead>
            <tbody>
              {dashboard.campaigns.map((c) => (
                <tr key={c.campaignId} className="border-t">
                  <td className="py-2">
                    {c.campaignTitle}
                    <span className="block text-xs text-muted-foreground">
                      {c.organizationName}
                    </span>
                  </td>
                  <td>{formatCop(c.committedCop)}</td>
                  <td>{formatCop(c.deliveredCop)}</td>
                  <td className="font-bold">{formatCop(c.pendingCop)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {dashboard.campaigns.length > 0 && (
        <form onSubmit={submit} className="grid gap-3 rounded-xl border p-4 sm:grid-cols-2">
          <p className="font-bold sm:col-span-2">Registrar una entrega</p>
          <Field label="Campaña">
            <select
              className={selectClass}
              value={campaignId}
              onChange={(e) => setCampaignId(e.target.value)}
              required
            >
              <option value="">Elige la campaña</option>
              {dashboard.campaigns.map((c) => (
                <option key={c.campaignId} value={c.campaignId}>
                  {c.campaignTitle} (por entregar {formatCop(c.pendingCop)})
                </option>
              ))}
            </select>
          </Field>
          <Field label="Monto entregado (negativo para corregir)">
            <Input
              inputMode="numeric"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </Field>
          <Field label="Fecha de la entrega">
            <Input type="date" value={day} onChange={(e) => setDay(e.target.value)} required />
          </Field>
          <Field label="Soporte (número de transferencia, comprobante)">
            <Input value={evidence} onChange={(e) => setEvidence(e.target.value)} required />
          </Field>
          <Button type="submit" disabled={busy || !campaignId} className="sm:col-span-2">
            Registrar entrega
          </Button>
        </form>
      )}

      {deliveries && deliveries.length > 0 && (
        <ul className="space-y-2 text-sm">
          {deliveries.map((d) => (
            <li key={d.id} className="rounded-xl border p-3">
              <strong>{formatCop(d.amountCop)}</strong> a {d.campaignTitle} · {d.deliveredOn}
              <span className="block text-xs text-muted-foreground">{d.evidence}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * `/plataforma/cafe` — el café de AdoptaFácil para el equipo de plataforma:
 * presentaciones con su QR fijo, lotes con stock (publicar y cambiar la
 * campaña sugerida piden doble aprobación), pedidos para despachar y el
 * aporte comprometido frente al entregado por campaña.
 */
export function PlatformCoffeePage() {
  const client = useApiClient();
  const api = useMemo(() => coffeeAdminApi(client), [client]);
  const [dashboard, setDashboard] = useState<CoffeeDashboard | null>(null);
  const [campaigns, setCampaigns] = useState<CoffeeCampaignOption[]>([]);
  const [failed, setFailed] = useState(false);

  const reload = useCallback(async () => {
    const [next, options] = await Promise.all([api.dashboard(), api.campaigns()]);
    setDashboard(next);
    setCampaigns(options);
  }, [api]);

  useEffect(() => {
    void reload().catch(() => setFailed(true));
  }, [reload]);

  return (
    <PageContainer>
      <PageHeader
        title="Café de AdoptaFácil"
        description="Lotes con QR fijo, checkout con stock y el 20 % del margen bruto para la campaña que elige cada comprador."
      />
      {failed && !dashboard && (
        <EmptyState
          title="No pudimos cargar el café"
          description="Recarga la página en un momento."
        />
      )}
      {!dashboard && !failed && <Skeleton className="h-64 w-full" />}
      {dashboard && (
        <Tabs defaultValue="lotes" className="space-y-4">
          <TabsList>
            <TabsTrigger value="lotes">Presentaciones y lotes</TabsTrigger>
            <TabsTrigger value="pedidos">Pedidos</TabsTrigger>
            <TabsTrigger value="aportes">Aportes a campañas</TabsTrigger>
          </TabsList>
          <TabsContent value="lotes">
            <ProductsTab dashboard={dashboard} campaigns={campaigns} api={api} reload={reload} />
          </TabsContent>
          <TabsContent value="pedidos">
            <OrdersTab api={api} />
          </TabsContent>
          <TabsContent value="aportes">
            <ContributionsTab dashboard={dashboard} api={api} reload={reload} />
          </TabsContent>
        </Tabs>
      )}
    </PageContainer>
  );
}
