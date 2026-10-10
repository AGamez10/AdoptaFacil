import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { cn } from '@adoptafacil/ui';
import { useSession } from '../../../shell/auth';
import { featureForPath, useCapabilities } from '../../../shell/capabilities';
import { navItems, ORG_MEMBER_ROLES, PLATFORM_DOCUMENTS_ROLES } from '../../../shell/navigation';
import {
  GUIDE_FLOWS,
  MAP_DESCRIPTIONS,
  PUBLIC_MAP,
  helpForPath,
  type GuideAudience,
  type GuideFlow,
  type MapEntry,
} from '../model/guide-content';
import { OfficialContactButtons } from './official-contact-buttons';
import styles from './guide-assistant.module.scss';

type Tab = 'page' | 'flows' | 'map';

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'page', label: 'En esta página' },
  { id: 'flows', label: 'Guías paso a paso' },
  { id: 'map', label: '¿A dónde voy?' },
];

/** Audiencias de la sesión actual (una cuenta de plataforma también es de org). */
function useAudiences(): Set<GuideAudience> {
  const { status, user, hasAnyRole } = useSession();
  return useMemo(() => {
    if (status !== 'authenticated' || !user) return new Set<GuideAudience>(['visitor']);
    const audiences = new Set<GuideAudience>();
    if (user.accountType === 'person') audiences.add('person');
    if (hasAnyRole(...ORG_MEMBER_ROLES)) audiences.add('org');
    if (hasAnyRole(...PLATFORM_DOCUMENTS_ROLES)) audiences.add('platform');
    if (audiences.size === 0) audiences.add('person');
    return audiences;
  }, [status, user, hasAnyRole]);
}

/** Mismo filtro que el menú lateral: rol, tipo de cuenta y módulo encendido. */
function useSiteMap(isVisitor: boolean): MapEntry[] {
  const { hasAnyRole, user } = useSession();
  const { capabilities } = useCapabilities();
  return useMemo(() => {
    const enabled = (path: string) => {
      const feature = featureForPath(path.split('#')[0] || '/');
      return !feature || capabilities.features[feature];
    };
    if (isVisitor) return PUBLIC_MAP.filter((entry) => enabled(entry.to));

    const entries: MapEntry[] = [];
    const seen = new Set<string>();
    const add = (to: string, label: string) => {
      if (seen.has(to)) return;
      seen.add(to);
      entries.push({ to, label, description: MAP_DESCRIPTIONS[to] });
    };
    if (hasAnyRole(...ORG_MEMBER_ROLES)) add('/organizacion', 'Mi organización');
    for (const item of navItems) {
      for (const leaf of item.children ?? [item]) {
        if (leaf.comingSoon || !enabled(leaf.path)) continue;
        if (leaf.roles && !hasAnyRole(...leaf.roles)) continue;
        if (leaf.personaOnly && user?.accountType !== 'person') continue;
        add(leaf.path, leaf.label);
      }
    }
    return entries;
  }, [isVisitor, capabilities, hasAnyRole, user]);
}

/**
 * Asistente de guía (Ola 3, R3-8; decisión D14). Un botón fijo "Ayuda" abre un
 * panel con tres vistas: ayuda de la página actual, guías paso a paso y el mapa
 * de lo que la cuenta puede hacer, más el contacto oficial por WhatsApp y
 * correo. Todo es contenido fijo elegido por la ruta, la sesión y los módulos
 * encendidos: no usa inteligencia artificial, no hace llamadas a la red y no
 * lee lo que la persona escribe en los formularios.
 */
