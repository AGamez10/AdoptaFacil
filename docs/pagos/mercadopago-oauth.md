# ADR-PAG-003 · Mercado Pago por OAuth: cada refugio cobra en su cuenta; AdoptaFácil cobra sus planes

> Estado: **decidido por el dueño** (2026-11-06). Implementado. Solo se probó con dobles de prueba, sin dinero real.
> Es la única pasarela del producto. Descarta el split 1:1.
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
- El pedido de Checkout Pro (`POST /v1/orders`, API de Orders) se crea con el token **del refugio** e incluye:
  - `external_reference` = `af-<hash>`;
  - `total_amount` y un solo ítem, en pesos con decimales (`"50000.00"`);
  - `config.online.success_url`, `pending_url` y `failure_url` hacia `/donaciones/resultado`, con
    `auto_return: approved`;
  - `expiration_time` de 3 días (`P3D`);
  - el correo del donante solo si lo dio. La respuesta trae `checkout_url`, adonde se redirige.
- Orders no tiene una URL de notificación por pedido: avisa a la única URL de la aplicación (sección 7).
- La web solo redirige a hosts de checkout de Mercado Pago (`isMercadoPagoCheckoutUrl`).
- **Webhook de Orders** (`POST /donations/webhook/mercadopago`, tópico `order`):
  1. Busca la donación por el `external_reference` que trae el aviso. Ese valor solo sirve para decidir con
     qué organización se consulta; no se confía en él para nada más.
  2. Valida `x-signature` con la clave de la aplicación de Orders
     (`MERCADOPAGO_ORDERS_WEBHOOK_SECRET`), con HMAC-SHA256 sobre
     `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`. Si falla, responde 403.
  3. Vuelve a consultar `GET /v1/orders/:id` con el token **de esa organización**: un pedido de otra cuenta
     no se puede leer (404) y se rechaza. Si el pedido informa `live_mode`, debe coincidir con
     `MERCADOPAGO_TEST`.
  4. Solo `processed` aprueba, y solo si lo pagado (`total_paid_amount`) es el total. `refunded`,
     `charged_back` y `canceled` anulan; `failed` rechaza; todo lo demás queda pendiente.
  5. Guarda el pago en `mercadopago_payments` (sección 5) con el id del pago del pedido (`PAY…`). La API de
     Orders no entrega comisión ni neto recibido: el desglose de la donación queda con el estimado de la
     creación, no con el real.
  6. Compara monto, moneda, organización y colector con la donación; aprueba una sola vez y emite un solo
     recibo. La idempotencia es `mercadopago:<id del pedido>:<status>`.
- **Webhook de preferencias** (`POST /donations/webhook/mercadopago/:orgId`): se conserva para los pagos
  creados antes de pasar a Orders. Valida con la clave compartida y consulta `GET /v1/payments/:id` con el
  token de la organización, exigiendo `collector_id` y `live_mode`. Mismo cierre que arriba.
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

