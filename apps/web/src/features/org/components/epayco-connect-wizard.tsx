import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { EPAYCO_CUST_ID_PATTERN, type ConnectEpaycoAccountInput } from '@adoptafacil/contracts';
import { Button, buttonVariants, cn, Input, ProgressStepper, useToast } from '@adoptafacil/ui';
import { ApiError, useApiClient } from '../../../shell/api';
import { OFFICIAL_EMAIL, officialMailtoUrl, officialWhatsappUrl } from '../../../lib/contact';
import {
  clearEpaycoDraft,
  EPAYCO_CHECKLIST,
  EPAYCO_KEYS_LOCATION,
  EPAYCO_PROGRESS_STEPS,
  EPAYCO_REGISTER_URL,
  EPAYCO_TOTAL_PROGRESS_STEPS,
  progressIndexForStep,
  resumeStep,
  saveEpaycoDraft,
  type EpaycoAccountPath,
  type EpaycoChecklistId,
  type EpaycoConnectDraft,
  type EpaycoWizardStep,
} from '../lib/epayco-connect-draft';

const HELP_MESSAGE =
  'Hola, necesito ayuda para conectar la cuenta ePayco de mi refugio en AdoptaFácil.';

/** Mensajes de error en lenguaje claro, nunca el error crudo del servidor. */
export const EPAYCO_CONNECT_ERRORS = {
  conflict:
    'Esa cuenta ePayco ya está conectada a otra organización. Si crees que es un error, escríbenos.',
  custId:
    'ePayco no reconoce ese número de cliente. Revisa que sea el P_CUST_ID_CLIENTE de tu cuenta, solo con números.',
  publicKey: 'Revisa tu llave pública: cópiala completa desde ePayco, sin espacios.',
  secrets: 'Revisa tus llaves secretas: cópialas completas desde ePayco, sin espacios.',
  unavailable:
    'No pudimos conectar ahora. Tus datos no se perdieron; intenta de nuevo. Por seguridad, vuelve a pegar tus dos llaves secretas.',
} as const;

interface SubmitFailure {
  message: string;
  step: EpaycoWizardStep;
  showHelp?: boolean;
}

/**
 * 409 → la cuenta es de otra organización; 400 → el campo que falló según el
 * mensaje de validación (`custId: …`, `publicKey: …`); red/5xx/otro → reintentar.
 */
export function mapEpaycoConnectError(error: unknown): SubmitFailure {
  if (ApiError.is(error) && error.status === 409) {
    return { message: EPAYCO_CONNECT_ERRORS.conflict, step: 'cust-id', showHelp: true };
  }
  if (ApiError.is(error) && error.status === 400) {
    // El campo sale del cuerpo original (`details`): `message` ya es el texto amable.
    const raw = (error.details as { message?: unknown } | undefined)?.message;
    const detail = Array.isArray(raw) ? raw.join(' ') : typeof raw === 'string' ? raw : '';
    if (/custId\s*:/.test(detail))
      return { message: EPAYCO_CONNECT_ERRORS.custId, step: 'cust-id' };
    if (/publicKey\s*:/.test(detail)) {
      return { message: EPAYCO_CONNECT_ERRORS.publicKey, step: 'public-key' };
    }
    return { message: EPAYCO_CONNECT_ERRORS.secrets, step: 'secrets' };
  }
  return { message: EPAYCO_CONNECT_ERRORS.unavailable, step: 'secrets' };
}

function validateCustId(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return 'Escribe tu número de cliente para continuar.';
  if (!EPAYCO_CUST_ID_PATTERN.test(trimmed)) {
    return 'Solo debe tener números. Revisa que no se haya copiado una letra, un espacio o un símbolo.';
  }
  return null;
}

function validateKey(value: string, emptyMessage: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return emptyMessage;
  if (/\s/.test(trimmed)) return 'La llave no lleva espacios. Cópiala de nuevo desde ePayco.';
  return null;
}

function lastFour(value: string): string {
  return value.trim().slice(-4);
}

export interface EpaycoConnectWizardProps {
  /** Organización de la sesión: llave del borrador. Sin ella no se guarda avance. */
  orgId?: string;
  /** Borrador a retomar (solo datos no secretos). */
  draft: EpaycoConnectDraft | null;
  /** "Lo haré después" / "Guardar y seguir después": vuelve al resumen. */
  onPause: () => void;
  /** Conexión exitosa: el contenedor vuelve a consultar el estado. */
  onConnected: () => void;
}

