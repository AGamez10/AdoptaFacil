-- ============================================================================
-- Campana de pendientes: avisos marcados como leídos por persona.
--
-- Los avisos de la campana se calculan en vivo (solicitudes de adopción sin
-- revisar, documentos por vencer o rechazados, recordatorios de salud). Esta
-- tabla solo guarda que una persona ya vio un aviso, para sacarlo de su
-- contador. Sin datos personales ni clínicos: una llave del aviso y una fecha.
-- ============================================================================

CREATE TABLE "notification_reads" (
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "item_key" TEXT NOT NULL,
    "read_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_reads_pkey" PRIMARY KEY ("organization_id", "user_id", "item_key"),
    CONSTRAINT "notification_reads_item_key_format" CHECK (
      "item_key" IN ('adoptions', 'expiring', 'rejected')
      OR "item_key" ~ '^reminder:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    )
);

CREATE INDEX "notification_reads_organization_id_idx" ON "notification_reads"("organization_id");

ALTER TABLE "notification_reads" ADD CONSTRAINT "notification_reads_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notification_reads" ADD CONSTRAINT "notification_reads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "notification_reads" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notification_reads" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "notification_reads"
  USING ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

-- DELETE: el servicio poda las marcas de recordatorios que ya no existen.
GRANT SELECT, INSERT, UPDATE, DELETE ON "notification_reads" TO adoptafacil_app;
