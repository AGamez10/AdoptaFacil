-- Tienda pública del café: las presentaciones activas que tienen un lote a la
-- venta, para comprar desde la web sin escanear el QR de la bolsa. Mismo lote
-- que muestra coffee_public_offer (el más antiguo publicado con bolsas; si
-- todos se agotaron, el último). Solo lo público: nunca costos, compradores ni
-- ids internos. No suma visitas (eso lo hace la página de la presentación).
CREATE OR REPLACE FUNCTION coffee_public_catalog()
  RETURNS JSONB
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(jsonb_agg(item ORDER BY (item->>'availableUnits')::int = 0, item->>'productName'), '[]'::jsonb)
  FROM (
    SELECT jsonb_build_object(
      'code', p.code,
      'productName', p.name,
      'presentationGrams', p.presentation_grams,
      'description', p.description,
      'salePriceCop', l.sale_price_cop,
      'shippingFeeCop', l.shipping_fee_cop,
      'availableUnits', coffee_lot_available(l.id),
      'contributionPerUnitCop',
        CASE WHEN l.sale_price_cop > l.unit_cost_cop
             THEN round((l.sale_price_cop - l.unit_cost_cop) * l.contribution_bps / 10000.0)::int
             ELSE 0 END
    ) AS item
    FROM coffee_products p
    CROSS JOIN LATERAL (
      SELECT * FROM coffee_lots cl
      WHERE cl.product_id = p.id AND cl.status = 'on_sale'
      ORDER BY (coffee_lot_available(cl.id) > 0) DESC,
               CASE WHEN coffee_lot_available(cl.id) > 0 THEN cl.published_at END ASC NULLS LAST,
               cl.published_at DESC NULLS LAST
      LIMIT 1
    ) l
    WHERE p.is_active = TRUE
    LIMIT 50
  ) items;
$$;

REVOKE ALL ON FUNCTION coffee_public_catalog() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION coffee_public_catalog() TO adoptafacil_app;
