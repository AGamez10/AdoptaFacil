/** BullMQ queue + job of the Mercado Pago token-renewal worker (ADR-PAG-003).
 *  Same shape as the other repeatable scans: self-registered on boot, running
 *  on the shared BullMQ↔Redis connection (QueueModule). */
export const MERCADOPAGO_TOKEN_REFRESH_QUEUE = 'mercadopago-token-refresh';
export const MERCADOPAGO_TOKEN_REFRESH_JOB = 'refresh';

/** 10 minutes: the OAuth `state` never outlives the authorization code it
 *  protects (Mercado Pago's code is short-lived and single-use). */
export const MERCADOPAGO_CONNECT_STATE_TTL_SECONDS = 10 * 60;

/** Audit entity type of a connection (never carries a token). */
export const MERCADOPAGO_CONNECTION_ENTITY = 'organization_mercadopago_connection';
