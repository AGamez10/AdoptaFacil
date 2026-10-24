-- ============================================================================
-- EMAIL TEMPLATES (superadmin panel) + BULK-EMAIL OPT-OUTS.
-- Platform-level configuration, NOT tenant business data (same reasoning as
-- `platform_settings`): one catalog of email events for the whole platform, so
-- these tables carry no organization_id and are intentionally NOT under RLS.
-- Only the platform-gated controller writes them. Purely additive: no existing
-- table is touched.
-- ============================================================================

-- 1. Immutable template versions (append-only history of every edit).
CREATE TABLE "email_template_versions" (
    "id" UUID NOT NULL,
    "event_key" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "subject" TEXT NOT NULL,
    "preheader" TEXT NOT NULL,
    "heading" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "cta_label" TEXT,
    "footer_note" TEXT,
    "change_note" TEXT,
    "created_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_template_versions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "email_template_versions_version_positive" CHECK ("version" > 0)
);
CREATE UNIQUE INDEX "email_template_versions_event_key_version_key"
  ON "email_template_versions"("event_key", "version");

-- 2. Per-event state: active version (NULL = built-in default) + on/off.
CREATE TABLE "email_template_settings" (
    "event_key" TEXT NOT NULL,
    "active_version" INTEGER,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "updated_by_user_id" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_template_settings_pkey" PRIMARY KEY ("event_key"),
    -- The active version must exist for that same event (never a dangling or
    -- cross-event pointer).
    CONSTRAINT "email_template_settings_active_version_fkey"
      FOREIGN KEY ("event_key", "active_version")
      REFERENCES "email_template_versions"("event_key", "version")
);

-- 3. Bulk-email opt-outs: ONLY the SHA-256 of the normalized address.
CREATE TABLE "email_suppressions" (
    "email_hash" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_suppressions_pkey" PRIMARY KEY ("email_hash","category"),
    CONSTRAINT "email_suppressions_hash_format" CHECK ("email_hash" ~ '^[0-9a-f]{64}$')
);

-- Least privilege for the runtime role (no DELETE/TRUNCATE anywhere; history
-- and opt-outs are append-only for the app).
GRANT SELECT, INSERT ON "email_template_versions" TO adoptafacil_app;
REVOKE UPDATE, DELETE, TRUNCATE ON "email_template_versions" FROM adoptafacil_app;
GRANT SELECT, INSERT, UPDATE ON "email_template_settings" TO adoptafacil_app;
REVOKE DELETE, TRUNCATE ON "email_template_settings" FROM adoptafacil_app;
GRANT SELECT, INSERT ON "email_suppressions" TO adoptafacil_app;
REVOKE UPDATE, DELETE, TRUNCATE ON "email_suppressions" FROM adoptafacil_app;
