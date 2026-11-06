import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  LEDGER_CONCEPT_MAX,
  LEDGER_COUNTERPARTY_MAX,
  LEDGER_VOID_REASON_MIN,
  LedgerEntryKind,
  LedgerSource,
  Role,
  type LedgerEntry,
  type OrgLedgerPage as OrgLedgerPageData,
} from '@adoptafacil/contracts';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  Input,
  Skeleton,
  friendlyErrorMessage,
  useToast,
} from '@adoptafacil/ui';
import { PageContainer, PageHeader } from '../../_layout';
import { useApiClient } from '../../../shell/api';
import { useSession } from '../../../shell/auth';
import { LedgerEntryList, type LedgerListItem } from '../components/ledger-entry-list';
import { LedgerSummary } from '../components/ledger-summary';
import { LEDGER_HOW_IT_WORKS } from '../components/public-ledger-dialog';
import { categoriesFor, formatCop, parseCopInput, todayInColombia } from '../model/ledger-view';

const SELECT_CLASS =
  'h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground';

function newRequestId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(16)}-0000-4000-8000-${Math.random().toString(16).slice(2, 14).padEnd(12, '0')}`;
}

function toListItem(e: LedgerEntry): LedgerListItem {
  return {
    id: e.id,
    source: e.source,
    kind: e.kind,
    category: e.category,
    occurredOn: e.occurredOn,
    amountCop: e.amountCop,
    concept: e.concept,
    counterparty: e.counterparty,
    hasSupport: e.hasSupport,
    voided: Boolean(e.voidedAt),
    voidReason: e.voidReason,
  };
}

/**
 * `/organizacion/libro-publico` (RF14) — la organización registra lo que recibe
 * y lo que gasta, con su soporte. Todo lo que se registra aquí se publica en el
 * portal. Las donaciones pagadas en línea aparecen solas. Un movimiento no se
 * edita ni se borra: se anula con un motivo que también queda público.
 */
export function OrgLedgerPage() {
  const client = useApiClient();
  const { hasAnyRole } = useSession();
  const canWrite = hasAnyRole(Role.Owner, Role.Administrator);
  const { toast } = useToast();

  const [data, setData] = useState<OrgLedgerPageData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Formulario
  const [kind, setKind] = useState<LedgerEntryKind>(LedgerEntryKind.Expense);
  const [category, setCategory] = useState<string>('');
  const [occurredOn, setOccurredOn] = useState<string>(todayInColombia());
  const [amount, setAmount] = useState('');
  const [concept, setConcept] = useState('');
  const [counterparty, setCounterparty] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const requestId = useRef(newRequestId());
  const fileInput = useRef<HTMLInputElement>(null);

  // Anulación
  const [voiding, setVoiding] = useState<LedgerListItem | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [voidBusy, setVoidBusy] = useState(false);

  const categories = useMemo(() => categoriesFor(kind), [kind]);

  const load = useCallback(async () => {
    try {
      const page = await client.request<OrgLedgerPageData>('/org/ledger');
      setData(page);
      setLoadError(null);
    } catch (error) {
      setLoadError(friendlyErrorMessage(error));
    }
  }, [client]);

  useEffect(() => {
    void load();
  }, [load]);

  const resetForm = () => {
    setCategory('');
    setAmount('');
    setConcept('');
    setCounterparty('');
    setFile(null);
    if (fileInput.current) fileInput.current.value = '';
    requestId.current = newRequestId();
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);
    const amountCop = parseCopInput(amount);
    if (!category) return setFormError('Elige una categoría.');
    if (!amountCop) return setFormError('Escribe el valor en pesos, por ejemplo 185000.');
    if (concept.trim().length < 3) return setFormError('Describe el movimiento en pocas palabras.');

    const form = new FormData();
    form.set('kind', kind);
    form.set('category', category);
    form.set('occurredOn', occurredOn);
    form.set('amountCop', String(amountCop));
    form.set('concept', concept.trim());
    if (kind === LedgerEntryKind.Expense && counterparty.trim()) {
      form.set('counterparty', counterparty.trim());
    }
    // Un reintento (doble clic, red caída) no duplica el movimiento.
    form.set('clientRequestId', requestId.current);
    if (file) form.set('support', file);

    setSaving(true);
    try {
      await client.request<LedgerEntry>('/org/ledger', { method: 'POST', body: form });
      toast({
        title: 'Movimiento publicado',
        description: 'Ya aparece en el libro público de tu portal.',
        variant: 'success',
      });
      resetForm();
      await load();
    } catch (error) {
      setFormError(friendlyErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const openSupport = async (item: LedgerListItem) => {
    try {
      const blob = await client.requestBlob(`/org/ledger/${item.id}/support`);
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (error) {
      toast({
        title: 'No pudimos abrir el soporte',
        description: friendlyErrorMessage(error),
        variant: 'destructive',
      });
    }
  };

  const confirmVoid = async () => {
    if (!voiding) return;
    setVoidBusy(true);
    try {
      await client.request(`/org/ledger/${voiding.id}/void`, {
        method: 'POST',
        json: { reason: voidReason.trim() },
      });
      toast({
        title: 'Movimiento anulado',
        description: 'Sigue visible en el portal como anulado, con tu explicación.',
        variant: 'success',
      });
      setVoiding(null);
      setVoidReason('');
      await load();
    } catch (error) {
      toast({
        title: 'No se pudo anular',
        description: friendlyErrorMessage(error),
        variant: 'destructive',
      });
    } finally {
      setVoidBusy(false);
    }
  };

  const items = data?.items.map(toListItem) ?? [];

  return (
    <PageContainer>
      <PageHeader
        title="Libro público"
        description="Lo que recibes y lo que gastas, a la vista de todos en tu portal. La transparencia genera confianza y más donaciones."
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,420px)_1fr]">
        {canWrite && (
          <Card className="h-fit">
            <CardHeader>
              <CardTitle>Registrar un movimiento</CardTitle>
              <CardDescription>
                Se publica de inmediato. Si te equivocas, no se borra: lo anulas y explicas por qué.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form className="space-y-4" onSubmit={(e) => void submit(e)} noValidate>
                <fieldset className="grid grid-cols-2 gap-2" aria-label="Tipo de movimiento">
                  {[LedgerEntryKind.Expense, LedgerEntryKind.Income].map((k) => (
                    <Button
                      key={k}
                      type="button"
                      variant={kind === k ? 'default' : 'outline'}
                      aria-pressed={kind === k}
                      onClick={() => {
                        setKind(k);
                        setCategory('');
                      }}
                    >
                      {k === LedgerEntryKind.Expense ? 'Gasto' : 'Ingreso'}
                    </Button>
                  ))}
                </fieldset>

                <label className="block space-y-1 text-sm" htmlFor="ledger-category">
                  <span className="font-medium">Categoría</span>
                  <select
                    id="ledger-category"
                    className={SELECT_CLASS}
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                  >
                    <option value="">Elige una categoría</option>
                    {categories.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="grid grid-cols-2 gap-3">
                  <label className="block space-y-1 text-sm" htmlFor="ledger-date">
                    <span className="font-medium">Fecha</span>
                    <Input
                      id="ledger-date"
                      type="date"
                      value={occurredOn}
                      max={todayInColombia()}
                      onChange={(e) => setOccurredOn(e.target.value)}
                    />
                  </label>
                  <label className="block space-y-1 text-sm" htmlFor="ledger-amount">
                    <span className="font-medium">Valor (COP)</span>
                    <Input
                      id="ledger-amount"
                      inputMode="numeric"
                      placeholder="185.000"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                    />
                  </label>
                </div>
                {parseCopInput(amount) !== null && (
                  <p className="-mt-2 text-xs text-muted-foreground">
                    Se publicará como {formatCop(parseCopInput(amount) ?? 0)}
                  </p>
                )}

                <label className="block space-y-1 text-sm" htmlFor="ledger-concept">
                  <span className="font-medium">Descripción</span>
                  <Input
                    id="ledger-concept"
                    maxLength={LEDGER_CONCEPT_MAX}
                    placeholder={
                      kind === LedgerEntryKind.Expense
                        ? 'Ej.: Esterilización de Luna'
                        : 'Ej.: Donaciones por transferencia de la semana'
                    }
                    value={concept}
                    onChange={(e) => setConcept(e.target.value)}
                  />
                </label>

                {kind === LedgerEntryKind.Expense ? (
                  <label className="block space-y-1 text-sm" htmlFor="ledger-counterparty">
                    <span className="font-medium">Pagado a (opcional)</span>
                    <Input
                      id="ledger-counterparty"
                      maxLength={LEDGER_COUNTERPARTY_MAX}
                      placeholder="Ej.: Clínica Veterinaria San Roque"
                      value={counterparty}
                      onChange={(e) => setCounterparty(e.target.value)}
                    />
                    <span className="block text-xs text-muted-foreground">
                      Escribe el nombre de la empresa o comercio. No escribas nombres de personas:
                      el libro es público.
                    </span>
                  </label>
                ) : (
                  <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
                    Por privacidad (Ley 1581 de 2012) el libro nunca muestra quién donó. No escribas
                    nombres de donantes en la descripción.
                  </p>
                )}

                <label className="block space-y-1 text-sm" htmlFor="ledger-support">
                  <span className="font-medium">Soporte (recomendado)</span>
                  <input
                    id="ledger-support"
                    ref={fileInput}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,application/pdf"
                    className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-2"
                    onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  />
                  <span className="block text-xs text-muted-foreground">
                    Foto o PDF de la factura o el recibo. Solo tu equipo lo ve; en el portal aparece
                    “Con soporte”.
                  </span>
                </label>

                {formError && (
                  <p
                    role="alert"
                    className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
                  >
                    {formError}
                  </p>
                )}

                <Button type="submit" className="w-full" disabled={saving}>
                  {saving ? 'Publicando…' : 'Publicar en el libro'}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        <div className="min-w-0 space-y-4">
          <p className="text-sm text-muted-foreground">{LEDGER_HOW_IT_WORKS}</p>
          {!data && !loadError && <Skeleton className="h-64 w-full" />}
          {loadError && <EmptyState title="No pudimos cargar tu libro" description={loadError} />}
          {data && (
            <>
              <LedgerSummary totals={data.totals} />
              {items.length === 0 ? (
                <EmptyState
                  title="Tu libro está vacío"
                  description="Registra tu primer gasto o ingreso. Las donaciones en línea aparecerán solas."
                />
              ) : (
                <LedgerEntryList
                  items={items}
                  renderActions={(item) => (
                    <div className="flex gap-2">
                      {item.source === LedgerSource.Manual && item.hasSupport && (
                        <Button size="sm" variant="ghost" onClick={() => void openSupport(item)}>
                          Ver soporte
                        </Button>
                      )}
                      {canWrite && item.source === LedgerSource.Manual && !item.voided && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setVoiding(item);
                            setVoidReason('');
                          }}
                        >
                          Anular
                        </Button>
                      )}
                    </div>
                  )}
                />
              )}
            </>
          )}
        </div>
      </div>

      <Dialog open={voiding !== null} onOpenChange={(open) => !open && setVoiding(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Anular movimiento</DialogTitle>
            <DialogDescription>
              “{voiding?.concept}” seguirá visible en tu portal, tachado y con tu explicación. Deja
              de sumar en los totales. Esta acción no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <label className="block space-y-1 text-sm" htmlFor="ledger-void-reason">
            <span className="font-medium">¿Por qué lo anulas?</span>
            <Input
              id="ledger-void-reason"
              placeholder="Ej.: Se digitó 777.000 en vez de 77.000"
              value={voidReason}
              onChange={(e) => setVoidReason(e.target.value)}
            />
          </label>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVoiding(null)}>
              Cancelar
            </Button>
            <Button
              variant="dark"
              disabled={voidBusy || voidReason.trim().length < LEDGER_VOID_REASON_MIN}
              onClick={() => void confirmVoid()}
            >
              {voidBusy ? 'Anulando…' : 'Anular movimiento'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}
