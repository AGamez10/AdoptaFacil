-- ============================================================================
-- Banco de recursos: "ofrecimiento abierto" + comunidad pública compartible.
--
-- 1) resource_open_offers. Desde la landing invitamos a "ofrecer lo que te
--    sobra", pero si ninguna organización tiene una necesidad publicada quien
--    llega no tenía qué hacer. Ahora puede dejar un OFRECIMIENTO ABIERTO (qué
--    tiene, cuánto y en qué ciudad). Vive en el tenant de quien lo ofrece
--    (RLS normal: solo lo ve y lo retira su dueño). Las organizaciones lo ven
--    en un tablero acotado (SECURITY DEFINER, sin identidad del donante) y,
--    al "tomarlo", se convierte en una oferta ACEPTADA sobre una necesidad
--    real de esa organización, con su entrega programada: desde ahí sigue el
--    flujo normal del banco (entrega, evidencia, cierre). Nada de dinero.
--    Medicamentos NO se aceptan como ofrecimiento abierto: solo cuando una
--    organización los pide en una necesidad concreta.
--
-- 2) community_posts.shareable. Una publicación solo se ve sin sesión (y se
--    puede compartir en redes) si su autora lo autorizó. Nada retroactivo:
--    las publicaciones existentes quedan privadas a la comunidad.
--    Las lecturas públicas nunca devuelven el id de la autora; una persona
--    aparece solo con su primer nombre y las imágenes de personas no existen
--    (solo las organizaciones adjuntan fotos).
-- ============================================================================

CREATE TABLE "resource_open_offers" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "donor_user_id" UUID NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "category" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "unit" TEXT NOT NULL,
  "department" TEXT NOT NULL,
  "city" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'open',
  "claimed_by_organization_id" UUID,
  "claimed_need_id" UUID,
  "claimed_offer_id" UUID,
  "claimed_at" TIMESTAMP(3),
  "expires_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "resource_open_offers_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "resource_open_offers_quantity_check" CHECK ("quantity" > 0 AND "quantity" <= 100000),
  CONSTRAINT "resource_open_offers_status_check" CHECK ("status" IN ('open', 'claimed', 'withdrawn')),
  CONSTRAINT "resource_open_offers_category_check" CHECK ("category" IN ('food', 'supplies', 'equipment', 'other'))
);

CREATE INDEX "resource_open_offers_organization_id_idx" ON "resource_open_offers"("organization_id");
CREATE INDEX "resource_open_offers_donor_user_id_idx" ON "resource_open_offers"("donor_user_id");
CREATE INDEX "resource_open_offers_status_expires_at_idx" ON "resource_open_offers"("status", "expires_at");

ALTER TABLE "resource_open_offers" ADD CONSTRAINT "resource_open_offers_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "resource_open_offers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "resource_open_offers" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "resource_open_offers"
  USING ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE ON "resource_open_offers" TO adoptafacil_app;
REVOKE DELETE, TRUNCATE ON "resource_open_offers" FROM adoptafacil_app;

