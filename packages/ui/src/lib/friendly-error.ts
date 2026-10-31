/**
 * Mensajes de error para la persona que usa AdoptaFácil, nunca para quien lo
 * programa. Todo error que llega a una alerta pasa por aquí:
 *
 *  - Si el servidor ya escribió un mensaje claro en español ("La fecha no puede
 *    ser futura."), se muestra tal cual (sin el prefijo técnico del campo).
 *  - Si es un mensaje técnico ("Cannot POST /public/…", "Failed to fetch",
 *    "Expected number, received string", un 500 en inglés…), se cambia por uno
 *    amable según lo que pasó (sin conexión, sin permiso, demasiados intentos…).
 *
 * Es la ÚNICA tabla de mensajes: la usa el cliente HTTP de la web y, como red
 * de seguridad, la propia alerta (`toast`) antes de pintar una descripción.
 */

export const GENERIC_ERROR_MESSAGE =
  'Algo no salió como esperábamos. Inténtalo de nuevo en unos minutos.';

export const NETWORK_ERROR_MESSAGE =
  'No pudimos conectarnos con AdoptaFácil. Revisa tu conexión a internet e inténtalo de nuevo.';

const STATUS_MESSAGES: Record<number, string> = {
  400: 'Revisa los datos que escribiste e inténtalo de nuevo.',
  401: 'Tu sesión terminó. Vuelve a iniciar sesión para continuar.',
  403: 'No tienes permiso para hacer esto. Si crees que es un error, habla con quien administra tu organización.',
  404: 'Esta opción no está disponible en este momento o lo que buscas ya no existe.',
  408: 'La conexión tardó demasiado. Inténtalo de nuevo.',
  409: 'Esto ya se había hecho o cambió mientras tanto. Recarga la página y revisa.',
  413: 'El archivo es demasiado pesado. Prueba con uno más liviano.',
  415: 'Ese tipo de archivo no se admite. Usa una foto (JPG o PNG) o un PDF.',
  422: 'Faltan datos o hay datos que no son válidos. Revisa el formulario.',
  429: 'Hiciste demasiados intentos seguidos. Espera unos minutos y vuelve a intentarlo.',
  500: 'Tuvimos un problema de nuestro lado. Inténtalo de nuevo en unos minutos.',
  502: 'Tuvimos un problema de nuestro lado. Inténtalo de nuevo en unos minutos.',
  503: 'AdoptaFácil está en mantenimiento o muy ocupado. Inténtalo de nuevo en unos minutos.',
  504: 'La conexión tardó demasiado. Inténtalo de nuevo en unos minutos.',
};

/** Mensaje amable para un código HTTP (0 = sin conexión). */
export function messageForStatus(status: number | undefined): string {
  if (status === 0) return NETWORK_ERROR_MESSAGE;
  if (status && STATUS_MESSAGES[status]) return STATUS_MESSAGES[status];
  if (status && status >= 500) return STATUS_MESSAGES[500];
  if (status && status >= 400) return STATUS_MESSAGES[400];
  return GENERIC_ERROR_MESSAGE;
}

// Señales inequívocas de un mensaje de máquina.
const TECHNICAL_PATTERNS: readonly RegExp[] = [
  /\bCannot (GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/i,
  /\b(TypeError|SyntaxError|ReferenceError|RangeError|AbortError)\b/,
  /\b[A-Z][A-Za-z]*(Exception|Error)\b/,
  /\b(ECONN\w*|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|ERR_[A-Z_]+)\b/,
  /\b(Failed to fetch|NetworkError|Load failed|Network request failed)\b/i,
  /\bUnexpected (token|end of JSON)\b/i,
  /\bHTTP\s?\d{3}\b/i,
  /\bstatus code\b/i,
  /\b(prisma|postgres|sql|stack|undefined|null|NaN|uuid|json)\b/i,
  /\bat \S+ \(.*:\d+:\d+\)/,
  /https?:\/\//i,
  /(^|\s)\/[\w-]+\/[\w/:-]*/,
  /[{}<>[\]=`]|=>/,
  /\b[A-Z]{2,}_[A-Z_]{2,}\b/,
  /\b[a-z]+_[a-z_]+\b/,
];

const ENGLISH_WORDS =
  /\b(the|is|are|was|not|cannot|can't|must|should|be|been|expected|received|invalid|required|missing|failed|error|forbidden|unauthorized|found|internal|server|request|bad|too|many|only|with|without|this|that|does|exist|exists|already|please|try|again|unknown|denied|allowed|match|string|number|object|array|boolean|empty|length|least|most|characters?)\b/gi;

const SPANISH_WORDS =
  /\b(el|la|los|las|un|una|de|del|que|no|se|tu|tus|su|sus|para|por|con|sin|es|está|están|ya|puedes|debe|debes|hay|al|como|más|este|esta|eso|esto|inténtalo|revisa|escribe|elige|indica|nuevo|nueva)\b|[áéíóúñ¿¡]/gi;

/** Quita el prefijo de campo del validador ("amountCop: …", "(body): …"). */
export function stripFieldPrefixes(message: string): string {
  return message
    .split(/(?<=[.!?])\s+|\n+/)
    .map((part) => part.replace(/^\s*(\(body\)|[\w.[\]]+)\s*:\s+/, '').trim())
    .filter(Boolean)
    .join(' ');
}

/** ¿Es un mensaje pensado para una máquina (o en inglés) y no para una persona? */
export function isTechnicalMessage(message: string | null | undefined): boolean {
  const text = (message ?? '').trim();
  if (!text) return true;
  if (text.length > 280) return true;
  if (TECHNICAL_PATTERNS.some((re) => re.test(text))) return true;
  const english = text.match(ENGLISH_WORDS)?.length ?? 0;
  const spanish = text.match(SPANISH_WORDS)?.length ?? 0;
  return english > spanish;
}

/**
 * El texto que verá la persona: el del servidor si ya es claro y en español;
 * si no, uno amable según el código HTTP.
 */
export function friendlyMessage(raw: string | null | undefined, status?: number): string {
  const cleaned = raw ? stripFieldPrefixes(raw) : '';
  return isTechnicalMessage(cleaned) ? messageForStatus(status) : cleaned;
}

/** Cualquier cosa lanzada (ApiError, TypeError de red, texto) → mensaje amable. */
export function friendlyErrorMessage(error: unknown, fallback = GENERIC_ERROR_MESSAGE): string {
  if (error == null) return fallback;
  if (typeof error === 'string')
    return isTechnicalMessage(error) ? fallback : stripFieldPrefixes(error);
  if (typeof error === 'object') {
    const e = error as { status?: unknown; message?: unknown; name?: unknown };
    const status = typeof e.status === 'number' ? e.status : undefined;
    const message = typeof e.message === 'string' ? e.message : '';
    if (e.name === 'TypeError' && /fetch|network|load failed/i.test(message)) {
      return NETWORK_ERROR_MESSAGE;
    }
    if (status !== undefined) return friendlyMessage(message, status);
    const cleaned = stripFieldPrefixes(message);
    return isTechnicalMessage(cleaned) ? fallback : cleaned;
  }
  return fallback;
}
