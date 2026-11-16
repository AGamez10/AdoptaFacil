-- Notificaciones push web (VAPID). Cada navegador o PWA instalada de una
-- persona guarda una suscripción. Vive en el tenant de la persona (RLS igual
-- que `user_notifications`). El envío a OTRA persona o al equipo de una
-- organización pasa por funciones SECURITY DEFINER acotadas, que solo devuelven
-- los endpoints de esas personas.

CREATE TABLE "push_subscriptions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "endpoint" TEXT NOT NULL,
  "p256dh" TEXT NOT NULL,
  "auth" TEXT NOT NULL,
  "user_agent" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "push_subscriptions_endpoint_key" UNIQUE ("endpoint"),
  CONSTRAINT "push_subscriptions_endpoint_len" CHECK (length("endpoint") BETWEEN 1 AND 2000),
  CONSTRAINT "push_subscriptions_user_agent_len" CHECK ("user_agent" IS NULL OR length("user_agent") <= 300),
  CONSTRAINT "push_subscriptions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "push_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "push_subscriptions_organization_id_idx" ON "push_subscriptions"("organization_id");
CREATE INDEX "push_subscriptions_user_id_idx" ON "push_subscriptions"("user_id");

ALTER TABLE "push_subscriptions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "push_subscriptions" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "push_subscriptions"
  USING ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

GRANT SELECT, INSERT, DELETE ON "push_subscriptions" TO adoptafacil_app;

-- Endpoints de push de UNA persona (para avisarle en su navegador o app).
CREATE OR REPLACE FUNCTION push_subscriptions_for_user(p_user_id UUID)
  RETURNS TABLE (endpoint TEXT, p256dh TEXT, auth TEXT)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT s."endpoint", s."p256dh", s."auth"
  FROM "push_subscriptions" s
  WHERE s."user_id" = p_user_id;
$$;

-- Endpoints de quienes tienen uno de los roles indicados en una organización.
CREATE OR REPLACE FUNCTION push_subscriptions_for_org_staff(
  p_org_id UUID, p_roles TEXT[], p_exclude_user_id UUID
)
  RETURNS TABLE (endpoint TEXT, p256dh TEXT, auth TEXT)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT DISTINCT s."endpoint", s."p256dh", s."auth"
  FROM "push_subscriptions" s
  JOIN "user_roles" r ON r."user_id" = s."user_id" AND r."organization_id" = s."organization_id"
  WHERE s."organization_id" = p_org_id
    AND r."role" = ANY (p_roles)
    AND (p_exclude_user_id IS NULL OR s."user_id" <> p_exclude_user_id);
$$;

-- Quita una suscripción que el servicio de push ya dio por muerta (404 / 410).
CREATE OR REPLACE FUNCTION push_remove_dead_endpoint(p_endpoint TEXT)
  RETURNS VOID
  LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  DELETE FROM "push_subscriptions" WHERE "endpoint" = p_endpoint;
$$;

REVOKE ALL ON FUNCTION push_subscriptions_for_user(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION push_subscriptions_for_org_staff(UUID, TEXT[], UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION push_remove_dead_endpoint(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION push_subscriptions_for_user(UUID) TO adoptafacil_app;
GRANT EXECUTE ON FUNCTION push_subscriptions_for_org_staff(UUID, TEXT[], UUID) TO adoptafacil_app;
GRANT EXECUTE ON FUNCTION push_remove_dead_endpoint(TEXT) TO adoptafacil_app;
