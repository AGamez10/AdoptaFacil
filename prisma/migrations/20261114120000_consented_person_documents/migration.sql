-- Documento de identidad de las personas que AUTORIZARON a una organización a
-- identificarlas en sus reportes y certificados.
--
-- El documento vive en el perfil de la persona (otra organización, aislada por
-- RLS), así que la organización no puede leerlo directamente. Esta función
-- SECURITY DEFINER es la única vía y está acotada: solo devuelve el documento
-- de quien tiene un consentimiento VIGENTE para ESA organización
-- (`org_report_identification`); sin consentimiento o revocado, no devuelve nada.
CREATE OR REPLACE FUNCTION consented_person_documents(p_org UUID, p_users UUID[])
  RETURNS TABLE (user_id UUID, document_id TEXT)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT u."id", u."document_id"
    FROM "users" u
    JOIN "third_party_consents" c
      ON c."subject_user_id" = u."id"
     AND c."organization_id" = p_org
     AND c."purpose" = 'org_report_identification'
     AND c."revoked_at" IS NULL
   WHERE u."id" = ANY (p_users)
     AND u."document_id" IS NOT NULL
     AND btrim(u."document_id") <> '';
$$;
REVOKE ALL ON FUNCTION consented_person_documents(UUID, UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION consented_person_documents(UUID, UUID[]) TO adoptafacil_app;
