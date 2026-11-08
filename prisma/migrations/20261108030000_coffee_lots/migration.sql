-- ============================================================================
-- Café de AdoptaFácil: presentaciones con QR fijo, lotes con stock, pedidos
-- del checkout (cuenta de Mercado Pago de AdoptaFácil), visitas y entregas del
-- aporte a campañas.
--
-- Todo vive en la organización del EQUIPO de plataforma, con RLS ENABLE +
-- FORCE + tenant_isolation. Lo público pasa por funciones SECURITY DEFINER
-- acotadas que devuelven solo columnas públicas (nunca costos ni compradores).
--
-- Regla de aporte: 20 % del margen bruto (venta − compra) de cada bolsa
-- pagada, a la campaña que el comprador eligió (sugerida por el lote o
-- cambiada por otra activa). Cada pedido congela su campaña y sus montos.
-- ============================================================================

CREATE TABLE "coffee_products" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "presentation_grams" INTEGER NOT NULL,
    "description" TEXT,
    "qr_domain" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

CONSTRAINT "coffee_products_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "coffee_lots" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "lot_code" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "sale_price_cop" INTEGER NOT NULL,
    "unit_cost_cop" INTEGER NOT NULL,
    "shipping_fee_cop" INTEGER NOT NULL DEFAULT 0,
    "stock_units" INTEGER NOT NULL,
    "contribution_bps" INTEGER NOT NULL DEFAULT 2000,
    "default_campaign_id" UUID,
    "created_by_user_id" UUID,
    "published_at" TIMESTAMP(3),
    "closed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

CONSTRAINT "coffee_lots_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "coffee_orders" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "lot_id" UUID NOT NULL,
    "reference" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "quantity" INTEGER NOT NULL,
    "unit_price_cop" INTEGER NOT NULL,
    "shipping_fee_cop" INTEGER NOT NULL,
    "total_cop" INTEGER NOT NULL,
    "contribution_per_unit_cop" INTEGER NOT NULL,
    "contribution_total_cop" INTEGER NOT NULL,
    "campaign_id" UUID NOT NULL,
    "campaign_title" TEXT NOT NULL,
    "campaign_org_name" TEXT NOT NULL,
    "buyer_name" TEXT NOT NULL,
    "buyer_email" TEXT NOT NULL,
    "buyer_phone" TEXT NOT NULL,
    "shipping_address" TEXT NOT NULL,
    "shipping_city" TEXT NOT NULL,
    "shipping_department" TEXT NOT NULL,
    "privacy_accepted_at" TIMESTAMP(3) NOT NULL,
    "reserved_until" TIMESTAMP(3) NOT NULL,
    "mp_payment_id" TEXT,
    "paid_at" TIMESTAMP(3),
    "shipped_at" TIMESTAMP(3),
    "receipt_sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

CONSTRAINT "coffee_orders_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "coffee_visit_days" (
    "organization_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "day" DATE NOT NULL,
    "source" TEXT NOT NULL,
    "visits" INTEGER NOT NULL DEFAULT 0,

CONSTRAINT "coffee_visit_days_pkey" PRIMARY KEY ("organization_id","product_id","day","source")
);

CREATE TABLE "coffee_contribution_deliveries" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "campaign_id" UUID NOT NULL,
    "campaign_title" TEXT NOT NULL,
    "amount_cop" INTEGER NOT NULL,
    "delivered_on" DATE NOT NULL,
    "evidence" TEXT NOT NULL,
    "created_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

CONSTRAINT "coffee_contribution_deliveries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "coffee_products_code_key" ON "coffee_products"("code");

CREATE INDEX "coffee_products_organization_id_idx" ON "coffee_products"("organization_id");

CREATE UNIQUE INDEX "coffee_products_id_organization_id_key" ON "coffee_products"("id", "organization_id");

CREATE INDEX "coffee_lots_organization_id_idx" ON "coffee_lots"("organization_id");

CREATE UNIQUE INDEX "coffee_lots_product_id_lot_code_key" ON "coffee_lots"("product_id", "lot_code");

CREATE UNIQUE INDEX "coffee_lots_id_organization_id_key" ON "coffee_lots"("id", "organization_id");

CREATE UNIQUE INDEX "coffee_orders_reference_key" ON "coffee_orders"("reference");

