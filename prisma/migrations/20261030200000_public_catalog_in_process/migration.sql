-- Catálogo público: los animales "en proceso" vuelven a mostrarse.
--
-- Decisión del dueño (2026-10-30): un animal en proceso de adopción puede tener
-- varios interesados y uno puede desistir mientras otro avanza, así que sigue
-- visible y contando en el portal de la organización, en su ficha pública y en
-- /adoptar. Solo dejan de mostrarse los adoptados (y, como antes, los no
-- disponibles, fallecidos o inactivos). Las tres funciones se redefinen
-- idénticas a su última versión salvo el filtro de estado.

DROP INDEX IF EXISTS "animals_public_catalog_idx";
DROP INDEX IF EXISTS "animals_public_catalog_species_idx";

CREATE INDEX "animals_public_catalog_idx"
  ON "animals" ("created_at" DESC, "id" DESC)
  WHERE "is_active" = TRUE AND "status" IN ('available', 'in_process');

CREATE INDEX "animals_public_catalog_species_idx"
  ON "animals" ("species", "created_at" DESC, "id" DESC)
  WHERE "is_active" = TRUE AND "status" IN ('available', 'in_process');

-- Catálogo público: misma función, ahora con `publicCode` en cada fila.
CREATE OR REPLACE FUNCTION public.public_org_adoptable_animals(p_slug text, p_limit integer, p_offset integer, p_species text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_org UUID;
  v_total BIGINT;
  v_items JSONB;
  v_limit INTEGER := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50);
  v_offset INTEGER := GREATEST(COALESCE(p_offset, 0), 0);
BEGIN
  SELECT p.organization_id INTO v_org
  FROM organization_profiles p
  JOIN organizations o ON o.id = p.organization_id
  WHERE p.slug = p_slug
    AND o.status = 'approved';
  IF v_org IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT count(*) INTO v_total
  FROM animals a
  WHERE a.organization_id = v_org
    AND a.is_active = TRUE
    AND a.status IN ('available', 'in_process')
    AND (p_species IS NULL OR a.species = p_species);

  SELECT COALESCE(jsonb_agg(row.obj ORDER BY row.created_at DESC), '[]'::jsonb) INTO v_items
  FROM (
    SELECT
      jsonb_build_object(
        'id', a.id,
        'publicCode', a.public_code,
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
        -- Raw age inputs for the API to DERIVE computedAge; never surfaced as DOB.
        'birthDate', a.birth_date,
        'approximateAgeMonths', a.approximate_age_months,
        'createdAt', a.created_at
      ) AS obj,
      a.created_at AS created_at
    FROM animals a
    LEFT JOIN animal_breeds b ON b.id = a.breed_id
    WHERE a.organization_id = v_org
      AND a.is_active = TRUE
      AND a.status IN ('available', 'in_process')
      AND (p_species IS NULL OR a.species = p_species)
    ORDER BY a.created_at DESC
    LIMIT v_limit OFFSET v_offset
  ) row;

  RETURN jsonb_build_object(
    'items', COALESCE(v_items, '[]'::jsonb),
    'total', v_total,
    'limit', v_limit,
    'offset', v_offset
  );
END;
$function$;

-- Ficha pública de UN animal. `p_ref` es el código público o, para enlaces
-- viejos, el UUID en texto (se compara como texto: nunca falla un cast).
-- NULL si la org no es pública o el animal no está activo y publicable (disponible o en proceso).
CREATE OR REPLACE FUNCTION public.public_org_adoptable_animal(p_slug text, p_ref text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_org UUID;
  v_ref TEXT := lower(btrim(COALESCE(p_ref, '')));
  v_item JSONB;
BEGIN
  SELECT p.organization_id INTO v_org
  FROM organization_profiles p
  JOIN organizations o ON o.id = p.organization_id
  WHERE p.slug = p_slug
    AND o.status = 'approved';
  IF v_org IS NULL OR v_ref = '' THEN
    RETURN NULL;
  END IF;

  SELECT jsonb_build_object(
    'id', a.id,
    'publicCode', a.public_code,
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
    'birthDate', a.birth_date,
    'approximateAgeMonths', a.approximate_age_months,
    'createdAt', a.created_at
  ) INTO v_item
  FROM animals a
  LEFT JOIN animal_breeds b ON b.id = a.breed_id
  WHERE a.organization_id = v_org
    AND a.is_active = TRUE
    AND a.status IN ('available', 'in_process')
    AND (a.public_code = v_ref OR a.id::text = v_ref)
  LIMIT 1;

  RETURN v_item;
END;
$function$;

REVOKE ALL ON FUNCTION public_org_adoptable_animal(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public_org_adoptable_animal(TEXT, TEXT) TO adoptafacil_app;

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
    AND a.status IN ('available', 'in_process')
    AND (p_species IS NULL OR a.species = p_species)
    AND (v_city IS NULL OR lower(op.location->>'city') = v_city);

  SELECT COALESCE(jsonb_agg(page.obj ORDER BY page.created_at DESC, page.id DESC), '[]'::jsonb)
    INTO v_items
  FROM (
    SELECT
      jsonb_build_object(
        'id', a.id,
        'publicCode', a.public_code,
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
      AND a.status IN ('available', 'in_process')
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
