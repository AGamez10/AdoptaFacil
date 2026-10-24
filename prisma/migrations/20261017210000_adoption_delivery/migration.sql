-- Ajuste 6 · M04 ACTA DE ENTREGA del animal con confirmación de las dos partes.
--
-- Solo agrega objetos propios de M04. La FK al contrato se modela en Prisma
-- (ambas tablas M04); la organización llega en cascada por el contrato.

-- CreateTable
CREATE TABLE "adoption_deliveries" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "contract_id" UUID NOT NULL,
    "request_id" UUID NOT NULL,
    "animal_id" UUID NOT NULL,
    "adopter_user_id" UUID NOT NULL,
    "adopter_name" TEXT NOT NULL,
    "adopter_email" TEXT NOT NULL,
    "animal_name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending_confirmation',
    "details" JSONB NOT NULL,
    "record" JSONB NOT NULL,
    "milestone_plan" JSONB NOT NULL,
    "content_hash" TEXT NOT NULL,
    "code_hash" TEXT,
    "code_expires_at" TIMESTAMP(3),
    "code_attempts" INTEGER NOT NULL DEFAULT 0,
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "confirmed_at" TIMESTAMP(3),

    CONSTRAINT "adoption_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "adoption_deliveries_organization_id_idx" ON "adoption_deliveries"("organization_id");
CREATE INDEX "adoption_deliveries_contract_id_idx" ON "adoption_deliveries"("contract_id");
CREATE INDEX "adoption_deliveries_adopter_user_id_idx" ON "adoption_deliveries"("adopter_user_id");

-- AddForeignKey
ALTER TABLE "adoption_deliveries" ADD CONSTRAINT "adoption_deliveries_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "adoption_contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Estados válidos (la máquina de estados vive en la API; esto es la red de seguridad).
ALTER TABLE "adoption_deliveries"
  ADD CONSTRAINT "adoption_deliveries_status_check"
  CHECK ("status" IN ('pending_confirmation', 'confirmed', 'cancelled'));

-- ============================================================================
-- ROW-LEVEL SECURITY (RNF03) — una organización solo ve SUS actas de entrega.
-- ============================================================================
ALTER TABLE "adoption_deliveries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "adoption_deliveries" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "adoption_deliveries"
  USING ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON "adoption_deliveries" TO adoptafacil_app;

-- ============================================================================
-- INMUTABILIDAD: un acta confirmada queda sellada para CUALQUIER rol (como el
-- contrato firmado). DELETE se permite solo para la cascada de la organización.
-- ============================================================================
CREATE OR REPLACE FUNCTION adoption_delivery_freeze()
  RETURNS trigger
  LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status = 'confirmed' THEN
    RAISE EXCEPTION 'adoption delivery % is confirmed and immutable', OLD.id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER adoption_delivery_freeze_tr
  BEFORE UPDATE ON "adoption_deliveries"
  FOR EACH ROW EXECUTE FUNCTION adoption_delivery_freeze();

-- ============================================================================
-- ACCESO CROSS-TENANT CONTROLADO — el ADOPTANTE (Persona) ve y confirma la
-- entrega de un animal de OTRA organización. Misma técnica que la firma del
-- contrato y el seguimiento: SECURITY DEFINER acotado a `adopter_user_id`, y
-- nunca expone el hash del código ni los intentos.
-- ============================================================================

CREATE OR REPLACE FUNCTION adoption_deliveries_for_adopter(p_user_id UUID, p_delivery_id UUID)
  RETURNS TABLE (
    "id" UUID,
    "organization_id" UUID,
    "contract_id" UUID,
    "request_id" UUID,
    "animal_id" UUID,
    "animal_name" TEXT,
    "status" TEXT,
    "details" JSONB,
    "record" JSONB,
    "milestone_plan" JSONB,
    "content_hash" TEXT,
    "code_expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3),
    "confirmed_at" TIMESTAMP(3)
  )
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT d."id", d."organization_id", d."contract_id", d."request_id", d."animal_id",
         d."animal_name", d."status", d."details", d."record", d."milestone_plan",
         d."content_hash", d."code_expires_at", d."created_at", d."confirmed_at"
  FROM "adoption_deliveries" d
  WHERE d."adopter_user_id" = p_user_id
    AND d."status" <> 'cancelled'
    AND (p_delivery_id IS NULL OR d."id" = p_delivery_id)
  ORDER BY d."created_at" DESC;
