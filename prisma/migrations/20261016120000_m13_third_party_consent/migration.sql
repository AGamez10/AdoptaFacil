-- M13 · Consentimiento de terceros para usar sus datos en reportes y certificados.
--
-- Un donante, adoptante o voluntario solo aparece identificado en un documento
-- emitido por una organización si tiene un consentimiento VIGENTE para esa
-- organización y esa finalidad. Esta migración añade:
--  1. third_party_consents: un registro por persona, organización y finalidad,
--     con la versión y la huella del texto aceptado. Revocar es la única
--     modificación permitida (se conserva el historial).
--  2. Funciones SECURITY DEFINER acotadas: la persona NO es miembro de la
--     organización, así que otorga, revoca y lista sus consentimientos por
--     funciones que validan que tenga una relación real con ella (inscripción
--     de voluntariado o donación con su cuenta).

CREATE TABLE "third_party_consents" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "subject_user_id" UUID NOT NULL,
    "purpose" TEXT NOT NULL,
    "text_version" TEXT NOT NULL,
    "text_sha256" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "granted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "third_party_consents_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "third_party_consents_purpose_check" CHECK ("purpose" IN ('org_report_identification')),
    CONSTRAINT "third_party_consents_channel_check" CHECK ("channel" IN ('preferences', 'volunteer_enrollment', 'donation')),
    CONSTRAINT "third_party_consents_hash_check" CHECK ("text_sha256" ~ '^[0-9a-f]{64}$')
);

-- Un consentimiento vigente por persona, organización y finalidad.
CREATE UNIQUE INDEX "third_party_consents_active_key"
  ON "third_party_consents"("organization_id", "subject_user_id", "purpose") WHERE "revoked_at" IS NULL;
CREATE INDEX "third_party_consents_subject_user_id_idx" ON "third_party_consents"("subject_user_id");

ALTER TABLE "third_party_consents" ADD CONSTRAINT "third_party_consents_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "third_party_consents" ADD CONSTRAINT "third_party_consents_subject_user_id_fkey"
  FOREIGN KEY ("subject_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "third_party_consents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "third_party_consents" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "third_party_consents"
  USING ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

-- La organización solo LEE (para filtrar sus reportes). Otorgar y revocar los
-- hace la persona por las funciones de abajo.
GRANT SELECT ON "third_party_consents" TO adoptafacil_app;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON "third_party_consents" FROM adoptafacil_app;

-- Solo se puede revocar: ninguna otra columna cambia y un consentimiento
-- revocado no se reactiva (se otorga uno nuevo).
CREATE OR REPLACE FUNCTION third_party_consents_guard() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP IN ('DELETE', 'TRUNCATE') THEN
    RAISE EXCEPTION 'third_party_consents no admite % (historial inmutable)', TG_OP;
  END IF;
  IF OLD.revoked_at IS NOT NULL
     OR NEW.revoked_at IS NULL
     OR NEW.id IS DISTINCT FROM OLD.id
     OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
     OR NEW.subject_user_id IS DISTINCT FROM OLD.subject_user_id
     OR NEW.purpose IS DISTINCT FROM OLD.purpose
     OR NEW.text_version IS DISTINCT FROM OLD.text_version
     OR NEW.text_sha256 IS DISTINCT FROM OLD.text_sha256
     OR NEW.channel IS DISTINCT FROM OLD.channel
     OR NEW.granted_at IS DISTINCT FROM OLD.granted_at THEN
    RAISE EXCEPTION 'third_party_consents solo admite revocar un consentimiento vigente';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER third_party_consents_guard BEFORE UPDATE OR DELETE ON "third_party_consents"
  FOR EACH ROW EXECUTE FUNCTION third_party_consents_guard();
CREATE TRIGGER third_party_consents_no_truncate BEFORE TRUNCATE ON "third_party_consents"
  FOR EACH STATEMENT EXECUTE FUNCTION third_party_consents_guard();

-- ============================================================================
-- Funciones de la persona (cross-tenant, acotadas)
-- ============================================================================

-- ¿Tiene la persona una relación real con la organización?
CREATE OR REPLACE FUNCTION third_party_has_relationship(p_user UUID, p_org UUID) RETURNS BOOLEAN
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM "volunteer_enrollments"
                  WHERE "volunteer_user_id" = p_user AND "organization_id" = p_org)
      OR EXISTS (SELECT 1 FROM "donations"
                  WHERE "donor_user_id" = p_user AND "organization_id" = p_org);
