-- ============================================================================
-- Documentación, ingreso, custodia y guardería de animales.
--
-- Diez tablas de la organización, todas con RLS ENABLE + FORCE +
-- tenant_isolation. La app no tiene DELETE en ninguna: la historia no se
-- borra. Lo emitido es inmutable (triggers más abajo) y lo que se corrige se
-- anula con motivo.
--
-- Regla de negocio: una deuda no retiene al animal. No hay ningún CHECK,
-- trigger ni llave que condicione `custody_releases` (la salida) al estado de
-- `custody_charges` (la cuenta).
-- ============================================================================

-- CreateTable
CREATE TABLE "custody_responsibles" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "full_name" TEXT NOT NULL,
    "document_type" TEXT NOT NULL,
    "document_number" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "city" TEXT,
    "notes" TEXT,
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "custody_responsibles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "animal_intakes" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "animal_id" UUID NOT NULL,
    "responsible_id" UUID,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "intake_at" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "reason_detail" TEXT,
    "origin" TEXT,
    "physical_condition" TEXT NOT NULL,
    "particular_features" TEXT,
    "vaccination_status" TEXT NOT NULL DEFAULT 'unknown',
    "deworming_status" TEXT NOT NULL DEFAULT 'unknown',
    "preventive_notes" TEXT,
    "food_provided" TEXT,
    "medications_reported" TEXT,
    "notes" TEXT,
    "received_by_name" TEXT NOT NULL,
    "has_vet_assessment" BOOLEAN NOT NULL DEFAULT false,
    "vet_name" TEXT,
    "vet_license" TEXT,
    "vet_assessment_date" DATE,
    "is_retrospective" BOOLEAN NOT NULL DEFAULT false,
    "retrospective_source" TEXT,
    "snapshot" JSONB,
    "finalized_at" TIMESTAMP(3),
    "finalized_by_user_id" UUID,
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "animal_intakes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "custody_contract_templates" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "template_key" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "clauses" JSONB NOT NULL,
    "annexes" JSONB NOT NULL DEFAULT '[]',
    "archived_at" TIMESTAMP(3),
    "created_by_user_id" UUID NOT NULL,
    "created_by_name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "custody_contract_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "custody_contracts" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "animal_id" UUID NOT NULL,
    "responsible_id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "template_key" TEXT,
    "template_version" INTEGER,
    "template_name" TEXT NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "monthly_fee_cop" INTEGER NOT NULL,
    "food_fee_cop" INTEGER,
    "payment_frequency" TEXT NOT NULL DEFAULT 'monthly',
    "payment_day" INTEGER,
    "grace_days" INTEGER NOT NULL DEFAULT 0,
    "pickup_days" INTEGER NOT NULL DEFAULT 10,
    "notice_days" INTEGER NOT NULL DEFAULT 8,
    "service_city" TEXT,
    "payment_conditions" TEXT,
    "observations" TEXT,
    "representative" JSONB NOT NULL,
    "clauses" JSONB NOT NULL,
    "annexes" JSONB NOT NULL DEFAULT '[]',
    "snapshot" JSONB,
    "issued_at" TIMESTAMP(3),
    "issued_by_user_id" UUID,
    "signed_at" TIMESTAMP(3),
    "ended_at" TIMESTAMP(3),
    "ended_by_user_id" UUID,
    "end_reason" TEXT,
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "custody_contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "custody_charges" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "animal_id" UUID NOT NULL,
    "responsible_id" UUID NOT NULL,
    "contract_id" UUID,
    "concept" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount_cop" INTEGER NOT NULL,
    "due_date" DATE NOT NULL,
    "expense_date" DATE,
    "period_label" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "collection_started_at" TIMESTAMP(3),
    "collection_started_by" UUID,
    "cancelled_at" TIMESTAMP(3),
    "cancelled_by_user_id" UUID,
    "cancel_reason" TEXT,
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "custody_charges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "custody_charge_extensions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "charge_id" UUID NOT NULL,
    "previous_due_date" DATE NOT NULL,
    "new_due_date" DATE NOT NULL,
    "reason" TEXT NOT NULL,
    "requested_by" TEXT,
    "authorized_by_user_id" UUID NOT NULL,
    "authorized_by_name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "custody_charge_extensions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "custody_payments" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "charge_id" UUID NOT NULL,
    "receipt_number" TEXT NOT NULL,
    "amount_cop" INTEGER NOT NULL,
    "paid_on" DATE NOT NULL,
    "method" TEXT NOT NULL,
    "reference" TEXT,
    "notes" TEXT,
    "received_by_user_id" UUID NOT NULL,
    "received_by_name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "voided_at" TIMESTAMP(3),
    "voided_by_user_id" UUID,
    "void_reason" TEXT,

    CONSTRAINT "custody_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "custody_releases" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "animal_id" UUID NOT NULL,
    "release_type" TEXT NOT NULL,
    "released_at" TIMESTAMP(3) NOT NULL,
    "received_by_name" TEXT NOT NULL,
    "received_by_document" TEXT,
    "received_by_phone" TEXT,
    "received_by_relation" TEXT,
    "condition_at_release" TEXT NOT NULL,
    "notes" TEXT,
    "delivered_by_name" TEXT NOT NULL,
    "authority_name" TEXT,
    "authority_basis" TEXT,
    "decided_by_name" TEXT,
    "outstanding_balance_cop" INTEGER NOT NULL DEFAULT 0,
    "is_retrospective" BOOLEAN NOT NULL DEFAULT false,
    "retrospective_source" TEXT,
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "custody_releases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "custody_documents" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "animal_id" UUID,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "storage_ref" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "replaces_document_id" UUID,
    "document_date" DATE,
    "is_retrospective" BOOLEAN NOT NULL DEFAULT false,
    "retrospective_source" TEXT,
    "intake_id" UUID,
    "contract_id" UUID,
    "charge_id" UUID,
    "payment_id" UUID,
    "release_id" UUID,
    "extension_id" UUID,
    "responsible_id" UUID,
    "created_by_user_id" UUID NOT NULL,
    "created_by_name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "custody_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "custody_events" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "animal_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "detail" TEXT,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "is_retrospective" BOOLEAN NOT NULL DEFAULT false,
    "retrospective_source" TEXT,
    "document_id" UUID,
    "refs" JSONB NOT NULL DEFAULT '{}',
    "actor_user_id" UUID NOT NULL,
    "actor_name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "custody_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "custody_responsibles_organization_id_idx" ON "custody_responsibles"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "custody_responsibles_organization_id_document_type_document_key" ON "custody_responsibles"("organization_id", "document_type", "document_number");

