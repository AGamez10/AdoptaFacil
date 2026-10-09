-- Ola 1 · hilo 2 · R2-1 (AF-023) + R2-3 (AF-017, condición C9).
--
-- 1. Estado operativo de cada organización: el Owner la envía a revisión y la
--    plataforma la aprueba, observa, rechaza o suspende.
-- 2. Superficie pública (portal, catálogos) solo para organizaciones aprobadas.
-- 3. Invitaciones de miembros con token de un solo uso, ligado a organización y
--    correo, con caducidad.
--
-- Rollback (manual, documentado en docs/seguridad/roles-y-organizaciones.md):
--   DROP FUNCTION organization_invitation_by_token_hash(TEXT);
--   DROP TABLE organization_invitations;
--   re-crear las 12 funciones públicas desde su migración anterior;
--   ALTER TABLE organizations DROP COLUMN status, DROP COLUMN status_reason,
--     DROP COLUMN status_changed_at, DROP COLUMN status_changed_by_user_id;

-- ============================================================================
-- 1. organizations.status (tabla de plataforma, sin RLS como hasta ahora)
-- ============================================================================
ALTER TABLE "organizations" ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'draft',
ADD COLUMN     "status_changed_at" TIMESTAMP(3),
ADD COLUMN     "status_changed_by_user_id" UUID,
ADD COLUMN     "status_reason" TEXT;

-- Las organizaciones que ya existían siguen operando como hasta hoy: quedan
-- aprobadas (decisión por defecto de este PR; la plataforma puede observarlas o
-- suspenderlas después). Las nuevas nacen en 'draft' hasta que su Owner las
-- envía a revisión (las cuentas de persona se crean ya aprobadas desde la API:
-- su organización personal no tiene portal ni revisión).
UPDATE "organizations" SET "status" = 'approved';

ALTER TABLE "organizations" ADD CONSTRAINT "organizations_status_check"
  CHECK ("status" IN ('draft', 'pending_review', 'observed', 'approved', 'rejected', 'suspended'));

CREATE INDEX "organizations_status_idx" ON "organizations"("status");

