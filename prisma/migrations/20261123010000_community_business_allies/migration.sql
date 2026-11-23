-- M11 · Comunidad · Negocios aliados.
--
-- Un negocio del ecosistema (veterinaria, peluquería, paseador, tienda) deja
-- de ser solo una vitrina: activa su PANEL DE NEGOCIO, publica BENEFICIOS para
-- quienes adoptan y acumula IMPACTO comprobable (aportes entregados a
-- refugios, adoptantes beneficiados). El sello "Aliado de AdoptaFácil" sigue
-- siendo decisión de la plataforma (`service_listing_set_partner`), ahora con
-- requisitos visibles; nunca se compra.
--
-- Tres tablas, todas de negocio por tenant (RLS ENABLE + FORCE + policy):
--   - community_business_accounts: una por tenant. Marca que la cuenta es un
--     negocio (menú propio) y guarda la autorización OPCIONAL para recibir
--     ofertas comerciales de AdoptaFácil (Ley 1581: finalidad separada).
--   - community_business_benefits: beneficio que el negocio ofrece a quien
--     adopta. Nace `pending`; la plataforma lo aprueba; editar su contenido lo
--     devuelve a revisión (mismo patrón que los perfiles).
--   - community_benefit_passes: el "pase" de una persona que adoptó para usar
--     un beneficio. Vive en el tenant del NEGOCIO pero el rol de la app no
--     tiene NINGÚN privilegio sobre la tabla: solo funciones SECURITY DEFINER
--     acotadas emiten, listan y canjean. El negocio nunca ve quién adoptó: al
--     canjear solo sabe el nombre del animal y el mes de la adopción.
--
-- Detrás de FEATURE_COMMUNITY (lo aplica la API).

-- ============================================================================
-- TABLAS
-- ============================================================================

CREATE TABLE "community_business_accounts" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "commercial_consent" BOOLEAN NOT NULL DEFAULT false,
    "commercial_consent_at" TIMESTAMP(3),
    "commercial_consent_version" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "community_business_accounts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "community_business_benefits" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "listing_id" UUID NOT NULL,
    "created_by_user_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "terms" TEXT,
    "valid_until" DATE,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "moderation_reason" TEXT,
    "moderated_by_user_id" UUID,
    "moderated_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "community_business_benefits_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "community_benefit_passes" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "benefit_id" UUID NOT NULL,
    "adopter_user_id" UUID NOT NULL,
    "adoption_delivery_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'issued',
    "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "redeemed_at" TIMESTAMP(3),
    "redeemed_by_user_id" UUID,

    CONSTRAINT "community_benefit_passes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "community_business_accounts_organization_id_key" ON "community_business_accounts"("organization_id");
CREATE INDEX "community_business_benefits_organization_id_idx" ON "community_business_benefits"("organization_id");
CREATE INDEX "community_business_benefits_listing_id_idx" ON "community_business_benefits"("listing_id");
CREATE INDEX "community_business_benefits_status_idx" ON "community_business_benefits"("status");
CREATE INDEX "community_benefit_passes_organization_id_idx" ON "community_benefit_passes"("organization_id");
CREATE INDEX "community_benefit_passes_adopter_user_id_idx" ON "community_benefit_passes"("adopter_user_id");
CREATE UNIQUE INDEX "community_benefit_passes_code_key" ON "community_benefit_passes"("code");
CREATE UNIQUE INDEX "community_benefit_passes_benefit_id_adopter_user_id_key" ON "community_benefit_passes"("benefit_id", "adopter_user_id");

