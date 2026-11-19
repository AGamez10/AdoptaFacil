-- Landing pública: cifras reales de toda la red de adopción. Función SECURITY
-- DEFINER acotada, de solo lectura, que expone SOLO columnas que ya son
-- públicas (nombre, slug, logo y ciudad del perfil público, conteos agregados
-- y la foto principal de animales adoptables). Ningún dato privado.

-- Mismo universo que `public_adoptable_animals`: organizaciones aprobadas con
-- slug público y animales activos disponibles o en proceso.
CREATE OR REPLACE FUNCTION public_adoption_network(p_limit INTEGER)
  RETURNS JSONB
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
  WITH base AS (
    SELECT
      a.id,
      a.created_at,
      a.organization_id,
      o.name,
      op.slug,
      op.logo_url,
      NULLIF(btrim(op.location->>'city'), '') AS city
    FROM animals a
    JOIN organizations o ON o.id = a.organization_id AND o.status = 'approved'
    JOIN organization_profiles op ON op.organization_id = a.organization_id AND op.slug IS NOT NULL
    WHERE a.is_active = TRUE
      AND a.status IN ('available', 'in_process')
  ),
  orgs AS (
    SELECT organization_id, name, slug, logo_url, city,
           count(*) AS animals, max(created_at) AS last_at
    FROM base
    GROUP BY organization_id, name, slug, logo_url, city
  ),
  top_orgs AS (
    SELECT * FROM orgs
    ORDER BY animals DESC, last_at DESC, organization_id
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 12), 1), 24)
  )
  SELECT jsonb_build_object(
    'animals', (SELECT count(*) FROM base),
    'organizations', (SELECT count(*) FROM orgs),
    'cities', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('city', c.city, 'count', c.n) ORDER BY c.n DESC, c.city)
      FROM (SELECT city, count(*) AS n FROM base WHERE city IS NOT NULL GROUP BY city) c
    ), '[]'::jsonb),
    'items', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', t.organization_id,
          'name', t.name,
          'slug', t.slug,
          'logoUrl', t.logo_url,
          'city', t.city,
          'animals', t.animals,
          'photoRefs', COALESCE((
            SELECT jsonb_agg(x.ref)
            FROM (
              SELECT ph.storage_ref AS ref
              FROM base b
              JOIN LATERAL (
                SELECT p.storage_ref
                FROM animal_photos p
                WHERE p.animal_id = b.id
                ORDER BY p."order" ASC, p.created_at ASC
                LIMIT 1
              ) ph ON TRUE
              WHERE b.organization_id = t.organization_id
              ORDER BY b.created_at DESC
              LIMIT 3
            ) x
          ), '[]'::jsonb)
        )
        ORDER BY t.animals DESC, t.last_at DESC, t.organization_id
      )
      FROM top_orgs t
    ), '[]'::jsonb)
  );
$$;

REVOKE ALL ON FUNCTION public_adoption_network(INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public_adoption_network(INTEGER) TO adoptafacil_app;
