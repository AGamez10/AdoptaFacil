-- M11 · Comunidad, primer corte del ecosistema: directorio de servicios con
-- reseñas moderadas + ficha privada de mascota. Detrás de FEATURE_COMMUNITY.

-- CreateTable
CREATE TABLE "community_service_listings" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "created_by_user_id" UUID NOT NULL,
    "category" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "department" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "address" TEXT,
    "phone" TEXT,
    "whatsapp" TEXT,
    "website" TEXT,
    "email" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "moderation_reason" TEXT,
    "moderated_by_user_id" UUID,
    "moderated_at" TIMESTAMP(3),
    "is_partner" BOOLEAN NOT NULL DEFAULT false,
    "partner_since" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "community_service_listings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "community_service_listing_reviews" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "listing_id" UUID NOT NULL,
    "author_user_id" UUID NOT NULL,
    "author_name" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "moderation_reason" TEXT,
    "moderated_by_user_id" UUID,
    "moderated_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "community_service_listing_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "community_pet_profiles" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "owner_user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "species" TEXT NOT NULL,
    "breed" TEXT,
    "sex" TEXT,
    "birth_date" DATE,
    "sterilized" BOOLEAN,
    "adopted_from" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "community_pet_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "community_service_listings_organization_id_idx" ON "community_service_listings"("organization_id");

-- CreateIndex
CREATE INDEX "community_service_listings_status_category_idx" ON "community_service_listings"("status", "category");

-- CreateIndex
CREATE UNIQUE INDEX "community_service_listings_organization_id_name_key" ON "community_service_listings"("organization_id", "name");

-- CreateIndex
CREATE INDEX "community_service_listing_reviews_organization_id_idx" ON "community_service_listing_reviews"("organization_id");

-- CreateIndex
CREATE INDEX "community_service_listing_reviews_status_idx" ON "community_service_listing_reviews"("status");

-- CreateIndex
CREATE UNIQUE INDEX "community_service_listing_reviews_listing_id_author_user_id_key" ON "community_service_listing_reviews"("listing_id", "author_user_id");

-- CreateIndex
CREATE INDEX "community_pet_profiles_organization_id_idx" ON "community_pet_profiles"("organization_id");

-- CreateIndex
CREATE INDEX "community_pet_profiles_owner_user_id_idx" ON "community_pet_profiles"("owner_user_id");

-- AddForeignKey
ALTER TABLE "community_service_listing_reviews" ADD CONSTRAINT "community_service_listing_reviews_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "community_service_listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Reglas de dominio en la base (no solo en la app).
ALTER TABLE "community_service_listings"
  ADD CONSTRAINT "community_service_listings_category_check"
    CHECK ("category" IN ('veterinary', 'grooming', 'walking', 'pet_shop')),
  ADD CONSTRAINT "community_service_listings_status_check"
    CHECK ("status" IN ('pending', 'approved', 'rejected', 'hidden'));
ALTER TABLE "community_service_listing_reviews"
  ADD CONSTRAINT "community_service_listing_reviews_rating_check" CHECK ("rating" BETWEEN 1 AND 5),
  ADD CONSTRAINT "community_service_listing_reviews_status_check"
    CHECK ("status" IN ('pending', 'approved', 'rejected', 'hidden'));
ALTER TABLE "community_pet_profiles"
  ADD CONSTRAINT "community_pet_profiles_species_check" CHECK ("species" IN ('dog', 'cat', 'other')),
  ADD CONSTRAINT "community_pet_profiles_sex_check"
    CHECK ("sex" IS NULL OR "sex" IN ('male', 'female', 'unknown'));

-- FK a organizations (modelada en Prisma con su campo de vuelta en org.prisma).
ALTER TABLE "community_service_listings" ADD CONSTRAINT "community_service_listings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "community_service_listing_reviews" ADD CONSTRAINT "community_service_listing_reviews_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "community_pet_profiles" ADD CONSTRAINT "community_pet_profiles_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================================
-- ROW-LEVEL SECURITY (RNF03). Las tres tablas son datos de negocio por tenant.
-- ============================================================================

ALTER TABLE "community_service_listings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "community_service_listings" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "community_service_listings"
  USING ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

ALTER TABLE "community_service_listing_reviews" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "community_service_listing_reviews" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "community_service_listing_reviews"
  USING ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

ALTER TABLE "community_pet_profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "community_pet_profiles" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "community_pet_profiles"
  USING ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

