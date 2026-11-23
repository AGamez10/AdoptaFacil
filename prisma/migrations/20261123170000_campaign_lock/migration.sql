-- ============================================================================
-- Campañas: una campaña cerrada no se reabre ni se reescribe, y la meta no baja
-- después de la primera donación (auditoría go/no-go 2026-11-23, bloqueador B3).
--
-- La API ya lo valida (CampaignsService.update, 409). Este trigger es la segunda
-- línea: aplica a TODO rol (incluidas funciones SECURITY DEFINER y una consola
-- con el dueño de la base), así que ni un bug ni un UPDATE a mano lo saltan.
--
-- Reglas:
--   1. 'closed' y 'cancelled' son estados finales: no cambian estado, título,
--      descripción, categoría, meta ni fecha límite. `raised_amount` sí puede
--      BAJAR (un reembolso o contracargo posterior, función
--      subtract_campaign_funding): eso es la verdad del dinero, no una edición.
--      Nunca sube en una campaña cerrada (apply_campaign_funding ya exige
--      'active'; el trigger lo garantiza).
--   2. Con recaudo (> 0) la meta no baja y la categoría no cambia: los donantes
--      dieron para ESA meta y ESE fin.
-- ============================================================================

CREATE OR REPLACE FUNCTION campaigns_enforce_lock() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF OLD.status IN ('closed', 'cancelled') THEN
    IF NEW.status IS DISTINCT FROM OLD.status
       OR NEW.title IS DISTINCT FROM OLD.title
       OR NEW.description IS DISTINCT FROM OLD.description
       OR NEW.category IS DISTINCT FROM OLD.category
       OR NEW.goal_amount IS DISTINCT FROM OLD.goal_amount
       OR NEW.deadline IS DISTINCT FROM OLD.deadline
       OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
       OR NEW.raised_amount > OLD.raised_amount THEN
      RAISE EXCEPTION 'campaign % is %: it can no longer be modified', OLD.id, OLD.status
        USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.raised_amount > 0 THEN
    IF NEW.goal_amount < OLD.goal_amount THEN
      RAISE EXCEPTION 'campaign % already received donations: its goal cannot be lowered', OLD.id
        USING ERRCODE = 'restrict_violation';
    END IF;
    IF NEW.category IS DISTINCT FROM OLD.category THEN
      RAISE EXCEPTION 'campaign % already received donations: its category cannot change', OLD.id
        USING ERRCODE = 'restrict_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS campaigns_lock ON "campaigns";
CREATE TRIGGER campaigns_lock BEFORE UPDATE ON "campaigns"
  FOR EACH ROW EXECUTE FUNCTION campaigns_enforce_lock();
