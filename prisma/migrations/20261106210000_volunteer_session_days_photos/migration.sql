-- ============================================================================
-- Voluntariado: días de jornada habilitados + fotos de la jornada.
--
-- 1. `volunteer_opportunities.session_dates`: la organización coordina y
--    habilita los DÍAS CALENDARIO de la jornada (dentro de start_date–end_date).
--    Vacío = cualquier día de la convocatoria (convocatorias publicadas antes
--    de esta regla siguen funcionando igual).
-- 2. `create_service_hours` (misma firma, solo cambia el cuerpo): además de las
--    reglas de 20261030170000 (no futuro, dentro de la convocatoria, máx. 24 h
--    por día), la fecha debe ser uno de los días habilitados cuando la
--    organización los definió. Mensaje reconocible → 400 en español.
-- 3. `service_hours_photos`: fotos de la jornada que el voluntario adjunta a
--    SU sesión. Tabla de negocio con organization_id + RLS ENABLE+FORCE +
--    tenant_isolation; el rol de la app solo tiene SELECT+INSERT. El alta es
--    cross-tenant por identidad con `add_service_hours_photo` (SECURITY
--    DEFINER, search_path fijo, sin SQL dinámico).
-- 4. Lecturas por identidad (`volunteer_enrollments_for_user`,
--    `service_hours_for_user`) y el listado nacional
--    (`public_volunteer_opportunities`) exponen los días habilitados / el
--    número de fotos. Mismas columnas de antes + las nuevas (contrato aditivo).
-- ============================================================================

-- 1. Días de jornada ----------------------------------------------------------
ALTER TABLE "volunteer_opportunities"
  ADD COLUMN "session_dates" DATE[] NOT NULL DEFAULT '{}';

-- 2. Regla de días en el servidor ----------------------------------------------
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
  v_days DATE[];
  v_day_total DOUBLE PRECISION;
BEGIN
  SELECT e.organization_id, e.volunteer_user_id, e.status, o.start_date::date, o.end_date::date,
         o.session_dates
    INTO v_org, v_owner, v_status, v_start, v_end, v_days
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

  IF cardinality(v_days) > 0 AND NOT (p_date::date = ANY (v_days)) THEN
    RAISE EXCEPTION 'service hours date is not an enabled session day';
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

-- 3. Fotos de la jornada --------------------------------------------------------
CREATE TABLE "service_hours_photos" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "service_hours_id" UUID NOT NULL,
    "volunteer_user_id" UUID NOT NULL,
    "storage_ref" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "service_hours_photos_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "service_hours_photos_organization_id_idx" ON "service_hours_photos"("organization_id");
CREATE INDEX "service_hours_photos_service_hours_id_idx" ON "service_hours_photos"("service_hours_id");

ALTER TABLE "service_hours_photos" ADD CONSTRAINT "service_hours_photos_service_hours_id_fkey"
  FOREIGN KEY ("service_hours_id") REFERENCES "service_hours"("id") ON DELETE CASCADE ON UPDATE CASCADE;


ALTER TABLE "service_hours_photos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "service_hours_photos" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "service_hours_photos"
  USING ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

-- Nunca se edita ni se borra desde la app (un reporte sellado la cita por id + sha256).
GRANT SELECT, INSERT ON "service_hours_photos" TO adoptafacil_app;

-- Alta cross-tenant por identidad: solo el dueño de la sesión, con la
-- inscripción aceptada, sin certificado emitido, sesión no rechazada y con
-- tope de fotos por sesión. Devuelve 0 filas si la sesión no existe o no es
-- suya (la app responde 404); RAISE para las demás reglas.
CREATE OR REPLACE FUNCTION add_service_hours_photo(
  p_service_hours_id UUID,
  p_volunteer_user_id UUID,
  p_storage_ref TEXT,
  p_content_type TEXT,
  p_size_bytes INTEGER,
  p_sha256 TEXT,
  p_max_photos INTEGER
)
  RETURNS SETOF "service_hours_photos"
  LANGUAGE plpgsql
  VOLATILE
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  p "service_hours_photos";
  v_org UUID;
  v_owner UUID;
  v_status TEXT;
  v_enrollment UUID;
  v_count INTEGER;
BEGIN
  SELECT h.organization_id, h.volunteer_user_id, h.status, h.enrollment_id
    INTO v_org, v_owner, v_status, v_enrollment
    FROM "service_hours" h
   WHERE h.id = p_service_hours_id;
  IF NOT FOUND OR v_owner <> p_volunteer_user_id THEN
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM "volunteer_certificates" WHERE enrollment_id = v_enrollment) THEN
    RAISE EXCEPTION 'a certificate has already been issued for this enrollment';
  END IF;

  IF v_status = 'rejected' THEN
    RAISE EXCEPTION 'service hours entry was rejected';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('service_hours_photos:' || p_service_hours_id::text));
  SELECT count(*) INTO v_count FROM "service_hours_photos" WHERE service_hours_id = p_service_hours_id;
  IF v_count >= p_max_photos THEN
    RAISE EXCEPTION 'service hours photo limit reached';
  END IF;

  INSERT INTO "service_hours_photos" (
    "id", "organization_id", "service_hours_id", "volunteer_user_id",
    "storage_ref", "content_type", "size_bytes", "sha256", "created_at"
  ) VALUES (
    gen_random_uuid(), v_org, p_service_hours_id, p_volunteer_user_id,
    p_storage_ref, p_content_type, p_size_bytes, p_sha256, CURRENT_TIMESTAMP
  )
  RETURNING * INTO p;

  RETURN NEXT p;
