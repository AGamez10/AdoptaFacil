import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { cn } from '@adoptafacil/ui';
import { useSession } from '../../../shell/auth';
import { featureForPath, useCapabilities, useFeature } from '../../../shell/capabilities';
import { navItems, ORG_MEMBER_ROLES, PLATFORM_DOCUMENTS_ROLES } from '../../../shell/navigation';
import {
  GUIDE_FLOWS,
  MAP_DESCRIPTIONS,
  PUBLIC_MAP,
  helpForPath,
  type GuideAudience,
  type GuideFlow,
  type GuideLink,
  type MapEntry,
  type PageHelp,
} from '../model/guide-content';
import { useCurrentGuideContext, type GuideContext } from '../model/guide-context';
import {
  organizationContact,
  portalHelp,
  reportProblemUrl,
  templateDemoHelp,
} from '../model/context-help';
import { ContactButtons, OfficialContactButtons } from './official-contact-buttons';
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

/** Rutas que un visitante sin cuenta puede abrir (el resto lo manda a ingresar). */
const PUBLIC_PATH =
  /^\/($|#|adoptar|campanas|recursos|marketplace|servicios|register|login|guias|verificar)/;

/** Un enlace "Dónde se gestiona" solo se ofrece si la cuenta de verdad puede abrirlo. */
function useLinkFilter(isVisitor: boolean): (link: GuideLink) => boolean {
  const { hasAnyRole } = useSession();
  const { capabilities } = useCapabilities();
  return (link) => {
    const feature = featureForPath(link.to.split('#')[0] || '/');
    if (feature && !capabilities.features[feature]) return false;
    if (isVisitor) return !link.roles && PUBLIC_PATH.test(link.to);
    return !link.roles || hasAnyRole(...link.roles);
  };
}

function PageHelpView({ help, canOpen }: { help: PageHelp; canOpen: (l: GuideLink) => boolean }) {
  const related = (help.related ?? []).filter(canOpen);
  return (
    <div data-testid="guide-page-help">
      <h3 className={styles.section__title}>{help.title}</h3>
      <ul className={styles.tips}>
        {help.tips.map((tip) =>
          typeof tip === 'string' ? (
            <li key={tip}>{tip}</li>
          ) : (
            <li key={tip.text}>
              {tip.text}
              {tip.to && (
                <>
                  {' '}
                  <Link to={tip.to} className={styles.step__link}>
                    {tip.linkLabel ?? 'Ir'}
                  </Link>
                </>
              )}
            </li>
          ),
        )}
      </ul>
      {related.length > 0 && (
        <nav aria-label="Dónde se gestiona" className={styles.related}>
          <p className={styles.related__title}>Dónde se gestiona</p>
          <ul className={styles.related__list}>
            {related.map((link) => (
              <li key={link.to}>
                <Link to={link.to} className={styles.related__link}>
                  {link.label}
                  <span aria-hidden="true"> →</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </div>
  );
}

/**
 * Contacto dentro del portal de una organización: quien está aquí vino por
 * ella, así que WhatsApp y correo son los SUYOS. AdoptaFácil queda solo como
 * un enlace pequeño para reportar una falla de la página.
 */
function PortalContact({ context }: { context: Extract<GuideContext, { kind: 'portal' }> }) {
  const { organization, animalName } = context;
  const contact = organizationContact(organization, animalName);
  const hasContact = Boolean(contact.whatsapp || contact.email);
  return (
    <>
      {hasContact ? (
        <>
          <p>
            {animalName
              ? `¿Preguntas sobre ${animalName}? Escríbele a ${organization.name}.`
              : `¿Dudas sobre una adopción o una visita? Escríbele a ${organization.name}.`}
          </p>
          <ContactButtons
            whatsappHref={contact.whatsapp}
            emailHref={contact.email}
            whatsappLabel={`WhatsApp de ${organization.name}`}
            emailLabel="Correo de la organización"
          />
        </>
      ) : (
        <p data-testid="guide-org-no-contact">
          {organization.name} todavía no publicó WhatsApp ni correo.{' '}
          {animalName
            ? 'Envía tu solicitud desde esta ficha y la organización te contactará.'
            : 'Elige un animal y envía tu solicitud: la organización te contactará.'}
        </p>
      )}
      <p className={styles.panel__note}>
        ¿Algo de esta página no funciona?{' '}
        <a href={reportProblemUrl(organization.name)} className={styles.step__link}>
          Avísale a AdoptaFácil
        </a>
      </p>
    </>
  );
}

/**
 * Asistente de guía (Ola 3, R3-8; decisión D14). Un botón fijo "Ayuda" abre un
 * panel con tres vistas: ayuda de la página actual, guías paso a paso y el mapa
 * de lo que la cuenta puede hacer, más el contacto oficial por WhatsApp y
 * correo. Dentro del portal de una organización (o de una plantilla de
 * ejemplo) la página le pasa su contexto (`useGuideContext`): el botón se
 * vuelve discreto, la ayuda habla de esa página y el WhatsApp es el de la
 * organización. Todo es contenido fijo elegido por la ruta, la sesión y los módulos
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

  const context = useCurrentGuideContext();
  const payments = useFeature('payments');
  const sponsorships = useFeature('sponsorships');
  const canOpen = useLinkFilter(isVisitor);
  // Dentro de un portal o de una plantilla de ejemplo la ayuda se enfoca en
  // esa página: sin pestañas ni mapa de AdoptaFácil, y con un botón discreto.
  const focused = context !== null;
  const pageHelp =
    context?.kind === 'portal'
      ? portalHelp(context, { payments, sponsorships })
      : context?.kind === 'template-demo'
        ? templateDemoHelp(context.templateName)
        : helpForPath(location.pathname, audiences);
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
    <div className={cn(styles.assistant, focused && styles['assistant--subtle'])}>
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

          {!focused && (
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
          )}

          <div className={styles.panel__body}>
            {(focused || tab === 'page') && <PageHelpView help={pageHelp} canOpen={canOpen} />}

            {!focused && tab === 'flows' && !activeFlow && (
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

            {!focused && tab === 'flows' && activeFlow && (
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

            {!focused && tab === 'map' && (
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
            {context?.kind === 'portal' ? (
              <PortalContact context={context} />
            ) : (
              <>
                <p>
                  {context?.kind === 'template-demo'
                    ? '¿Dudas sobre las plantillas? Habla con el equipo de AdoptaFácil.'
                    : '¿Prefieres hablar con una persona?'}
                </p>
                <OfficialContactButtons
                  whatsappMessage={
                    context?.kind === 'template-demo'
                      ? `Hola, estoy viendo la plantilla ${context.templateName} de AdoptaFácil y tengo una pregunta.`
                      : 'Hola, estoy usando AdoptaFácil y necesito ayuda.'
                  }
                  emailSubject="Necesito ayuda con AdoptaFácil"
                />
              </>
            )}
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
        className={cn(styles.toggle, focused && styles['toggle--subtle'])}
        aria-expanded={open}
        aria-label={focused ? (open ? 'Cerrar ayuda' : 'Ayuda') : undefined}
        title={focused && !open ? 'Ayuda' : undefined}
        aria-controls={open ? panelId : undefined}
        onClick={() => (open ? close() : setOpen(true))}
        data-testid="guide-toggle"
      >
        <span aria-hidden="true" className={styles.toggle__icon}>
          ?
        </span>
        <span className={styles.toggle__label}>{open ? 'Cerrar ayuda' : 'Ayuda'}</span>
      </button>
    </div>
  );
}
