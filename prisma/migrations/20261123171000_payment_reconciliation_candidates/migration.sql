-- ============================================================================
-- Conciliación automática de pagos (auditoría go/no-go 2026-11-23, B3).
--
-- Si Mercado Pago avisa de un pago y la API no lo recibe (servidor caído,
-- despliegue, red), la donación queda "pendiente" aunque el refugio ya tenga
-- el dinero. Un trabajo periódico relee Mercado Pago con el token de cada
-- refugio y aplica lo que falte, igual que el botón "Releer Mercado Pago".
--
-- Esta función acotada (SECURITY DEFINER, solo ids de organización) le dice al
-- trabajo QUÉ organizaciones revisar sin darle acceso a otras tablas:
--   * p_only_pending = true: las que tienen una donación pendiente con al menos
--     p_min_age_minutes de antigüedad y dentro de las últimas p_window_hours.
--   * p_only_pending = false: todas las que tienen Mercado Pago conectado
--     (pasada diaria: recoge reembolsos y contracargos).
-- ============================================================================
CREATE OR REPLACE FUNCTION mercadopago_reconciliation_candidates(
  p_only_pending BOOLEAN,
  p_min_age_minutes INTEGER,
  p_window_hours INTEGER
)
  RETURNS TABLE(organization_id UUID)
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
  SELECT c.organization_id
  FROM "organization_mercadopago_connections" c
  WHERE c.status = 'active'
    AND (
      NOT p_only_pending
      OR EXISTS (
        SELECT 1 FROM "donations" d
        WHERE d.organization_id = c.organization_id
          AND d.status = 'pending'
          AND d.created_at <= (now() AT TIME ZONE 'UTC') - make_interval(mins => GREATEST(p_min_age_minutes, 0))
          AND d.created_at >= (now() AT TIME ZONE 'UTC') - make_interval(hours => GREATEST(p_window_hours, 1))
      )
    )
  ORDER BY c.organization_id
  LIMIT 2000;
$$;

REVOKE ALL ON FUNCTION mercadopago_reconciliation_candidates(BOOLEAN, INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION mercadopago_reconciliation_candidates(BOOLEAN, INTEGER, INTEGER) TO adoptafacil_app;
