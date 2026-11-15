-- M12 · reputación — reseñas del portal público con nombre opcional y sello
-- "Miembro de la comunidad" (pedido del cliente, 2026-11-05).
--
-- Hasta ahora el botón "Registrar reseña" del portal (S7-b) era SIEMPRE
-- anónimo: ni siquiera con sesión se guardaba quién escribía. Cambios:
--   1) `origin` distingue las dos vías que ya existían y que antes se
--      deducían de `author_user_id IS NULL`:
--        'verified' — `create_review` (RF23: sesión + interacción real, pasa
--                     por la cola de PlatformAdmin);
--        'portal'   — `create_public_review` (portal público, nace approved,
--                     la modera el Owner con "marcar como spam").
--      Hace falta porque una reseña del portal ahora PUEDE tener autor (un
--      miembro con sesión), así que `author_user_id` ya no basta para saber
--      de qué vía vino ni quién la modera.
--   2) `author_display_name`: el nombre que un VISITANTE sin cuenta escribe
--      voluntariamente. Solo para filas sin autor: un miembro con sesión
--      nunca escribe un nombre libre, se usa el de su cuenta (así nadie con
--      sello puede firmar con un nombre ajeno).
--   3) `create_public_review` acepta autor opcional (lo pone la API desde el
--      JWT, nunca el cuerpo de la petición), nombre opcional y anonimato. Un
--      miembro publica ANÓNIMO por defecto (Ley 1581: mostrar su nombre es
--      opt-in) y conserva el sello, que no revela quién es.
--   4) Nadie reseña a su propia organización desde el portal (el sello
--      "Miembro de la comunidad" sobre una autorreseña engañaría).

ALTER TABLE "reviews" ADD COLUMN "origin" TEXT NOT NULL DEFAULT 'verified';
UPDATE "reviews" SET "origin" = 'portal' WHERE "author_user_id" IS NULL;
ALTER TABLE "reviews"
  ADD CONSTRAINT "reviews_origin_check" CHECK ("origin" IN ('verified', 'portal'));

ALTER TABLE "reviews" ADD COLUMN "author_display_name" TEXT;
ALTER TABLE "reviews"
  ADD CONSTRAINT "reviews_author_display_name_check" CHECK (
    "author_display_name" IS NULL
    OR ("author_user_id" IS NULL AND char_length("author_display_name") BETWEEN 2 AND 60)
  );

-- El contenido sigue inmutable tras el envío: se suman las dos columnas
-- nuevas a la lista que el trigger protege.
CREATE OR REPLACE FUNCTION reviews_reject_content_mutation() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.rating IS DISTINCT FROM OLD.rating
     OR NEW.comment IS DISTINCT FROM OLD.comment
     OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
     OR NEW.author_user_id IS DISTINCT FROM OLD.author_user_id
     OR NEW.is_anonymous IS DISTINCT FROM OLD.is_anonymous
     OR NEW.origin IS DISTINCT FROM OLD.origin
     OR NEW.author_display_name IS DISTINCT FROM OLD.author_display_name
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION
      'reviews: content is immutable after submission (RF23)'
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;

-- ============================================================================
-- create_public_review: nueva firma. Se elimina la de 3 argumentos para que
-- no queden dos sobrecargas vivas (una sin las reglas nuevas).
-- ============================================================================
DROP FUNCTION IF EXISTS create_public_review(UUID, INTEGER, TEXT);

CREATE OR REPLACE FUNCTION create_public_review(
  p_organization_id UUID,
  p_rating INTEGER,
  p_comment TEXT,
  p_author_user_id UUID,
  p_author_display_name TEXT,
  p_is_anonymous BOOLEAN
)
  RETURNS SETOF "reviews"
  LANGUAGE plpgsql
  VOLATILE
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  r "reviews";
  v_org_name TEXT;
  v_name TEXT := NULLIF(btrim(regexp_replace(COALESCE(p_author_display_name, ''), '\s+', ' ', 'g')), '');
  v_is_anonymous BOOLEAN;