-- Tablero para organizaciones: solo ofrecimientos abiertos y vigentes, de
-- otros tenants, sin donante ni datos de contacto.
CREATE OR REPLACE FUNCTION resource_open_offers_board(
  p_limit INTEGER, p_offset INTEGER, p_category TEXT, p_city TEXT, p_viewer_org UUID
)
  RETURNS JSONB
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH visible AS (
    SELECT * FROM "resource_open_offers" f
    WHERE f.status = 'open'
      AND f.expires_at > CURRENT_TIMESTAMP
      AND f.organization_id <> p_viewer_org
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

-- Una organización toma un ofrecimiento abierto para UNA de sus necesidades
-- activas (misma categoría y unidad) o, sin p_need_id, publica en el mismo
-- paso una necesidad nueva con lo ofrecido (título p_need_title o el del
-- ofrecimiento). Crea la oferta ya aceptada y su entrega programada, y marca
-- el ofrecimiento como tomado, todo en una transacción y con el ofrecimiento
-- bloqueado (dos organizaciones no pueden tomarlo a la vez). p_org_id lo pone
-- siempre el servidor (contexto de tenant), nunca el cliente.
-- 0 filas => no disponible o necesidad incompatible.
CREATE OR REPLACE FUNCTION claim_resource_open_offer(
  p_open_offer_id UUID, p_org_id UUID, p_need_id UUID, p_need_title TEXT
)
  RETURNS TABLE (
    offer_id UUID, need_id UUID, need_created BOOLEAN, donor_user_id UUID, donor_org_id UUID,
    title TEXT, quantity INTEGER, unit TEXT
  )
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_open "resource_open_offers";
  v_need "resource_needs";
  v_offer_id UUID := gen_random_uuid();
BEGIN
  SELECT * INTO v_open FROM "resource_open_offers" WHERE "id" = p_open_offer_id FOR UPDATE;
  IF NOT FOUND OR v_open."status" <> 'open' OR v_open."expires_at" <= CURRENT_TIMESTAMP
     OR v_open."organization_id" = p_org_id THEN
    RETURN;
  END IF;

  IF p_need_id IS NULL THEN
    INSERT INTO "resource_needs" (
      "id", "organization_id", "title", "description", "category", "quantity_needed", "unit", "status", "created_at", "updated_at"
    ) VALUES (
      gen_random_uuid(), p_org_id, left(COALESCE(NULLIF(btrim(p_need_title), ''), v_open."title"), 200),
      v_open."description", v_open."category", v_open."quantity", v_open."unit", 'needed', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    )
    RETURNING * INTO v_need;
  ELSE
    SELECT * INTO v_need FROM "resource_needs"
      WHERE "id" = p_need_id AND "organization_id" = p_org_id
        AND "status" IN ('needed', 'partially_fulfilled')
        AND "category" = v_open."category"
        AND lower(btrim("unit")) = lower(btrim(v_open."unit"));
    IF NOT FOUND THEN
      RETURN;
    END IF;
  END IF;

  INSERT INTO "resource_offers" (
    "id", "organization_id", "need_id", "donor_user_id", "quantity_offered", "message", "status", "created_at", "updated_at"
  ) VALUES (
    v_offer_id, p_org_id, v_need."id", v_open."donor_user_id", v_open."quantity",
    left('Ofrecimiento abierto: ' || v_open."title" || COALESCE(' — ' || v_open."description", ''), 1000),
    'accepted', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  );

  INSERT INTO "resource_deliveries" (
    "id", "organization_id", "offer_id", "need_id", "status", "created_at", "updated_at"
  ) VALUES (
    gen_random_uuid(), p_org_id, v_offer_id, v_need."id", 'scheduled', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  );

  UPDATE "resource_open_offers"
    SET "status" = 'claimed',
        "claimed_by_organization_id" = p_org_id,
        "claimed_need_id" = v_need."id",
        "claimed_offer_id" = v_offer_id,
        "claimed_at" = CURRENT_TIMESTAMP,
        "updated_at" = CURRENT_TIMESTAMP
    WHERE "id" = p_open_offer_id;

  RETURN QUERY SELECT v_offer_id, v_need."id", p_need_id IS NULL, v_open."donor_user_id", v_open."organization_id",
    v_open."title", v_open."quantity", v_open."unit";
END;
$$;

REVOKE ALL ON FUNCTION resource_open_offers_board(INTEGER, INTEGER, TEXT, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION claim_resource_open_offer(UUID, UUID, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION resource_open_offers_board(INTEGER, INTEGER, TEXT, TEXT, UUID) TO adoptafacil_app;
GRANT EXECUTE ON FUNCTION claim_resource_open_offer(UUID, UUID, UUID, TEXT) TO adoptafacil_app;

-- ============================================================================
-- 2) Comunidad pública compartible
-- ============================================================================
ALTER TABLE "community_posts" ADD COLUMN "shareable" BOOLEAN NOT NULL DEFAULT false;

-- Nombre público de quien publica: la organización, o el primer nombre de la
-- persona (nunca el nombre completo ni el id).
CREATE OR REPLACE FUNCTION community_public_author(p_author_name TEXT, p_org_name TEXT)
  RETURNS TEXT
  LANGUAGE sql IMMUTABLE
AS $$
  SELECT COALESCE(NULLIF(p_org_name, ''), NULLIF(split_part(btrim(p_author_name), ' ', 1), ''), 'Alguien de la comunidad');
$$;

CREATE OR REPLACE FUNCTION public_community_post_json(p "community_posts", p_org_name TEXT)
  RETURNS JSONB
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'id', p.id,
    'authorDisplayName', community_public_author(p.author_name, p_org_name),
    'isOrganization', p.organization_id IS NOT NULL,
    'organizationName', p_org_name,
    'type', p.type,
    'title', p.title,
    'body', p.body,
    'commentCount', p.comment_count,
    'likeCount', p.like_count,
    'images', CASE WHEN p.organization_id IS NULL THEN '[]'::jsonb ELSE COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', i.id, 'storageRef', i.storage_ref, 'order', i.order) ORDER BY i.order)
      FROM "community_post_images" i WHERE i.post_id = p.id
    ), '[]'::jsonb) END,
    'createdAt', to_char(p.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  );
