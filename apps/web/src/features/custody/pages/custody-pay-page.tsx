import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { CUSTODY_DEBT_SEPARATION_NOTICE, type CustodyPublicPayment } from '@adoptafacil/contracts';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  Input,
  Skeleton,
} from '@adoptafacil/ui';
import { PageContainer } from '../../_layout';
import { PublicFooter, PublicNavbar } from '../../../shell/layout';
import { useNoIndex } from '../../../seo/seo';
import { fetchPublicCustodyPayment, startPublicCustodyCheckout } from '../api/custody-api';
import { formatCop, formatDate, parseCopInput } from '../model/custody-view';

type LoadState = 'loading' | 'found' | 'invalid' | 'error';

const STATE_MESSAGE: Record<Exclude<CustodyPublicPayment['state'], 'open'>, string> = {
  paid: 'Este cobro ya está pagado. No hace falta que pagues de nuevo.',
  cancelled: 'La organización anuló este cobro. No hay nada por pagar.',
  unavailable:
    'Esta organización no está recibiendo pagos en línea en este momento. Escríbele para acordar otro medio de pago.',
};

/**
 * `/pagar/guarderia/:token` — página PÚBLICA donde el responsable paga un
 * cobro de guardería o custodia con el enlace que le compartió la
 * organización. Sin sesión: el enlace es la credencial y solo muestra ese
 * cobro. El pago se hace en Mercado Pago y llega a la cuenta de la
 * organización.
 */
export function CustodyPayPage() {
  useNoIndex();
  const { token = '' } = useParams();
  const navigate = useNavigate();
  const [state, setState] = useState<LoadState>('loading');
  const [data, setData] = useState<CustodyPublicPayment | null>(null);
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setState('loading');
    fetchPublicCustodyPayment(token)
      .then((result) => {
        if (cancelled) return;
        if (!result) {
          setState('invalid');
          return;
        }
        setData(result);
        setAmount(String(result.balanceCop));
        setState('found');
      })
      .catch(() => {
        if (!cancelled) setState('error');
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const pay = async () => {
    if (!data) return;
    const value = parseCopInput(amount);
    if (!value) {
      setError('Escribe el valor a pagar en pesos, por ejemplo 150000.');
      return;
    }
    if (value > data.balanceCop) {
      setError(`El valor supera el saldo del cobro (${formatCop(data.balanceCop)}).`);
      return;
    }
    if (value < data.minimumCop) {
      setError(`El pago mínimo es de ${formatCop(data.minimumCop)}.`);
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const checkout = await startPublicCustodyCheckout(token, value);
      if (checkout.checkoutUrl) {
        window.location.assign(checkout.checkoutUrl);
        return;
      }
      navigate(`/pagar/guarderia/resultado?reference=${encodeURIComponent(checkout.reference)}`);
    } catch (problem) {
      setError(
        problem instanceof Error
          ? problem.message
          : 'No pudimos abrir el pago. Intenta de nuevo en unos minutos.',
      );
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col">
      <PublicNavbar />
      <main className="flex-1">
        <PageContainer>
          {state === 'loading' && <Skeleton className="mx-auto h-64 w-full max-w-xl" />}
          {state === 'invalid' && (
            <EmptyState
              title="Este enlace de pago no es válido"
              description="Puede que la organización lo haya reemplazado. Pídele un enlace nuevo."
            />
          )}
          {state === 'error' && (
            <EmptyState
              title="No pudimos cargar el cobro"
              description="Revisa tu conexión e intenta de nuevo en unos minutos."
            />
          )}
          {state === 'found' && data && (
            <Card className="mx-auto max-w-xl">
              <CardHeader>
                <CardTitle>Pago a {data.organizationName}</CardTitle>
                <CardDescription>
                  {data.conceptLabel} de {data.animalName}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                  <dt className="text-muted-foreground">Detalle</dt>
                  <dd>{data.description}</dd>
                  {data.periodLabel && (
                    <>
                      <dt className="text-muted-foreground">Periodo</dt>
                      <dd>{data.periodLabel}</dd>
                    </>
                  )}
                  <dt className="text-muted-foreground">Valor del cobro</dt>
                  <dd>{formatCop(data.amountCop)}</dd>
                  {data.paidCop > 0 && (
                    <>
                      <dt className="text-muted-foreground">Ya pagado</dt>
                      <dd>{formatCop(data.paidCop)}</dd>
                    </>
                  )}
                  <dt className="text-muted-foreground">Saldo</dt>
                  <dd className="font-semibold">{formatCop(data.balanceCop)}</dd>
                  <dt className="text-muted-foreground">Fecha de pago</dt>
                  <dd>{formatDate(data.dueDate)}</dd>
                </dl>

                {data.state === 'open' ? (
                  <>
                    <label className="block space-y-1 text-sm">
                      <span className="font-medium">Valor a pagar (COP)</span>
                      <Input
                        inputMode="numeric"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                      />
                      <span className="block text-muted-foreground">
                        Puedes pagar todo el saldo o una parte (mínimo {formatCop(data.minimumCop)}
                        ).
                      </span>
                    </label>
                    {error && (
                      <p role="alert" className="text-sm text-red-700">
                        {error}
                      </p>
                    )}
                    <Button disabled={busy} onClick={() => void pay()}>
                      {busy ? 'Abriendo Mercado Pago…' : 'Pagar con Mercado Pago'}
                    </Button>
                    <p className="text-sm text-muted-foreground">{data.notice}</p>
                  </>
                ) : (
                  <p className="rounded-md bg-muted px-3 py-2 text-sm">
                    {STATE_MESSAGE[data.state]}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">{CUSTODY_DEBT_SEPARATION_NOTICE}</p>
              </CardContent>
            </Card>
          )}
        </PageContainer>
      </main>
      <PublicFooter />
    </div>
  );
}
