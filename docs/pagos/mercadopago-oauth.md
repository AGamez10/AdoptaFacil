# ADR-PAG-003 · Mercado Pago por OAuth: cada refugio cobra en su cuenta; AdoptaFácil cobra sus planes

> Estado: **decidido por el dueño** (2026-11-06). Implementado. Solo se probó con dobles de prueba, sin dinero real.
> Reemplaza la parte de [ADR-PAG-002](./epayco.md) que retiró Mercado Pago (2026-10-17). Descarta el split 1:1.
> [ADR-PAG-001](./pasarelas-multiples.md) (sin custodia) sigue vigente.
> Esto no es asesoría jurídica ni tributaria. Lo marcado ⚖️ va al abogado y lo marcado 🧾 al contador.
> Lo marcado 👤 lo tiene que hacer el dueño.

## 1. Decisión

- Se descarta el split 1:1.
- Cada refugio conecta **su propia** cuenta de Mercado Pago por OAuth, en Organización → Medios de pago.
- Cada donación hecha desde el portal público del refugio se cobra con el token de esa cuenta. El dinero llega
  directo al refugio y **nunca pasa por AdoptaFácil**. AdoptaFácil no cobra comisión por donación: el desglose
  usa `DIRECT_COLLECTION_RATES`, con tarifa de plataforma 0.
- AdoptaFácil cobra **sus planes** (Crece, Pro) con **su propia** cuenta de Mercado Pago, como suscripción
  mensual (preapproval).
- AdoptaFácil hace la contabilidad de cada refugio por detrás. Para eso guarda en `mercadopago_payments` una
  copia de cada pago tal como lo devuelve Mercado Pago al consultarlo (sección 5).
- ePayco sigue en el código y se puede elegir con `PAYMENT_DRIVER=epayco` / `VITE_PAYMENT_PROVIDER=epayco`.

## 2. Flujo OAuth (conectar la cuenta del refugio)

1. Owner/Admin toca "Conectar Mercado Pago". La web pide `GET /org/mercadopago/connect`, que responde con la
   `authorizeUrl` (`https://auth.mercadopago.com.co/authorization`). Luego navega a esa página completa.
2. El `state` es un sobre sellado con AES-256-GCM. La llave se deriva con HKDF de
   `SIGNATURE_ENCRYPTION_KEY`. El sobre lleva la organización, el usuario, un nonce, el verificador PKCE y un
   vencimiento de 10 minutos. Si alguien lo altera o expira, no se conecta nada (anti-CSRF).
   - **Ligado al navegador:** `/connect` deja una cookie HttpOnly (`af_mp_oauth`) y el `state` lleva su hash.
     El callback solo acepta el `state` en el navegador que lo pidió, así que un enlace de autorización
     filtrado (pantalla compartida, historial, reenviado) no sirve en otro equipo.
   - **Un solo uso:** el nonce del `state` se consume en Redis en el primer callback. Una repetición responde
     `expired`.
   - **Rol vigente:** al volver, la persona que inició la conexión debe seguir siendo Owner o Administrator de
     la organización.
3. PKCE (S256) se activa con `MERCADOPAGO_OAUTH_PKCE=true`. Hay que activarlo **también** en la app de
   Mercado Pago.
4. Mercado Pago vuelve a `GET /org/mercadopago/callback`. La API cambia el `code` por el par de tokens en
   `POST /oauth/token` y guarda ambos cifrados (AES-256-GCM) en `organization_mercadopago_connections`
   (con RLS). Después redirige a `/organizacion?tab=pagos&mercadopago=<resultado>`.
5. Una misma cuenta de Mercado Pago solo puede estar conectada a una organización (`mp_user_id` es UNIQUE).
   Si se intenta conectar a otra, el resultado es `already_linked`.
6. **Renovación.**
   - Un job diario (`mercadopago-token-refresh`) renueva los tokens que vencen dentro de
     `MERCADOPAGO_TOKEN_REFRESH_WINDOW_DAYS` (30 por defecto). Antes de cobrar, también se renueva en línea
     si faltan menos de 5 minutos.
   - Si Mercado Pago responde `invalid_grant`, la conexión queda `needs_reconnect`, las donaciones se pausan
     (409) y el panel pide reconectar.
7. **Desconectar.** `DELETE /org/mercadopago/connect` borra los tokens. Mercado Pago no tiene un endpoint de
   revocación, así que la UI le dice al refugio que también puede quitar la app desde Seguridad →
   Aplicaciones conectadas.
8. Los tokens nunca se registran en logs ni en auditoría, ni se devuelven a la web.
9. **Modo real o sandbox.** La concesión debe traer `live_mode` acorde a `MERCADOPAGO_TEST`: con
   `MERCADOPAGO_TEST=false` solo se aceptan cuentas reales y con `true` solo usuarios de prueba. Si no
   coincide, el callback responde `error` y no guarda nada. Una conexión guardada en el otro modo no cobra
   hasta que el refugio reconecta. En producción, la API pública (`API_PUBLIC_BASE_URL`, o
   `STORAGE_PUBLIC_BASE_URL` como respaldo) y `MERCADOPAGO_OAUTH_REDIRECT_URI` deben ser `https`.
