-- ============================================================================
-- Transparencia Nacional (punto 22): el consolidado del ecosistema.
--
-- El libro público es el detalle de CADA organización (nivel micro). Esta
-- función es el nivel macro: suma, sin cuenta y sin datos personales, lo que
-- todas las organizaciones APROBADAS publican en su libro (la misma vista
-- `ledger_movements`: movimientos vigentes + donaciones en línea aprobadas).
--
-- Solo agregados: nunca filas, conceptos, contrapartes, donantes ni ids. Las
-- cifras por departamento ya son públicas en el libro de cada organización.
-- SECURITY DEFINER con search_path fijo (postura AF-004 / SQLI-03), sin SQL
-- dinámico y ejecutable solo por el rol de la app.
-- ============================================================================
CREATE OR REPLACE FUNCTION public_national_transparency()
  RETURNS JSONB
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
  WITH orgs AS (
    SELECT o.id, NULLIF(btrim(p.location ->> 'department'), '') AS department
    FROM organizations o
    LEFT JOIN organization_profiles p ON p.organization_id = o.id
    WHERE o.status = 'approved'
  ),
  mv AS (
    SELECT m.organization_id, m.source, m.kind, m.category, m.occurred_on, m.amount_cop
    FROM ledger_movements m
    JOIN orgs ON orgs.id = m.organization_id
    WHERE m.voided_at IS NULL
  ),
  today AS (
    SELECT date_trunc('month', (now() AT TIME ZONE 'America/Bogota'))::date AS month_start
  ),
  months AS (
    SELECT (SELECT month_start FROM today) - make_interval(months => g) AS month_start
    FROM generate_series(0, 11) AS g
  ),
  online AS (
    SELECT d.concept_kind, d.intended_amount::bigint AS amount_cop
    FROM donations d
    JOIN donation_receipts r ON r.donation_id = d.id
    JOIN orgs ON orgs.id = d.organization_id
    WHERE d.status = 'approved'
  )
  SELECT jsonb_build_object(
    'generatedAt', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'organizations', jsonb_build_object(
      'approved', (SELECT count(*) FROM orgs),
      'reporting', (SELECT count(DISTINCT organization_id) FROM mv)
    ),
    'totals', (
      SELECT jsonb_build_object(
        'incomeCop', COALESCE(sum(amount_cop) FILTER (WHERE kind = 'income'), 0),
        'expenseCop', COALESCE(sum(amount_cop) FILTER (WHERE kind = 'expense'), 0),
        'movementCount', count(*),
        'onlineDonationsCop', COALESCE(sum(amount_cop) FILTER (WHERE source = 'online_donation'), 0),
        'onlineDonationsCount', count(*) FILTER (WHERE source = 'online_donation')
      )
      FROM mv
    ),
    'thisMonth', (
      SELECT jsonb_build_object(
        'month', to_char((SELECT month_start FROM today), 'YYYY-MM'),
        'incomeCop', COALESCE(sum(amount_cop) FILTER (WHERE kind = 'income'), 0),
        'expenseCop', COALESCE(sum(amount_cop) FILTER (WHERE kind = 'expense'), 0),
        'movementCount', count(*),
        'onlineDonationsCount', count(*) FILTER (WHERE source = 'online_donation')
      )
      FROM mv
      WHERE mv.occurred_on >= (SELECT month_start FROM today)
    ),
    'months', (
      SELECT jsonb_agg(jsonb_build_object(
        'month', to_char(x.month_start, 'YYYY-MM'),
        'incomeCop', x.income,
        'expenseCop', x.expense
      ) ORDER BY x.month_start)
      FROM (
        SELECT months.month_start,
               COALESCE(sum(mv.amount_cop) FILTER (WHERE mv.kind = 'income'), 0) AS income,
               COALESCE(sum(mv.amount_cop) FILTER (WHERE mv.kind = 'expense'), 0) AS expense
        FROM months
        LEFT JOIN mv ON date_trunc('month', mv.occurred_on)::date = months.month_start::date
        GROUP BY months.month_start
      ) x
    ),
    'categories', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'kind', c.kind, 'category', c.category, 'amountCop', c.total
      ) ORDER BY c.kind, c.total DESC, c.category)
      FROM (SELECT kind, category, sum(amount_cop) AS total FROM mv GROUP BY kind, category) c
    ), '[]'::jsonb),
    'donationDestinations', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'destination', o.concept_kind, 'amountCop', o.total, 'count', o.n
      ) ORDER BY o.total DESC, o.concept_kind)
      FROM (SELECT concept_kind, sum(amount_cop) AS total, count(*) AS n FROM online GROUP BY concept_kind) o
    ), '[]'::jsonb),
    'departments', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'department', d.department, 'organizations', d.orgs,
        'incomeCop', d.income, 'expenseCop', d.expense
      ) ORDER BY d.income DESC, d.orgs DESC, d.department NULLS LAST)
      FROM (
        SELECT orgs.department,
               count(DISTINCT orgs.id) AS orgs,
               COALESCE(sum(mv.amount_cop) FILTER (WHERE mv.kind = 'income'), 0) AS income,
               COALESCE(sum(mv.amount_cop) FILTER (WHERE mv.kind = 'expense'), 0) AS expense
        FROM orgs
        LEFT JOIN mv ON mv.organization_id = orgs.id
        GROUP BY orgs.department
      ) d
    ), '[]'::jsonb),
    'animals', jsonb_build_object(
      'inAdoption', (
        SELECT count(*) FROM animals a JOIN orgs ON orgs.id = a.organization_id
        WHERE a.is_active = TRUE AND a.status IN ('available', 'in_process')
      ),
      'adopted', (
        SELECT count(*) FROM animals a JOIN orgs ON orgs.id = a.organization_id
        WHERE a.status = 'adopted'
      )
    )
  );
$$;

REVOKE ALL ON FUNCTION public_national_transparency() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public_national_transparency() TO adoptafacil_app;
