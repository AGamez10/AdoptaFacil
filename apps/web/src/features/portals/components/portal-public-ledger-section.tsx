import { useEffect, useState } from 'react';
import type { PublicLedgerPage } from '@adoptafacil/contracts';
import { Button, Card, CardContent, CardHeader, CardTitle, Skeleton } from '@adoptafacil/ui';
import { fetchPublicLedger } from '../../ledger/api/public-ledger';
import { LedgerEntryList } from '../../ledger/components/ledger-entry-list';
import { LedgerSummary } from '../../ledger/components/ledger-summary';
import { PublicLedgerDialog } from '../../ledger/components/public-ledger-dialog';

const HEADING_ID = 'portal-section-public-ledger';
/** Lo que se ve sin abrir el libro completo. */
const PREVIEW = 5;

export interface PortalPublicLedgerSectionProps {
  slug: string;
}

/**
 * "Transparencia — libro público" (RF14): totales y los últimos movimientos de
 * la organización (sus registros + las donaciones pagadas en línea), con
 * "Ver libro completo" para el resto. Siempre visible: la transparencia es un
 * pilar del producto. Si el libro no carga, la sección se oculta (nunca un
 * mensaje técnico en el portal).
 */
export function PortalPublicLedgerSection({ slug }: PortalPublicLedgerSectionProps) {
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState<PublicLedgerPage | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    const ctl = new AbortController();
    setState('loading');
    fetchPublicLedger(slug, { limit: PREVIEW, signal: ctl.signal })
      .then((p) => {
        setPage(p);
        setState('ready');
      })
      .catch(() => {
        if (!ctl.signal.aborted) setState('error');
      });
    return () => ctl.abort();
  }, [slug]);

  if (state === 'error') return null;

  return (
    <section
      id="portal-section-public-ledger"
      aria-labelledby={HEADING_ID}
      data-testid="portal-public-ledger-section"
      style={{ scrollMarginTop: '5rem' }}
    >
      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle id={HEADING_ID}>Transparencia — libro público</CardTitle>
            <p className="text-sm text-muted-foreground">
              Cada donación recibida y cada gasto ejecutado, con fecha y soporte.
            </p>
          </div>
          <Button type="button" variant="outline" onClick={() => setOpen(true)}>
            Ver libro completo →
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {state === 'loading' && <Skeleton className="h-40 w-full" />}
          {state === 'ready' && page && (
            <>
              <LedgerSummary totals={page.totals} />
              {page.items.length === 0 ? (
                <p className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
                  Esta organización aún no ha registrado movimientos. Cuando reciba donaciones o
                  registre gastos, aparecerán aquí.
                </p>
              ) : (
                <LedgerEntryList items={page.items} />
              )}
            </>
          )}
        </CardContent>
      </Card>

      <PublicLedgerDialog slug={slug} open={open} onOpenChange={setOpen} />
    </section>
  );
}
