# ADR-PAG-001 · Sin custodia: el dinero de una donación nunca pasa por AdoptaFácil

> Estado: **decidido por el dueño** (2026-10-08), vigente. La pasarela y su forma de conexión están en
> [ADR-PAG-003](./mercadopago-oauth.md) (Mercado Pago por OAuth, 2026-11-06).
> Esto no es asesoría jurídica ni tributaria.

## 1. Decisión

- AdoptaFácil **no recibe, no retiene ni transfiere** dinero de donaciones. Cada donación se cobra con la
  cuenta de pagos de la propia organización, así que el dinero llega directo a ella.
- AdoptaFácil **no cobra comisión** por donación (0 %, decisión del dueño). Su ingreso son los planes de
  la plataforma, que cobra con su propia cuenta.
- El donante ve el valor que dona, la tarifa que cobra Mercado Pago a la organización (con su IVA) y lo que
  recibe la organización. La tarifa es la que Mercado Pago reporta para ese pago, no un estimado.
- Solo una organización **aprobada** por la plataforma puede recibir donaciones.

## 2. Por qué

| Pregunta                     | Respuesta                                                                                                  |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------- |
| ¿Qué problema resuelve?      | Recibir dinero de terceros para entregarlo después exige una licencia financiera que AdoptaFácil no tiene. |
| ¿Qué riesgo evita?           | Custodia de fondos, conciliaciones de entrega y responsabilidad sobre dinero ajeno.                        |
| ¿Qué evidencia lo demuestra? | El pago se crea con el token de la cuenta de la organización (ADR-PAG-003, sección 2).                     |

## 3. Invariantes que el código hace cumplir

1. **Sin cuenta conectada no hay cobro.** Una organización sin Mercado Pago conectado no ofrece el botón de
   donar (`/public/donations/organizations/:id/availability`).
2. **Solo organizaciones aprobadas** pueden crear donaciones (409 en la API).
3. **Comisión de plataforma siempre 0.** El contrato rechaza cualquier campo de comisión (esquema estricto).
4. **Reversos restan.** Un reembolso o contracargo deja la donación fuera de totales, informes, campañas y
   exportes.

## 4. QR de donaciones

Cada organización tiene **una** URL de donación estable (`/o/:slug/donar`) y un QR que apunta a ella. El QR
lleva a AdoptaFácil, nunca a un enlace de la pasarela, así que un adhesivo impreso hoy sigue sirviendo si
la organización reconecta su cuenta. Contrato: `packages/contracts/src/donation-links.ts`.