BEGIN
  IF p_rating IS NULL OR p_rating < 1 OR p_rating > 5 THEN
    RAISE EXCEPTION 'create_public_review: rating must be between 1 and 5';
  END IF;
  SELECT name INTO v_org_name FROM organizations WHERE id = p_organization_id;
  IF NOT FOUND THEN
    RETURN; -- unknown org ⇒ no-op (app throws 404)
  END IF;

  IF p_author_user_id IS NOT NULL THEN
    -- Miembro con sesión: el nombre visible sale de su cuenta, nunca libre.
    IF v_name IS NOT NULL THEN
      RAISE EXCEPTION 'create_public_review: a signed-in member cannot set a free display name';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM users WHERE id = p_author_user_id) THEN
      RAISE EXCEPTION 'create_public_review: author not found';
    END IF;
    IF EXISTS (SELECT 1 FROM users WHERE id = p_author_user_id AND organization_id = p_organization_id)
       OR EXISTS (
         SELECT 1 FROM user_roles
         WHERE user_id = p_author_user_id AND organization_id = p_organization_id
       ) THEN
      RAISE EXCEPTION 'create_public_review: cannot review your own organization'
        USING ERRCODE = 'restrict_violation';
    END IF;
    v_is_anonymous := COALESCE(p_is_anonymous, true);
  ELSE
    IF v_name IS NOT NULL THEN
      IF char_length(v_name) < 2 OR char_length(v_name) > 60 THEN
        RAISE EXCEPTION 'create_public_review: display name must be 2-60 characters';
      END IF;
      -- Suplantación evidente: firmar como la propia organización.
      IF lower(v_name) = lower(btrim(v_org_name)) THEN
        RAISE EXCEPTION 'create_public_review: display name not allowed'
          USING ERRCODE = 'restrict_violation';
      END IF;
    END IF;
    v_is_anonymous := v_name IS NULL;
  END IF;

  INSERT INTO "reviews" (
    "id", "organization_id", "author_user_id", "rating", "comment",
    "is_anonymous", "status", "origin", "author_display_name", "created_at"
  ) VALUES (
    gen_random_uuid(), p_organization_id, p_author_user_id, p_rating,
    NULLIF(btrim(COALESCE(p_comment, '')), ''), v_is_anonymous,
    'approved', 'portal', CASE WHEN p_author_user_id IS NULL THEN v_name END,
    CURRENT_TIMESTAMP
  )
  RETURNING * INTO r;

  INSERT INTO audit_logs (
    id, organization_id, actor_user_id, action, entity_type, entity_id, metadata, created_at
  ) VALUES (
    gen_random_uuid(), r.organization_id, p_author_user_id, 'reputation.public_review_created',
    'review', r.id::text,
    jsonb_build_object(
      'rating', r.rating,
      'communityMember', p_author_user_id IS NOT NULL,
      'isAnonymous', r.is_anonymous
    ),
    CURRENT_TIMESTAMP
  );

  RETURN NEXT r;
END;
$$;

