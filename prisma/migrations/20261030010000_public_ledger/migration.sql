-- ============================================================================
-- RF14 · Libro público de transparencia.
--
-- La organización registra a mano lo que recibe y lo que gasta (el MVP no
-- integra pasarela de pagos). Reglas que se cumplen EN LA BASE, no solo en la API:
--
--   1. Tenant-scoped: RLS ENABLE + FORCE + tenant_isolation.
--   2. Inmutable: la app solo tiene INSERT y SELECT, más UPDATE sobre las tres
--      columnas de anulación. El trigger además exige que la fila esté vigente,
--      que la anulación traiga motivo y que ninguna otra columna cambie. Nadie
--      (ni un superusuario) puede borrar un movimiento.
--   3. Las donaciones pagadas en línea entran solas (vista `ledger_movements`).
--   4. Lectura pública por una función SECURITY DEFINER acotada que expone
--      SOLO columnas públicas: nunca quién lo registró, ni el soporte (factura),
--      ni el nombre del archivo. Los anulados se muestran como anulados y no
--      suman en los totales.
--   5. Habeas Data: el ingreso nunca lleva contraparte (CHECK). En un gasto la
--      contraparte es el proveedor (empresa/comercio).
-- ============================================================================

CREATE TABLE "ledger_entries" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "occurred_on" DATE NOT NULL,
    "amount_cop" BIGINT NOT NULL,
    "concept" TEXT NOT NULL,
    "counterparty" TEXT,
    "support_storage_ref" TEXT,
    "support_filename" TEXT,
    "support_content_type" TEXT,
    "support_size_bytes" INTEGER,
    "client_request_id" UUID,
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "voided_at" TIMESTAMP(3),
    "voided_by_user_id" UUID,
    "void_reason" TEXT,

    CONSTRAINT "ledger_entries_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ledger_entries_kind_check" CHECK ("kind" IN ('income', 'expense')),
    CONSTRAINT "ledger_entries_category_check" CHECK (
      ("kind" = 'income' AND "category" IN
        ('donacion_dinero', 'donacion_especie', 'evento', 'venta', 'apadrinamiento', 'otro_ingreso'))
      OR
      ("kind" = 'expense' AND "category" IN
        ('veterinaria', 'alimento', 'medicamentos', 'esterilizacion', 'arriendo_servicios',
         'transporte', 'personal', 'insumos', 'otro_gasto'))
    ),
    CONSTRAINT "ledger_entries_amount_check" CHECK ("amount_cop" > 0 AND "amount_cop" <= 10000000000),
    CONSTRAINT "ledger_entries_concept_check" CHECK (char_length(btrim("concept")) BETWEEN 3 AND 140),
    CONSTRAINT "ledger_entries_counterparty_check" CHECK (
      "counterparty" IS NULL OR ("kind" = 'expense' AND char_length("counterparty") <= 120)
    ),
    CONSTRAINT "ledger_entries_void_check" CHECK (
      ("voided_at" IS NULL AND "voided_by_user_id" IS NULL AND "void_reason" IS NULL)
      OR ("voided_at" IS NOT NULL AND "voided_by_user_id" IS NOT NULL
          AND char_length(btrim("void_reason")) BETWEEN 10 AND 300)
    )
);

-- Idempotencia del registro (un reintento devuelve el mismo movimiento).
CREATE UNIQUE INDEX "ledger_entries_organization_id_client_request_id_key" ON "ledger_entries"("organization_id", "client_request_id");
CREATE INDEX "ledger_entries_organization_id_occurred_on_idx" ON "ledger_entries"("organization_id", "occurred_on");

ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ROW-LEVEL SECURITY (RNF03)
ALTER TABLE "ledger_entries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ledger_entries" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ledger_entries"
  USING ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

GRANT SELECT, INSERT ON "ledger_entries" TO adoptafacil_app;
REVOKE UPDATE, DELETE, TRUNCATE ON "ledger_entries" FROM adoptafacil_app;
GRANT UPDATE ("voided_at", "voided_by_user_id", "void_reason") ON "ledger_entries" TO adoptafacil_app;

-- Inmutabilidad: solo se permite anular UNA vez una fila vigente.
CREATE OR REPLACE FUNCTION ledger_entries_guard_mutation() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.voided_at IS NOT NULL THEN
      RAISE EXCEPTION 'ledger_entries: el movimiento ya está anulado'
        USING ERRCODE = 'restrict_violation';
    END IF;
    IF NEW.voided_at IS NULL
       OR (NEW.id, NEW.organization_id, NEW.kind, NEW.category, NEW.occurred_on, NEW.amount_cop,
           NEW.concept, NEW.counterparty, NEW.support_storage_ref, NEW.support_filename,
           NEW.support_content_type, NEW.support_size_bytes, NEW.client_request_id,
           NEW.created_by_user_id, NEW.created_at)
          IS DISTINCT FROM
          (OLD.id, OLD.organization_id, OLD.kind, OLD.category, OLD.occurred_on, OLD.amount_cop,
           OLD.concept, OLD.counterparty, OLD.support_storage_ref, OLD.support_filename,
           OLD.support_content_type, OLD.support_size_bytes, OLD.client_request_id,
           OLD.created_by_user_id, OLD.created_at)
    THEN
      RAISE EXCEPTION 'ledger_entries es inmutable: solo se permite anular un movimiento'
        USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'ledger_entries es inmutable: % no está permitido', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE TRIGGER ledger_entries_guard_update
  BEFORE UPDATE ON "ledger_entries"
  FOR EACH ROW EXECUTE FUNCTION ledger_entries_guard_mutation();

