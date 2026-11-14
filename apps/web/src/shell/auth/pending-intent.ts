import { safeReturnTo } from './return-to';

/**
 * Memoria de la intención de quien entra (donar, inscribirse a una jornada,
 * ofrecer algo, adoptar…) mientras inicia sesión o crea su cuenta.
 *
 * La ruta pedida ya viaja en `?returnTo=` o en `state.from`, pero eso se
 * pierde si la pestaña se recarga, si la persona pasa de "Iniciar sesión" a
 * "Crear cuenta" y vuelve, o si Google abre su ventana y el navegador
 * reconstruye la página. Por eso la pantalla de acceso la guarda aquí al
 * abrirse y, tras autenticarse, se toma (y se borra) una sola vez.
 *
 * `sessionStorage`: vive solo en esta pestaña y se borra al cerrarla. La ruta
 * se valida contra open redirect al guardarla Y al leerla, y caduca a las 2 h.
 * Si el navegador bloquea el almacenamiento, todo sigue funcionando con la
 * ruta de la URL (solo se pierde la memoria extra).
 */
const INTENT_KEY = 'af:pending-intent';
const WELCOME_KEY = 'af:welcome';
const TTL_MS = 2 * 60 * 60 * 1000;

export interface PendingIntent {
  /** Ruta interna a la que volver (con su query). */
  to: string;
  /** `state` de esa ruta (lo ya elegido: la donación, la jornada, la oferta). */
  state?: unknown;
}

interface StoredIntent extends PendingIntent {
  savedAt: number;
}

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

/** Solo datos planos sobreviven; un `state` que no se puede serializar se omite. */
function serializableState(state: unknown): unknown {
  if (state === undefined || state === null) return undefined;
  try {
    return JSON.parse(JSON.stringify(state)) as unknown;
  } catch {
    return undefined;
  }
}

export function savePendingIntent(intent: PendingIntent): void {
  const to = safeReturnTo(intent.to);
  if (!to) return;
  const value: StoredIntent = { to, state: serializableState(intent.state), savedAt: Date.now() };
  try {
    storage()?.setItem(INTENT_KEY, JSON.stringify(value));
  } catch {
    // Almacenamiento lleno o bloqueado: queda la ruta de la URL.
  }
}

export function peekPendingIntent(now = Date.now()): PendingIntent | null {
  try {
    const raw = storage()?.getItem(INTENT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredIntent>;
    const to = safeReturnTo(parsed.to);
    if (!to || typeof parsed.savedAt !== 'number' || now - parsed.savedAt > TTL_MS) {
      clearPendingIntent();
      return null;
    }
    return parsed.state === undefined ? { to } : { to, state: parsed.state };
  } catch {
    return null;
  }
}

/** Lee y borra la intención (se usa una sola vez, justo después de entrar). */
export function takePendingIntent(): PendingIntent | null {
  const intent = peekPendingIntent();
  clearPendingIntent();
  return intent;
}

export function clearPendingIntent(): void {
  try {
    storage()?.removeItem(INTENT_KEY);
  } catch {
    // nada que limpiar
  }
}

/** Aviso que se muestra una vez al terminar de entrar: bienvenida a quien
 *  acaba de crear su cuenta y, si venía a hacer algo, en qué seguimos. */
export interface WelcomeNote {
  isNew: boolean;
  /** Lo que iba a hacer, en palabras de la persona, si llegó con una intención. */
  intentLabel?: string | null;
}

export function markWelcome(note: WelcomeNote): void {
  try {
    storage()?.setItem(WELCOME_KEY, JSON.stringify(note));
  } catch {
    // sin almacenamiento no hay bienvenida, pero la cuenta funciona igual
  }
}

export function takeWelcome(): WelcomeNote | null {
  try {
    const raw = storage()?.getItem(WELCOME_KEY);
    if (!raw) return null;
    storage()?.removeItem(WELCOME_KEY);
    const parsed = JSON.parse(raw) as Partial<WelcomeNote>;
    return {
      isNew: parsed.isNew === true,
      intentLabel: typeof parsed.intentLabel === 'string' ? parsed.intentLabel.slice(0, 120) : null,
    };
  } catch {
    return null;
  }
}

/** Qué va a pasar en la ruta a la que se quiere volver, en palabras de la persona. */
const INTENT_LABELS: ReadonlyArray<readonly [RegExp, string]> = [
  [/^\/(donaciones|donar)(\/|$)|^\/o\/[^/]+\/donar/, 'donar a esta organización'],
  [/^\/(ofrecer|tengo-para-donar|mis-ofertas)(\/|$)/, 'ofrecer lo que tienes'],
  [/^\/recursos(\/|$)/, 'ayudar con lo que una organización necesita'],
  [/^\/(voluntariado|voluntariados)(\/|$)/, 'inscribirte a una jornada de voluntariado'],
  [/^\/(adoptar|adopciones|animales)(\/|$)/, 'solicitar la adopción de un animal'],
  [/^\/apadrinar(\/|$)/, 'apadrinar a un animal'],
  [/^\/campanas(\/|$)/, 'aportar a una campaña'],
  [/^\/comunidad(\/|$)/, 'participar en la comunidad'],
  [/^\/servicios(\/|$)/, 'contactar un servicio para tu mascota'],
  [/^\/marketplace(\/|$)/, 'comprar en la tienda solidaria'],
  [/^\/o\/[^/]+/, 'apoyar a esta organización'],
];

export function intentLabelFor(path: string | null | undefined): string | null {
  if (!path) return null;
  const pathname = path.split(/[?#]/)[0];
  if (pathname === '/' || pathname === '') return null;
  const match = INTENT_LABELS.find(([pattern]) => pattern.test(pathname));
  return match ? match[1] : 'seguir donde ibas';
}
