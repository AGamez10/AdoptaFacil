-- Pre-registro de comercios y profesionales interesados en la Comunidad.
-- NO es dato de tenant: sin organization_id ni RLS (como platform_settings).
-- Privilegio mínimo: la app solo puede INSERTAR. No lee ni borra estas filas.

-- CreateTable
CREATE TABLE "community_pre_registrations" (
    "id" UUID NOT NULL,
    "kind" VARCHAR(20) NOT NULL,
    "business_name" VARCHAR(120) NOT NULL,
    "category" VARCHAR(60) NOT NULL,
    "city" VARCHAR(80) NOT NULL,
    "contact_name" VARCHAR(120) NOT NULL,
    "contact_email" VARCHAR(200) NOT NULL,
    "contact_phone" VARCHAR(30),
    "message" VARCHAR(500),
    "consent_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "community_pre_registrations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "community_pre_registrations_created_at_idx" ON "community_pre_registrations"("created_at");

-- LEAST-PRIVILEGE GRANTS: solo insertar desde la API pública.
GRANT INSERT ON "community_pre_registrations" TO adoptafacil_app;
REVOKE SELECT, UPDATE, DELETE, TRUNCATE ON "community_pre_registrations" FROM adoptafacil_app;