$$;
REVOKE ALL ON FUNCTION third_party_has_relationship(UUID, UUID) FROM PUBLIC;

-- Otorga el consentimiento. Devuelve el id; idempotente si ya hay uno vigente.
-- Sin relación con la organización no hace nada (la API responde 404).
CREATE OR REPLACE FUNCTION grant_third_party_consent(
  p_user UUID, p_org UUID, p_purpose TEXT, p_version TEXT, p_sha256 TEXT, p_channel TEXT
) RETURNS UUID
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id UUID;
BEGIN
  IF NOT third_party_has_relationship(p_user, p_org) THEN
    RETURN NULL;
  END IF;
  SELECT "id" INTO v_id FROM "third_party_consents"
   WHERE "organization_id" = p_org AND "subject_user_id" = p_user
     AND "purpose" = p_purpose AND "revoked_at" IS NULL;
  IF FOUND THEN
    RETURN v_id;
  END IF;
  INSERT INTO "third_party_consents"
    ("id", "organization_id", "subject_user_id", "purpose", "text_version", "text_sha256", "channel")
  VALUES (gen_random_uuid(), p_org, p_user, p_purpose, p_version, p_sha256, p_channel)
  RETURNING "id" INTO v_id;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION grant_third_party_consent(UUID, UUID, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION grant_third_party_consent(UUID, UUID, TEXT, TEXT, TEXT, TEXT) TO adoptafacil_app;

-- Revoca el consentimiento vigente. Devuelve true si había uno.
CREATE OR REPLACE FUNCTION revoke_third_party_consent(p_user UUID, p_org UUID, p_purpose TEXT) RETURNS BOOLEAN
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_count INT;
BEGIN
  UPDATE "third_party_consents" SET "revoked_at" = CURRENT_TIMESTAMP
   WHERE "organization_id" = p_org AND "subject_user_id" = p_user
     AND "purpose" = p_purpose AND "revoked_at" IS NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count > 0;
END;
$$;
REVOKE ALL ON FUNCTION revoke_third_party_consent(UUID, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION revoke_third_party_consent(UUID, UUID, TEXT) TO adoptafacil_app;

-- Las organizaciones con las que la persona tiene relación y el estado de su
-- consentimiento. Solo expone el nombre público de la organización y el estado.
CREATE OR REPLACE FUNCTION third_party_consents_for_user(p_user UUID) RETURNS JSONB
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'organizationId', o."id",
           'organizationName', o."name",
           'purpose', 'org_report_identification',
           'authorized', c."id" IS NOT NULL,
           'textVersion', c."text_version",
           'grantedAt', c."granted_at"
         ) ORDER BY o."name"), '[]'::jsonb)
    FROM "organizations" o
    LEFT JOIN "third_party_consents" c
      ON c."organization_id" = o."id" AND c."subject_user_id" = p_user
     AND c."purpose" = 'org_report_identification' AND c."revoked_at" IS NULL
   WHERE o."id" IN (
           SELECT "organization_id" FROM "volunteer_enrollments" WHERE "volunteer_user_id" = p_user
           UNION
           SELECT "organization_id" FROM "donations" WHERE "donor_user_id" = p_user
         );
$$;
REVOKE ALL ON FUNCTION third_party_consents_for_user(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION third_party_consents_for_user(UUID) TO adoptafacil_app;
