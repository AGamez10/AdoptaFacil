import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  coffeeContributionPerUnit,
  COFFEE_MAX_UNITS_PER_PHYSICAL_SALE,
  type CoffeeCampaignOption,
  type CoffeeLotView,
  type CoffeePhysicalSaleView,
} from '@adoptafacil/contracts';
import { Badge, Button, EmptyState, Input, Skeleton } from '@adoptafacil/ui';
import type { CoffeeAdminApi } from '../api/coffee-api';
import { colombiaToday, formatColombiaDateTime, formatCop } from '../model/coffee-format';
import { Field, selectClass, useAction } from './panel-kit';

/** Lotes donde se vende en persona: publicados (a la venta o en pausa). */
export function acceptsPhysicalSales(lot: Pick<CoffeeLotView, 'status'>): boolean {
  return lot.status === 'on_sale' || lot.status === 'paused';
}

/**
 * Registrar una venta física de un lote: cantidad, precio cobrado, la campaña
 * que eligió el comprador (o la sugerida del lote) y una nota opcional. Muestra
 * antes de guardar el total y el aporte con la regla del lote.
 */
export function PhysicalSaleForm({
  lot,
  campaigns,
  api,
  reload,
}: {
  lot: CoffeeLotView;
  campaigns: CoffeeCampaignOption[];
  api: CoffeeAdminApi;
  reload: () => Promise<void>;
}) {
  const { busy, run } = useAction(reload);
  const [quantity, setQuantity] = useState('1');
  const [price, setPrice] = useState(String(lot.salePriceCop));
  const [campaignId, setCampaignId] = useState('');
  const [soldOn, setSoldOn] = useState(colombiaToday());
  const [note, setNote] = useState('');

  const units = Math.round(Number(quantity) || 0);
  const unitPrice = Math.round(Number(price) || 0);
  const contribution =
    coffeeContributionPerUnit(unitPrice, lot.unitCostCop, lot.contributionBps) * Math.max(units, 0);
  const tooMany = units > lot.availableUnits;
  const needsCampaign = !campaignId && !lot.defaultCampaignTitle;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const ok = await run(
      () =>
        api.recordPhysicalSale(lot.id, {
          quantity: units,
          unitPriceCop: unitPrice,
          campaignId: campaignId || undefined,
          soldOn,
          note: note.trim() || undefined,
        }),
      'Venta física registrada',
    );
    if (ok) {
      setQuantity('1');
      setCampaignId('');
      setNote('');
    }
  };

  return (
    <form
      onSubmit={submit}
      className="grid gap-3 rounded-xl border border-dashed p-3 sm:grid-cols-3"
      aria-label={`Registrar venta física del lote ${lot.lotCode}`}
    >
      <p className="font-bold sm:col-span-3">
        Registrar venta física{' '}
        <span className="font-normal text-muted-foreground">
          ({lot.availableUnits} bolsas disponibles)
        </span>
      </p>
      <Field label="Bolsas vendidas">
        <Input
          type="number"
          min={1}
          max={Math.min(lot.availableUnits, COFFEE_MAX_UNITS_PER_PHYSICAL_SALE)}
          inputMode="numeric"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          required
        />
      </Field>
      <Field label="Precio por bolsa">
        <Input
          inputMode="numeric"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          required
        />
      </Field>
      <Field label="Fecha de la venta">
        <Input
          type="date"
          max={colombiaToday()}
          value={soldOn}
          onChange={(e) => setSoldOn(e.target.value)}
          required
        />
      </Field>
      <Field label="Campaña del aporte">
        <select
          className={selectClass}
          value={campaignId}
          onChange={(e) => setCampaignId(e.target.value)}
        >
          <option value="">
            {lot.defaultCampaignTitle
              ? `La sugerida del lote: ${lot.defaultCampaignTitle}`
              : 'Elige la campaña que eligió el comprador'}
          </option>
          {campaigns
            .filter((c) => c.id !== lot.defaultCampaignId)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.title} · {c.organizationName}
              </option>
            ))}
        </select>
      </Field>
      <Field label="Nota (opcional, sin datos del comprador)">
        <Input
          value={note}
          maxLength={500}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Feria, punto de venta…"
        />
      </Field>
      <div className="flex flex-col justify-end gap-2">
        <p className="text-sm text-muted-foreground">
          Total {formatCop(unitPrice * Math.max(units, 0))} · aporte{' '}
          <strong>{formatCop(contribution)}</strong>
        </p>
        {tooMany && (
          <p className="text-sm text-destructive" role="alert">
            Solo quedan {lot.availableUnits} bolsas en este lote.
          </p>
        )}
        <Button
          type="submit"
          disabled={busy || units < 1 || unitPrice < 1 || tooMany || needsCampaign}
        >
          Registrar venta
        </Button>
      </div>
    </form>
  );
}

