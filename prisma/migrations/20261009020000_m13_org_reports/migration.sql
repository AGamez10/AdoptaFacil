-- M13 · Reportes de la organización (donaciones y servicio social).
--
-- 1. org_reports: reporte SELLADO (snapshot + firmantes + SHA-256), tenant-scoped
--    (RLS ENABLE+FORCE+tenant_isolation), APPEND-ONLY e IDEMPOTENTE por
--    (organization_id, kind, content_hash).
-- 2. org_report_public(code): verificación pública por folio, superficie mínima
--    (sin datos de donantes ni de voluntarios).
-- 3. donation_certificate_public(code): deja de exponer el nombre completo del
--    donante en la verificación pública (el código tiene solo 10^6 valores por
--    año y la ruta no exige sesión: era enumerable). Ahora devuelve el nombre
--    enmascarado ("María R.") y "Donante anónimo" si la donación es anónima.
--    Misma forma JSON, solo cambia el valor de `donorName`.

-- ============================================================================
-- 1. org_reports
-- ============================================================================
CREATE TABLE "org_reports" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "period_start" DATE NOT NULL,
    "period_end" DATE NOT NULL,
    "filters" JSONB NOT NULL DEFAULT '{}',
    "legal_effect" TEXT NOT NULL,
    "signers" JSONB NOT NULL DEFAULT '[]',
    "payload" JSONB NOT NULL,
    "summary" JSONB NOT NULL,
    "content_hash" TEXT NOT NULL,
    "generated_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "org_reports_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "org_reports_kind_check" CHECK ("kind" IN ('donations', 'social_service')),
    CONSTRAINT "org_reports_legal_effect_check" CHECK ("legal_effect" IN ('informative', 'signed', 'certified')),
    CONSTRAINT "org_reports_period_check" CHECK ("period_start" <= "period_end")
);

CREATE UNIQUE INDEX "org_reports_code_key" ON "org_reports"("code");
CREATE UNIQUE INDEX "org_reports_organization_id_kind_content_hash_key" ON "org_reports"("organization_id", "kind", "content_hash");
CREATE INDEX "org_reports_organization_id_created_at_idx" ON "org_reports"("organization_id", "created_at");

ALTER TABLE "org_reports" ADD CONSTRAINT "org_reports_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "org_reports" ADD CONSTRAINT "org_reports_generated_by_user_id_fkey"
  FOREIGN KEY ("generated_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "org_reports" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "org_reports" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "org_reports"
  USING ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

GRANT SELECT, INSERT ON "org_reports" TO adoptafacil_app;
REVOKE UPDATE, DELETE, TRUNCATE ON "org_reports" FROM adoptafacil_app;

CREATE OR REPLACE FUNCTION org_reports_reject_mutation() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION
    'org_reports is append-only: % is not permitted (M13)', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE TRIGGER org_reports_no_update
  BEFORE UPDATE ON "org_reports"
  FOR EACH ROW EXECUTE FUNCTION org_reports_reject_mutation();

CREATE TRIGGER org_reports_no_delete
  BEFORE DELETE ON "org_reports"
  FOR EACH ROW EXECUTE FUNCTION org_reports_reject_mutation();

CREATE TRIGGER org_reports_no_truncate
  BEFORE TRUNCATE ON "org_reports"
  FOR EACH STATEMENT EXECUTE FUNCTION org_reports_reject_mutation();

-- ============================================================================
-- 2. Verificación pública por folio. Solo lo impreso en el pie del documento:
--    organización, tipo, período, valor legal, nombres/rol de firmantes,
--    número de filas y hash. Nunca ids internos ni datos de donantes/voluntarios.
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

-- ============================================================================
-- 3. Verificación pública de certificados de donación sin fuga del donante.
-- ============================================================================
CREATE OR REPLACE FUNCTION mask_person_name(p_name text)
  RETURNS text
  LANGUAGE sql
  IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_name IS NULL OR btrim(p_name) = '' THEN 'Donante'
    ELSE (
      SELECT string_agg(CASE WHEN t.ord = 1 THEN t.w ELSE left(t.w, 1) || '.' END, ' ' ORDER BY t.ord)
      FROM regexp_split_to_table(btrim(p_name), '\s+') WITH ORDINALITY AS t(w, ord)
    )
  END;
$$;

CREATE OR REPLACE FUNCTION donation_certificate_public(p_code text)
  RETURNS JSONB
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'code', c.code,
    'organizationName', c.payload->>'organizationName',
    'organizationNit', c.payload->>'organizationNit',
    'donorName', CASE WHEN d.anonymous THEN 'Donante anónimo'
                      ELSE mask_person_name(c.payload->>'donorName') END,
    'amount', (c.payload->>'amount')::int,
    'currency', c.payload->>'currency',
    'issuedAt', to_char(c.issued_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'contentHash', c.content_hash
  )
  FROM donation_certificates c
  JOIN donations d ON d.id = c.donation_id
  WHERE c.code = p_code;
$$;
