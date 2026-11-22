import { useEffect, useState } from 'react';
import { PRODUCT_CATEGORIES, ProductCategory, type ProductPublic } from '@adoptafacil/contracts';
import { EmptyState, Skeleton } from '@adoptafacil/ui';
import { PublicFooter, PublicNavbar, PublicPageBody, PublicPageHero } from '../../../shell/layout';
import { listPublicProducts } from '../api/public-marketplace';
import { ProductCard } from '../components/product-card';
import { CATEGORY_LABELS } from '../model/marketplace-view';

type ListState = 'loading' | 'ready' | 'error';
const PAGE_SIZE = 24;

/**
 * Portal PÚBLICO del marketplace (M10, F-7) en `/marketplace`. Sin
 * autenticación: lista los productos ACTIVOS que expone `GET
 * /public/marketplace/products` (envuelto; `.items` ya normalizado a `[]`),
 * con filtro por categoría. NO es la pantalla de gestión interna (esa es
 * autenticada y vive aparte).
 */
export function PublicMarketplacePage() {
  const [items, setItems] = useState<ProductPublic[]>([]);
  const [state, setState] = useState<ListState>('loading');
  const [category, setCategory] = useState<ProductCategory | 'all'>('all');

  useEffect(() => {
    let active = true;
    setState('loading');
    listPublicProducts({
      limit: PAGE_SIZE,
      offset: 0,
      ...(category !== 'all' ? { category } : {}),
    })
      .then((page) => {
        if (!active) return;
        setItems(page.items);
        setState('ready');
      })
      .catch(() => {
        if (active) setState('error');
      });
    return () => {
      active = false;
    };
  }, [category]);

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <PublicNavbar />

      <main className="flex-1">
        <PublicPageHero
          eyebrow="Hecho por los refugios"
          tone="sun"
          title="Marketplace"
          lead="Productos físicos de organizaciones de rescate. El contacto y la venta ocurren por WhatsApp, fuera de la plataforma."
        />
        <PublicPageBody>
          <div className="mb-6 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setCategory('all')}
              aria-pressed={category === 'all'}
              className={`rounded-full border px-3 py-1 text-sm ${
                category === 'all'
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-input'
              }`}
            >
              Todas
            </button>
            {PRODUCT_CATEGORIES.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setCategory(value)}
                aria-pressed={category === value}
                className={`rounded-full border px-3 py-1 text-sm ${
                  category === value
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-input'
                }`}
              >
                {CATEGORY_LABELS[value]}
              </button>
            ))}
          </div>

          {state === 'loading' && <Skeleton className="h-64 w-full" />}
          {state === 'error' && (
            <EmptyState title="No se pudo cargar" description="Inténtalo de nuevo más tarde." />
          )}
          {state === 'ready' && items.length === 0 && (
            <EmptyState
              title="Sin productos"
              description="No hay productos publicados ahora. Vuelve pronto."
            />
          )}
          {state === 'ready' && items.length > 0 && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          )}
        </PublicPageBody>
      </main>

      <PublicFooter />
    </div>
  );
}
