-- Correos con la marca de la organización (planes Crece y Pro): contador
-- mensual para el tope del plan. Esta migración SOLO crea
-- `organization_email_usage`.
--
-- Pasado el tope el correo sigue saliendo con la marca de AdoptaFácil: el
-- contador nunca bloquea un correo de servicio (recibo, contrato, seguimiento).

-- CreateTable
CREATE TABLE "organization_email_usage" (
    "organization_id" UUID NOT NULL,
    "month" TEXT NOT NULL,
    "branded_count" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_email_usage_pkey" PRIMARY KEY ("organization_id","month"),
    CONSTRAINT "organization_email_usage_month_check" CHECK ("month" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
    CONSTRAINT "organization_email_usage_count_check" CHECK ("branded_count" >= 0)
);

-- AddForeignKey
-- Boundary note: billing.prisma omits the relation to `Organization` (org.prisma)
-- on purpose; the FK + cascade is added here in raw SQL instead.
ALTER TABLE "organization_email_usage" ADD CONSTRAINT "organization_email_usage_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================================
-- ROW-LEVEL SECURITY (RNF03). Each organization only sees and counts its own
-- usage; the email worker writes under that organization's context
-- (withOrgContext), so the same WITH CHECK applies. No DELETE grant.
-- ============================================================================

ALTER TABLE "organization_email_usage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "organization_email_usage" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "organization_email_usage"
  USING ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE ON "organization_email_usage" TO adoptafacil_app;
