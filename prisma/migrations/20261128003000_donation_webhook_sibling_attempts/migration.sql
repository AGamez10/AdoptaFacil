-- Auditoría run-4 N2: en un mismo checkout de Mercado Pago el donante puede
-- fallar un intento (tarjeta rechazada, ticket vencido) y pagar con otro, todos
-- con la misma `external_reference`. Antes, el intento rechazado dejaba la
-- donación en 'declined' y el pago aprobado posterior ya no encontraba una fila
-- 'pending': la donación pagada quedaba rechazada y sin recibo.
--
-- 'declined' deja de ser final para un aprobado: un pago aprobado liquida la
-- donación si está 'pending' o 'declined'. Un rechazo sigue sin tocar nada que
-- no esté 'pending' (nunca declina una donación ya aprobada).
CREATE OR REPLACE FUNCTION apply_donation_webhook(
  p_collection_id TEXT,
  p_status TEXT,
  p_dedup_key TEXT
)
  RETURNS SETOF "donations"
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE d "donations";
BEGIN
  IF p_status = 'approved' THEN
    UPDATE "donations"
      SET "status" = 'approved', "updated_at" = CURRENT_TIMESTAMP
      WHERE "collection_id" = p_collection_id AND "status" IN ('pending', 'declined')
      RETURNING * INTO d;
    IF NOT FOUND THEN
      RETURN; -- recaudo desconocido o ya liquidado ⇒ no-op idempotente
    END IF;
    INSERT INTO "donation_receipts" (
      "id", "organization_id", "donation_id", "dedup_key",
      "donor", "intended_amount", "breakdown", "issued_at"
    ) VALUES (
      gen_random_uuid(), d."organization_id", d."id", p_dedup_key,
      COALESCE(d."payer", '{}'::jsonb), d."intended_amount", d."breakdown", CURRENT_TIMESTAMP
    )
    ON CONFLICT ("dedup_key") DO NOTHING;
    RETURN NEXT d;
  ELSIF p_status = 'declined' THEN
    UPDATE "donations"
      SET "status" = 'declined', "updated_at" = CURRENT_TIMESTAMP
      WHERE "collection_id" = p_collection_id AND "status" = 'pending'
      RETURNING * INTO d;
    IF NOT FOUND THEN
      RETURN;
    END IF;
    RETURN NEXT d;
  END IF;
  RETURN;
END;
$$;
REVOKE ALL ON FUNCTION apply_donation_webhook(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION apply_donation_webhook(TEXT, TEXT, TEXT) TO adoptafacil_app;
