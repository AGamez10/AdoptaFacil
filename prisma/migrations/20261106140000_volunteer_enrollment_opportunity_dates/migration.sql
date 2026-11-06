-- Volunteering: la vista "mis voluntariados" de la persona necesita las fechas
-- de la jornada para acotar el calendario de horas (solo los días que dura la
-- jornada, nunca un rango abierto). Solo se agregan dos claves al JSON; mismo
-- nombre, misma firma, así que CREATE OR REPLACE es seguro.

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
