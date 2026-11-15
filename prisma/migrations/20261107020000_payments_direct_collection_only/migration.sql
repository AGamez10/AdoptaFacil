-- Cobro directo con Mercado Pago, 0 % de comisión de AdoptaFácil
-- (2026-11-07, decisión del dueño: "no debe quedar ningún rastro de lo que ya no
-- se decidió usar").
--
-- El dinero de una donación llega directo a la cuenta de Mercado Pago de la
-- organización (ADR-PAG-003): AdoptaFácil nunca tiene saldo de terceros, así
-- que no hay dispersiones (payouts), ni cuentas bancarias registradas para
-- dispersar, ni conciliación recaudo-contra-dispersión. Tampoco existe la
-- casilla "cubro la comisión": el donante paga exactamente lo que elige y la
-- tarifa de Mercado Pago la cobra Mercado Pago a la cuenta de la organización.
--
-- Esta migración, en orden:
--   1. Elimina las funciones y tablas de dispersión: `reconciliation_report`,
--      `apply_payout_webhook`, `create_payout`, `payouts_for_organization`,
--      `payouts` y `organization_bank_accounts`. Nunca hubo un adaptador de
--      dispersión real, así que `payouts` no tiene filas reales; las cuentas
--      bancarias registradas (si alguna organización registró una en un
--      entorno de prueba) se borran porque ya no tienen ningún uso.
--   2. Quita `donations.commission_payer` y recrea `create_donation` sin ese
--      parámetro. La función ahora rechaza la donación si la organización no
--      está `approved` (una organización suspendida o sin aprobar no recauda).
--   3. Ajusta los CHECK que aún nombraban la pasarela retirada.
--
-- Irreversible. Las migraciones anteriores no se editan (su historia queda
-- como registro); esta es la que deja el esquema en el modelo decidido.

-- 1. Dispersión (custodia) ----------------------------------------------------
DROP FUNCTION IF EXISTS reconciliation_report(TIMESTAMP, TIMESTAMP, UUID);
DROP FUNCTION IF EXISTS apply_payout_webhook(TEXT, TEXT);
DROP FUNCTION IF EXISTS create_payout(UUID, INTEGER, TEXT);
DROP FUNCTION IF EXISTS payouts_for_organization(UUID);
DROP TABLE IF EXISTS "payouts";
DROP TABLE IF EXISTS "organization_bank_accounts";

-- 2. Donaciones: sin "cubro la comisión" y solo organizaciones aprobadas -------
DROP FUNCTION IF EXISTS create_donation(UUID, UUID, TEXT, UUID, TEXT, INTEGER, INTEGER, JSONB, TEXT, TEXT, JSONB, BOOLEAN);

ALTER TABLE "donations" DROP COLUMN "commission_payer";

CREATE OR REPLACE FUNCTION create_donation(
  p_organization_id UUID,
  p_donor_user_id UUID,
  p_concept_kind TEXT,
  p_concept_id UUID,
  p_intended_amount INTEGER,
  p_amount_charged INTEGER,
  p_breakdown JSONB,
  p_collection_id TEXT,
  p_idempotency_key TEXT,
  p_payer JSONB,
  p_anonymous BOOLEAN
)
  RETURNS SETOF "donations"
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE d "donations";
BEGIN
  -- Solo una organización aprobada recibe donaciones (la API ya lo valida con
  -- un mensaje claro; esto es la defensa en profundidad).
  IF NOT EXISTS (
    SELECT 1 FROM "organizations" o WHERE o."id" = p_organization_id AND o."status" = 'approved'
  ) THEN
    RAISE EXCEPTION 'organization_not_approved' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO "donations" (
    "id", "organization_id", "donor_user_id", "concept_kind", "concept_id",
    "intended_amount", "amount_charged", "currency",
    "breakdown", "collection_id", "idempotency_key", "status", "payer", "anonymous", "updated_at"
  ) VALUES (
    gen_random_uuid(), p_organization_id, p_donor_user_id, p_concept_kind, p_concept_id,
    p_intended_amount, p_amount_charged, 'COP',
    p_breakdown, p_collection_id, p_idempotency_key, 'pending', p_payer, p_anonymous, CURRENT_TIMESTAMP
  )
  ON CONFLICT ("organization_id", "idempotency_key") DO NOTHING;

  SELECT * INTO d FROM "donations"
    WHERE "organization_id" = p_organization_id AND "idempotency_key" = p_idempotency_key;
  RETURN NEXT d;
END;
$$;

REVOKE ALL ON FUNCTION create_donation(UUID, UUID, TEXT, UUID, INTEGER, INTEGER, JSONB, TEXT, TEXT, JSONB, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_donation(UUID, UUID, TEXT, UUID, INTEGER, INTEGER, JSONB, TEXT, TEXT, JSONB, BOOLEAN) TO adoptafacil_app;

-- 3. CHECK sin la pasarela retirada --------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "organization_subscriptions" WHERE "provider" NOT IN ('manual', 'mercadopago')) THEN
    RAISE EXCEPTION 'organization_subscriptions tiene filas con un proveedor retirado: revisar antes de migrar';
  END IF;
  IF EXISTS (SELECT 1 FROM "accounting_entries" WHERE "source" NOT IN ('mercadopago', 'other')) THEN
    RAISE EXCEPTION 'accounting_entries tiene filas con una fuente retirada: revisar antes de migrar';
  END IF;
END;
$$;

ALTER TABLE "organization_subscriptions" DROP CONSTRAINT "organization_subscriptions_provider_check";
ALTER TABLE "organization_subscriptions"
  ADD CONSTRAINT "organization_subscriptions_provider_check"
  CHECK ("provider" IN ('manual', 'mercadopago'));

ALTER TABLE "accounting_entries" DROP CONSTRAINT "accounting_entries_source_check";
ALTER TABLE "accounting_entries"
  ADD CONSTRAINT "accounting_entries_source_check"
  CHECK ("source" IN ('mercadopago', 'other'));