/**
 * Asistente guiado para conectar la cuenta ePayco PROPIA de la organización
 * (ADR-PAG-002). Una pantalla por paso, en lenguaje claro, con "dónde lo
 * encuentro" en cada llave y la opción de pausar en cualquier momento.
 *
 * Seguridad: P_KEY y PRIVATE_KEY solo viven en el estado de este componente;
 * nunca van al borrador (ver `EpaycoConnectDraft`), nunca se prellenan, nunca
 * se registran, y se borran tras cada envío (exitoso o no), al pausar y al
 * salir del asistente.
 */
export function EpaycoConnectWizard({
  orgId,
  draft,
  onPause,
  onConnected,
}: EpaycoConnectWizardProps) {
  const client = useApiClient();
  const { toast } = useToast();
  const ids = useId();

  const [step, setStep] = useState<EpaycoWizardStep>(() => (draft ? resumeStep(draft) : 'start'));
  const [path, setPath] = useState<EpaycoAccountPath | null>(draft?.path ?? null);
  const [checklist, setChecklist] = useState<EpaycoChecklistId[]>(draft?.checklist ?? []);
  const [custId, setCustId] = useState(draft?.custId ?? '');
  const [publicKey, setPublicKey] = useState(draft?.publicKey ?? '');
  // Secretas: SIEMPRE empiezan vacías (nunca se prellenan desde un borrador).
  const [pKey, setPKey] = useState('');
  const [privateKey, setPrivateKey] = useState('');

  const [fieldError, setFieldError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<SubmitFailure | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const headingRef = useRef<HTMLHeadingElement>(null);

  // Accesibilidad: al cambiar de paso, el foco va al título del paso nuevo
  // (también al abrir el asistente, que se abre con un clic explícito).
  useEffect(() => {
    headingRef.current?.focus();
  }, [step]);

  // Autoguardado del avance NO secreto, en cuanto la persona eligió un camino.
  useEffect(() => {
    if (!path) return;
    saveEpaycoDraft(orgId, { step, path, checklist, custId, publicKey });
  }, [orgId, step, path, checklist, custId, publicKey]);

  const clearSecrets = () => {
    setPKey('');
    setPrivateKey('');
  };

  const goTo = (next: EpaycoWizardStep) => {
    setFieldError(null);
    setStep(next);
  };

  const pause = () => {
    clearSecrets();
    saveEpaycoDraft(orgId, { step, path, checklist, custId, publicKey });
    toast({
      title: 'Guardamos tu avance',
      description: 'Puedes continuar cuando quieras desde "Medios de pago".',
    });
    onPause();
  };

  const choosePath = (choice: EpaycoAccountPath) => {
    setPath(choice);
    goTo(choice === 'has-account' ? 'cust-id' : 'guide');
  };

  const toggleChecklist = (id: EpaycoChecklistId) =>
    setChecklist((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const continueFrom = (current: EpaycoWizardStep) => {
    if (current === 'cust-id') {
      const error = validateCustId(custId);
      if (error) return setFieldError(error);
      setCustId(custId.trim());
      return goTo('public-key');
    }
    if (current === 'public-key') {
      const error = validateKey(publicKey, 'Pega tu llave pública para continuar.');
      if (error) return setFieldError(error);
      setPublicKey(publicKey.trim());
      return goTo('secrets');
    }
    if (current === 'secrets') {
      const error =
        validateKey(pKey, 'Pega las dos llaves secretas para continuar.') ??
        validateKey(privateKey, 'Pega las dos llaves secretas para continuar.');
      if (error) return setFieldError(error);
      return goTo('review');
    }
  };

  const back = () => {
    setSubmitError(null);
    if (step === 'guide' || step === 'start') return goTo('start');
    if (step === 'cust-id') return goTo(path === 'has-account' ? 'start' : 'guide');
    if (step === 'public-key') return goTo('cust-id');
    if (step === 'secrets') return goTo('public-key');
    if (step === 'review') return goTo('secrets');
  };

  const submit = async () => {
    const payload: ConnectEpaycoAccountInput = {
      custId: custId.trim(),
      pKey: pKey.trim(),
      publicKey: publicKey.trim(),
      privateKey: privateKey.trim(),
    };
    setSubmitError(null);
    setSubmitting(true);
    try {
      await client.request('/org/epayco/connect', { method: 'PUT', json: payload });
      clearEpaycoDraft(orgId);
      toast({
        title: '¡Listo! Tu refugio ya puede recibir donaciones',
        description: 'El dinero llega directo a la cuenta ePayco de tu organización.',
      });
      onConnected();
    } catch (error) {
      const failure = mapEpaycoConnectError(error);
      setSubmitError(failure);
      if (failure.showHelp) setHelpOpen(true);
      setFieldError(null);
      setStep(failure.step);
    } finally {
      // Las llaves secretas no se quedan en memoria tras un envío, salió bien
      // o no (se vuelven a pegar desde ePayco).
      clearSecrets();
      setSubmitting(false);
    }
  };

  const progressIndex = progressIndexForStep(step);
  const headingId = `${ids}-heading`;
  const errorId = `${ids}-field-error`;

  const heading = (title: string) => (
    <h3
      id={headingId}
      ref={headingRef}
      tabIndex={-1}
      className="text-lg font-semibold text-foreground outline-none"
    >
      {title}
    </h3>
  );

  const fieldErrorNode = (
    <p id={errorId} aria-live="polite" className="min-h-[1.25rem] text-sm text-destructive">
      {fieldError ?? ''}
    </p>
  );

  const pauseLink = (
    <Button type="button" variant="ghost" size="sm" onClick={pause}>
      No lo tengo a la mano: guardar y seguir después
    </Button>
  );

  const nav = (primary: ReactNode, opts: { hideBack?: boolean } = {}) => (
    <div className="flex flex-wrap items-center gap-2 pt-2">
      {!opts.hideBack && (
        <Button type="button" variant="outline" onClick={back} disabled={submitting}>
          Atrás
        </Button>
      )}
      {primary}
    </div>
  );

  const textField = (opts: {
    id: string;
    label: string;
    value: string;
    onChange: (value: string) => void;
    secret?: boolean;
    numeric?: boolean;
    hint: ReactNode;
  }) => {
    const hintId = `${opts.id}-hint`;
    return (
      <div className="flex flex-col gap-1.5">
        <label htmlFor={opts.id} className="text-sm font-medium">
          {opts.label}
        </label>
        <Input
          id={opts.id}
          name={opts.id}
          type={opts.secret ? 'password' : 'text'}
          autoComplete="off"
          spellCheck={false}
          inputMode={opts.numeric ? 'numeric' : undefined}
          value={opts.value}
          onChange={(e) => {
            opts.onChange(e.target.value);
            setFieldError(null);
          }}
          aria-describedby={`${hintId} ${errorId}`}
          aria-invalid={fieldError ? true : undefined}
        />
        <div id={hintId} className="text-xs text-muted-foreground">
          {opts.hint}
        </div>
      </div>
    );
  };

  // Chequeo de formato en vivo (sin esperar a "Continuar").
  const custIdLiveError =
    step === 'cust-id' && custId.trim() && !EPAYCO_CUST_ID_PATTERN.test(custId.trim())
      ? 'Solo debe tener números.'
      : null;

  return (
    <section
      aria-labelledby={headingId}
      className="flex flex-col gap-4"
      data-testid="epayco-wizard"
    >
      <div className="flex flex-col gap-2">
        <p
          className="text-sm font-medium text-muted-foreground"
          data-testid="epayco-wizard-progress"
        >
          Paso {progressIndex + 1} de {EPAYCO_TOTAL_PROGRESS_STEPS} ·{' '}
          {EPAYCO_PROGRESS_STEPS[progressIndex].label}
        </p>
        <ProgressStepper
          aria-label="Progreso de la conexión"
          steps={EPAYCO_PROGRESS_STEPS.map((s) => ({ key: s.key, label: s.label }))}
          currentIndex={progressIndex}
        />
      </div>

      {submitError && (
        <div
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-foreground"
          data-testid="epayco-submit-error"
        >
          {submitError.message}
        </div>
      )}

      {step === 'start' && (
        <div className="flex flex-col gap-3">
          {heading('¿Tu refugio ya tiene cuenta en ePayco?')}
          <p className="text-sm text-muted-foreground">
            ePayco es la pasarela que recibe las donaciones (tarjeta, PSE, Nequi, Daviplata,
            efectivo) y le entrega el dinero directo a tu refugio. AdoptaFácil no recibe ni retiene
            ese dinero.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button type="button" onClick={() => choosePath('has-account')}>
              Sí, ya tengo
            </Button>
            <Button type="button" variant="outline" onClick={() => choosePath('no-account')}>
              No todavía
            </Button>
            <Button type="button" variant="outline" onClick={() => choosePath('unsure')}>
              No sé
            </Button>
          </div>
          <div>
            <Button type="button" variant="ghost" size="sm" onClick={onPause}>
              Volver
            </Button>
          </div>
        </div>
      )}

      {step === 'guide' && (
        <div className="flex flex-col gap-3">
          {heading('Abre la cuenta de tu refugio en ePayco')}
          <div className="flex flex-col gap-2 text-sm text-muted-foreground">
            <p>
              <strong className="text-foreground">Abrir la cuenta es gratis</strong> y se hace en la
              página de ePayco. Allí ePayco verifica la identidad de quien abre la cuenta: es una
              exigencia de ley para recibir dinero y la hacen ellos, no AdoptaFácil.
            </p>
            <p>
              <strong className="text-foreground">No necesitas ser fundación.</strong> Si tu refugio
              es informal, puedes abrirla como persona natural, a nombre de quien maneja el dinero
              del refugio.
            </p>
            {path === 'unsure' && (
              <p>
                ¿No sabes si ya tienen cuenta? Busca un correo de ePayco en el correo del refugio, o
                pregúntale a quien maneja las donaciones. Si la encuentras, toca “Ya tengo mi
                cuenta”.
              </p>
            )}
          </div>
          <fieldset className="flex flex-col gap-2 rounded-md border border-border p-3">
            <legend className="px-1 text-sm font-medium">Lo que normalmente te van a pedir</legend>
            {EPAYCO_CHECKLIST.map((item) => {
              const id = `${ids}-check-${item.id}`;
              return (
                <div key={item.id} className="flex items-start gap-2">
                  <input
                    id={id}
                    type="checkbox"
                    className="mt-1 h-4 w-4"
                    checked={checklist.includes(item.id)}
                    onChange={() => toggleChecklist(item.id)}
                  />
                  <label htmlFor={id} className="text-sm">
                    {item.label}
                  </label>
                </div>
              );
            })}
            <p className="text-xs text-muted-foreground">
              ePayco te dirá exactamente qué necesita según tu caso.
            </p>
          </fieldset>
          <div className="flex flex-wrap items-center gap-2">
            <a
              href={EPAYCO_REGISTER_URL}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(buttonVariants({ variant: 'outline' }))}
            >
              Abrir ePayco en otra pestaña
            </a>
            <Button type="button" onClick={pause}>
              Lo haré después
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Mientras tanto, todo lo demás de AdoptaFácil sigue funcionando: tu portal, tus animales
            y tus adopciones.
          </p>
          {nav(
            <Button type="button" variant="ghost" onClick={() => goTo('cust-id')}>
              Ya tengo mi cuenta: continuar
            </Button>,
          )}
        </div>
      )}

      {step === 'cust-id' && (
        <form
          className="flex flex-col gap-3"
          noValidate
          autoComplete="off"
          onSubmit={(e) => {
            e.preventDefault();
            continueFrom('cust-id');
          }}
        >
          {heading('Tu número de cliente')}
          <p className="text-sm text-muted-foreground">
            Es el número que identifica la cuenta de tu refugio en ePayco. Solo tiene números.
          </p>
          {textField({
            id: `${ids}-cust-id`,
            label: 'P_CUST_ID_CLIENTE',
            value: custId,
            onChange: setCustId,
            numeric: true,
            hint: (
              <>
                {EPAYCO_KEYS_LOCATION}. Aparece con el nombre <strong>P_CUST_ID_CLIENTE</strong>.
              </>
            ),
          })}
          {custIdLiveError && !fieldError && (
            <p className="text-xs text-destructive">{custIdLiveError}</p>
          )}
          {fieldErrorNode}
          {nav(<Button type="submit">Continuar</Button>)}
          <div>{pauseLink}</div>
        </form>
      )}

      {step === 'public-key' && (
        <form
          className="flex flex-col gap-3"
          noValidate
          autoComplete="off"
          onSubmit={(e) => {
            e.preventDefault();
            continueFrom('public-key');
          }}
        >
          {heading('Tu llave pública')}
          <p className="text-sm text-muted-foreground">
            Es un código largo que identifica tu cuenta ante ePayco. No es secreta.
          </p>
          {textField({
            id: `${ids}-public-key`,
            label: 'PUBLIC_KEY',
            value: publicKey,
            onChange: setPublicKey,
            hint: (
              <>
                {EPAYCO_KEYS_LOCATION}. Aparece como <strong>PUBLIC_KEY</strong>; cópiala completa.
              </>
            ),
          })}
          {fieldErrorNode}
          {nav(<Button type="submit">Continuar</Button>)}
          <div>{pauseLink}</div>
        </form>
      )}

      {step === 'secrets' && (
        <form
          className="flex flex-col gap-3"
          noValidate
          autoComplete="off"
          onSubmit={(e) => {
            e.preventDefault();
            continueFrom('secrets');
          }}
        >
          {heading('Tus dos llaves secretas')}
          <p className="text-sm text-muted-foreground">
            Con estas llaves ePayco confirma que cada pago es real. Se guardan cifradas y{' '}
            <strong className="text-foreground">nunca se vuelven a mostrar</strong>, ni a ti ni al
            equipo de AdoptaFácil. Tampoco se guardan en este navegador: si pausas, tendrás que
            pegarlas de nuevo.
          </p>
          {textField({
            id: `${ids}-p-key`,
            label: 'P_KEY',
            value: pKey,
            onChange: setPKey,
            secret: true,
            hint: <>{EPAYCO_KEYS_LOCATION}. Aparece como P_KEY.</>,
          })}
          {textField({
            id: `${ids}-private-key`,
            label: 'PRIVATE_KEY',
            value: privateKey,
            onChange: setPrivateKey,
            secret: true,
            hint: <>{EPAYCO_KEYS_LOCATION}. Aparece como PRIVATE_KEY.</>,
          })}
          {fieldErrorNode}
          {nav(<Button type="submit">Continuar</Button>)}
          <div>{pauseLink}</div>
        </form>
      )}

      {step === 'review' && (
        <div className="flex flex-col gap-3">
          {heading('Revisa y conecta')}
          <dl className="grid gap-2 rounded-md border border-border p-3 text-sm sm:grid-cols-[auto_1fr]">
            <dt className="text-muted-foreground">Número de cliente</dt>
            <dd className="font-mono" data-testid="epayco-review-cust-id">
              {custId.trim()}
            </dd>
            <dt className="text-muted-foreground">Llave pública</dt>
            <dd className="font-mono" data-testid="epayco-review-public-key">
              …{lastFour(publicKey)}
            </dd>
            <dt className="text-muted-foreground">Llaves secretas</dt>
            <dd>Listas para enviar (no se muestran)</dd>
          </dl>
          <p className="text-sm text-muted-foreground">
            Al conectar, las donaciones a tu refugio llegarán directo a esta cuenta de ePayco.
          </p>
          {nav(
            <Button type="button" onClick={() => void submit()} disabled={submitting}>
              {submitting ? 'Conectando…' : 'Conectar ePayco'}
            </Button>,
          )}
        </div>
      )}

      <div className="border-t border-border pt-3">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-expanded={helpOpen}
          onClick={() => setHelpOpen((open) => !open)}
        >
          Pedir ayuda a AdoptaFácil
        </Button>
        {helpOpen && (
          <div className="mt-2 flex flex-col gap-2 text-sm" data-testid="epayco-help">
            <p className="text-muted-foreground">
              Te acompañamos en el proceso. Escríbenos y cuéntanos en qué paso vas (nunca nos envíes
              tus llaves secretas).
            </p>
            <div className="flex flex-wrap gap-2">
              <a
                href={officialWhatsappUrl(HELP_MESSAGE)}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
              >
                Escribir por WhatsApp
              </a>
              <a
                href={officialMailtoUrl('Ayuda para conectar ePayco', HELP_MESSAGE)}
                className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
              >
                Escribir a {OFFICIAL_EMAIL}
              </a>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