10. Toda llamada a Mercado Pago tiene un límite de 10 s (`mercadopago-http.ts`).

## 3. Donaciones

- Si el refugio no tiene cuenta conectada y activa, `POST /donations` responde 409 y el portal oculta el pago
  en línea. No hay respaldo con la cuenta de la plataforma.
- La preferencia de Checkout Pro se crea con el token **del refugio** e incluye:
  - `external_reference` = `af-<hash>`;
  - `notification_url` = `https://<api>/donations/webhook/mercadopago/<orgId>`;
  - `back_urls` a `/donaciones/resultado`;
  - vencimiento a 72 h.
- La web solo redirige a hosts de checkout de Mercado Pago (`isMercadoPagoCheckoutUrl`).
- **Webhook** (`POST /donations/webhook/mercadopago/:orgId`):
  1. Valida `x-signature` con HMAC-SHA256 sobre `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`. Si
     falla, responde 403.
  2. Vuelve a consultar `GET /v1/payments/:id` con el token **de esa organización**. Exige que
     `collector_id` sea la cuenta conectada y que `live_mode` coincida con `MERCADOPAGO_TEST`: un pago de
     prueba nunca aprueba una donación real.
  3. Guarda el pago en `mercadopago_payments` (sección 5).
  4. Compara monto, moneda, organización y colector con la donación. Si algo no cuadra, audita
     `donation.payment_mismatch` y no aprueba.
  5. Aprueba la donación una sola vez y emite un solo recibo. La idempotencia es por organización y
     `mercadopago:<id>:<status>`.
- **Reembolsos y contracargos** (`refunded`, `charged_back`, `cancelled`): quedan una vez en
  `donation_reversals` (append-only, con RLS) y se auditan como `donation.reversed_at_gateway`. La donación
  aprobada y su recibo no se reescriben, porque son el registro de lo que pasó. Pero:
  - el **certificado** de esa donación queda **anulado** (`donation.certificate_revoked`): la verificación
    pública y las vistas del donante lo muestran como "Anulado", con la fecha;
  - no se emiten certificados nuevos para esa donación, ni automáticos ni a pedido de la organización.
    🧾 Pendiente de definir con el contador: un estado propio `refunded`/`charged_back` en la donación (sería
    un PR de seguimiento).

## 4. Planes (cuenta de AdoptaFácil)

- `POST /org/plan/checkout` (Owner/Admin) crea un preapproval mensual en COP, IVA incluido, con el
  descuento de fundador si aplica. Usa `MERCADOPAGO_PLATFORM_ACCESS_TOKEN`.
- `POST /billing/webhooks/mercadopago` valida la firma y vuelve a consultar con el token de la plataforma.
  Comprueba el monto, que la moneda sea COP y que la frecuencia sea mensual. El plan se **activa y extiende
  solo con un cobro aprobado** (`subscription_authorized_payment`): un preapproval autorizado sin cobro no
  activa nada, así que si el primer cobro falla no hay mes gratis. La cancelación o pausa del preapproval
  marca el plan como cancelado. Todo se audita.
- Mientras `PLAN_ENFORCEMENT` está apagado (piloto: todas las organizaciones tienen Pro gratis),
  `POST /org/plan/checkout` responde 409 y la web no muestra el botón de pago.
- Una cancelación solo afecta la suscripción que creó ese preapproval.

## 5. Conciliación: `mercadopago_payments`

Hay una fila por organización y pago de Mercado Pago, y se actualiza en cada notificación. La tabla tiene
RLS. El rol de la app puede SELECT, INSERT y UPDATE. DELETE y TRUNCATE se rechazan para todo rol (trigger),
y la FK hacia `organizations` es `RESTRICT`: no se puede borrar una organización que tenga pagos
registrados, para conservar el soporte contable.

Campos: `mp_payment_id`, `collector_id`, `external_reference`, `donation_id` (si cuadra con una donación
de la misma organización), `status`, `status_detail`, `currency`, `transaction_amount`,
`net_received_amount`, `transaction_amount_refunded`, `fee_details` (JSON), `refunds` (JSON),
`payment_type_id`, `payment_method_id`, `date_approved`, `money_release_date`.

No se guarda ningún dato del pagador. Los pagos que no cuadran también se guardan, porque son justo lo que
la conciliación tiene que ver.

## 6. Variables de entorno (API)

Nunca van en el repositorio. Se cargan como secretos del despliegue.

