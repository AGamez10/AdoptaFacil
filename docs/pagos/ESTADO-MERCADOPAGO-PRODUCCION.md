# Mercado Pago: estado por flujo y salida a producción con dinero

> Corte: 2026-11-21, rama de integración con #137, #136, #133 y #127 (PR #138).
> Modelo vigente: [ADR-PAG-003](./mercadopago-oauth.md). Cada refugio cobra en **su** cuenta por OAuth,
> AdoptaFácil cobra planes y café en la **suya**, y nunca hay custodia de dinero de terceros. El split 1:1
> quedó descartado por decisión del dueño (2026-11-06).
> Este documento no es asesoría jurídica ni tributaria.

## 1. Estado por flujo

Leyenda de "Probado":

- **Real:** el dueño lo vio funcionar con su cuenta.
- **CI:** cubierto por pruebas de integración con dobles de Mercado Pago, sobre Postgres real.
- **Pendiente:** falta la prueba con un cobro real o de sandbox.

| Flujo                     | Cuenta que cobra                     | Cómo se confirma                                                                         | Firma `x-signature`                     | Idempotencia                                                | Probado                       |
| ------------------------- | ------------------------------------ | ---------------------------------------------------------------------------------------- | --------------------------------------- | ----------------------------------------------------------- | ----------------------------- |
| Conectar cuenta (OAuth)   | La del refugio                       | Callback `/org/mercadopago/callback` con `state` firmado y PKCE opcional                 | n/a                                     | `state` de un solo uso (cookie `af_mp_oauth`)               | **Real** (donaciones llegan)  |
| Donaciones (portal)       | La del refugio                       | Webhook de Orders `/donations/webhook/mercadopago` + relectura con el token              | Sí, `MERCADOPAGO_ORDERS_WEBHOOK_SECRET` | `(organizationId, idempotencyKey)` y `dedupKey` del webhook | **Real** + CI                 |
| Apadrinamiento mensual    | La del refugio                       | Sondeo (`SponsorshipPaymentPollerService`) de cada intento pendiente                     | n/a (consulta directa a la API)         | Un pago por periodo; el sondeo no duplica                   | CI · Pendiente real           |
| Guardería / custodia      | La del refugio                       | Mismo webhook de Orders, por `external_reference` (y la relectura de conciliación)       | Sí (Orders)                             | Un pago por cargo; el reverso queda auditado                | CI · Pendiente real           |
| Planes (Crece, Pro)       | AdoptaFácil                          | Webhook de Suscripciones `/billing/webhooks/mercadopago`; activa solo con cobro aprobado | Sí, `MERCADOPAGO_WEBHOOK_SECRET`        | Por `preapproval` y pago autorizado                         | CI · Pendiente sandbox y real |
| Café en línea             | AdoptaFácil                          | Webhook por pago `/coffee/webhooks/mercadopago` + relectura                              | Sí, `MERCADOPAGO_WEBHOOK_SECRET`        | Por pedido; el recibo usa `idempotencyKey` por pedido       | CI · Pendiente sandbox y real |
| Reembolsos y contracargos | Panel de Mercado Pago de quien cobró | La notificación de reverso actualiza `mercadopago_payments` y revierte el efecto         | Igual que el flujo de origen            | El reverso se aplica una vez                                | CI · Pendiente real           |

En todos los flujos, la API no confía en el cuerpo del aviso. Vuelve a consultar el pago con el token y compara
cobrador, monto, moneda y referencia antes de aplicar algo
(`apps/api/src/core/payments/mercadopago-payment.adapter.ts`).

**No hay botón de reembolso en AdoptaFácil.** Cada refugio reembolsa desde su propio Mercado Pago, y AdoptaFácil
reembolsa el café y los planes desde el suyo. Es coherente con no custodiar dinero. Si hace falta reembolsar
desde la plataforma, es trabajo nuevo.

## 2. Qué falta para cobrar dinero real

### Bloqueos que solo resuelve el dueño

