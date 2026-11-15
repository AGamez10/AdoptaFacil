import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  ReminderStatus,
  Role,
  type ClinicalReminder,
  type OrganizationDashboardSummary,
  type PendingItemKey,
  type PendingItemRead,
  type UserNotification,
  type UserNotificationsPage,
} from '@adoptafacil/contracts';
import { Badge, cn } from '@adoptafacil/ui';
import { DATA_CHANGED_EVENT, useApiClient } from '../api';
import { useSession } from '../auth';
import { fetchOrgSummary } from '../../features/_layout/api/dashboard-api';
import { deriveActionItems } from '../../features/_layout/model/action-items';
import { BellIcon } from '../icons';
import styles from './pending-bell.module.scss';

/** Mismos roles que `GET /clinical-reminders` (ANIMAL_VIEW_ROLES, nav-items.ts). */
const REMINDER_ROLES = [
  Role.Owner,
  Role.Administrator,
  Role.Operator,
  Role.Veterinarian,
  Role.ReadOnlyAuditor,
] as const;
/** Mismos roles que `GET /org/summary` (OrganizationSummaryController.VIEW_ROLES). */
const SUMMARY_ROLES = [Role.Owner, Role.Administrator, Role.Operator] as const;

const POLL_MS = 5 * 60 * 1000;
/** Los avisos personales se consultan más seguido: son los que mueven a la gente. */
const INBOX_POLL_MS = 60 * 1000;
const MAX_INBOX_LISTED = 8;
const MAX_LISTED = 5;
/** Espera tras una escritura antes de recontar (deja terminar la cadena). */
const DATA_CHANGED_DEBOUNCE_MS = 400;
const KUDOS_MS = 7000;

/**
 * Ola 3: mensaje de reconocimiento cuando un pendiente desaparece. Texto fijo
 * y determinista (sin IA), en tono cálido.
 */
export function kudosMessage(resolved: number, remaining: number): string {
  if (remaining === 0) {
    return '¡Todo al día! Gracias por ser tan diligente: así más animales encuentran hogar.';
  }
  return resolved === 1
    ? '¡Bien hecho! Atendiste un pendiente. Gracias por cuidar cada detalle.'
    : `¡Bien hecho! Atendiste ${resolved} pendientes. Gracias por cuidar cada detalle.`;
}

const REMINDER_TYPE_LABELS: Record<string, string> = {
  vaccine: 'Vacuna',
  treatment: 'Tratamiento',
  surgery: 'Cirugía',
  sterilization: 'Esterilización',
  allergy: 'Alergia',
  disability: 'Incapacidad',
  medication: 'Medicamento',
  diagnosis: 'Diagnóstico',
};

