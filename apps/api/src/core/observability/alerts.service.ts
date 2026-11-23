import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.validation';

/** The same alert is sent at most once per window (per process). */
export const ALERT_DEDUP_WINDOW_MS = 15 * 60_000;
/** Hard cap per hour (per process), so an error storm never floods the channel. */
export const ALERT_MAX_PER_HOUR = 30;

const EMAIL = /[\w.+-]+@[\w-]+(\.[\w-]+)+/g;
const LONG_NUMBER = /\d{6,}/g;
const BEARER = /(bearer|token|secret|password|authorization)[=:\s]+\S+/gi;
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/**
 * Strip what could be personal data or a secret from an error message before it
 * leaves the server: emails, document/phone/card-like numbers, tokens and ids.
 */
export function redactAlertText(text: string, max = 300): string {
  const clean = text
    .replace(BEARER, '$1=[redactado]')
    .replace(EMAIL, '[correo]')
    .replace(UUID, '[id]')
    .replace(LONG_NUMBER, '[número]')
    .replace(/\s+/g, ' ')
    .trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

/**
 * Error alerts (go/no-go audit 2026-11-23, B1: "today an error in production is
 * found when a user complains"). Sends a plain-text POST to ALERT_WEBHOOK_URL —
 * the same channel `deploy/scripts/monitor.sh` and `backup.sh` use (ntfy,
 * Slack/Discord-compatible relays…). Deduplicated per key, capped per hour,
 * text redacted, never throws, never blocks the request that failed.
 */
@Injectable()
export class AlertsService {
  private readonly logger = new Logger('Alerts');
  private readonly lastSent = new Map<string, number>();
  private windowStart = 0;
  private sentInWindow = 0;
  private readonly url: string | undefined;
  private readonly label: string;

  /** Replaceable in tests. */
  send: typeof fetch = (...args) => fetch(...args);

  constructor(@Optional() config?: ConfigService<Env, true>) {
    this.url = config?.get('ALERT_WEBHOOK_URL', { infer: true }) || undefined;
    const web = config?.get('WEB_BASE_URL', { infer: true });
    let host = '?';
    try {
      host = web ? new URL(web).host : '?';
    } catch {
      host = '?';
    }
    this.label = `[AdoptaFácil ${host}]`;
  }

  get configured(): boolean {
    return Boolean(this.url);
  }

  /**
   * Report a problem. `key` groups repeats of the same problem (route + error
   * class, job name…). Returns true when the alert was sent to the webhook.
   */
  async notify(key: string, message: string, now = Date.now()): Promise<boolean> {
    const text = `${this.label} ${redactAlertText(message)}`;
    this.logger.error(text);
    const last = this.lastSent.get(key);
    if (last !== undefined && now - last < ALERT_DEDUP_WINDOW_MS) return false;
    if (now - this.windowStart >= 3_600_000) {
      this.windowStart = now;
      this.sentInWindow = 0;
    }
    if (this.sentInWindow >= ALERT_MAX_PER_HOUR) return false;
    this.lastSent.set(key, now);
    this.sentInWindow += 1;
    if (this.lastSent.size > 500) {
      for (const [k, at] of this.lastSent) {
        if (now - at >= ALERT_DEDUP_WINDOW_MS) this.lastSent.delete(k);
      }
    }
    if (!this.url) return false;
    try {
      const res = await this.send(this.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          Title: 'AdoptaFacil',
          Priority: 'high',
        },
        body: text,
        signal: AbortSignal.timeout(5_000),
      });
      if (!res.ok) this.logger.warn(`El webhook de alertas respondió ${res.status}`);
      return res.ok;
    } catch (error) {
      this.logger.warn(`No se pudo enviar la alerta: ${(error as Error).message}`);
      return false;
    }
  }
}