export function GuideAssistant() {
  const location = useLocation();
  const audiences = useAudiences();
  const isVisitor = audiences.has('visitor');
  const { hasAnyRole } = useSession();
  const siteMap = useSiteMap(isVisitor);

  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('page');
  const [flowId, setFlowId] = useState<string | null>(null);
  const panelId = useId();
  const titleId = useId();
  const toggleRef = useRef<HTMLButtonElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);

  const pageHelp = helpForPath(location.pathname);
  const flows = useMemo(
    () =>
      GUIDE_FLOWS.filter(
        (flow) =>
          flow.audiences.some((audience) => audiences.has(audience)) &&
          (!flow.roles || hasAnyRole(...flow.roles)),
      ),
    [audiences, hasAnyRole],
  );
  const activeFlow: GuideFlow | undefined = flows.find((flow) => flow.id === flowId);

  // Cambiar de página cierra el panel: la ayuda que mostraba ya no aplica.
  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!open) return;
    titleRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        toggleRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const close = () => {
    setOpen(false);
    toggleRef.current?.focus();
  };

  return (
    <div className={styles.assistant}>
      {open && (
        <section
          id={panelId}
          role="dialog"
          aria-modal="false"
          aria-labelledby={titleId}
          className={styles.panel}
          data-testid="guide-panel"
        >
          <header className={styles.panel__header}>
            <h2 id={titleId} ref={titleRef} tabIndex={-1} className={styles.panel__title}>
              ¿En qué te ayudo?
            </h2>
            <button
              type="button"
              className={styles.panel__close}
              onClick={close}
              aria-label="Cerrar ayuda"
            >
              <span aria-hidden="true">×</span>
            </button>
          </header>

          <div className={styles.tabs} role="group" aria-label="Tipo de ayuda">
            {TABS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={cn(styles.tab, tab === item.id && styles['tab--active'])}
                aria-pressed={tab === item.id}
                onClick={() => {
                  setTab(item.id);
                  setFlowId(null);
                }}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className={styles.panel__body}>
            {tab === 'page' && (
              <div data-testid="guide-page-help">
                <h3 className={styles.section__title}>{pageHelp.title}</h3>
                <ul className={styles.tips}>
                  {pageHelp.tips.map((tip) => (
                    <li key={tip}>{tip}</li>
                  ))}
                </ul>
              </div>
            )}

            {tab === 'flows' && !activeFlow && (
              <ul className={styles.flows} aria-label="Guías disponibles">
                {flows.map((flow) => (
                  <li key={flow.id}>
                    <button
                      type="button"
                      className={styles.flow}
                      onClick={() => setFlowId(flow.id)}
                    >
                      <span className={styles.flow__title}>{flow.title}</span>
                      <span className={styles.flow__summary}>{flow.summary}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {tab === 'flows' && activeFlow && (
              <div data-testid="guide-flow">
                <button type="button" className={styles.back} onClick={() => setFlowId(null)}>
                  ← Todas las guías
                </button>
                <h3 className={styles.section__title}>{activeFlow.title}</h3>
                <ol className={styles.steps}>
                  {activeFlow.steps.map((step, index) => (
                    <li key={step.text}>
                      <span className={styles.step__number} aria-hidden="true">
                        {index + 1}
                      </span>
                      <span>
                        {step.text}
                        {step.to && (
                          <>
                            {' '}
                            <Link to={step.to} className={styles.step__link}>
                              {step.linkLabel ?? 'Ir'}
                            </Link>
                          </>
                        )}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {tab === 'map' && (
              <ul className={styles.map} aria-label="Lugares a los que puedes ir">
                {siteMap.map((entry) => (
                  <li key={entry.to}>
                    <Link to={entry.to} className={styles.map__link}>
                      <span className={styles.flow__title}>{entry.label}</span>
                      {entry.description && (
                        <span className={styles.flow__summary}>{entry.description}</span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <footer className={styles.panel__footer}>
            <p>¿Prefieres hablar con una persona?</p>
            <OfficialContactButtons
              whatsappMessage="Hola, estoy usando AdoptaFácil y necesito ayuda."
              emailSubject="Necesito ayuda con AdoptaFácil"
            />
            <p className={styles.panel__note}>
              Esta guía no usa inteligencia artificial ni lee lo que escribes en los formularios:
              muestra ayuda fija según la página.
            </p>
          </footer>
        </section>
      )}

      <button
        ref={toggleRef}
        type="button"
        className={styles.toggle}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => (open ? close() : setOpen(true))}
        data-testid="guide-toggle"
      >
        <span aria-hidden="true" className={styles.toggle__icon}>
          ?
        </span>
        <span>{open ? 'Cerrar ayuda' : 'Ayuda'}</span>
      </button>
    </div>
  );
}