ALTER TABLE "community_business_accounts" ADD CONSTRAINT "community_business_accounts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "community_business_benefits" ADD CONSTRAINT "community_business_benefits_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "community_business_benefits" ADD CONSTRAINT "community_business_benefits_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "community_service_listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "community_benefit_passes" ADD CONSTRAINT "community_benefit_passes_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "community_benefit_passes" ADD CONSTRAINT "community_benefit_passes_benefit_id_fkey" FOREIGN KEY ("benefit_id") REFERENCES "community_business_benefits"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "community_benefit_passes" ADD CONSTRAINT "community_benefit_passes_adoption_delivery_id_fkey" FOREIGN KEY ("adoption_delivery_id") REFERENCES "adoption_deliveries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Reglas de dominio en la base (no solo en la app).
ALTER TABLE "community_business_benefits"
  ADD CONSTRAINT "community_business_benefits_status_check"
    CHECK ("status" IN ('pending', 'approved', 'rejected', 'hidden')),
  ADD CONSTRAINT "community_business_benefits_title_check"
    CHECK (char_length(btrim("title")) BETWEEN 4 AND 80),
  ADD CONSTRAINT "community_business_benefits_description_check"
    CHECK ("description" IS NULL OR char_length("description") <= 400),
  ADD CONSTRAINT "community_business_benefits_terms_check"
    CHECK ("terms" IS NULL OR char_length("terms") <= 400);
ALTER TABLE "community_benefit_passes"
  ADD CONSTRAINT "community_benefit_passes_status_check" CHECK ("status" IN ('issued', 'redeemed')),
  ADD CONSTRAINT "community_benefit_passes_code_check" CHECK ("code" ~ '^[2-9A-HJ-NP-Z]{8}$'),
  ADD CONSTRAINT "community_benefit_passes_redeemed_check"
    CHECK (("status" = 'redeemed') = ("redeemed_at" IS NOT NULL));
ALTER TABLE "community_business_accounts"
  ADD CONSTRAINT "community_business_accounts_consent_check"
    CHECK (NOT "commercial_consent" OR "commercial_consent_at" IS NOT NULL);

-- ============================================================================
-- ROW-LEVEL SECURITY (RNF03)
-- ============================================================================

ALTER TABLE "community_business_accounts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "community_business_accounts" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "community_business_accounts"
  USING ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

ALTER TABLE "community_business_benefits" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "community_business_benefits" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "community_business_benefits"
  USING ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

ALTER TABLE "community_benefit_passes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "community_benefit_passes" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "community_benefit_passes"
  USING ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

-- ============================================================================
-- MÍNIMO PRIVILEGIO
-- ============================================================================

-- La cuenta de negocio: la app la crea y solo cambia la autorización comercial.
GRANT SELECT, INSERT ON "community_business_accounts" TO adoptafacil_app;
GRANT UPDATE ("commercial_consent", "commercial_consent_at", "commercial_consent_version", "updated_at")
  ON "community_business_accounts" TO adoptafacil_app;
REVOKE DELETE, TRUNCATE ON "community_business_accounts" FROM adoptafacil_app;

-- El beneficio: el negocio escribe su contenido y lo pausa; nunca su estado
-- de moderación. Sin borrado: se pausa (los pases ya emitidos siguen siendo
-- historia verificable del impacto).
GRANT SELECT, INSERT ON "community_business_benefits" TO adoptafacil_app;
GRANT UPDATE ("title", "description", "terms", "valid_until", "active", "updated_at")
  ON "community_business_benefits" TO adoptafacil_app;
REVOKE DELETE, TRUNCATE ON "community_business_benefits" FROM adoptafacil_app;

-- Los pases: ningún privilegio directo. Solo funciones de abajo.
REVOKE ALL ON "community_benefit_passes" FROM adoptafacil_app;

-- Todo beneficio nace pendiente y sin moderación, lo envíe quien lo envíe, y
-- solo puede colgar de un perfil del MISMO tenant.
CREATE OR REPLACE FUNCTION community_business_benefit_born_pending()
  RETURNS TRIGGER
  LANGUAGE plpgsql SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "community_service_listings" l
                  WHERE l.id = NEW.listing_id AND l.organization_id = NEW.organization_id) THEN
    RAISE EXCEPTION 'listing not found';
  END IF;
  NEW.status := 'pending';
  NEW.moderation_reason := NULL;
  NEW.moderated_by_user_id := NULL;
  NEW.moderated_at := NULL;
  RETURN NEW;
END;
$$;

-- Editar el contenido lo devuelve a revisión. Pausar/reanudar no.
CREATE OR REPLACE FUNCTION community_business_benefit_rereview()
  RETURNS TRIGGER
  LANGUAGE plpgsql SET search_path = public, pg_temp