$$;

CREATE OR REPLACE FUNCTION public_community_posts(p_limit INTEGER, p_offset INTEGER)
  RETURNS JSONB
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'items', COALESCE((SELECT jsonb_agg(item ORDER BY (item->>'createdAt') DESC) FROM (
      SELECT public_community_post_json(p, o.name) AS item
      FROM "community_posts" p
      LEFT JOIN "organizations" o ON o.id = p.organization_id
      WHERE p.status = 'published' AND p.shareable
      ORDER BY p.created_at DESC
      LIMIT LEAST(GREATEST(COALESCE(p_limit, 6), 1), 24)
      OFFSET GREATEST(COALESCE(p_offset, 0), 0)
    ) page), '[]'::jsonb),
    'total', (SELECT count(*) FROM "community_posts" WHERE "status" = 'published' AND "shareable")
  );
$$;

CREATE OR REPLACE FUNCTION public_community_post(p_id UUID)
  RETURNS JSONB
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public_community_post_json(p, o.name)
  FROM "community_posts" p
  LEFT JOIN "organizations" o ON o.id = p.organization_id
  WHERE p.id = p_id AND p.status = 'published' AND p.shareable;
$$;

-- Solo la autora decide si su publicación es pública y compartible.
CREATE OR REPLACE FUNCTION community_post_set_shareable(p_id UUID, p_author_user_id UUID, p_shareable BOOLEAN)
  RETURNS BOOLEAN
  LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
  WITH changed AS (
    UPDATE "community_posts" SET "shareable" = p_shareable, "updated_at" = CURRENT_TIMESTAMP
      WHERE "id" = p_id AND "author_user_id" = p_author_user_id
      RETURNING 1
  )
  SELECT EXISTS (SELECT 1 FROM changed);
$$;