| Variable                                     | Obligatoria             | Para qué                                                                                                                                              |
| -------------------------------------------- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PAYMENT_DRIVER=mercadopago`                 | sí                      | Activa el adaptador                                                                                                                                   |
| `MERCADOPAGO_CLIENT_ID`                      | sí 👤                   | App ID de la aplicación de AdoptaFácil en Mercado Pago                                                                                                |
| `MERCADOPAGO_CLIENT_SECRET`                  | sí 👤                   | Client secret de esa aplicación                                                                                                                       |
| `MERCADOPAGO_WEBHOOK_SECRET`                 | sí 👤                   | "Clave secreta" de Webhooks de la aplicación de **Suscripciones** (planes)                                                                            |
| `MERCADOPAGO_ORDERS_WEBHOOK_SECRET`          | recomendada 👤          | "Clave secreta" de Webhooks de la aplicación de **Checkout Pro (Orders)**; si falta se usa `MERCADOPAGO_WEBHOOK_SECRET`                               |
| `SIGNATURE_ENCRYPTION_KEY`                   | sí (ya existe)          | De ella se derivan la llave del `state` y la del cifrado de tokens                                                                                    |
| `API_PUBLIC_BASE_URL`                        | sí 👤                   | URL pública de la API, por ejemplo `https://api.adoptafacil.co`                                                                                       |
| `WEB_BASE_URL`                               | sí (ya existe)          | Destino de `back_urls` y del regreso del OAuth                                                                                                        |
| `MERCADOPAGO_PLATFORM_ACCESS_TOKEN`          | para cobrar planes 👤   | Access token de producción de la cuenta de **AdoptaFácil**                                                                                            |
| `MERCADOPAGO_OAUTH_REDIRECT_URI`             | no                      | Por defecto `${API_PUBLIC_BASE_URL}/org/mercadopago/callback`                                                                                         |
| `MERCADOPAGO_OAUTH_PKCE`                     | no (recomendado `true`) | Activa PKCE; debe coincidir con la app                                                                                                                |
| `MERCADOPAGO_TEST`                           | no                      | `true` = sandbox: pide `test_token` (las suscripciones usan `sandbox_init_point`)                                                                     |
| `MERCADOPAGO_OAUTH_TEST_TOKEN`               | no                      | Sin definir, sigue a `MERCADOPAGO_TEST`. Con `false` el intercambio no envía `test_token` (el modo sandbox y su validación de `live_mode` no cambian) |
| `MERCADOPAGO_STATEMENT_DESCRIPTOR`           | no                      | Hoy sin efecto en donaciones: la API de Orders no lo recibe en el pedido                                                                              |
| `MERCADOPAGO_BASE_URL` / `_AUTHORIZE_URL`    | no                      | Solo para pruebas; en producción solo se aceptan los de Mercado Pago                                                                                  |
| `MERCADOPAGO_TOKEN_REFRESH_WINDOW_DAYS`      | no                      | 30 por defecto                                                                                                                                        |
| `MERCADOPAGO_TOKEN_REFRESH_SCAN_INTERVAL_MS` | no                      | Una vez al día por defecto                                                                                                                            |

Web: `VITE_PAYMENT_PROVIDER=mercadopago` (es el valor por defecto; `off` apaga el botón de donar).

## 7. 👤 Pasos en el panel de desarrolladores de Mercado Pago

