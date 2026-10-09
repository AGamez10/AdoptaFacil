import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  ReminderStatus,
  Role,
  type ClinicalReminder,
  type OrganizationDashboardSummary,
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

const isOpen = (reminder: ClinicalReminder): boolean =>
  reminder.status !== ReminderStatus.Acknowledged && reminder.status !== ReminderStatus.Dismissed;

/**
 * Campana de pendientes del encabezado (Inicio): muestra cuántos recordatorios
 * clínicos abiertos y acciones por revisar (solicitudes de adopción, documentos
 * por vencer/rechazados) tiene la organización, y al hacer clic los lista con
 * enlace a su pantalla. Reemplaza la entrada "Recordatorios" del menú lateral.
 *
 * Solo consulta lo que el rol puede ver (mismos roles que el backend): un rol sin
 * acceso a ninguno de los dos no ve la campana ni dispara consultas. Fallos de
 * red son silenciosos (sin contador), nunca rompen el encabezado.
 */
export function PendingBell() {
  const client = useApiClient();
  const { hasAnyRole } = useSession();
  const canSeeReminders = hasAnyRole(...REMINDER_ROLES);
  const canSeeSummary = hasAnyRole(...SUMMARY_ROLES);

  const [reminders, setReminders] = useState<ClinicalReminder[]>([]);
  const [summary, setSummary] = useState<OrganizationDashboardSummary | null>(null);
  const [open, setOpen] = useState(false);
  const [kudos, setKudos] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  /** Total del último conteo; null hasta la primera carga (no felicita al entrar). */
  const lastTotalRef = useRef<number | null>(null);
  const location = useLocation();

  const load = useCallback(async () => {
    const tasks: Promise<void>[] = [];
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
    await Promise.all(tasks);
    setLoaded(true);
  }, [client, canSeeReminders, canSeeSummary]);

  useEffect(() => {
    if (!canSeeReminders && !canSeeSummary) return;
    void load();
    const timer = window.setInterval(() => void load(), POLL_MS);
    return () => window.clearInterval(timer);
  }, [load, canSeeReminders, canSeeSummary]);

  // Ola 3: antes el conteo solo se refrescaba al abrir la campana o cada 5
  // minutos, así que un pendiente atendido seguía ahí. Ahora se recuenta tras
  // cada escritura exitosa, al cambiar de página y al volver a la pestaña.
  useEffect(() => {
    if (!canSeeReminders && !canSeeSummary) return;
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
  }, [load, canSeeReminders, canSeeSummary]);

  const isFirstLocation = useRef(true);
  useEffect(() => {
    if (isFirstLocation.current) {
      isFirstLocation.current = false;
      return;
    }
    if (canSeeReminders || canSeeSummary) void load();
  }, [location.pathname, load, canSeeReminders, canSeeSummary]);

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

  const openReminders = reminders.filter(isOpen).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const actions = summary ? deriveActionItems(summary) : [];
  const total = openReminders.length + actions.length;
  const badge = total > 9 ? '9+' : String(total);

  // Ola 3: cuando el total baja, se reconoce al usuario por atenderlo.
  useEffect(() => {
    if (!loaded) return;
    const previous = lastTotalRef.current;
    lastTotalRef.current = total;
    if (previous !== null && total < previous) setKudos(kudosMessage(previous - total, total));
  }, [loaded, total]);

  useEffect(() => {
    if (!kudos) return;
    const timer = window.setTimeout(() => setKudos(null), KUDOS_MS);
    return () => window.clearTimeout(timer);
  }, [kudos]);

  if (!canSeeReminders && !canSeeSummary) return null;

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
        aria-label={total > 0 ? `Pendientes: ${total} por revisar` : 'Pendientes: nada por revisar'}
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
          aria-label="Recordatorios y acciones pendientes"
          className={styles.bell__panel}
          data-testid="pending-bell-panel"
        >
          <p className={styles.bell__title}>Pendientes</p>

          {total === 0 && (
            <p className={styles.bell__empty}>Todo al día. No hay nada por revisar.</p>
          )}

          {actions.length > 0 && (
            <section aria-label="Acciones por revisar">
              <p className={styles.bell__section}>Acciones por revisar</p>
              <ul className={styles.bell__list}>
                {actions.map((item) => (
                  <li key={item.key} className={styles.bell__item}>
                    <span>{item.label}</span>
                    <Link
                      to={item.href}
                      onClick={() => setOpen(false)}
                      className={styles.bell__link}
                    >
                      {item.linkLabel} →
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {openReminders.length > 0 && (
            <section aria-label="Recordatorios clínicos">
              <p className={styles.bell__section}>Recordatorios</p>
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
                      Vence: {formatDue(reminder.dueDate)}
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
              Ver todos los recordatorios
              {openReminders.length > MAX_LISTED ? ` (${openReminders.length})` : ''} →
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