function SaleRow({
  sale,
  api,
  reload,
}: {
  sale: CoffeePhysicalSaleView;
  api: CoffeeAdminApi;
  reload: () => Promise<void>;
}) {
  const { busy, run } = useAction(reload);
  const [reversing, setReversing] = useState(false);
  const [reason, setReason] = useState('');
  const isReversal = sale.kind === 'reversal';

  const reverse = async (event: FormEvent) => {
    event.preventDefault();
    const ok = await run(
      () => api.reversePhysicalSale(sale.id, { reason: reason.trim() }),
      'Venta anulada con su reverso',
    );
    if (ok) {
      setReversing(false);
      setReason('');
    }
  };

  return (
    <li
      className="space-y-2 rounded-xl border bg-background p-4 text-sm"
      data-testid={`physical-sale-${sale.id}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-bold">
          {Math.abs(sale.quantity)} × {sale.productName} · lote {sale.lotCode}
        </p>
        {isReversal && <Badge variant="destructive">Reverso</Badge>}
        {sale.reversedById && <Badge variant="outline">Anulada</Badge>}
      </div>
      <p>
        {formatCop(sale.totalCop)} ({formatCop(sale.unitPriceCop)} c/u) · aporte{' '}
        {formatCop(sale.contributionTotalCop)} a <strong>{sale.campaignTitle}</strong> (
        {sale.organizationName}) ·{' '}
        {sale.campaignSource === 'buyer' ? 'la eligió el comprador' : 'sugerida del lote'}
      </p>
      {sale.note && (
        <p className="text-muted-foreground">
          {isReversal ? 'Motivo: ' : ''}
          {sale.note}
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        Venta del {sale.soldOn} · registrada {formatColombiaDateTime(sale.createdAt)}
      </p>
      {!isReversal &&
        !sale.reversedById &&
        (reversing ? (
          <form onSubmit={reverse} className="flex flex-wrap items-end gap-2">
            <Field label="¿Por qué se anula? (queda registrado)">
              <Input
                value={reason}
                minLength={3}
                maxLength={500}
                onChange={(e) => setReason(e.target.value)}
                required
              />
            </Field>
            <Button type="submit" size="sm" disabled={busy || reason.trim().length < 3}>
              Confirmar reverso
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setReversing(false)}>
              Cancelar
            </Button>
          </form>
        ) : (
          <Button size="sm" variant="outline" onClick={() => setReversing(true)}>
            Anular con reverso
          </Button>
        ))}
    </li>
  );
}

/**
 * Historial de ventas físicas. Nada se edita: una venta mal registrada se
 * anula con un reverso (con su motivo) y se vuelve a registrar bien.
 */
export function PhysicalSalesTab({
  api,
  reload,
}: {
  api: CoffeeAdminApi;
  reload: () => Promise<void>;
}) {
  const [sales, setSales] = useState<CoffeePhysicalSaleView[] | null>(null);
  const load = useCallback(async () => {
    setSales(await api.physicalSales());
  }, [api]);
  const loadAll = useCallback(async () => {
    await Promise.all([load(), reload()]);
  }, [load, reload]);

  useEffect(() => {
    void load().catch(() => setSales([]));
  }, [load]);

  if (!sales) return <Skeleton className="h-32 w-full" />;
  if (sales.length === 0) {
    return (
      <EmptyState
        title="Aún no hay ventas físicas"
        description="Regístralas desde cada lote publicado, en Presentaciones y lotes."
      />
    );
  }
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Las ventas no se editan: si una quedó mal, anúlala con un reverso y regístrala de nuevo.
      </p>
      <ul className="space-y-3">
        {sales.map((sale) => (
          <SaleRow key={sale.id} sale={sale} api={api} reload={loadAll} />
        ))}
      </ul>
    </div>
  );
}
