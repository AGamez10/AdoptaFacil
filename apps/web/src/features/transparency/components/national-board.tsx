import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import type { NationalTransparency } from '@adoptafacil/contracts';
import { friendlyErrorMessage } from '@adoptafacil/ui';
import { fetchNationalTransparency } from '../api/national-transparency';
import {
  LedgerEntryKind,
  destinationShares,
  formatCop,
  formatCopShort,
  formatInt,
  isEmpty,
  monthLong,
  monthShort,
  niceMax,
  sharesByCategory,
  usedPct,
  type Share,
} from '../model/national-view';
import styles from './national-board.module.scss';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: NationalTransparency };

/** Carga el consolidado nacional una vez (o cuando `enabled` pasa a true). */
export function useNationalTransparency(enabled = true): LoadState {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  useEffect(() => {
    if (!enabled) return;
    const ctl = new AbortController();
    setState({ status: 'loading' });
    fetchNationalTransparency(ctl.signal)
      .then((data) => setState({ status: 'ready', data }))
      .catch((e: unknown) => {
        if (!ctl.signal.aborted) setState({ status: 'error', message: friendlyErrorMessage(e) });
      });
    return () => ctl.abort();
  }, [enabled]);
  return state;
}

export interface NationalBoardProps {
  /** `compact`: cifras y meses (landing). `full`: además, de dónde viene y en qué se usa. */
  variant?: 'compact' | 'full';
  /** Para que la landing solo consulte cuando el tablero está cerca de la vista. */
  enabled?: boolean;
  /** Pie del tablero (p. ej. el enlace al tablero completo). */
  footer?: ReactNode;
}

/**
 * Tablero de Transparencia Nacional: el consolidado (nivel macro) de los libros
 * públicos de todas las organizaciones aprobadas. Solo sumas y conteos reales de
 * la API; ninguna cifra se estima ni se rellena.
 */
export function NationalBoard({ variant = 'full', enabled = true, footer }: NationalBoardProps) {
  const state = useNationalTransparency(enabled);
  return (
    <div className={styles.board} data-variant={variant} data-testid="national-board">
      {state.status === 'loading' && (
        <div className={styles.skeleton} aria-busy="true" aria-label="Cargando las cifras del país">
          <i />
          <i />
          <i />
          <i />
          <b />
        </div>
      )}
      {state.status === 'error' && (
        <div className={styles.empty} role="alert">
          <b>No pudimos cargar las cifras del país</b>
          <p>{state.message}</p>
        </div>
      )}
      {state.status === 'ready' && <BoardBody data={state.data} variant={variant} />}
      {footer}
    </div>
  );
}

