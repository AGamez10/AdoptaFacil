-- Comunidad PÚBLICA — escalafón de quienes más mueven la comunidad (landing).
--
-- Solo cuenta publicaciones activas que su autora marcó como compartibles (las
-- mismas que ya se ven sin sesión), así que no revela nada que la autora no
-- haya hecho público. Una organización aparece con su nombre (cuenta todo lo
-- que publicó su equipo); una persona, solo con su primer nombre
-- (`community_public_author`). Nunca devuelve ids de personas ni de tenants.
--
-- Puntos: 5 por publicación pública, 2 por comentario recibido y 1 por me gusta
-- recibido en ellas (`COMMUNITY_POINTS` en packages/contracts). Desempata la
-- actividad más reciente.

CREATE OR REPLACE FUNCTION public_community_leaders(p_limit INTEGER)
  RETURNS JSONB
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH grouped AS (
    SELECT
      p.organization_id IS NOT NULL AS is_org,
      COALESCE(p.organization_id, p.author_user_id) AS member_key,
      (array_agg(community_public_author(p.author_name, o.name) ORDER BY p.created_at DESC))[1]
        AS display_name,
      count(*)::int AS posts,
      COALESCE(sum(p.like_count), 0)::int AS likes,
      COALESCE(sum(p.comment_count), 0)::int AS comments,
      max(p.created_at) AS last_at
    FROM "community_posts" p
    LEFT JOIN "organizations" o ON o.id = p.organization_id
    WHERE p.status = 'published' AND p.shareable
    GROUP BY 1, 2
  ),
  ranked AS (
    SELECT g.*, (g.posts * 5 + g.comments * 2 + g.likes) AS points
    FROM grouped g
    ORDER BY points DESC, g.last_at DESC
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 5), 1), 10)
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'displayName', r.display_name,
    'isOrganization', r.is_org,
    'publicPosts', r.posts,
    'likesReceived', r.likes,
    'commentsReceived', r.comments,
    'points', r.points
  ) ORDER BY r.points DESC, r.last_at DESC), '[]'::jsonb)
  FROM ranked r;
$$;

REVOKE ALL ON FUNCTION public_community_leaders(INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public_community_leaders(INTEGER) TO adoptafacil_app;
