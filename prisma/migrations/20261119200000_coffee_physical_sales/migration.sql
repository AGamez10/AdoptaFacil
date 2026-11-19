-- ============================================================================
-- Café: ventas físicas por lote (feria, punto de venta, entrega en mano).
--
-- Cada lote llega con unidades exactas, así que las bolsas que se venden en
-- persona también se registran: descuentan stock del lote (nunca por encima de
-- lo disponible), suman su aporte (20 % del margen bruto, la misma regla del
-- lote) a la campaña que eligió el comprador o, si no eligió, a la sugerida
-- del lote, y quedan en la bitácora.
--
-- Solo inserción, también para el superusuario. Una venta mal registrada se
-- corrige con un reverso que la anula por completo (cantidad y montos en
-- negativo, mismo lote, precio y campaña, con su motivo), una sola vez.
-- La suma de las filas es lo vendido de verdad. Sin datos del comprador.
-- ============================================================================

CREATE TABLE "coffee_physical_sales" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "lot_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "reverses_sale_id" UUID,
    "quantity" INTEGER NOT NULL,
    "unit_price_cop" INTEGER NOT NULL,
    "total_cop" INTEGER NOT NULL,
    "contribution_per_unit_cop" INTEGER NOT NULL,
    "contribution_total_cop" INTEGER NOT NULL,
    "campaign_id" UUID NOT NULL,
    "campaign_title" TEXT NOT NULL,
    "campaign_org_name" TEXT NOT NULL,
    "campaign_source" TEXT NOT NULL,
    "sold_on" DATE NOT NULL,
    "note" TEXT,
    "created_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coffee_physical_sales_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "coffee_physical_sales_organization_id_idx" ON "coffee_physical_sales"("organization_id");

CREATE INDEX "coffee_physical_sales_lot_id_idx" ON "coffee_physical_sales"("lot_id");

CREATE UNIQUE INDEX "coffee_physical_sales_id_organization_id_key" ON "coffee_physical_sales"("id", "organization_id");

CREATE UNIQUE INDEX "coffee_physical_sales_reverses_sale_id_organization_id_key" ON "coffee_physical_sales"("reverses_sale_id", "organization_id");

ALTER TABLE "coffee_physical_sales" ADD CONSTRAINT "coffee_physical_sales_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "coffee_physical_sales" ADD CONSTRAINT "coffee_physical_sales_lot_id_organization_id_fkey" FOREIGN KEY ("lot_id", "organization_id") REFERENCES "coffee_lots"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "coffee_physical_sales" ADD CONSTRAINT "coffee_physical_sales_reverses_sale_id_organization_id_fkey" FOREIGN KEY ("reverses_sale_id", "organization_id") REFERENCES "coffee_physical_sales"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ----------------------------------------------------------------------------
-- Reglas de valores
-- ----------------------------------------------------------------------------
ALTER TABLE "coffee_physical_sales" ADD CONSTRAINT "coffee_physical_sales_values_check"
  CHECK ("kind" IN ('sale', 'reversal')
     AND ("kind" = 'sale') = ("reverses_sale_id" IS NULL)
     AND ("kind" = 'sale') = ("quantity" > 0)
     AND "quantity" BETWEEN -1000000 AND 1000000
     AND "quantity" <> 0
     AND "unit_price_cop" BETWEEN 1 AND 100000000
     AND "total_cop" = "unit_price_cop" * "quantity"
     AND "contribution_per_unit_cop" >= 0
     AND "contribution_total_cop" = "contribution_per_unit_cop" * "quantity"
     AND "campaign_source" IN ('buyer', 'lot_default')
     AND char_length("campaign_title") BETWEEN 1 AND 300
     AND char_length("campaign_org_name") BETWEEN 1 AND 300
     AND ("note" IS NULL OR char_length("note") BETWEEN 1 AND 500)
     AND ("kind" = 'sale' OR char_length("note") >= 3));

-- ----------------------------------------------------------------------------
-- Inmutabilidad y coherencia
-- ----------------------------------------------------------------------------