-- ============================================================================
-- MÍNIMO PRIVILEGIO. El negocio escribe el contenido de SU perfil, nunca su
-- estado de moderación ni su marca de aliado: UPDATE por columna (sin
-- `status`, `moderation_*` ni `is_partner`/`partner_since`) y un trigger que
-- fuerza `pending` y no-aliado al insertar (Prisma envía los defaults).
-- Las reseñas solo se leen bajo RLS; se escriben vía funciones de abajo. La
-- ficha de mascota admite borrado (supresión a pedido de su dueña).
-- ============================================================================

GRANT SELECT ON "community_service_listings" TO adoptafacil_app;
GRANT INSERT ON "community_service_listings" TO adoptafacil_app;
GRANT UPDATE (
  "category", "name", "description", "department", "city", "address", "phone",
  "whatsapp", "website", "email", "updated_at"
) ON "community_service_listings" TO adoptafacil_app;
REVOKE DELETE, TRUNCATE ON "community_service_listings" FROM adoptafacil_app;

GRANT SELECT ON "community_service_listing_reviews" TO adoptafacil_app;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON "community_service_listing_reviews" FROM adoptafacil_app;

GRANT SELECT, INSERT, UPDATE, DELETE ON "community_pet_profiles" TO adoptafacil_app;

-- Editar el contenido de un perfil lo devuelve a revisión: lo que se publica
-- es siempre lo que la plataforma aprobó.
CREATE OR REPLACE FUNCTION community_service_listing_rereview()
  RETURNS TRIGGER
  LANGUAGE plpgsql SET search_path = public, pg_temp
AS $$
BEGIN
  IF (NEW.category, NEW.name, NEW.description, NEW.department, NEW.city, NEW.address,
      NEW.phone, NEW.whatsapp, NEW.website, NEW.email)
     IS DISTINCT FROM
     (OLD.category, OLD.name, OLD.description, OLD.department, OLD.city, OLD.address,
      OLD.phone, OLD.whatsapp, OLD.website, OLD.email) THEN
    NEW.status := 'pending';
    NEW.moderation_reason := NULL;
    NEW.moderated_by_user_id := NULL;
    NEW.moderated_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

-- Todo perfil nace pendiente, sin moderación y sin marca de aliado, lo envíe
-- quien lo envíe.
CREATE OR REPLACE FUNCTION community_service_listing_born_pending()
  RETURNS TRIGGER
  LANGUAGE plpgsql SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.status := 'pending';
  NEW.moderation_reason := NULL;
  NEW.moderated_by_user_id := NULL;
  NEW.moderated_at := NULL;
  NEW.is_partner := false;
  NEW.partner_since := NULL;
  RETURN NEW;
END;
$$;

CREATE TRIGGER community_service_listing_born_pending
  BEFORE INSERT ON "community_service_listings"
  FOR EACH ROW EXECUTE FUNCTION community_service_listing_born_pending();

CREATE TRIGGER community_service_listing_rereview
  BEFORE UPDATE ON "community_service_listings"
  FOR EACH ROW EXECUTE FUNCTION community_service_listing_rereview();

-- ============================================================================
-- DIRECTORIO PÚBLICO — funciones SECURITY DEFINER acotadas: solo perfiles
-- aprobados y solo columnas públicas; nunca un select que evada la RLS.
-- ============================================================================

CREATE OR REPLACE FUNCTION community_service_listing_json(p "community_service_listings")
  RETURNS JSONB
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'id', p.id,
    'category', p.category,
    'name', p.name,
    'description', p.description,
    'department', p.department,
    'city', p.city,
    'address', p.address,
    'phone', p.phone,
    'whatsapp', p.whatsapp,
    'website', p.website,
    'email', p.email,
    'isPartner', p.is_partner,
    'ratingAverage', (
      SELECT round(avg(r.rating)::numeric, 1) FROM "community_service_listing_reviews" r
      WHERE r.listing_id = p.id AND r.status = 'approved'
    ),
    'ratingCount', (
      SELECT count(*) FROM "community_service_listing_reviews" r
      WHERE r.listing_id = p.id AND r.status = 'approved'
    ),
    'createdAt', to_char(p.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  );
$$;

