-- ADR-PAG-003 · revisión de seguridad del #88, hallazgo 5.
-- `mercadopago_payments` es el libro de conciliación de cada refugio y se
-- conserva (soporte contable). Antes, borrar una organización lo borraba en
-- cascada. Ahora:
--   * la FK hacia organizations es RESTRICT (no se puede borrar una
--     organización que tenga pagos registrados);
--   * DELETE y TRUNCATE se rechazan para todo rol, igual que
--     sponsorship_payments (el rol de la app ya no tenía DELETE).

ALTER TABLE "mercadopago_payments" DROP CONSTRAINT "mercadopago_payments_organization_id_fkey";
ALTER TABLE "mercadopago_payments"
  ADD CONSTRAINT "mercadopago_payments_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION mercadopago_payments_reject_removal() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION
    'mercadopago_payments keeps the reconciliation ledger: % is not permitted (ADR-PAG-003)', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE TRIGGER mercadopago_payments_no_delete
  BEFORE DELETE ON "mercadopago_payments"
  FOR EACH ROW EXECUTE FUNCTION mercadopago_payments_reject_removal();
CREATE TRIGGER mercadopago_payments_no_truncate
  BEFORE TRUNCATE ON "mercadopago_payments"
  FOR EACH STATEMENT EXECUTE FUNCTION mercadopago_payments_reject_removal();

-- ============================================================================
-- Hallazgo 6: un reembolso o contracargo ANULA el certificado de donación.
-- donation_reversals: una fila por donación reversada en la pasarela.
-- Append-only (sin UPDATE/DELETE/TRUNCATE para ningún rol), con RLS.
-- ============================================================================
CREATE TABLE "donation_reversals" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "donation_id" UUID NOT NULL,
  "reason" TEXT NOT NULL,
  "dedup_key" TEXT NOT NULL,
  "reversed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "donation_reversals_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "donation_reversals_reason_check"
    CHECK ("reason" IN ('refunded', 'charged_back', 'cancelled', 'voided'))
);

CREATE UNIQUE INDEX "donation_reversals_donation_id_key" ON "donation_reversals"("donation_id");
CREATE INDEX "donation_reversals_organization_id_idx" ON "donation_reversals"("organization_id");

ALTER TABLE "donation_reversals" ADD CONSTRAINT "donation_reversals_donation_id_fkey"
  FOREIGN KEY ("donation_id") REFERENCES "donations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "donation_reversals" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "donation_reversals" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "donation_reversals"
  USING (organization_id = current_setting('app.current_org_id', true)::uuid)
  WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);

GRANT SELECT, INSERT ON "donation_reversals" TO adoptafacil_app;
REVOKE UPDATE, DELETE, TRUNCATE ON "donation_reversals" FROM adoptafacil_app;

CREATE OR REPLACE FUNCTION donation_reversals_reject_mutation() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'donation_reversals is append-only: % is not permitted (ADR-PAG-003)', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$;
CREATE TRIGGER donation_reversals_no_update
  BEFORE UPDATE ON "donation_reversals"
  FOR EACH ROW EXECUTE FUNCTION donation_reversals_reject_mutation();
CREATE TRIGGER donation_reversals_no_delete
  BEFORE DELETE ON "donation_reversals"
  FOR EACH ROW EXECUTE FUNCTION donation_reversals_reject_mutation();
CREATE TRIGGER donation_reversals_no_truncate
  BEFORE TRUNCATE ON "donation_reversals"
  FOR EACH STATEMENT EXECUTE FUNCTION donation_reversals_reject_mutation();

-- La verificación PÚBLICA muestra si el certificado está anulado (misma
-- superficie mínima de antes, más `revokedAt`, null si está vigente).
CREATE OR REPLACE FUNCTION donation_certificate_public(p_code text)
  RETURNS JSONB
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'code', c.code,
    'organizationName', c.payload->>'organizationName',
    'organizationNit', c.payload->>'organizationNit',
    'donorName', CASE WHEN d.anonymous THEN 'Donante anónimo'
                      ELSE mask_person_name(c.payload->>'donorName') END,
    'amount', (c.payload->>'amount')::int,
    'currency', c.payload->>'currency',
    'issuedAt', to_char(c.issued_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'contentHash', c.content_hash,
    'revokedAt', CASE WHEN r.reversed_at IS NULL THEN NULL
                      ELSE to_char(r.reversed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') END
  )
  FROM donation_certificates c
  JOIN donations d ON d.id = c.donation_id
  LEFT JOIN donation_reversals r ON r.donation_id = c.donation_id
  WHERE c.code = p_code;
$$;

-- Fecha de anulación del certificado de una donación, para las vistas del
-- donante (autenticado o invitado), que se resuelven sin contexto de tenant
-- DESPUÉS de verificar la identidad. Solo devuelve la fecha, nunca la fila.
CREATE OR REPLACE FUNCTION donation_reversed_at(p_donation_id uuid)
  RETURNS TIMESTAMP(3)
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT reversed_at FROM donation_reversals WHERE donation_id = p_donation_id;
$$;
REVOKE ALL ON FUNCTION donation_reversed_at(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION donation_reversed_at(uuid) TO adoptafacil_app;
