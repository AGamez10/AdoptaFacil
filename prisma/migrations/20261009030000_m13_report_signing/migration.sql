-- M13 · Firma con consentimiento de los reportes.
--
-- Un reporte con valor legal solo se EMITE cuando cada firmante requerido lo
-- aprueba con su PROPIA cuenta. Esta migración añade:
--  1. org_signer_designations: quién es firmante adicional (contador, revisor
--     fiscal) de la organización. La vinculación la hace la organización
--     (Owner, por defecto el representante legal) por invitación; la
--     plataforma nunca crea ni conoce contraseñas.
--  2. organization_invitations.signer_role: la invitación puede traer el cargo
--     de firmante; al aceptarla se crea la designación.
--  3. org_report_approvals: aprobación/rechazo de cada firmante, ligada a la
--     huella del reporte y al hash de la firma usada. APPEND-ONLY.
--  4. org_report_policies: qué firmas exigen los estatutos por tipo de reporte
--     (declaración de la organización; la plataforma no interpreta estatutos).
--  5. org_report_public(code): añade el estado de emisión.

-- ============================================================================
-- 1. org_signer_designations
-- ============================================================================
CREATE TABLE "org_signer_designations" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" TEXT NOT NULL,
    "designated_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(3),
    "revoked_by_user_id" UUID,

    CONSTRAINT "org_signer_designations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "org_signer_designations_role_check" CHECK ("role" IN ('accountant', 'fiscal_reviewer')),
    CONSTRAINT "org_signer_designations_revoked_check" CHECK (("revoked_at" IS NULL) = ("revoked_by_user_id" IS NULL))
);

-- Una persona, un cargo vigente; un cargo, una persona vigente.
CREATE UNIQUE INDEX "org_signer_designations_active_user_key"
  ON "org_signer_designations"("organization_id", "user_id") WHERE "revoked_at" IS NULL;
CREATE UNIQUE INDEX "org_signer_designations_active_role_key"
  ON "org_signer_designations"("organization_id", "role") WHERE "revoked_at" IS NULL;
CREATE INDEX "org_signer_designations_user_id_idx" ON "org_signer_designations"("user_id");

