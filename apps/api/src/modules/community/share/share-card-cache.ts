/**
 * Tarjetas para compartir ya generadas, en memoria del proceso. La ruta
 * `card.png` es pública y sin sesión, y generar una tarjeta decodifica la foto
 * de la publicación (un GIF permitido de hasta 40 MP ocupa ~200 MB y tarda
 * segundos). Sin esto, cada petición anónima, o cada variación de la URL que
 * salta la caché del CDN, repetía ese trabajo (re-auditoría del PR 166).
 *
 * - Misma tarjeta (misma publicación y misma foto) se genera una vez por
 *   `ttlMs` y se sirve desde memoria; peticiones simultáneas esperan la misma.
 * - Como mucho `maxConcurrent` tarjetas se generan a la vez en el proceso: el
 *   pico de memoria queda acotado aunque lleguen muchas publicaciones distintas.
 * - Como mucho `maxEntries` tarjetas guardadas (~100-200 KB cada una); sale la
 *   más antigua.
 */
export interface ShareCardCacheOptions {
  ttlMs?: number;
  maxEntries?: number;
  maxConcurrent?: number;
  now?: () => number;
}

export class ShareCardCache {
  private readonly ttlMs: number;
  private readonly maxEntries: number;
  private readonly maxConcurrent: number;
  private readonly now: () => number;
  private readonly entries = new Map<string, { png: Buffer; expiresAt: number }>();
  private readonly inflight = new Map<string, Promise<Buffer>>();
  private running = 0;
  private readonly waiting: Array<() => void> = [];

  constructor(options: ShareCardCacheOptions = {}) {
    this.ttlMs = options.ttlMs ?? 10 * 60_000;
    this.maxEntries = options.maxEntries ?? 200;
    this.maxConcurrent = options.maxConcurrent ?? 2;
    this.now = options.now ?? Date.now;
  }

  async get(key: string, render: () => Promise<Buffer>): Promise<Buffer> {
    const hit = this.entries.get(key);
    if (hit && hit.expiresAt > this.now()) return hit.png;
    if (hit) this.entries.delete(key);

    const pending = this.inflight.get(key);
    if (pending) return pending;

    const run = this.withSlot(render)
      .then((png) => {
        this.entries.set(key, { png, expiresAt: this.now() + this.ttlMs });
        while (this.entries.size > this.maxEntries) {
          const oldest = this.entries.keys().next().value as string;
          this.entries.delete(oldest);
        }
        return png;
      })
      .finally(() => this.inflight.delete(key));
    this.inflight.set(key, run);
    return run;
  }

  private async withSlot<T>(task: () => Promise<T>): Promise<T> {
    if (this.running >= this.maxConcurrent) {
      await new Promise<void>((resolve) => this.waiting.push(resolve));
    }
    this.running += 1;
    try {
      return await task();
    } finally {
      this.running -= 1;
      this.waiting.shift()?.();
    }
  }
}
