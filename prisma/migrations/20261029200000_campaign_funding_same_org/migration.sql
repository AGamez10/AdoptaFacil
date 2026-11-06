-- ============================================================================
-- Una donación solo suma a una campaña de SU MISMA organización.
--
-- `apply_campaign_funding` y `reconcile_org_campaign_funding` (T-055) son
-- SECURITY DEFINER (saltan la RLS) y solo revisaban que la campaña estuviera
-- activa. Una donación aprobada a la org A con `concept_id` = campaña de la
-- org B inflaba el progreso público de B. Ahora ambas exigen que la campaña sea
-- de la organización de la donación. La API también lo valida al crear la
-- donación (DonationsService.assertConceptOfOrganization).
--
-- CREATE OR REPLACE conserva los permisos de EXECUTE ya otorgados.
-- ============================================================================

CREATE OR REPLACE FUNCTION apply_campaign_funding(p_collection_id TEXT)
  RETURNS TABLE (organization_id UUID, campaign_id UUID, net INTEGER)
  LANGUAGE plpgsql
  VOLATILE
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  d_org UUID;
  d_campaign UUID;
  d_status TEXT;
  d_net INTEGER;
BEGIN
  SELECT dn.organization_id, dn.concept_id, dn.status, (dn.breakdown->>'net')::int
    INTO d_org, d_campaign, d_status, d_net
    FROM donations dn
    WHERE dn.collection_id = p_collection_id AND dn.concept_kind = 'campaign';
  IF NOT FOUND OR d_status <> 'approved' THEN
    RETURN; -- unknown / not a campaign donation / not approved ⇒ no-op
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

CREATE OR REPLACE FUNCTION reconcile_org_campaign_funding(p_org_id UUID)
  RETURNS TABLE (organization_id UUID, campaign_id UUID, collection_id TEXT, net INTEGER)
  LANGUAGE plpgsql
  VOLATILE
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  r RECORD;
  applied RECORD;
BEGIN
  FOR r IN
    SELECT dn.collection_id
    FROM donations dn
    JOIN campaigns c ON c.id = dn.concept_id AND c.organization_id = dn.organization_id
    WHERE dn.organization_id = p_org_id
      AND dn.concept_kind = 'campaign'
      AND dn.status = 'approved'
      AND c.status = 'active'
      AND NOT EXISTS (
        SELECT 1 FROM campaign_funding_applications a WHERE a.collection_id = dn.collection_id
      )
  LOOP
    SELECT * INTO applied FROM apply_campaign_funding(r.collection_id);
    IF applied.campaign_id IS NOT NULL THEN
      organization_id := applied.organization_id;
      campaign_id := applied.campaign_id;
      collection_id := r.collection_id;
      net := applied.net;
      RETURN NEXT;
    END IF;
  END LOOP;
  RETURN;
END;
$$;
