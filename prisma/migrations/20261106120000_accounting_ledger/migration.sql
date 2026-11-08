-- Contabilidad de donaciones por detrás (sección 2A de "qué resuelve
-- AdoptaFácil legal y contablemente", 2026-11-06). AdoptaFácil PREPARA la
-- contabilidad de donaciones del refugio; no la firma, no la certifica y no la
-- declara (eso es del contador o revisor fiscal, Ley 43 de 1990 — 🧾 a
-- confirmar por un contador).
--
-- Tres tablas, todas tenant-scoped con RLS (ENABLE + FORCE + tenant_isolation):
--
-- 1. accounting_entries — LIBRO AUXILIAR DE DONACIONES. Un renglón por hecho
--    económico confirmado por la pasarela: donación aprobada, reembolso o
--    contracargo. Folio consecutivo por organización. SOLO INSERCIÓN: el rol
--    de la app no tiene UPDATE/DELETE/TRUNCATE y triggers abortan la mutación
--    para cualquier rol. Un reembolso nunca edita la donación: es otro renglón
--    con signo negativo. Idempotente por (organización, dedup_key).
-- 2. accounting_period_closes — CIERRE DE MES. Sella el mes (totales + huella
--    SHA-256 de sus renglones). Lo que llegue después de un mes cerrado entra
--    como AJUSTE fechado en el mes abierto, nunca reescribe el cerrado.
--    Solo inserción.
-- 3. accounting_shares — ENLACE PARA EL CONTADOR / REVISOR FISCAL vinculado:
--    ver y descargar la información contable de un mes sin cuenta. Solo se
--    guarda el SHA-256 del token; vence; se puede revocar.

-- ============================================================================
-- 1. Libro auxiliar
-- ============================================================================
CREATE TABLE "accounting_entries" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "seq" INTEGER NOT NULL,
    "dedup_key" TEXT NOT NULL,
    "entry_type" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "donation_id" UUID,
    "gateway_payment_id" TEXT,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "event_period" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "is_adjustment" BOOLEAN NOT NULL DEFAULT false,
    "gross_cop" BIGINT NOT NULL,
    "fee_cop" BIGINT,
    "net_cop" BIGINT,
    "currency" TEXT NOT NULL DEFAULT 'COP',
    "payment_type" TEXT,
    "payment_method" TEXT,
    "destination" TEXT NOT NULL,
    "destination_id" UUID,
    "destination_label" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "accounting_entries_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "accounting_entries_seq_check" CHECK ("seq" > 0),
    CONSTRAINT "accounting_entries_type_check" CHECK ("entry_type" IN ('donation', 'refund', 'chargeback')),
    CONSTRAINT "accounting_entries_source_check" CHECK ("source" IN ('mercadopago', 'epayco', 'other')),
    CONSTRAINT "accounting_entries_sign_check" CHECK (
      ("entry_type" = 'donation' AND "gross_cop" > 0) OR ("entry_type" <> 'donation' AND "gross_cop" < 0)
    ),
    CONSTRAINT "accounting_entries_amount_check" CHECK (abs("gross_cop") <= 10000000000),
    CONSTRAINT "accounting_entries_period_check" CHECK (
      "period" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$' AND "event_period" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
      AND "period" >= "event_period"
    ),
    CONSTRAINT "accounting_entries_adjustment_check" CHECK ("is_adjustment" = ("period" <> "event_period")),
    CONSTRAINT "accounting_entries_destination_check" CHECK ("destination" IN ('general', 'animal', 'campaign')),
    CONSTRAINT "accounting_entries_currency_check" CHECK ("currency" = 'COP')
);

CREATE UNIQUE INDEX "accounting_entries_organization_id_seq_key" ON "accounting_entries"("organization_id", "seq");
CREATE UNIQUE INDEX "accounting_entries_organization_id_dedup_key_key" ON "accounting_entries"("organization_id", "dedup_key");
CREATE INDEX "accounting_entries_organization_id_period_idx" ON "accounting_entries"("organization_id", "period");
CREATE INDEX "accounting_entries_donation_id_idx" ON "accounting_entries"("donation_id");

ALTER TABLE "accounting_entries" ADD CONSTRAINT "accounting_entries_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "accounting_entries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "accounting_entries" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "accounting_entries"
  USING ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

GRANT SELECT, INSERT ON "accounting_entries" TO adoptafacil_app;
REVOKE UPDATE, DELETE, TRUNCATE ON "accounting_entries" FROM adoptafacil_app;

