/** BullMQ queue + jobs of the automatic Mercado Pago reconciliation (B3). */
export const PAYMENT_RECONCILE_QUEUE = 'payment-reconcile';
/** Orgs with a donation still pending after a few minutes (frequent). */
export const PAYMENT_RECONCILE_PENDING_JOB = 'reconcile-pending';
/** Every connected org, last days (daily: catches refunds and chargebacks). */
export const PAYMENT_RECONCILE_DAILY_JOB = 'reconcile-daily';
/** A pending donation younger than this is still in checkout: leave it alone. */
export const RECONCILE_MIN_AGE_MINUTES = 10;
/** How far back the frequent pass looks for pending donations and payments. */
export const RECONCILE_PENDING_WINDOW_HOURS = 72;
/** How far back the daily pass re-reads every connected account. */
export const RECONCILE_DAILY_WINDOW_HOURS = 72;