1. En [Tus integraciones](https://www.mercadopago.com.co/developers/panel/app), con la cuenta de AdoptaFácil,
   crea **dos aplicaciones**. El panel solo deja elegir una solución por aplicación:
   - **Checkout Pro** con **API de Orders**. Es la aplicación de OAuth: marca que es una plataforma o
     marketplace que cobra en nombre de terceros, para que se habilite. De ella salen `MERCADOPAGO_CLIENT_ID`,
     `MERCADOPAGO_CLIENT_SECRET` y `MERCADOPAGO_ORDERS_WEBHOOK_SECRET`.
   - **Suscripciones**. Cobra los planes de AdoptaFácil. De ella salen `MERCADOPAGO_PLATFORM_ACCESS_TOKEN` y
     `MERCADOPAGO_WEBHOOK_SECRET`.
2. En la aplicación de **Checkout Pro**, en **Redirect URL** (OAuth) pon exactamente
   `https://<api>/org/mercadopago/callback`, con el mismo valor que `MERCADOPAGO_OAUTH_REDIRECT_URI`.
3. Activa **PKCE** si vas a usar `MERCADOPAGO_OAUTH_PKCE=true`.
4. En **Webhooks** → Modo productivo (y de prueba):
   - aplicación de **Checkout Pro (Orders)**: URL `https://<api>/donations/webhook/mercadopago`, evento
     **Order (Mercado Pago)** (tópico `order`). Orders no admite una URL por pedido: esta es la única, y la
     organización se identifica por el `external_reference` del pedido. Copia su **clave secreta** a
     `MERCADOPAGO_ORDERS_WEBHOOK_SECRET`;
   - aplicación de **Suscripciones**: URL `https://<api>/billing/webhooks/mercadopago`, eventos
     **Planes y suscripciones** (`subscription_preapproval`, `subscription_authorized_payment`). Copia su
     **clave secreta** a `MERCADOPAGO_WEBHOOK_SECRET`.

   Los pagos creados antes de pasar a Orders (preferencias) siguen avisando a su propia URL
   `/donations/webhook/mercadopago/<organizationId>`, que se conserva hasta que venzan (72 horas).

5. Copia el App ID y el Client secret de la aplicación de Checkout Pro (Credenciales de producción) a
   `MERCADOPAGO_CLIENT_ID` y `MERCADOPAGO_CLIENT_SECRET`. Copia el Access token de producción de la aplicación
   de Suscripciones a `MERCADOPAGO_PLATFORM_ACCESS_TOKEN`.
6. **Sandbox antes de producción:**
   - crea usuarios de prueba (un vendedor por refugio de prueba y un comprador);
   - pon `MERCADOPAGO_TEST=true`;
   - conecta el vendedor de prueba desde Organización → Medios de pago;
   - dona con tarjetas de prueba.

   Si el entorno tiene una política de red, permite `api.mercadopago.com` y `auth.mercadopago.com.co`.

7. Entrega las credenciales por el gestor de secretos del despliegue, nunca en el chat ni en el repositorio.

## 7b. "La aplicación no está preparada para conectarse a Mercado Pago"

Es la página que muestra Mercado Pago cuando la URL de autorización no cuadra con la aplicación. Al arrancar,
la API registra la línea `Mercado Pago OAuth: client_id=… redirect_uri=… pkce=… sandbox=…` (sin secretos);
compárala carácter por carácter con el panel. Revisa en este orden:

1. **`redirect_uri` idéntico.** Tiene que estar en "URLs de redireccionamiento" de la **misma** aplicación cuyo
   App ID es `MERCADOPAGO_CLIENT_ID`: mismo esquema, host, puerto, ruta y sin `/` final de más. Si la API no
   tiene `API_PUBLIC_BASE_URL` ni `MERCADOPAGO_OAUTH_REDIRECT_URI`, el valor por defecto es
   `http://localhost:3000/org/mercadopago/callback`, que no está registrado y casi seguro no se puede registrar.
2. **`client_id` correcto.** Es el App ID (número) de la aplicación de **Checkout Pro**, no el de la de
   Suscripciones ni el de un usuario de prueba, y no el Access token.
3. **La aplicación admite OAuth.** Al crearla se marcó que es una plataforma o marketplace que cobra en nombre de
   terceros. Si no, hay que crear otra aplicación con esa opción.
4. **PKCE igual en los dos lados.** Si la aplicación tiene PKCE activo, `MERCADOPAGO_OAUTH_PKCE=true`.
5. Si todo lo anterior cuadra, prueba con `MERCADOPAGO_AUTHORIZE_URL=https://auth.mercadopago.com/authorization`
   (el host sin país que hoy muestra la documentación).

Cada vez que se toca "Conectar Mercado Pago", la API también escribe en el log cuatro líneas
`Mercado Pago OAuth authorize: …` con el `redirect_uri` crudo, el `redirect_uri` codificado tal como se envía,
si está codificado una sola vez y si termina en `/`, y la URL completa con el `state` oculto. Al arrancar
muestra además de qué variable sale el `client_id` y a qué app pertenece `MERCADOPAGO_PLATFORM_ACCESS_TOKEN`
(solo el App ID público, nunca el token). Si Mercado Pago devuelve `error` o `error_description` al callback, o
el cambio de código por token falla, también quedan en el log, recortados y sin el código ni los secretos. El
valor que hay que registrar en el panel es exactamente el de `redirect_uri (raw)`.

**Probar en local:** Mercado Pago tiene que poder volver al navegador por https. Con el túnel de la web
(`vite` ya reenvía `/api/*` a la API), registra en la aplicación `https://<túnel>/api/org/mercadopago/callback`
y pon ese mismo valor en `MERCADOPAGO_OAUTH_REDIRECT_URI`. En la web pon `VITE_API_URL=/api` y abre la app por la
URL del túnel, no por `localhost`. La cookie `af_mp_oauth` queda en el mismo dominio
del túnel, así que el callback la recibe. Si el túnel cambia de dominio, hay que actualizar las dos cosas. Inicia
sesión en Mercado Pago con el **vendedor de prueba** antes de tocar "Conectar" y deja `MERCADOPAGO_TEST=true`.

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
