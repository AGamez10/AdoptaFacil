-- ============================================================================
-- Trabajo del equipo por cargo (decisión del dueño, 2026-11-22).
--
-- 1. animals: "apto para adopción" (lo marca el veterinario; no publica).
-- 2. member_permission_grants: permiso expreso por persona (hoy solo
--    `animals.publish`, que el Owner/Administrator le da a un veterinario).
-- 3. team_assignments: tareas y animales a cargo de una persona del equipo.
-- 4. animal_care_logs: bitácora de cuidados (solo inserción).
--
-- Las tres tablas nuevas tienen RLS ENABLE + FORCE + tenant_isolation. Todo es
-- aditivo: ninguna columna ni tabla existente cambia de tipo ni se borra.
-- ============================================================================

-- AlterTable
ALTER TABLE "animals" ADD COLUMN     "adoption_ready_at" TIMESTAMP(3),
ADD COLUMN     "adoption_ready_by_user_id" UUID,
ADD COLUMN     "adoption_ready_note" TEXT;

-- AlterTable
ALTER TABLE "platform_settings" ALTER COLUMN "updated_at" DROP DEFAULT;

-- CreateTable
CREATE TABLE "member_permission_grants" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "permission" TEXT NOT NULL,
    "granted_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "member_permission_grants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_assignments" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "assignee_user_id" UUID NOT NULL,
    "animal_id" UUID,
    "title" TEXT NOT NULL,
    "details" TEXT,
    "due_date" DATE,
    "status" TEXT NOT NULL DEFAULT 'open',
    "created_by_user_id" UUID NOT NULL,
    "completed_at" TIMESTAMP(3),
    "completed_by_user_id" UUID,
    "completion_note" TEXT,
    "cancelled_at" TIMESTAMP(3),
    "cancelled_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "team_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "animal_care_logs" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "animal_id" UUID NOT NULL,
    "author_user_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "note" TEXT,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "animal_care_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "member_permission_grants_organization_id_idx" ON "member_permission_grants"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "member_permission_grants_organization_id_user_id_permission_key" ON "member_permission_grants"("organization_id", "user_id", "permission");

-- CreateIndex
CREATE INDEX "team_assignments_organization_id_assignee_user_id_status_idx" ON "team_assignments"("organization_id", "assignee_user_id", "status");

-- CreateIndex
CREATE INDEX "team_assignments_animal_id_idx" ON "team_assignments"("animal_id");

-- CreateIndex
CREATE INDEX "animal_care_logs_organization_id_idx" ON "animal_care_logs"("organization_id");

-- CreateIndex
CREATE INDEX "animal_care_logs_animal_id_occurred_at_idx" ON "animal_care_logs"("animal_id", "occurred_at");

-- AddForeignKey
ALTER TABLE "member_permission_grants" ADD CONSTRAINT "member_permission_grants_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_assignments" ADD CONSTRAINT "team_assignments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_assignments" ADD CONSTRAINT "team_assignments_animal_id_fkey" FOREIGN KEY ("animal_id") REFERENCES "animals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "animal_care_logs" ADD CONSTRAINT "animal_care_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "animal_care_logs" ADD CONSTRAINT "animal_care_logs_animal_id_fkey" FOREIGN KEY ("animal_id") REFERENCES "animals"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ----------------------------------------------------------------------------
-- Valores cerrados
-- ----------------------------------------------------------------------------
ALTER TABLE "member_permission_grants"
  ADD CONSTRAINT "member_permission_grants_permission_check"
  CHECK ("permission" IN ('animals.publish'));

ALTER TABLE "team_assignments"
  ADD CONSTRAINT "team_assignments_values_check"
  CHECK ("kind" IN ('task', 'animal_care')
     AND "status" IN ('open', 'done', 'cancelled')
     AND ("kind" <> 'animal_care' OR "animal_id" IS NOT NULL)
     AND char_length("title") BETWEEN 2 AND 160
     AND ("details" IS NULL OR char_length("details") <= 2000)
     AND ("completion_note" IS NULL OR char_length("completion_note") <= 1000));

ALTER TABLE "animal_care_logs"
  ADD CONSTRAINT "animal_care_logs_values_check"
  CHECK ("kind" IN ('walk', 'feeding', 'cleaning', 'observation')
     AND ("note" IS NULL OR char_length("note") <= 1000));

ALTER TABLE "animals"
  ADD CONSTRAINT "animals_adoption_ready_check"
  CHECK (("adoption_ready_at" IS NULL) = ("adoption_ready_by_user_id" IS NULL)
     AND ("adoption_ready_note" IS NULL OR char_length("adoption_ready_note") <= 500));

-- ----------------------------------------------------------------------------
-- Bitácora de cuidados: solo inserción, también para el superusuario.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION animal_care_logs_append_only()
  RETURNS TRIGGER
  LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME;
END;
$$;

CREATE TRIGGER animal_care_logs_append_only
  BEFORE UPDATE OR DELETE ON "animal_care_logs"
  FOR EACH ROW EXECUTE FUNCTION animal_care_logs_append_only();
CREATE TRIGGER animal_care_logs_no_truncate
  BEFORE TRUNCATE ON "animal_care_logs"
  FOR EACH STATEMENT EXECUTE FUNCTION animal_care_logs_append_only();

-- ----------------------------------------------------------------------------
-- RLS
-- ----------------------------------------------------------------------------
ALTER TABLE "member_permission_grants" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "member_permission_grants" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "member_permission_grants"
  USING ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

ALTER TABLE "team_assignments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "team_assignments" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "team_assignments"
  USING ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

ALTER TABLE "animal_care_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "animal_care_logs" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "animal_care_logs"
  USING ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

-- Quitar un permiso expreso borra su fila (la auditoría guarda el hecho). Las
-- tareas nunca se borran y la bitácora es solo inserción.
GRANT SELECT, INSERT, DELETE ON "member_permission_grants" TO adoptafacil_app;
GRANT SELECT, INSERT, UPDATE ON "team_assignments" TO adoptafacil_app;
GRANT SELECT, INSERT ON "animal_care_logs" TO adoptafacil_app;
