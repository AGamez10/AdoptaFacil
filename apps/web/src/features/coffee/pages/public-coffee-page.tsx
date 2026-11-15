import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import {
  COFFEE_MAX_UNITS_PER_ORDER,
  COFFEE_RESERVATION_MINUTES,
  type CoffeeBuyerInput,
  type CoffeeCampaignOption,
  type PublicCoffeeOffer,
} from '@adoptafacil/contracts';
import { Badge, Button, EmptyState, Input, Skeleton } from '@adoptafacil/ui';
import { useDocumentTitle } from '../../../lib/use-document-title';
import { PublicFooter, PublicNavbar } from '../../../shell/layout';
import {
  CoffeeApiError,
  fetchCoffeeCampaigns,
  fetchCoffeeOffer,
  startCoffeeCheckout,
} from '../api/coffee-api';
import { formatCop, orderTotal } from '../model/coffee-format';

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; offer: PublicCoffeeOffer }
  | { status: 'not-found' }
  | { status: 'error' };

const EMPTY_BUYER: CoffeeBuyerInput = {
  fullName: '',
  email: '',
  phone: '',
  address: '',
  city: '',
  department: '',
};

const FIELDS: Array<{
  key: keyof CoffeeBuyerInput;
  label: string;
  type?: string;
  autoComplete: string;
}> = [
  { key: 'fullName', label: 'Nombre completo', autoComplete: 'name' },
  {
    key: 'email',
    label: 'Correo (aquí llega tu comprobante)',
    type: 'email',
    autoComplete: 'email',
  },
  { key: 'phone', label: 'Celular', type: 'tel', autoComplete: 'tel' },
  { key: 'address', label: 'Dirección de entrega', autoComplete: 'street-address' },
  { key: 'city', label: 'Ciudad o municipio', autoComplete: 'address-level2' },
  { key: 'department', label: 'Departamento', autoComplete: 'address-level1' },
];

/**
 * `/c/:code` — la página a la que lleva el QR impreso en la bolsa. El QR no
 * cambia nunca: muestra el lote que está a la venta, el aporte por bolsa y la
 * campaña sugerida, que el comprador puede cambiar por otra activa. Al pagar,
 * las bolsas quedan apartadas 15 minutos y se abre Mercado Pago (cuenta de
 * AdoptaFácil).
 */
