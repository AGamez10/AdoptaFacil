import type { LedgerTotals } from '@adoptafacil/contracts';
import { LedgerEntryKind, LedgerSource } from '@adoptafacil/contracts';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@adoptafacil/ui';
import {
  LEDGER_HOW_IT_WORKS,
  categoryLabel,
  formatCop,
  formatLedgerDate,
} from '../model/ledger-view';
import { ledgerThemeStyle, type LedgerTheme } from '../model/ledger-theme';
import type { LedgerListItem } from './ledger-entry-list';
import styles from './themed-ledger-dialog.module.scss';

export interface ThemedLedgerDialogProps {
  theme: LedgerTheme;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  testId: string;
  /** Nombre de la organización (ya es público en su portal). */
  orgName?: string;
  totals: LedgerTotals | null;
  items: LedgerListItem[];
  loading?: boolean;
  error?: string | null;
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
  /** Encima de los demás diálogos de la vista previa. */
  zIndex?: number;
}

const MONTH = new Intl.DateTimeFormat('es-CO', { month: 'long', year: 'numeric', timeZone: 'UTC' });

function monthLabel(isoDate: string): string {
  const [y, m] = isoDate.split('-').map(Number);
  if (!y || !m) return isoDate;
  const label = MONTH.format(new Date(Date.UTC(y, m - 1, 1)));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/** Movimientos agrupados por mes, en el mismo orden en que llegan (recientes primero). */
function byMonth(
  items: LedgerListItem[],
): Array<{ key: string; label: string; items: LedgerListItem[] }> {
  const groups: Array<{ key: string; label: string; items: LedgerListItem[] }> = [];
  for (const item of items) {
    const key = item.occurredOn.slice(0, 7);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.items.push(item);
    else groups.push({ key, label: monthLabel(item.occurredOn), items: [item] });
  }
  return groups;
}

const ARROW_IN = (
  <svg
    viewBox="0 0 24 24"
    aria-hidden="true"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M12 5v14M5 12l7 7 7-7" />
  </svg>
);
const ARROW_OUT = (
  <svg
    viewBox="0 0 24 24"
    aria-hidden="true"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M12 19V5M5 12l7-7 7 7" />
  </svg>
);
const CLOSE = (
  <svg
    viewBox="0 0 24 24"
    aria-hidden="true"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
  >
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);

/**
 * "Ver libro completo" con la apariencia de la plantilla activa del portal:
 * los mismos datos y reglas del libro público (anulados a la vista, sin datos de
 * quienes donan), vestidos con el fondo, la tinta, las tipografías y el acento
 * de la plantilla. En celular ocupa la pantalla y se desplaza por dentro.
 */
export function ThemedLedgerDialog({
  theme,
  open,
  onOpenChange,
  testId,
  orgName,
  totals,
  items,
  loading = false,
  error = null,
  hasMore = false,
  loadingMore = false,
  onLoadMore,
  zIndex,
}: ThemedLedgerDialogProps) {
  const pct =
    totals && totals.incomeCop > 0
      ? Math.round((totals.expenseCop / totals.incomeCop) * 100)
      : null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        hideCloseButton
        className={styles.dialog}
        style={{ ...ledgerThemeStyle(theme), ...(zIndex ? { zIndex } : {}) }}
        data-testid={testId}
        data-scheme={theme.scheme}
      >
        <header className={styles.head}>
          <div>
            <p className={styles.eyebrow}>Transparencia{orgName ? ` · ${orgName}` : ''}</p>
            <DialogTitle className={styles.title}>Libro público</DialogTitle>
          </div>
          <DialogClose className={styles.close} aria-label="Cerrar">
            {CLOSE}
          </DialogClose>
        </header>
        <DialogDescription className={styles.lead}>{LEDGER_HOW_IT_WORKS}</DialogDescription>

        <div className={styles.body}>
          {loading && !error && (
            <div className={styles.skeleton} aria-busy="true" aria-label="Cargando el libro">
              <i />
              <i />
              <i />
            </div>
          )}
          {error && (
            <div className={styles.empty} role="alert">
              <b>No pudimos cargar el libro</b>
              <p>{error}</p>
            </div>
          )}
          {!loading && !error && totals && (
            <>
              <dl className={styles.totals} data-testid="ledger-summary">
                <div className={styles.in}>
                  <dt>Recibido</dt>
                  <dd>{formatCop(totals.incomeCop)}</dd>
                </div>
                <div className={styles.out}>
                  <dt>Gastado</dt>
                  <dd>{formatCop(totals.expenseCop)}</dd>
                </div>
                <div className={styles.balance}>
                  <dt>Saldo</dt>
                  <dd>{formatCop(totals.balanceCop)}</dd>
                </div>
              </dl>
              {pct !== null && (
                <div className={styles.flow}>
                  <div
                    className={styles.bar}
                    role="img"
                    aria-label={`Se ha usado el ${pct} % de lo recibido`}
                  >
                    <i style={{ width: `${Math.min(pct, 100)}%` }} />
                  </div>
                  <p>
                    Se ha usado el <b>{pct} %</b> de lo recibido ·{' '}
                    {totals.entryCount === 1 ? '1 movimiento' : `${totals.entryCount} movimientos`}
                    {totals.lastEntryOn
                      ? ` · último el ${formatLedgerDate(totals.lastEntryOn)}`
                      : ''}
                  </p>
                </div>
              )}
            </>
          )}
          {!loading && !error && items.length === 0 && (
            <div className={styles.empty}>
              <b>Aún no hay movimientos</b>
              <p>Cuando la organización reciba donaciones o registre gastos, aparecerán aquí.</p>
            </div>
          )}
          {!loading && !error && items.length > 0 && (
            <div className={styles.months} data-testid="ledger-entry-list">
              {byMonth(items).map((g) => (
                <section key={g.key} className={styles.month} aria-label={g.label}>
                  <h3>{g.label}</h3>
                  <ul>
                    {g.items.map((item) => {
                      const income = item.kind === LedgerEntryKind.Income;
                      return (
                        <li
                          key={item.id}
                          className={item.voided ? styles.voided : income ? styles.in : styles.out}
                          data-voided={item.voided || undefined}
                        >
                          <span className={styles.icon}>{income ? ARROW_IN : ARROW_OUT}</span>
                          <div className={styles.what}>
                            <b>{item.concept}</b>
                            <span className={styles.meta}>
                              {formatLedgerDate(item.occurredOn)} · {categoryLabel(item.category)}
                              {item.counterparty ? ` · Pagado a ${item.counterparty}` : ''}
                            </span>
                            {item.source === LedgerSource.OnlineDonation ? (
                              <span className={styles.chip}>Pago en línea verificado</span>
                            ) : item.hasSupport ? (
                              <span className={styles.chip}>Con soporte</span>
                            ) : null}
                            {item.voided && (
                              <span className={styles.why}>
                                <b>Anulado:</b> {item.voidReason}
                              </span>
                            )}
                          </div>
                          <span className={styles.amount}>
                            {income ? '+' : '−'} {formatCop(item.amountCop)}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
            </div>
          )}
          {!loading && !error && hasMore && onLoadMore && (
            <button
              type="button"
              className={styles.more}
              onClick={onLoadMore}
              disabled={loadingMore}
            >
              {loadingMore ? 'Cargando…' : 'Ver movimientos anteriores'}
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
