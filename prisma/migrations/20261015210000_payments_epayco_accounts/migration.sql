-- ADR-PAG-001/002 (cobro directo, sin custodia; ePayco pasarela principal):
-- each organization connects its OWN ePayco merchant account by handing over
-- its API keys (dashboard.epayco.co → Integraciones → Llaves API). The
-- checkout session is created WITH those keys, so the organization is the
-- merchant of record and the money lands in its own ePayco balance.
--
-- `p_key_enc` and `private_key_enc` are AES-256-GCM ciphertexts (base64) made
-- by the API (`epayco-keys-crypto.ts`, key derived with HKDF from
-- SIGNATURE_ENCRYPTION_KEY): a database dump alone never reveals them.
-- `cust_id` (P_CUST_ID_CLIENTE) and `public_key` are not secrets.
-- `cust_id` is globally UNIQUE: one ePayco account can never back two
-- organizations (a confirmation names the account, and an ambiguous owner
-- would make the settlement unverifiable).

-- CreateTable
CREATE TABLE "organization_epayco_accounts" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "cust_id" TEXT NOT NULL,
    "public_key" TEXT NOT NULL,
    "p_key_enc" TEXT NOT NULL,
    "private_key_enc" TEXT NOT NULL,
    "connected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_epayco_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organization_epayco_accounts_organization_id_key" ON "organization_epayco_accounts"("organization_id");
CREATE UNIQUE INDEX "organization_epayco_accounts_cust_id_key" ON "organization_epayco_accounts"("cust_id");

-- AddForeignKey
ALTER TABLE "organization_epayco_accounts"
  ADD CONSTRAINT "organization_epayco_accounts_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================================
-- ROW-LEVEL SECURITY (RNF03) — an organization only sees/manages ITS OWN
-- ePayco account. Same canonical pattern as organization_mercadopago_accounts
-- (one row per org; UPDATE/DELETE allowed because reconnecting/disconnecting
-- is a normal operation).
-- ============================================================================
ALTER TABLE "organization_epayco_accounts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "organization_epayco_accounts" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "organization_epayco_accounts"
  USING ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON "organization_epayco_accounts" TO adoptafacil_app;

-- ============================================================================
-- CROSS-TENANT LOOKUP (SECURITY DEFINER, read-only): an ePayco confirmation
-- names the merchant (`x_cust_id_cliente`). This maps that id to its
-- organization id and NOTHING else — never the keys (they are read afterwards
-- under that organization's own RLS context). Same posture as
-- `mercadopago_account_organization_id`: STABLE, fixed search_path (pg_temp
-- last, SQLI-03), no dynamic SQL, revoked from PUBLIC, app role only.
-- ============================================================================
CREATE OR REPLACE FUNCTION epayco_account_organization_id(p_cust_id TEXT)
  RETURNS TABLE(
    organization_id UUID
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
  SELECT a.organization_id
  FROM "organization_epayco_accounts" a
  WHERE a.cust_id = p_cust_id;
$$;

REVOKE ALL ON FUNCTION epayco_account_organization_id(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION epayco_account_organization_id(TEXT) TO adoptafacil_app;