CREATE INDEX "coffee_orders_organization_id_idx" ON "coffee_orders"("organization_id");

CREATE INDEX "coffee_orders_lot_id_status_idx" ON "coffee_orders"("lot_id", "status");

CREATE INDEX "coffee_visit_days_organization_id_idx" ON "coffee_visit_days"("organization_id");

CREATE INDEX "coffee_contribution_deliveries_organization_id_idx" ON "coffee_contribution_deliveries"("organization_id");

CREATE INDEX "coffee_contribution_deliveries_campaign_id_idx" ON "coffee_contribution_deliveries"("campaign_id");

ALTER TABLE "coffee_products" ADD CONSTRAINT "coffee_products_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "coffee_lots" ADD CONSTRAINT "coffee_lots_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "coffee_lots" ADD CONSTRAINT "coffee_lots_product_id_organization_id_fkey" FOREIGN KEY ("product_id", "organization_id") REFERENCES "coffee_products"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "coffee_orders" ADD CONSTRAINT "coffee_orders_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "coffee_orders" ADD CONSTRAINT "coffee_orders_lot_id_organization_id_fkey" FOREIGN KEY ("lot_id", "organization_id") REFERENCES "coffee_lots"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "coffee_visit_days" ADD CONSTRAINT "coffee_visit_days_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "coffee_visit_days" ADD CONSTRAINT "coffee_visit_days_product_id_organization_id_fkey" FOREIGN KEY ("product_id", "organization_id") REFERENCES "coffee_products"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "coffee_contribution_deliveries" ADD CONSTRAINT "coffee_contribution_deliveries_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ----------------------------------------------------------------------------
-- Reglas de valores
-- ----------------------------------------------------------------------------
ALTER TABLE "coffee_products" ADD CONSTRAINT "coffee_products_values_check"
  CHECK ("code" ~ '^[a-hjkmnp-z2-9]{8}$'
     AND char_length("name") BETWEEN 2 AND 120
     AND "presentation_grams" BETWEEN 1 AND 100000
     AND ("description" IS NULL OR char_length("description") <= 2000)
     AND "qr_domain" ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$');

ALTER TABLE "coffee_lots" ADD CONSTRAINT "coffee_lots_values_check"
  CHECK ("status" IN ('draft', 'on_sale', 'paused', 'closed')
     AND char_length("lot_code") BETWEEN 1 AND 40
     AND "sale_price_cop" BETWEEN 1 AND 100000000
     AND "unit_cost_cop" BETWEEN 0 AND 100000000
     AND "shipping_fee_cop" BETWEEN 0 AND 10000000
     AND "stock_units" BETWEEN 0 AND 1000000
     AND "contribution_bps" BETWEEN 0 AND 10000
     AND ("status" = 'draft' OR "default_campaign_id" IS NOT NULL));

ALTER TABLE "coffee_orders" ADD CONSTRAINT "coffee_orders_values_check"
  CHECK ("status" IN ('pending', 'paid', 'needs_refund', 'expired', 'rejected', 'cancelled', 'refunded')
     AND "reference" ~ '^cafe-[a-hjkmnp-z2-9]{24}$'
     AND "quantity" BETWEEN 1 AND 10
     AND "unit_price_cop" > 0
     AND "shipping_fee_cop" >= 0
     AND "total_cop" = "unit_price_cop" * "quantity" + "shipping_fee_cop"
     AND "contribution_per_unit_cop" >= 0
     AND "contribution_total_cop" = "contribution_per_unit_cop" * "quantity");

ALTER TABLE "coffee_visit_days" ADD CONSTRAINT "coffee_visit_days_values_check"
  CHECK ("source" IN ('qr', 'web') AND "visits" >= 0);

ALTER TABLE "coffee_contribution_deliveries" ADD CONSTRAINT "coffee_contribution_deliveries_values_check"
  CHECK ("amount_cop" <> 0 AND char_length("evidence") BETWEEN 3 AND 1000);

-- ----------------------------------------------------------------------------
-- Inmutabilidad
-- ----------------------------------------------------------------------------

-- El código y el dominio están impresos en las bolsas: no cambian nunca.
CREATE OR REPLACE FUNCTION coffee_products_guard()
  RETURNS TRIGGER
  LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."code" IS DISTINCT FROM OLD."code"
     OR NEW."qr_domain" IS DISTINCT FROM OLD."qr_domain"
     OR NEW."organization_id" IS DISTINCT FROM OLD."organization_id" THEN
    RAISE EXCEPTION 'coffee_products.code/qr_domain are printed on the bags and immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER coffee_products_guard
  BEFORE UPDATE ON "coffee_products"
  FOR EACH ROW EXECUTE FUNCTION coffee_products_guard();

-- Publicado un lote, sus condiciones (precio, costo, envío, regla) quedan fijas
-- y no vuelve a borrador. Un lote cerrado no se reabre.
CREATE OR REPLACE FUNCTION coffee_lots_guard()
  RETURNS TRIGGER
  LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."organization_id" IS DISTINCT FROM OLD."organization_id"
     OR NEW."product_id" IS DISTINCT FROM OLD."product_id" THEN
    RAISE EXCEPTION 'coffee_lots: product and owner are immutable';
  END IF;
  IF OLD."status" <> 'draft' THEN
    IF NEW."status" = 'draft' THEN
      RAISE EXCEPTION 'coffee_lots: a published lot cannot go back to draft';
    END IF;
    IF NEW."lot_code" IS DISTINCT FROM OLD."lot_code"
       OR NEW."sale_price_cop" IS DISTINCT FROM OLD."sale_price_cop"
       OR NEW."unit_cost_cop" IS DISTINCT FROM OLD."unit_cost_cop"
       OR NEW."shipping_fee_cop" IS DISTINCT FROM OLD."shipping_fee_cop"
       OR NEW."contribution_bps" IS DISTINCT FROM OLD."contribution_bps" THEN
      RAISE EXCEPTION 'coffee_lots: the terms of a published lot are immutable';
    END IF;
  END IF;
  IF OLD."status" = 'closed' AND NEW."status" <> 'closed' THEN
    RAISE EXCEPTION 'coffee_lots: a closed lot cannot be reopened';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER coffee_lots_guard
  BEFORE UPDATE ON "coffee_lots"
  FOR EACH ROW EXECUTE FUNCTION coffee_lots_guard();

-- Un pedido congela lo que el comprador aceptó: montos, campaña y sus datos.
-- Solo avanzan el estado y las fechas de pago, envío y comprobante.
CREATE OR REPLACE FUNCTION coffee_orders_guard()
  RETURNS TRIGGER
  LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."organization_id" IS DISTINCT FROM OLD."organization_id"
     OR NEW."lot_id" IS DISTINCT FROM OLD."lot_id"
     OR NEW."reference" IS DISTINCT FROM OLD."reference"
     OR NEW."quantity" IS DISTINCT FROM OLD."quantity"
     OR NEW."unit_price_cop" IS DISTINCT FROM OLD."unit_price_cop"
     OR NEW."shipping_fee_cop" IS DISTINCT FROM OLD."shipping_fee_cop"
     OR NEW."total_cop" IS DISTINCT FROM OLD."total_cop"
     OR NEW."contribution_per_unit_cop" IS DISTINCT FROM OLD."contribution_per_unit_cop"
     OR NEW."contribution_total_cop" IS DISTINCT FROM OLD."contribution_total_cop"
     OR NEW."campaign_id" IS DISTINCT FROM OLD."campaign_id"
     OR NEW."campaign_title" IS DISTINCT FROM OLD."campaign_title"
     OR NEW."campaign_org_name" IS DISTINCT FROM OLD."campaign_org_name"
     OR NEW."buyer_name" IS DISTINCT FROM OLD."buyer_name"
     OR NEW."buyer_email" IS DISTINCT FROM OLD."buyer_email"
     OR NEW."buyer_phone" IS DISTINCT FROM OLD."buyer_phone"
     OR NEW."shipping_address" IS DISTINCT FROM OLD."shipping_address"
     OR NEW."shipping_city" IS DISTINCT FROM OLD."shipping_city"
     OR NEW."shipping_department" IS DISTINCT FROM OLD."shipping_department"
     OR NEW."privacy_accepted_at" IS DISTINCT FROM OLD."privacy_accepted_at"
     OR NEW."reserved_until" IS DISTINCT FROM OLD."reserved_until" THEN
    RAISE EXCEPTION 'coffee_orders: what the buyer accepted is immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER coffee_orders_guard
  BEFORE UPDATE ON "coffee_orders"
  FOR EACH ROW EXECUTE FUNCTION coffee_orders_guard();

-- Entregas: solo inserción, también para el superusuario.
CREATE OR REPLACE FUNCTION coffee_deliveries_append_only()
  RETURNS TRIGGER
  LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'coffee_contribution_deliveries is append-only';
END;
$$;

CREATE TRIGGER coffee_deliveries_append_only
  BEFORE UPDATE OR DELETE ON "coffee_contribution_deliveries"
  FOR EACH ROW EXECUTE FUNCTION coffee_deliveries_append_only();

CREATE TRIGGER coffee_deliveries_no_truncate
  BEFORE TRUNCATE ON "coffee_contribution_deliveries"
  FOR EACH STATEMENT EXECUTE FUNCTION coffee_deliveries_append_only();

-- ----------------------------------------------------------------------------
-- RLS + permisos del rol de runtime
-- ----------------------------------------------------------------------------
ALTER TABLE "coffee_products" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "coffee_products" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "coffee_products"
  USING ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

ALTER TABLE "coffee_lots" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "coffee_lots" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "coffee_lots"
  USING ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

ALTER TABLE "coffee_orders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "coffee_orders" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "coffee_orders"
  USING ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

ALTER TABLE "coffee_visit_days" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "coffee_visit_days" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "coffee_visit_days"
  USING ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

ALTER TABLE "coffee_contribution_deliveries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "coffee_contribution_deliveries" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "coffee_contribution_deliveries"
  USING ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

-- Sin DELETE en ninguna: la historia del programa no se borra.
GRANT SELECT, INSERT, UPDATE ON "coffee_products" TO adoptafacil_app;
GRANT SELECT, INSERT, UPDATE ON "coffee_lots" TO adoptafacil_app;
GRANT SELECT, INSERT, UPDATE ON "coffee_orders" TO adoptafacil_app;
GRANT SELECT ON "coffee_visit_days" TO adoptafacil_app;
GRANT SELECT, INSERT ON "coffee_contribution_deliveries" TO adoptafacil_app;

-- ----------------------------------------------------------------------------
-- Doble aprobación: publicar un lote y cambiar su campaña sugerida.
-- ----------------------------------------------------------------------------
ALTER TABLE "platform_sensitive_actions" DROP CONSTRAINT "platform_sensitive_actions_values_check";
ALTER TABLE "platform_sensitive_actions" ADD CONSTRAINT "platform_sensitive_actions_values_check"
  CHECK ("type" IN ('staff.invite', 'staff.role_grant', 'staff.role_revoke', 'staff.mfa_reset',
                    'audit.export', 'coffee.lot_publish', 'coffee.lot_campaign')
     AND char_length("reason") BETWEEN 1 AND 1000
     AND "expires_at" > "requested_at");

-- ----------------------------------------------------------------------------
-- Funciones públicas (SECURITY DEFINER acotadas)
-- ----------------------------------------------------------------------------

-- Una campaña puede recibir el aporte si está activa, no venció y su
-- organización está aprobada (las mismas que el público ve).
CREATE OR REPLACE FUNCTION coffee_campaign_option(p_id UUID)
  RETURNS JSONB
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'id', c.id,
    'title', c.title,
    'organizationName', o.name,
    'deadline', c.deadline
  )
  FROM campaigns c
  JOIN organizations o ON o.id = c.organization_id
  WHERE c.id = p_id
    AND c.status = 'active'
    AND c.deadline > now()
    AND o.status = 'approved';