-- CreateIndex
CREATE INDEX "animal_intakes_organization_id_idx" ON "animal_intakes"("organization_id");

-- CreateIndex
CREATE INDEX "animal_intakes_animal_id_intake_at_idx" ON "animal_intakes"("animal_id", "intake_at");

-- CreateIndex
CREATE INDEX "custody_contract_templates_organization_id_idx" ON "custody_contract_templates"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "custody_contract_templates_organization_id_template_key_ver_key" ON "custody_contract_templates"("organization_id", "template_key", "version");

-- CreateIndex
CREATE INDEX "custody_contracts_organization_id_idx" ON "custody_contracts"("organization_id");

-- CreateIndex
CREATE INDEX "custody_contracts_animal_id_idx" ON "custody_contracts"("animal_id");

-- CreateIndex
CREATE UNIQUE INDEX "custody_contracts_organization_id_number_key" ON "custody_contracts"("organization_id", "number");

-- CreateIndex
CREATE INDEX "custody_charges_organization_id_status_due_date_idx" ON "custody_charges"("organization_id", "status", "due_date");

-- CreateIndex
CREATE INDEX "custody_charges_animal_id_idx" ON "custody_charges"("animal_id");

-- CreateIndex
CREATE INDEX "custody_charges_responsible_id_idx" ON "custody_charges"("responsible_id");

-- CreateIndex
CREATE INDEX "custody_charge_extensions_organization_id_idx" ON "custody_charge_extensions"("organization_id");

-- CreateIndex
CREATE INDEX "custody_charge_extensions_charge_id_created_at_idx" ON "custody_charge_extensions"("charge_id", "created_at");

