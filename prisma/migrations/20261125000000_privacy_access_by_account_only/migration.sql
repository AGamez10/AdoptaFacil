-- AF-N02 (auditoría de seguridad 2026-11-24): la consulta del titular
-- (GET /me/privacy/data) también devolvía las donaciones y compras de café cuyo
-- correo de pagador coincidía con el de la cuenta. Registrarse con un correo
-- NO prueba que el buzón sea de quien se registra, así que cualquiera podía
-- crear una cuenta con el correo de un donante invitado y leer su nombre y
-- cédula. Ahora solo se entrega lo que está atado a la cuenta por su id.
--
-- Lo hecho como invitado (sin cuenta) se atiende por el canal de consultas de
-- la política de datos, que verifica la identidad antes de responder.
-- Solo cambia el cuerpo de la función; permisos y firma quedan igual.

CREATE OR REPLACE FUNCTION privacy_subject_data(p_user_id UUID)
  RETURNS JSONB
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  u users%ROWTYPE;
BEGIN
  SELECT * INTO u FROM users WHERE id = p_user_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'account', jsonb_build_object(
      'id', u.id,
      'accountType', u.account_type,
      'displayName', u.display_name,
      'email', u.email,
      'phone', u.phone,
      'documentId', u.document_id,
      'address', u.address,
      'authProvider', (SELECT auth_provider FROM auth_credentials WHERE user_id = u.id),
      'createdAt', u.created_at
    ),
    'donations', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', d.id,
        'organizationName', o.name,
        'amountCop', d.amount_charged,
        'status', d.status,
        'anonymous', d.anonymous,
        'payer', d.payer,
        'createdAt', d.created_at
      ) ORDER BY d.created_at DESC)
      FROM donations d JOIN organizations o ON o.id = d.organization_id
      WHERE d.donor_user_id = u.id
    ), '[]'::jsonb),
    'adoptionRequests', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', a.id,
        'organizationName', o.name,
        'animalName', a.animal_snapshot->>'name',
        'status', a.status,
        'applicant', a.applicant,
        'message', a.message,
        'createdAt', a.created_at
      ) ORDER BY a.created_at DESC)
      FROM adoption_requests a JOIN organizations o ON o.id = a.organization_id
      WHERE a.applicant_user_id = u.id
    ), '[]'::jsonb),
    'sponsorships', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', s.id,
        'organizationName', o.name,
        'sponsorName', s.sponsor_name,
        'status', s.status,
        'startedAt', s.started_at
      ) ORDER BY s.started_at DESC)
      FROM sponsorships s JOIN organizations o ON o.id = s.organization_id
      WHERE s.sponsor_user_id = u.id
    ), '[]'::jsonb),
    'community', jsonb_build_object(
      'posts', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', p.id, 'type', p.type, 'title', p.title, 'body', p.body,
          'createdAt', p.created_at
        ) ORDER BY p.created_at DESC)
        FROM community_posts p WHERE p.author_user_id = u.id
      ), '[]'::jsonb),
      'comments', (SELECT count(*) FROM community_comments WHERE author_user_id = u.id),
      'petProfiles', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('id', pp.id, 'name', pp.name, 'species', pp.species))
        FROM community_pet_profiles pp WHERE pp.owner_user_id = u.id
      ), '[]'::jsonb),
      'serviceReviews', (
        SELECT count(*) FROM community_service_listing_reviews WHERE author_user_id = u.id
      )
    ),
    'legalAcceptances', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'document', la.document_key, 'version', la.document_version,
        'action', la.action, 'channel', la.channel, 'at', la.created_at
      ) ORDER BY la.created_at DESC)
      FROM legal_acceptances la WHERE la.user_id = u.id
    ), '[]'::jsonb),
    'thirdPartyConsents', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'organizationName', o.name, 'purpose', t.purpose,
        'grantedAt', t.granted_at, 'revokedAt', t.revoked_at
      ) ORDER BY t.granted_at DESC)
      FROM third_party_consents t JOIN organizations o ON o.id = t.organization_id
      WHERE t.subject_user_id = u.id
    ), '[]'::jsonb)
  );
END;
$$;