$$;

CREATE OR REPLACE FUNCTION coffee_campaign_options()
  RETURNS JSONB
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(jsonb_agg(item ORDER BY (item->>'deadline'), (item->>'title')), '[]'::jsonb)
  FROM (
    SELECT jsonb_build_object(
      'id', c.id,
      'title', c.title,
      'organizationName', o.name,
      'deadline', c.deadline
    ) AS item
    FROM campaigns c
    JOIN organizations o ON o.id = c.organization_id
    WHERE c.status = 'active'
      AND c.deadline > now()
      AND o.status = 'approved'
    ORDER BY c.deadline
    LIMIT 200
  ) page;
$$;

-- Bolsas que todavía se pueden apartar: stock − pagadas − apartadas vigentes.
CREATE OR REPLACE FUNCTION coffee_lot_available(p_lot UUID)
  RETURNS INTEGER
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
  SELECT GREATEST(
    l.stock_units - COALESCE((
      SELECT sum(o.quantity)::int FROM coffee_orders o
      WHERE o.lot_id = l.id
        AND (o.status = 'paid' OR (o.status = 'pending' AND o.reserved_until > now()))
    ), 0),
    0)
  FROM coffee_lots l
  WHERE l.id = p_lot;
$$;

-- Lo que ve quien escanea: la presentación, el lote a la venta (el más
-- antiguo publicado que aún tiene bolsas) y los totales del programa. Suma una
-- visita del día (UTC) por origen. Nunca costos, compradores ni ids internos
-- del equipo.
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
  SELECT COALESCE(sum(amount_cop), 0) INTO v_delivered
    FROM coffee_contribution_deliveries WHERE organization_id = p.organization_id;

  RETURN jsonb_build_object(
    'code', p.code,
    'productName', p.name,
    'presentationGrams', p.presentation_grams,
    'description', p.description,
    'lot', v_lot,
    'impact', jsonb_build_object(
      'unitsSold', v_sold,
      'contributionCommittedCop', v_committed,
      'contributionDeliveredCop', v_delivered
    )
  );
