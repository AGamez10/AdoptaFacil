import { z } from 'zod';

/** A module feature flag: true only for the exact string "true" (fails closed). */
function featureFlag() {
  return z
    .union([z.string(), z.boolean()])
    .optional()
    .transform((value) => value === true || value === 'true');
}

/**
 * Single source of truth for backend configuration.
 * The API refuses to boot if any required variable is missing or malformed —
 * this is the "validación de configuración al arranque" required by Sprint 0.
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().positive().default(3000),
  // Comma-separated list of allowed CORS origins.
  API_CORS_ORIGIN: z.string().min(1).default('http://localhost:5173'),
  DATABASE_URL: z.string().url(),
  // Non-superuser application role connection (RLS is enforced against it).
  // Must be part of the validated schema: @nestjs/config only assigns the
  // VALIDATED keys back to process.env, and PrismaService reads
  // process.env.DATABASE_URL_APP at construction — omitting it here would strip
  // it from process.env and break `pnpm --filter api dev`.
  DATABASE_URL_APP: z.string().url(),
  // Plan de escala (B4): pool de conexiones de Prisma, explícito. Sin valor,
  // Prisma usa 2 × CPU + 1 (5 en un VPS de 2 vCPU). Con PgBouncer delante, este
  // número es por réplica y PgBouncer reparte las conexiones reales.
  DATABASE_POOL_SIZE: z.coerce.number().int().min(1).max(200).optional(),
  // Segundos que una petición espera una conexión libre antes de fallar.
  DATABASE_POOL_TIMEOUT_S: z.coerce.number().int().min(1).max(120).default(10),
  // true cuando DATABASE_URL_APP apunta a PgBouncer en modo transacción
  // (Prisma desactiva las sentencias preparadas con nombre).
  DATABASE_PGBOUNCER: featureFlag(),
  // Tope por sentencia dentro de las transacciones con tenant (SET LOCAL): una
  // consulta desbocada no retiene una conexión del pool indefinidamente.
  DATABASE_STATEMENT_TIMEOUT_MS: z.coerce.number().int().min(100).max(600_000).default(15_000),
  REDIS_URL: z.string().url(),
  // Plan de escala (B7): 'api' sirve HTTP sin workers de colas, 'worker' corre
  // los workers, 'all' hace ambas cosas (desarrollo local). Ver app-role.ts.
  APP_ROLE: z.enum(['all', 'api', 'worker']).default('all'),
  // Plan de escala (B5/B10): Redis APARTE para la caché de lecturas públicas
  // (allkeys-lru). Vacío = sin caché en Redis (solo cabeceras para la CDN).
  REDIS_CACHE_URL: z.string().url().optional(),
  // Segundos que una lectura pública vive en Redis y en la CDN (s-maxage).
  PUBLIC_CACHE_TTL_S: z.coerce.number().int().min(1).max(3600).default(30),
  // Plan de escala (B6): presupuesto por minuto de lecturas públicas por IP y
  // de escrituras por organización. Con Cloudflare delante, TRUST_PROXY_HOPS
  // debe contar también el salto de Cloudflare para ver la IP real.
  PUBLIC_RATE_LIMIT_PER_MIN: z.coerce.number().int().min(1).default(600),
  ORG_WRITE_RATE_LIMIT_PER_MIN: z.coerce.number().int().min(1).default(300),
  // Plan de escala (B9): token del scrape de Prometheus (GET /metrics con
  // Authorization: Bearer). Sin valor, /metrics responde 404.
  METRICS_TOKEN: z.string().min(24).optional(),
  // Una línea JSON por petición (id, método, ruta plantilla, estado, ms).
  HTTP_ACCESS_LOG: featureFlag(),
  // T-110 (auth/RF05): base URL of the web app, used to build the clickable
  // password-reset link emailed to users ({WEB_BASE_URL}/reset-password?token=…).
  // Defaults to the Vite dev server so local dev works without extra config; set
  // it to the real public origin in production.
  WEB_BASE_URL: z.string().url().default('http://localhost:5173'),
  // T-109 (notifications): which NotificationPort adapter to bind. `log` = stub
  // that only logs (default; tests/dev never send). `smtp` = real email via
  // SMTP. Swap happens in NotificationModule, no consumer changes. When `smtp`,
  // the SMTP_* vars below are REQUIRED (fail-fast, see the refine).
  NOTIFICATION_DRIVER: z.enum(['log', 'smtp']).default('log'),
  // SMTP credentials — read ONLY from env; never hardcoded, never committed.
  // Optional at the schema level so `log` mode boots without them; the refine
  // enforces their presence when the driver is `smtp`.
  SMTP_HOST: z.string().min(1).optional(),
  SMTP_PORT: z.coerce.number().int().positive().optional(),
  SMTP_USER: z.string().min(1).optional(),
  SMTP_PASS: z.string().min(1).optional(),
  SMTP_FROM: z.string().min(1).optional(),
  // Email delivery queue (BullMQ on the same Redis). Every email is a job: the
  // request only enqueues it and a worker renders + sends it, with retries.
  // Tune these to the SMTP provider's limits; no code change needed.
  //   CONCURRENCY: emails a worker sends in parallel (SMTP pool size too).
  //   RATE_MAX per RATE_DURATION_MS: ceiling across all workers.
  //   ATTEMPTS: tries per email (exponential backoff from 30 s) before it
  //   stays as failed in the queue.
  EMAIL_QUEUE_CONCURRENCY: z.coerce.number().int().positive().max(50).default(5),
  EMAIL_QUEUE_RATE_MAX: z.coerce.number().int().positive().default(10),
  EMAIL_QUEUE_RATE_DURATION_MS: z.coerce.number().int().positive().default(1_000),
  EMAIL_QUEUE_ATTEMPTS: z.coerce.number().int().positive().max(20).default(6),
  // T-106 (M03/RF09): interval of the repeatable clinical-reminders scan job.
  // Configurable for dev/test; defaults to daily. Kept in the validated schema so
  // it survives @nestjs/config (which only re-exposes validated keys).
  REMINDERS_SCAN_INTERVAL_MS: z.coerce.number().int().positive().default(86_400_000),
  // Look-ahead window (days) for the scan: events due within this many days
  // (or already overdue) generate a reminder.
  REMINDERS_WINDOW_DAYS: z.coerce.number().int().min(0).max(365).default(30),
  // S2-08 (M13 organization summary): a document counts toward
  // `documentsExpiringSoon` when it expires within this many days from now.
  // TODO(client): 30 is an initial default (no business decision fixes this
  // threshold yet) — redefine via env, no code change needed.
  DOCUMENTS_EXPIRING_SOON_WINDOW_DAYS: z.coerce.number().int().min(0).max(365).default(30),
  // T-108 (storage): which StoragePort adapter to bind. `disk` = real filesystem
  // (prod on the VPS); `stub` = in-memory (tests set this via load-env). Default
  // `disk` so production persists real bytes unless explicitly overridden.
  STORAGE_DRIVER: z.enum(['stub', 'disk', 's3']).default('disk'),
  // STORAGE_DRIVER=s3: any S3-compatible bucket (Cloudflare R2, Backblaze B2,
  // AWS S3). Path-style URLs: `${S3_ENDPOINT}/${S3_BUCKET}/<key>`. The bucket
  // stays private; bytes are still served through the API's storage endpoints.
  S3_ENDPOINT: z.string().url().optional(),
  // R2 uses `auto`.
  S3_REGION: z.string().min(1).default('auto'),
  S3_BUCKET: z.string().min(1).optional(),
  S3_ACCESS_KEY_ID: z.string().min(1).optional(),
  S3_SECRET_ACCESS_KEY: z.string().min(1).optional(),
  // Root directory for the disk adapter (outside the webroot; per-tenant subdirs).
  STORAGE_DISK_ROOT: z.string().min(1).default('./.storage'),
  // Max upload size in MB (enforced by the adapter and the upload endpoint).
  STORAGE_MAX_FILE_MB: z.coerce.number().int().positive().max(100).default(15),
  // Video de seguimiento postadopción (máximo 30 s, decisión del 2026-10-17):
  // peso máximo en MB. TODO(client): confirmar los 50 MB propuestos.
  FOLLOWUP_VIDEO_MAX_MB: z.coerce.number().int().positive().max(100).default(50),
  // Base URL the API is reachable at, used to build upload/serve URLs.
  STORAGE_PUBLIC_BASE_URL: z.string().url().default('http://localhost:3000'),
  // Plan de escala (B2): host de la CDN para los archivos PÚBLICOS (fotos,
  // logos). Es la misma API detrás de Cloudflare con un nombre propio (p. ej.
  // https://img.adoptafacil.org/api): la CDN guarda la respuesta de
  // /storage/public (Cache-Control largo) y la API solo atiende los fallos de
  // caché. Los archivos privados nunca usan este host. Vacío = sin CDN.
  STORAGE_PUBLIC_CDN_BASE_URL: z.string().url().optional(),
  // T-052 (payments): which PaymentPort adapter to bind. 'fake' = deterministic
  // dev/test double (default). Swap happens in PaymentModule, no consumer
  // changes. 'disabled' (Ola 1, R0-1): binds an adapter that refuses every
  // call — the production value while money stays off (D1–D7). 'fake' is
  // rejected in production by assertProductionSafety below.
  // 'epayco' (ADR-PAG-002, única pasarela desde 2026-10-17): every charge
  // is a checkout v2 session created with the BENEFICIARY organization's own
  // ePayco keys (stored encrypted, `organization_epayco_accounts`), so no
  // platform credential is needed to boot in the default direct mode.
  // Mercado Pago was retired from the product on 2026-10-17 (owner decision):
  // 'mercadopago' is no longer an accepted value (Wompi was retired earlier).
  PAYMENT_DRIVER: z.enum(['fake', 'epayco', 'disabled']).default('fake'),
  // ePayco (ADR-PAG-002). Base URLs are overridable only for tests/mocks.
  EPAYCO_APIFY_BASE_URL: z.string().url().default('https://apify.epayco.co'),
  EPAYCO_SECURE_BASE_URL: z.string().url().default('https://secure.epayco.co'),
  // Public URL ePayco POSTs the confirmation to (this API's
  // `/donations/webhook`). Optional: falls back to
  // `${STORAGE_PUBLIC_BASE_URL}/donations/webhook` (the API's public base URL,
  // same fallback the storage URLs use).
  EPAYCO_CONFIRMATION_URL: z.string().url().optional(),
  // Where ePayco sends the payer back after the checkout (the web's donation
  // result page). ePayco appends `?ref_payco=…`; the API adds our own
  // `reference` (the donation's collectionId). Optional: falls back to
  // `${WEB_BASE_URL}/donaciones/resultado`.
  EPAYCO_RESPONSE_URL: z.string().url().optional(),
  // ePayco sandbox: sessions are created with `test: true`. OFF unless "true".
  EPAYCO_TEST: featureFlag(),
  // ADR-PAG-001: 'direct_to_org' (default) = the org collects with its own
  // keys, platform fee 0. 'platform_split' = ePayco "pagos divididos" with
  // AdoptaFácil as principal merchant — only honored when `planCollection`
  // approves it (written approval ref + valid fee rate); otherwise every
  // charge is refused (fails closed, never falls back to custody).
  EPAYCO_COLLECTION_MODE: z.enum(['direct_to_org', 'platform_split']).default('direct_to_org'),
  EPAYCO_SPLIT_APPROVAL_REF: z.string().min(1).optional(),
  EPAYCO_SPLIT_FEE_RATE: z.coerce.number().min(0).lt(1).optional(),
  // Platform merchant keys — ONLY used in 'platform_split'. Never logged.
  EPAYCO_PLATFORM_CUST_ID: z
    .string()
    .regex(/^\d{1,20}$/)
    .optional(),
  EPAYCO_PLATFORM_P_KEY: z.string().min(1).optional(),
  EPAYCO_PLATFORM_PUBLIC_KEY: z.string().min(1).optional(),
  EPAYCO_PLATFORM_PRIVATE_KEY: z.string().min(1).optional(),
  // S-5-REDISEÑO (M07/RF17, T-057): interval of the repeatable sponsorship
  // billing scan job — opens a new period for sponsorships that just reached
  // their nextBillingAt, and advances the reminder/retry ladder of open
  // periods. Defaults to daily, same cadence as REMINDERS_SCAN_INTERVAL_MS.
  SPONSORSHIP_BILLING_SCAN_INTERVAL_MS: z.coerce.number().int().positive().default(86_400_000),
  // Interval of the payment-status POLLER (checks
  // PaymentPort.getCollectionStatus for every pending attempt). Confirmation
  // is via polling, not the gateway webhook — that webhook is hardcoded for
  // concept_kind='campaign' inside donations/** (Fabián's domain); extending
  // it for 'sponsorship' was out of scope here (confirmed with the user,
  // 2026-08-24). A shorter interval than the daily scan keeps confirmation
  // close to real time without needing that cross-domain change.
  SPONSORSHIP_PAYMENT_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(300_000),
  // Tolerant reminder/retry ladder day-offsets (S-5-REDISEÑO Objetivo 3),
  // ALL measured from a billing period's OWN periodStartedAt — never a fixed
  // calendar date. Product decision taken 2026-08-24 (equipo): several
  // reminders + up to 2 new payment links (3 attempts total) before
  // suspending. These are DEFAULTS, not a rule fixed by the base document —
  // adjustable via env with no code change.
  SPONSORSHIP_REMINDER_DAY_1: z.coerce.number().int().positive().default(5),
  SPONSORSHIP_EXPIRE_ATTEMPT_1_DAY: z.coerce.number().int().positive().default(10),
  SPONSORSHIP_REMINDER_DAY_2: z.coerce.number().int().positive().default(15),
  SPONSORSHIP_EXPIRE_ATTEMPT_2_DAY: z.coerce.number().int().positive().default(20),
  SPONSORSHIP_REMINDER_FINAL_DAY: z.coerce.number().int().positive().default(25),
  SPONSORSHIP_EXPIRE_ATTEMPT_3_DAY: z.coerce.number().int().positive().default(30),
  // T-Google-SignIn (auth): which IdentityPort adapter to bind. `fake` = a
  // deterministic dev/test double that accepts a documented fake token format
  // (default — no real Google account needed); `google` verifies real Google
  // ID tokens via google-auth-library. Swap happens in IdentityModule, no
  // consumer changes (same PAYMENT_DRIVER-style seam). When
  // AUTH_IDENTITY_DRIVER=google, GOOGLE_OAUTH_CLIENT_ID below is REQUIRED
  // (fail-fast, see the refine). The client has not handed over real Google
  // OAuth credentials yet, so `google` cannot be exercised end-to-end until
  // then — same "stub until credentials exist" shape PAYMENT_DRIVER had
  // before T-052.
  // 'disabled' (Ola 1, R0-1, SEC-001): `POST /auth/google` answers 404 —
  // the production value until real Google credentials exist. 'fake' is
  // rejected in production by assertProductionSafety below.
  AUTH_IDENTITY_DRIVER: z.enum(['fake', 'google', 'disabled']).default('fake'),
  // Google OAuth 2.0 Client ID (web application type) the ID token's audience
  // must match. Read ONLY from env; never hardcoded, never committed.
  GOOGLE_OAUTH_CLIENT_ID: z.string().min(1).optional(),
  // Ola 1 (R0-1): DianPort and SignaturePort only had a fake adapter, bound
  // unconditionally. Both are now selectable so production can bind the
  // 'disabled' adapter (refuses instead of pretending): the fake DIAN
  // auto-verified RTE (SEC-003) and the fake signature emitted "fake:" ids on
  // real contracts. 'fake' stays the dev/test default.
  DIAN_DRIVER: z.enum(['fake', 'disabled']).default('fake'),
  SIGNATURE_DRIVER: z.enum(['fake', 'disabled']).default('fake'),
  // Ola 1 (R1-1): module feature flags. OFF unless the value is exactly
  // "true", in every environment — a missing or misspelled flag fails closed.
  // A module that is off answers 404 in the API (FeatureFlagGuard) and is
  // hidden in the web (GET /public/config/features).
  FEATURE_PAYMENTS: featureFlag(),
  FEATURE_SPONSORSHIPS: featureFlag(),
  FEATURE_DONATION_CERTIFICATES: featureFlag(),
  FEATURE_COMMUNITY: featureFlag(),
  // Muro de publicaciones de Comunidad, aparte del directorio de servicios.
  FEATURE_COMMUNITY_WALL: featureFlag(),
  // M13 · estampar firmas de representantes en los reportes. Apagado (falla
  // cerrado) hasta que cada firmante apruebe el documento con su propia cuenta:
  // sin eso, quien genera podría firmar por otros sin su consentimiento.
  REPORTS_SIGNATURES_ENABLED: featureFlag(),
  FEATURE_REPUTATION: featureFlag(),
  FEATURE_RESOURCES: featureFlag(),
  FEATURE_MARKETPLACE: featureFlag(),
  FEATURE_VOLUNTEERING_MINORS: featureFlag(),
  // Planes y suscripciones: OFF by default. While off every organization is
  // treated as plan `pro` (nothing gated, nothing charged); turning it on is
  // the owner's call once the subscription can actually be invoiced.
  PLAN_ENFORCEMENT: featureFlag(),
  // Fecha del lanzamiento comercial (ISO-8601, p. ej. 2026-11-01). Desde ahí y
  // durante LAUNCH_PRO_PROMO_MONTHS (3 meses) toda organización SIN suscripción
  // pagada tiene Pro gratis, plantillas de pago incluidas. Sin la fecha no hay
  // promoción: con PLAN_ENFORCEMENT encendido, quien no paga queda en Gratis.
  PLAN_LAUNCH_DATE: z
    .string()
    .optional()
    .refine((value) => value === undefined || !Number.isNaN(Date.parse(value)), {
      message: 'PLAN_LAUNCH_DATE debe ser una fecha ISO-8601 (por ejemplo 2026-11-01)',
    }),
  // Written approval reference (PSP confirmation + legal review, D1–D7/D17)
  // that production requires before FEATURE_PAYMENTS or FEATURE_SPONSORSHIPS
  // can be turned on. Free text (ticket, email date, document id); it is only
  // checked for presence — the decision itself lives outside the code.
  PAYMENTS_PRODUCTION_APPROVAL_REF: z.string().min(1).optional(),
  // Ola 1 (R1-3, SEC-010): number of reverse-proxy hops in front of the API
  // (Caddy on the VPS = 1, Render = 1). Express derives req.ip from
  // X-Forwarded-For only across these hops, so the rate limiter sees the real
  // client IP and a spoofed header cannot pick it. 0 = no proxy (local dev).
  // Production must declare it explicitly.
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(10).optional(),
  // Ola 1 (R1-3, SEC-010): where the auth rate-limit counters live. 'redis'
  // shares them across instances and restarts; 'memory' is per-process (the
  // integration suite uses it so each app instance starts with a clean
  // budget). Production must use 'redis'.
  THROTTLER_STORAGE: z.enum(['memory', 'redis']).default('redis'),
  // Plan SEO (P0): shared budget per client IP for every anonymous /public/*
  // route, per minute. High enough for many people behind one carrier NAT.
  PUBLIC_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(10).max(10_000).default(300),
  // Same budget for a search crawler proven by reverse + forward DNS, shared
  // by ALL of that operator's IPs (see core/bots/verified-bots.ts).
  PUBLIC_RATE_LIMIT_BOT_PER_MINUTE: z.coerce.number().int().min(10).max(100_000).default(1200),
  // Platform staff security (F19): TOTP for every session that uses a platform
  // role. Fails closed — only the exact string "false" turns it off, and
  // production refuses that (assertProductionSafety). The rest of the staff
  // session policy lives in core/auth/mfa/platform-security.config.ts.
  PLATFORM_MFA_REQUIRED: z
    .union([z.string(), z.boolean()])
    .optional()
    .transform((value) => !(value === false || String(value).trim().toLowerCase() === 'false')),
});

/** Runtime config type (from the base object schema). */
export type Env = z.infer<typeof envSchema>;