-- ============================================================================
-- 2. Cierres de mes
-- ============================================================================
CREATE TABLE "accounting_period_closes" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "period" TEXT NOT NULL,
    "entry_count" INTEGER NOT NULL,
    "last_seq" INTEGER NOT NULL,
    "totals" JSONB NOT NULL,
    "reconciliation" JSONB NOT NULL,
    "entries_hash" TEXT NOT NULL,
    "note" TEXT,
    "closed_by_user_id" UUID NOT NULL,
    "closed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "accounting_period_closes_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "accounting_period_closes_period_check" CHECK ("period" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
    CONSTRAINT "accounting_period_closes_counts_check" CHECK ("entry_count" >= 0 AND "last_seq" >= 0),
    CONSTRAINT "accounting_period_closes_hash_check" CHECK ("entries_hash" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "accounting_period_closes_note_check" CHECK ("note" IS NULL OR char_length("note") <= 500)
);

CREATE UNIQUE INDEX "accounting_period_closes_organization_id_period_key" ON "accounting_period_closes"("organization_id", "period");

ALTER TABLE "accounting_period_closes" ADD CONSTRAINT "accounting_period_closes_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "accounting_period_closes" ADD CONSTRAINT "accounting_period_closes_closed_by_user_id_fkey"
  FOREIGN KEY ("closed_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "accounting_period_closes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "accounting_period_closes" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "accounting_period_closes"
  USING ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

GRANT SELECT, INSERT ON "accounting_period_closes" TO adoptafacil_app;
REVOKE UPDATE, DELETE, TRUNCATE ON "accounting_period_closes" FROM adoptafacil_app;

-- Inmutabilidad (también para superusuario): ni el libro ni un cierre se editan.
CREATE OR REPLACE FUNCTION accounting_guard_immutable() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% es de solo inserción: % no está permitido', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE TRIGGER accounting_entries_no_update BEFORE UPDATE ON "accounting_entries"
  FOR EACH ROW EXECUTE FUNCTION accounting_guard_immutable();
CREATE TRIGGER accounting_entries_no_delete BEFORE DELETE ON "accounting_entries"
  FOR EACH ROW EXECUTE FUNCTION accounting_guard_immutable();
CREATE TRIGGER accounting_entries_no_truncate BEFORE TRUNCATE ON "accounting_entries"
  FOR EACH STATEMENT EXECUTE FUNCTION accounting_guard_immutable();
CREATE TRIGGER accounting_period_closes_no_update BEFORE UPDATE ON "accounting_period_closes"
  FOR EACH ROW EXECUTE FUNCTION accounting_guard_immutable();
CREATE TRIGGER accounting_period_closes_no_delete BEFORE DELETE ON "accounting_period_closes"
  FOR EACH ROW EXECUTE FUNCTION accounting_guard_immutable();
CREATE TRIGGER accounting_period_closes_no_truncate BEFORE TRUNCATE ON "accounting_period_closes"
  FOR EACH STATEMENT EXECUTE FUNCTION accounting_guard_immutable();

-- ============================================================================
-- 3. Enlaces para el contador / revisor fiscal
-- ============================================================================
CREATE TABLE "accounting_shares" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "period" TEXT NOT NULL,
    "signer_user_id" UUID NOT NULL,
    "signer_role" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "accounting_shares_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "accounting_shares_period_check" CHECK ("period" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
    CONSTRAINT "accounting_shares_role_check" CHECK ("signer_role" IN ('accountant', 'fiscal_reviewer')),
    CONSTRAINT "accounting_shares_token_hash_check" CHECK ("token_hash" ~ '^[0-9a-f]{64}$')
);

CREATE UNIQUE INDEX "accounting_shares_token_hash_key" ON "accounting_shares"("token_hash");
CREATE INDEX "accounting_shares_organization_id_period_idx" ON "accounting_shares"("organization_id", "period");

ALTER TABLE "accounting_shares" ADD CONSTRAINT "accounting_shares_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "accounting_shares" ADD CONSTRAINT "accounting_shares_signer_user_id_fkey"
  FOREIGN KEY ("signer_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "accounting_shares" ADD CONSTRAINT "accounting_shares_created_by_user_id_fkey"
  FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "accounting_shares" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "accounting_shares" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "accounting_shares"
  USING ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

-- Solo se crea y se revoca: nunca se borra (queda el historial de a quién se compartió).
GRANT SELECT, INSERT ON "accounting_shares" TO adoptafacil_app;
REVOKE UPDATE, DELETE, TRUNCATE ON "accounting_shares" FROM adoptafacil_app;
GRANT UPDATE ("revoked_at") ON "accounting_shares" TO adoptafacil_app;

-- Resolver un enlace sin sesión: SOLO id + organización, por la huella del
-- token (nunca el token). Mismo patrón que org_signature_request_by_token_hash.
CREATE OR REPLACE FUNCTION accounting_share_by_token_hash(p_token_hash TEXT)
  RETURNS JSONB
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object('id', s.id, 'organizationId', s.organization_id)
  FROM accounting_shares s
  WHERE s.token_hash = p_token_hash
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION accounting_share_by_token_hash(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION accounting_share_by_token_hash(TEXT) TO adoptafacil_app;

-- ============================================================================
-- 4. El informe contable del mes se firma con el mismo flujo de reportes.
-- ============================================================================
ALTER TABLE "org_reports" DROP CONSTRAINT "org_reports_kind_check";
ALTER TABLE "org_reports" ADD CONSTRAINT "org_reports_kind_check"
  CHECK ("kind" IN ('donations', 'social_service', 'accounting'));
ALTER TABLE "org_report_policies" DROP CONSTRAINT "org_report_policies_kind_check";
ALTER TABLE "org_report_policies" ADD CONSTRAINT "org_report_policies_kind_check"
  CHECK ("kind" IN ('donations', 'social_service', 'accounting'));