END;
$$;

-- Dueño (equipo) de un lote a la venta de esa presentación, para apartar las
-- bolsas bajo su RLS. NULL si el lote no está a la venta.
CREATE OR REPLACE FUNCTION coffee_checkout_owner(p_code TEXT, p_lot UUID)
  RETURNS UUID
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
  SELECT l.organization_id
  FROM coffee_lots l
  JOIN coffee_products p ON p.id = l.product_id
  WHERE p.code = p_code AND p.is_active = TRUE
    AND l.id = p_lot AND l.status = 'on_sale';
$$;

-- Dueño (equipo) de un pedido por su referencia (webhook de Mercado Pago).
CREATE OR REPLACE FUNCTION coffee_order_owner(p_reference TEXT)
  RETURNS UUID
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
  SELECT organization_id FROM coffee_orders
  WHERE p_reference ~ '^cafe-[a-hjkmnp-z2-9]{24}$' AND reference = p_reference;
$$;

-- Estado público de un pedido (página de resultado): sin datos del comprador.
CREATE OR REPLACE FUNCTION coffee_public_order(p_reference TEXT)
  RETURNS JSONB
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'reference', o.reference,
    'status', CASE WHEN o.status = 'pending' AND o.reserved_until <= now()
                   THEN 'expired' ELSE o.status END,
    'productName', p.name,
    'lotCode', l.lot_code,
    'quantity', o.quantity,
    'totalCop', o.total_cop,
    'campaignTitle', o.campaign_title,
    'organizationName', o.campaign_org_name,
    'contributionTotalCop', o.contribution_total_cop
  )
  FROM coffee_orders o
  JOIN coffee_lots l ON l.id = o.lot_id
  JOIN coffee_products p ON p.id = l.product_id
  WHERE p_reference ~ '^cafe-[a-hjkmnp-z2-9]{24}$' AND o.reference = p_reference;
$$;

REVOKE ALL ON FUNCTION coffee_campaign_option(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION coffee_campaign_options() FROM PUBLIC;
REVOKE ALL ON FUNCTION coffee_lot_available(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION coffee_public_offer(TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION coffee_checkout_owner(TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION coffee_order_owner(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION coffee_public_order(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION coffee_campaign_option(UUID) TO adoptafacil_app;
GRANT EXECUTE ON FUNCTION coffee_campaign_options() TO adoptafacil_app;
GRANT EXECUTE ON FUNCTION coffee_lot_available(UUID) TO adoptafacil_app;
GRANT EXECUTE ON FUNCTION coffee_public_offer(TEXT, TEXT) TO adoptafacil_app;
GRANT EXECUTE ON FUNCTION coffee_checkout_owner(TEXT, UUID) TO adoptafacil_app;
GRANT EXECUTE ON FUNCTION coffee_order_owner(TEXT) TO adoptafacil_app;
GRANT EXECUTE ON FUNCTION coffee_public_order(TEXT) TO adoptafacil_app;