$$;

-- Confirmación del adoptante. Devuelve el resultado como texto:
-- confirmed | invalid_code | expired | locked | not_pending | already_confirmed | not_found.
-- Al confirmar, en la MISMA transacción: sella el acta, marca el animal como
-- adoptado, enlaza el seguimiento y programa los hitos del plan (si la
-- organización no había creado ninguno a mano para ese contrato).
CREATE OR REPLACE FUNCTION adoption_delivery_confirm(
  p_delivery_id UUID,
  p_user_id UUID,
  p_code_hash TEXT
)
  RETURNS TEXT
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  d "adoption_deliveries";
  item JSONB;
BEGIN
  SELECT * INTO d FROM "adoption_deliveries"
    WHERE "id" = p_delivery_id AND "adopter_user_id" = p_user_id
    FOR UPDATE;
  IF NOT FOUND THEN
    RETURN 'not_found';
  END IF;
  IF d."status" = 'confirmed' THEN
    RETURN 'already_confirmed';
  END IF;
  IF d."status" <> 'pending_confirmation' OR d."code_hash" IS NULL THEN
    RETURN 'not_pending';
  END IF;
  IF d."code_attempts" >= 5 THEN
    RETURN 'locked';
  END IF;
  IF d."code_expires_at" < CURRENT_TIMESTAMP THEN
    RETURN 'expired';
  END IF;
  IF d."code_hash" <> p_code_hash THEN
    UPDATE "adoption_deliveries"
      SET "code_attempts" = "code_attempts" + 1, "updated_at" = CURRENT_TIMESTAMP
      WHERE "id" = d."id";
    RETURN 'invalid_code';
  END IF;
  IF EXISTS (
    SELECT 1 FROM "adoption_deliveries"
    WHERE "contract_id" = d."contract_id" AND "status" = 'confirmed'
  ) THEN
    RETURN 'not_pending';
  END IF;

  UPDATE "adoption_deliveries"
    SET "status" = 'confirmed',
        "confirmed_at" = CURRENT_TIMESTAMP,
        "code_hash" = NULL,
        "code_expires_at" = NULL,
        "updated_at" = CURRENT_TIMESTAMP
    WHERE "id" = d."id";

  UPDATE "animals"
    SET "status" = 'adopted', "updated_at" = CURRENT_TIMESTAMP
    WHERE "id" = d."animal_id" AND "organization_id" = d."organization_id";

  UPDATE "adoption_requests"
    SET "tracking_ref" = d."contract_id"::text, "updated_at" = CURRENT_TIMESTAMP
    WHERE "id" = d."request_id" AND "tracking_ref" IS NULL;

  IF NOT EXISTS (
    SELECT 1 FROM "adoption_followup_milestones" WHERE "contract_id" = d."contract_id"
  ) THEN
    FOR item IN SELECT * FROM jsonb_array_elements(d."milestone_plan") LOOP
      INSERT INTO "adoption_followup_milestones" (
        "id", "organization_id", "contract_id", "request_id", "adopter_user_id",
        "adopter_name", "adopter_email", "title", "questionnaire", "due_at",
        "status", "updated_at"
      ) VALUES (
        gen_random_uuid(), d."organization_id", d."contract_id", d."request_id",
        d."adopter_user_id", d."adopter_name", d."adopter_email", item->>'title',
        '[]'::jsonb, CURRENT_TIMESTAMP + (item->>'offset')::interval,
        'scheduled', CURRENT_TIMESTAMP
      );
    END LOOP;
  END IF;

  RETURN 'confirmed';
END;
$$;

REVOKE ALL ON FUNCTION adoption_deliveries_for_adopter(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION adoption_delivery_confirm(UUID, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION adoption_deliveries_for_adopter(UUID, UUID) TO adoptafacil_app;
GRANT EXECUTE ON FUNCTION adoption_delivery_confirm(UUID, UUID, TEXT) TO adoptafacil_app;
