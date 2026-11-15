-- Comunidad: video, medios para personas y reacciones.
--
-- * community_post_images ahora guarda también videos (`kind`), el póster que
--   el servidor genera al comprimirlos y su duración. Las filas viejas quedan
--   como 'image'.
-- * community_post_likes pasa a ser "reacciones" (me gusta, me encanta, ternura,
--   celebro, me entristece). Una reacción por persona y publicación;
--   `like_count` sigue siendo el TOTAL de reacciones (no se rompe nada que lo
--   lea) y `reaction_counts` lleva el desglose.
-- * Las personas también adjuntan fotos y videos (antes se descartaban sin
--   avisar): se guardan sin organización, vía función acotada.

ALTER TABLE "community_post_images"
  ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'image',
  ADD COLUMN "poster_ref" TEXT,
  ADD COLUMN "duration_seconds" INTEGER;
ALTER TABLE "community_post_images"
  ADD CONSTRAINT "community_post_images_kind_check" CHECK ("kind" IN ('image', 'video'));

ALTER TABLE "community_post_likes"
  ADD COLUMN "reaction" TEXT NOT NULL DEFAULT 'like';
ALTER TABLE "community_post_likes"
  ADD CONSTRAINT "community_post_likes_reaction_check"
  CHECK ("reaction" IN ('like', 'love', 'tender', 'celebrate', 'sad'));

ALTER TABLE "community_posts"
  ADD COLUMN "reaction_counts" JSONB NOT NULL DEFAULT '{}'::jsonb;
UPDATE "community_posts" SET "reaction_counts" = jsonb_build_object('like', "like_count")
  WHERE "like_count" > 0;

-- Las personas no pertenecen a un tenant: la tabla de likes ya admite
-- organization_id nulo; el cambio de reacción necesita UPDATE.
GRANT UPDATE ON "community_post_likes" TO adoptafacil_app;

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
    'reactionCounts', p.reaction_counts,
    'images', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', i.id, 'storageRef', i.storage_ref, 'order', i.order,
          'kind', i.kind, 'posterRef', i.poster_ref, 'durationSeconds', i.duration_seconds) ORDER BY i.order)
      FROM "community_post_images" i WHERE i.post_id = p.id
    ), '[]'::jsonb),
    'createdAt', to_char(p.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  );
$$;

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
        'reactionCounts', p.reaction_counts,
        'shareable', p.shareable,
        'images', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'id', i.id, 'storageRef', i.storage_ref, 'order', i.order,
          'kind', i.kind, 'posterRef', i.poster_ref, 'durationSeconds', i.duration_seconds
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
        'reactionCounts', p.reaction_counts,
        'shareable', p.shareable,
        'moderationReason', p.moderation_reason,
        'images', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'id', i.id, 'storageRef', i.storage_ref, 'order', i.order,
          'kind', i.kind, 'posterRef', i.poster_ref, 'durationSeconds', i.duration_seconds
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
    'reactionCounts', p.reaction_counts,
        'shareable', p.shareable,
    'images', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', i.id, 'storageRef', i.storage_ref, 'order', i.order,
          'kind', i.kind, 'posterRef', i.poster_ref, 'durationSeconds', i.duration_seconds
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

CREATE OR REPLACE FUNCTION community_posts_moderation_queue(p_limit INTEGER, p_offset INTEGER, p_status TEXT)
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
        'reactionCounts', p.reaction_counts,
        'moderationReason', p.moderation_reason,
        'images', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'id', i.id, 'storageRef', i.storage_ref, 'order', i.order,
          'kind', i.kind, 'posterRef', i.poster_ref, 'durationSeconds', i.duration_seconds
          ) ORDER BY i.order)
          FROM "community_post_images" i WHERE i.post_id = p.id
        ), '[]'::jsonb),
        'createdAt', to_char(p.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'updatedAt', to_char(p.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
      ) AS item
      FROM "community_posts" p
      LEFT JOIN "organizations" o ON o.id = p.organization_id
      WHERE p_status IS NULL OR p.status = p_status
      ORDER BY p.created_at DESC
      LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50)
      OFFSET GREATEST(COALESCE(p_offset, 0), 0)
    ) page), '[]'::jsonb),
    'total', (SELECT count(*) FROM "community_posts" WHERE p_status IS NULL OR "status" = p_status)
  );
$$;

-- Poner (o cambiar, o quitar con NULL) la reacción propia. Solo sobre una
-- publicación activa. Devuelve la reacción vigente y los contadores.
CREATE OR REPLACE FUNCTION set_community_post_reaction(p_post_id UUID, p_user_id UUID, p_reaction TEXT)
  RETURNS JSONB
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_post_org UUID;
  v_status TEXT;
  v_prev TEXT;
  v_counts JSONB;
  v_total INTEGER;
