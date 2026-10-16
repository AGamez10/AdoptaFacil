// Module: M15 payments · ePayco (pasarela principal) · Contracts owner: @fabian
//
// Design: docs/pagos/pasarelas-multiples.md (ADR-PAG-002).
//
// ADDITIVE contract: the views for connecting an organization's OWN ePayco
// account and the PURE mapping rules every ePayco adapter uses. The keys
// themselves (`EpaycoCollectorCredentials` in `payments.ts`) are server-only
// and never appear in any view here.
//
// Browser-safe, dependency-free.

import type { PaymentStatus } from './payments';

/**
 * What an Owner/Administrator submits to connect the org's ePayco account
 * (dashboard.epayco.co → Integraciones → Llaves API). Sent once over HTTPS;
 * the API encrypts the two secrets at rest and never returns them.
 */
export interface ConnectEpaycoAccountInput {
  /** P_CUST_ID_CLIENTE (digits). */
  custId: string;
  /** P_KEY. Secret. */
  pKey: string;
  /** PUBLIC_KEY. */
  publicKey: string;
  /** PRIVATE_KEY. Secret. */
  privateKey: string;
}

/** `GET /org/epayco/status`. Never carries a secret. */
export interface EpaycoConnectStatusView {
  connected: boolean;
  /** P_CUST_ID_CLIENTE, so the org can check it is ITS account. */
  custId?: string;
  /** Last 4 characters of PUBLIC_KEY, for recognition only. */
  publicKeyHint?: string;
  connectedAt?: string;
}

/** P_CUST_ID_CLIENTE is numeric at ePayco. */
export const EPAYCO_CUST_ID_PATTERN = /^\d{1,20}$/;

/**
 * `x_cod_transaction_state` / `x_cod_response` → our status. Codes from the
 * ePayco response tables (checkout-tablas-de-datos). Anything unknown is
 * `pending`: it never settles a donation, and the next confirmation or a
 * read-back decides.
 */
export function epaycoStatusFromCode(code: string | number | null | undefined): PaymentStatus {
  switch (String(code ?? '').trim()) {
    case '1': // Aceptada
      return 'approved';
    case '2': // Rechazada
    case '9': // Expirada
    case '10': // Abandonada
    case '11': // Cancelada
    case '12': // Antifraude
      return 'declined';
    case '4': // Fallida
      return 'error';
    case '6': // Reversada
      return 'voided';
    default: // 3 Pendiente, 7 Retenida, 8 Iniciada, unknown
      return 'pending';
  }
}

/**
 * ePayco reports amounts as decimal strings ("50000" or "50000.00"). COP has
 * no cents in practice; anything with a non-zero fraction is refused (`null`)
 * so the caller treats it as an amount mismatch, never rounds it.
 */
export function parseEpaycoAmount(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (!/^\d{1,12}(?:\.\d{1,2})?$/.test(text)) return null;
  const [whole, fraction = ''] = text.split('.');
  if (/[1-9]/.test(fraction)) return null;
  return Number(whole);
}