-- Solo inserción: ni UPDATE ni DELETE ni TRUNCATE, para ningún rol.
CREATE OR REPLACE FUNCTION coffee_physical_sales_append_only()
  RETURNS TRIGGER
  LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'coffee_physical_sales is append-only: correct a sale with a reversal';
END;
$$;

CREATE TRIGGER coffee_physical_sales_append_only
  BEFORE UPDATE OR DELETE ON "coffee_physical_sales"
  FOR EACH ROW EXECUTE FUNCTION coffee_physical_sales_append_only();

CREATE TRIGGER coffee_physical_sales_no_truncate
  BEFORE TRUNCATE ON "coffee_physical_sales"
  FOR EACH STATEMENT EXECUTE FUNCTION coffee_physical_sales_append_only();

-- Al insertar: una venta solo en un lote publicado (a la venta o en pausa) y
-- nunca por encima de las bolsas disponibles; un reverso espeja exactamente la
-- venta que anula. El candado del lote serializa ventas físicas, checkout y
-- pagos (mismo orden: primero el lote).
CREATE OR REPLACE FUNCTION coffee_physical_sales_guard()
  RETURNS TRIGGER
  LANGUAGE plpgsql
AS $$
DECLARE
  v_status TEXT;
  s coffee_physical_sales%ROWTYPE;
BEGIN
  SELECT status INTO v_status FROM coffee_lots
    WHERE id = NEW."lot_id" AND organization_id = NEW."organization_id"
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'coffee_physical_sales: unknown lot';
  END IF;

  IF NEW."kind" = 'sale' THEN
    IF v_status NOT IN ('on_sale', 'paused') THEN
      RAISE EXCEPTION 'coffee_physical_sales: the lot is not published';
    END IF;
    IF NEW."quantity" > coffee_lot_available(NEW."lot_id") THEN
      RAISE EXCEPTION 'coffee_physical_sales: not enough bags left in the lot';
    END IF;
    RETURN NEW;
  END IF;

  SELECT * INTO s FROM coffee_physical_sales
    WHERE id = NEW."reverses_sale_id" AND organization_id = NEW."organization_id";
  IF NOT FOUND OR s."kind" <> 'sale'
     OR s."lot_id" <> NEW."lot_id"
     OR s."quantity" <> -NEW."quantity"
     OR s."unit_price_cop" <> NEW."unit_price_cop"
     OR s."contribution_per_unit_cop" <> NEW."contribution_per_unit_cop"
     OR s."campaign_id" <> NEW."campaign_id"
     OR s."campaign_title" <> NEW."campaign_title"
     OR s."campaign_org_name" <> NEW."campaign_org_name"
     OR s."campaign_source" <> NEW."campaign_source"
     OR s."sold_on" <> NEW."sold_on" THEN
    RAISE EXCEPTION 'coffee_physical_sales: a reversal must mirror the sale it cancels';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER coffee_physical_sales_guard
  BEFORE INSERT ON "coffee_physical_sales"
  FOR EACH ROW EXECUTE FUNCTION coffee_physical_sales_guard();

-- ----------------------------------------------------------------------------
-- RLS + permisos del rol de runtime (sin UPDATE ni DELETE)
-- ----------------------------------------------------------------------------
ALTER TABLE "coffee_physical_sales" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "coffee_physical_sales" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "coffee_physical_sales"
  USING ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

GRANT SELECT, INSERT ON "coffee_physical_sales" TO adoptafacil_app;

-- ----------------------------------------------------------------------------
-- Disponibilidad e impacto público cuentan también las ventas físicas
-- ----------------------------------------------------------------------------

-- Bolsas que todavía se pueden vender: stock − pagadas − apartadas vigentes −
-- vendidas en persona (neto de reversos).
CREATE OR REPLACE FUNCTION coffee_lot_available(p_lot UUID)
  RETURNS INTEGER
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
  SELECT GREATEST(
    l.stock_units
    - COALESCE((
      SELECT sum(o.quantity)::int FROM coffee_orders o
      WHERE o.lot_id = l.id
        AND (o.status = 'paid' OR (o.status = 'pending' AND o.reserved_until > now()))
    ), 0)
    - COALESCE((
      SELECT sum(s.quantity)::int FROM coffee_physical_sales s WHERE s.lot_id = l.id
    ), 0),
    0)
  FROM coffee_lots l
  WHERE l.id = p_lot;
