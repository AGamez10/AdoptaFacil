# Recorrido de punta a punta: cobro de guardería por Mercado Pago (simulado)

Prueba en navegador real (Playwright) del flujo completo, con **Mercado Pago simulado**:
cero red hacia Mercado Pago, cero credenciales reales y cero datos reales.

| Paso | Qué comprueba                                                                                         |
| ---- | ----------------------------------------------------------------------------------------------------- |
| 1    | Sin cuenta de Mercado Pago conectada, Custodia no deja encender el pago en línea.                     |
| 2    | La organización conecta **su** cuenta (OAuth) y enciende el pago aceptando las condiciones.           |
| 3    | Registra el cobro desde la ficha del animal, pestaña **Custodia**.                                    |
| 4    | Genera el **Enlace de pago** del cobro y lo comparte (copiar y WhatsApp).                             |
| 5    | Quien paga abre el enlace sin sesión, en celular, y paga; llega el aviso **firmado** de Mercado Pago. |
| 6    | El cobro queda pagado solo, con constancia, y la organización recibe un aviso.                        |

Las reglas finas (firma falsa, otra cuenta, pagos parciales, devoluciones, contracargos,
aislamiento entre organizaciones) están en
`apps/api/test/custody-online-payments.integration-spec.ts`, que corre en la CI.

## Cómo correrlo en local

Con Postgres y Redis del proyecto arriba y las migraciones aplicadas:

```bash
# 1. Mercado Pago simulado (solo escucha en 127.0.0.1:4010)
node scripts/e2e/guarderia-mercadopago/mp-mock.mjs &

# 2. API apuntando al simulador (valores de prueba, no son secretos reales)
pnpm --filter @adoptafacil/api build
( cd apps/api && \
  PAYMENT_DRIVER=mercadopago FEATURE_PAYMENTS=true \
  MERCADOPAGO_BASE_URL=http://127.0.0.1:4010 \
  MERCADOPAGO_AUTHORIZE_URL=http://127.0.0.1:4010/authorization \
  MERCADOPAGO_CLIENT_ID=5550009 MERCADOPAGO_CLIENT_SECRET=e2e-client-secret \
  MERCADOPAGO_WEBHOOK_SECRET=e2e-webhook-secret \
  MERCADOPAGO_ORDERS_WEBHOOK_SECRET=e2e-orders-secret MERCADOPAGO_TEST=false \
  API_PUBLIC_BASE_URL=http://localhost:3000 WEB_BASE_URL=http://localhost:5173 \
  node dist/src/main.js & )

# 3. Web
( cd apps/web && VITE_API_URL=http://localhost:3000 pnpm exec vite --port 5173 & )

# 4. Recorrido (PG_URL = conexión de superusuario, solo para aprobar y
#    formalizar la organización de prueba, como en las pruebas de integración)
PG_URL=postgresql://adoptafacil:adoptafacil@localhost:5433/adoptafacil \
  node scripts/e2e/guarderia-mercadopago/recorrido.mjs
```

Sale con código 0 si los 13 controles pasan y deja capturas en `$OUT_DIR`
(por defecto, la carpeta temporal del sistema).

El checkout de Mercado Pago se reemplaza dentro del navegador por una página simulada
(`https://www.mercadopago.com.co/**` nunca sale a la red). Para la prueba con el sandbox
real hacen falta los usuarios de prueba y el webhook de Orders registrado en el panel de
Mercado Pago: ver `docs/pagos/mercadopago-oauth.md`.
