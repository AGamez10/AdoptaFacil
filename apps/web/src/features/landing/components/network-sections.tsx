import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type {
  PublicAnimalOrganizationSummary,
  PublicLedgerPage,
  ResourceNeedPublic,
  VolunteerOpportunityPublic,
} from '@adoptafacil/contracts';
import { cn } from '@adoptafacil/ui';
import { useFeature } from '../../../shell/capabilities';
import { fetchPublicLedger } from '../../ledger/api/public-ledger';
import { formatCop } from '../../ledger/model/ledger-view';
import { listPublicNeeds } from '../../resources/api/public-resources';
import { CATEGORY_LABELS, publicResourceNeedHref } from '../../resources/model/resources-view';
import type { CatalogSnapshot } from '../model/use-catalog-snapshot';
import { IconArrowRight, IconBox, IconDocument, IconPeople, IconShield } from './landing-icons';
import styles from './network.module.scss';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

/** Cuántas tarjetas se muestran por bloque: lo justo para ver qué hay. */
const PREVIEW = 3;
/** Organizaciones cuyo libro se resume en la landing (una lectura por cada una). */
const LEDGER_ORGS = 6;

type LoadStatus = 'loading' | 'ready' | 'error';

/**
 * `true` cuando la sección está a una pantalla de distancia. Las lecturas de
 * la API de estas secciones esperan a ese momento: la primera carga de la
 * landing no paga peticiones que el visitante quizá nunca vea. Sin
 * IntersectionObserver (navegadores viejos, pruebas) se lee de una vez.
 */
function useNearViewport<T extends Element>() {
  const ref = useRef<T>(null);
  const [near, setNear] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === 'undefined') {
      setNear(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setNear(true);
          observer.disconnect();
        }
      },
      { rootMargin: '600px 0px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return [ref, near] as const;
}

function useLazyList<T>(enabled: boolean, load: (signal: AbortSignal) => Promise<T[]>) {
  const [state, setState] = useState<{ status: LoadStatus; items: T[] }>({
    status: 'loading',
    items: [],
  });
  const loadRef = useRef(load);
  loadRef.current = load;
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    loadRef
      .current(controller.signal)
      .then((items) => {
        if (!controller.signal.aborted) setState({ status: 'ready', items });
      })
      .catch(() => {
        if (!controller.signal.aborted) setState({ status: 'error', items: [] });
      });
    return () => controller.abort();
  }, [enabled]);
  return state;
}

/** `GET /public/volunteer-opportunities` — el feed global (todas las organizaciones). */
async function listVolunteering(signal: AbortSignal): Promise<VolunteerOpportunityPublic[]> {
  const response = await fetch(`${API_BASE}/public/volunteer-opportunities?limit=${PREVIEW}`, {
    signal,
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const body = (await response.json()) as { items?: unknown } | null;
  return Array.isArray(body?.items) ? (body.items as VolunteerOpportunityPublic[]) : [];
}

const SHORT_DATE = new Intl.DateTimeFormat('es-CO', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
});

function shortDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : SHORT_DATE.format(date);
}

function SkeletonRows({ label }: { label: string }) {
  return (
    <ul className={styles.list} aria-busy="true" aria-label={label}>
      {Array.from({ length: PREVIEW }, (_, index) => (
        <li key={index} className={styles.skeleton} aria-hidden="true">
          <span className={styles.skeleton__line} />
          <span className={cn(styles.skeleton__line, styles['skeleton__line--short'])} />
        </li>
      ))}
    </ul>
  );
}

function EmptyState({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className={styles.empty}>
      <p className={styles.empty__title}>{title}</p>
      <p className={styles.empty__text}>{children}</p>
    </div>
  );
}

function PanelHead({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <div className={styles.panel__head}>
      <span className={styles.panel__icon} aria-hidden="true">
        {icon}
      </span>
      <div>
        <h3 className={styles.panel__title}>{title}</h3>
        <p className={styles.panel__text}>{text}</p>
      </div>
    </div>
  );
}

