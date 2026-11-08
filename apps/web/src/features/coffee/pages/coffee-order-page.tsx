import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { PublicCoffeeOrderStatus } from '@adoptafacil/contracts';
import { Button, EmptyState, Skeleton } from '@adoptafacil/ui';
import { useDocumentTitle } from '../../../lib/use-document-title';
import { PublicFooter, PublicNavbar } from '../../../shell/layout';
import { fetchCoffeeOrder } from '../api/coffee-api';
import { formatCop } from '../model/coffee-format';

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; order: PublicCoffeeOrderStatus }
  | { status: 'not-found' }
  | { status: 'error' };

/** Mientras Mercado Pago confirma, se vuelve a consultar cada pocos segundos. */
const POLL_MS = 4000;
const MAX_POLLS = 15;

const HEADLINE: Record<PublicCoffeeOrderStatus['status'], { title: string; text: string }> = {
  paid: {
    title: '¡Pago confirmado!',
    text: 'Te enviamos el comprobante a tu correo. Te avisaremos cuando despachemos tu café.',
  },
  pending: {
    title: 'Estamos confirmando tu pago',
    text: 'Mercado Pago nos avisa en unos segundos. No cierres esta página.',
  },
  needs_refund: {
    title: 'Tu pago llegó cuando ya no quedaban bolsas',
    text: 'Te devolveremos el dinero completo por el mismo medio de pago y te escribiremos para confirmarlo.',
  },
  expired: {
    title: 'La reserva venció',
    text: 'Las bolsas volvieron a quedar disponibles. Puedes intentarlo de nuevo desde el QR.',
  },
  rejected: {
    title: 'El pago no se aprobó',
    text: 'No se hizo ningún cobro. Puedes intentarlo de nuevo con otro medio de pago.',
  },
  cancelled: {
    title: 'El pago no se abrió',
    text: 'No se hizo ningún cobro. Puedes intentarlo de nuevo desde el QR.',
  },
  refunded: {
    title: 'Pago devuelto',
    text: 'Este pedido fue devuelto y no genera aporte a la campaña.',
  },
};

/** `/cafe/pedido/:reference` — a donde vuelve el comprador desde Mercado Pago. */
export function CoffeeOrderPage() {
  const { reference = '' } = useParams<{ reference: string }>();
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [polls, setPolls] = useState(0);
  useDocumentTitle('Tu pedido de café · AdoptaFácil');

  useEffect(() => {
    let active = true;
    fetchCoffeeOrder(reference)
      .then((order) => {
        if (active) setState(order ? { status: 'ready', order } : { status: 'not-found' });
      })
      .catch(() => {
        if (active) setState({ status: 'error' });
      });
    return () => {
      active = false;
    };
  }, [reference, polls]);

  const pending = state.status === 'ready' && state.order.status === 'pending';
  useEffect(() => {
    if (!pending || polls >= MAX_POLLS) return;
    const timer = window.setTimeout(() => setPolls((n) => n + 1), POLL_MS);
    return () => window.clearTimeout(timer);
  }, [pending, polls]);

  return (
    <div className="flex min-h-screen flex-col bg-[var(--af-cream)] text-foreground">
      <PublicNavbar />
      <main className="mx-auto w-full max-w-xl flex-1 px-4 py-10 sm:px-6">
        {state.status === 'loading' && <Skeleton className="h-64 w-full" />}
        {state.status === 'not-found' && (
          <EmptyState
            title="Pedido no encontrado"
            description="Revisa el enlace del correo o de Mercado Pago."
          />
        )}
        {state.status === 'error' && (
          <div className="flex flex-col items-center gap-4">
            <EmptyState
              title="No pudimos consultar tu pedido"
              description="Puede ser la conexión a internet. Inténtalo de nuevo en un momento."
            />
            <Button onClick={() => setPolls((n) => n + 1)}>Intentar de nuevo</Button>
          </div>
        )}
        {state.status === 'ready' && (
          <article className="space-y-5 rounded-2xl border bg-background p-6">
            <header className="space-y-1">
              <h1 className="text-2xl font-extrabold">{HEADLINE[state.order.status].title}</h1>
              <p className="text-muted-foreground">{HEADLINE[state.order.status].text}</p>
            </header>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <dt>Café</dt>
                <dd className="text-right font-medium">
                  {state.order.quantity} × {state.order.productName} (lote {state.order.lotCode})
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt>Total</dt>
                <dd className="font-medium">{formatCop(state.order.totalCop)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt>Campaña que elegiste</dt>
                <dd className="text-right font-medium">
                  {state.order.campaignTitle}
                  <span className="block text-xs text-muted-foreground">
                    {state.order.organizationName}
                  </span>
                </dd>
              </div>
              {(state.order.status === 'paid' || state.order.status === 'pending') && (
                <div className="flex justify-between gap-4">
                  <dt>Aporte de AdoptaFácil</dt>
                  <dd className="font-medium">{formatCop(state.order.contributionTotalCop)}</dd>
                </div>
              )}
              <div className="flex justify-between gap-4 text-xs text-muted-foreground">
                <dt>Referencia</dt>
                <dd className="break-all text-right">{state.order.reference}</dd>
              </div>
            </dl>
            <Link
              to="/"
              className="inline-block text-sm font-bold text-[var(--af-teal-ink)] hover:underline"
            >
              Volver a AdoptaFácil
            </Link>
          </article>
        )}
      </main>
      <PublicFooter />
    </div>
  );
}
