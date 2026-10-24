-- M14: diseños completos del portal público (14 gratuitos + 5 premium apagados).
--
-- Solo agrega la columna `design` a `portal_themes` y la expone en la función
-- pública `organization_portal_theme`. Parte de la última versión de esa
-- función (ola1_org_status_invitations): conserva el filtro de organizaciones
-- aprobadas y el search_path con pg_temp. La plantilla de portada (Ola 3) sigue
-- viajando dentro de `tokens`, así que no se toca.
--
-- 'clasico' es el portal de siempre: una organización que nunca eligió diseño
-- sigue viendo exactamente lo mismo que antes.

-- AlterTable
ALTER TABLE "portal_themes" ADD COLUMN "design" TEXT DEFAULT 'clasico';

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
    'socialNavPosition', COALESCE(t.social_nav_position, 'right'),
    -- M14: diseño completo (la API lo normaliza contra su enum cerrado).
    'design', COALESCE(t.design, 'clasico')
  )
  FROM organization_profiles p
  JOIN portal_themes t ON t.organization_id = p.organization_id
  JOIN organizations o ON o.id = p.organization_id
  WHERE p.slug = p_slug
    AND o.status = 'approved';
$function$;