/** SMTP vars required when NOTIFICATION_DRIVER=smtp (fail-fast at boot, T-109). */
const REQUIRED_SMTP_KEYS = [
  'SMTP_HOST',
  'SMTP_PORT',
  'SMTP_USER',
  'SMTP_PASS',
  'SMTP_FROM',
] as const;

/**
 * ePayco vars required ONLY for `EPAYCO_COLLECTION_MODE=platform_split`
 * (fail-fast at boot). The default direct mode needs no platform credential:
 * every charge uses the organization's own keys.
 */
const REQUIRED_EPAYCO_SPLIT_KEYS = [
  'EPAYCO_SPLIT_APPROVAL_REF',
  'EPAYCO_SPLIT_FEE_RATE',
  'EPAYCO_PLATFORM_CUST_ID',
  'EPAYCO_PLATFORM_P_KEY',
  'EPAYCO_PLATFORM_PUBLIC_KEY',
  'EPAYCO_PLATFORM_PRIVATE_KEY',
] as const;

/** Real gateways allowed to back the money modules in production. */
const REAL_PAYMENT_DRIVERS: readonly Env['PAYMENT_DRIVER'][] = ['epayco'];

/** Google OAuth vars required when AUTH_IDENTITY_DRIVER=google (fail-fast at boot). */
const REQUIRED_GOOGLE_IDENTITY_KEYS = ['GOOGLE_OAUTH_CLIENT_ID'] as const;
const REQUIRED_S3_KEYS = [
  'S3_ENDPOINT',
  'S3_BUCKET',
  'S3_ACCESS_KEY_ID',
  'S3_SECRET_ACCESS_KEY',
] as const;

