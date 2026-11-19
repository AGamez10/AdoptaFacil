import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { CustodyPublicPaymentStatus } from '@adoptafacil/contracts';
import { Card, CardContent, CardHeader, CardTitle } from '@adoptafacil/ui';
import { PageContainer } from '../../_layout';
import { PublicFooter, PublicNavbar } from '../../../shell/layout';
import { useNoIndex } from '../../../seo/seo';
import { fetchPublicCustodyPaymentStatus } from '../api/custody-api';
import { formatCop } from '../model/custody-view';

/** Cada cuánto y cuántas veces se vuelve a preguntar mientras se confirma. */
const POLL_MS = 4000;
const POLL_TIMES = 8;

/**
 * `/pagar/guarderia/resultado` — adonde vuelve el navegador después de pagar
 * un cobro de guardería en Mercado Pago. PÚBLICA.
 *
 * NO confía en la query string para decir si el pago quedó aprobado: solo usa
 * la referencia para preguntarle el estado al servidor, que lo confirma con el
 * aviso firmado de Mercado Pago. Mientras tanto dice, con honestidad, que se
 * está confirmando.
 */
export function CustodyPayResultPage() {
  useNoIndex();
  const [params] = useSearchParams();
  const reference = params.get('reference') ?? '';
  const [status, setStatus] = useState<CustodyPublicPaymentStatus | null>(null);

  useEffect(() => {
    if (!reference) return;
    let cancelled = false;
    let tries = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const ask = () => {
      tries += 1;
      fetchPublicCustodyPaymentStatus(reference)
        .then((result) => {
          if (cancelled) return;
          if (result) setStatus(result);
          if ((!result || result.status === 'pending') && tries < POLL_TIMES) {
            timer = setTimeout(ask, POLL_MS);
          }
        })
        .catch(() => {
          if (!cancelled && tries < POLL_TIMES) timer = setTimeout(ask, POLL_MS);
        });
    };
    ask();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [reference]);

  const approved = status?.status === 'approved';
  return (
    <div className="flex min-h-screen flex-col">
      <PublicNavbar />
      <main className="flex-1">
        <PageContainer>
          <Card className="mx-auto max-w-xl">
            <CardHeader>
              <CardTitle>{approved ? 'Pago recibido' : 'Estamos confirmando tu pago'}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {approved && status ? (
                <>
                  <p>
                    {status.organizationName} recibió tu pago de {formatCop(status.amountCop)} por
                    el cuidado de {status.animalName}.
                  </p>
                  {status.receiptNumber && (
                    <p className="text-sm text-muted-foreground">
                      Constancia de pago {status.receiptNumber}. Pídesela a la organización si la
                      necesitas. No es una factura electrónica.
                    </p>
                  )}
                </>
              ) : status?.status === 'reversed' ? (
                <p>
                  Mercado Pago devolvió este pago. Si no lo esperabas, escríbele a{' '}
                  {status.organizationName}.
                </p>
              ) : status?.status === 'review' ? (
                <p>
                  Mercado Pago recibió tu pago, pero {status.organizationName} debe revisarlo antes
                  de aplicarlo al cobro. Escríbele para confirmar. No hace falta que vuelvas a
                  pagar.
                </p>
              ) : (
                <>
                  <p>
                    Estamos confirmando tu pago con Mercado Pago. Cuando quede aprobado, el dinero
                    queda en la cuenta de la organización y el cobro se marca como pagado.
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Si pagaste por PSE o en efectivo, la confirmación puede tardar un poco más. No
                    hace falta que vuelvas a pagar.
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        </PageContainer>
      </main>
      <PublicFooter />
    </div>
  );
}