-- CreateIndex
CREATE INDEX "custody_payments_organization_id_idx" ON "custody_payments"("organization_id");

-- CreateIndex
CREATE INDEX "custody_payments_charge_id_idx" ON "custody_payments"("charge_id");

-- CreateIndex
CREATE UNIQUE INDEX "custody_payments_organization_id_receipt_number_key" ON "custody_payments"("organization_id", "receipt_number");

-- CreateIndex
CREATE INDEX "custody_releases_organization_id_idx" ON "custody_releases"("organization_id");

-- CreateIndex
CREATE INDEX "custody_releases_animal_id_released_at_idx" ON "custody_releases"("animal_id", "released_at");

-- CreateIndex
CREATE INDEX "custody_documents_organization_id_idx" ON "custody_documents"("organization_id");

-- CreateIndex
CREATE INDEX "custody_documents_animal_id_created_at_idx" ON "custody_documents"("animal_id", "created_at");

-- CreateIndex
CREATE INDEX "custody_documents_contract_id_idx" ON "custody_documents"("contract_id");

-- CreateIndex
CREATE INDEX "custody_documents_charge_id_idx" ON "custody_documents"("charge_id");

-- CreateIndex
CREATE INDEX "custody_documents_payment_id_idx" ON "custody_documents"("payment_id");

-- CreateIndex
CREATE INDEX "custody_documents_intake_id_idx" ON "custody_documents"("intake_id");

-- CreateIndex
CREATE INDEX "custody_events_organization_id_idx" ON "custody_events"("organization_id");

-- CreateIndex
CREATE INDEX "custody_events_animal_id_occurred_at_idx" ON "custody_events"("animal_id", "occurred_at");

-- AddForeignKey
ALTER TABLE "custody_responsibles" ADD CONSTRAINT "custody_responsibles_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "animal_intakes" ADD CONSTRAINT "animal_intakes_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "animal_intakes" ADD CONSTRAINT "animal_intakes_animal_id_fkey" FOREIGN KEY ("animal_id") REFERENCES "animals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "animal_intakes" ADD CONSTRAINT "animal_intakes_responsible_id_fkey" FOREIGN KEY ("responsible_id") REFERENCES "custody_responsibles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custody_contract_templates" ADD CONSTRAINT "custody_contract_templates_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custody_contracts" ADD CONSTRAINT "custody_contracts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custody_contracts" ADD CONSTRAINT "custody_contracts_animal_id_fkey" FOREIGN KEY ("animal_id") REFERENCES "animals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custody_contracts" ADD CONSTRAINT "custody_contracts_responsible_id_fkey" FOREIGN KEY ("responsible_id") REFERENCES "custody_responsibles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custody_charges" ADD CONSTRAINT "custody_charges_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custody_charges" ADD CONSTRAINT "custody_charges_animal_id_fkey" FOREIGN KEY ("animal_id") REFERENCES "animals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custody_charges" ADD CONSTRAINT "custody_charges_responsible_id_fkey" FOREIGN KEY ("responsible_id") REFERENCES "custody_responsibles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custody_charges" ADD CONSTRAINT "custody_charges_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "custody_contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custody_charge_extensions" ADD CONSTRAINT "custody_charge_extensions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custody_charge_extensions" ADD CONSTRAINT "custody_charge_extensions_charge_id_fkey" FOREIGN KEY ("charge_id") REFERENCES "custody_charges"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custody_payments" ADD CONSTRAINT "custody_payments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custody_payments" ADD CONSTRAINT "custody_payments_charge_id_fkey" FOREIGN KEY ("charge_id") REFERENCES "custody_charges"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custody_releases" ADD CONSTRAINT "custody_releases_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custody_releases" ADD CONSTRAINT "custody_releases_animal_id_fkey" FOREIGN KEY ("animal_id") REFERENCES "animals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custody_documents" ADD CONSTRAINT "custody_documents_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custody_documents" ADD CONSTRAINT "custody_documents_animal_id_fkey" FOREIGN KEY ("animal_id") REFERENCES "animals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custody_events" ADD CONSTRAINT "custody_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custody_events" ADD CONSTRAINT "custody_events_animal_id_fkey" FOREIGN KEY ("animal_id") REFERENCES "animals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ----------------------------------------------------------------------------
-- Reglas de valores
-- ----------------------------------------------------------------------------
ALTER TABLE "custody_responsibles" ADD CONSTRAINT "custody_responsibles_values_check"
  CHECK ("document_type" IN ('CC', 'CE', 'NIT', 'PA', 'TI', 'OTRO')
     AND char_length("full_name") BETWEEN 2 AND 160
     AND char_length("document_number") BETWEEN 3 AND 30);