-- ============================================================================
-- 2. Superficie pública solo para organizaciones aprobadas. Mismas funciones
--    SECURITY DEFINER de antes, con un único filtro añadido (o.status =
--    'approved') y pg_temp al final del search_path (SQLI-03). CREATE OR
--    REPLACE conserva sus permisos de EXECUTE.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.organization_public(p_slug text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT jsonb_build_object(
    'id', o.id,
    'name', o.name,
    'slug', p.slug,
    'subdomain', p.subdomain,
    'description', p.description,
    'logoUrl', p.logo_url,
    'coverPhotos', to_jsonb(COALESCE(p.cover_photos, ARRAY[]::text[])),
    'location', p.location,
    'socialLinks', p.social_links,
    'whatsapp', p.whatsapp,
    'contactEmail', p.contact_email,
    'formalizationState', p.formalization_state,
    'rteVigente', p.rte_vigente,
    'verificationLevel', p.verification_level,
    -- NIT (transparency) only once formalized; NULL otherwise. Never phone/legal_name.
    'nit', CASE
             WHEN p.formalization_state IN ('formalizada', 'esal', 'esal_rte') THEN p.nit
             ELSE NULL
           END,
    -- organizationType gated by the platform policy (T-030): 'all' → always;
    -- 'formalized_only' (default) → only for Formalizada/ESAL orgs.
    'organizationType', CASE
             WHEN COALESCE(
                    (SELECT show_organization_type FROM platform_settings WHERE id = 'global'),
                    'formalized_only'
                  ) = 'all'
                  OR p.formalization_state IN ('formalizada', 'esal', 'esal_rte')
             THEN p.organization_type
             ELSE NULL
           END,
    -- S2-PORTAL: contenido de las nuevas tabs "Nosotros"/"Información". NULL
    -- (u objeto vacío) ⇒ el frontend oculta la tab correspondiente.
    'aboutUs', p.about_us,
    'extendedContact', p.extended_contact
  )
  FROM organization_profiles p
  JOIN organizations o ON o.id = p.organization_id
  WHERE p.slug = p_slug
    AND o.status = 'approved';
$function$;

CREATE OR REPLACE FUNCTION public.organization_slug_by_subdomain(p_subdomain text)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT p.slug
  FROM organization_profiles p
  JOIN organizations o ON o.id = p.organization_id
  WHERE p.subdomain = p_subdomain
    AND o.status = 'approved';
$function$;

CREATE OR REPLACE FUNCTION public.organization_portal_theme(p_slug text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT jsonb_build_object(
    'tokens', COALESCE(t.tokens, '{}'::jsonb),
    -- S2-PORTAL: layout público (posición del logo / sidebar de redes).
    'logoPosition', COALESCE(t.logo_position, 'left'),
    'socialNavPosition', COALESCE(t.social_nav_position, 'right')
  )
  FROM organization_profiles p
  JOIN portal_themes t ON t.organization_id = p.organization_id
  JOIN organizations o ON o.id = p.organization_id
  WHERE p.slug = p_slug
    AND o.status = 'approved';
$function$;

CREATE OR REPLACE FUNCTION public.public_org_adoptable_animals(p_slug text, p_limit integer, p_offset integer, p_species text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_org UUID;
  v_total BIGINT;
  v_items JSONB;
  v_limit INTEGER := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50);
  v_offset INTEGER := GREATEST(COALESCE(p_offset, 0), 0);
BEGIN
  SELECT p.organization_id INTO v_org
  FROM organization_profiles p
  JOIN organizations o ON o.id = p.organization_id
  WHERE p.slug = p_slug
    AND o.status = 'approved';
  IF v_org IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT count(*) INTO v_total
  FROM animals a
  WHERE a.organization_id = v_org
    AND a.is_active = TRUE
    AND a.status = 'available'
    AND (p_species IS NULL OR a.species = p_species);

  SELECT COALESCE(jsonb_agg(row.obj ORDER BY row.created_at DESC), '[]'::jsonb) INTO v_items
  FROM (
    SELECT
      jsonb_build_object(
        'id', a.id,
        'organizationId', a.organization_id,
        'name', a.name,
        'species', a.species,
        'sex', a.sex,
        'size', a.size,
        'status', a.status,
        'breed', COALESCE(b.name, a.custom_breed),
        'primaryPhotoRef', (
          SELECT p.storage_ref
          FROM animal_photos p
          WHERE p.animal_id = a.id
          ORDER BY p."order" ASC, p.created_at ASC
          LIMIT 1
        ),
        -- Raw age inputs for the API to DERIVE computedAge; never surfaced as DOB.
        'birthDate', a.birth_date,
        'approximateAgeMonths', a.approximate_age_months,
        'createdAt', a.created_at
      ) AS obj,
      a.created_at AS created_at
    FROM animals a
    LEFT JOIN animal_breeds b ON b.id = a.breed_id
    WHERE a.organization_id = v_org
      AND a.is_active = TRUE
      AND a.status = 'available'
      AND (p_species IS NULL OR a.species = p_species)
    ORDER BY a.created_at DESC
    LIMIT v_limit OFFSET v_offset
  ) row;

  RETURN jsonb_build_object(
    'items', COALESCE(v_items, '[]'::jsonb),
    'total', v_total,
    'limit', v_limit,
    'offset', v_offset
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.public_campaigns(p_limit integer, p_offset integer)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT jsonb_build_object(
    'items', COALESCE(
      (
        SELECT jsonb_agg(item ORDER BY (item->>'createdAt') DESC)
        FROM (
          SELECT jsonb_build_object(
            'id', c.id,
            'organizationId', c.organization_id,
            'organizationName', o.name,
            'title', c.title,
            'description', c.description,
            'category', c.category,
            'goalAmount', c.goal_amount,
            'raisedAmount', c.raised_amount,
            'deadline', c.deadline,
            'status', c.status,
            'createdAt', c.created_at
          ) AS item
          FROM campaigns c
          JOIN organizations o ON o.id = c.organization_id
          WHERE c.status = 'active'
            AND o.status = 'approved'
          ORDER BY c.created_at DESC
          LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50)
          OFFSET GREATEST(COALESCE(p_offset, 0), 0)
        ) page
      ),
      '[]'::jsonb
    ),
    'total', (
      SELECT count(*)
      FROM campaigns c
      JOIN organizations o ON o.id = c.organization_id
      WHERE c.status = 'active'
        AND o.status = 'approved'
    )
  );
$function$;

CREATE OR REPLACE FUNCTION public.public_campaign(p_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT jsonb_build_object(
    'id', c.id,
    'organizationId', c.organization_id,
    'organizationName', o.name,
    'title', c.title,
    'description', c.description,
    'category', c.category,
    'goalAmount', c.goal_amount,
    'raisedAmount', c.raised_amount,
    'deadline', c.deadline,
    'status', c.status,
    'createdAt', c.created_at
  )
  FROM campaigns c
  JOIN organizations o ON o.id = c.organization_id
  WHERE c.id = p_id AND c.status IN ('active', 'closed')
    AND o.status = 'approved';
$function$;

CREATE OR REPLACE FUNCTION public.public_campaign_accountability(p_campaign_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT jsonb_build_object(
    'campaign', jsonb_build_object(
      'id', c.id,
      'organizationId', c.organization_id,
      'organizationName', o.name,
      'title', c.title,
      'description', c.description,
      'category', c.category,
      'goalAmount', c.goal_amount,
      'raisedAmount', c.raised_amount,
      'deadline', c.deadline,
      'status', c.status,
      'createdAt', c.created_at
    ),
    'evidences', COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', e.id,
            'type', e.type,
            'concept', e.concept,
            'amount', e.amount,
            'spentAt', e.spent_at,
            'storageRef', e.storage_ref,
            'order', e.order
          )
          ORDER BY e.order ASC, e.created_at ASC
        )
        FROM campaign_evidences e
        WHERE e.campaign_id = c.id
      ),
      '[]'::jsonb
    )
  )
  FROM campaigns c
  JOIN organizations o ON o.id = c.organization_id
  WHERE c.id = p_campaign_id AND c.status IN ('active', 'closed')
    AND o.status = 'approved';
