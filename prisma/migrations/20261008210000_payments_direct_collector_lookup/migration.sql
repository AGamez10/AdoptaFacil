-- ADR-PAG-001 (cobro directo, sin custodia): a Mercado Pago notification
-- names the ACCOUNT that owns the order (`user_id`). To read that order back
-- we need the organization connected with that account. This function maps
-- an account id to its organization id, cross-tenant, and NOTHING else: never
-- the tokens (they are read afterwards under that organization's own RLS
-- context). Same posture as `mercadopago_account_mp_user_id`: SECURITY
-- DEFINER, STABLE, fixed search_path (pg_temp last, SQLI-03), no dynamic SQL,
-- revoked from PUBLIC, granted only to the app role. No table change.

CREATE OR REPLACE FUNCTION mercadopago_account_organization_id(p_mp_user_id TEXT)
  RETURNS TABLE(
    organization_id UUID
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
  SELECT a.organization_id
  FROM "organization_mercadopago_accounts" a
  WHERE a.mp_user_id = p_mp_user_id;
$$;

REVOKE ALL ON FUNCTION mercadopago_account_organization_id(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION mercadopago_account_organization_id(TEXT) TO adoptafacil_app;