ALTER TABLE "animal_intakes" ADD CONSTRAINT "animal_intakes_values_check"
  CHECK ("status" IN ('draft', 'finalized')
     AND "reason" IN ('boarding', 'rescue', 'owner_surrender', 'transfer', 'found', 'return', 'other')
     AND "vaccination_status" IN ('unknown', 'up_to_date', 'incomplete', 'none')
     AND "deworming_status" IN ('unknown', 'up_to_date', 'incomplete', 'none')
     AND char_length("physical_condition") BETWEEN 3 AND 3000
     AND char_length("received_by_name") BETWEEN 2 AND 160
     AND ("status" = 'draft' OR ("finalized_at" IS NOT NULL AND "snapshot" IS NOT NULL))
     -- Un registro hecho después de los hechos siempre dice de dónde sale.
     AND (NOT "is_retrospective" OR char_length(COALESCE("retrospective_source", '')) >= 5));

ALTER TABLE "custody_contract_templates" ADD CONSTRAINT "custody_contract_templates_values_check"
  CHECK ("version" >= 1
     AND char_length("name") BETWEEN 2 AND 160
     AND jsonb_typeof("clauses") = 'array'
     AND jsonb_typeof("annexes") = 'array');

ALTER TABLE "custody_contracts" ADD CONSTRAINT "custody_contracts_values_check"
  CHECK ("status" IN ('draft', 'issued', 'active', 'ended', 'cancelled')
     AND "payment_frequency" IN ('monthly', 'biweekly', 'weekly', 'one_time')
     AND "monthly_fee_cop" BETWEEN 0 AND 1000000000
     AND ("food_fee_cop" IS NULL OR "food_fee_cop" BETWEEN 0 AND 1000000000)
     AND ("payment_day" IS NULL OR "payment_day" BETWEEN 1 AND 28)
     AND "grace_days" BETWEEN 0 AND 60
     AND "pickup_days" BETWEEN 1 AND 90
     AND "notice_days" BETWEEN 0 AND 90
     AND ("end_date" IS NULL OR "end_date" >= "start_date")
     AND jsonb_typeof("clauses") = 'array'
     AND ("status" = 'draft' OR "status" = 'cancelled'
          OR ("issued_at" IS NOT NULL AND "snapshot" IS NOT NULL)));

ALTER TABLE "custody_charges" ADD CONSTRAINT "custody_charges_values_check"
  CHECK ("status" IN ('pending', 'paid', 'cancelled')
     AND "concept" IN ('boarding_fee', 'food', 'veterinary', 'transport', 'late_fee', 'other')
     AND "amount_cop" BETWEEN 1 AND 1000000000
     AND char_length("description") BETWEEN 3 AND 300
     AND ("status" <> 'cancelled' OR char_length(COALESCE("cancel_reason", '')) >= 5));

ALTER TABLE "custody_charge_extensions" ADD CONSTRAINT "custody_charge_extensions_values_check"
  CHECK ("new_due_date" > "previous_due_date"
     AND char_length("reason") BETWEEN 5 AND 300
     AND char_length("authorized_by_name") BETWEEN 2 AND 160);

ALTER TABLE "custody_payments" ADD CONSTRAINT "custody_payments_values_check"
  CHECK ("method" IN ('transfer', 'deposit', 'cash', 'other')
     AND "amount_cop" BETWEEN 1 AND 1000000000
     AND ("voided_at" IS NULL OR char_length(COALESCE("void_reason", '')) >= 5));

