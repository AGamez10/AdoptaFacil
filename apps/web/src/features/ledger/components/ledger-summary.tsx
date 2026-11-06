import type { LedgerTotals } from '@adoptafacil/contracts';
import { formatCop, formatLedgerDate } from '../model/ledger-view';

export interface LedgerSummaryProps {
  totals: LedgerTotals;
}

/** Totales del libro (solo movimientos vigentes: los anulados no suman). */
export function LedgerSummary({ totals }: LedgerSummaryProps) {
  return (
    <div className="space-y-2" data-testid="ledger-summary">
      <dl className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border bg-card px-4 py-3">
          <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Recibido
          </dt>
          <dd className="mt-1 text-xl font-semibold text-emerald-700 dark:text-emerald-400">
            {formatCop(totals.incomeCop)}
          </dd>
        </div>
        <div className="rounded-xl border bg-card px-4 py-3">
          <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Gastado
          </dt>
          <dd className="mt-1 text-xl font-semibold text-rose-700 dark:text-rose-400">
            {formatCop(totals.expenseCop)}
          </dd>
        </div>
        <div className="rounded-xl border bg-card px-4 py-3">
          <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Saldo
          </dt>
          <dd className="mt-1 text-xl font-semibold">{formatCop(totals.balanceCop)}</dd>
        </div>
      </dl>
      <p className="text-xs text-muted-foreground">
        {totals.entryCount === 1 ? '1 movimiento' : `${totals.entryCount} movimientos`}
        {totals.lastEntryOn ? ` · último el ${formatLedgerDate(totals.lastEntryOn)}` : ''}
      </p>
    </div>
  );
}
