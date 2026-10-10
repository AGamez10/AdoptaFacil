-- CreateTable
CREATE TABLE "legal_acceptances" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "user_id" UUID,
    "subject_type" TEXT NOT NULL,
    "subject_id" UUID NOT NULL,
    "document_key" TEXT NOT NULL,
    "document_version" TEXT NOT NULL,
    "document_sha256" TEXT NOT NULL,
    "action" TEXT NOT NULL DEFAULT 'accepted',
    "channel" TEXT NOT NULL,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "legal_acceptances_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "legal_acceptances_organization_id_subject_type_subject_id_idx" ON "legal_acceptances"("organization_id", "subject_type", "subject_id");

-- AddForeignKey
ALTER TABLE "legal_acceptances" ADD CONSTRAINT "legal_acceptances_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================================
-- ACEPTACIONES LEGALES (Ley 1581 de 2012, art. 9 y art. 17 lit. b: prueba de
-- la autorización). Prisma no modela RLS ni triggers: este SQL se mantiene a mano,
-- con el mismo patrón que audit_logs.
--
-- Valores cerrados (CHECK) para que nadie registre una acción o canal inventado.
-- ============================================================================
ALTER TABLE "legal_acceptances"
  ADD CONSTRAINT "legal_acceptances_action_check" CHECK ("action" IN ('accepted', 'revoked')),
  ADD CONSTRAINT "legal_acceptances_subject_type_check" CHECK ("subject_type" IN ('user', 'donation')),
  ADD CONSTRAINT "legal_acceptances_channel_check"
    CHECK ("channel" IN ('registration', 'reacceptance', 'guest_donation', 'preferences')),
  ADD CONSTRAINT "legal_acceptances_sha256_check" CHECK ("document_sha256" ~ '^[0-9a-f]{64}$');

-- 1. Aislamiento por tenant (RNF03), idéntico al resto de tablas de negocio.
ALTER TABLE "legal_acceptances" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "legal_acceptances" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "legal_acceptances"
  USING ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

-- 2. Mínimo privilegio: el rol de la app solo lee e inserta.
GRANT SELECT, INSERT ON "legal_acceptances" TO adoptafacil_app;
REVOKE UPDATE, DELETE, TRUNCATE ON "legal_acceptances" FROM adoptafacil_app;

-- 3. Inmutabilidad para TODO rol (incluido superusuario por la vía normal): una
--    revocación es una fila nueva, nunca una edición.
CREATE OR REPLACE FUNCTION legal_acceptances_reject_mutation() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'legal_acceptances is append-only: % is not permitted', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE TRIGGER legal_acceptances_no_update
  BEFORE UPDATE ON "legal_acceptances"
  FOR EACH ROW EXECUTE FUNCTION legal_acceptances_reject_mutation();

CREATE TRIGGER legal_acceptances_no_delete
  BEFORE DELETE ON "legal_acceptances"
  FOR EACH ROW EXECUTE FUNCTION legal_acceptances_reject_mutation();

CREATE TRIGGER legal_acceptances_no_truncate
  BEFORE TRUNCATE ON "legal_acceptances"
  FOR EACH STATEMENT EXECUTE FUNCTION legal_acceptances_reject_mutation();
