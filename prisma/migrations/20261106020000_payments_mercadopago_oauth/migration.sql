-- ADR-PAG-003 (2026-11-06, decisión del dueño): Mercado Pago vuelve como
-- pasarela, SIN split. Cada organización conecta SU PROPIA cuenta de Mercado
-- Pago por OAuth; las preferencias de Checkout Pro se crean con SU access
-- token, así que la organización es la cobradora y el dinero cae en su cuenta.
-- AdoptaFácil nunca recibe ni retiene una donación (ADR-PAG-001 sigue
-- mandando). Los planes de AdoptaFácil se cobran con la cuenta de Mercado Pago
-- de la PLATAFORMA (suscripciones), que nunca toca una donación.
--
-- `access_token_enc` y `refresh_token_enc` son textos cifrados AES-256-GCM
-- (base64) que produce la API (`mercadopago-token-crypto.ts`, llave derivada
-- con HKDF de SIGNATURE_ENCRYPTION_KEY): un volcado de la base no revela los
-- tokens. `mp_user_id` (collector id) no es secreto y es ÚNICO global: una
-- cuenta de Mercado Pago nunca respalda a dos organizaciones.
--
-- La tabla vieja `organization_mercadopago_accounts` (tokens en claro) se
-- eliminó en 20261017110000 y NO se reutiliza.

-- CreateTable
CREATE TABLE "organization_mercadopago_connections" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "mp_user_id" TEXT NOT NULL,
    "access_token_enc" TEXT NOT NULL,
    "refresh_token_enc" TEXT,
    "public_key" TEXT,
    "live_mode" BOOLEAN NOT NULL DEFAULT false,
    "scope" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "last_refreshed_at" TIMESTAMP(3),
    "last_error" TEXT,
    "connected_by_user_id" UUID,
    "connected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_mercadopago_connections_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "organization_mercadopago_connections_status_check"
      CHECK ("status" IN ('active', 'needs_reconnect')),
    CONSTRAINT "organization_mercadopago_connections_mp_user_id_check"
      CHECK ("mp_user_id" ~ '^[0-9]{1,20}$')
);

-- CreateIndex
CREATE UNIQUE INDEX "organization_mercadopago_connections_organization_id_key" ON "organization_mercadopago_connections"("organization_id");
CREATE UNIQUE INDEX "organization_mercadopago_connections_mp_user_id_key" ON "organization_mercadopago_connections"("mp_user_id");
CREATE INDEX "organization_mercadopago_connections_status_expires_at_idx" ON "organization_mercadopago_connections"("status", "expires_at");

-- AddForeignKey
ALTER TABLE "organization_mercadopago_connections"
  ADD CONSTRAINT "organization_mercadopago_connections_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================================
-- ROW-LEVEL SECURITY (RNF03): una organización solo ve y gestiona SU conexión.
-- Mismo patrón canónico que organization_epayco_accounts (una fila por org;
-- UPDATE/DELETE permitidos porque reconectar y desconectar son normales).
-- ============================================================================
ALTER TABLE "organization_mercadopago_connections" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "organization_mercadopago_connections" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "organization_mercadopago_connections"
  USING ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON "organization_mercadopago_connections" TO adoptafacil_app;

-- ============================================================================
-- DESCUBRIMIENTO CROSS-TENANT para la renovación de tokens (SECURITY DEFINER,
-- solo lectura): devuelve SOLO el id de las organizaciones cuyo token vence
-- dentro de la ventana. Nunca un token: el worker los lee después bajo el
-- contexto RLS de cada organización. STABLE, search_path fijo (pg_temp al
-- final, SQLI-03), sin SQL dinámico, revocada de PUBLIC, solo el rol de app.
-- ============================================================================
CREATE OR REPLACE FUNCTION mercadopago_connections_due_for_refresh(p_window_days INTEGER)
  RETURNS TABLE(
    organization_id UUID
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
  SELECT c.organization_id
  FROM "organization_mercadopago_connections" c
  WHERE c.status = 'active'
    AND c.refresh_token_enc IS NOT NULL
    AND c.expires_at <= (now() AT TIME ZONE 'UTC') + make_interval(days => GREATEST(p_window_days, 0))
  ORDER BY c.expires_at
  LIMIT 500;
$$;

REVOKE ALL ON FUNCTION mercadopago_connections_due_for_refresh(INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION mercadopago_connections_due_for_refresh(INTEGER) TO adoptafacil_app;

-- ============================================================================
-- Planes: la suscripción puede cobrarse con Mercado Pago (cuenta de la
-- PLATAFORMA). `epayco` ya estaba en el contrato pero no en el CHECK.
-- ============================================================================
ALTER TABLE "organization_subscriptions" DROP CONSTRAINT "organization_subscriptions_provider_check";
ALTER TABLE "organization_subscriptions"
  ADD CONSTRAINT "organization_subscriptions_provider_check"
  CHECK ("provider" IN ('manual', 'epayco', 'mercadopago'));