CREATE TRIGGER ledger_entries_no_delete
  BEFORE DELETE ON "ledger_entries"
  FOR EACH ROW EXECUTE FUNCTION ledger_entries_guard_mutation();

CREATE TRIGGER ledger_entries_no_truncate
  BEFORE TRUNCATE ON "ledger_entries"
  FOR EACH STATEMENT EXECUTE FUNCTION ledger_entries_guard_mutation();

-- ============================================================================
-- Vista única del libro: movimientos manuales + donaciones pagadas en línea.
--
-- Las donaciones aprobadas por la pasarela entran SOLAS al libro, sin copiar
-- filas: se leen de `donations` + `donation_receipts` (la donación aprobada
-- siempre tiene recibo). Así no hay doble escritura que se pueda desincronizar
-- y un webhook repetido no duplica nada (la donación ya es idempotente). El
-- monto es el NETO que recibe la organización (`intended_amount`). Nunca sale
-- el donante.
--
-- `security_invoker`: quien consulta la vista sigue sujeto a la RLS de las
-- tablas de abajo (la organización solo ve lo suyo).
-- ============================================================================
CREATE VIEW ledger_movements WITH (security_invoker = true) AS
  SELECT
    e.id,
    e.organization_id,
    'manual'::text AS source,
    e.kind,
    e.category,
    e.occurred_on,
    e.amount_cop,
    e.concept,
    e.counterparty,
    (e.support_storage_ref IS NOT NULL) AS has_support,
    e.support_filename,
    e.created_at,
    e.voided_at,
    e.void_reason
  FROM ledger_entries e
  UNION ALL
  SELECT
    r.id,
    d.organization_id,
    'online_donation'::text AS source,
    'income'::text AS kind,
    'donacion_dinero'::text AS category,
    ((r.issued_at AT TIME ZONE 'UTC') AT TIME ZONE 'America/Bogota')::date AS occurred_on,
    d.intended_amount::bigint AS amount_cop,
    CASE WHEN d.concept_kind = 'campaign' AND c.title IS NOT NULL
         THEN left('Donación en línea · ' || c.title, 140)
         ELSE 'Donación en línea' END AS concept,
    NULL::text AS counterparty,
    true AS has_support,
    NULL::text AS support_filename,
    r.issued_at AS created_at,
    NULL::timestamp(3) AS voided_at,
    NULL::text AS void_reason
  FROM donations d
  JOIN donation_receipts r ON r.donation_id = d.id
  LEFT JOIN campaigns c ON d.concept_kind = 'campaign' AND c.id = d.concept_id
  WHERE d.status = 'approved';

GRANT SELECT ON ledger_movements TO adoptafacil_app;

-- ============================================================================
-- Lectura pública. Recibe el id ya resuelto por `organization_public(slug)`
-- (que solo devuelve organizaciones con portal público), igual que
-- `public_approved_reviews`. Solo columnas públicas: nunca quién lo registró,
-- ni el soporte, ni el nombre del archivo, ni el donante.
-- ============================================================================
CREATE OR REPLACE FUNCTION public_ledger_entries(p_org_id uuid, p_limit int, p_offset int)
  RETURNS JSONB
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'items', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', m.id,
        'source', m.source,
        'kind', m.kind,
        'category', m.category,
        'occurredOn', to_char(m.occurred_on, 'YYYY-MM-DD'),
        'amountCop', m.amount_cop,
        'concept', m.concept,
        'counterparty', m.counterparty,
        'hasSupport', m.has_support,
        'createdAt', to_char(m.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'voided', m.voided_at IS NOT NULL,
        'voidReason', m.void_reason
      ) ORDER BY m.occurred_on DESC, m.created_at DESC)
      FROM (
        SELECT * FROM ledger_movements
        WHERE organization_id = p_org_id
        ORDER BY occurred_on DESC, created_at DESC
        LIMIT LEAST(GREATEST(p_limit, 1), 100) OFFSET GREATEST(p_offset, 0)
      ) m
    ), '[]'::jsonb),
    'total', (SELECT count(*) FROM ledger_movements WHERE organization_id = p_org_id),
    'totals', (
      SELECT jsonb_build_object(
        'incomeCop', COALESCE(sum(amount_cop) FILTER (WHERE kind = 'income'), 0),
        'expenseCop', COALESCE(sum(amount_cop) FILTER (WHERE kind = 'expense'), 0),
        'entryCount', count(*),
        'lastEntryOn', to_char(max(occurred_on), 'YYYY-MM-DD')
      )
      FROM ledger_movements
      WHERE organization_id = p_org_id AND voided_at IS NULL
    )
  );
$$;

REVOKE ALL ON FUNCTION public_ledger_entries(uuid, int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public_ledger_entries(uuid, int, int) TO adoptafacil_app;