/**
 * Production safety rules (Ola 1, R0-1 / R1-1 / R1-3). Closes the root cause
 * of SEC-001/SEC-002/SEC-003: simulable adapters were active by default and
 * nothing stopped them in production. With NODE_ENV=production the API now
 * refuses to boot when any port is bound to a fake/stub/log adapter, when a
 * money module is on without a written approval reference, or when the
 * rate limiter cannot see real client IPs. Every rule lists the variable, so
 * a misconfigured deploy fails loud before serving a single request.
 */
export const PRODUCTION_FORBIDDEN_DRIVERS = {
  AUTH_IDENTITY_DRIVER: ['fake'],
  PAYMENT_DRIVER: ['fake'],
  STORAGE_DRIVER: ['stub'],
  NOTIFICATION_DRIVER: ['log'],
  DIAN_DRIVER: ['fake'],
  SIGNATURE_DRIVER: ['fake'],
} as const satisfies Partial<Record<keyof Env, readonly string[]>>;

function assertProductionSafety(env: Env, ctx: z.RefinementCtx): void {
  if (env.NODE_ENV !== 'production') return;
  const fail = (path: string, message: string) =>
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });

  for (const [key, forbidden] of Object.entries(PRODUCTION_FORBIDDEN_DRIVERS)) {
    const value = env[key as keyof typeof PRODUCTION_FORBIDDEN_DRIVERS];
    if ((forbidden as readonly string[]).includes(value)) {
      fail(key, `${key}=${value} is a simulated adapter and is not allowed in production`);
    }
  }

  if (env.FEATURE_PAYMENTS || env.FEATURE_SPONSORSHIPS) {
    if (!REAL_PAYMENT_DRIVERS.includes(env.PAYMENT_DRIVER)) {
      fail(
        'PAYMENT_DRIVER',
        'FEATURE_PAYMENTS/FEATURE_SPONSORSHIPS require PAYMENT_DRIVER=epayco in production',
      );
    }
    if (!env.PAYMENTS_PRODUCTION_APPROVAL_REF) {
      fail(
        'PAYMENTS_PRODUCTION_APPROVAL_REF',
        'money modules need the written PSP + legal approval reference in production',
      );
    }
  }
  if (env.FEATURE_DONATION_CERTIFICATES && !env.FEATURE_PAYMENTS) {
    fail('FEATURE_DONATION_CERTIFICATES', 'donation certificates require FEATURE_PAYMENTS');
  }
  if (env.FEATURE_VOLUNTEERING_MINORS) {
    // Prompt maestro §3.5 / F23: minors stay out of production until age
    // control, legal guardian and traceable consent exist.
    fail('FEATURE_VOLUNTEERING_MINORS', 'volunteering with minors is not allowed in production');
  }
  if (env.TRUST_PROXY_HOPS === undefined) {
    fail(
      'TRUST_PROXY_HOPS',
      'declare how many reverse proxies sit in front of the API (0 if none)',
    );
  }
  if (env.THROTTLER_STORAGE !== 'redis') {
    fail('THROTTLER_STORAGE', 'production rate limiting must be shared in Redis');
  }
  if (!env.PLATFORM_MFA_REQUIRED) {
    fail('PLATFORM_MFA_REQUIRED', 'platform staff must use two-step verification in production');
  }
  // Every emailed link (invitations, password reset, receipts, contracts) is
  // built from WEB_BASE_URL: a forgotten dev default would email links to
  // `localhost` that nobody can open, and plain http would leak the tokens.
  if (!isPublicHttpsUrl(env.WEB_BASE_URL)) {
    fail(
      'WEB_BASE_URL',
      'WEB_BASE_URL must be the public https origin of the web app in production (not localhost)',
    );
  }
}

