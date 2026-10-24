-- Mercado Pago retirado del producto (2026-10-17, decisión del dueño).
--
-- Borrado de los tokens de Mercado Pago guardados, APROBADO EXPLÍCITAMENTE por
-- el dueño del proyecto el 2026-10-17 ("Borra esos token de MercadoPago que la
-- verdad ya no hago nada con ellos"). ePayco es la única pasarela
-- (ADR-PAG-002); ningún flujo vuelve a leer esta tabla.
--
-- Se eliminan, en este orden:
--   1. Las funciones SECURITY DEFINER que leían la tabla (creadas en
--      20260930000000_mercadopago_connect, 20260930010000_mercadopago_sponsor_lookup
--      y 20261008210000_payments_direct_collector_lookup).
--   2. La tabla `organization_mercadopago_accounts` con sus tokens OAuth
--      (access/refresh token), su política RLS, índices y llave foránea.
--
-- Irreversible: los tokens no se pueden recuperar. Las migraciones anteriores
-- no se editan; esta es la única que retira el esquema de Mercado Pago.

DROP FUNCTION IF EXISTS mercadopago_account_organization_id(TEXT);
DROP FUNCTION IF EXISTS mercadopago_account_mp_user_id(UUID);
DROP FUNCTION IF EXISTS mercadopago_accounts_due_for_refresh(INTEGER);

DROP TABLE IF EXISTS "organization_mercadopago_accounts";