ALTER TABLE "custody_releases" ADD CONSTRAINT "custody_releases_values_check"
  CHECK ("release_type" IN ('return_to_responsible', 'adoption', 'transfer_to_organization',
                            'handover_to_authority', 'death', 'other')
     AND char_length("received_by_name") BETWEEN 2 AND 160
     AND char_length("delivered_by_name") BETWEEN 2 AND 160
     AND char_length("condition_at_release") BETWEEN 3 AND 3000
     AND "outstanding_balance_cop" >= 0
     -- Entregar a una autoridad es una decisión de una persona: queda quién
     -- decidió, a qué autoridad y con qué fundamento.
     AND ("release_type" <> 'handover_to_authority'
          OR (char_length(COALESCE("authority_name", '')) >= 3
              AND char_length(COALESCE("authority_basis", '')) >= 10
              AND char_length(COALESCE("decided_by_name", '')) >= 2))
     AND (NOT "is_retrospective" OR char_length(COALESCE("retrospective_source", '')) >= 5));

ALTER TABLE "custody_documents" ADD CONSTRAINT "custody_documents_values_check"
  CHECK ("source" IN ('generated', 'uploaded')
     AND "kind" IN ('intake_record', 'boarding_contract', 'payment_receipt', 'payment_extension',
                    'release_record', 'animal_report', 'account_statement', 'signed_contract',
                    'signed_record', 'bank_proof', 'expense_support', 'intake_photo',
                    'evidence_photo', 'vet_assessment', 'clinical_history', 'accounting_document',
                    'electronic_invoice', 'donation_support', 'identity_document', 'other')
     -- AdoptaFácil nunca GENERA una factura electrónica ni una historia clínica.
     AND ("source" = 'uploaded'
          OR "kind" IN ('intake_record', 'boarding_contract', 'payment_receipt',
                        'payment_extension', 'release_record', 'animal_report',
                        'account_statement'))
     AND "storage_ref" LIKE 'private/%'
     AND "sha256" ~ '^[0-9a-f]{64}$'
     AND "size_bytes" > 0
     AND "version" >= 1
     AND char_length("title") BETWEEN 2 AND 200
     AND (NOT "is_retrospective" OR char_length(COALESCE("retrospective_source", '')) >= 5));

ALTER TABLE "custody_events" ADD CONSTRAINT "custody_events_values_check"
  CHECK (char_length("type") BETWEEN 3 AND 60
     AND char_length("summary") BETWEEN 3 AND 300
     AND jsonb_typeof("refs") = 'object'
     AND (NOT "is_retrospective" OR char_length(COALESCE("retrospective_source", '')) >= 5));

-- ----------------------------------------------------------------------------
-- Inmutabilidad
-- ----------------------------------------------------------------------------

-- Solo inserción, también para el superusuario.
CREATE OR REPLACE FUNCTION custody_append_only()
  RETURNS TRIGGER
  LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME;
END;
$$;

-- Nada se borra (las pruebas limpian en modo réplica).
CREATE OR REPLACE FUNCTION custody_no_delete()
  RETURNS TRIGGER
  LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION '% rows are never deleted', TG_TABLE_NAME;
END;
$$;

CREATE TRIGGER custody_charge_extensions_append_only
  BEFORE UPDATE OR DELETE ON "custody_charge_extensions"
  FOR EACH ROW EXECUTE FUNCTION custody_append_only();
CREATE TRIGGER custody_charge_extensions_no_truncate
  BEFORE TRUNCATE ON "custody_charge_extensions"
  FOR EACH STATEMENT EXECUTE FUNCTION custody_append_only();

CREATE TRIGGER custody_releases_append_only
  BEFORE UPDATE OR DELETE ON "custody_releases"
  FOR EACH ROW EXECUTE FUNCTION custody_append_only();
CREATE TRIGGER custody_releases_no_truncate
  BEFORE TRUNCATE ON "custody_releases"
  FOR EACH STATEMENT EXECUTE FUNCTION custody_append_only();

CREATE TRIGGER custody_documents_append_only
  BEFORE UPDATE OR DELETE ON "custody_documents"
  FOR EACH ROW EXECUTE FUNCTION custody_append_only();
