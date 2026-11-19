/**
 * Lógica de "instalar la app" (PWA). Sin dependencias de React para poder
 * probarla sola. Todo lo que toca el almacenamiento va con try/catch: en
 * modo privado o con datos bloqueados el aviso simplemente no se recuerda.
 */

const DISMISS_KEY = 'af-install-dismissed-at';
const INSTALLED_KEY = 'af-app-installed';
/** Tras "Ahora no", el aviso vuelve a salir después de esta espera. */
export const DISMISS_DAYS = 14;

/** Evento de Chrome/Edge (Android y escritorio) que permite mostrar el diálogo de instalación. */
export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export function isStandalone(win: Window = window): boolean {
  const nav = win.navigator as Navigator & { standalone?: boolean };
  return win.matchMedia('(display-mode: standalone)').matches || nav.standalone === true;
}

/** iPhone o iPad en Safari (Chrome y Firefox en iOS no pueden instalar la app). */
export function isIosSafari(win: Window = window): boolean {
  const ua = win.navigator.userAgent;
  const isIos =
    /iPad|iPhone|iPod/.test(ua) || (ua.includes('Macintosh') && 'ontouchend' in win.document);
  return isIos && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
}

export function wasInstalled(): boolean {
  try {
    return window.localStorage.getItem(INSTALLED_KEY) === '1';
  } catch {
    return false;
  }
}

export function markInstalled(): void {
  try {
    window.localStorage.setItem(INSTALLED_KEY, '1');
  } catch {
    // Sin almacenamiento: el aviso puede volver a salir, no pasa nada grave.
  }
}

export function recentlyDismissed(now: Date = new Date()): boolean {
  try {
    const raw = window.localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    const at = new Date(raw).getTime();
    if (Number.isNaN(at)) return false;
    return now.getTime() - at < DISMISS_DAYS * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

export function rememberDismissed(now: Date = new Date()): void {
  try {
    window.localStorage.setItem(DISMISS_KEY, now.toISOString());
  } catch {
    // Igual que arriba: sin almacenamiento el aviso reaparece en la siguiente visita.
  }
}