AS $$
BEGIN
  IF (NEW.title, NEW.description, NEW.terms, NEW.valid_until)
     IS DISTINCT FROM (OLD.title, OLD.description, OLD.terms, OLD.valid_until) THEN
    NEW.status := 'pending';
    NEW.moderation_reason := NULL;
    NEW.moderated_by_user_id := NULL;
    NEW.moderated_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER community_business_benefit_born_pending
  BEFORE INSERT ON "community_business_benefits"
  FOR EACH ROW EXECUTE FUNCTION community_business_benefit_born_pending();

CREATE TRIGGER community_business_benefit_rereview
  BEFORE UPDATE ON "community_business_benefits"
  FOR EACH ROW EXECUTE FUNCTION community_business_benefit_rereview();

-- ============================================================================
-- LECTURAS PÚBLICAS (SECURITY DEFINER acotadas: solo lo aprobado y vigente)
-- ============================================================================

-- ¿Este beneficio se puede ver y usar hoy? Perfil y beneficio aprobados,
-- beneficio activo y sin vencer (fecha de Colombia).
CREATE OR REPLACE FUNCTION community_benefit_is_live(b "community_business_benefits")
  RETURNS BOOLEAN
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT b.status = 'approved' AND b.active
     AND (b.valid_until IS NULL OR b.valid_until >= (CURRENT_TIMESTAMP AT TIME ZONE 'America/Bogota')::date)
     AND EXISTS (SELECT 1 FROM "community_service_listings" l
                  WHERE l.id = b.listing_id AND l.status = 'approved');
$$;

CREATE OR REPLACE FUNCTION community_benefit_public_json(b "community_business_benefits")
  RETURNS JSONB
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'id', b.id,
    'listingId', b.listing_id,
    'title', b.title,
    'description', b.description,
    'terms', b.terms,
    'validUntil', to_char(b.valid_until, 'YYYY-MM-DD')
  );
$$;

-- El JSON público de un perfil gana (aditivo) el título de su beneficio para
-- quien adopta, si tiene uno vigente: el directorio lo muestra en la tarjeta.
CREATE OR REPLACE FUNCTION community_service_listing_json(p "community_service_listings")
  RETURNS JSONB
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'id', p.id,
    'category', p.category,
    'name', p.name,
    'description', p.description,
    'department', p.department,
    'city', p.city,
    'address', p.address,
    'phone', p.phone,
    'whatsapp', p.whatsapp,
    'website', p.website,
    'email', p.email,
    'isPartner', p.is_partner,
    'ratingAverage', (
      SELECT round(avg(r.rating)::numeric, 1) FROM "community_service_listing_reviews" r
      WHERE r.listing_id = p.id AND r.status = 'approved'
    ),
    'ratingCount', (
      SELECT count(*) FROM "community_service_listing_reviews" r
      WHERE r.listing_id = p.id AND r.status = 'approved'
    ),
    'adopterBenefitTitle', (
      SELECT b.title FROM "community_business_benefits" b
      WHERE b.listing_id = p.id AND community_benefit_is_live(b)
      ORDER BY b.created_at ASC LIMIT 1
    ),
    'createdAt', to_char(p.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  );
$$;

CREATE OR REPLACE FUNCTION public_service_listing_benefits(p_listing_id UUID)
  RETURNS JSONB
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(jsonb_agg(community_benefit_public_json(b) ORDER BY b.created_at ASC), '[]'::jsonb)
  FROM "community_business_benefits" b
  WHERE b.listing_id = p_listing_id AND community_benefit_is_live(b);
$$;

