-- AF-N01, defensa en la base (re-auditoría del PR 166). La API ya rechaza con
-- 409 cambiar el NIT, la razón social o el nombre de una organización que la
-- plataforma verificó; este candado lo hace cumplir también para cualquier otra
-- escritura (SQL manual, un servicio futuro que olvide la regla).
--
-- Estados bloqueados: formalizada, esal y esal_rte. En formalizada (estado al
-- que la organización llega sola) se puede completar un dato que estaba vacío.
-- Para corregir uno verificado, la organización primero baja su estado (otra
-- sentencia) y la plataforma vuelve a verificar. Se compara con el estado
-- ANTERIOR de la fila: bajar el estado y cambiar el NIT en la misma sentencia
-- también se rechaza.

CREATE OR REPLACE FUNCTION organization_legal_identity_locked(p_state TEXT)
  RETURNS BOOLEAN
  LANGUAGE sql IMMUTABLE
AS $$
  SELECT p_state IN ('formalizada', 'esal', 'esal_rte');
$$;

CREATE OR REPLACE FUNCTION organization_profiles_legal_identity_guard()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT organization_legal_identity_locked(OLD.formalization_state) THEN
    RETURN NEW;
  END IF;
  IF NEW.nit IS DISTINCT FROM OLD.nit
     AND NOT (OLD.formalization_state = 'formalizada' AND COALESCE(btrim(OLD.nit), '') = '') THEN
    RAISE EXCEPTION 'organization_profiles: nit is locked while %', OLD.formalization_state
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.legal_name IS DISTINCT FROM OLD.legal_name
     AND NOT (OLD.formalization_state = 'formalizada' AND COALESCE(btrim(OLD.legal_name), '') = '') THEN
    RAISE EXCEPTION 'organization_profiles: legal_name is locked while %', OLD.formalization_state
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER organization_profiles_legal_identity_guard
  BEFORE UPDATE OF nit, legal_name ON organization_profiles
  FOR EACH ROW EXECUTE FUNCTION organization_profiles_legal_identity_guard();

-- El nombre vive en `organizations` (registro sin RLS); el estado, en el perfil
-- (con RLS): SECURITY DEFINER para leerlo aunque quien escribe no tenga el
-- contexto de esa organización.
CREATE OR REPLACE FUNCTION organizations_legal_identity_guard()
  RETURNS TRIGGER
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
DECLARE
  v_state TEXT;
BEGIN
  IF NEW.name IS NOT DISTINCT FROM OLD.name THEN
    RETURN NEW;
  END IF;
  SELECT formalization_state INTO v_state FROM organization_profiles
   WHERE organization_id = OLD.id;
  IF v_state IS NOT NULL AND organization_legal_identity_locked(v_state) THEN
    RAISE EXCEPTION 'organizations: name is locked while %', v_state
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER organizations_legal_identity_guard
  BEFORE UPDATE OF name ON organizations
  FOR EACH ROW EXECUTE FUNCTION organizations_legal_identity_guard();

REVOKE ALL ON FUNCTION organizations_legal_identity_guard() FROM PUBLIC;
REVOKE ALL ON FUNCTION organization_profiles_legal_identity_guard() FROM PUBLIC;
