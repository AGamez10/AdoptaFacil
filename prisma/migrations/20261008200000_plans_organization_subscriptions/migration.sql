-- Planes y suscripciones de organizaciones (Gratis / Crece / Pro).
--
-- NOTE (mismo patrón que 20261006144849_s_volunteer_hours_certificate_gate): el
-- diff de Prisma propuso además DROP de foreign keys no modeladas, un ALTER de
-- platform_settings.updated_at y un RENAME INDEX preexistentes y sin relación
-- con esta tarea. Ninguno va aquí: esta migración SOLO crea
-- `organization_subscriptions`.
--
-- La suscripción es ingreso propio de AdoptaFácil (la organización paga por el
-- software); no toca donaciones ni custodia fondos de terceros (D1).

-- CreateTable
CREATE TABLE "organization_subscriptions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "plan" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "current_period_end" TIMESTAMP(3),
    "provider" TEXT NOT NULL DEFAULT 'manual',
    "provider_reference" TEXT,
    "discount_percent" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_subscriptions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "organization_subscriptions_plan_check" CHECK ("plan" IN ('free', 'crece', 'pro')),
    CONSTRAINT "organization_subscriptions_status_check" CHECK ("status" IN ('trialing', 'active', 'past_due', 'canceled')),
    CONSTRAINT "organization_subscriptions_provider_check" CHECK ("provider" IN ('manual')),
    CONSTRAINT "organization_subscriptions_discount_check" CHECK ("discount_percent" BETWEEN 0 AND 100)
);

-- CreateIndex
CREATE UNIQUE INDEX "organization_subscriptions_organization_id_key" ON "organization_subscriptions"("organization_id");

-- AddForeignKey
-- Boundary note: billing.prisma omits the relation to `Organization` (org.prisma)
-- on purpose; the FK + cascade is added here in raw SQL instead.
ALTER TABLE "organization_subscriptions" ADD CONSTRAINT "organization_subscriptions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================================
-- ROW-LEVEL SECURITY (RNF03). Tenant-scoped like every business table: an
-- organization only ever sees its own subscription. Writes happen through the
-- platform endpoint under that organization's context (withOrgContext), so the
-- same WITH CHECK applies. No DELETE grant: a subscription is canceled, never
-- removed (history lives in audit_logs).
-- ============================================================================

ALTER TABLE "organization_subscriptions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "organization_subscriptions" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "organization_subscriptions"
  USING ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE ON "organization_subscriptions" TO adoptafacil_app;
