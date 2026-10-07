-- Gate de postura RLS (R1-10, §7.6 del prompt maestro; AF-004).
--
-- Se ejecuta contra una base con TODAS las migraciones aplicadas:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -v app_role=adoptafacil_app -f scripts/ci/rls-posture.sql
-- Falla (RAISE EXCEPTION) si:
--   1. una tabla de negocio (columna organization_id en public) no tiene
--      ENABLE + FORCE ROW LEVEL SECURITY y al menos una policy;
--   2. el rol de runtime es superusuario, tiene BYPASSRLS o es dueño de tablas
--      o funciones de public (el dueño se salta la RLS sin FORCE);
--   3. una función SECURITY DEFINER no fija search_path;
--   4. una función PL/pgSQL de public usa EXECUTE (SQL dinámico).
-- Avisos sin bloquear (deuda conocida, ver docs/operacion/SEGURIDAD_CI.md):
--   search_path sin pg_temp al final (SQLI-03) y SECURITY DEFINER ejecutables
--   por PUBLIC.
--
-- Excepciones: solo las de la tabla `allowed` de abajo, con su motivo.
-- Añadir una exige revisión cruzada del hilo de seguridad.

\set ON_ERROR_STOP 1
SELECT set_config('af.app_role', :'app_role', false) AS app_role_set \gset

DO $$
DECLARE
  app_role text := current_setting('af.app_role');
  problems text[] := '{}';
  r record;
BEGIN
  -- Excepciones explícitas a la regla 1.
  CREATE TEMP TABLE allowed (relname text PRIMARY KEY, reason text NOT NULL) ON COMMIT DROP;
  INSERT INTO allowed VALUES
    ('auth_credentials',
     'credenciales: el login las busca por correo ANTES de conocer el tenant; '
     'pendiente de moverlo a una función SECURITY DEFINER (hilo de seguridad)');

  -- 1. Tablas de negocio con RLS forzada y policy.
  FOR r IN
    SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity,
           (SELECT count(*) FROM pg_policy p WHERE p.polrelid = c.oid) AS policies
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
      AND EXISTS (SELECT 1 FROM pg_attribute a
                  WHERE a.attrelid = c.oid AND a.attname = 'organization_id'
                    AND a.attnum > 0 AND NOT a.attisdropped)
      AND c.relname NOT IN (SELECT relname FROM allowed)
    ORDER BY c.relname
  LOOP
    IF NOT r.relrowsecurity OR NOT r.relforcerowsecurity OR r.policies = 0 THEN
      problems := problems || format('tabla %s: enable=%s force=%s policies=%s',
        r.relname, r.relrowsecurity, r.relforcerowsecurity, r.policies);
    END IF;
  END LOOP;

  FOR r IN SELECT relname, reason FROM allowed LOOP
    RAISE NOTICE 'excepción documentada: % (%)', r.relname, r.reason;
  END LOOP;

  -- 2. Rol de runtime sin privilegios que salten la RLS.
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = app_role) THEN
    problems := problems || format('el rol de runtime %s no existe', app_role);
  END IF;
  FOR r IN SELECT rolname FROM pg_roles
           WHERE rolname = app_role AND (rolsuper OR rolbypassrls) LOOP
    problems := problems || format('el rol %s es SUPERUSER o BYPASSRLS', r.rolname);
  END LOOP;
  FOR r IN
    SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND pg_get_userbyid(c.relowner) = app_role
  LOOP
    problems := problems || format('el rol %s es dueño de %s', app_role, r.relname);
  END LOOP;
  FOR r IN
    SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND pg_get_userbyid(p.proowner) = app_role
  LOOP
    problems := problems || format('el rol %s es dueño de la función %s', app_role, r.proname);
  END LOOP;

  -- 3. SECURITY DEFINER con search_path fijo.
  FOR r IN
    SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef
      AND NOT EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig, '{}')) cfg
                      WHERE cfg LIKE 'search_path=%')
  LOOP
    problems := problems || format('SECURITY DEFINER %s sin search_path fijo', r.proname);
  END LOOP;

  -- 4. Sin SQL dinámico en PL/pgSQL.
  FOR r IN
    SELECT p.proname FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    JOIN pg_language l ON l.oid = p.prolang
    WHERE n.nspname = 'public' AND l.lanname = 'plpgsql' AND p.prosrc ~* '\mexecute\M'
  LOOP
    problems := problems || format('función %s usa EXECUTE (SQL dinámico)', r.proname);
  END LOOP;

  -- Avisos (no bloquean).
  RAISE NOTICE 'aviso SQLI-03: % funciones SECURITY DEFINER sin pg_temp al final del search_path',
    (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.prosecdef
       AND NOT EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig, '{}')) cfg
                       WHERE cfg ~ '^search_path=.*pg_temp"?$'));
  FOR r IN
    SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef
      AND has_function_privilege('public', p.oid, 'EXECUTE')
  LOOP
    RAISE NOTICE 'aviso: SECURITY DEFINER % es ejecutable por PUBLIC (revisar si debe ser pública)', r.proname;
  END LOOP;

  IF array_length(problems, 1) > 0 THEN
    RAISE EXCEPTION E'Postura RLS incumplida (% problemas):\n  - %',
      array_length(problems, 1), array_to_string(problems, E'\n  - ');
  END IF;

  RAISE NOTICE 'postura RLS OK: tablas de negocio con FORCE + policy; rol % sin bypass', app_role;
END $$;
