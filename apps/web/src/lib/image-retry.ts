/**
 * Reintento de imágenes del almacenamiento de la API.
 *
 * Si la página pide una foto justo cuando la API no responde (arranca después
 * que la web, o se está reiniciando en desarrollo, o hubo un corte breve de
 * red), el navegador deja la imagen rota y no vuelve a intentarlo: por eso
 * "a veces carga y a veces no". Aquí cada imagen de `/storage/public` que
 * falla se vuelve a pedir dos veces más, con espera creciente.
 */

const MARK = 'afRetry';
const DEFAULT_DELAYS = [1500, 4000] as const;

/** Misma URL con un parámetro de reintento (evita la respuesta fallida en caché). */
export function retryUrl(src: string, attempt: number): string {
  try {
    const url = new URL(src);
    url.searchParams.set('r', String(attempt));
    return url.href;
  } catch {
    return src;
  }
}

/** Solo archivos públicos de la API; nunca imágenes ajenas ni `data:`/`blob:`. */
export function isStorageImage(src: string): boolean {
  return /^https?:/i.test(src) && src.includes('/storage/public');
}

export function installImageRetry(
  win: Pick<Window, 'addEventListener' | 'setTimeout'> = window,
  delays: readonly number[] = DEFAULT_DELAYS,
): void {
  win.addEventListener(
    'error',
    (event) => {
      const img = event.target;
      if (!(img instanceof HTMLImageElement)) return;
      const src = img.currentSrc || img.src;
      if (!isStorageImage(src)) return;
      const attempt = Number(img.dataset[MARK] ?? '0');
      if (attempt >= delays.length) return;
      img.dataset[MARK] = String(attempt + 1);
      win.setTimeout(() => {
        // La imagen ya pudo cambiar (otro animal, otra página): no se toca.
        if (!img.isConnected || (img.currentSrc || img.src) !== src) return;
        if (img.srcset) img.removeAttribute('srcset');
        img.src = retryUrl(src, attempt + 1);
      }, delays[attempt]);
    },
    // Los errores de <img> no burbujean: hay que escucharlos en captura.
    true,
  );
}
