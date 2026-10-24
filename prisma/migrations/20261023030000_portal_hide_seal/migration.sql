-- ============================================================================
-- Planes: "Portal sin el sello Hecho con AdoptaFácil" (capacidad
-- `portalRemoveSeal`, planes Crece y Pro). Solo visual.
--
-- La organización guarda su elección en `portal_themes.hide_seal`. El sello se
-- oculta solo si además su plan vigente incluye la capacidad: la API decide el
-- valor efectivo. Si el plan termina, la elección se conserva y el sello vuelve
-- a mostrarse hasta que la organización pague de nuevo (igual que las
-- plantillas de pago). Los enlaces legales del pie (Términos, Datos personales,
-- Qué es AdoptaFácil, Reportar) NUNCA se ocultan.
--
-- La tabla ya tiene RLS (ENABLE + FORCE, tenant_isolation) y el GRANT de
-- SELECT/INSERT/UPDATE/DELETE para adoptafacil_app: una columna nueva los hereda.
-- ============================================================================

ALTER TABLE "portal_themes" ADD COLUMN "hide_seal" BOOLEAN NOT NULL DEFAULT false;

-- La lectura pública del tema devuelve la ELECCIÓN guardada; el plan se cruza
-- en la API (igual que con la plantilla). CREATE OR REPLACE conserva los
-- permisos de EXECUTE ya otorgados.
CREATE OR REPLACE FUNCTION organization_portal_theme(p_slug TEXT)
  RETURNS JSONB
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'tokens', COALESCE(t.tokens, '{}'::jsonb),
    -- S2-PORTAL: layout público (posición del logo / sidebar de redes).
    'logoPosition', COALESCE(t.logo_position, 'left'),
    'socialNavPosition', COALESCE(t.social_nav_position, 'right'),
    'hideSeal', COALESCE(t.hide_seal, false)
  )
  FROM organization_profiles p
  JOIN portal_themes t ON t.organization_id = p.organization_id
  WHERE p.slug = p_slug;
$$;
