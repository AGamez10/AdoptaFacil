-- Voluntariado en la página de inicio: el listado público nacional
-- (`public_volunteer_opportunities`) mostraba también jornadas que ya
-- terminaron mientras la organización no las cerrara a mano, y como ordena por
-- fecha de inicio ascendente, las más viejas salían primero. Ahora solo lista
-- jornadas abiertas: activas y cuya fecha de fin no ha pasado. Mismas columnas
-- públicas y mismo filtro de organización aprobada que antes.
--
-- El índice sirve el filtro por estado y el orden por fecha de inicio entre
-- TODAS las organizaciones (solo había índices que empiezan por
-- organization_id), igual que `campaigns_status_created_at_idx`.

CREATE INDEX IF NOT EXISTS "volunteer_opportunities_status_start_date_idx"
  ON "volunteer_opportunities" ("status", "start_date", "id");

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
            'appliesToStudentService', vo.applies_to_student_service
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
