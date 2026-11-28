-- Auditoría run-4 F2: el correo del solicitante de una adopción se tomaba de
-- `adoption_requests.applicant.email`, un texto que escribe quien envía la
-- solicitud. Con eso, una org podía mandar anuncios (y correos de estado) a
-- direcciones de terceros que nunca interactuaron con ella.
--
-- Desde ahora el correo SIEMPRE es el de la cuenta (`users.email` de
-- `applicant_user_id`). La org no puede leer `users` de otro tenant (RLS), así
-- que esta función SECURITY DEFINER expone SOLO (user_id, email) de quienes
-- tienen una solicitud en la org ACTIVA del contexto. Exige que el argumento
-- coincida con `app.current_org_id`: fuera de `withOrgContext` no devuelve nada.

CREATE OR REPLACE FUNCTION adoption_applicant_account_emails(p_organization_id UUID)
  RETURNS TABLE(user_id UUID, email TEXT)
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
  SELECT DISTINCT u.id, u.email
  FROM "adoption_requests" ar
  JOIN "users" u ON u.id = ar.applicant_user_id
  WHERE ar.organization_id = p_organization_id
    AND p_organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid;
$$;

REVOKE ALL ON FUNCTION adoption_applicant_account_emails(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION adoption_applicant_account_emails(UUID) TO adoptafacil_app;

-- Filas históricas: el JSON guardado se alinea con la cuenta, para que ninguna
-- vista (panel, contrato, exportaciones) siga mostrando un correo tecleado.
UPDATE "adoption_requests" ar
SET applicant = jsonb_set(ar.applicant, '{email}', to_jsonb(u.email))
FROM "users" u
WHERE u.id = ar.applicant_user_id
  AND ar.applicant ->> 'email' IS DISTINCT FROM u.email;
