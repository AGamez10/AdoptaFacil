-- ============================================================================
-- Voluntariado: cancelar jornadas + verificación pública de certificados.
--
-- 1. `volunteer_opportunities.cancelled_at` / `cancellation_reason`: una
--    jornada publicada no se borra (sus inscripciones y su rastro de auditoría
--    deben sobrevivir), se CANCELA con un motivo que se avisa a los inscritos.
--    El estado `cancelled` es texto, como `active`/`closed` (sin CHECK previo).
-- 2. `volunteer_certificates.verification_code`: código público, aleatorio y
--    no adivinable (64 bits) que va impreso en el certificado y en su QR. Los
--    certificados ya emitidos reciben el suyo al agregar la columna (ADD COLUMN
--    con DEFAULT volátil rellena cada fila sin disparar los triggers que
--    impiden UPDATE: el certificado sigue siendo inmutable). Luego se quita el
--    DEFAULT: la app genera el código de cada certificado nuevo.
-- 3. `volunteer_certificate_public(code)`: SECURITY DEFINER, search_path fijo,
--    sin SQL dinámico. Expone SOLO lo que está impreso en el certificado
--    (nunca correo, documento, acudiente ni ids internos) para que un colegio
--    o una empresa compruebe que es auténtico.
-- ============================================================================

-- 1. Cancelación de jornadas ---------------------------------------------------
ALTER TABLE "volunteer_opportunities"
  ADD COLUMN "cancelled_at" TIMESTAMP(3),
  ADD COLUMN "cancellation_reason" TEXT;

-- 2. Código de verificación ----------------------------------------------------
ALTER TABLE "volunteer_certificates"
  ADD COLUMN "verification_code" TEXT
  DEFAULT (
    'VOL-' ||
    upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)) || '-' ||
    upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))
  );
ALTER TABLE "volunteer_certificates" ALTER COLUMN "verification_code" DROP DEFAULT;

CREATE UNIQUE INDEX "volunteer_certificates_verification_code_key"
  ON "volunteer_certificates"("verification_code");

-- 3. Verificación pública -------------------------------------------------------
CREATE OR REPLACE FUNCTION volunteer_certificate_public(p_code TEXT)
  RETURNS JSONB
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'verificationCode', c.verification_code,
    'volunteerName', c.volunteer_name,
    'organizationName', c.organization_name,
    'opportunityTitle', c.opportunity_title,
    'totalApprovedHours', c.total_approved_hours,
    'sessions', jsonb_array_length(c.bitacora),
    'periodStart', to_char(c.period_start, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'periodEnd', to_char(c.period_end, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'issuedAt', to_char(c.issued_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'appliesToStudentService', c.applies_to_student_service,
    'schoolName', c.school_name,
    'signerFullName', c.signer_full_name,
    'signerPosition', c.signer_position,
    'signerIsLegalRepresentative', c.signer_is_legal_representative
  )
  FROM "volunteer_certificates" c
  WHERE c.verification_code = upper(btrim(p_code))
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION volunteer_certificate_public(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION volunteer_certificate_public(TEXT) TO adoptafacil_app;

-- 4. "Mis certificados" incluye el código (mismas claves de antes + la nueva).
CREATE OR REPLACE FUNCTION volunteer_certificates_for_user(p_user_id UUID)
  RETURNS JSONB
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', c.id,
        'organizationId', c.organization_id,
        'enrollmentId', c.enrollment_id,
        'volunteerUserId', c.volunteer_user_id,
        'volunteerName', c.volunteer_name,
        'organizationName', c.organization_name,
        'opportunityTitle', c.opportunity_title,
        'totalApprovedHours', c.total_approved_hours,
        'periodStart', c.period_start,
        'periodEnd', c.period_end,
        'appliesToStudentService', c.applies_to_student_service,
        'issuedByUserId', c.issued_by_user_id,
        'issuedAt', c.issued_at,
        'guardianName', c.guardian_name,
        'guardianDocument', c.guardian_document,
        'schoolName', c.school_name,
        'schoolAgreementCode', c.school_agreement_code,
        'bitacora', c.bitacora,
        'verificationCode', c.verification_code
      )
      ORDER BY c.issued_at DESC
    ),
    '[]'::jsonb
  )
  FROM "volunteer_certificates" c
  WHERE c.volunteer_user_id = p_user_id;
$$;
REVOKE ALL ON FUNCTION volunteer_certificates_for_user(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION volunteer_certificates_for_user(UUID) TO adoptafacil_app;