CREATE OR REPLACE FUNCTION public_service_listings(
  p_limit INTEGER, p_offset INTEGER, p_category TEXT, p_city TEXT
)
  RETURNS JSONB
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  WITH filtered AS (
    SELECT p.* FROM "community_service_listings" p
    WHERE p.status = 'approved'
      AND (p_category IS NULL OR p.category = p_category)
      AND (p_city IS NULL OR lower(btrim(p.city)) = lower(btrim(p_city)))
  )
  SELECT jsonb_build_object(
    'items', COALESCE((
      -- Los aliados de AdoptaFácil van primero.
      SELECT jsonb_agg(community_service_listing_json(page)
        ORDER BY page.is_partner DESC, page.created_at DESC)
      FROM (
        SELECT * FROM filtered ORDER BY is_partner DESC, created_at DESC
        LIMIT LEAST(GREATEST(COALESCE(p_limit, 24), 1), 50)
        OFFSET GREATEST(COALESCE(p_offset, 0), 0)
      ) page
    ), '[]'::jsonb),
    'total', (SELECT count(*) FROM filtered)
  );
$$;

CREATE OR REPLACE FUNCTION public_service_listing(p_id UUID)
  RETURNS JSONB
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT community_service_listing_json(p)
  FROM "community_service_listings" p
  WHERE p.id = p_id AND p.status = 'approved';
$$;

CREATE OR REPLACE FUNCTION public_service_listing_reviews(
  p_listing_id UUID, p_limit INTEGER, p_offset INTEGER
)
  RETURNS JSONB
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  WITH filtered AS (
    SELECT r.* FROM "community_service_listing_reviews" r
    JOIN "community_service_listings" p ON p.id = r.listing_id
    WHERE r.listing_id = p_listing_id AND r.status = 'approved' AND p.status = 'approved'
  )
  SELECT jsonb_build_object(
    'items', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', page.id,
        'rating', page.rating,
        'comment', page.comment,
        'authorName', page.author_name,
        'createdAt', to_char(page.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
      ) ORDER BY page.created_at DESC)
      FROM (
        SELECT * FROM filtered ORDER BY created_at DESC
        LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50)
        OFFSET GREATEST(COALESCE(p_offset, 0), 0)
      ) page
    ), '[]'::jsonb),
    'total', (SELECT count(*) FROM filtered)
  );
$$;

-- Dejar una reseña (cruzado por identidad: quien reseña casi nunca es del
-- tenant del negocio). Solo sobre perfiles aprobados; nadie reseña un perfil
-- de su propio tenant. Nace `pending` hasta que la plataforma la apruebe.
CREATE OR REPLACE FUNCTION create_service_listing_review(
  p_listing_id UUID, p_author_user_id UUID, p_author_org_id UUID, p_author_name TEXT,
  p_rating INTEGER, p_comment TEXT
)
  RETURNS JSONB
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_listing "community_service_listings";
  v_row "community_service_listing_reviews";
BEGIN
  SELECT * INTO v_listing FROM "community_service_listings"
   WHERE id = p_listing_id AND status = 'approved';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'listing not found';
  END IF;
  IF v_listing.organization_id = p_author_org_id THEN
    RAISE EXCEPTION 'cannot review own listing';
  END IF;
  IF EXISTS (SELECT 1 FROM "community_service_listing_reviews"
              WHERE listing_id = p_listing_id AND author_user_id = p_author_user_id) THEN
    RAISE EXCEPTION 'already reviewed';
  END IF;

  INSERT INTO "community_service_listing_reviews" (
    id, organization_id, listing_id, author_user_id, author_name, rating, comment, created_at
  ) VALUES (
    gen_random_uuid(), v_listing.organization_id, p_listing_id, p_author_user_id,
    p_author_name, p_rating, NULLIF(btrim(COALESCE(p_comment, '')), ''), CURRENT_TIMESTAMP
  ) RETURNING * INTO v_row;

  RETURN jsonb_build_object('id', v_row.id, 'status', v_row.status);
END;
$$;

-- ============================================================================
-- MODERACIÓN DE PLATAFORMA (PlatformAdmin/PlatformSuperAdmin, en el
-- controller). Cada decisión queda en la auditoría del tenant del negocio.
-- ============================================================================

