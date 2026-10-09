/** BullMQ queue + job names for the post-adoption follow-up worker (RF12). Runs on
 *  the reusable global BullMQ↔Redis connection (QueueModule) — no new queue infra. */
export const FOLLOWUP_QUEUE = 'adoption-followups';
export const FOLLOWUP_SCAN_JOB = 'scan';
/** Envío de la copia del contrato firmado a las partes (misma cola: no se
 *  agrega infraestructura nueva). */
export const CONTRACT_COPY_JOB = 'contract-copy';

/** Default scan interval (daily) when ADOPTION_FOLLOWUP_SCAN_INTERVAL_MS is unset. */
export const FOLLOWUP_SCAN_DEFAULT_INTERVAL_MS = 24 * 60 * 60 * 1000;
