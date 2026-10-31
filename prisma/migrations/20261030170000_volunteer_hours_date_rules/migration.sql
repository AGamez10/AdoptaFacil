-- ============================================================================
-- Horas de voluntariado: reglas de negocio en el servidor (no solo en la UI).
--
-- Antes, `create_service_hours` aceptaba cualquier fecha y cualquier cantidad
-- de entradas por día: un voluntario podía registrar horas en el futuro,
-- fuera de las fechas de la convocatoria, o 3 sesiones de 20 h el mismo día
-- (60 h en un día) que luego terminaban en un certificado.
--
-- Mismo signature, solo cambia el cuerpo. Reglas nuevas (todas con RAISE y un
-- mensaje reconocible que `ServiceHoursService.log` traduce a un 400 en
-- español):
--   1. La fecha no puede ser posterior a hoy en Colombia.
--   2. La fecha debe caer dentro de las fechas de la convocatoria.
--   3. Una persona no suma más de 24 h en un mismo día, contando TODAS sus
--      inscripciones (en cualquier organización) salvo las rechazadas. Un lock
--      transaccional por voluntario evita que dos envíos simultáneos lo burlen.
-- Además, un CHECK en la tabla deja las horas en (0, 24] aunque alguien
-- escriba fuera de la función (NOT VALID: no reescribe filas históricas).
-- ============================================================================
CREATE OR REPLACE FUNCTION create_service_hours(
  p_enrollment_id UUID,
  p_volunteer_user_id UUID,
  p_date TIMESTAMP,
  p_hours DOUBLE PRECISION,
  p_description TEXT
)
  RETURNS SETOF "service_hours"
  LANGUAGE plpgsql
  VOLATILE
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  h "service_hours";
  v_org UUID;
  v_owner UUID;
  v_status TEXT;
  v_start DATE;
  v_end DATE;
  v_day_total DOUBLE PRECISION;
BEGIN
  SELECT e.organization_id, e.volunteer_user_id, e.status, o.start_date::date, o.end_date::date
    INTO v_org, v_owner, v_status, v_start, v_end
    FROM "volunteer_enrollments" e
    JOIN "volunteer_opportunities" o ON o.id = e.opportunity_id
   WHERE e.id = p_enrollment_id;
  IF NOT FOUND OR v_owner <> p_volunteer_user_id OR v_status <> 'accepted' THEN
    RETURN; -- not yours, unknown, or not accepted yet ⇒ no-op (app throws)
  END IF;

  IF EXISTS (SELECT 1 FROM "volunteer_certificates" WHERE enrollment_id = p_enrollment_id) THEN
    RAISE EXCEPTION 'a certificate has already been issued for this enrollment';
  END IF;

  IF p_hours IS NULL OR p_hours <= 0 OR p_hours > 24 THEN
    RAISE EXCEPTION 'service hours out of range';
  END IF;

  IF p_date::date > (CURRENT_TIMESTAMP AT TIME ZONE 'America/Bogota')::date THEN
    RAISE EXCEPTION 'service hours date is in the future';
  END IF;

  IF p_date::date < v_start OR p_date::date > v_end THEN
    RAISE EXCEPTION 'service hours date outside the opportunity';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('service_hours:' || p_volunteer_user_id::text));
  SELECT COALESCE(SUM(hours), 0) INTO v_day_total
    FROM "service_hours"
   WHERE volunteer_user_id = p_volunteer_user_id
     AND "date"::date = p_date::date
     AND status <> 'rejected';
  IF v_day_total + p_hours > 24 THEN
    RAISE EXCEPTION 'service hours exceed 24 per day (already %)', v_day_total;
  END IF;

  INSERT INTO "service_hours" (
    "id", "organization_id", "enrollment_id", "volunteer_user_id",
    "date", "hours", "description", "status", "created_at"
  ) VALUES (
    gen_random_uuid(), v_org, p_enrollment_id, p_volunteer_user_id,
    p_date, p_hours, p_description, 'pending', CURRENT_TIMESTAMP
  )
  RETURNING * INTO h;

  RETURN NEXT h;
END;
$$;

REVOKE ALL ON FUNCTION create_service_hours(UUID, UUID, TIMESTAMP, DOUBLE PRECISION, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_service_hours(UUID, UUID, TIMESTAMP, DOUBLE PRECISION, TEXT) TO adoptafacil_app;

ALTER TABLE "service_hours"
  ADD CONSTRAINT "service_hours_hours_range" CHECK ("hours" > 0 AND "hours" <= 24) NOT VALID;
