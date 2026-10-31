-- M13 · Solicitudes de firma por correo para contador y revisor fiscal.
--
-- El contador y el revisor fiscal no necesitan una cuenta con contraseña: cada
-- documento que lleva su firma les llega por correo con un enlace de un solo
-- uso que vence. Con ese enlace ven el documento y lo aprueban o rechazan (la
-- primera vez registran además su firma, que queda cifrada en la organización
-- y solo se estampa en lo que ellos aprueban uno a uno).
--
-- Solo se guarda el SHA-256 del token; el token vive únicamente en el correo.
--
-- Reversión:
--   DROP FUNCTION org_signature_request_by_token_hash(TEXT);
--   DROP TABLE org_signature_requests;

CREATE TABLE "org_signature_requests" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "report_id" UUID NOT NULL,
    "signer_role" TEXT NOT NULL,
    "signer_user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "org_signature_requests_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "org_signature_requests_role_check" CHECK ("signer_role" IN ('legal_representative', 'accountant', 'fiscal_reviewer'))
);

CREATE UNIQUE INDEX "org_signature_requests_token_hash_key" ON "org_signature_requests"("token_hash");
CREATE INDEX "org_signature_requests_organization_id_report_id_idx"
  ON "org_signature_requests"("organization_id", "report_id");

ALTER TABLE "org_signature_requests" ADD CONSTRAINT "org_signature_requests_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "org_signature_requests" ADD CONSTRAINT "org_signature_requests_report_id_fkey"
  FOREIGN KEY ("report_id") REFERENCES "org_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "org_signature_requests" ADD CONSTRAINT "org_signature_requests_signer_user_id_fkey"
  FOREIGN KEY ("signer_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "org_signature_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "org_signature_requests" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "org_signature_requests"
  USING ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

-- Usar el enlace es la única modificación permitida.
GRANT SELECT, INSERT, UPDATE ("used_at") ON "org_signature_requests" TO adoptafacil_app;
REVOKE DELETE, TRUNCATE ON "org_signature_requests" FROM adoptafacil_app;

-- Quien abre el enlace no tiene tenant todavía: esta búsqueda acotada solo
-- devuelve a qué organización pertenece el token (nada más); el resto se lee
-- bajo el contexto de esa organización.
CREATE OR REPLACE FUNCTION org_signature_request_by_token_hash(p_token_hash TEXT)
  RETURNS JSONB
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object('id', r.id, 'organizationId', r.organization_id)
  FROM org_signature_requests r
  WHERE r.token_hash = p_token_hash
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION org_signature_request_by_token_hash(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION org_signature_request_by_token_hash(TEXT) TO adoptafacil_app;
