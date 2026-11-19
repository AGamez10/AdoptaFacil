/**
 * ¿La web está corriendo dentro de la app nativa (Capacitor, apps/mobile)?
 *
 * Capacitor inyecta `window.Capacitor` en la página, también cuando la app
 * carga la web publicada (CAP_SERVER_URL). En el navegador no existe.
 */
interface CapacitorGlobal {
  isNativePlatform?: () => boolean;
}

export function isNativeApp(
  win: unknown = typeof window === 'undefined' ? undefined : window,
): boolean {
  const cap = (win as { Capacitor?: CapacitorGlobal } | undefined)?.Capacitor;
  try {
    return Boolean(cap?.isNativePlatform?.());
  } catch {
    return false;
  }
}
