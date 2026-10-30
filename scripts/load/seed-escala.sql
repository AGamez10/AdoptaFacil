-- Datos sintéticos de ESCALA para las pruebas de carga (plan de escala, cambio 1).
-- Todo es ficticio y queda marcado con el prefijo "Escala" / slug "escala-".
--
-- Variables de psql (con valores por defecto del plan):
--   orgs            1000   organizaciones aprobadas con perfil público
--   animals_per_org  200   animales disponibles por organización (200.000)
--   campaigns_per_org  5   campañas activas por organización (5.000)
--
-- Uso: scripts/load/seed-escala.sh (nunca directo contra producción).
-- Corre como el OWNER de la base (salta RLS a propósito: es un generador).

\set ON_ERROR_STOP on
\if :{?orgs} \else \set orgs 1000 \endif
\if :{?animals_per_org} \else \set animals_per_org 200 \endif
\if :{?campaigns_per_org} \else \set campaigns_per_org 5 \endif

BEGIN;

CREATE TEMP TABLE escala_orgs ON COMMIT DROP AS
SELECT gen_random_uuid() AS id, g AS n,
       (ARRAY['Bogotá','Medellín','Cali','Barranquilla','Cartagena','Bucaramanga','Pereira','Manizales','Santa Marta','Ibagué'])[1 + g % 10] AS city
FROM generate_series(1, :orgs) AS g;

-- Aprobadas hace un mes, como lo dejaría el flujo real de revisión.
INSERT INTO organizations (id, name, status, status_changed_at, created_at, updated_at)
SELECT id, 'Escala ' || n, 'approved', now() - interval '30 days', now(), now() FROM escala_orgs;

INSERT INTO organization_profiles (id, organization_id, slug, location, created_at, updated_at)
SELECT gen_random_uuid(), id, 'escala-' || n || '-' || substr(id::text, 1, 6),
       jsonb_build_object('city', city), now(), now()
FROM escala_orgs;

CREATE TEMP TABLE escala_animals ON COMMIT DROP AS
SELECT gen_random_uuid() AS id, o.id AS organization_id, g AS n
FROM escala_orgs o, generate_series(1, :animals_per_org) AS g;

INSERT INTO animals (id, organization_id, name, species, sex, size, status, is_active, created_at, updated_at)
SELECT id, organization_id, 'Escala ' || n,
       (ARRAY['dog','cat','other'])[1 + n % 3],
       (ARRAY['male','female'])[1 + n % 2],
       (ARRAY['small','medium','large'])[1 + n % 3],
       CASE WHEN n % 10 = 0 THEN 'adopted' ELSE 'available' END,
       TRUE,
       now() - (n || ' minutes')::interval, now()
FROM escala_animals;

INSERT INTO animal_photos (id, organization_id, animal_id, storage_ref, "order", created_at)
SELECT gen_random_uuid(), organization_id, id,
       'public/' || organization_id || '/' || gen_random_uuid() || '-escala.webp', 0, now()
FROM escala_animals;

INSERT INTO campaigns (id, organization_id, title, category, goal_amount, raised_amount, deadline, status, created_at, updated_at)
SELECT gen_random_uuid(), o.id, 'Escala campaña ' || g, 'medical', 1000000, (g * 37000) % 1000000,
       now() + interval '60 days', 'active', now() - (g || ' hours')::interval, now()
FROM escala_orgs o, generate_series(1, :campaigns_per_org) AS g;

COMMIT;

ANALYZE organizations, organization_profiles, animals, animal_photos, campaigns;

SELECT
  (SELECT count(*) FROM organizations WHERE name LIKE 'Escala %') AS organizaciones,
  (SELECT count(*) FROM animals WHERE name LIKE 'Escala %') AS animales,
  (SELECT count(*) FROM campaigns WHERE title LIKE 'Escala campaña %') AS campanas;