function formatDue(iso: string): string {
  return new Date(iso).toLocaleDateString('es-CO', {
    timeZone: 'America/Bogota',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/** Respuesta de `/me/notifications` normalizada (API anterior o fallo = vacío). */
export function normalizeInbox(data: unknown): UserNotificationsPage {
  const page = (data ?? {}) as Partial<UserNotificationsPage>;
  const items = Array.isArray(page.items) ? page.items : [];
  const unread =
    typeof page.unread === 'number' ? page.unread : items.filter((n) => !n.read).length;
  return { items, unread };
}

/** "hace 5 min", "hace 3 h", "12 nov." (hora Colombia). */
export function timeAgo(iso: string, now: number = Date.now()): string {
  const diff = Math.max(0, now - new Date(iso).getTime());
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return 'ahora';
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  return new Date(iso).toLocaleDateString('es-CO', {
    timeZone: 'America/Bogota',
    day: 'numeric',
    month: 'short',
  });
}

const isOpen = (reminder: ClinicalReminder): boolean =>
  reminder.status !== ReminderStatus.Acknowledged && reminder.status !== ReminderStatus.Dismissed;

const reminderKey = (reminder: ClinicalReminder): PendingItemKey => `reminder:${reminder.id}`;

/** Desde cuándo existe lo más reciente de un aviso agregado (null = sin dato). */
function sinceOf(key: string, summary: OrganizationDashboardSummary): string | null {
  if (key === 'adoptions') return summary.adoptionRequestsNewSince ?? null;
  if (key === 'expiring') return summary.documentsExpiringSoonSince ?? null;
  if (key === 'rejected') return summary.documentsRejectedSince ?? null;
  return null;
}

/**
 * Un aviso leído deja de contar mientras no llegue nada nuevo: si se marcó
 * después de lo más reciente que lo origina, sigue oculto; si después llegó
 * otra solicitud u otro rechazo, vuelve a aparecer. Sin fecha de origen
 * (API anterior), la marca basta.
 */
export function isUnread(readAt: string | undefined, since: string | null): boolean {
  if (!readAt) return true;
  if (!since) return false;
  return new Date(since).getTime() > new Date(readAt).getTime();
}

/**
 * Campana de pendientes del encabezado (Inicio): muestra cuántos recordatorios
 * de salud abiertos (vacunas, tratamientos) y acciones por revisar (solicitudes
 * de adopción, documentos por vencer/rechazados) tiene la organización, y al
 * hacer clic los lista con enlace a su pantalla. Cada aviso se puede marcar
 * como leído (al abrirlo o con su botón) y sale del contador de esa persona;
 * reaparece solo si llega algo nuevo (`isUnread`).
 *
 * Solo consulta lo que el rol puede ver (mismos roles que el backend): un rol sin
 * acceso a ninguno de los dos no ve la campana ni dispara consultas. Fallos de
 * red son silenciosos (sin contador), nunca rompen el encabezado.
 */
export function PendingBell() {
  const client = useApiClient();
  const { hasAnyRole, user } = useSession();
  const canSeeReminders = hasAnyRole(...REMINDER_ROLES);
  const canSeeSummary = hasAnyRole(...SUMMARY_ROLES);
  const canSeePending = canSeeReminders || canSeeSummary;
  /** Todas las cuentas con sesión tienen bandeja de avisos personales. */
  const hasInbox = Boolean(user);
  const enabled = hasInbox || canSeePending;

  const [reminders, setReminders] = useState<ClinicalReminder[]>([]);
  const [summary, setSummary] = useState<OrganizationDashboardSummary | null>(null);
  const [reads, setReads] = useState<Record<string, string>>({});
  const [inbox, setInbox] = useState<UserNotification[]>([]);
  const [inboxUnread, setInboxUnread] = useState(0);
  /** Avisos de reconocimiento ya mostrados (no se repiten al recargar). */
  const seenKudosRef = useRef<Set<string> | null>(null);
  const [open, setOpen] = useState(false);
  const [kudos, setKudos] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  /** Total del último conteo; null hasta la primera carga (no felicita al entrar). */
  const lastTotalRef = useRef<number | null>(null);
  /** Avisos que la persona acaba de marcar como leídos: bajan el contador pero
   *  no son pendientes atendidos, así que no merecen felicitación. */
  const justMarkedRef = useRef(0);
  const location = useLocation();

  const loadInbox = useCallback(async () => {
    if (!hasInbox) return;
    try {
      const page = normalizeInbox(await client.request<UserNotificationsPage>('/me/notifications'));
      setInbox(page.items);
      setInboxUnread(page.unread);
      // Reconocimiento: un aviso `kudos` nuevo y sin leer se celebra una vez
      // (en la primera carga solo se registran, no se celebran).
      const kudosItems = page.items.filter((n) => n.tone === 'kudos' && !n.read);
      if (seenKudosRef.current === null) {
        seenKudosRef.current = new Set(kudosItems.map((n) => n.id));
      } else {
        const fresh = kudosItems.find((n) => !seenKudosRef.current?.has(n.id));
        kudosItems.forEach((n) => seenKudosRef.current?.add(n.id));
        if (fresh) setKudos(fresh.title);
      }
    } catch {
      // Silencioso: la campana nunca rompe el encabezado.
    }
  }, [client, hasInbox]);

  const load = useCallback(async () => {
    const tasks: Promise<void>[] = [loadInbox()];
    if (canSeeReminders) {
      tasks.push(
        client
          .request<ClinicalReminder[]>('/clinical-reminders')
          .then((list) => setReminders(Array.isArray(list) ? list : []))
          .catch(() => undefined),
      );
    }
    if (canSeeSummary) {
      tasks.push(
        fetchOrgSummary(client)
          .then((data) => setSummary(data))
          .catch(() => undefined),
      );
    }
    if (canSeePending) {
      tasks.push(
        client
          .request<PendingItemRead[]>('/org/pending-reads')
          .then((list) =>
            setReads(
              Object.fromEntries((Array.isArray(list) ? list : []).map((r) => [r.key, r.readAt])),
            ),
          )
          .catch(() => undefined),
      );
    }
    await Promise.all(tasks);
    setLoaded(true);
  }, [client, canSeeReminders, canSeeSummary, canSeePending, loadInbox]);

  useEffect(() => {
    if (!enabled) return;
    void load();
    const timer = window.setInterval(() => void load(), POLL_MS);
    return () => window.clearInterval(timer);
  }, [load, enabled]);

  useEffect(() => {
    if (!hasInbox) return;
    const timer = window.setInterval(() => void loadInbox(), INBOX_POLL_MS);
    return () => window.clearInterval(timer);
  }, [loadInbox, hasInbox]);

  // Ola 3: antes el conteo solo se refrescaba al abrir la campana o cada 5
  // minutos, así que un pendiente atendido seguía ahí. Ahora se recuenta tras
  // cada escritura exitosa, al cambiar de página y al volver a la pestaña.
  useEffect(() => {
    if (!enabled) return;
    let pending: number | undefined;
    const schedule = () => {
      window.clearTimeout(pending);
      pending = window.setTimeout(() => void load(), DATA_CHANGED_DEBOUNCE_MS);
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') schedule();
    };
    window.addEventListener(DATA_CHANGED_EVENT, schedule);
    window.addEventListener('focus', schedule);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearTimeout(pending);
      window.removeEventListener(DATA_CHANGED_EVENT, schedule);
      window.removeEventListener('focus', schedule);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [load, enabled]);

  const isFirstLocation = useRef(true);
  useEffect(() => {
    if (isFirstLocation.current) {
      isFirstLocation.current = false;
      return;
    }
    if (enabled) void load();
  }, [location.pathname, load, enabled]);

  // Cierra con Escape o al hacer clic fuera.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    const onPointerDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onPointerDown);
    };
  }, [open]);

  const openReminders = reminders
    .filter(isOpen)
    .filter((r) => isUnread(reads[reminderKey(r)], null))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const actions = summary
    ? deriveActionItems(summary).filter((item) =>
        isUnread(reads[item.key], sinceOf(item.key, summary)),
      )
    : [];
  const pendingTotal = openReminders.length + actions.length;
  const total = pendingTotal + inboxUnread;
  const badge = total > 9 ? '9+' : String(total);

  // Ola 3: cuando el total baja, se reconoce al usuario por atenderlo.
  useEffect(() => {
    if (!loaded) return;
    const previous = lastTotalRef.current;
    lastTotalRef.current = pendingTotal;
    const resolved = previous === null ? 0 : previous - pendingTotal - justMarkedRef.current;
    justMarkedRef.current = 0;
    if (resolved > 0) setKudos(kudosMessage(resolved, pendingTotal));
  }, [loaded, pendingTotal]);

  useEffect(() => {
    if (!kudos) return;
    const timer = window.setTimeout(() => setKudos(null), KUDOS_MS);
    return () => window.clearTimeout(timer);
  }, [kudos]);

  if (!enabled) return null;

  /** Marca avisos personales como leídos (al instante en pantalla). */
  const markInboxRead = (ids: string[] | 'all') => {
    const targets = ids === 'all' ? inbox.filter((n) => !n.read).map((n) => n.id) : ids;
    if (ids !== 'all' && targets.length === 0) return;
    const unreadTargets = inbox.filter((n) => !n.read && targets.includes(n.id)).length;
    setInbox((current) =>
      current.map((n) => (ids === 'all' || targets.includes(n.id) ? { ...n, read: true } : n)),
    );
    setInboxUnread((count) => (ids === 'all' ? 0 : Math.max(0, count - unreadTargets)));
    void client
      .request('/me/notifications/read', {
        method: 'POST',
        json: ids === 'all' ? { all: true } : { ids: targets },
      })
      .catch(() => undefined);
  };

  /** Saca los avisos del contador al instante y guarda la marca en el servidor. */
  const markRead = (keys: PendingItemKey[]) => {
    if (keys.length === 0 || !canSeePending) return;
    const now = new Date().toISOString();
    justMarkedRef.current += keys.length;
    setReads((current) => ({ ...current, ...Object.fromEntries(keys.map((k) => [k, now])) }));
    void client
      .request<PendingItemRead[]>('/org/pending-reads', {
        method: 'POST',
        json: { keys },
      })
      .catch(() => undefined);
  };

  const allKeys: PendingItemKey[] = [
    ...actions.map((item) => item.key as PendingItemKey),
    ...openReminders.slice(0, MAX_LISTED).map(reminderKey),
  ];

  const toggle = () => {
    setOpen((value) => {
      if (!value) void load(); // al abrir, refresca
      return !value;
    });
  };

  return (
    <div className={styles.bell} ref={rootRef}>
      <button
        type="button"
        className={styles.bell__button}
        onClick={toggle}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={
          total > 0 ? `Avisos y pendientes: ${total} sin leer` : 'Avisos: nada nuevo por revisar'
        }
        data-testid="pending-bell"
      >
        <BellIcon className="h-5 w-5" />
        {total > 0 && (
          <span className={styles.bell__badge} data-testid="pending-bell-count">
            {badge}
          </span>
        )}
      </button>

      {kudos && !open && (
        <div role="status" className={styles.bell__kudos} data-testid="pending-bell-kudos">
          <span aria-hidden="true" className={styles.bell__kudosIcon}>
            ★
          </span>
          <span>{kudos}</span>
          <button
            type="button"
            className={styles.bell__kudosClose}
            onClick={() => setKudos(null)}
            aria-label="Cerrar mensaje"
          >
            ×
          </button>
        </div>
      )}

      {open && (
        <div
          role="dialog"
          aria-label="Avisos, recordatorios y acciones pendientes"
          className={styles.bell__panel}
          data-testid="pending-bell-panel"
        >
          <div className={styles.bell__head}>
            <p className={styles.bell__title}>{canSeePending ? 'Avisos y pendientes' : 'Avisos'}</p>
            {total > 0 && (
              <button
                type="button"
                className={styles.bell__markAll}
                onClick={() => {
                  markRead(allKeys);
                  if (inboxUnread > 0) markInboxRead('all');
                }}
                data-testid="pending-bell-mark-all"
              >
                Marcar todas como leídas
              </button>
            )}
          </div>

          {total === 0 && inbox.length === 0 && (
            <p className={styles.bell__empty}>
              {canSeePending
                ? 'Todo al día. Aquí te avisamos de ofertas, inscripciones y solicitudes nuevas, documentos por vencer o rechazados y próximas vacunas o tratamientos.'
                : 'Todo al día. Aquí te avisamos cuando una organización responda tus ofertas, solicitudes o inscripciones, y cuando reconozcan lo que haces.'}
            </p>
          )}
          {total === 0 && inbox.length > 0 && <p className={styles.bell__empty}>Todo al día.</p>}

          {inbox.length > 0 && (
            <section aria-label="Avisos" data-testid="pending-bell-inbox">
              <p className={styles.bell__section}>Avisos</p>
              <ul className={styles.bell__list}>
                {inbox.slice(0, MAX_INBOX_LISTED).map((notice) => (
                  <li
                    key={notice.id}
                    className={cn(
                      styles.bell__item,
                      notice.read && styles['bell__item--read'],
                      notice.tone === 'kudos' && styles['bell__item--kudos'],
                    )}
                    data-testid="pending-bell-notice"
                  >
                    <span className={styles.bell__row}>
                      <span className={styles.bell__itemTitle}>
                        {notice.tone === 'kudos' && (
                          <span aria-hidden="true" className={styles.bell__star}>
                            ★{' '}
                          </span>
                        )}
                        {notice.title}
                      </span>
                    </span>
                    {notice.body && <span className={styles.bell__meta}>{notice.body}</span>}
                    <span className={styles.bell__row}>
                      {notice.href ? (
                        <Link
                          to={notice.href}
                          onClick={() => {
                            markInboxRead([notice.id]);
                            setOpen(false);
                          }}
                          className={styles.bell__link}
                        >
                          Ver →
                        </Link>
                      ) : (
                        <span />
                      )}
                      <span className={styles.bell__meta}>{timeAgo(notice.createdAt)}</span>
                      {!notice.read && (
                        <button
                          type="button"
                          className={styles.bell__read}
                          onClick={() => markInboxRead([notice.id])}
                          aria-label={`Marcar como leído: ${notice.title}`}
                        >
                          Marcar como leído
                        </button>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {actions.length > 0 && (
            <section aria-label="Acciones por revisar">
              <p className={styles.bell__section}>Acciones por revisar</p>
              <ul className={styles.bell__list}>
                {actions.map((item) => (
                  <li key={item.key} className={styles.bell__item}>
                    <span>{item.label}</span>
                    <span className={styles.bell__row}>
                      <Link
                        to={item.href}
                        onClick={() => {
                          markRead([item.key as PendingItemKey]);
                          setOpen(false);
                        }}
                        className={styles.bell__link}
                      >
                        {item.linkLabel} →
                      </Link>
                      <button
                        type="button"
                        className={styles.bell__read}
                        onClick={() => markRead([item.key as PendingItemKey])}
                        aria-label={`Marcar como leída: ${item.label}`}
                      >
                        Marcar como leída
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {openReminders.length > 0 && (
            <section aria-label="Recordatorios de salud">
              <p className={styles.bell__section}>Vacunas y tratamientos</p>
              <ul className={styles.bell__list}>
                {openReminders.slice(0, MAX_LISTED).map((reminder) => (
                  <li key={reminder.id} className={styles.bell__item}>
                    <span className={styles.bell__row}>
                      <span className={styles.bell__itemTitle}>
                        {REMINDER_TYPE_LABELS[reminder.type] ?? reminder.type}
                      </span>
                      {reminder.status === ReminderStatus.Failed && (
                        <Badge variant="destructive">Fallo de envío</Badge>
                      )}
                    </span>
                    <span className={cn(styles.bell__meta)}>
                      Fecha: {formatDue(reminder.dueDate)}
                    </span>
                    <span className={styles.bell__row}>
                      <Link
                        to={`/animales/${reminder.animalId}`}
                        onClick={() => {
                          markRead([reminderKey(reminder)]);
                          setOpen(false);
                        }}
                        className={styles.bell__link}
                      >
                        Ver animal →
                      </Link>
                      <button
                        type="button"
                        className={styles.bell__read}
                        onClick={() => markRead([reminderKey(reminder)])}
                        aria-label="Marcar como leída"
                      >
                        Marcar como leída
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {canSeeReminders && (
            <Link
              to="/recordatorios"
              onClick={() => setOpen(false)}
              className={styles.bell__all}
              data-testid="pending-bell-all"
            >
              Ver vacunas y tratamientos
              {openReminders.length > MAX_LISTED ? ` (${openReminders.length})` : ''} →
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
