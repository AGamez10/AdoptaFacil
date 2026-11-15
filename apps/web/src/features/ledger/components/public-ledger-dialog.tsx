import { useCallback, useEffect, useState } from 'react';
import type { PublicLedgerEntry, PublicLedgerPage } from '@adoptafacil/contracts';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  EmptyState,
  Skeleton,
  friendlyErrorMessage,
} from '@adoptafacil/ui';
import { fetchPublicLedger } from '../api/public-ledger';
import { LEDGER_HOW_IT_WORKS } from '../model/ledger-view';
import { LedgerEntryList } from './ledger-entry-list';
import { LedgerSummary } from './ledger-summary';
import { ThemedLedgerDialog } from './themed-ledger-dialog';
import type { LedgerTheme } from '../model/ledger-theme';

const PAGE = 20;

export { LEDGER_HOW_IT_WORKS };

export interface PublicLedgerDialogProps {
  slug: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Apariencia de la plantilla activa del portal (si la hay). */
  theme?: LedgerTheme | null;
  orgName?: string;
}

/** "Ver libro completo": todos los movimientos, por páginas. */
export function PublicLedgerDialog({
  slug,
  open,
  onOpenChange,
  theme,
  orgName,
}: PublicLedgerDialogProps) {
  const [page, setPage] = useState<PublicLedgerPage | null>(null);
  const [items, setItems] = useState<PublicLedgerEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    if (!open) return;
    const ctl = new AbortController();
    setPage(null);
    setItems([]);
    setError(null);
    fetchPublicLedger(slug, { limit: PAGE, offset: 0, signal: ctl.signal })
      .then((p) => {
        setPage(p);
        setItems(p.items);
      })
      .catch((e: unknown) => {
        if (!ctl.signal.aborted) setError(friendlyErrorMessage(e));
      });
    return () => ctl.abort();
  }, [slug, open]);

  const loadMore = useCallback(async () => {
    setLoadingMore(true);
    try {
      const next = await fetchPublicLedger(slug, { limit: PAGE, offset: items.length });
      setItems((cur) => [...cur, ...next.items]);
    } catch (e) {
      setError(friendlyErrorMessage(e));
    } finally {
      setLoadingMore(false);
    }
  }, [slug, items.length]);

  if (theme) {
    return (
      <ThemedLedgerDialog
        theme={theme}
        open={open}
        onOpenChange={onOpenChange}
        testId="public-ledger-dialog"
        orgName={orgName}
        totals={page?.totals ?? null}
        items={items}
        loading={!page && !error}
        error={error}
        hasMore={!!page && items.length < page.total}
        loadingMore={loadingMore}
        onLoadMore={() => void loadMore()}
      />
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[90vh] max-w-2xl overflow-y-auto"
        data-testid="public-ledger-dialog"
      >
        <DialogHeader>
          <DialogTitle>Transparencia — libro público</DialogTitle>
          <DialogDescription>{LEDGER_HOW_IT_WORKS}</DialogDescription>
        </DialogHeader>
        {!page && !error && <Skeleton className="h-48 w-full" />}
        {error && <EmptyState title="No pudimos cargar el libro" description={error} />}
        {page && (
          <div className="space-y-4">
            <LedgerSummary totals={page.totals} />
            {items.length === 0 ? (
              <EmptyState
                title="Aún no hay movimientos"
                description="Cuando la organización reciba donaciones o registre gastos, aparecerán aquí."
              />
            ) : (
              <LedgerEntryList items={items} />
            )}
            {items.length < page.total && (
              <div className="flex justify-center">
                <Button variant="outline" onClick={() => void loadMore()} disabled={loadingMore}>
                  {loadingMore ? 'Cargando…' : 'Ver movimientos anteriores'}
                </Button>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
