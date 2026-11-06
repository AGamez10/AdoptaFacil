import type { PublicLedgerPage } from '@adoptafacil/contracts';
import { friendlyHttpError } from '../../../shell/api/friendly-error';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

const EMPTY_TOTALS = {
  incomeCop: 0,
  expenseCop: 0,
  balanceCop: 0,
  entryCount: 0,
  lastEntryOn: null,
};

/**
 * Libro público de una organización (`GET /public/organizations/:slug/ledger`),
 * sin sesión. La forma se normaliza: una respuesta incompleta nunca rompe el portal.
 */
export async function fetchPublicLedger(
  slug: string,
  options: { limit?: number; offset?: number; signal?: AbortSignal } = {},
): Promise<PublicLedgerPage> {
  const { limit = 20, offset = 0, signal } = options;
  const url = `${API_BASE}/public/organizations/${encodeURIComponent(slug)}/ledger?limit=${limit}&offset=${offset}`;
  const response = await fetch(url, signal ? { signal } : undefined);
  if (!response.ok) {
    throw await friendlyHttpError(response);
  }
  const body = (await response.json()) as Partial<PublicLedgerPage> | null;
  const items = Array.isArray(body?.items) ? body.items : [];
  return {
    items,
    total: typeof body?.total === 'number' ? body.total : items.length,
    limit: typeof body?.limit === 'number' ? body.limit : limit,
    offset: typeof body?.offset === 'number' ? body.offset : offset,
    totals: { ...EMPTY_TOTALS, ...(body?.totals ?? {}) },
  };
}