END;
$$;

REVOKE ALL ON FUNCTION add_service_hours_photo(UUID, UUID, TEXT, TEXT, INTEGER, TEXT, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION add_service_hours_photo(UUID, UUID, TEXT, TEXT, INTEGER, TEXT, INTEGER) TO adoptafacil_app;

-- Organización de UNA sesión, solo si es del voluntario que pregunta (para
-- guardar el archivo bajo el tenant correcto antes de insertar). Nada más.
CREATE OR REPLACE FUNCTION service_hours_owner_org(p_service_hours_id UUID, p_volunteer_user_id UUID)
  RETURNS TABLE (organization_id UUID)
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT h.organization_id
    FROM "service_hours" h
   WHERE h.id = p_service_hours_id
     AND h.volunteer_user_id = p_volunteer_user_id;
$$;

REVOKE ALL ON FUNCTION service_hours_owner_org(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION service_hours_owner_org(UUID, UUID) TO adoptafacil_app;

-- 4. Lecturas por identidad y listado nacional ---------------------------------
CREATE OR REPLACE FUNCTION volunteer_enrollments_for_user(p_user_id UUID)
  RETURNS JSONB
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', e.id,
        'organizationId', e.organization_id,
        'organizationName', o.name,
        'opportunityId', e.opportunity_id,
        'opportunityTitle', vo.title,
        'opportunityStartDate', vo.start_date,
        'opportunityEndDate', vo.end_date,
        'sessionDates', to_jsonb(vo.session_dates),
        'volunteerUserId', e.volunteer_user_id,
        'appliesToStudentService', e.applies_to_student_service,
        'status', e.status,
        'rejectionReason', e.rejection_reason,
        'decidedByUserId', e.decided_by_user_id,
        'decidedAt', e.decided_at,
        'createdAt', e.created_at,
        'isMinor', e.is_minor,
        'guardianName', e.guardian_name,
        'guardianDocument', e.guardian_document,
        'schoolName', e.school_name,
        'schoolAgreementCode', e.school_agreement_code
      )
      ORDER BY e.created_at DESC
    ),
    '[]'::jsonb
  )
  FROM "volunteer_enrollments" e
  JOIN "volunteer_opportunities" vo ON vo.id = e.opportunity_id
  JOIN "organizations" o ON o.id = e.organization_id
  WHERE e.volunteer_user_id = p_user_id;
$$;
REVOKE ALL ON FUNCTION volunteer_enrollments_for_user(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION volunteer_enrollments_for_user(UUID) TO adoptafacil_app;

CREATE OR REPLACE FUNCTION service_hours_for_user(p_user_id UUID)
  RETURNS JSONB
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', h.id,
        'organizationId', h.organization_id,
        'enrollmentId', h.enrollment_id,
        'volunteerUserId', h.volunteer_user_id,
        'date', h.date,
        'hours', h.hours,
        'description', h.description,
        'status', h.status,
        'rejectionReason', h.rejection_reason,
        'decidedByUserId', h.decided_by_user_id,
        'decidedAt', h.decided_at,
        'createdAt', h.created_at,
        'photos', COALESCE((
          SELECT jsonb_agg(
            jsonb_build_object(
              'id', ph.id,
              'serviceHoursId', ph.service_hours_id,
              'contentType', ph.content_type,
              'sizeBytes', ph.size_bytes,
              'createdAt', ph.created_at
            ) ORDER BY ph.created_at
          )
          FROM "service_hours_photos" ph
          WHERE ph.service_hours_id = h.id
        ), '[]'::jsonb)
      )
      ORDER BY h.date DESC
    ),
    '[]'::jsonb
  )
  FROM "service_hours" h
  WHERE h.volunteer_user_id = p_user_id;
$$;
REVOKE ALL ON FUNCTION service_hours_for_user(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION service_hours_for_user(UUID) TO adoptafacil_app;

CREATE OR REPLACE FUNCTION public.public_volunteer_opportunities(p_limit integer, p_offset integer)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT jsonb_build_object(
    'items', COALESCE(
      (
        SELECT jsonb_agg(item ORDER BY (item->>'startDate') ASC)
        FROM (
          SELECT jsonb_build_object(
            'id', vo.id,
            'organizationId', vo.organization_id,
            'organizationName', o.name,
            'title', vo.title,
            'description', vo.description,
            'category', vo.category,
            'startDate', vo.start_date,
            'endDate', vo.end_date,
            'capacity', vo.capacity,
            'location', vo.location,
            'requirements', vo.requirements,
            'appliesToStudentService', vo.applies_to_student_service,
            'sessionDates', to_jsonb(vo.session_dates)
          ) AS item
          FROM volunteer_opportunities vo
          JOIN organizations o ON o.id = vo.organization_id
          WHERE vo.status = 'active'
            AND vo.end_date >= (now() AT TIME ZONE 'UTC')
            AND o.status = 'approved'
          ORDER BY vo.start_date ASC, vo.id ASC
          LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50)
          OFFSET GREATEST(COALESCE(p_offset, 0), 0)
        ) page
      ),
      '[]'::jsonb
    ),
    'total', (
      SELECT count(*)
      FROM volunteer_opportunities vo
      JOIN organizations o ON o.id = vo.organization_id
      WHERE vo.status = 'active'
        AND vo.end_date >= (now() AT TIME ZONE 'UTC')
        AND o.status = 'approved'
    )
  );
$function$;