$$;

-- Igual que en 20261108030000_coffee_lots; el impacto público suma las bolsas
-- vendidas en persona y su aporte.
CREATE OR REPLACE FUNCTION coffee_public_offer(p_code TEXT, p_source TEXT)
  RETURNS JSONB
  LANGUAGE plpgsql
  VOLATILE
  SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
DECLARE
  p coffee_products%ROWTYPE;
  l coffee_lots%ROWTYPE;
  v_available INTEGER := 0;
  v_lot JSONB := NULL;
  v_sold INTEGER;
  v_committed BIGINT;
  v_sold_physical INTEGER;
  v_committed_physical BIGINT;
  v_delivered BIGINT;
BEGIN
  IF p_code IS NULL OR p_code !~ '^[a-hjkmnp-z2-9]{8}$' THEN
    RETURN NULL;
  END IF;
  SELECT * INTO p FROM coffee_products WHERE code = p_code AND is_active = TRUE;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  INSERT INTO coffee_visit_days ("organization_id", "product_id", "day", "source", "visits")
    VALUES (p.organization_id, p.id, (now() AT TIME ZONE 'UTC')::date,
            CASE WHEN p_source = 'qr' THEN 'qr' ELSE 'web' END, 1)
    ON CONFLICT ("organization_id", "product_id", "day", "source")
    DO UPDATE SET "visits" = coffee_visit_days."visits" + 1;

  -- El lote más antiguo a la venta con bolsas; si todos se agotaron, el último.
  SELECT * INTO l FROM coffee_lots
    WHERE product_id = p.id AND status = 'on_sale' AND coffee_lot_available(id) > 0
    ORDER BY published_at ASC NULLS LAST, created_at ASC
    LIMIT 1;
  IF NOT FOUND THEN
    SELECT * INTO l FROM coffee_lots
      WHERE product_id = p.id AND status = 'on_sale'
      ORDER BY published_at DESC NULLS LAST
      LIMIT 1;
  END IF;
  IF FOUND THEN
    v_available := coffee_lot_available(l.id);
    v_lot := jsonb_build_object(
      'id', l.id,
      'lotCode', l.lot_code,
      'salePriceCop', l.sale_price_cop,
      'shippingFeeCop', l.shipping_fee_cop,
      'availableUnits', v_available,
      'contributionPerUnitCop',
        CASE WHEN l.sale_price_cop > l.unit_cost_cop
             THEN round((l.sale_price_cop - l.unit_cost_cop) * l.contribution_bps / 10000.0)::int
             ELSE 0 END,
      'suggestedCampaign', coffee_campaign_option(l.default_campaign_id)
    );
  END IF;

  SELECT COALESCE(sum(quantity), 0), COALESCE(sum(contribution_total_cop), 0)
    INTO v_sold, v_committed
    FROM coffee_orders WHERE organization_id = p.organization_id AND status = 'paid';
  SELECT COALESCE(sum(quantity), 0), COALESCE(sum(contribution_total_cop), 0)
    INTO v_sold_physical, v_committed_physical
    FROM coffee_physical_sales WHERE organization_id = p.organization_id;
  SELECT COALESCE(sum(amount_cop), 0) INTO v_delivered
    FROM coffee_contribution_deliveries WHERE organization_id = p.organization_id;

  RETURN jsonb_build_object(
    'code', p.code,
    'productName', p.name,
    'presentationGrams', p.presentation_grams,
    'description', p.description,
    'lot', v_lot,
    'impact', jsonb_build_object(
      'unitsSold', v_sold + v_sold_physical,
      'contributionCommittedCop', v_committed + v_committed_physical,
      'contributionDeliveredCop', v_delivered
    )
  );
END;
$$;