function BoardBody({ data, variant }: { data: NationalTransparency; variant: 'compact' | 'full' }) {
  const pct = usedPct(data.totals.incomeCop, data.totals.expenseCop);
  const empty = isEmpty(data);
  return (
    <>
      <dl className={styles.kpis}>
        <Kpi label="Recibido en el país" value={formatCop(data.totals.incomeCop)}>
          {formatInt(data.totals.movementCount)}{' '}
          {data.totals.movementCount === 1 ? 'movimiento publicado' : 'movimientos publicados'}
        </Kpi>
        <Kpi label="Usado en el rescate" value={formatCop(data.totals.expenseCop)}>
          {pct === null ? 'Aún no hay ingresos' : `${pct} % de lo recibido`}
        </Kpi>
        <Kpi
          label="Organizaciones que rinden cuentas"
          value={formatInt(data.organizations.reporting)}
        >
          de {formatInt(data.organizations.approved)}{' '}
          {data.organizations.approved === 1 ? 'aprobada' : 'aprobadas'} en AdoptaFácil
        </Kpi>
        <Kpi label="Donaciones en línea" value={formatInt(data.totals.onlineDonationsCount)}>
          {formatCop(data.totals.onlineDonationsCop)} verificados por la pasarela
        </Kpi>
        <Kpi label="Animales adoptados" value={formatInt(data.animals.adopted)}>
          {formatInt(data.animals.inAdoption)}{' '}
          {data.animals.inAdoption === 1 ? 'espera familia' : 'esperan familia'} hoy
        </Kpi>
      </dl>

      {data.thisMonth.month && (
        <p className={styles.month} data-testid="national-this-month">
          <b>{monthLong(data.thisMonth.month)}:</b> {formatCop(data.thisMonth.incomeCop)} recibidos
          · {formatCop(data.thisMonth.expenseCop)} usados ·{' '}
          {formatInt(data.thisMonth.onlineDonationsCount)}{' '}
          {data.thisMonth.onlineDonationsCount === 1 ? 'donación en línea' : 'donaciones en línea'}
        </p>
      )}

      {empty ? (
        <div className={styles.empty}>
          <b>Aún no hay movimientos publicados en el país</b>
          <p>
            Cuando las organizaciones aprobadas registren ingresos y gastos en su libro público, la
            suma de todas aparece aquí.
          </p>
        </div>
      ) : (
        <>
          <MonthlyFlowChart months={data.months} />
          {variant === 'full' && (
            <>
              <div className={styles.pair}>
                <ShareBars
                  title="¿De dónde viene?"
                  hint="Ingresos por tipo"
                  tone="in"
                  shares={sharesByCategory(data, LedgerEntryKind.Income)}
                />
                <ShareBars
                  title="¿En qué se usa?"
                  hint="Gastos por categoría"
                  tone="out"
                  shares={sharesByCategory(data, LedgerEntryKind.Expense)}
                />
              </div>
              <div className={styles.pair}>
                <ShareBars
                  title="Destino de las donaciones en línea"
                  hint="Lo que eligió quien donó"
                  tone="in"
                  shares={destinationShares(data)}
                  emptyText="Aún no hay donaciones en línea."
                />
                <Departments data={data} />
              </div>
            </>
          )}
        </>
      )}
      <p className={styles.note}>
        Solo organizaciones aprobadas. Los movimientos anulados no suman. Nunca se publican datos de
        quienes donan. Actualizado el{' '}
        {new Date(data.generatedAt).toLocaleString('es-CO', {
          dateStyle: 'long',
          timeStyle: 'short',
          timeZone: 'America/Bogota',
        })}
      </p>
    </>
  );
}

function Kpi({ label, value, children }: { label: string; value: string; children: ReactNode }) {
  return (
    <div className={styles.kpi}>
      <dt>{label}</dt>
      <dd>
        <span className={styles.kpi__value}>{value}</span>
        <span className={styles.kpi__sub}>{children}</span>
      </dd>
    </div>
  );
}

