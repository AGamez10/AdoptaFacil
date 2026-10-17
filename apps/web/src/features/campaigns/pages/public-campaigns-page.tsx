import { useEffect, useState } from 'react';
import type { CampaignPublic } from '@adoptafacil/contracts';
import { cn, EmptyState, Skeleton } from '@adoptafacil/ui';
import { PublicFooter, PublicNavbar } from '../../../shell/layout';
import { listPublicCampaigns } from '../api/public-campaigns';
import { CampaignCard } from '../components/campaign-card';
import { STATIC_PAGES } from '../../../seo/page-meta.js';
import { useSeo } from '../../../seo/seo';
import styles from './public-campaigns-page.module.scss';

type ListState = 'loading' | 'ready' | 'error';
const PAGE_SIZE = 24;

/**
 * Portal PÚBLICO de campañas (§M14/M06, RF15) en `/campanas`. Sin autenticación
 * (patrón T-052): lista las campañas ACTIVAS que expone `GET /public/campaigns`
 * (envuelto; `.items` ya normalizado a `[]`). Estado vacío explícito; el avance se
 * muestra tal cual lo da el backend (hoy 0). NO es la pantalla de gestión interna
 * (esa es autenticada y vive aparte).
 */
export function PublicCampaignsPage() {
  const [items, setItems] = useState<CampaignPublic[]>([]);
  const [state, setState] = useState<ListState>('loading');
  useSeo({ ...STATIC_PAGES['/campanas'], path: '/campanas' });

  useEffect(() => {
    let active = true;
    setState('loading');
    listPublicCampaigns({ limit: PAGE_SIZE, offset: 0 })
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
  }, []);

  return (
    <div className="flex min-h-screen flex-col bg-[var(--af-cream)] text-[var(--af-ink)]">
      <PublicNavbar />

      <main className="flex-1">
        <header className={styles.hero}>
          <div className={styles.container}>
            <p className={styles.eyebrow}>Cada aporte se nota</p>
            <h1 className={styles.title}>Campañas de recaudación</h1>
            <p className={styles.lead}>
              Cirugías, alimento y esterilizaciones de las organizaciones de rescate. Cada campaña
              muestra su meta, su avance y, después, en qué se gastó.
            </p>
          </div>
        </header>

        <div className={cn(styles.container, styles.body)}>
          {state === 'loading' && <Skeleton className="h-64 w-full rounded-[1.5rem]" />}
          {state === 'error' && (
            <EmptyState title="No se pudo cargar" description="Inténtalo de nuevo más tarde." />
          )}
          {state === 'ready' && items.length === 0 && (
            <EmptyState
              title="Sin campañas activas"
              description="No hay campañas activas ahora. Vuelve pronto."
            />
          )}
          {state === 'ready' && items.length > 0 && (
            <ul className={styles.grid}>
              {items.map((campaign) => (
                <li key={campaign.id}>
                  <CampaignCard campaign={campaign} variant="brand" />
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>

      <PublicFooter />
    </div>
  );
}