| Variable                                     | Obligatoria             | Para qué                                                             |
| -------------------------------------------- | ----------------------- | -------------------------------------------------------------------- |
| `PAYMENT_DRIVER=mercadopago`                 | sí                      | Activa el adaptador                                                  |
| `MERCADOPAGO_CLIENT_ID`                      | sí 👤                   | App ID de la aplicación de AdoptaFácil en Mercado Pago               |
| `MERCADOPAGO_CLIENT_SECRET`                  | sí 👤                   | Client secret de esa aplicación                                      |
| `MERCADOPAGO_WEBHOOK_SECRET`                 | sí 👤                   | "Clave secreta" de Webhooks de la aplicación (firma `x-signature`)   |
| `SIGNATURE_ENCRYPTION_KEY`                   | sí (ya existe)          | De ella se derivan la llave del `state` y la del cifrado de tokens   |
| `API_PUBLIC_BASE_URL`                        | sí 👤                   | URL pública de la API, por ejemplo `https://api.adoptafacil.co`      |
| `WEB_BASE_URL`                               | sí (ya existe)          | Destino de `back_urls` y del regreso del OAuth                       |
| `MERCADOPAGO_PLATFORM_ACCESS_TOKEN`          | para cobrar planes 👤   | Access token de producción de la cuenta de **AdoptaFácil**           |
| `MERCADOPAGO_OAUTH_REDIRECT_URI`             | no                      | Por defecto `${API_PUBLIC_BASE_URL}/org/mercadopago/callback`        |
| `MERCADOPAGO_OAUTH_PKCE`                     | no (recomendado `true`) | Activa PKCE; debe coincidir con la app                               |
| `MERCADOPAGO_TEST`                           | no                      | `true` = sandbox: pide `test_token` y usa `sandbox_init_point`       |
| `MERCADOPAGO_STATEMENT_DESCRIPTOR`           | no                      | Texto en el extracto (hasta 22 caracteres)                           |
| `MERCADOPAGO_BASE_URL` / `_AUTHORIZE_URL`    | no                      | Solo para pruebas; en producción solo se aceptan los de Mercado Pago |
| `MERCADOPAGO_TOKEN_REFRESH_WINDOW_DAYS`      | no                      | 30 por defecto                                                       |
| `MERCADOPAGO_TOKEN_REFRESH_SCAN_INTERVAL_MS` | no                      | Una vez al día por defecto                                           |

Web: `VITE_PAYMENT_PROVIDER=mercadopago` (es el valor por defecto; `epayco` u `off` cambian la pasarela).

## 7. 👤 Pasos en el panel de desarrolladores de Mercado Pago

1. En [Tus integraciones](https://www.mercadopago.com.co/developers/panel/app), con la cuenta de AdoptaFácil,
   crea una aplicación de tipo "Pagos online" con **Checkout Pro** y **Suscripciones**. Marca que es una
   plataforma o marketplace que cobra en nombre de terceros, para que se habilite OAuth.
2. En **Redirect URL** (OAuth) pon exactamente `https://<api>/org/mercadopago/callback`, con el mismo valor
   que `MERCADOPAGO_OAUTH_REDIRECT_URI`.
3. Activa **PKCE** si vas a usar `MERCADOPAGO_OAUTH_PKCE=true`.
4. En **Webhooks** → Modo productivo (y de prueba):
   - URL: `https://<api>/billing/webhooks/mercadopago`;
   - eventos: **Planes y suscripciones** (`subscription_preapproval`, `subscription_authorized_payment`);
   - copia la **clave secreta** a `MERCADOPAGO_WEBHOOK_SECRET`.

   Las donaciones no necesitan esta configuración, porque cada preferencia lleva su propia `notification_url`.

5. Copia el App ID y el Client secret (en Credenciales de producción) a `MERCADOPAGO_CLIENT_ID` y
   `MERCADOPAGO_CLIENT_SECRET`. Copia el Access token de producción a `MERCADOPAGO_PLATFORM_ACCESS_TOKEN`.
6. **Sandbox antes de producción:**
   - crea usuarios de prueba (un vendedor por refugio de prueba y un comprador);
   - pon `MERCADOPAGO_TEST=true`;
   - conecta el vendedor de prueba desde Organización → Medios de pago;
   - dona con tarjetas de prueba.

   Si el entorno tiene una política de red, permite `api.mercadopago.com` y `auth.mercadopago.com.co`.

7. Entrega las credenciales por el gestor de secretos del despliegue, nunca en el chat ni en el repositorio.

## 8. Pendiente legal y contable

- ⚖️ Los términos para refugios deben decir:
  - que AdoptaFácil actúa como **software y mandatario técnico** que crea cobros en su nombre;
  - que el dinero llega directo a su cuenta;
  - que el refugio es el receptor de la donación y quien emite el certificado.
- ⚖️ Hay que confirmar con Mercado Pago que el uso de OAuth sin `marketplace_fee` no exige un contrato de
  marketplace aparte.
- 🧾 Las donaciones no son ingresos de AdoptaFácil. Solo lo son los planes, que llevan IVA y factura
  electrónica de AdoptaFácil.
- 🧾 La contabilidad "por detrás" es un servicio de software. Falta definir con el contador el libro auxiliar
  por refugio construido sobre `mercadopago_payments` (bruto, comisión de Mercado Pago, neto, fecha de
  liberación, reversos).