BEGIN
  IF p_reaction IS NOT NULL AND p_reaction NOT IN ('like', 'love', 'tender', 'celebrate', 'sad') THEN
    RAISE EXCEPTION 'invalid reaction';
  END IF;
  SELECT organization_id, status, reaction_counts INTO v_post_org, v_status, v_counts
    FROM "community_posts" WHERE id = p_post_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'post not found';
  END IF;
  IF v_status <> 'published' THEN
    RAISE EXCEPTION 'cannot like a removed post';
  END IF;

  SELECT reaction INTO v_prev FROM "community_post_likes"
    WHERE post_id = p_post_id AND user_id = p_user_id;

  IF v_prev IS NOT NULL THEN
    v_counts := jsonb_set(v_counts, ARRAY[v_prev], to_jsonb(GREATEST(COALESCE((v_counts->>v_prev)::int, 0) - 1, 0)));
    IF p_reaction IS NULL THEN
      DELETE FROM "community_post_likes" WHERE post_id = p_post_id AND user_id = p_user_id;
    ELSE
      UPDATE "community_post_likes" SET reaction = p_reaction
        WHERE post_id = p_post_id AND user_id = p_user_id;
    END IF;
  ELSIF p_reaction IS NOT NULL THEN
    INSERT INTO "community_post_likes" (post_id, user_id, organization_id, reaction, created_at)
      VALUES (p_post_id, p_user_id, v_post_org, p_reaction, CURRENT_TIMESTAMP);
  END IF;

  IF p_reaction IS NOT NULL THEN
    v_counts := jsonb_set(v_counts, ARRAY[p_reaction], to_jsonb(COALESCE((v_counts->>p_reaction)::int, 0) + 1));
  END IF;
  SELECT COALESCE(sum(value::int), 0)::int INTO v_total FROM jsonb_each_text(v_counts);
  UPDATE "community_posts" SET reaction_counts = v_counts, like_count = v_total WHERE id = p_post_id;

  RETURN jsonb_build_object('myReaction', p_reaction, 'likeCount', v_total, 'reactionCounts', v_counts);
END;
$$;

-- El "me gusta" de siempre sigue funcionando: alterna la reacción 'like'
-- (si ya había otra reacción, la quita, como antes con el like).
CREATE OR REPLACE FUNCTION toggle_community_post_like(p_post_id UUID, p_user_id UUID)
  RETURNS JSONB
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_has BOOLEAN;
  v_res JSONB;
BEGIN
  v_has := EXISTS (SELECT 1 FROM "community_post_likes" WHERE post_id = p_post_id AND user_id = p_user_id);
  v_res := set_community_post_reaction(p_post_id, p_user_id, CASE WHEN v_has THEN NULL ELSE 'like' END);
  RETURN jsonb_build_object('liked', NOT v_has, 'likeCount', (v_res->>'likeCount')::int);
END;
$$;

-- Mis reacciones sobre un conjunto de publicaciones: { "<postId>": "love", … }.
CREATE OR REPLACE FUNCTION community_my_reactions(p_user_id UUID, p_post_ids UUID[])
  RETURNS JSONB
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(jsonb_object_agg(l.post_id::text, l.reaction), '{}'::jsonb)
  FROM "community_post_likes" l
  WHERE l.user_id = p_user_id AND l.post_id = ANY(p_post_ids);
$$;

-- Fotos y videos de una publicación de PERSONA (sin organización): solo la
-- autora, solo sobre su publicación, máximo 6.
CREATE OR REPLACE FUNCTION community_post_attach_media(p_post_id UUID, p_author_user_id UUID, p_media JSONB)
  RETURNS JSONB
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  m JSONB;
  v_ids JSONB := '[]'::jsonb;
  v_id UUID;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "community_posts"
    WHERE id = p_post_id AND author_user_id = p_author_user_id AND organization_id IS NULL
  ) THEN
    RAISE EXCEPTION 'post not found';
  END IF;
  IF jsonb_array_length(p_media) > 6 THEN
    RAISE EXCEPTION 'too many media';
  END IF;
  FOR m IN SELECT * FROM jsonb_array_elements(p_media) LOOP
    INSERT INTO "community_post_images" (id, organization_id, post_id, storage_ref, "order", kind, poster_ref, created_at)
      VALUES (gen_random_uuid(), NULL, p_post_id, m->>'storageRef', COALESCE((m->>'order')::int, 0),
              COALESCE(m->>'kind', 'image'), NULLIF(m->>'posterRef', ''), CURRENT_TIMESTAMP)
      RETURNING id INTO v_id;
    v_ids := v_ids || to_jsonb(v_id::text);
  END LOOP;
  RETURN v_ids;
END;
$$;

REVOKE ALL ON FUNCTION set_community_post_reaction(UUID, UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION community_my_reactions(UUID, UUID[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION community_post_attach_media(UUID, UUID, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION set_community_post_reaction(UUID, UUID, TEXT) TO adoptafacil_app;
GRANT EXECUTE ON FUNCTION community_my_reactions(UUID, UUID[]) TO adoptafacil_app;
GRANT EXECUTE ON FUNCTION community_post_attach_media(UUID, UUID, JSONB) TO adoptafacil_app;