export function PublicCoffeePage() {
  const { code = '' } = useParams<{ code: string }>();
  const [params] = useSearchParams();
  const source = params.get('o') === 'qr' ? 'qr' : 'web';
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [campaigns, setCampaigns] = useState<CoffeeCampaignOption[] | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [buyer, setBuyer] = useState<CoffeeBuyerInput>(EMPTY_BUYER);
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const offer = state.status === 'ready' ? state.offer : null;
  useDocumentTitle(offer ? `${offer.productName} · AdoptaFácil` : 'Café de AdoptaFácil');

  const load = useCallback(
    async (countVisit: boolean) => {
      const next = await fetchCoffeeOffer(code, countVisit ? source : 'web');
      setState(next ? { status: 'ready', offer: next } : { status: 'not-found' });
      return next;
    },
    [code, source],
  );

  useEffect(() => {
    let active = true;
    setState({ status: 'loading' });
    fetchCoffeeOffer(code, source)
      .then((next) => {
        if (!active) return;
        setState(next ? { status: 'ready', offer: next } : { status: 'not-found' });
        setCampaignId(next?.lot?.suggestedCampaign?.id ?? null);
        if (next?.lot && !next.lot.suggestedCampaign) setChoosing(true);
      })
      .catch(() => {
        if (active) setState({ status: 'error' });
      });
    return () => {
      active = false;
    };
  }, [code, source, attempt]);

  useEffect(() => {
    if (!choosing || campaigns) return;
    fetchCoffeeCampaigns()
      .then(setCampaigns)
      .catch(() => setCampaigns([]));
  }, [choosing, campaigns]);

  const lot = offer?.lot ?? null;
  const maxUnits = lot ? Math.min(COFFEE_MAX_UNITS_PER_ORDER, lot.availableUnits) : 0;
  const chosen = useMemo<CoffeeCampaignOption | null>(() => {
    if (!campaignId) return null;
    if (lot?.suggestedCampaign?.id === campaignId) return lot.suggestedCampaign;
    return campaigns?.find((c) => c.id === campaignId) ?? null;
  }, [campaignId, campaigns, lot]);

  useEffect(() => {
    if (maxUnits > 0 && quantity > maxUnits) setQuantity(maxUnits);
  }, [maxUnits, quantity]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!lot || !campaignId) {
      setError('Elige la campaña que quieres apoyar.');
      return;
    }
    if (!accepted) {
      setError('Debes autorizar el tratamiento de tus datos para poder enviarte el café.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await startCoffeeCheckout(code, {
        lotId: lot.id,
        quantity,
        campaignId,
        buyer,
        acceptPrivacy: true,
      });
      window.location.assign(result.checkoutUrl);
    } catch (err) {
      if (err instanceof CoffeeApiError && err.code === 'CAMPAIGN_CLOSED') {
        setError(err.message);
        setCampaigns(null);
        setCampaignId(null);
        setChoosing(true);
      } else if (err instanceof CoffeeApiError && err.code === 'OUT_OF_STOCK') {
        setError(err.message);
        await load(false).catch(() => undefined);
      } else if (err instanceof CoffeeApiError && err.code === 'LOT_NOT_ON_SALE') {
        setError(err.message);
        await load(false).catch(() => undefined);
      } else {
        setError(
          err instanceof Error ? err.message : 'No pudimos abrir el pago. Inténtalo de nuevo.',
        );
      }
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-[var(--af-cream)] text-foreground">
      <PublicNavbar />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8 sm:px-6">
        {state.status === 'loading' && (
          <Skeleton className="h-96 w-full" data-testid="coffee-loading" />
        )}
        {state.status === 'not-found' && (
          <EmptyState
            title="Código no encontrado"
            description="Este código no corresponde a ningún café de AdoptaFácil. Revisa que la dirección sea la que está escrita bajo el QR de tu bolsa."
          />
        )}
        {state.status === 'error' && (
          <div className="flex flex-col items-center gap-4">
            <EmptyState
              title="No pudimos abrir esta página"
              description="Puede ser la conexión a internet. Inténtalo de nuevo en un momento."
            />
            <Button onClick={() => setAttempt((n) => n + 1)}>Intentar de nuevo</Button>
          </div>
        )}

        {offer && (
          <article className="space-y-6">
            <header className="space-y-2">
              <p className="text-sm font-bold uppercase tracking-wide text-[var(--af-teal-ink)]">
                Café de AdoptaFácil
              </p>
              <h1 className="text-3xl font-extrabold tracking-tight">{offer.productName}</h1>
              {offer.description && <p className="text-muted-foreground">{offer.description}</p>}
            </header>

            {!lot || lot.availableUnits === 0 ? (
              <section className="rounded-2xl border bg-background p-5">
                <h2 className="text-lg font-bold">Este café está agotado por ahora</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Cuando llegue el próximo lote podrás comprarlo aquí mismo, con este mismo QR.
                </p>
              </section>
            ) : (
              <form className="space-y-6" onSubmit={submit} noValidate>
                <section className="rounded-2xl border bg-background p-5">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-2xl font-extrabold">{formatCop(lot.salePriceCop)}</p>
                    <Badge variant="outline">Lote {lot.lotCode}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {offer.presentationGrams} g · quedan {lot.availableUnits}{' '}
                    {lot.availableUnits === 1 ? 'bolsa' : 'bolsas'}
                    {lot.shippingFeeCop > 0 ? ` · envío ${formatCop(lot.shippingFeeCop)}` : ''}
                  </p>
                </section>

                <section className="rounded-2xl border border-[var(--af-teal-ink)]/30 bg-background p-5">
                  <h2 className="text-lg font-bold">
                    Cada bolsa aporta {formatCop(lot.contributionPerUnitCop)} a una campaña
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    AdoptaFácil entrega el 20 % del margen bruto de cada bolsa (precio de venta
                    menos precio de compra) a la campaña de protección animal que elijas.
                  </p>

                  {chosen && !choosing && (
                    <div className="mt-4 rounded-xl bg-[var(--af-cream)] p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-bold">{chosen.title}</p>
                        {chosen.id === lot.suggestedCampaign?.id && <Badge>Sugerida</Badge>}
                      </div>
                      <p className="text-sm text-muted-foreground">{chosen.organizationName}</p>
                      <button
                        type="button"
                        className="mt-2 text-sm font-bold text-[var(--af-teal-ink)] hover:underline"
                        onClick={() => setChoosing(true)}
                      >
                        Elegir otra campaña
                      </button>
                    </div>
                  )}

                  {choosing && (
                    <fieldset className="mt-4 space-y-2">
                      <legend className="text-sm font-bold">¿Qué campaña quieres apoyar?</legend>
                      {!campaigns && <Skeleton className="h-24 w-full" />}
                      {campaigns?.length === 0 && (
                        <p className="text-sm text-muted-foreground">
                          No hay campañas activas en este momento.
                        </p>
                      )}
                      {campaigns?.map((c) => (
                        <label
                          key={c.id}
                          className="flex cursor-pointer items-start gap-3 rounded-xl border bg-background p-3 has-[:checked]:border-[var(--af-teal-ink)]"
                        >
                          <input
                            type="radio"
                            name="campaign"
                            className="mt-1"
                            checked={campaignId === c.id}
                            onChange={() => {
                              setCampaignId(c.id);
                              setChoosing(false);
                            }}
                          />
                          <span>
                            <span className="block font-bold">
                              {c.title}
                              {c.id === lot.suggestedCampaign?.id && ' · sugerida'}
                            </span>
                            <span className="block text-sm text-muted-foreground">
                              {c.organizationName}
                            </span>
                          </span>
                        </label>
                      ))}
                    </fieldset>
                  )}
                </section>

                <section className="space-y-4 rounded-2xl border bg-background p-5">
                  <div className="flex items-center justify-between gap-4">
                    <label htmlFor="coffee-qty" className="font-bold">
                      Bolsas
                    </label>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        aria-label="Una bolsa menos"
                        disabled={quantity <= 1}
                        onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                      >
                        −
                      </Button>
                      <output id="coffee-qty" className="w-8 text-center text-lg font-bold">
                        {quantity}
                      </output>
                      <Button
                        type="button"
                        variant="outline"
                        aria-label="Una bolsa más"
                        disabled={quantity >= maxUnits}
                        onClick={() => setQuantity((q) => Math.min(maxUnits, q + 1))}
                      >
                        +
                      </Button>
                    </div>
                  </div>
                  <dl className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <dt>Total a pagar</dt>
                      <dd className="text-lg font-extrabold" data-testid="coffee-total">
                        {formatCop(orderTotal(quantity, lot.salePriceCop, lot.shippingFeeCop))}
                      </dd>
                    </div>
                    <div className="flex justify-between text-muted-foreground">
                      <dt>Aporte de AdoptaFácil a tu campaña</dt>
                      <dd data-testid="coffee-contribution">
                        {formatCop(quantity * lot.contributionPerUnitCop)}
                      </dd>
                    </div>
                  </dl>
                </section>

                <section className="space-y-3 rounded-2xl border bg-background p-5">
                  <h2 className="text-lg font-bold">¿A dónde te lo enviamos?</h2>
                  {FIELDS.map((field) => (
                    <div key={field.key} className="space-y-1">
                      <label htmlFor={`buyer-${field.key}`} className="text-sm font-medium">
                        {field.label}
                      </label>
                      <Input
                        id={`buyer-${field.key}`}
                        type={field.type ?? 'text'}
                        autoComplete={field.autoComplete}
                        required
                        value={buyer[field.key]}
                        onChange={(e) => setBuyer((b) => ({ ...b, [field.key]: e.target.value }))}
                      />
                    </div>
                  ))}
                  <label className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={accepted}
                      onChange={(e) => setAccepted(e.target.checked)}
                    />
                    <span>
                      Autorizo a AdoptaFácil a usar estos datos solo para enviarme el café y el
                      comprobante, según la{' '}
                      <Link to="/legal/politica-de-datos" className="font-bold underline">
                        política de datos
                      </Link>
                      .
                    </span>
                  </label>
                </section>

                {error && (
                  <p
                    role="alert"
                    className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive"
                  >
                    {error}
                  </p>
                )}

                <Button type="submit" className="w-full" size="lg" disabled={busy || !campaignId}>
                  {busy ? 'Abriendo el pago…' : 'Pagar con Mercado Pago'}
                </Button>
                <p className="text-center text-xs text-muted-foreground">
                  Te apartamos las bolsas {COFFEE_RESERVATION_MINUTES} minutos mientras pagas. El
                  pago lo recibe AdoptaFácil; al confirmarse te llega el comprobante por correo con
                  la campaña y el aporte.
                </p>
              </form>
            )}

            <section className="grid grid-cols-3 gap-3 text-center">
              <div className="rounded-2xl bg-background p-4">
                <p className="text-xl font-extrabold">{offer.impact.unitsSold}</p>
                <p className="text-xs text-muted-foreground">bolsas vendidas</p>
              </div>
              <div className="rounded-2xl bg-background p-4">
                <p className="text-xl font-extrabold">
                  {formatCop(offer.impact.contributionCommittedCop)}
                </p>
                <p className="text-xs text-muted-foreground">aporte comprometido</p>
              </div>
              <div className="rounded-2xl bg-background p-4">
                <p className="text-xl font-extrabold">
                  {formatCop(offer.impact.contributionDeliveredCop)}
                </p>
                <p className="text-xs text-muted-foreground">entregado a campañas</p>
              </div>
            </section>
          </article>
        )}
      </main>
      <PublicFooter />
    </div>
  );
}
