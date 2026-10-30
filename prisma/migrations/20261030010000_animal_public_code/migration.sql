-- Código público de animal para URLs (plan SEO, P0/P1): la ficha pública deja
-- de exponer el UUID interno. URL nueva: /o/<org>/animales/<nombre>-<codigo>.
-- Las URLs viejas con UUID siguen resolviendo (la web redirige a la nueva).
--
-- `public_code`: 8 caracteres de Crockford base32 en minúsculas (40 bits
-- aleatorios de gen_random_uuid). No se deriva del id ni de un contador, así
-- que no es enumerable. Único en toda la tabla.
--
-- `public_org_adoptable_animal`: ficha de UN animal adoptable por slug + código
-- (o UUID heredado). Antes la web buscaba el animal dentro de las primeras 50
-- filas del catálogo y una organización con más de 50 animales dejaba fichas
-- sin cargar. Misma proyección pública y mismos filtros que el catálogo.

CREATE OR REPLACE FUNCTION af_public_code()
RETURNS text
LANGUAGE plpgsql
VOLATILE
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  alphabet CONSTANT text := '0123456789abcdefghjkmnpqrstvwxyz';
  raw bytea := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
  bits bigint := 0;
  code text := '';
  i integer;
BEGIN
  -- Bytes 0-4 del UUID v4 son aleatorios (la versión vive en el byte 6).
  FOR i IN 0..4 LOOP
    bits := (bits << 8) | get_byte(raw, i);
  END LOOP;
  FOR i IN 1..8 LOOP
    code := substr(alphabet, (bits & 31)::integer + 1, 1) || code;
    bits := bits >> 5;
  END LOOP;
  RETURN code;
END;
$function$;

ALTER TABLE animals ADD COLUMN public_code TEXT;
UPDATE animals SET public_code = af_public_code() WHERE public_code IS NULL;
ALTER TABLE animals ALTER COLUMN public_code SET DEFAULT af_public_code();
ALTER TABLE animals ALTER COLUMN public_code SET NOT NULL;
CREATE UNIQUE INDEX animals_public_code_key ON animals(public_code);

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
    AND a.status = 'available'
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
      AND a.status = 'available'
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
-- NULL si la org no es pública o el animal no está activo y disponible.
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
    AND a.status = 'available'
    AND (a.public_code = v_ref OR a.id::text = v_ref)
  LIMIT 1;

  RETURN v_item;
END;
$function$;

REVOKE ALL ON FUNCTION public_org_adoptable_animal(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public_org_adoptable_animal(TEXT, TEXT) TO adoptafacil_app;
