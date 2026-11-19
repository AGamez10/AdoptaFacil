-- Cobro en línea de guardería y custodia por Mercado Pago, con la cuenta de la
-- propia organización (nunca la de AdoptaFácil). Solo agrega: tres tablas, un
-- medio de pago nuevo y tres funciones de consulta para la página pública de
-- pago y para el aviso de la pasarela (que llegan sin sesión).

-- CreateTable
CREATE TABLE "custody_online_payment_settings" (
    "organization_id" UUID NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "terms_version" TEXT,
    "accepted_at" TIMESTAMP(3),
    "accepted_by_user_id" UUID,
    "accepted_by_name" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "custody_online_payment_settings_pkey" PRIMARY KEY ("organization_id")
);

-- CreateTable
CREATE TABLE "custody_payment_links" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "charge_id" UUID NOT NULL,
    "token" TEXT NOT NULL,
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "custody_payment_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "custody_online_payments" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "charge_id" UUID NOT NULL,
    "link_id" UUID NOT NULL,
    "collection_id" TEXT NOT NULL,
    "amount_cop" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "gateway_payment_id" TEXT,
    "reversal_kind" TEXT,
    "payment_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settled_at" TIMESTAMP(3),
    "reversed_at" TIMESTAMP(3),

    CONSTRAINT "custody_online_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "custody_payment_links_token_key" ON "custody_payment_links"("token");

-- CreateIndex
CREATE INDEX "custody_payment_links_organization_id_idx" ON "custody_payment_links"("organization_id");

-- CreateIndex
CREATE INDEX "custody_payment_links_charge_id_idx" ON "custody_payment_links"("charge_id");

-- CreateIndex
CREATE UNIQUE INDEX "custody_online_payments_collection_id_key" ON "custody_online_payments"("collection_id");

-- CreateIndex
CREATE UNIQUE INDEX "custody_online_payments_payment_id_key" ON "custody_online_payments"("payment_id");

-- CreateIndex
CREATE INDEX "custody_online_payments_organization_id_idx" ON "custody_online_payments"("organization_id");

-- CreateIndex
CREATE INDEX "custody_online_payments_charge_id_status_idx" ON "custody_online_payments"("charge_id", "status");

-- AddForeignKey
ALTER TABLE "custody_online_payment_settings" ADD CONSTRAINT "custody_online_payment_settings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custody_payment_links" ADD CONSTRAINT "custody_payment_links_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custody_payment_links" ADD CONSTRAINT "custody_payment_links_charge_id_fkey" FOREIGN KEY ("charge_id") REFERENCES "custody_charges"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custody_online_payments" ADD CONSTRAINT "custody_online_payments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custody_online_payments" ADD CONSTRAINT "custody_online_payments_charge_id_fkey" FOREIGN KEY ("charge_id") REFERENCES "custody_charges"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custody_online_payments" ADD CONSTRAINT "custody_online_payments_link_id_fkey" FOREIGN KEY ("link_id") REFERENCES "custody_payment_links"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custody_online_payments" ADD CONSTRAINT "custody_online_payments_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "custody_payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ----------------------------------------------------------------------------
-- Reglas que la base de datos sostiene aunque la aplicación falle
-- ----------------------------------------------------------------------------

-- Encendido SIEMPRE con la aceptación registrada (quién, cuándo, qué texto).
ALTER TABLE "custody_online_payment_settings" ADD CONSTRAINT "custody_online_payment_settings_acceptance_check"
  CHECK (NOT "enabled"
      OR ("accepted_at" IS NOT NULL AND "accepted_by_user_id" IS NOT NULL
          AND char_length(COALESCE("terms_version", '')) >= 1));

ALTER TABLE "custody_payment_links" ADD CONSTRAINT "custody_payment_links_token_check"
  CHECK ("token" ~ '^[A-Za-z0-9_-]{43}$');

-- Un cobro tiene a lo sumo UN enlace vigente.
CREATE UNIQUE INDEX "custody_payment_links_one_active_per_charge"
  ON "custody_payment_links"("charge_id") WHERE "revoked_at" IS NULL;

ALTER TABLE "custody_online_payments" ADD CONSTRAINT "custody_online_payments_values_check"
  CHECK ("status" IN ('pending', 'approved', 'reversed', 'mismatch')
     AND "amount_cop" BETWEEN 1 AND 1000000000
     -- Aprobado o revertido siempre apunta al pago que creó.
     AND ("status" NOT IN ('approved', 'reversed') OR "payment_id" IS NOT NULL)
     AND ("status" <> 'reversed' OR "reversed_at" IS NOT NULL));

-- Nuevo medio de pago: `mercadopago` (pago en línea a la cuenta de la organización).
ALTER TABLE "custody_payments" DROP CONSTRAINT "custody_payments_values_check";
ALTER TABLE "custody_payments" ADD CONSTRAINT "custody_payments_values_check"
  CHECK ("method" IN ('transfer', 'deposit', 'cash', 'other', 'mercadopago')
     AND "amount_cop" BETWEEN 1 AND 1000000000
     AND ("voided_at" IS NULL OR char_length(COALESCE("void_reason", '')) >= 5));

-- ----------------------------------------------------------------------------
-- RLS + permisos del rol de runtime
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'custody_online_payment_settings', 'custody_payment_links', 'custody_online_payments'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I '
      'USING ("organization_id" = NULLIF(current_setting(''app.current_org_id'', true), '''')::uuid) '
      'WITH CHECK ("organization_id" = NULLIF(current_setting(''app.current_org_id'', true), '''')::uuid)',
      t);
  END LOOP;
END
$$;

GRANT SELECT, INSERT, UPDATE ON "custody_online_payment_settings" TO adoptafacil_app;
GRANT SELECT, INSERT, UPDATE ON "custody_payment_links" TO adoptafacil_app;
GRANT SELECT, INSERT, UPDATE ON "custody_online_payments" TO adoptafacil_app;

-- ----------------------------------------------------------------------------
-- Consultas sin sesión: solo devuelven a QUÉ organización pertenece un enlace
-- o una referencia de pago. Todo lo demás se lee después bajo el RLS de esa
-- organización. Un valor con otra forma nunca llega a comparar.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION custody_payment_link_owner(p_token TEXT)
  RETURNS UUID
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
  SELECT organization_id FROM custody_payment_links
  WHERE p_token ~ '^[A-Za-z0-9_-]{43}$' AND token = p_token AND revoked_at IS NULL;
$$;

CREATE OR REPLACE FUNCTION custody_online_payment_owner(p_collection_id TEXT)
  RETURNS UUID
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
  SELECT organization_id FROM custody_online_payments
  WHERE p_collection_id ~ '^[A-Za-z0-9_-]{8,64}$' AND collection_id = p_collection_id;
$$;

REVOKE ALL ON FUNCTION custody_payment_link_owner(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION custody_online_payment_owner(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION custody_payment_link_owner(TEXT) TO adoptafacil_app;
GRANT EXECUTE ON FUNCTION custody_online_payment_owner(TEXT) TO adoptafacil_app;