CREATE OR REPLACE FUNCTION service_listings_moderation_queue(
  p_limit INTEGER, p_offset INTEGER, p_status TEXT
)
  RETURNS JSONB
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  WITH filtered AS (
    SELECT p.* FROM "community_service_listings" p
    WHERE (p_status IS NULL OR p.status = p_status)
  )
  SELECT jsonb_build_object(
    'items', COALESCE((
      SELECT jsonb_agg(community_service_listing_json(page)
        || jsonb_build_object(
             'organizationId', page.organization_id,
             'status', page.status,
             'moderationReason', page.moderation_reason,
             'updatedAt', to_char(page.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
        ORDER BY page.updated_at ASC)
      FROM (
        SELECT * FROM filtered ORDER BY updated_at ASC
        LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50)
        OFFSET GREATEST(COALESCE(p_offset, 0), 0)
      ) page
    ), '[]'::jsonb),
    'total', (SELECT count(*) FROM filtered)
  );
$$;

CREATE OR REPLACE FUNCTION service_listing_moderate(
  p_id UUID, p_decision TEXT, p_reviewer_user_id UUID, p_reason TEXT
)
  RETURNS JSONB
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_row "community_service_listings";
  v_status TEXT;
  v_reason TEXT := NULLIF(btrim(COALESCE(p_reason, '')), '');
BEGIN
  IF p_decision NOT IN ('approve', 'reject', 'hide') THEN
    RAISE EXCEPTION 'service_listing_moderate: invalid decision "%"', p_decision;
  END IF;
  IF p_decision <> 'approve' AND v_reason IS NULL THEN
    RAISE EXCEPTION 'a reason is required';
  END IF;

  v_status := CASE p_decision WHEN 'approve' THEN 'approved' WHEN 'reject' THEN 'rejected' ELSE 'hidden' END;

  UPDATE "community_service_listings"
     SET status = v_status,
         moderation_reason = CASE WHEN p_decision = 'approve' THEN NULL ELSE v_reason END,
         moderated_by_user_id = p_reviewer_user_id,
         moderated_at = CURRENT_TIMESTAMP
   WHERE id = p_id
   RETURNING * INTO v_row;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'listing not found';
  END IF;

  INSERT INTO audit_logs (
    id, organization_id, actor_user_id, action, entity_type, entity_id, metadata, created_at
  ) VALUES (
    gen_random_uuid(), v_row.organization_id, p_reviewer_user_id,
    'community_service_listing.' || v_status, 'community_service_listing', v_row.id::text,
    jsonb_build_object('decision', p_decision, 'reason', v_reason), CURRENT_TIMESTAMP
  );

  RETURN community_service_listing_json(v_row)
    || jsonb_build_object(
         'organizationId', v_row.organization_id,
         'status', v_row.status,
         'moderationReason', v_row.moderation_reason,
         'updatedAt', to_char(v_row.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
END;
$$;

-- Marcar o quitar la marca de "Aliado AdoptaFácil" (alianza con la
-- plataforma). Solo la plataforma; el negocio no puede escribir esta columna.
CREATE OR REPLACE FUNCTION service_listing_set_partner(
  p_id UUID, p_partner BOOLEAN, p_actor_user_id UUID, p_reason TEXT
)
  RETURNS JSONB
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_row "community_service_listings";
  v_reason TEXT := NULLIF(btrim(COALESCE(p_reason, '')), '');
BEGIN
  IF p_partner IS NULL THEN
    RAISE EXCEPTION 'service_listing_set_partner: partner is required';
  END IF;

  UPDATE "community_service_listings"
     SET is_partner = p_partner,
         partner_since = CASE
           WHEN p_partner AND is_partner THEN partner_since
           WHEN p_partner THEN CURRENT_TIMESTAMP
           ELSE NULL
         END
   WHERE id = p_id
   RETURNING * INTO v_row;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'listing not found';
  END IF;

  INSERT INTO audit_logs (
    id, organization_id, actor_user_id, action, entity_type, entity_id, metadata, created_at
  ) VALUES (
    gen_random_uuid(), v_row.organization_id, p_actor_user_id,
    'community_service_listing.' || CASE WHEN p_partner THEN 'partner_granted' ELSE 'partner_revoked' END,
    'community_service_listing', v_row.id::text,
    jsonb_build_object('partner', p_partner, 'reason', v_reason), CURRENT_TIMESTAMP
  );

  RETURN community_service_listing_json(v_row)
    || jsonb_build_object(
         'organizationId', v_row.organization_id,
         'status', v_row.status,
         'moderationReason', v_row.moderation_reason,
         'updatedAt', to_char(v_row.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
END;
$$;

CREATE OR REPLACE FUNCTION service_reviews_moderation_queue(
  p_limit INTEGER, p_offset INTEGER, p_status TEXT
)
  RETURNS JSONB
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  WITH filtered AS (
    SELECT r.*, p.name AS listing_name FROM "community_service_listing_reviews" r
    JOIN "community_service_listings" p ON p.id = r.listing_id
    WHERE (p_status IS NULL OR r.status = p_status)
  )
  SELECT jsonb_build_object(
    'items', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', page.id,
        'listingId', page.listing_id,
        'listingName', page.listing_name,
        'rating', page.rating,
        'comment', page.comment,
        'authorName', page.author_name,
        'status', page.status,
        'moderationReason', page.moderation_reason,
        'createdAt', to_char(page.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
      ) ORDER BY page.created_at ASC)
      FROM (
        SELECT * FROM filtered ORDER BY created_at ASC
        LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50)
        OFFSET GREATEST(COALESCE(p_offset, 0), 0)
      ) page
    ), '[]'::jsonb),
    'total', (SELECT count(*) FROM filtered)
  );
$$;

CREATE OR REPLACE FUNCTION service_review_moderate(
  p_id UUID, p_decision TEXT, p_reviewer_user_id UUID, p_reason TEXT
)
  RETURNS JSONB
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_row "community_service_listing_reviews";
  v_listing_name TEXT;
  v_status TEXT;
  v_reason TEXT := NULLIF(btrim(COALESCE(p_reason, '')), '');
BEGIN
  IF p_decision NOT IN ('approve', 'reject', 'hide') THEN
    RAISE EXCEPTION 'service_review_moderate: invalid decision "%"', p_decision;
  END IF;
  IF p_decision <> 'approve' AND v_reason IS NULL THEN
    RAISE EXCEPTION 'a reason is required';
  END IF;

  v_status := CASE p_decision WHEN 'approve' THEN 'approved' WHEN 'reject' THEN 'rejected' ELSE 'hidden' END;

  UPDATE "community_service_listing_reviews"
     SET status = v_status,
         moderation_reason = CASE WHEN p_decision = 'approve' THEN NULL ELSE v_reason END,
         moderated_by_user_id = p_reviewer_user_id,
         moderated_at = CURRENT_TIMESTAMP
   WHERE id = p_id
   RETURNING * INTO v_row;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'review not found';
  END IF;
  SELECT name INTO v_listing_name FROM "community_service_listings" WHERE id = v_row.listing_id;

  INSERT INTO audit_logs (
    id, organization_id, actor_user_id, action, entity_type, entity_id, metadata, created_at
  ) VALUES (
    gen_random_uuid(), v_row.organization_id, p_reviewer_user_id,
    'community_service_review.' || v_status, 'community_service_review', v_row.id::text,
    jsonb_build_object('decision', p_decision, 'reason', v_reason, 'listingId', v_row.listing_id),
    CURRENT_TIMESTAMP
  );

  RETURN jsonb_build_object(
    'id', v_row.id,
    'listingId', v_row.listing_id,
    'listingName', v_listing_name,
    'rating', v_row.rating,
    'comment', v_row.comment,
    'authorName', v_row.author_name,
    'status', v_row.status,
    'moderationReason', v_row.moderation_reason,
    'createdAt', to_char(v_row.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  );
END;
$$;

REVOKE ALL ON FUNCTION community_service_listing_json("community_service_listings") FROM PUBLIC;
REVOKE ALL ON FUNCTION public_service_listings(INTEGER, INTEGER, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public_service_listing(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public_service_listing_reviews(UUID, INTEGER, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION create_service_listing_review(UUID, UUID, UUID, TEXT, INTEGER, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION service_listings_moderation_queue(INTEGER, INTEGER, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION service_listing_moderate(UUID, TEXT, UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION service_listing_set_partner(UUID, BOOLEAN, UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION service_reviews_moderation_queue(INTEGER, INTEGER, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION service_review_moderate(UUID, TEXT, UUID, TEXT) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public_service_listings(INTEGER, INTEGER, TEXT, TEXT) TO adoptafacil_app;
GRANT EXECUTE ON FUNCTION public_service_listing(UUID) TO adoptafacil_app;
GRANT EXECUTE ON FUNCTION public_service_listing_reviews(UUID, INTEGER, INTEGER) TO adoptafacil_app;
GRANT EXECUTE ON FUNCTION create_service_listing_review(UUID, UUID, UUID, TEXT, INTEGER, TEXT) TO adoptafacil_app;
GRANT EXECUTE ON FUNCTION service_listings_moderation_queue(INTEGER, INTEGER, TEXT) TO adoptafacil_app;
GRANT EXECUTE ON FUNCTION service_listing_moderate(UUID, TEXT, UUID, TEXT) TO adoptafacil_app;
GRANT EXECUTE ON FUNCTION service_listing_set_partner(UUID, BOOLEAN, UUID, TEXT) TO adoptafacil_app;
GRANT EXECUTE ON FUNCTION service_reviews_moderation_queue(INTEGER, INTEGER, TEXT) TO adoptafacil_app;
GRANT EXECUTE ON FUNCTION service_review_moderate(UUID, TEXT, UUID, TEXT) TO adoptafacil_app;
