-- Escala (plan de escala, cambio 3 · bloqueo B1): catálogo nacional de animales
-- en UNA sola consulta.
--
-- Antes, `GET /public/animals` leía cada organización por separado (un perfil y
-- una llamada a `public_org_adoptable_animals` por refugio, todas a la vez) y
-- paginaba en memoria: ~2 consultas por refugio en cada visita, y un tope de 50
-- animales por refugio que dejaba el total incompleto. Esta función devuelve la
-- página directamente desde Postgres, con los mismos campos públicos que la
-- función por refugio (nada clínico ni interno) y solo de organizaciones
-- APROBADAS con perfil público (slug), igual que el directorio anterior.
--
-- Paginación: por página (compatibilidad con la web actual) o por cursor
-- `(created_at, id)` para listas profundas sin OFFSET.

CREATE INDEX IF NOT EXISTS "animals_public_catalog_idx"
  ON "animals" ("created_at" DESC, "id" DESC)
  WHERE "is_active" = TRUE AND "status" = 'available';

CREATE INDEX IF NOT EXISTS "animals_public_catalog_species_idx"
  ON "animals" ("species", "created_at" DESC, "id" DESC)
  WHERE "is_active" = TRUE AND "status" = 'available';

CREATE OR REPLACE FUNCTION public_adoptable_animals(
  p_limit INTEGER,
  p_offset INTEGER,
  p_species TEXT DEFAULT NULL,
  p_city TEXT DEFAULT NULL,
  p_after_created_at TIMESTAMP(3) DEFAULT NULL,
  p_after_id UUID DEFAULT NULL
)
  RETURNS JSONB
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  v_total BIGINT;
  v_items JSONB;
  v_limit INTEGER := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50);
  -- Con cursor no se usa OFFSET; sin cursor, OFFSET acotado (la web pide a lo
  -- sumo 10 páginas de 50).
  v_offset INTEGER := CASE
    WHEN p_after_created_at IS NOT NULL THEN 0
    ELSE LEAST(GREATEST(COALESCE(p_offset, 0), 0), 10000)
  END;
  v_city TEXT := NULLIF(lower(btrim(COALESCE(p_city, ''))), '');
BEGIN
  SELECT count(*) INTO v_total
  FROM animals a
  JOIN organizations o ON o.id = a.organization_id AND o.status = 'approved'
  JOIN organization_profiles op ON op.organization_id = a.organization_id AND op.slug IS NOT NULL
  WHERE a.is_active = TRUE
    AND a.status = 'available'
    AND (p_species IS NULL OR a.species = p_species)
    AND (v_city IS NULL OR lower(op.location->>'city') = v_city);

  SELECT COALESCE(jsonb_agg(page.obj ORDER BY page.created_at DESC, page.id DESC), '[]'::jsonb)
    INTO v_items
  FROM (
    SELECT
      jsonb_build_object(
        'id', a.id,
        'organizationId', a.organization_id,
        'name', a.name,
        'species', a.species,
        'sex', a.sex,
        'size', a.size,
        'status', a.status,
        'breed', COALESCE(b.name, a.custom_breed),
        'primaryPhotoRef', (
          SELECT p.storage_ref
          FROM animal_photos p
          WHERE p.animal_id = a.id
          ORDER BY p."order" ASC, p.created_at ASC
          LIMIT 1
        ),
        -- Datos crudos de edad para que la API DERIVE computedAge; nunca la fecha.
        'birthDate', a.birth_date,
        'approximateAgeMonths', a.approximate_age_months,
        'createdAt', a.created_at,
        'organization', jsonb_build_object(
          'id', o.id,
          'name', o.name,
          'slug', op.slug,
          'logoUrl', op.logo_url,
          'city', op.location->>'city'
        )
      ) AS obj,
      a.created_at,
      a.id
    FROM animals a
    JOIN organizations o ON o.id = a.organization_id AND o.status = 'approved'
    JOIN organization_profiles op ON op.organization_id = a.organization_id AND op.slug IS NOT NULL
    LEFT JOIN animal_breeds b ON b.id = a.breed_id
    WHERE a.is_active = TRUE
      AND a.status = 'available'
      AND (p_species IS NULL OR a.species = p_species)
      AND (v_city IS NULL OR lower(op.location->>'city') = v_city)
      AND (
        p_after_created_at IS NULL
        OR (a.created_at, a.id) < (p_after_created_at, COALESCE(p_after_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid))
      )
    ORDER BY a.created_at DESC, a.id DESC
    LIMIT v_limit OFFSET v_offset
  ) page;

  RETURN jsonb_build_object(
    'items', v_items,
    'total', v_total,
    'limit', v_limit,
    'offset', v_offset
  );
END;
$$;

REVOKE ALL ON FUNCTION public_adoptable_animals(INTEGER, INTEGER, TEXT, TEXT, TIMESTAMP, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public_adoptable_animals(INTEGER, INTEGER, TEXT, TEXT, TIMESTAMP, UUID) TO adoptafacil_app;
