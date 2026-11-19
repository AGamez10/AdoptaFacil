import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { PublicCoffeeCatalog } from '@adoptafacil/contracts';
import { Button, EmptyState, Skeleton } from '@adoptafacil/ui';
import { officialWhatsappUrl } from '../../../lib/contact';
import { useDocumentTitle } from '../../../lib/use-document-title';
import { PublicFooter, PublicNavbar } from '../../../shell/layout';
import { fetchCoffeeCatalog } from '../api/coffee-api';
import { formatCop } from '../model/coffee-format';

type LoadState =
  { status: 'loading' } | { status: 'ready'; catalog: PublicCoffeeCatalog } | { status: 'error' };

/**
 * `/cafe` — la tienda del café de AdoptaFácil. Antes solo se podía comprar
 * escaneando el QR de una bolsa; aquí cualquiera elige una presentación y pasa
 * a la misma página de compra (`/c/:code`), que aparta las bolsas, crea el
 * pedido y abre Mercado Pago con la cuenta de AdoptaFácil. Las ventas
 * sostienen la capa gratuita de los refugios.
 */
export function CoffeeShopPage() {
  useDocumentTitle('Café de AdoptaFácil · Compra en línea');
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setState({ status: 'loading' });
    fetchCoffeeCatalog()
      .then((catalog) => active && setState({ status: 'ready', catalog }))
      .catch(() => active && setState({ status: 'error' }));
    return () => {
      active = false;
    };
  }, [attempt]);

  const catalog = state.status === 'ready' ? state.catalog : null;

  return (
    <div className="flex min-h-screen flex-col bg-[var(--af-cream)] text-foreground">
      <PublicNavbar />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:px-6">
        <header className="grid items-center gap-6 sm:grid-cols-[1fr_220px]">
          <div className="space-y-3">
            <p className="text-sm font-bold uppercase tracking-wide text-[var(--af-teal-ink)]">
              Café de AdoptaFácil
            </p>
            <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
              Tu café sostiene la plataforma gratis para los refugios.
            </h1>
            <p className="text-muted-foreground">
              Compramos café colombiano y lo vendemos. Con esa venta mantenemos AdoptaFácil gratis
              para fundaciones y rescatistas, y el 20 % del margen bruto de cada bolsa va a la
              campaña de protección animal que tú elijas.
            </p>
          </div>
          <img
            src="/landing/cafe-san-pedro.webp"
            alt="Bolsas de Café San Pedro con la etiqueta de AdoptaFácil"
            width={1100}
            height={1100}
            className="mx-auto w-48 rounded-2xl sm:w-full"
            decoding="async"
          />
        </header>

        <section aria-labelledby="coffee-shop-list" className="mt-8">
          <h2 id="coffee-shop-list" className="sr-only">
            Presentaciones a la venta
          </h2>
          {state.status === 'loading' && (
            <Skeleton className="h-48 w-full" data-testid="coffee-shop-loading" />
          )}
          {state.status === 'error' && (
            <div className="flex flex-col items-center gap-4">
              <EmptyState
                title="No pudimos cargar la tienda"
                description="Puede ser la conexión a internet. Inténtalo de nuevo en un momento."
              />
              <Button onClick={() => setAttempt((n) => n + 1)}>Intentar de nuevo</Button>
            </div>
          )}
          {catalog && catalog.items.length === 0 && (
            <div className="rounded-2xl border bg-background p-6 text-center">
              <h3 className="text-lg font-bold">Estamos tostando el próximo lote</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Ahora mismo no hay café a la venta. Escríbenos y te avisamos cuando llegue.
              </p>
              <a
                className="mt-3 inline-flex rounded-full bg-[var(--af-teal-ink)] px-5 py-2 font-bold text-white"
                href={officialWhatsappUrl('Hola, avísenme cuando llegue el café de AdoptaFácil.')}
                target="_blank"
                rel="noreferrer"
              >
                Avísame por WhatsApp
              </a>
            </div>
          )}
          {catalog && catalog.items.length > 0 && (
            <ul className="grid gap-4 sm:grid-cols-2" data-testid="coffee-shop-items">
              {catalog.items.map((item) => {
                const soldOut = item.availableUnits === 0;
                return (
                  <li
                    key={item.code}
                    className="flex flex-col rounded-2xl border bg-background p-5"
                  >
                    <h3 className="text-xl font-extrabold">{item.productName}</h3>
                    <p className="text-sm text-muted-foreground">
                      {item.presentationGrams} g
                      {item.shippingFeeCop > 0 ? ` · envío ${formatCop(item.shippingFeeCop)}` : ''}
                    </p>
                    {item.description && <p className="mt-2 text-sm">{item.description}</p>}
                    <p className="mt-3 text-2xl font-extrabold">{formatCop(item.salePriceCop)}</p>
                    {item.contributionPerUnitCop > 0 && (
                      <p className="text-sm text-[var(--af-teal-ink)]">
                        Aporta {formatCop(item.contributionPerUnitCop)} a una campaña
                      </p>
                    )}
                    <div className="mt-4 flex-1" />
                    {soldOut ? (
                      <p className="rounded-full border px-4 py-2 text-center text-sm font-bold text-muted-foreground">
                        Agotado por ahora
                      </p>
                    ) : (
                      <Link
                        to={`/c/${item.code}`}
                        className="rounded-full bg-[var(--af-teal-ink)] px-4 py-2 text-center font-bold text-white"
                        data-testid={`coffee-buy-${item.code}`}
                      >
                        {catalog.onlineCheckout ? 'Comprar en línea' : 'Ver y pedir'}
                      </Link>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="mt-10 grid gap-4 text-sm sm:grid-cols-3">
          <div className="rounded-2xl border bg-background p-4">
            <p className="font-bold">1. Eliges tu café y la campaña</p>
            <p className="text-muted-foreground">Apartamos tus bolsas mientras pagas.</p>
          </div>
          <div className="rounded-2xl border bg-background p-4">
            <p className="font-bold">2. Pagas con Mercado Pago</p>
            <p className="text-muted-foreground">Pago seguro; el comprobante te llega al correo.</p>
          </div>
          <div className="rounded-2xl border bg-background p-4">
            <p className="font-bold">3. Te lo enviamos</p>
            <p className="text-muted-foreground">
              Sigues tu pedido con el enlace del correo.{' '}
              <Link to="/campanas" className="font-bold underline">
                Ver campañas
              </Link>
            </p>
          </div>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
