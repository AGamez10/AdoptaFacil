-- Ley 1581 de 2012 (arts. 14 y 15) y Decreto 1377 de 2013: derechos de
-- consulta y supresión del titular (auditoría run-2 C-01).
--
-- Dos funciones SECURITY DEFINER, ambas keyed por el id del titular que la API
-- toma del token (nunca del cuerpo), igual que adoption_requests_for_applicant:
--
--  * privacy_subject_data(user): SOLO LECTURA. Reúne lo que la plataforma
--    guarda de la persona en todos los tenants (sus donaciones, solicitudes de
--    adopción, apadrinamientos, compras de café con su correo, publicaciones,
--    consentimientos y aceptaciones legales).
--
--  * privacy_suppress_person(user): suprime la CUENTA de una persona.
--    - Borra lo que es solo suyo y no tiene deber legal de conservación:
--      publicaciones (con sus imágenes; devuelve las llaves para borrar los
--      archivos), perfiles de mascotas, notificaciones, sesiones, factores MFA
--      y enlaces de restablecimiento.
--    - Anonimiza la identidad: nombre, correo, teléfono, cédula y dirección de
--      la cuenta y de su organización personal; sus comentarios y reseñas de
--      servicios quedan sin nombre ni texto. La credencial queda inutilizable.
--    - CONSERVA, con su base legal, lo que la ley obliga a guardar o es
--      evidencia inmutable: donaciones y certificados (soporte tributario),
--      solicitudes y contratos de adopción, apadrinamientos, compras de café,
--      aceptaciones legales y consentimientos, reseñas públicas y la bitácora de
--      auditoría (que solo guarda ids, nunca datos de contacto). Ninguno de esos
--      candados de inmutabilidad se abre.
--    Solo cuentas de persona: el miembro de una organización se retira desde
--    el equipo y una organización no es titular (Ley 1581 protege a personas
--    naturales).

CREATE OR REPLACE FUNCTION privacy_subject_data(p_user_id UUID)
  RETURNS JSONB
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  u users%ROWTYPE;
  v_email TEXT;
BEGIN
  SELECT * INTO u FROM users WHERE id = p_user_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  v_email := lower(u.email);

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
      WHERE d.donor_user_id = u.id OR lower(d.payer->>'email') = v_email
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
    'coffeeOrders', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'reference', c.reference,
        'status', c.status,
        'quantity', c.quantity,
        'totalCop', c.total_cop,
        'buyerName', c.buyer_name,
        'buyerPhone', c.buyer_phone,
        'shippingAddress', c.shipping_address,
        'shippingCity', c.shipping_city,
        'createdAt', c.created_at
      ) ORDER BY c.created_at DESC)
      FROM coffee_orders c WHERE lower(c.buyer_email) = v_email
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

CREATE OR REPLACE FUNCTION privacy_suppress_person(p_user_id UUID)
  RETURNS JSONB
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  u users%ROWTYPE;
  v_placeholder TEXT := 'suprimido-' || p_user_id::text || '@titular.invalid';
  v_name CONSTANT TEXT := 'Titular suprimido';
  v_files JSONB;
  v_posts INTEGER;
BEGIN
  SELECT * INTO u FROM users WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  IF u.account_type <> 'person' THEN
    RAISE EXCEPTION 'privacy_suppress_person: only person accounts' USING ERRCODE = '22023';
  END IF;

  -- Archivos de sus publicaciones (la API los borra del almacenamiento).
  SELECT COALESCE(jsonb_agg(k), '[]'::jsonb) INTO v_files FROM (
    SELECT i.storage_ref AS k FROM community_post_images i
      JOIN community_posts p ON p.id = i.post_id WHERE p.author_user_id = u.id
    UNION ALL
    SELECT i.poster_ref FROM community_post_images i
      JOIN community_posts p ON p.id = i.post_id
      WHERE p.author_user_id = u.id AND i.poster_ref IS NOT NULL
  ) f;

  DELETE FROM community_posts WHERE author_user_id = u.id;
  GET DIAGNOSTICS v_posts = ROW_COUNT;
  UPDATE community_comments
     SET author_name = v_name, body = '[Comentario eliminado a solicitud del titular]'
   WHERE author_user_id = u.id;
  UPDATE community_service_listing_reviews
     SET author_name = v_name, comment = NULL
   WHERE author_user_id = u.id;
  DELETE FROM community_pet_profiles WHERE owner_user_id = u.id;
  DELETE FROM notification_reads WHERE user_id = u.id;
  DELETE FROM user_notifications WHERE user_id = u.id;
  DELETE FROM refresh_tokens WHERE user_id = u.id;
  DELETE FROM password_reset_tokens WHERE user_id = u.id;
  DELETE FROM auth_mfa_factors WHERE user_id = u.id;

  UPDATE auth_credentials
     SET email = v_placeholder,
         -- Not a valid hash of any password: login can never succeed.
         password_hash = '!suppressed:' || md5(random()::text || clock_timestamp()::text),
         auth_provider = 'password',
         google_sub = NULL,
         updated_at = now()
   WHERE user_id = u.id;
  UPDATE users
     SET display_name = v_name, email = v_placeholder,
         phone = NULL, document_id = NULL, address = NULL, updated_at = now()
   WHERE id = u.id;
  UPDATE organizations SET name = v_name, updated_at = now() WHERE id = u.organization_id;

  RETURN jsonb_build_object('postsDeleted', v_posts, 'storageKeys', v_files);
END;
$$;

REVOKE ALL ON FUNCTION privacy_subject_data(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION privacy_suppress_person(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION privacy_subject_data(UUID) TO adoptafacil_app;
GRANT EXECUTE ON FUNCTION privacy_suppress_person(UUID) TO adoptafacil_app;