$function$;

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
            AND o.status = 'approved'
          ORDER BY vo.start_date ASC
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
        AND o.status = 'approved'
    )
  );
$function$;

-- Catálogos públicos del marketplace y del banco de recursos: mismo filtro.
CREATE OR REPLACE FUNCTION public.public_products(p_limit integer, p_offset integer, p_category text, p_organization_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT jsonb_build_object(
    'items', COALESCE((SELECT jsonb_agg(item ORDER BY (item->>'createdAt') DESC) FROM (
      SELECT jsonb_build_object(
        'id', p.id,
        'organizationId', p.organization_id,
        'organizationName', o.name,
        'organizationWhatsapp', op.whatsapp,
        'name', p.name,
        'description', p.description,
        'category', p.category,
        'price', p.price,
        'stock', p.stock,
        'images', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'id', i.id, 'storageRef', i.storage_ref, 'order', i.order
          ) ORDER BY i.order)
          FROM "product_images" i WHERE i.product_id = p.id
        ), '[]'::jsonb),
        'createdAt', to_char(p.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
      ) AS item
      FROM "products" p
      JOIN "organizations" o ON o.id = p.organization_id
      LEFT JOIN "organization_profiles" op ON op.organization_id = o.id
      WHERE p.is_active = true
        AND o.status = 'approved'
        AND (p_category IS NULL OR p.category = p_category)
        AND (p_organization_id IS NULL OR p.organization_id = p_organization_id)
      ORDER BY p.created_at DESC
      LIMIT LEAST(GREATEST(COALESCE(p_limit, 24), 1), 50)
      OFFSET GREATEST(COALESCE(p_offset, 0), 0)
    ) page), '[]'::jsonb),
    'total', (
      SELECT count(*) FROM "products" c
      JOIN "organizations" co ON co.id = c.organization_id AND co.status = 'approved'
      WHERE c."is_active" = true
        AND (p_category IS NULL OR c."category" = p_category)
        AND (p_organization_id IS NULL OR c."organization_id" = p_organization_id)
    )
  );
$function$
;
CREATE OR REPLACE FUNCTION public.public_product(p_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT jsonb_build_object(
    'id', p.id,
    'organizationId', p.organization_id,
    'organizationName', o.name,
    'organizationWhatsapp', op.whatsapp,
    'name', p.name,
    'description', p.description,
    'category', p.category,
    'price', p.price,
    'stock', p.stock,
    'images', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', i.id, 'storageRef', i.storage_ref, 'order', i.order
      ) ORDER BY i.order)
      FROM "product_images" i WHERE i.product_id = p.id
    ), '[]'::jsonb),
    'createdAt', to_char(p.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  )
  FROM "products" p
  JOIN "organizations" o ON o.id = p.organization_id
  LEFT JOIN "organization_profiles" op ON op.organization_id = o.id
  WHERE p.id = p_id AND p.is_active = true AND o.status = 'approved';
