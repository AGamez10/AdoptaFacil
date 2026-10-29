-- ============================================================================
-- QR fijo por organización (portals). Una etiqueta impresa que nunca cambia
-- (`/q/<code>`) y un destino que la organización elige desde su panel:
-- donar, una de sus campañas activas o apadrinar uno de sus animales.
--
-- El destino se guarda como tipo + id, nunca como URL: no hay redirección
-- abierta posible. La lectura pública pasa por `resolve_organization_qr`
-- (SECURITY DEFINER acotada, mismo patrón que `organization_portal_theme`).
-- ============================================================================

CREATE TABLE "organization_qr_links" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "target_kind" TEXT NOT NULL DEFAULT 'donate',
    "target_id" UUID,
    "updated_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_qr_links_pkey" PRIMARY KEY ("id"),
    -- 8 caracteres sin 0/1/i/l/o (fáciles de confundir si alguien lo dicta).
    CONSTRAINT "organization_qr_links_code_format" CHECK ("code" ~ '^[a-hjkmnp-z2-9]{8}$'),
    CONSTRAINT "organization_qr_links_target_kind" CHECK ("target_kind" IN ('donate', 'campaign', 'animal')),
    CONSTRAINT "organization_qr_links_target_id" CHECK (("target_kind" = 'donate') = ("target_id" IS NULL))
);

CREATE UNIQUE INDEX "organization_qr_links_organization_id_key" ON "organization_qr_links"("organization_id");
CREATE UNIQUE INDEX "organization_qr_links_code_key" ON "organization_qr_links"("code");
CREATE INDEX "organization_qr_links_organization_id_idx" ON "organization_qr_links"("organization_id");

ALTER TABLE "organization_qr_links" ADD CONSTRAINT "organization_qr_links_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- El código es la etiqueta impresa: nadie lo cambia, ni siquiera el superusuario.
CREATE OR REPLACE FUNCTION organization_qr_links_code_immutable()
  RETURNS TRIGGER
  LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."code" IS DISTINCT FROM OLD."code" THEN
    RAISE EXCEPTION 'organization_qr_links.code is immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER organization_qr_links_code_immutable
  BEFORE UPDATE ON "organization_qr_links"
  FOR EACH ROW EXECUTE FUNCTION organization_qr_links_code_immutable();

ALTER TABLE "organization_qr_links" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "organization_qr_links" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "organization_qr_links"
  USING ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

-- Sin DELETE: el QR vive lo que vive la organización.
GRANT SELECT, INSERT, UPDATE ON "organization_qr_links" TO adoptafacil_app;

-- ----------------------------------------------------------------------------
-- Contador diario de escaneos (solo totales, sin datos personales).
-- ----------------------------------------------------------------------------
CREATE TABLE "organization_qr_scan_days" (
    "organization_id" UUID NOT NULL,
    "day" DATE NOT NULL,
    "target_kind" TEXT NOT NULL,
    "scans" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "organization_qr_scan_days_pkey" PRIMARY KEY ("organization_id", "day", "target_kind")
);

CREATE INDEX "organization_qr_scan_days_organization_id_idx" ON "organization_qr_scan_days"("organization_id");

ALTER TABLE "organization_qr_scan_days" ADD CONSTRAINT "organization_qr_scan_days_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "organization_qr_scan_days" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "organization_qr_scan_days" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "organization_qr_scan_days"
  USING ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

-- La org solo lee su contador; lo escribe únicamente la función de abajo.
GRANT SELECT ON "organization_qr_scan_days" TO adoptafacil_app;

-- ----------------------------------------------------------------------------
-- Resolución pública de un escaneo. Devuelve SOLO el slug de la org y el
-- destino ya validado (tipo + id), o NULL si el código no existe o la org no
-- tiene slug. Si el destino guardado dejó de ser válido (campaña cerrada,
-- animal adoptado, plan inactivo) cae a 'donate' de la misma org. Suma un
-- escaneo al contador del día (UTC).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION resolve_organization_qr(p_code TEXT)
  RETURNS JSONB
  LANGUAGE plpgsql
  VOLATILE
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  q organization_qr_links%ROWTYPE;
  v_slug TEXT;
  v_kind TEXT := 'donate';
  v_target UUID := NULL;
BEGIN
  IF p_code IS NULL OR p_code !~ '^[a-hjkmnp-z2-9]{8}$' THEN
    RETURN NULL;
  END IF;

  SELECT * INTO q FROM organization_qr_links WHERE code = p_code;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT slug INTO v_slug FROM organization_profiles WHERE organization_id = q.organization_id;
  IF v_slug IS NULL THEN
    RETURN NULL;
  END IF;

  IF q.target_kind = 'campaign' THEN
    PERFORM 1 FROM campaigns c
      WHERE c.id = q.target_id
        AND c.organization_id = q.organization_id
        AND c.status = 'active';
    IF FOUND THEN
      v_kind := 'campaign';
      v_target := q.target_id;
    END IF;
  ELSIF q.target_kind = 'animal' THEN
    PERFORM 1 FROM animals a
      WHERE a.id = q.target_id
        AND a.organization_id = q.organization_id
        AND a.is_active = TRUE
        AND a.status = 'available'
        AND EXISTS (
          SELECT 1 FROM sponsorship_plans sp
          WHERE sp.animal_id = a.id
            AND sp.organization_id = q.organization_id
            AND sp.is_active = TRUE
        );
    IF FOUND THEN
      v_kind := 'animal';
      v_target := q.target_id;
    END IF;
  END IF;

  INSERT INTO organization_qr_scan_days ("organization_id", "day", "target_kind", "scans")
    VALUES (q.organization_id, (now() AT TIME ZONE 'UTC')::date, v_kind, 1)
    ON CONFLICT ("organization_id", "day", "target_kind")
    DO UPDATE SET "scans" = organization_qr_scan_days."scans" + 1;

  RETURN jsonb_build_object('slug', v_slug, 'kind', v_kind, 'targetId', v_target);
END;
$$;

REVOKE ALL ON FUNCTION resolve_organization_qr(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION resolve_organization_qr(TEXT) TO adoptafacil_app;
