import { ORG_QR_CODE_PATTERN, type PublicQrResolution } from '@adoptafacil/contracts';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

/**
 * Escaneo del QR fijo de una organización — `GET /public/qr/:code`, sin auth.
 * Devuelve el slug y el destino ya validado por la API (tipo + id, nunca una
 * URL). `null` en un 404 (código inexistente o la org sin portal) o si el
 * código ni siquiera tiene el formato; lanza solo ante un error real.
 */
export async function resolveOrganizationQr(code: string): Promise<PublicQrResolution | null> {
  if (!ORG_QR_CODE_PATTERN.test(code)) return null;
  const response = await fetch(`${API_BASE}/public/qr/${encodeURIComponent(code)}`);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error('error');
  return (await response.json()) as PublicQrResolution;
}
