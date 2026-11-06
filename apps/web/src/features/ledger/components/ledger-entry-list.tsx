import type { ReactNode } from 'react';
import { LedgerEntryKind, LedgerSource } from '@adoptafacil/contracts';
import { categoryLabel, formatCop, formatLedgerDate } from '../model/ledger-view';

/** Lo mínimo que la lista necesita (sirve para la vista pública y la interna). */
export interface LedgerListItem {
  id: string;
  source: LedgerSource;
  kind: LedgerEntryKind;
  category: string;
  occurredOn: string;
  amountCop: number;
  concept: string;
  counterparty?: string;
  hasSupport: boolean;
  voided: boolean;
  voidReason?: string;
}

export interface LedgerEntryListProps {
  items: LedgerListItem[];
  /** Acciones por fila (solo en la pantalla de la organización). */
  renderActions?: (item: LedgerListItem) => ReactNode;
}

/**
 * Movimientos del libro, del más reciente al más antiguo. Un anulado sigue a la
 * vista (tachado y con su motivo): la transparencia no borra errores, los explica.
 */
export function LedgerEntryList({ items, renderActions }: LedgerEntryListProps) {
  return (
    <ul className="divide-y rounded-xl border bg-card" data-testid="ledger-entry-list">
      {items.map((item) => {
        const income = item.kind === LedgerEntryKind.Income;
        return (
          <li
            key={item.id}
            className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start sm:justify-between"
            data-voided={item.voided || undefined}
          >
            <div className="min-w-0 space-y-1">
              <p className={`font-medium ${item.voided ? 'line-through opacity-60' : ''}`}>
                {item.concept}
              </p>
              <p className="flex flex-wrap gap-x-2 gap-y-1 text-xs text-muted-foreground">
                <span>{formatLedgerDate(item.occurredOn)}</span>
                <span aria-hidden>·</span>
                <span>{categoryLabel(item.category)}</span>
                {item.counterparty && (
                  <>
                    <span aria-hidden>·</span>
                    <span>Pagado a {item.counterparty}</span>
                  </>
                )}
                {item.source === LedgerSource.OnlineDonation ? (
                  <span className="rounded-full bg-sky-100 px-2 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200">
                    Pago en línea verificado
                  </span>
                ) : item.hasSupport ? (
                  <span className="rounded-full bg-emerald-100 px-2 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200">
                    Con soporte
                  </span>
                ) : null}
              </p>
              {item.voided && (
                <p className="text-xs text-amber-800 dark:text-amber-300">
                  <strong>Anulado:</strong> {item.voidReason}
                </p>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-3 sm:flex-col sm:items-end">
              <span
                className={`whitespace-nowrap text-base font-semibold ${
                  item.voided
                    ? 'line-through opacity-60'
                    : income
                      ? 'text-emerald-700 dark:text-emerald-400'
                      : 'text-rose-700 dark:text-rose-400'
                }`}
              >
                {income ? '+' : '−'} {formatCop(item.amountCop)}
              </span>
              {renderActions?.(item)}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