const LOCAL_HOSTS = /^(localhost|127(?:\.\d{1,3}){3}|0\.0\.0\.0|\[::1\]|.*\.local|.*\.localhost)$/i;

/** `https://` and a host reachable from the internet (no localhost/loopback). */
export function isPublicHttpsUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' && !LOCAL_HOSTS.test(url.hostname);
  } catch {
    return false;
  }
}

/** The validated schema + cross-field rules (fail-fast for smtp/ePayco split credentials). */
export const validatedEnvSchema = envSchema.superRefine((env, ctx) => {
  if (env.NOTIFICATION_DRIVER === 'smtp') {
    for (const key of REQUIRED_SMTP_KEYS) {
      if (env[key] === undefined || env[key] === null || env[key] === '') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: `${key} is required when NOTIFICATION_DRIVER=smtp`,
        });
      }
    }
  }
  if (env.PAYMENT_DRIVER === 'epayco' && env.EPAYCO_COLLECTION_MODE === 'platform_split') {
    for (const key of REQUIRED_EPAYCO_SPLIT_KEYS) {
      if (env[key] === undefined || env[key] === null || env[key] === '') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: `${key} is required when EPAYCO_COLLECTION_MODE=platform_split`,
        });
      }
    }
  }
  if (env.AUTH_IDENTITY_DRIVER === 'google') {
    for (const key of REQUIRED_GOOGLE_IDENTITY_KEYS) {
      if (env[key] === undefined || env[key] === null || env[key] === '') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: `${key} is required when AUTH_IDENTITY_DRIVER=google`,
        });
      }
    }
  }
  if (env.STORAGE_DRIVER === 's3') {
    for (const key of REQUIRED_S3_KEYS) {
      if (env[key] === undefined || env[key] === null || env[key] === '') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: `${key} is required when STORAGE_DRIVER=s3`,
        });
      }
    }
  }
  assertProductionSafety(env, ctx);
});