REVOKE ALL ON FUNCTION create_public_review(UUID, INTEGER, TEXT, UUID, TEXT, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_public_review(UUID, INTEGER, TEXT, UUID, TEXT, BOOLEAN) TO adoptafacil_app;

-- ============================================================================
-- owner_mark_review_spam: ahora decide por `origin = 'portal'` (antes
-- `author_user_id IS NULL`), así el Owner también puede ocultar una reseña
-- del portal escrita por un miembro. Las verificadas (RF23) siguen siendo
-- exclusivas de PlatformAdmin.
-- ============================================================================
CREATE OR REPLACE FUNCTION owner_mark_review_spam(
  p_review_id UUID,
  p_organization_id UUID,
  p_actor_user_id UUID
)
  RETURNS JSONB
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  v_row "reviews"%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM "reviews" WHERE id = p_review_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'review not found';
  END IF;
  IF v_row.organization_id <> p_organization_id THEN
    RAISE EXCEPTION 'review not found';
  END IF;
  IF v_row.origin <> 'portal' THEN
    RAISE EXCEPTION 'only a public (portal) review can be marked as spam by the organization';
  END IF;
  IF v_row.status <> 'approved' THEN
    RAISE EXCEPTION 'only an approved review can be marked as spam (status=%)', v_row.status;
  END IF;

  UPDATE "reviews"
     SET status = 'hidden',
         rejection_reason = 'spam',
         moderated_by_user_id = p_actor_user_id,
         moderated_at = CURRENT_TIMESTAMP
   WHERE id = p_review_id
   RETURNING * INTO v_row;

  INSERT INTO audit_logs (
    id, organization_id, actor_user_id, action, entity_type, entity_id, metadata, created_at
  ) VALUES (
    gen_random_uuid(), v_row.organization_id, p_actor_user_id, 'reputation.public_review_marked_spam',
    'review', v_row.id::text, jsonb_build_object('reason', 'spam'), CURRENT_TIMESTAMP
  );

  -- Sin `authorUserId`: la organización no necesita (ni debe ver) la cuenta
  -- del miembro que la reseñó.
  RETURN jsonb_build_object(
    'id', v_row.id,
    'organizationId', v_row.organization_id,
    'rating', v_row.rating,
    'comment', v_row.comment,
    'isAnonymous', v_row.is_anonymous,
    'status', v_row.status,
    'moderatedByUserId', v_row.moderated_by_user_id,
    'moderatedAt', v_row.moderated_at,
    'rejectionReason', v_row.rejection_reason,
    'createdAt', v_row.created_at
  );
END;
$$;

REVOKE ALL ON FUNCTION owner_mark_review_spam(UUID, UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION owner_mark_review_spam(UUID, UUID, UUID) TO adoptafacil_app;

-- ============================================================================
-- platform_review_queue: solo reseñas verificadas (RF23). Las del portal, con
-- o sin autor, las modera el Owner.
-- ============================================================================
CREATE OR REPLACE FUNCTION platform_review_queue()
  RETURNS JSONB
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', r.id,
        'organizationId', r.organization_id,
        'organizationName', o.name,
        'authorUserId', r.author_user_id,
        'authorName', u.display_name,
        'rating', r.rating,
        'comment', r.comment,
        'isAnonymous', r.is_anonymous,
        'status', r.status,
        'moderatedByUserId', r.moderated_by_user_id,
        'moderatedAt', r.moderated_at,
        'rejectionReason', r.rejection_reason,
        'createdAt', r.created_at
      )
      ORDER BY r.created_at
    ),
    '[]'::jsonb
  )
  FROM "reviews" r
  JOIN organizations o ON o.id = r.organization_id
  JOIN users u ON u.id = r.author_user_id
  WHERE r.status IN ('pending', 'approved') AND r.origin = 'verified';
$$;

REVOKE ALL ON FUNCTION platform_review_queue() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform_review_queue() TO adoptafacil_app;

-- ============================================================================
-- public_approved_reviews: nombre visible + sello.
--   authorName — visitante: el nombre que escribió (o nada); miembro: el de su
--                cuenta solo si NO pidió anonimato.
--   isCommunityMember — la reseña la escribió una cuenta de AdoptaFácil con
--                sesión iniciada. Se muestra incluso si es anónima: el sello
--                no revela quién es.
-- ============================================================================
CREATE OR REPLACE FUNCTION public_approved_reviews(
  p_organization_id UUID,
  p_limit INTEGER,
  p_offset INTEGER
)
  RETURNS JSONB
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'items', COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', x.id,
            'rating', x.rating,
            'comment', x.comment,
            'authorName', CASE
              WHEN x.author_user_id IS NULL THEN x.author_display_name
              WHEN x.is_anonymous THEN NULL
              ELSE x.display_name
            END,
            'isCommunityMember', x.author_user_id IS NOT NULL,
            'createdAt', x.created_at
          )
          ORDER BY x.created_at DESC
        )
        FROM (
          SELECT r.id, r.rating, r.comment, r.is_anonymous, r.created_at,
                 r.author_user_id, r.author_display_name, u.display_name
          FROM "reviews" r
          LEFT JOIN users u ON u.id = r.author_user_id
          WHERE r.organization_id = p_organization_id AND r.status = 'approved'
          ORDER BY r.created_at DESC
          LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50)
          OFFSET GREATEST(COALESCE(p_offset, 0), 0)
        ) x
      ),
      '[]'::jsonb
    ),
    'total', (
      SELECT COUNT(*) FROM "reviews"
      WHERE organization_id = p_organization_id AND status = 'approved'
    )
  );
$$;

REVOKE ALL ON FUNCTION public_approved_reviews(UUID, INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public_approved_reviews(UUID, INTEGER, INTEGER) TO adoptafacil_app;