ALTER TABLE "org_signer_designations" ADD CONSTRAINT "org_signer_designations_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "org_signer_designations" ADD CONSTRAINT "org_signer_designations_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "org_signer_designations" ADD CONSTRAINT "org_signer_designations_designated_by_user_id_fkey"
  FOREIGN KEY ("designated_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "org_signer_designations" ADD CONSTRAINT "org_signer_designations_revoked_by_user_id_fkey"
  FOREIGN KEY ("revoked_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "org_signer_designations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "org_signer_designations" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "org_signer_designations"
  USING ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

-- Revocar es la única modificación permitida (sin DELETE: queda el historial).
GRANT SELECT, INSERT, UPDATE ("revoked_at", "revoked_by_user_id") ON "org_signer_designations" TO adoptafacil_app;
REVOKE DELETE, TRUNCATE ON "org_signer_designations" FROM adoptafacil_app;

-- ============================================================================
-- 2. Invitación con cargo de firmante
-- ============================================================================
ALTER TABLE "organization_invitations" ADD COLUMN "signer_role" TEXT;
ALTER TABLE "organization_invitations" ADD CONSTRAINT "organization_invitations_signer_role_check"
  CHECK ("signer_role" IS NULL OR "signer_role" IN ('accountant', 'fiscal_reviewer'));

-- ============================================================================
-- 3. org_report_approvals (append-only)
-- ============================================================================
CREATE TABLE "org_report_approvals" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "report_id" UUID NOT NULL,
    "signer_role" TEXT NOT NULL,
    "signer_user_id" UUID NOT NULL,
    "legal_representative_id" UUID NOT NULL,
    "signature_hash" TEXT NOT NULL,
    "content_hash" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "decided_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "org_report_approvals_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "org_report_approvals_role_check" CHECK ("signer_role" IN ('legal_representative', 'accountant', 'fiscal_reviewer')),
    CONSTRAINT "org_report_approvals_decision_check" CHECK ("decision" IN ('approved', 'rejected'))
);

-- Una decisión por cargo y reporte: no se puede aprobar dos veces ni cambiar de parecer.
CREATE UNIQUE INDEX "org_report_approvals_report_id_signer_role_key"
  ON "org_report_approvals"("report_id", "signer_role");
CREATE INDEX "org_report_approvals_organization_id_idx" ON "org_report_approvals"("organization_id");

ALTER TABLE "org_report_approvals" ADD CONSTRAINT "org_report_approvals_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "org_report_approvals" ADD CONSTRAINT "org_report_approvals_report_id_fkey"
  FOREIGN KEY ("report_id") REFERENCES "org_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "org_report_approvals" ADD CONSTRAINT "org_report_approvals_signer_user_id_fkey"
  FOREIGN KEY ("signer_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "org_report_approvals" ADD CONSTRAINT "org_report_approvals_legal_representative_id_fkey"
  FOREIGN KEY ("legal_representative_id") REFERENCES "legal_representatives"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "org_report_approvals" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "org_report_approvals" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "org_report_approvals"
  USING ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

GRANT SELECT, INSERT ON "org_report_approvals" TO adoptafacil_app;
REVOKE UPDATE, DELETE, TRUNCATE ON "org_report_approvals" FROM adoptafacil_app;

CREATE OR REPLACE FUNCTION org_report_approvals_reject_mutation() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION
    'org_report_approvals is append-only: % is not permitted (M13)', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE TRIGGER org_report_approvals_no_update
  BEFORE UPDATE ON "org_report_approvals"
  FOR EACH ROW EXECUTE FUNCTION org_report_approvals_reject_mutation();
CREATE TRIGGER org_report_approvals_no_delete
  BEFORE DELETE ON "org_report_approvals"
  FOR EACH ROW EXECUTE FUNCTION org_report_approvals_reject_mutation();
CREATE TRIGGER org_report_approvals_no_truncate
  BEFORE TRUNCATE ON "org_report_approvals"
  FOR EACH STATEMENT EXECUTE FUNCTION org_report_approvals_reject_mutation();

-- ============================================================================
-- 4. org_report_policies
-- ============================================================================
CREATE TABLE "org_report_policies" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "required_roles" TEXT[] NOT NULL,
    "updated_by_user_id" UUID NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "org_report_policies_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "org_report_policies_kind_check" CHECK ("kind" IN ('donations', 'social_service')),
    CONSTRAINT "org_report_policies_roles_check" CHECK (
      "required_roles" <@ ARRAY['legal_representative', 'accountant', 'fiscal_reviewer']::TEXT[]
      AND 'legal_representative' = ANY("required_roles")
    )
);

CREATE UNIQUE INDEX "org_report_policies_organization_id_kind_key"
  ON "org_report_policies"("organization_id", "kind");

ALTER TABLE "org_report_policies" ADD CONSTRAINT "org_report_policies_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "org_report_policies" ADD CONSTRAINT "org_report_policies_updated_by_user_id_fkey"
  FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "org_report_policies" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "org_report_policies" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "org_report_policies"
  USING ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE ("required_roles", "updated_by_user_id", "updated_at") ON "org_report_policies" TO adoptafacil_app;
REVOKE DELETE, TRUNCATE ON "org_report_policies" FROM adoptafacil_app;

-- ============================================================================
-- 5. Verificación pública con estado de emisión
-- ============================================================================
CREATE OR REPLACE FUNCTION org_report_public(p_code text)
  RETURNS JSONB
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'code', r.code,
    'kind', r.kind,
    'organizationName', r.payload->'organization'->>'name',
    'periodStart', to_char(r.period_start, 'YYYY-MM-DD'),
    'periodEnd', to_char(r.period_end, 'YYYY-MM-DD'),
    'legalEffect', r.legal_effect,
    'status', CASE
      WHEN jsonb_array_length(r.signers) = 0 THEN 'issued'
      WHEN EXISTS (SELECT 1 FROM org_report_approvals a WHERE a.report_id = r.id AND a.decision = 'rejected') THEN 'rejected'
      WHEN (SELECT count(DISTINCT a.signer_role) FROM org_report_approvals a
            WHERE a.report_id = r.id AND a.decision = 'approved') >= jsonb_array_length(r.signers) THEN 'issued'
      ELSE 'pending_signatures'
    END,
    'signers', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('role', s->>'role', 'fullName', s->>'fullName'))
      FROM jsonb_array_elements(r.signers) AS s
    ), '[]'::jsonb),
    'rowCount', COALESCE((r.summary->>'rowCount')::int, 0),
    'contentHash', r.content_hash,
    'createdAt', to_char(r.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  )
  FROM org_reports r
  WHERE r.code = p_code;
$$;

REVOKE ALL ON FUNCTION org_report_public(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION org_report_public(text) TO adoptafacil_app;
