-- P0-3 (auditoría de lógica de negocio, 2026-11-06; AF-024): una solicitud de
-- adopción, y el contrato que sale de ella, describen un animal REAL de la
-- organización. Antes la función insertaba lo que mandara el cliente: un
-- animal inexistente, de otra organización o ya adoptado, con nombre y
-- especie inventados.
--
-- 1) La función vuelve a leer el animal: debe existir, ser de esa
--    organización, estar activo y disponible; y la organización debe estar
--    aprobada. El nombre y la especie del snapshot salen de la base, nunca del
--    cliente (solo se conserva `photoUrl`, que la API resuelve del almacenamiento).
-- 2) Un animal tiene a lo sumo UNA solicitud aprobada (índice único parcial).

CREATE OR REPLACE FUNCTION create_adoption_request(
  p_organization_id UUID,
  p_animal_id UUID,
  p_animal_snapshot JSONB,
  p_applicant_user_id UUID,
  p_applicant JSONB,
  p_message TEXT
)
  RETURNS "adoption_requests"
  LANGUAGE plpgsql
  VOLATILE
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  v_animal "animals"%ROWTYPE;
  v_snapshot JSONB;
  v_row "adoption_requests"%ROWTYPE;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "organizations" WHERE id = p_organization_id AND status = 'approved'
  ) THEN
    RAISE EXCEPTION 'adoption_animal_not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_animal
  FROM "animals"
  WHERE id = p_animal_id
    AND organization_id = p_organization_id
    AND is_active = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'adoption_animal_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_animal.status <> 'available' THEN
    RAISE EXCEPTION 'adoption_animal_unavailable' USING ERRCODE = 'P0001';
  END IF;

  v_snapshot := jsonb_build_object(
    'animalId', v_animal.id,
    'name', v_animal.name,
    'species', v_animal.species
  );
  IF p_animal_snapshot ? 'photoUrl' AND jsonb_typeof(p_animal_snapshot->'photoUrl') = 'string' THEN
    v_snapshot := v_snapshot || jsonb_build_object('photoUrl', p_animal_snapshot->>'photoUrl');
  END IF;

  INSERT INTO "adoption_requests" (
    "id", "organization_id", "animal_id", "animal_snapshot",
    "applicant_user_id", "applicant", "message", "status", "updated_at"
  )
  VALUES (
    gen_random_uuid(), p_organization_id, v_animal.id, v_snapshot,
    p_applicant_user_id, p_applicant, p_message, 'new', CURRENT_TIMESTAMP
  )
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION create_adoption_request(UUID, UUID, JSONB, UUID, JSONB, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_adoption_request(UUID, UUID, JSONB, UUID, JSONB, TEXT) TO adoptafacil_app;

DO $$
BEGIN
  IF EXISTS (
    SELECT animal_id FROM "adoption_requests"
    WHERE status = 'approved'
    GROUP BY animal_id HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Hay animales con más de una solicitud de adopción aprobada: resuélvelo antes de migrar.';
  END IF;
END
$$;

CREATE UNIQUE INDEX "adoption_requests_one_approved_per_animal"
  ON "adoption_requests" ("animal_id")
  WHERE status = 'approved';