| #   | Qué                                                                                                                                                                                                                   | Dónde                                    | Bloquea                                  |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- | ---------------------------------------- |
| D1  | App **Suscripciones** en Mercado Pago: Access token de producción → `MERCADOPAGO_PLATFORM_ACCESS_TOKEN`; webhook `https://adoptafacil.org/api/billing/webhooks/mercadopago` y su clave → `MERCADOPAGO_WEBHOOK_SECRET` | Panel de Mercado Pago → `deploy/api.env` | Planes y café                            |
| D2  | Confirmar en el panel de la app **Checkout Pro (Orders)** el webhook `https://adoptafacil.org/api/donations/webhook/mercadopago` (evento Order) y su clave → `MERCADOPAGO_ORDERS_WEBHOOK_SECRET`                      | Panel de Mercado Pago → `deploy/api.env` | Confirmar donaciones y guardería         |
| D3  | Usuarios de prueba (vendedor y comprador) y correr el guion del §3 en sandbox                                                                                                                                         | Panel de Mercado Pago                    | Planes, café, apadrinamiento y guardería |
| D4  | Concepto del abogado: términos para refugios (AdoptaFácil como software y mandatario técnico, sin custodia) y si OAuth sin `marketplace_fee` exige un contrato aparte con Mercado Pago ⚖️                             | Abogado                                  | Lanzamiento público                      |
| D5  | Contador: IVA y factura electrónica de planes y café; tratamiento del 20 % del margen del café que va a campañas 🧾                                                                                                   | Contador                                 | Cobrar planes y café                     |
| D6  | `PAYMENTS_PRODUCTION_APPROVAL_REF` con la referencia de la aprobación escrita del dueño                                                                                                                               | `deploy/api.env`                         | La API no enciende pagos sin ella        |
| D7  | `PLAN_ENFORCEMENT=true` cuando se decida cobrar planes (hoy todas las organizaciones tienen Pro gratis)                                                                                                               | `deploy/api.env`                         | Cobro de planes                          |
| D8  | Prueba de carga contra el servidor real (no se ha hecho)                                                                                                                                                              | VPS                                      | Capacidad declarada                      |

Las credenciales se pegan solo en `deploy/api.env` del VPS (`chmod 600`), nunca en el chat ni en el repositorio.

### Lo que verifica `pnpm mp:doctor` (solo lectura)

`pnpm mp:doctor` confirma que las variables existen, que `MERCADOPAGO_CLIENT_ID` y `MERCADOPAGO_CLIENT_SECRET` son
válidos, que el token de planes es de la cuenta correcta y de la app correcta, y muestra la `redirect_uri` y las
URLs de webhook exactas que hay que registrar. No imprime secretos, así que su salida se puede compartir.

## 3. Guion de prueba de punta a punta (sandbox, luego un cobro real pequeño)

Hazlo con `MERCADOPAGO_TEST=true` y un vendedor y un comprador de prueba. Repite cada caso con un cobro real de
bajo monto antes de anunciar.

1. **OAuth:** un refugio de prueba conecta el vendedor de prueba en Organización → Medios de pago. La conexión
   queda en estado conectado y el token se guarda cifrado.
2. **Donación:**
   - Dona con tarjeta aprobada. La donación queda aprobada una sola vez y el dinero llega al vendedor, no a AdoptaFácil.
   - Reenvía el webhook desde el panel. No debe duplicarse nada (respuesta `applied:false`).
   - Dona con tarjeta rechazada. La donación queda rechazada y no se genera recibo.
3. **Apadrinamiento:** crea uno mensual y paga el primer mes. En menos de un intervalo de sondeo, el periodo queda pagado.
4. **Guardería:** genera un enlace de pago de un cargo y págalo. El cargo queda pagado y la constancia dice
   "Pago en línea (Mercado Pago)".
5. **Plan:** con `PLAN_ENFORCEMENT=true`, paga Crece con el comprador de prueba.
   - El plan **solo** se activa al llegar `subscription_authorized_payment` aprobado.
   - Cancelar el preapproval marca el plan como cancelado.
6. **Café:** compra una bolsa en `/cafe`. El stock baja, llega el recibo por correo y se registra el aporte a la campaña elegida.
7. **Reembolso:** reembolsa la donación del punto 2 desde el panel del vendedor.
   - `mercadopago_payments.transaction_amount_refunded` refleja el valor.
   - El certificado de donación queda revocado.
8. **Firma inválida:** un POST a cada webhook con `x-signature` alterada responde 403 y no cambia nada.

Si falla un paso, el log de la API trae el motivo sin secretos. Busca `Mercado Pago` y `webhook`.
