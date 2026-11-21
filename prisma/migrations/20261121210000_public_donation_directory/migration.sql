-- "Quiero donar": directorio público de organizaciones a las que donar,
-- ordenado para premiar la diligencia. Función SECURITY DEFINER acotada, de
-- solo lectura, que expone SOLO señales que ya son públicas o que se reducen a
-- un sí/no:
--   * nombre, slug, logo y ciudad del perfil público (como el portal);
--   * estado de formalización y si el RTE sigue vigente (el portal ya los
--     muestra en sus sellos);
--   * si la cuenta de Mercado Pago está conectada (un booleano: igual que
--     `GET /public/donations/organizations/:id/availability`; nunca el id de
--     la cuenta ni sus tokens);
--   * los TIPOS de documento aprobados y no vencidos (nunca el archivo, la
--     nota de revisión ni quién revisó);
--   * la fecha del último gasto publicado en el libro público (ya público);
--   * promedio y número de reseñas aprobadas (ya públicos en el portal);
--   * número de campañas activas (ya públicas).
-- Mismo universo que el resto de lo público: organizaciones aprobadas con slug.

CREATE OR REPLACE FUNCTION public_donation_directory(p_limit INTEGER)
  RETURNS JSONB
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
  WITH orgs AS (
    SELECT
      o.id,
      o.name,
      op.slug,
      op.logo_url,
      NULLIF(btrim(op.location->>'city'), '') AS city,
      op.formalization_state,
      (op.rte_vigente AND (op.rte_valid_until IS NULL OR op.rte_valid_until > now())) AS rte_vigente
    FROM organizations o
    JOIN organization_profiles op ON op.organization_id = o.id AND op.slug IS NOT NULL
    WHERE o.status = 'approved'
  ),
  latest_docs AS (
    -- Última versión de cada tipo; cuenta solo si está aprobada y no vencida.
    SELECT DISTINCT ON (d.organization_id, d.type)
      d.organization_id, d.type, d.status, d.expires_at
    FROM organization_documents d
    JOIN orgs ON orgs.id = d.organization_id
    ORDER BY d.organization_id, d.type, d.version DESC
  )
  SELECT jsonb_build_object(
    'items', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', g.id,
        'name', g.name,
        'slug', g.slug,
        'logoUrl', g.logo_url,
        'city', g.city,
        'formalizationState', g.formalization_state,
        'rteVigente', g.rte_vigente,
        'mercadoPagoConnected', EXISTS (
          SELECT 1 FROM organization_mercadopago_connections c
          WHERE c.organization_id = g.id AND c.status = 'active'
        ),
        'validDocumentTypes', COALESCE((
          SELECT jsonb_agg(ld.type ORDER BY ld.type)
          FROM latest_docs ld
          WHERE ld.organization_id = g.id
            AND ld.status = 'approved'
            AND (ld.expires_at IS NULL OR ld.expires_at > now())
        ), '[]'::jsonb),
        'lastExpenseOn', (
          SELECT to_char(max(e.occurred_on), 'YYYY-MM-DD')
          FROM ledger_entries e
          WHERE e.organization_id = g.id AND e.kind = 'expense' AND e.voided_at IS NULL
        ),
        'reviewAverage', (
          SELECT ROUND(AVG(r.rating)::numeric, 2)
          FROM reviews r WHERE r.organization_id = g.id AND r.status = 'approved'
        ),
        'reviewCount', (
          SELECT count(*) FROM reviews r WHERE r.organization_id = g.id AND r.status = 'approved'
        ),
        'activeCampaigns', (
          SELECT count(*) FROM campaigns ca WHERE ca.organization_id = g.id AND ca.status = 'active'
        )
      ) ORDER BY g.name, g.id)
      FROM (
        -- El orden final (diligencia) lo calcula la API; aquí solo se recorta
        -- empezando por las más formalizadas para no dejar fuera a ninguna de
        -- ellas si el universo supera el tope.
        SELECT * FROM orgs
        ORDER BY array_position(
                   ARRAY['informal', 'en_proceso', 'formalizada', 'esal', 'esal_rte'],
                   formalization_state
                 ) DESC NULLS LAST,
                 name, id
        LIMIT LEAST(GREATEST(COALESCE(p_limit, 100), 1), 300)
      ) g
    ), '[]'::jsonb)
  );
$$;

REVOKE ALL ON FUNCTION public_donation_directory(INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public_donation_directory(INTEGER) TO adoptafacil_app;
