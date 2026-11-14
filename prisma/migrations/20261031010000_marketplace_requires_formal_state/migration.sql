-- Vender en la tienda exige estar Formalizada (matriz estado formal → funciones,
-- packages/contracts/src/legal-capabilities.ts, MarketplaceSales; ET arts. 555-2
-- y 615). La API ya rechaza publicar; aquí el catálogo público deja de mostrar
-- productos de organizaciones Informal o En proceso. No se borra nada: el
-- producto sigue en su panel y reaparece cuando la organización se formaliza.

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
        AND op.formalization_state IN ('formalizada', 'esal', 'esal_rte')
        AND (p_category IS NULL OR p.category = p_category)
        AND (p_organization_id IS NULL OR p.organization_id = p_organization_id)
      ORDER BY p.created_at DESC
      LIMIT LEAST(GREATEST(COALESCE(p_limit, 24), 1), 50)
      OFFSET GREATEST(COALESCE(p_offset, 0), 0)
    ) page), '[]'::jsonb),
    'total', (
      SELECT count(*) FROM "products" c
      JOIN "organizations" co ON co.id = c.organization_id AND co.status = 'approved'
      JOIN "organization_profiles" cp ON cp.organization_id = co.id
      WHERE c."is_active" = true
        AND cp.formalization_state IN ('formalizada', 'esal', 'esal_rte')
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
  WHERE p.id = p_id AND p.is_active = true AND o.status = 'approved'
    AND op.formalization_state IN ('formalizada', 'esal', 'esal_rte');
$function$
;
