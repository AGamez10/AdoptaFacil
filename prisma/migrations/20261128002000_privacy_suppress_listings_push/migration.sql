-- Auditoría run-4 F8 (Ley 1581, derecho de supresión): la supresión dejaba
-- intactos los avisos del directorio (nombre, teléfono, WhatsApp, correo y
-- dirección seguían públicos) y las suscripciones push del titular. Se
-- redefine `privacy_suppress_person` para ocultar y vaciar sus avisos y borrar
-- sus suscripciones push; y se corrige lo ya suprimido.

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
  DELETE FROM push_subscriptions WHERE user_id = u.id;
  -- Avisos del directorio que publicó desde su cuenta personal: se ocultan y
  -- se vacían sus datos de contacto (las reseñas de terceros se conservan).
  UPDATE community_service_listings
     SET name = v_name || ' ' || left(id::text, 8), description = NULL, address = NULL,
         phone = NULL, whatsapp = NULL, website = NULL, email = NULL, updated_at = now()
   WHERE created_by_user_id = u.id AND organization_id = u.organization_id;
  -- Aparte: el trigger de re-revisión devuelve a 'pending' todo cambio de
  -- contenido; un cambio SOLO de estado lo deja en 'hidden' (fuera de la cola).
  UPDATE community_service_listings
     SET status = 'hidden', updated_at = now()
   WHERE created_by_user_id = u.id AND organization_id = u.organization_id;

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

REVOKE ALL ON FUNCTION privacy_suppress_person(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION privacy_suppress_person(UUID) TO adoptafacil_app;

-- Titulares ya suprimidos antes de esta corrección.
DELETE FROM push_subscriptions ps
 USING users u
 WHERE ps.user_id = u.id AND u.email LIKE 'suprimido-%@titular.invalid';
UPDATE community_service_listings l
   SET name = 'Titular suprimido ' || left(l.id::text, 8), description = NULL, address = NULL,
       phone = NULL, whatsapp = NULL, website = NULL, email = NULL, updated_at = now()
  FROM users u
 WHERE l.created_by_user_id = u.id AND l.organization_id = u.organization_id
   AND u.email LIKE 'suprimido-%@titular.invalid';
UPDATE community_service_listings l
   SET status = 'hidden', updated_at = now()
  FROM users u
 WHERE l.created_by_user_id = u.id AND l.organization_id = u.organization_id
   AND u.email LIKE 'suprimido-%@titular.invalid';