-- Vitrina de beneficios para quien adopta (con o sin sesión), filtrable por
-- ciudad. Los aliados primero.
CREATE OR REPLACE FUNCTION public_adopter_benefits(p_limit INTEGER, p_offset INTEGER, p_city TEXT)
  RETURNS JSONB
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  WITH filtered AS (
    SELECT b AS benefit, b.created_at, l.name AS listing_name, l.category AS listing_category,
           l.city AS listing_city, l.department AS listing_department,
           l.is_partner AS listing_is_partner
    FROM "community_business_benefits" b
    JOIN "community_service_listings" l ON l.id = b.listing_id
    WHERE community_benefit_is_live(b)
      AND (p_city IS NULL OR lower(btrim(l.city)) = lower(btrim(p_city)))
  )
  SELECT jsonb_build_object(
    'items', COALESCE((
      SELECT jsonb_agg(
        community_benefit_public_json(page.benefit)
          || jsonb_build_object(
               'listingName', page.listing_name,
               'listingCategory', page.listing_category,
               'listingCity', page.listing_city,
               'listingDepartment', page.listing_department,
               'listingIsPartner', page.listing_is_partner)
        ORDER BY page.listing_is_partner DESC, page.created_at DESC)
      FROM (
        SELECT * FROM filtered ORDER BY listing_is_partner DESC, created_at DESC
        LIMIT LEAST(GREATEST(COALESCE(p_limit, 24), 1), 50)
        OFFSET GREATEST(COALESCE(p_offset, 0), 0)
      ) page
    ), '[]'::jsonb),
    'total', (SELECT count(*) FROM filtered)
  );
$$;

-- ============================================================================
-- IMPACTO del negocio (comprobable: lo confirman otros, no el negocio)
--   - aportes entregados: ofertas al Banco de recursos de las personas del
--     tenant cuya entrega la organización receptora marcó como completada;
--   - refugios apoyados: organizaciones distintas que recibieron esos aportes;
--   - adoptantes beneficiados: pases canjeados en el negocio;
--   - beneficios vigentes.
-- ============================================================================

CREATE OR REPLACE FUNCTION community_business_impact(p_org_id UUID)
  RETURNS JSONB
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  WITH donors AS (
    SELECT u.id FROM "users" u WHERE u.organization_id = p_org_id
  ),
  delivered AS (
    SELECT off.organization_id
    FROM "resource_offers" off
    JOIN "resource_deliveries" d ON d.offer_id = off.id
    WHERE off.donor_user_id IN (SELECT id FROM donors) AND d.status = 'completed'
  )
  SELECT jsonb_build_object(
    'contributionsDelivered', (SELECT count(*) FROM delivered),
    'sheltersSupported', (SELECT count(DISTINCT organization_id) FROM delivered),
    'adoptersBenefited', (
      SELECT count(*) FROM "community_benefit_passes" ps
      WHERE ps.organization_id = p_org_id AND ps.status = 'redeemed'
    ),
    'passesIssued', (
      SELECT count(*) FROM "community_benefit_passes" ps WHERE ps.organization_id = p_org_id
    ),
    'liveBenefits', (
      SELECT count(*) FROM "community_business_benefits" b
      WHERE b.organization_id = p_org_id AND community_benefit_is_live(b)
    )
  );
$$;

-- Impacto en público: solo de un perfil aprobado y sin el contador interno de
-- pases emitidos.
CREATE OR REPLACE FUNCTION public_service_listing_impact(p_listing_id UUID)
  RETURNS JSONB
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT community_business_impact(l.organization_id) - 'passesIssued'
  FROM "community_service_listings" l
  WHERE l.id = p_listing_id AND l.status = 'approved';
$$;

-- Plataforma: impacto de cualquier perfil (para decidir el sello).
CREATE OR REPLACE FUNCTION service_listing_impact(p_listing_id UUID)
  RETURNS JSONB
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT community_business_impact(l.organization_id)
  FROM "community_service_listings" l
  WHERE l.id = p_listing_id;
$$;

-- ============================================================================
-- PASES DE BENEFICIO (quien adoptó ↔ negocio, cruzado por identidad)
-- ============================================================================