function NeedsPanel({ near }: { near: boolean }) {
  const resources = useFeature('resources');
  const { status, items } = useLazyList<ResourceNeedPublic>(near && resources, (signal) =>
    listPublicNeeds({ limit: PREVIEW, signal }).then((page) => page.items.slice(0, PREVIEW)),
  );

  return (
    <article className={cn(styles.panel, 'af-reveal')} data-testid="landing-needs">
      <PanelHead
        icon={<IconBox />}
        title="Banco de recursos"
        text="Alimento, medicamentos e insumos que las organizaciones registran como necesidad."
      />
      {!resources ? (
        <EmptyState title="Muy pronto">
          Aquí verás lo que piden los refugios y podrás ofrecer alimento o insumos.
        </EmptyState>
      ) : status === 'loading' ? (
        <SkeletonRows label="Cargando necesidades" />
      ) : items.length === 0 ? (
        <EmptyState
          title={
            status === 'error'
              ? 'No pudimos traer las necesidades'
              : 'Hoy no hay necesidades abiertas'
          }
        >
          Cuando una organización registre una necesidad, aparece aquí y en el banco de recursos.
        </EmptyState>
      ) : (
        <ul className={styles.list}>
          {items.map((need, index) => {
            const percent = Math.round(Math.min(Math.max(need.progress, 0), 1) * 100);
            return (
              <li key={need.id} style={{ '--i': index } as CSSProperties}>
                <Link to={publicResourceNeedHref(need.id)} className={styles.row}>
                  <span className={styles.row__chip}>{CATEGORY_LABELS[need.category]}</span>
                  <span className={styles.row__title}>{need.title}</span>
                  <span className={styles.row__meta}>{need.organizationName}</span>
                  <span className={styles.progress} aria-hidden="true">
                    <span
                      className={styles.progress__bar}
                      style={{ '--p': percent / 100 } as CSSProperties}
                    />
                  </span>
                  <span className={styles.row__meta}>
                    {need.quantityFulfilled} de {need.quantityNeeded} {need.unit} · {percent}%
                    cubierto
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {resources ? (
        <Link to="/recursos" className={styles.panel__link}>
          Ver el banco de recursos
          <IconArrowRight aria-hidden="true" />
        </Link>
      ) : null}
    </article>
  );
}

function VolunteeringPanel({ near }: { near: boolean }) {
  const { status, items } = useLazyList<VolunteerOpportunityPublic>(near, listVolunteering);

  return (
    <article className={cn(styles.panel, 'af-reveal')} data-testid="landing-volunteering">
      <PanelHead
        icon={<IconPeople />}
        title="Voluntariados disponibles"
        text="Jornadas abiertas de las organizaciones. Algunas cuentan como servicio social."
      />
      {status === 'loading' ? (
        <SkeletonRows label="Cargando voluntariados" />
      ) : items.length === 0 ? (
        <EmptyState
          title={
            status === 'error'
              ? 'No pudimos traer los voluntariados'
              : 'Hoy no hay voluntariados abiertos'
          }
        >
          Las jornadas nuevas aparecen aquí en cuanto una organización las publique.
        </EmptyState>
      ) : (
        <ul className={styles.list}>
          {items.map((opportunity, index) => (
            <li key={opportunity.id} style={{ '--i': index } as CSSProperties}>
              {/* Inscribirse pide cuenta: /voluntariado lleva al ingreso y vuelve. */}
              <Link to="/voluntariado" className={styles.row}>
                {opportunity.appliesToStudentService ? (
                  <span className={styles.row__chip}>Servicio social</span>
                ) : (
                  <span className={styles.row__chip}>{opportunity.category}</span>
                )}
                <span className={styles.row__title}>{opportunity.title}</span>
                <span className={styles.row__meta}>
                  {opportunity.organizationName} · {opportunity.location}
                </span>
                <span className={styles.row__meta}>
                  {shortDate(opportunity.startDate)} al {shortDate(opportunity.endDate)}
                  {typeof opportunity.capacity === 'number'
                    ? ` · ${opportunity.capacity} cupos`
                    : ''}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Link to="/voluntariado" className={styles.panel__link}>
        Inscribirme como voluntario
        <IconArrowRight aria-hidden="true" />
      </Link>
    </article>
  );
}

/**
 * "Lo que piden los refugios": necesidades del banco de recursos (M09, solo
 * con su módulo encendido) y voluntariados abiertos (M08), con datos reales
 * del catálogo público. Cargando muestra esqueletos; sin datos, un mensaje
 * claro — nunca una tarjeta inventada.
 */
export function NetworkNeedsSection() {
  const [ref, near] = useNearViewport<HTMLElement>();
  return (
    <section
      ref={ref}
      id="necesidades"
      className={styles.section}
      aria-labelledby="landing-needs-title"
    >
      <div className={styles.container}>
        <div className={styles.head}>
          <p className={styles.eyebrow}>Necesidades reales, hoy</p>
          <h2 id="landing-needs-title" className={styles.head__title}>
            Lo que piden los refugios
          </h2>
          <p className={styles.head__lead}>
            Cada organización registra lo que le falta. Tú eliges cómo ayudar: con insumos o con tu
            tiempo.
          </p>
        </div>
        <div className={styles.board}>
          <NeedsPanel near={near} />
          <VolunteeringPanel near={near} />
        </div>
      </div>
    </section>
  );
}

interface GuideTeaser {
  slug: string;
  title: string;
  description: string;
}

/**
 * Guías (SEO): cada una enlaza a su página `/guias/:slug`, que el prerender ya
 * sirve como HTML estático con su JSON-LD. El texto llega en un chunk aparte
 * para no sumar las guías completas a la primera carga.
 */
export function GuidesSection() {
  const [ref, near] = useNearViewport<HTMLElement>();
  const [guides, setGuides] = useState<GuideTeaser[] | null>(null);
  useEffect(() => {
    if (!near) return;
    let active = true;
    import('../../../seo/guides')
      .then(({ GUIDES }) => {
        if (active) {
          setGuides(GUIDES.map(({ slug, title, description }) => ({ slug, title, description })));
        }
      })
      .catch(() => {
        if (active) setGuides([]);
      });
    return () => {
      active = false;
    };
  }, [near]);

  return (
    <section
      ref={ref}
      id="guias"
      className={cn(styles.section, styles['section--tint'])}
      aria-labelledby="landing-guides-title"
      data-testid="landing-guides"
    >
      <div className={styles.container}>
        <div className={cn(styles.head, styles['head--row'])}>
          <div>
            <p className={styles.eyebrow}>Guías gratuitas</p>
            <h2 id="landing-guides-title" className={styles.head__title}>
              Antes y después de adoptar
            </h2>
          </div>
          <Link to="/guias" className={styles.panel__link}>
            Ver todas las guías
            <IconArrowRight aria-hidden="true" />
          </Link>
        </div>
        {guides === null ? (
          <SkeletonRows label="Cargando guías" />
        ) : guides.length === 0 ? (
          <EmptyState title="Las guías están en su página">
            <Link to="/guias">Abre las guías para adoptar</Link>.
          </EmptyState>
        ) : (
          <ul className={styles.guides}>
            {guides.map((guide, index) => (
              <li key={guide.slug} className="af-reveal" style={{ '--i': index } as CSSProperties}>
                <Link to={`/guias/${guide.slug}`} className={styles.guide}>
                  <span className={styles.guide__icon} aria-hidden="true">
                    <IconDocument />
                  </span>
                  <span className={styles.guide__title}>{guide.title}</span>
                  <span className={styles.guide__text}>{guide.description}</span>
                  <span className={styles.guide__more}>
                    Leer la guía
                    <IconArrowRight aria-hidden="true" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

interface LedgerSummaryRow {
  organization: PublicAnimalOrganizationSummary;
  totals: PublicLedgerPage['totals'];
}

/** Lee los totales del libro de cada organización (una por una, en paralelo). */
async function loadLedgers(
  organizations: PublicAnimalOrganizationSummary[],
  signal: AbortSignal,
): Promise<LedgerSummaryRow[]> {
  const results = await Promise.allSettled(
    organizations.map((organization) =>
      fetchPublicLedger(organization.slug, { limit: 1, signal }).then((page) => ({
        organization,
        totals: page.totals,
      })),
    ),
  );
  return results.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : []));
}

/**
 * Libro público (RF14) de todas las organizaciones de la red: no hay un
 * endpoint global, así que se resume el libro de cada organización con
 * animales publicados (totales reales, sin datos de donantes) y cada tarjeta
 * abre el libro completo en su portal.
 */
export function PublicLedgerSection({ snapshot }: { snapshot: CatalogSnapshot }) {
  const [ref, near] = useNearViewport<HTMLElement>();
  const organizations = snapshot.organizations.slice(0, LEDGER_ORGS);
  const orgKey = organizations.map((organization) => organization.slug).join('|');
  const ready = near && snapshot.status !== 'loading';
  const [state, setState] = useState<{ status: LoadStatus; rows: LedgerSummaryRow[] }>({
    status: 'loading',
    rows: [],
  });
  useEffect(() => {
    if (!ready) return;
    if (organizations.length === 0) {
      setState({ status: 'ready', rows: [] });
      return;
    }
    const controller = new AbortController();
    loadLedgers(organizations, controller.signal).then((rows) => {
      if (!controller.signal.aborted) setState({ status: 'ready', rows });
    });
    return () => controller.abort();
    // orgKey resume la lista: el arreglo cambia de identidad en cada render.
  }, [ready, orgKey]);

  return (
    <section
      ref={ref}
      id="transparencia"
      className={cn(styles.section, styles['section--ink'])}
      aria-labelledby="landing-ledger-title"
      data-testid="landing-ledger"
    >
      <div className={styles.container}>
        <div className={styles.ledger}>
          <div className={styles.ledger__intro}>
            <p className={cn(styles.eyebrow, styles['eyebrow--light'])}>Transparencia</p>
            <h2 id="landing-ledger-title" className={cn(styles.head__title, styles.light)}>
              Libro público de las organizaciones
            </h2>
            <p className={styles.ledger__lead}>
              Cada organización publica sus ingresos y gastos. Las donaciones en línea aprobadas
              entran solas y nada se borra: un registro solo se anula con su motivo y sigue a la
              vista.
            </p>
            <ul className={styles.ledger__facts}>
              <li>
                <IconShield aria-hidden="true" /> Sin datos de los donantes
              </li>
              <li>
                <IconDocument aria-hidden="true" /> Los soportes quedan en privado
              </li>
            </ul>
          </div>
          {state.status === 'loading' ? (
            <SkeletonRows label="Cargando libros públicos" />
          ) : state.rows.length === 0 ? (
            <div className={styles['empty--dark']}>
              <EmptyState title="Todavía no hay libros para mostrar">
                Cuando las organizaciones publiquen animales y movimientos, sus libros aparecen
                aquí.
              </EmptyState>
            </div>
          ) : (
            <ul className={styles.books}>
              {state.rows.map(({ organization, totals }, index) => (
                <li key={organization.id} style={{ '--i': index } as CSSProperties}>
                  <Link
                    to={`/o/${encodeURIComponent(organization.slug)}#portal-section-public-ledger`}
                    className={styles.book}
                  >
                    <span className={styles.book__name}>{organization.name}</span>
                    {organization.city ? (
                      <span className={styles.book__meta}>{organization.city}</span>
                    ) : null}
                    {totals.entryCount > 0 ? (
                      <dl className={styles.book__totals}>
                        <div>
                          <dt>Ingresos</dt>
                          <dd>{formatCop(totals.incomeCop)}</dd>
                        </div>
                        <div>
                          <dt>Gastos</dt>
                          <dd>{formatCop(totals.expenseCop)}</dd>
                        </div>
                      </dl>
                    ) : (
                      <span className={styles.book__meta}>Aún sin movimientos registrados</span>
                    )}
                    <span className={styles.book__more}>
                      Ver su libro
                      <IconArrowRight aria-hidden="true" />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
