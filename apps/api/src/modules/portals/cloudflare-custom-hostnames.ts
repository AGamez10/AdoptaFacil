import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.validation';

/** Estado del dominio propio en el borde de Cloudflare (certificado y enrutamiento). */
export type EdgeHostnameStatus = 'active' | 'pending';

interface CloudflareCustomHostname {
  id: string;
  hostname: string;
  status?: string;
  ssl?: { status?: string };
}

interface CloudflareEnvelope<T> {
  success: boolean;
  errors?: Array<{ code?: number; message?: string }>;
  result: T;
}

const API = 'https://api.cloudflare.com/client/v4';
const TIMEOUT_MS = 10_000;

/**
 * Cloudflare for SaaS: registra el dominio propio de una organización como
 * "custom hostname" de la zona de AdoptaFácil. Así el tráfico de
 * www.turefugio.org entra por Cloudflare (WAF, límite de peticiones, TLS en el
 * borde) y el VPS puede seguir cerrado a solo IPs de Cloudflare
 * (deploy/host/cloudflare-origen.sh). Cloudflare emite el certificado público
 * por HTTP cuando el CNAME de la organización ya apunta a la zona.
 *
 * Apagado si faltan CLOUDFLARE_SAAS_ZONE_ID y CLOUDFLARE_SAAS_API_TOKEN (modo
 * directo de antes). El token solo necesita _Zone → SSL and Certificates →
 * Edit_ sobre esa zona. Detrás de una clase simulable (las pruebas la
 * reemplazan); nunca registra el token.
 */
@Injectable()
export class CloudflareCustomHostnames {
  private readonly logger = new Logger('CloudflareSaaS');
  private readonly zoneId: string | undefined;
  private readonly token: string | undefined;

  constructor(config: ConfigService<Env, true>) {
    this.zoneId = config.get('CLOUDFLARE_SAAS_ZONE_ID', { infer: true }) as string | undefined;
    this.token = config.get('CLOUDFLARE_SAAS_API_TOKEN', { infer: true }) as string | undefined;
  }

  get enabled(): boolean {
    return Boolean(this.zoneId && this.token);
  }

  private async call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const response = await fetch(`${API}/zones/${this.zoneId}/custom_hostnames${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const payload = (await response.json().catch(() => null)) as CloudflareEnvelope<T> | null;
    if (!response.ok || !payload?.success) {
      const detail = payload?.errors?.map((e) => `${e.code ?? '?'} ${e.message ?? ''}`).join('; ');
      throw new Error(
        `Cloudflare ${method} custom_hostnames: HTTP ${response.status} ${detail ?? ''}`,
      );
    }
    return payload.result;
  }

  private async find(hostname: string): Promise<CloudflareCustomHostname | null> {
    const rows = await this.call<CloudflareCustomHostname[]>(
      'GET',
      `?hostname=${encodeURIComponent(hostname)}`,
    );
    return rows.find((row) => row.hostname === hostname) ?? null;
  }

  private static toStatus(row: CloudflareCustomHostname): EdgeHostnameStatus {
    return row.status === 'active' && row.ssl?.status === 'active' ? 'active' : 'pending';
  }

  /** Lo registra si aún no existe (idempotente) y devuelve su estado. */
  async ensure(hostname: string): Promise<EdgeHostnameStatus> {
    const existing = await this.find(hostname);
    if (existing) return CloudflareCustomHostnames.toStatus(existing);
    const created = await this.call<CloudflareCustomHostname>('POST', '', {
      hostname,
      ssl: { method: 'http', type: 'dv', settings: { min_tls_version: '1.2' } },
    });
    this.logger.log(`custom hostname registrado: ${hostname}`);
    return CloudflareCustomHostnames.toStatus(created);
  }

  /** Estado actual, o `null` si no está registrado. */
  async status(hostname: string): Promise<EdgeHostnameStatus | null> {
    const existing = await this.find(hostname);
    return existing ? CloudflareCustomHostnames.toStatus(existing) : null;
  }

  /** Lo quita de la zona. Si no existe, no hace nada. */
  async remove(hostname: string): Promise<void> {
    const existing = await this.find(hostname);
    if (!existing) return;
    await this.call<unknown>('DELETE', `/${encodeURIComponent(existing.id)}`);
    this.logger.log(`custom hostname quitado: ${hostname}`);
  }
}
