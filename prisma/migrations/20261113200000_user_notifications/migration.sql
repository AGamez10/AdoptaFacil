-- ============================================================================
-- Avisos en la plataforma (bandeja por persona) + banco de recursos visible.
--
-- 1) user_notifications. Hasta ahora la campana solo calculaba pendientes del
--    equipo de una organización (solicitudes sin revisar, documentos, vacunas)
--    y quien dona, se inscribe o adopta no recibía ningún aviso dentro de la
--    plataforma. Esta tabla guarda un aviso por persona: qué pasó, un texto
--    corto y a qué pantalla llevar. Vive en el tenant de quien lo RECIBE
--    (RLS normal: cada quien lee y marca como leídos solo los suyos).
--    Sin datos sensibles: nada de documentos, correos ni teléfonos en el texto.
--
--    Escribir el aviso de OTRA cuenta (p. ej. la organización acepta la oferta
--    de una persona) pasa por funciones SECURITY DEFINER acotadas que solo
--    insertan y resuelven el tenant del destinatario en la base, nunca desde
--    el cliente:
--      * notify_user(...)        → una persona (devuelve su correo y nombre
--                                  para el correo opcional del servidor);
--      * notify_org_staff(...)   → las personas de una organización con
--                                  alguno de los cargos indicados;
--      * notify_orgs_in_department(...) → equipos de las organizaciones
--                                  aprobadas de un departamento (ofrecimientos
--                                  abiertos del banco de recursos).
--    `dedupe_key` evita el mismo aviso dos veces a la misma persona (un
--    reintento o un doble clic no duplica).
--
-- 2) Banco de recursos: los ofrecimientos abiertos solo se veían en el tablero
--    de OTRAS organizaciones. Quien ofrecía desde el equipo de una
--    organización no lo veía nadie de su equipo, y el público no lo veía en
--    ninguna parte. Ahora:
--      * resource_open_offers_board incluye los de la propia organización
--        marcados como `fromYourOrganization` (no se pueden tomar);
--      * public_resource_open_offers: lista pública y anónima (sin donante,
--        sin organización) para /recursos y la landing.
-- ============================================================================

CREATE TABLE "user_notifications" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "kind" TEXT NOT NULL,
  "tone" TEXT NOT NULL DEFAULT 'info',
  "title" TEXT NOT NULL,
  "body" TEXT,
  "href" TEXT,
  "dedupe_key" TEXT,
  "read_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "user_notifications_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "user_notifications_tone_check" CHECK ("tone" IN ('info', 'success', 'warning', 'kudos')),
  CONSTRAINT "user_notifications_kind_format" CHECK ("kind" ~ '^[a-z_]+\.[a-z_]+$' AND length("kind") <= 80),
  CONSTRAINT "user_notifications_title_len" CHECK (length("title") BETWEEN 1 AND 200),
  CONSTRAINT "user_notifications_body_len" CHECK ("body" IS NULL OR length("body") <= 600),
  -- Solo rutas internas de la aplicación (nada de enlaces externos).
  CONSTRAINT "user_notifications_href_internal" CHECK ("href" IS NULL OR ("href" ~ '^/[^/]' AND length("href") <= 300))
);

CREATE INDEX "user_notifications_organization_id_idx" ON "user_notifications"("organization_id");
CREATE INDEX "user_notifications_user_created_idx" ON "user_notifications"("user_id", "created_at" DESC);
CREATE UNIQUE INDEX "user_notifications_user_dedupe_key" ON "user_notifications"("user_id", "dedupe_key");

ALTER TABLE "user_notifications" ADD CONSTRAINT "user_notifications_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_notifications" ADD CONSTRAINT "user_notifications_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "user_notifications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "user_notifications" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "user_notifications"
  USING ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

-- La app lee, inserta en su propio tenant y solo puede marcar como leído.
GRANT SELECT, INSERT ON "user_notifications" TO adoptafacil_app;
GRANT UPDATE ("read_at") ON "user_notifications" TO adoptafacil_app;
REVOKE DELETE, TRUNCATE ON "user_notifications" FROM adoptafacil_app;

-- Aviso a UNA persona, en su propio tenant (resuelto aquí, no por el cliente).
-- Devuelve su correo y nombre para que el servidor decida si también envía
-- correo; 0 filas = la persona no existe.
CREATE OR REPLACE FUNCTION notify_user(
  p_user_id UUID, p_kind TEXT, p_tone TEXT, p_title TEXT, p_body TEXT, p_href TEXT, p_dedupe_key TEXT
)
  RETURNS TABLE (email TEXT, display_name TEXT, inserted BOOLEAN)
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_user "users";
  v_count INTEGER;
BEGIN
  SELECT * INTO v_user FROM "users" u WHERE u."id" = p_user_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  INSERT INTO "user_notifications" ("organization_id", "user_id", "kind", "tone", "title", "body", "href", "dedupe_key")
    VALUES (v_user."organization_id", v_user."id", p_kind, COALESCE(p_tone, 'info'),
            left(p_title, 200), left(p_body, 600), p_href, p_dedupe_key)
    ON CONFLICT ("user_id", "dedupe_key") DO NOTHING;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN QUERY SELECT v_user."email", v_user."display_name", v_count > 0;
END;
$$;