CREATE OR REPLACE FUNCTION community_benefit_pass_json(ps "community_benefit_passes")
  RETURNS JSONB
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'id', ps.id,
    'code', ps.code,
    'status', ps.status,
    'issuedAt', to_char(ps.issued_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'redeemedAt', to_char(ps.redeemed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'benefit', community_benefit_public_json(b),
    'benefitLive', community_benefit_is_live(b),
    'listingName', l.name,
    'listingCategory', l.category,
    'listingCity', l.city,
    'listingAddress', l.address,
    'listingWhatsapp', l.whatsapp,
    'listingPhone', l.phone
  )
  FROM "community_business_benefits" b
  JOIN "community_service_listings" l ON l.id = b.listing_id
  WHERE b.id = ps.benefit_id;
$$;

-- Lo que ve quien adoptó: si ya puede usar beneficios (tiene una adopción
-- confirmada) y sus pases.
CREATE OR REPLACE FUNCTION community_adopter_benefit_status(p_user_id UUID)
  RETURNS JSONB
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'eligible', EXISTS (
      SELECT 1 FROM "adoption_deliveries" d
      WHERE d.adopter_user_id = p_user_id AND d.status = 'confirmed'
    ),
    'adoptedAnimals', COALESCE((
      SELECT jsonb_agg(d.animal_name ORDER BY d.confirmed_at DESC)
      FROM "adoption_deliveries" d
      WHERE d.adopter_user_id = p_user_id AND d.status = 'confirmed'
    ), '[]'::jsonb),
    'passes', COALESCE((
      SELECT jsonb_agg(community_benefit_pass_json(ps) ORDER BY ps.issued_at DESC)
      FROM "community_benefit_passes" ps
      WHERE ps.adopter_user_id = p_user_id
    ), '[]'::jsonb)
  );
$$;

-- Emitir (o devolver el ya emitido) el pase de una persona para un beneficio.
-- Exige una adopción CONFIRMADA de esa persona y que el beneficio esté
-- vigente; nadie usa beneficios de su propio tenant. El código lo genera la
-- API (aleatorio criptográfico); si choca, la API reintenta.
CREATE OR REPLACE FUNCTION community_benefit_issue_pass(
  p_benefit_id UUID, p_user_id UUID, p_user_org_id UUID, p_code TEXT
)
  RETURNS JSONB
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_benefit "community_business_benefits";
  v_delivery_id UUID;
  v_pass "community_benefit_passes";
BEGIN
  SELECT * INTO v_benefit FROM "community_business_benefits" WHERE id = p_benefit_id;
  IF NOT FOUND OR NOT community_benefit_is_live(v_benefit) THEN
    RAISE EXCEPTION 'benefit not found';
  END IF;
  IF v_benefit.organization_id = p_user_org_id THEN
    RAISE EXCEPTION 'cannot use own benefit';
  END IF;

  SELECT * INTO v_pass FROM "community_benefit_passes"
   WHERE benefit_id = p_benefit_id AND adopter_user_id = p_user_id;
  IF FOUND THEN
    RETURN community_benefit_pass_json(v_pass);
  END IF;

  SELECT d.id INTO v_delivery_id FROM "adoption_deliveries" d
   WHERE d.adopter_user_id = p_user_id AND d.status = 'confirmed'
   ORDER BY d.confirmed_at DESC NULLS LAST LIMIT 1;
  IF v_delivery_id IS NULL THEN
    RAISE EXCEPTION 'no confirmed adoption';
  END IF;

  INSERT INTO "community_benefit_passes" (
    id, organization_id, benefit_id, adopter_user_id, adoption_delivery_id, code, status, issued_at
  ) VALUES (
    gen_random_uuid(), v_benefit.organization_id, p_benefit_id, p_user_id, v_delivery_id,
    upper(p_code), 'issued', CURRENT_TIMESTAMP
  ) RETURNING * INTO v_pass;

  RETURN community_benefit_pass_json(v_pass);
END;
$$;

-- El negocio canjea un código. Solo encuentra pases de SU tenant; nunca ve
-- quién adoptó: devuelve el beneficio, el nombre del animal y el mes de la
-- adopción. Un pase se canjea una sola vez. Queda en la auditoría del negocio.
CREATE OR REPLACE FUNCTION community_benefit_redeem(
  p_code TEXT, p_org_id UUID, p_actor_user_id UUID
)
  RETURNS JSONB
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_pass "community_benefit_passes";
  v_already BOOLEAN := false;
  v_title TEXT;
  v_animal TEXT;
  v_adopted_at TIMESTAMP(3);