CREATE TRIGGER custody_documents_no_truncate
  BEFORE TRUNCATE ON "custody_documents"
  FOR EACH STATEMENT EXECUTE FUNCTION custody_append_only();

CREATE TRIGGER custody_events_append_only
  BEFORE UPDATE OR DELETE ON "custody_events"
  FOR EACH ROW EXECUTE FUNCTION custody_append_only();
CREATE TRIGGER custody_events_no_truncate
  BEFORE TRUNCATE ON "custody_events"
  FOR EACH STATEMENT EXECUTE FUNCTION custody_append_only();

CREATE TRIGGER animal_intakes_no_delete
  BEFORE DELETE ON "animal_intakes"
  FOR EACH ROW EXECUTE FUNCTION custody_no_delete();
CREATE TRIGGER custody_contract_templates_no_delete
  BEFORE DELETE ON "custody_contract_templates"
  FOR EACH ROW EXECUTE FUNCTION custody_no_delete();
CREATE TRIGGER custody_contracts_no_delete
  BEFORE DELETE ON "custody_contracts"
  FOR EACH ROW EXECUTE FUNCTION custody_no_delete();
CREATE TRIGGER custody_charges_no_delete
  BEFORE DELETE ON "custody_charges"
  FOR EACH ROW EXECUTE FUNCTION custody_no_delete();
CREATE TRIGGER custody_payments_no_delete
  BEFORE DELETE ON "custody_payments"
  FOR EACH ROW EXECUTE FUNCTION custody_no_delete();

-- Un acta finalizada no cambia; un borrador no cambia de animal ni de dueño.
CREATE OR REPLACE FUNCTION animal_intakes_guard()
  RETURNS TRIGGER
  LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD."status" = 'finalized' THEN
    RAISE EXCEPTION 'animal_intakes: a finalized intake record is immutable';
  END IF;
  IF NEW."organization_id" IS DISTINCT FROM OLD."organization_id"
     OR NEW."animal_id" IS DISTINCT FROM OLD."animal_id"
     OR NEW."created_by_user_id" IS DISTINCT FROM OLD."created_by_user_id"
     OR NEW."created_at" IS DISTINCT FROM OLD."created_at" THEN
    RAISE EXCEPTION 'animal_intakes: animal and origin of the record are immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER animal_intakes_guard
  BEFORE UPDATE ON "animal_intakes"
  FOR EACH ROW EXECUTE FUNCTION animal_intakes_guard();

-- Una versión de plantilla no cambia: solo se archiva.
CREATE OR REPLACE FUNCTION custody_contract_templates_guard()
  RETURNS TRIGGER
  LANGUAGE plpgsql
AS $$
BEGIN
  IF (to_jsonb(NEW) - 'archived_at') IS DISTINCT FROM (to_jsonb(OLD) - 'archived_at') THEN
    RAISE EXCEPTION 'custody_contract_templates: a template version is immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER custody_contract_templates_guard
  BEFORE UPDATE ON "custody_contract_templates"
  FOR EACH ROW EXECUTE FUNCTION custody_contract_templates_guard();

-- Emitido un contrato, sus términos quedan fijos: solo avanza el estado, con
-- la fecha de firma y los datos de terminación. No vuelve a borrador.
CREATE OR REPLACE FUNCTION custody_contracts_guard()
  RETURNS TRIGGER
  LANGUAGE plpgsql
AS $$
DECLARE
  mutable TEXT[] := ARRAY['status', 'signed_at', 'ended_at', 'ended_by_user_id',
                          'end_reason', 'updated_at'];
BEGIN
  IF NEW."organization_id" IS DISTINCT FROM OLD."organization_id"
     OR NEW."animal_id" IS DISTINCT FROM OLD."animal_id"
     OR NEW."number" IS DISTINCT FROM OLD."number" THEN
    RAISE EXCEPTION 'custody_contracts: owner, animal and number are immutable';
  END IF;
  IF OLD."status" IN ('ended', 'cancelled') THEN
    RAISE EXCEPTION 'custody_contracts: a closed contract is immutable';
  END IF;
  IF OLD."status" <> 'draft' THEN
    IF NEW."status" = 'draft' THEN
      RAISE EXCEPTION 'custody_contracts: an issued contract cannot go back to draft';
    END IF;
    IF (to_jsonb(NEW) - mutable) IS DISTINCT FROM (to_jsonb(OLD) - mutable) THEN
      RAISE EXCEPTION 'custody_contracts: the terms of an issued contract are immutable';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER custody_contracts_guard
  BEFORE UPDATE ON "custody_contracts"
  FOR EACH ROW EXECUTE FUNCTION custody_contracts_guard();

