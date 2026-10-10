-- Workspace colaborativo de plataforma + seguridad de las cuentas del personal
-- (F19, Anexo #3; §6.10.10 del prompt maestro).
--
-- 1. MFA (TOTP) de las cuentas: auth_mfa_factors (secreto cifrado, nunca en
--    claro) y refresh_tokens.mfa_verified_at (la sesión conserva su segundo
--    factor durante la jornada y lo pierde por tiempo o por inactividad).
-- 2. Tareas del equipo (platform_workspace_tickets) y su historia
--    (platform_workspace_ticket_events).
-- 3. Acciones sensibles con doble aprobación (platform_sensitive_actions) y su
--    única decisión (platform_sensitive_action_decisions).
--
-- Las cuatro tablas con organization_id guardan el trabajo del EQUIPO (la
-- organización donde su personal tiene roles de plataforma) y llevan RLS
-- ENABLE + FORCE + tenant_isolation: un equipo no ve ni toca lo de otro. Las
-- cubre el gate scripts/ci/rls-posture.sql y las pruebas rls-no-leak.
--
-- Append-only EN LA BASE (no solo en código): el rol de la app solo recibe
-- SELECT + INSERT en las cuatro, y triggers rechazan UPDATE/DELETE/TRUNCATE
-- para cualquier rol, incluido superusuario. El estado de una tarea es el de su
-- último evento (UNIQUE ticket_id+seq resuelve la concurrencia); la regla de
-- cuatro ojos la impone un trigger BEFORE INSERT sobre las decisiones.
--
-- Reversión (manual; todas las tablas son nuevas y no tienen datos de
-- producción, nada previo se modifica salvo una columna nullable añadida):
--   DROP TABLE platform_sensitive_action_decisions;
--   DROP TABLE platform_sensitive_actions;
--   DROP TABLE platform_workspace_ticket_events;
--   DROP TABLE platform_workspace_tickets;
--   DROP TABLE auth_mfa_factors;
--   DROP FUNCTION platform_workspace_reject_mutation();
--   DROP FUNCTION platform_workspace_ticket_event_check();
--   DROP FUNCTION platform_sensitive_action_decision_check();
--   ALTER TABLE refresh_tokens DROP COLUMN mfa_verified_at;
-- (los DROP TABLE se llevan sus triggers, políticas e índices).

ALTER TABLE "refresh_tokens" ADD COLUMN     "mfa_verified_at" TIMESTAMP(3);

CREATE TABLE "auth_mfa_factors" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "secret_ciphertext" TEXT NOT NULL,
    "confirmed_at" TIMESTAMP(3),
    "last_used_step" BIGINT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "auth_mfa_factors_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "platform_workspace_tickets" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "subject_organization_id" UUID NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'organization_review',
    "created_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_workspace_tickets_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "platform_workspace_ticket_events" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "ticket_id" UUID NOT NULL,
    "seq" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "assignee_user_id" UUID,
    "actor_user_id" UUID,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_workspace_ticket_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "platform_sensitive_actions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "reason" TEXT NOT NULL,
    "requested_by_user_id" UUID NOT NULL,
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_sensitive_actions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "platform_sensitive_action_decisions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "action_id" UUID NOT NULL,
    "decision" TEXT NOT NULL,
    "decided_by_user_id" UUID NOT NULL,
    "note" TEXT,
    "result" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_sensitive_action_decisions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "auth_mfa_factors_user_id_key" ON "auth_mfa_factors"("user_id");

CREATE INDEX "platform_workspace_tickets_organization_id_idx" ON "platform_workspace_tickets"("organization_id");

CREATE UNIQUE INDEX "platform_workspace_tickets_organization_id_subject_organiza_key" ON "platform_workspace_tickets"("organization_id", "subject_organization_id", "kind");

CREATE UNIQUE INDEX "platform_workspace_tickets_id_organization_id_key" ON "platform_workspace_tickets"("id", "organization_id");

CREATE INDEX "platform_workspace_ticket_events_organization_id_idx" ON "platform_workspace_ticket_events"("organization_id");

CREATE UNIQUE INDEX "platform_workspace_ticket_events_ticket_id_seq_key" ON "platform_workspace_ticket_events"("ticket_id", "seq");

CREATE INDEX "platform_sensitive_actions_organization_id_idx" ON "platform_sensitive_actions"("organization_id");

CREATE UNIQUE INDEX "platform_sensitive_actions_id_organization_id_key" ON "platform_sensitive_actions"("id", "organization_id");

CREATE UNIQUE INDEX "platform_sensitive_action_decisions_action_id_key" ON "platform_sensitive_action_decisions"("action_id");

CREATE INDEX "platform_sensitive_action_decisions_organization_id_idx" ON "platform_sensitive_action_decisions"("organization_id");

ALTER TABLE "auth_mfa_factors" ADD CONSTRAINT "auth_mfa_factors_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "platform_workspace_tickets" ADD CONSTRAINT "platform_workspace_tickets_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "platform_workspace_ticket_events" ADD CONSTRAINT "platform_workspace_ticket_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "platform_workspace_ticket_events" ADD CONSTRAINT "platform_workspace_ticket_events_ticket_id_organization_id_fkey" FOREIGN KEY ("ticket_id", "organization_id") REFERENCES "platform_workspace_tickets"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "platform_sensitive_actions" ADD CONSTRAINT "platform_sensitive_actions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "platform_sensitive_action_decisions" ADD CONSTRAINT "platform_sensitive_action_decisions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "platform_sensitive_action_decisions" ADD CONSTRAINT "platform_sensitive_action_decisions_action_id_organization_fkey" FOREIGN KEY ("action_id", "organization_id") REFERENCES "platform_sensitive_actions"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ============================================================================
-- Reglas de dominio en la base
-- ============================================================================
ALTER TABLE "platform_workspace_tickets" ADD CONSTRAINT "platform_workspace_tickets_kind_check"
  CHECK ("kind" IN ('organization_review'));
ALTER TABLE "platform_workspace_ticket_events" ADD CONSTRAINT "platform_workspace_ticket_events_values_check"
  CHECK ("seq" >= 1
     AND "type" IN ('created', 'assigned', 'released', 'status_changed', 'note', 'reopened')
     AND "status" IN ('open', 'in_progress', 'waiting_org', 'resolved')
     AND ("note" IS NULL OR char_length("note") <= 2000));
ALTER TABLE "platform_sensitive_actions" ADD CONSTRAINT "platform_sensitive_actions_values_check"
  CHECK ("type" IN ('staff.invite', 'staff.role_grant', 'staff.role_revoke', 'staff.mfa_reset', 'audit.export')
     AND char_length("reason") BETWEEN 1 AND 1000
     AND "expires_at" > "requested_at");
ALTER TABLE "platform_sensitive_action_decisions" ADD CONSTRAINT "platform_sensitive_action_decisions_values_check"
  CHECK ("decision" IN ('approved', 'rejected', 'cancelled')
     AND ("note" IS NULL OR char_length("note") <= 1000));

-- ============================================================================
-- RLS por equipo (tenant) en las cuatro tablas
-- ============================================================================
ALTER TABLE "platform_workspace_tickets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "platform_workspace_tickets" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "platform_workspace_tickets"
  USING ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

ALTER TABLE "platform_workspace_ticket_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "platform_workspace_ticket_events" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "platform_workspace_ticket_events"
  USING ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

ALTER TABLE "platform_sensitive_actions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "platform_sensitive_actions" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "platform_sensitive_actions"
  USING ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

ALTER TABLE "platform_sensitive_action_decisions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "platform_sensitive_action_decisions" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "platform_sensitive_action_decisions"
  USING ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

-- ============================================================================
-- Mínimo privilegio para el rol de runtime
-- ============================================================================
GRANT SELECT, INSERT ON "platform_workspace_tickets" TO adoptafacil_app;
GRANT SELECT, INSERT ON "platform_workspace_ticket_events" TO adoptafacil_app;
GRANT SELECT, INSERT ON "platform_sensitive_actions" TO adoptafacil_app;
GRANT SELECT, INSERT ON "platform_sensitive_action_decisions" TO adoptafacil_app;
REVOKE UPDATE, DELETE, TRUNCATE ON "platform_workspace_tickets" FROM adoptafacil_app;
REVOKE UPDATE, DELETE, TRUNCATE ON "platform_workspace_ticket_events" FROM adoptafacil_app;
REVOKE UPDATE, DELETE, TRUNCATE ON "platform_sensitive_actions" FROM adoptafacil_app;
REVOKE UPDATE, DELETE, TRUNCATE ON "platform_sensitive_action_decisions" FROM adoptafacil_app;
-- Infraestructura de autenticación por usuario, como refresh_tokens: la app
-- registra el factor, marca el último paso usado y lo borra al reiniciarlo
-- (solo vía doble aprobación).
GRANT SELECT, INSERT, UPDATE, DELETE ON "auth_mfa_factors" TO adoptafacil_app;

-- ============================================================================
-- Append-only para TODOS los roles (incluido superusuario por la vía normal)
-- ============================================================================
CREATE OR REPLACE FUNCTION platform_workspace_reject_mutation() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  RAISE EXCEPTION '% is append-only: % is not permitted', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE TRIGGER platform_workspace_tickets_no_update BEFORE UPDATE ON "platform_workspace_tickets"
  FOR EACH ROW EXECUTE FUNCTION platform_workspace_reject_mutation();
CREATE TRIGGER platform_workspace_tickets_no_delete BEFORE DELETE ON "platform_workspace_tickets"
  FOR EACH ROW EXECUTE FUNCTION platform_workspace_reject_mutation();
CREATE TRIGGER platform_workspace_tickets_no_truncate BEFORE TRUNCATE ON "platform_workspace_tickets"
  FOR EACH STATEMENT EXECUTE FUNCTION platform_workspace_reject_mutation();

CREATE TRIGGER platform_workspace_ticket_events_no_update BEFORE UPDATE ON "platform_workspace_ticket_events"
  FOR EACH ROW EXECUTE FUNCTION platform_workspace_reject_mutation();
CREATE TRIGGER platform_workspace_ticket_events_no_delete BEFORE DELETE ON "platform_workspace_ticket_events"
  FOR EACH ROW EXECUTE FUNCTION platform_workspace_reject_mutation();
CREATE TRIGGER platform_workspace_ticket_events_no_truncate BEFORE TRUNCATE ON "platform_workspace_ticket_events"
  FOR EACH STATEMENT EXECUTE FUNCTION platform_workspace_reject_mutation();

CREATE TRIGGER platform_sensitive_actions_no_update BEFORE UPDATE ON "platform_sensitive_actions"
  FOR EACH ROW EXECUTE FUNCTION platform_workspace_reject_mutation();
CREATE TRIGGER platform_sensitive_actions_no_delete BEFORE DELETE ON "platform_sensitive_actions"
  FOR EACH ROW EXECUTE FUNCTION platform_workspace_reject_mutation();
CREATE TRIGGER platform_sensitive_actions_no_truncate BEFORE TRUNCATE ON "platform_sensitive_actions"
  FOR EACH STATEMENT EXECUTE FUNCTION platform_workspace_reject_mutation();

CREATE TRIGGER platform_sensitive_action_decisions_no_update BEFORE UPDATE ON "platform_sensitive_action_decisions"
  FOR EACH ROW EXECUTE FUNCTION platform_workspace_reject_mutation();
CREATE TRIGGER platform_sensitive_action_decisions_no_delete BEFORE DELETE ON "platform_sensitive_action_decisions"
  FOR EACH ROW EXECUTE FUNCTION platform_workspace_reject_mutation();
CREATE TRIGGER platform_sensitive_action_decisions_no_truncate BEFORE TRUNCATE ON "platform_sensitive_action_decisions"
  FOR EACH STATEMENT EXECUTE FUNCTION platform_workspace_reject_mutation();

-- ============================================================================
-- Secuencia de eventos: cada evento es exactamente el siguiente de su tarea.
-- Dos cambios simultáneos calculan el mismo seq y uno pierde contra el UNIQUE.
-- ============================================================================
CREATE OR REPLACE FUNCTION platform_workspace_ticket_event_check() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  last_seq integer;
BEGIN
  SELECT coalesce(max(seq), 0) INTO last_seq
    FROM platform_workspace_ticket_events
   WHERE ticket_id = NEW.ticket_id;
  IF NEW.seq <> last_seq + 1 THEN
    RAISE EXCEPTION 'ticket % expected seq %, got %', NEW.ticket_id, last_seq + 1, NEW.seq
      USING ERRCODE = 'serialization_failure';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER platform_workspace_ticket_events_sequence BEFORE INSERT ON "platform_workspace_ticket_events"
  FOR EACH ROW EXECUTE FUNCTION platform_workspace_ticket_event_check();

-- ============================================================================
-- Cuatro ojos: aprobar o rechazar lo hace OTRA persona, PlatformSuperAdmin del
-- MISMO equipo, antes del vencimiento; cancelar solo lo hace quien pidió.
-- ============================================================================
CREATE OR REPLACE FUNCTION platform_sensitive_action_decision_check() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  req record;
BEGIN
  SELECT requested_by_user_id, expires_at INTO req
    FROM platform_sensitive_actions
   WHERE id = NEW.action_id AND organization_id = NEW.organization_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'sensitive action % not found in this team', NEW.action_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF NEW.decision = 'cancelled' THEN
    IF NEW.decided_by_user_id <> req.requested_by_user_id THEN
      RAISE EXCEPTION 'only the requester can cancel a sensitive action'
        USING ERRCODE = 'check_violation';
    END IF;
  ELSE
    IF NEW.decided_by_user_id = req.requested_by_user_id THEN
      RAISE EXCEPTION 'four eyes: the requester cannot decide their own sensitive action'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM user_roles
       WHERE organization_id = NEW.organization_id
         AND user_id = NEW.decided_by_user_id
         AND role = 'platform_super_admin'
    ) THEN
      RAISE EXCEPTION 'four eyes: only a platform_super_admin of the same team can decide'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  IF NEW.decision = 'approved' AND req.expires_at <= now() THEN
    RAISE EXCEPTION 'sensitive action % expired', NEW.action_id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER platform_sensitive_action_decisions_four_eyes BEFORE INSERT ON "platform_sensitive_action_decisions"
  FOR EACH ROW EXECUTE FUNCTION platform_sensitive_action_decision_check();
