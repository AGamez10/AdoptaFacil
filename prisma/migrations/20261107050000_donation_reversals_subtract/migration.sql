-- P1-1 (auditoría de lógica de negocio, 2026-11-06): un reembolso o
-- contracargo RESTA. Antes solo quedaba en `donation_reversals` y en la
-- bitácora: la campaña, el resumen de la plataforma y los informes seguían
-- contando como recibido lo que volvió al donante.

-- 1) Campañas: cada aplicación registra si se reversó (idempotencia de la resta).
ALTER TABLE "campaign_funding_applications" ADD COLUMN "reversed_at" TIMESTAMP(3);

-- Resta UNA vez el neto de una recaudación reversada a su campaña. Devuelve
-- fila solo cuando resta (una notificación repetida no hace nada).
CREATE OR REPLACE FUNCTION reverse_campaign_funding(p_collection_id TEXT)
  RETURNS TABLE (organization_id UUID, campaign_id UUID, net INTEGER)
  LANGUAGE plpgsql
  VOLATILE
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  a_org UUID;
  a_campaign UUID;
  a_net INTEGER;
BEGIN
  UPDATE campaign_funding_applications a
     SET reversed_at = CURRENT_TIMESTAMP
   WHERE a.collection_id = p_collection_id
     AND a.reversed_at IS NULL
  RETURNING a.organization_id, a.campaign_id, a.net INTO a_org, a_campaign, a_net;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  UPDATE campaigns
     SET raised_amount = GREATEST(raised_amount - a_net, 0), updated_at = CURRENT_TIMESTAMP
   WHERE id = a_campaign;

  RETURN QUERY SELECT a_org, a_campaign, a_net;
END;
$$;

REVOKE ALL ON FUNCTION reverse_campaign_funding(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION reverse_campaign_funding(TEXT) TO adoptafacil_app;

-- Una donación ya reversada nunca suma (ni por el webhook ni por la conciliación).
CREATE OR REPLACE FUNCTION apply_campaign_funding(p_collection_id TEXT)
  RETURNS TABLE (organization_id UUID, campaign_id UUID, net INTEGER)
  LANGUAGE plpgsql
  VOLATILE
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  d_id UUID;
  d_org UUID;
  d_campaign UUID;
  d_status TEXT;
  d_net INTEGER;
BEGIN
  SELECT dn.id, dn.organization_id, dn.concept_id, dn.status, (dn.breakdown->>'net')::int
    INTO d_id, d_org, d_campaign, d_status, d_net
    FROM donations dn
    WHERE dn.collection_id = p_collection_id AND dn.concept_kind = 'campaign';
  IF NOT FOUND OR d_status <> 'approved' THEN
    RETURN; -- unknown / not a campaign donation / not approved ⇒ no-op
  END IF;
  IF EXISTS (SELECT 1 FROM donation_reversals r WHERE r.donation_id = d_id) THEN
    RETURN; -- reembolsada o contracargada ⇒ no suma
  END IF;

  PERFORM 1 FROM campaigns c
    WHERE c.id = d_campaign AND c.organization_id = d_org AND c.status = 'active';
  IF NOT FOUND THEN
    RETURN; -- campaña inactiva o de OTRA organización ⇒ no cuenta
  END IF;

  INSERT INTO campaign_funding_applications ("id", "organization_id", "campaign_id", "collection_id", "net", "created_at")
    VALUES (gen_random_uuid(), d_org, d_campaign, p_collection_id, d_net, CURRENT_TIMESTAMP)
    ON CONFLICT ("collection_id") DO NOTHING;
  IF NOT FOUND THEN
    RETURN; -- already counted (idempotent) ⇒ no-op
  END IF;

  UPDATE campaigns SET raised_amount = raised_amount + d_net, updated_at = CURRENT_TIMESTAMP
    WHERE id = d_campaign;

  RETURN QUERY SELECT d_org, d_campaign, d_net;
END;
$$;

-- 2) Resumen financiero de la plataforma: sin lo reversado y sin la columna de
--    comisión de AdoptaFácil (0 % por decisión del dueño: no queda rastro).
DROP FUNCTION IF EXISTS platform_financial_summary();
CREATE FUNCTION platform_financial_summary()
  RETURNS TABLE(
    gross_total NUMERIC,
    gateway_fee_total NUMERIC,
    net_total NUMERIC
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT
    COALESCE(SUM((d.breakdown->>'gross')::numeric), 0) AS gross_total,
    COALESCE(
      SUM((d.breakdown->>'gatewayFee')::numeric + (d.breakdown->>'gatewayIva')::numeric),
      0
    ) AS gateway_fee_total,
    COALESCE(SUM((d.breakdown->>'net')::numeric), 0) AS net_total
  FROM "donations" d
  WHERE d.status = 'approved'
    AND NOT EXISTS (SELECT 1 FROM "donation_reversals" r WHERE r.donation_id = d.id);
$$;

REVOKE ALL ON FUNCTION platform_financial_summary() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform_financial_summary() TO adoptafacil_app;