BEGIN
  SELECT * INTO v_pass FROM "community_benefit_passes"
   WHERE code = upper(btrim(COALESCE(p_code, ''))) AND organization_id = p_org_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'pass not found';
  END IF;

  IF v_pass.status = 'redeemed' THEN
    v_already := true;
  ELSE
    UPDATE "community_benefit_passes"
       SET status = 'redeemed', redeemed_at = CURRENT_TIMESTAMP, redeemed_by_user_id = p_actor_user_id
     WHERE id = v_pass.id
     RETURNING * INTO v_pass;

    INSERT INTO audit_logs (
      id, organization_id, actor_user_id, action, entity_type, entity_id, metadata, created_at
    ) VALUES (
      gen_random_uuid(), p_org_id, p_actor_user_id, 'community_benefit_pass.redeemed',
      'community_benefit_pass', v_pass.id::text,
      jsonb_build_object('benefitId', v_pass.benefit_id), CURRENT_TIMESTAMP
    );
  END IF;

  SELECT b.title INTO v_title FROM "community_business_benefits" b WHERE b.id = v_pass.benefit_id;
  SELECT d.animal_name, d.confirmed_at INTO v_animal, v_adopted_at
    FROM "adoption_deliveries" d WHERE d.id = v_pass.adoption_delivery_id;

  RETURN jsonb_build_object(
    'result', CASE WHEN v_already THEN 'already_redeemed' ELSE 'redeemed' END,
    'benefitTitle', v_title,
    'animalName', v_animal,
    'adoptedMonth', to_char(v_adopted_at AT TIME ZONE 'America/Bogota', 'YYYY-MM'),
    'redeemedAt', to_char(v_pass.redeemed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  );
END;
$$;

-- Últimos canjes del negocio (sin identidad de quien adoptó).
CREATE OR REPLACE FUNCTION community_benefit_redemptions(p_org_id UUID, p_limit INTEGER)
  RETURNS JSONB
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(jsonb_agg(item ORDER BY (item->>'redeemedAt') DESC), '[]'::jsonb) FROM (
    SELECT jsonb_build_object(
      'id', ps.id,
      'benefitTitle', b.title,
      'animalName', d.animal_name,
      'redeemedAt', to_char(ps.redeemed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    ) AS item
    FROM "community_benefit_passes" ps
    JOIN "community_business_benefits" b ON b.id = ps.benefit_id
    JOIN "adoption_deliveries" d ON d.id = ps.adoption_delivery_id
    WHERE ps.organization_id = p_org_id AND ps.status = 'redeemed'
    ORDER BY ps.redeemed_at DESC
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50)
  ) rows;
$$;

-- ============================================================================
-- MODERACIÓN DE PLATAFORMA de beneficios (PlatformAdmin/SuperAdmin en el
-- controller). Cada decisión queda en la auditoría del tenant del negocio.
-- ============================================================================

CREATE OR REPLACE FUNCTION community_benefit_queue_json(b "community_business_benefits")
  RETURNS JSONB
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT community_benefit_public_json(b) || jsonb_build_object(
    'listingName', (SELECT l.name FROM "community_service_listings" l WHERE l.id = b.listing_id),
    'listingCity', (SELECT l.city FROM "community_service_listings" l WHERE l.id = b.listing_id),
    'active', b.active,
    'status', b.status,
    'moderationReason', b.moderation_reason,
    'updatedAt', to_char(b.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  );
$$;

CREATE OR REPLACE FUNCTION community_benefits_moderation_queue(
  p_limit INTEGER, p_offset INTEGER, p_status TEXT
)
  RETURNS JSONB
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  WITH filtered AS (
    SELECT b AS benefit, b.updated_at FROM "community_business_benefits" b
    WHERE (p_status IS NULL OR b.status = p_status)
  )
  SELECT jsonb_build_object(
    'items', COALESCE((
      SELECT jsonb_agg(community_benefit_queue_json(page.benefit) ORDER BY page.updated_at ASC)
      FROM (
        SELECT * FROM filtered ORDER BY updated_at ASC
        LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50)
        OFFSET GREATEST(COALESCE(p_offset, 0), 0)
      ) page
    ), '[]'::jsonb),
    'total', (SELECT count(*) FROM filtered)
  );
$$;

CREATE OR REPLACE FUNCTION community_benefit_moderate(
  p_id UUID, p_decision TEXT, p_reviewer_user_id UUID, p_reason TEXT
)
  RETURNS JSONB
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_row "community_business_benefits";
  v_status TEXT;
  v_reason TEXT := NULLIF(btrim(COALESCE(p_reason, '')), '');
BEGIN
  IF p_decision NOT IN ('approve', 'reject', 'hide') THEN
    RAISE EXCEPTION 'community_benefit_moderate: invalid decision "%"', p_decision;
  END IF;
  IF p_decision <> 'approve' AND v_reason IS NULL THEN
    RAISE EXCEPTION 'a reason is required';
  END IF;

  v_status := CASE p_decision WHEN 'approve' THEN 'approved' WHEN 'reject' THEN 'rejected' ELSE 'hidden' END;

  UPDATE "community_business_benefits"
     SET status = v_status,
         moderation_reason = CASE WHEN p_decision = 'approve' THEN NULL ELSE v_reason END,
         moderated_by_user_id = p_reviewer_user_id,
         moderated_at = CURRENT_TIMESTAMP
   WHERE id = p_id
   RETURNING * INTO v_row;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'benefit not found';
  END IF;

  INSERT INTO audit_logs (
    id, organization_id, actor_user_id, action, entity_type, entity_id, metadata, created_at
  ) VALUES (
    gen_random_uuid(), v_row.organization_id, p_reviewer_user_id,
    'community_business_benefit.' || v_status, 'community_business_benefit', v_row.id::text,
    jsonb_build_object('decision', p_decision, 'reason', v_reason), CURRENT_TIMESTAMP
  );

  RETURN community_benefit_queue_json(v_row);
END;
$$;

-- ============================================================================
-- PERMISOS DE EJECUCIÓN
-- ============================================================================

REVOKE ALL ON FUNCTION community_benefit_is_live("community_business_benefits") FROM PUBLIC;
REVOKE ALL ON FUNCTION community_benefit_public_json("community_business_benefits") FROM PUBLIC;
REVOKE ALL ON FUNCTION public_service_listing_benefits(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public_adopter_benefits(INTEGER, INTEGER, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION community_business_impact(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public_service_listing_impact(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION service_listing_impact(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION community_benefit_pass_json("community_benefit_passes") FROM PUBLIC;
REVOKE ALL ON FUNCTION community_adopter_benefit_status(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION community_benefit_issue_pass(UUID, UUID, UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION community_benefit_redeem(TEXT, UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION community_benefit_redemptions(UUID, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION community_benefit_queue_json("community_business_benefits") FROM PUBLIC;
REVOKE ALL ON FUNCTION community_benefits_moderation_queue(INTEGER, INTEGER, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION community_benefit_moderate(UUID, TEXT, UUID, TEXT) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public_service_listing_benefits(UUID) TO adoptafacil_app;
GRANT EXECUTE ON FUNCTION public_adopter_benefits(INTEGER, INTEGER, TEXT) TO adoptafacil_app;
GRANT EXECUTE ON FUNCTION community_business_impact(UUID) TO adoptafacil_app;
GRANT EXECUTE ON FUNCTION public_service_listing_impact(UUID) TO adoptafacil_app;
GRANT EXECUTE ON FUNCTION service_listing_impact(UUID) TO adoptafacil_app;
GRANT EXECUTE ON FUNCTION community_adopter_benefit_status(UUID) TO adoptafacil_app;
GRANT EXECUTE ON FUNCTION community_benefit_issue_pass(UUID, UUID, UUID, TEXT) TO adoptafacil_app;
GRANT EXECUTE ON FUNCTION community_benefit_redeem(TEXT, UUID, UUID) TO adoptafacil_app;
GRANT EXECUTE ON FUNCTION community_benefit_redemptions(UUID, INTEGER) TO adoptafacil_app;
GRANT EXECUTE ON FUNCTION community_benefits_moderation_queue(INTEGER, INTEGER, TEXT) TO adoptafacil_app;
GRANT EXECUTE ON FUNCTION community_benefit_moderate(UUID, TEXT, UUID, TEXT) TO adoptafacil_app;

-- ============================================================================
-- El pre-registro sin cuenta se retira: ya no se aceptan envíos nuevos (la
-- API deja de exponer el endpoint). La tabla y sus filas se conservan para
-- que el equipo contacte a quienes ya se registraron y luego las suprima
-- (decisión del responsable del tratamiento, no de una migración).
-- ============================================================================
REVOKE INSERT ON "community_pre_registrations" FROM adoptafacil_app;