-- Aviso al equipo de una organización con alguno de los cargos indicados.
-- Devuelve cuántas personas lo recibieron.
CREATE OR REPLACE FUNCTION notify_org_staff(
  p_org_id UUID, p_roles TEXT[], p_kind TEXT, p_tone TEXT, p_title TEXT, p_body TEXT, p_href TEXT, p_dedupe_key TEXT,
  p_exclude_user_id UUID
)
  RETURNS INTEGER
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  INSERT INTO "user_notifications" ("organization_id", "user_id", "kind", "tone", "title", "body", "href", "dedupe_key")
    SELECT DISTINCT u."organization_id", u."id", p_kind, COALESCE(p_tone, 'info'),
           left(p_title, 200), left(p_body, 600), p_href, p_dedupe_key
    FROM "user_roles" r
    JOIN "users" u ON u."id" = r."user_id" AND u."organization_id" = r."organization_id"
    WHERE r."organization_id" = p_org_id
      AND r."role" = ANY (p_roles)
      AND (p_exclude_user_id IS NULL OR u."id" <> p_exclude_user_id)
    ON CONFLICT ("user_id", "dedupe_key") DO NOTHING;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- Aviso a los equipos de las organizaciones APROBADAS de un departamento
-- (sin contar la de quien ofrece). Acotado a 200 organizaciones por llamada.
CREATE OR REPLACE FUNCTION notify_orgs_in_department(
  p_department TEXT, p_exclude_org_id UUID, p_roles TEXT[], p_kind TEXT, p_tone TEXT, p_title TEXT, p_body TEXT,
  p_href TEXT, p_dedupe_key TEXT
)
  RETURNS INTEGER
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  INSERT INTO "user_notifications" ("organization_id", "user_id", "kind", "tone", "title", "body", "href", "dedupe_key")
    SELECT DISTINCT u."organization_id", u."id", p_kind, COALESCE(p_tone, 'info'),
           left(p_title, 200), left(p_body, 600), p_href, p_dedupe_key
    FROM (
      SELECT o."id"
      FROM "organizations" o
      JOIN "organization_profiles" pr ON pr."organization_id" = o."id"
      WHERE o."status" = 'approved'
        AND o."id" <> p_exclude_org_id
        AND lower(btrim(pr."location"->>'department')) = lower(btrim(p_department))
      ORDER BY o."id"
      LIMIT 200
    ) orgs
    JOIN "user_roles" r ON r."organization_id" = orgs."id" AND r."role" = ANY (p_roles)
    JOIN "users" u ON u."id" = r."user_id" AND u."organization_id" = r."organization_id"
    ON CONFLICT ("user_id", "dedupe_key") DO NOTHING;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION notify_user(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION notify_org_staff(UUID, TEXT[], TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION notify_orgs_in_department(TEXT, UUID, TEXT[], TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION notify_user(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO adoptafacil_app;
GRANT EXECUTE ON FUNCTION notify_org_staff(UUID, TEXT[], TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID) TO adoptafacil_app;
GRANT EXECUTE ON FUNCTION notify_orgs_in_department(TEXT, UUID, TEXT[], TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO adoptafacil_app;

-- ============================================================================
-- 2) Banco de recursos visible
-- ============================================================================

-- Tablero de organizaciones: ahora también los ofrecimientos de la propia
-- organización (los publicó alguien de su equipo), marcados para que la
-- pantalla no ofrezca "tomarlo" (claim_resource_open_offer ya lo impide).
CREATE OR REPLACE FUNCTION resource_open_offers_board(
  p_limit INTEGER, p_offset INTEGER, p_category TEXT, p_city TEXT, p_viewer_org UUID
)
  RETURNS JSONB
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  WITH visible AS (
    SELECT * FROM "resource_open_offers" f
    WHERE f.status = 'open'
      AND f.expires_at > CURRENT_TIMESTAMP
      AND (p_category IS NULL OR f.category = p_category)
      AND (p_city IS NULL OR lower(f.city) = lower(p_city))
  )
  SELECT jsonb_build_object(
    'items', COALESCE((SELECT jsonb_agg(item ORDER BY (item->>'createdAt') DESC) FROM (
      SELECT jsonb_build_object(
        'id', v.id,
        'title', v.title,
        'description', v.description,
        'category', v.category,
        'quantity', v.quantity,
        'unit', v.unit,
        'department', v.department,
        'city', v.city,
        'fromYourOrganization', v.organization_id = p_viewer_org,
        'createdAt', to_char(v.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'expiresAt', to_char(v.expires_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
      ) AS item
      FROM visible v
      ORDER BY v.created_at DESC
      LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50)
      OFFSET GREATEST(COALESCE(p_offset, 0), 0)
    ) page), '[]'::jsonb),
    'total', (SELECT count(*) FROM visible)
  );
$$;

-- Lista PÚBLICA y anónima de ofrecimientos abiertos y vigentes: qué, cuánto,
-- dónde y hasta cuándo. Nunca el donante ni su organización ni su id.
CREATE OR REPLACE FUNCTION public_resource_open_offers(p_limit INTEGER, p_offset INTEGER)
  RETURNS JSONB
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  WITH visible AS (
    SELECT * FROM "resource_open_offers" f
    WHERE f.status = 'open' AND f.expires_at > CURRENT_TIMESTAMP
  )
  SELECT jsonb_build_object(
    'items', COALESCE((SELECT jsonb_agg(item ORDER BY (item->>'createdAt') DESC) FROM (
      SELECT jsonb_build_object(
        'id', v.id,
        'title', v.title,
        'description', v.description,
        'category', v.category,
        'quantity', v.quantity,
        'unit', v.unit,
        'department', v.department,
        'city', v.city,
        'createdAt', to_char(v.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'expiresAt', to_char(v.expires_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
      ) AS item
      FROM visible v
      ORDER BY v.created_at DESC
      LIMIT LEAST(GREATEST(COALESCE(p_limit, 12), 1), 50)
      OFFSET GREATEST(COALESCE(p_offset, 0), 0)
    ) page), '[]'::jsonb),
    'total', (SELECT count(*) FROM visible)
  );
$$;

REVOKE ALL ON FUNCTION public_resource_open_offers(INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public_resource_open_offers(INTEGER, INTEGER) TO adoptafacil_app;
