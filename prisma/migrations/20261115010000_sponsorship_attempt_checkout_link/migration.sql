-- Apadrinamiento mensual con Mercado Pago (PAY-001, ADR-PAG-003).
--
-- The daily billing job opens each month's attempt WITHOUT an order (an
-- unattended job has nobody to pay; its `collection_id` is the local
-- placeholder `pending-<idempotency_key>`). When the padrino taps "Pagar este
-- mes", the API opens the order on the ORGANIZATION's own Mercado Pago account
-- and records its reference and link on that attempt.
--
-- That is the ONLY content change allowed after creation, and only once: a
-- pending attempt that still has no link and a placeholder reference may
-- receive both. Everything else stays immutable, exactly as before.

CREATE OR REPLACE FUNCTION sponsorship_payment_attempts_reject_content_mutation() RETURNS trigger
  LANGUAGE plpgsql AS $$
DECLARE
  v_fills_checkout BOOLEAN :=
    OLD.result = 'pending'
    AND OLD.payment_link_url IS NULL
    AND OLD.collection_id LIKE 'pending-%'
    AND NEW.payment_link_url IS NOT NULL
    AND NEW.collection_id IS NOT NULL
    AND NEW.collection_id NOT LIKE 'pending-%';
BEGIN
  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id
     OR NEW.sponsorship_payment_id IS DISTINCT FROM OLD.sponsorship_payment_id
     OR NEW.attempt_number IS DISTINCT FROM OLD.attempt_number
     OR (NEW.collection_id IS DISTINCT FROM OLD.collection_id AND NOT v_fills_checkout)
     OR (NEW.payment_link_url IS DISTINCT FROM OLD.payment_link_url AND NOT v_fills_checkout)
     OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
     OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION
      'sponsorship_payment_attempts: content is immutable after creation (S-5-REDISEÑO)'
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;