-- Un cobro no cambia de valor ni de fecha: solo de estado, y deja constancia
-- de la anulación o de que una persona inició el cobro formal.
CREATE OR REPLACE FUNCTION custody_charges_guard()
  RETURNS TRIGGER
  LANGUAGE plpgsql
AS $$
DECLARE
  mutable TEXT[] := ARRAY['status', 'collection_started_at', 'collection_started_by',
                          'cancelled_at', 'cancelled_by_user_id', 'cancel_reason', 'updated_at'];
BEGIN
  IF (to_jsonb(NEW) - mutable) IS DISTINCT FROM (to_jsonb(OLD) - mutable) THEN
    RAISE EXCEPTION 'custody_charges: amount, due date and parties are immutable';
  END IF;
  IF OLD."status" = 'cancelled' THEN
    RAISE EXCEPTION 'custody_charges: a cancelled charge is immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER custody_charges_guard
  BEFORE UPDATE ON "custody_charges"
  FOR EACH ROW EXECUTE FUNCTION custody_charges_guard();

-- Un pago solo puede anularse, una vez.
CREATE OR REPLACE FUNCTION custody_payments_guard()
  RETURNS TRIGGER
  LANGUAGE plpgsql
AS $$
DECLARE
  mutable TEXT[] := ARRAY['voided_at', 'voided_by_user_id', 'void_reason'];
BEGIN
  IF OLD."voided_at" IS NOT NULL THEN
    RAISE EXCEPTION 'custody_payments: a voided payment is immutable';
  END IF;
  IF (to_jsonb(NEW) - mutable) IS DISTINCT FROM (to_jsonb(OLD) - mutable) THEN
    RAISE EXCEPTION 'custody_payments: a payment is immutable, it can only be voided';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER custody_payments_guard
  BEFORE UPDATE ON "custody_payments"
  FOR EACH ROW EXECUTE FUNCTION custody_payments_guard();

-- ----------------------------------------------------------------------------
-- RLS + permisos del rol de runtime
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'custody_responsibles', 'animal_intakes', 'custody_contract_templates',
    'custody_contracts', 'custody_charges', 'custody_charge_extensions',
    'custody_payments', 'custody_releases', 'custody_documents', 'custody_events'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I '
      'USING ("organization_id" = NULLIF(current_setting(''app.current_org_id'', true), '''')::uuid) '
      'WITH CHECK ("organization_id" = NULLIF(current_setting(''app.current_org_id'', true), '''')::uuid)',
      t);
  END LOOP;
END
$$;

-- Sin DELETE en ninguna. Solo inserción donde la fila nunca cambia.
GRANT SELECT, INSERT, UPDATE ON "custody_responsibles" TO adoptafacil_app;
GRANT SELECT, INSERT, UPDATE ON "animal_intakes" TO adoptafacil_app;
GRANT SELECT, INSERT, UPDATE ON "custody_contract_templates" TO adoptafacil_app;
GRANT SELECT, INSERT, UPDATE ON "custody_contracts" TO adoptafacil_app;
GRANT SELECT, INSERT, UPDATE ON "custody_charges" TO adoptafacil_app;
GRANT SELECT, INSERT, UPDATE ON "custody_payments" TO adoptafacil_app;
GRANT SELECT, INSERT ON "custody_charge_extensions" TO adoptafacil_app;
GRANT SELECT, INSERT ON "custody_releases" TO adoptafacil_app;
GRANT SELECT, INSERT ON "custody_documents" TO adoptafacil_app;
GRANT SELECT, INSERT ON "custody_events" TO adoptafacil_app;