/**
 * Empty values count as "not set" (BLD-001): `pnpm setup:env` and PaaS
 * dashboards write `KEY=` for optional credentials, and `z.string().min(1)
 * .optional()` would otherwise reject the generated .env and stop the API.
 */
function dropEmptyValues(config: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(config).filter(
      ([, value]) => !(typeof value === 'string' && value.trim() === ''),
    ),
  );
}

/**
 * @nestjs/config `validate` hook. Throws a readable error listing every
 * offending variable so a misconfigured environment fails fast and loud.
 */
export function validateEnv(config: Record<string, unknown>): Env {
  const parsed = validatedEnvSchema.safeParse(dropEmptyValues(config));
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}

/** Connection options BullMQ/ioredis take, derived from the whole REDIS_URL. */
export interface RedisConnectionOptions {
  host: string;
  port: number;
  db: number;
  username?: string;
  password?: string;
  tls?: Record<string, never>;
}

/**
 * Parse REDIS_URL into the options BullMQ and ioredis expect (R1-7, BLD-003).
 * Keeps the database index, credentials and TLS (`rediss://`): before, only
 * host and port survived, so a password-protected Redis never authenticated
 * and two environments on different `/db` indexes consumed each other's jobs.
 */
export function parseRedisUrl(redisUrl: string): RedisConnectionOptions {
  const url = new URL(redisUrl);
  const dbPath = url.pathname.replace(/^\//, '');
  const db = dbPath === '' ? 0 : Number(dbPath);
  if (!Number.isInteger(db) || db < 0) {
    throw new Error(`REDIS_URL has an invalid database index "${dbPath}"`);
  }
  return {
    host: url.hostname,
    port: url.port ? Number(url.port) : 6379,
    db,
    ...(url.username ? { username: decodeURIComponent(url.username) } : {}),
    ...(url.password ? { password: decodeURIComponent(url.password) } : {}),
    ...(url.protocol === 'rediss:' ? { tls: {} } : {}),
  };
}