/** Recibido y usado por mes (últimos 12), con detalle al pasar o enfocar. */
export function MonthlyFlowChart({ months }: { months: NationalTransparency['months'] }) {
  const [active, setActive] = useState<number | null>(null);
  const max = niceMax(Math.max(0, ...months.flatMap((m) => [m.incomeCop, m.expenseCop])));
  const h = (v: number) => `${Math.max(0, (v / max) * 100)}%`;
  return (
    <figure className={styles.chart} data-testid="national-months">
      <figcaption className={styles.chart__head}>
        <span className={styles.chart__title}>Recibido y usado, mes a mes</span>
        <span className={styles.legend} aria-hidden="true">
          <span>
            <i className={styles.sw} data-tone="in" />
            Recibido
          </span>
          <span>
            <i className={styles.sw} data-tone="out" />
            Usado
          </span>
        </span>
      </figcaption>
      <div className={styles.plot}>
        <div className={styles.grid} aria-hidden="true">
          {[1, 0.5, 0].map((f) => (
            <span key={f} style={{ bottom: `${f * 100}%` }}>
              <em className={styles.grid__label}>{f === 0 ? '0' : formatCopShort(max * f)}</em>
            </span>
          ))}
        </div>
        <ol className={styles.cols} onMouseLeave={() => setActive(null)}>
          {months.map((m, i) => (
            <li
              key={m.month}
              tabIndex={0}
              className={styles.col}
              data-active={active === i || undefined}
              onMouseEnter={() => setActive(i)}
              onFocus={() => setActive(i)}
              onBlur={() => setActive(null)}
              aria-label={`${monthLong(m.month)}: recibido ${formatCop(m.incomeCop)}, usado ${formatCop(m.expenseCop)}`}
            >
              <span className={styles.bars} aria-hidden="true">
                <i data-tone="in" style={{ height: h(m.incomeCop) }} />
                <i data-tone="out" style={{ height: h(m.expenseCop) }} />
              </span>
              <span className={styles.x} aria-hidden="true">
                {monthShort(m.month)}
              </span>
              {active === i && (
                <span
                  className={styles.tip}
                  role="tooltip"
                  data-edge={i < 2 ? 'start' : i > months.length - 3 ? 'end' : undefined}
                >
                  <b>{monthLong(m.month)}</b>
                  <span>
                    <i className={styles.sw} data-tone="in" /> Recibido {formatCop(m.incomeCop)}
                  </span>
                  <span>
                    <i className={styles.sw} data-tone="out" /> Usado {formatCop(m.expenseCop)}
                  </span>
                </span>
              )}
            </li>
          ))}
        </ol>
      </div>
      <details className={styles.table}>
        <summary>Ver como tabla</summary>
        <table>
          <thead>
            <tr>
              <th scope="col">Mes</th>
              <th scope="col">Recibido</th>
              <th scope="col">Usado</th>
            </tr>
          </thead>
          <tbody>
            {months.map((m) => (
              <tr key={m.month}>
                <th scope="row">{monthLong(m.month)}</th>
                <td>{formatCop(m.incomeCop)}</td>
                <td>{formatCop(m.expenseCop)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

function ShareBars({
  title,
  hint,
  tone,
  shares,
  emptyText = 'Aún no hay movimientos de este tipo.',
}: {
  title: string;
  hint: string;
  tone: 'in' | 'out';
  shares: Share[];
  emptyText?: string;
}) {
  return (
    <section className={styles.card}>
      <h3>{title}</h3>
      <p className={styles.card__hint}>{hint}</p>
      {shares.length === 0 ? (
        <p className={styles.card__empty}>{emptyText}</p>
      ) : (
        <ul className={styles.shares}>
          {shares.map((s) => (
            <li key={s.key}>
              <span className={styles.share__label}>{s.label}</span>
              <span className={styles.share__value}>
                {formatCop(s.amountCop)} · {Math.round(s.pct)} %
              </span>
              <span className={styles.share__track} aria-hidden="true">
                <i
                  data-tone={tone}
                  style={{ '--w': `${Math.max(s.pct, 1.5)}%` } as CSSProperties}
                />
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Departments({ data }: { data: NationalTransparency }) {
  const rows = data.departments;
  return (
    <section className={styles.card}>
      <h3>Por departamento</h3>
      <p className={styles.card__hint}>Según la ubicación de cada organización</p>
      {rows.length === 0 ? (
        <p className={styles.card__empty}>Aún no hay organizaciones aprobadas.</p>
      ) : (
        <div className={styles.deps}>
          <table>
            <thead>
              <tr>
                <th scope="col">Departamento</th>
                <th scope="col">Org.</th>
                <th scope="col">Recibido</th>
                <th scope="col">Usado</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => (
                <tr key={d.department ?? '—'}>
                  <th scope="row">{d.department ?? 'Sin departamento'}</th>
                  <td>{formatInt(d.organizations)}</td>
                  <td>{formatCopShort(d.incomeCop)}</td>
                  <td>{formatCopShort(d.expenseCop)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
