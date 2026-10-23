-- M14: plantillas visuales del portal público (todas gratuitas).
--
-- Solo agrega la columna `template` a `portal_themes` y la expone en la función
-- pública `organization_portal_theme`. Igual que t_portal_personalization_v2,
-- NO incluye los DROP de foreign keys añadidas a mano que el diff de Prisma
-- suele proponer (esas relaciones no se modelan en los .prisma).
--
-- 'clasico' es el diseño original del portal: una organización que nunca eligió
-- plantilla sigue viendo exactamente lo mismo que antes.

-- AlterTable
ALTER TABLE "portal_themes" ADD COLUMN     "template" TEXT DEFAULT 'clasico';

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
    -- M14: plantilla visual (la API la normaliza contra su enum cerrado).
    'template', COALESCE(t.template, 'clasico')
  )
  FROM organization_profiles p
  JOIN portal_themes t ON t.organization_id = p.organization_id
  WHERE p.slug = p_slug;
$$;
