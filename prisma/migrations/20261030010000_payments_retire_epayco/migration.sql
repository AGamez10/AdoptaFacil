-- ePayco retirado del producto (2026-10-29, decisión del dueño).
--
-- Borrado de las llaves de ePayco guardadas, APROBADO EXPLÍCITAMENTE por el
-- dueño del proyecto el 2026-10-29 ("elimina todo rastro de epayco"). Ningún
-- código lee ni escribe ya esta tabla: el adaptador, la conexión de llaves y
-- su cifrado se borraron en el mismo cambio.
--
-- Se eliminan, en este orden:
--   1. La función SECURITY DEFINER que leía la tabla (creada en
--      20261015210000_payments_epayco_accounts).
--   2. La tabla `organization_epayco_accounts` con las llaves cifradas de cada
--      organización (P_KEY y PRIVATE_KEY), su política RLS, índices y llave
--      foránea.
--
-- Las donaciones, recibos y certificados no se tocan. La auditoría
-- (append-only) conserva los eventos de conexión, que nunca guardaron secretos.
--
-- Irreversible: las llaves no se pueden recuperar. Las migraciones anteriores
-- no se editan; esta es la única que retira el esquema de ePayco.

DROP FUNCTION IF EXISTS epayco_account_organization_id(TEXT);

DROP TABLE IF EXISTS "organization_epayco_accounts";
