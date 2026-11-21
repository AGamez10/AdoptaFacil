-- Dominio propio del portal (plan Pro). La organización compra su dominio y lo
-- apunta a AdoptaFácil; aquí queda la solicitud y su verificación por DNS.
-- Estados: pending_dns (esperando los registros), active (verificado). Si el
-- plan deja de incluir el dominio, el portal deja de responder en él (lo
-- decide la API al consultar, sin borrar la fila).
CREATE TABLE "portal_custom_domains" (
  "id"                 UUID        NOT NULL,
  "organization_id"    UUID        NOT NULL,
  "domain"             TEXT        NOT NULL,
  "status"             TEXT        NOT NULL DEFAULT 'pending_dns',
  "verification_token" TEXT        NOT NULL,
  "last_checked_at"    TIMESTAMP(3),
  "last_error"         TEXT,
  "verified_at"        TIMESTAMP(3),
  "created_by_user_id" UUID,
  "created_at"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"         TIMESTAMP(3) NOT NULL,
  CONSTRAINT "portal_custom_domains_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "portal_custom_domains_status_check" CHECK ("status" IN ('pending_dns', 'active')),
  CONSTRAINT "portal_custom_domains_domain_check"
    CHECK ("domain" ~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{0,61}[a-z0-9]$'
           AND length("domain") <= 253)
);

-- Una solicitud por organización. Varias organizaciones pueden pedir el mismo
-- dominio mientras nadie lo verifica (así nadie lo bloquea a su dueño real);
-- activo, solo uno.
CREATE UNIQUE INDEX "portal_custom_domains_organization_id_key" ON "portal_custom_domains"("organization_id");
CREATE UNIQUE INDEX "portal_custom_domains_active_domain_key"
  ON "portal_custom_domains"("domain") WHERE "status" = 'active';
CREATE INDEX "portal_custom_domains_domain_idx" ON "portal_custom_domains"("domain");

ALTER TABLE "portal_custom_domains" ADD CONSTRAINT "portal_custom_domains_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "portal_custom_domains" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "portal_custom_domains" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "portal_custom_domains"
  USING ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON "portal_custom_domains" TO adoptafacil_app;

-- Lo público: ¿qué organización sirve este host? Solo dominios verificados.
-- Devuelve la organización (para comprobar su plan en la API) y su slug
-- público (organization_profiles).
CREATE OR REPLACE FUNCTION portal_custom_domain_owner(p_host TEXT)
  RETURNS TABLE (organization_id UUID, slug TEXT)
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
  SELECT d.organization_id, p.slug
  FROM portal_custom_domains d
  JOIN organization_profiles p ON p.organization_id = d.organization_id
  WHERE d.status = 'active' AND d.domain = lower(p_host)
  LIMIT 1;
$$;

-- ¿Ya está verificado este dominio por OTRA organización? (para avisar antes
-- de activar; no dice cuál).
CREATE OR REPLACE FUNCTION portal_custom_domain_taken(p_domain TEXT, p_org UUID)
  RETURNS BOOLEAN
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM portal_custom_domains
    WHERE status = 'active' AND domain = lower(p_domain) AND organization_id <> p_org
  );
$$;

REVOKE ALL ON FUNCTION portal_custom_domain_owner(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION portal_custom_domain_taken(TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION portal_custom_domain_owner(TEXT) TO adoptafacil_app;
GRANT EXECUTE ON FUNCTION portal_custom_domain_taken(TEXT, UUID) TO adoptafacil_app;
