# Recorrido de punta a punta: todos los cobros con Mercado Pago (simulado) y CSP aplicada

Prueba en navegador real (Playwright), con **Mercado Pago simulado** (cero red hacia Mercado
Pago, cero credenciales y datos reales) y la web servida con la **misma
Content-Security-Policy aplicada** que pone `deploy/Caddyfile` en producción.

| Control | Qué comprueba                                                                                           |
| ------- | ------------------------------------------------------------------------------------------------------- |
| A1      | La fundación conecta **su** cuenta de Mercado Pago (OAuth).                                             |
| A2      | Un invitado dona desde el celular, paga con PSE y la donación queda aprobada sola por el aviso firmado. |
| A3–A4   | Tarjeta, Efecty y Nequi (todos los medios que habilita la cuenta de la fundación) también se aprueban.  |
| B1      | Al escanear el QR de la bolsa se ve el aporte por bolsa: 20 % del margen bruto.                         |
| B2–B4   | El pedido de café se paga, cobra bolsas + envío y deja el aporte asignado a la campaña elegida.         |
| C1–C2   | El plan Crece se paga con **otro correo** de Mercado Pago y el primer cobro aprobado lo activa.         |
| D1      | Ninguna página (pública ni del panel) viola la CSP aplicada.                                            |

Las reglas finas (firma falsa, otra cuenta, montos que no cuadran, devoluciones, pagos
duplicados) están en las pruebas de integración de `apps/api/test/`, que corren en la CI.

## Cómo correrlo en local

Con Postgres y Redis del proyecto arriba y las migraciones aplicadas:

```bash
pnpm --filter @adoptafacil/api build
( cd apps/web && VITE_API_URL=/api VITE_PAYMENT_PROVIDER=mercadopago pnpm build )

node scripts/e2e/cobros-mercadopago/mp-mock.mjs > /tmp/mp-mock.log &   # 127.0.0.1:4010
node scripts/e2e/cobros-mercadopago/web-csp-server.mjs &               # 127.0.0.1:5180

( cd apps/api && NODE_ENV=development PAYMENT_DRIVER=mercadopago FEATURE_PAYMENTS=true \
  MERCADOPAGO_BASE_URL=http://127.0.0.1:4010 \
  MERCADOPAGO_AUTHORIZE_URL=http://127.0.0.1:4010/authorization \
  MERCADOPAGO_CLIENT_ID=5550009 MERCADOPAGO_CLIENT_SECRET=e2e-client-secret \
  MERCADOPAGO_WEBHOOK_SECRET=e2e-webhook-secret \
  MERCADOPAGO_ORDERS_WEBHOOK_SECRET=e2e-orders-secret MERCADOPAGO_TEST=false \
  MERCADOPAGO_PLATFORM_ACCESS_TOKEN=APP_USR-e2e-platform PLAN_ENFORCEMENT=true \
  API_PUBLIC_BASE_URL=http://127.0.0.1:3000 WEB_BASE_URL=http://127.0.0.1:5180 \
  CORS_ORIGINS=http://127.0.0.1:5180 node dist/src/main.js & )

PG_URL=postgresql://adoptafacil:adoptafacil@localhost:5433/adoptafacil \
  MOCK_LOG=/tmp/mp-mock.log node scripts/e2e/cobros-mercadopago/recorrido.mjs
```

Los valores son de prueba, no secretos reales. `PG_URL` (superusuario) solo se usa para
aprobar la fundación de prueba y sembrar un lote de café, como hacen las pruebas de
integración. Sale con código 0 si los 13 controles pasan y deja capturas en `$OUT_DIR`.