REVOKE ALL ON FUNCTION public_community_post_json("community_posts", TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public_community_posts(INTEGER, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public_community_post(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION community_post_set_shareable(UUID, UUID, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public_community_posts(INTEGER, INTEGER) TO adoptafacil_app;
GRANT EXECUTE ON FUNCTION public_community_post(UUID) TO adoptafacil_app;
GRANT EXECUTE ON FUNCTION community_post_set_shareable(UUID, UUID, BOOLEAN) TO adoptafacil_app;

-- El feed, "mis publicaciones" y el permalink autenticados exponen ahora
-- `shareable` (misma firma, solo se agrega la clave al JSON).
CREATE OR REPLACE FUNCTION community_posts_feed(p_limit INTEGER, p_offset INTEGER, p_type TEXT)
  RETURNS JSONB
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'items', COALESCE((SELECT jsonb_agg(item ORDER BY (item->>'createdAt') DESC) FROM (
      SELECT jsonb_build_object(
        'id', p.id,
        'organizationId', p.organization_id,
        'organizationName', o.name,
        'authorUserId', p.author_user_id,
        'authorName', p.author_name,
        'type', p.type,
        'title', p.title,
        'body', p.body,
        'status', p.status,
        'commentCount', p.comment_count,
        'likeCount', p.like_count,
        'shareable', p.shareable,
        'images', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'id', i.id, 'storageRef', i.storage_ref, 'order', i.order
          ) ORDER BY i.order)
          FROM "community_post_images" i WHERE i.post_id = p.id
        ), '[]'::jsonb),
        'createdAt', to_char(p.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'updatedAt', to_char(p.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
      ) AS item
      FROM "community_posts" p
      LEFT JOIN "organizations" o ON o.id = p.organization_id
      WHERE p.status = 'published'
        AND (p_type IS NULL OR p.type = p_type)
      ORDER BY p.created_at DESC
      LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50)
      OFFSET GREATEST(COALESCE(p_offset, 0), 0)
    ) page), '[]'::jsonb),
    'total', (SELECT count(*) FROM "community_posts"
      WHERE "status" = 'published' AND (p_type IS NULL OR "type" = p_type))
  );
$$;

CREATE OR REPLACE FUNCTION community_posts_by_author(p_author_user_id UUID, p_limit INTEGER, p_offset INTEGER)
  RETURNS JSONB
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'items', COALESCE((SELECT jsonb_agg(item ORDER BY (item->>'createdAt') DESC) FROM (
      SELECT jsonb_build_object(
        'id', p.id,
        'organizationId', p.organization_id,
        'organizationName', o.name,
        'authorUserId', p.author_user_id,
        'authorName', p.author_name,
        'type', p.type,
        'title', p.title,
        'body', p.body,
        'status', p.status,
        'commentCount', p.comment_count,
        'likeCount', p.like_count,
        'shareable', p.shareable,
        'moderationReason', p.moderation_reason,
        'images', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'id', i.id, 'storageRef', i.storage_ref, 'order', i.order
          ) ORDER BY i.order)
          FROM "community_post_images" i WHERE i.post_id = p.id
        ), '[]'::jsonb),
        'createdAt', to_char(p.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'updatedAt', to_char(p.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
      ) AS item
      FROM "community_posts" p
      LEFT JOIN "organizations" o ON o.id = p.organization_id
      WHERE p.author_user_id = p_author_user_id
      ORDER BY p.created_at DESC
      LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50)
      OFFSET GREATEST(COALESCE(p_offset, 0), 0)
    ) page), '[]'::jsonb),
    'total', (SELECT count(*) FROM "community_posts" WHERE "author_user_id" = p_author_user_id)
  );
$$;

CREATE OR REPLACE FUNCTION community_post_get(p_id UUID)
  RETURNS JSONB
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'id', p.id,
    'organizationId', p.organization_id,
    'organizationName', o.name,
    'authorUserId', p.author_user_id,
    'authorName', p.author_name,
    'type', p.type,
    'title', p.title,
    'body', p.body,
    'status', p.status,
    'commentCount', p.comment_count,
    'likeCount', p.like_count,
        'shareable', p.shareable,
    'images', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', i.id, 'storageRef', i.storage_ref, 'order', i.order
      ) ORDER BY i.order)
      FROM "community_post_images" i WHERE i.post_id = p.id
    ), '[]'::jsonb),
    'createdAt', to_char(p.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'updatedAt', to_char(p.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  )
  FROM "community_posts" p
  LEFT JOIN "organizations" o ON o.id = p.organization_id
  WHERE p.id = p_id AND p.status = 'published';
$$;