$function$
;
CREATE OR REPLACE FUNCTION public.public_resource_needs(p_limit integer, p_offset integer, p_organization_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT jsonb_build_object(
    'items', COALESCE((SELECT jsonb_agg(item ORDER BY (item->>'createdAt') DESC) FROM (
      SELECT jsonb_build_object(
        'id', n.id,
        'organizationId', n.organization_id,
        'organizationName', o.name,
        'title', n.title,
        'description', n.description,
        'category', n.category,
        'quantityNeeded', n.quantity_needed,
        'unit', n.unit,
        'quantityFulfilled', n.quantity_fulfilled,
        'status', n.status,
        'createdAt', to_char(n.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
      ) AS item
      FROM "resource_needs" n
      JOIN "organizations" o ON o.id = n.organization_id
      WHERE n.status IN ('needed', 'partially_fulfilled')
        AND o.status = 'approved'
        AND (p_organization_id IS NULL OR n.organization_id = p_organization_id)
      ORDER BY n.created_at DESC
      LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50)
      OFFSET GREATEST(COALESCE(p_offset, 0), 0)
    ) page), '[]'::jsonb),
    'total', (
      SELECT count(*) FROM "resource_needs" c
      JOIN "organizations" co ON co.id = c.organization_id AND co.status = 'approved'
      WHERE c."status" IN ('needed', 'partially_fulfilled')
        AND (p_organization_id IS NULL OR c."organization_id" = p_organization_id)
    )
  );
$function$
;
CREATE OR REPLACE FUNCTION public.public_resource_need(p_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT jsonb_build_object(
    'id', n.id,
    'organizationId', n.organization_id,
    'organizationName', o.name,
    'title', n.title,
    'description', n.description,
    'category', n.category,
    'quantityNeeded', n.quantity_needed,
    'unit', n.unit,
    'quantityFulfilled', n.quantity_fulfilled,
    'status', n.status,
    'createdAt', to_char(n.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  )
  FROM "resource_needs" n
  JOIN "organizations" o ON o.id = n.organization_id
  WHERE n.id = p_id AND n.status IN ('needed', 'partially_fulfilled', 'fulfilled')
    AND o.status = 'approved';
$function$
;

-- ============================================================================
-- 3. organization_invitations (tabla de negocio: RLS ENABLE + FORCE + policy)
-- ============================================================================
CREATE TABLE "organization_invitations" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "invited_by_user_id" UUID NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "accepted_at" TIMESTAMP(3),
    "accepted_user_id" UUID,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organization_invitations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "organization_invitations_token_hash_key" ON "organization_invitations"("token_hash");
CREATE INDEX "organization_invitations_organization_id_idx" ON "organization_invitations"("organization_id");
CREATE INDEX "organization_invitations_organization_id_email_idx" ON "organization_invitations"("organization_id", "email");

ALTER TABLE "organization_invitations" ADD CONSTRAINT "organization_invitations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Solo roles de organización (nunca de plataforma) y una sola invitación
-- pendiente por correo y organización.
ALTER TABLE "organization_invitations" ADD CONSTRAINT "organization_invitations_role_check"
  CHECK ("role" IN ('owner', 'administrator', 'operator', 'volunteer',
                    'temporary_collaborator', 'veterinarian', 'read_only_auditor'));
CREATE UNIQUE INDEX "organization_invitations_one_pending_per_email"
  ON "organization_invitations" ("organization_id", lower("email"))
  WHERE "accepted_at" IS NULL AND "revoked_at" IS NULL;

ALTER TABLE "organization_invitations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "organization_invitations" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "organization_invitations"
  USING ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

-- La app lee, crea y marca (aceptada / revocada); nunca borra: el historial queda.
GRANT SELECT, INSERT, UPDATE ON "organization_invitations" TO adoptafacil_app;
REVOKE DELETE, TRUNCATE ON "organization_invitations" FROM adoptafacil_app;

-- Resolución del token ANTES de que exista cuenta o tenant (la persona invitada
-- aún no pertenece a nada). Función acotada: recibe solo el HASH del token y
-- devuelve solo lo que la pantalla de aceptación necesita. Sin SQL dinámico.
CREATE OR REPLACE FUNCTION organization_invitation_by_token_hash(p_token_hash TEXT)
  RETURNS JSONB
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'id', i.id,
    'organizationId', i.organization_id,
    'organizationName', o.name,
    'email', i.email,
    'role', i.role,
    'expiresAt', i.expires_at,
    'acceptedAt', i.accepted_at,
    'revokedAt', i.revoked_at
  )
  FROM organization_invitations i
  JOIN organizations o ON o.id = i.organization_id
  WHERE i.token_hash = p_token_hash;
$$;

REVOKE ALL ON FUNCTION organization_invitation_by_token_hash(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION organization_invitation_by_token_hash(TEXT) TO adoptafacil_app;
