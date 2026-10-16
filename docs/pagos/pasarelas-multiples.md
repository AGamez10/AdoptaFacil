# ADR-PAG-001 · Recaudo con varias pasarelas, sin custodia

> Estado: **decidido por el dueño** (2026-10-08) e implementado para Mercado Pago, apagado. No activa dinero real.
> **2026-10-15:** el dueño eligió ePayco como pasarela principal; ver [ADR-PAG-002](./epayco.md). Este ADR (sin
> custodia, comisión 0 % en modo directo) sigue mandando para todas las pasarelas.
> Contrato: `packages/contracts/src/payment-gateways.ts` · pruebas: `packages/contracts/test/payment-gateways.test.ts`.
> No es asesoría jurídica ni tributaria: lo marcado ⚖️ va al abogado y lo marcado 🧾 al contador.

## 1. Problema

El dueño decidió salir con recaudo de dinero real desde el primer lanzamiento y no depender del 4 % al
inicio (planes y suscripciones). Hoy el código cobra **todo** con el token de la cuenta de Mercado Pago de
AdoptaFácil y solo marca `integration_data.sponsor.id`; el dinero queda en la cuenta de la plataforma
(custodia). Eso contradice D1/D2 y es STOP según §3.4 del PROMPT_MAESTRO (auditoría `08b_PAYMENTS_AUDIT.md`,
PAY-001).

Mercado Pago respondió por escrito el 2026-10-01 que el Split de Pagos 1:1 **no está activo para Colombia
(MCO)**, que `sponsor.id` es solo trazabilidad y que la alternativa es recaudar el 100 % en la cuenta del
marketplace y transferir después. Esa alternativa **es custodia**, así que queda descartada.

## 2. Qué dicen las fuentes (consultadas el 2026-10-08)

| Pasarela                                                               | ¿El dinero llega directo a la organización?                                                                                  | ¿Puede descontar la comisión de AdoptaFácil en origen?                                                              | Fuente                                                                                                                                                                                                                                                                                | Estado                                                                                                                                                                                                                       |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Mercado Pago, credenciales de la organización (OAuth)**              | **Sí**: el pago se crea con el `access_token` del vendedor obtenido por OAuth, así que el cobrador es la organización.       | Solo con `application_fee` (Checkout API, `/v1/payments`) o `marketplace_fee` (Checkout Pro), que es el Split 1:1.  | [Integrar checkout en Split](https://www.mercadopago.com.co/developers/es/docs/split-payments/split-1-1/integration-configuration/integrate-marketplace), [requisitos (KYC nivel 6, OAuth)](https://www.mercadopago.com.co/developers/es/docs/split-payments/split-1-1/prerequisites) | Directo sin comisión: documentado, falta prueba sandbox. Con comisión: **no disponible en MCO** según soporte, aunque la [landing](https://www.mercadopago.com.co/developers/es/docs/split-payments/landing) lista Colombia. |
| **Wompi (llaves propias de la organización)**                          | Sí, si la organización tiene su propio comercio Wompi: las llaves van atadas a una cuenta de negocio.                        | No hay split documentado. "Payouts / pagos a terceros" es recaudar y luego pagar, o sea custodia.                   | [Inicio rápido](https://docs.wompi.co/en/docs/colombia/inicio-rapido/), [Payouts](https://wompi.com/es/co/soluciones/payouts)                                                                                                                                                         | Directo: documentado. Split: no existe.                                                                                                                                                                                      |
| **ePayco "Pagos divididos"**                                           | En el modelo uno a uno, "el dinero llega directamente al destinatario"; los receptores deben tener la cuenta 100 % validada. | Sí, fija o porcentual (`split_type`, `split_receivers[].fee`).                                                      | [Docs split](https://docs.epayco.com/docs/split-descripcion), [producto](https://epayco.com/pagos-divididos/)                                                                                                                                                                         | Requiere activación comercial (modelos agregador/gateway, cita con soporte). Candidato para el 4 % futuro.                                                                                                                   |
| **Bold**                                                               | Sí, con llaves del propio comercio (botón de pagos, API de links de pago).                                                   | No hay split documentado.                                                                                           | [Llaves de integración](https://developers.bold.co/pagos-en-linea/llaves-de-integracion)                                                                                                                                                                                              | Para el lanzamiento: como enlace externo.                                                                                                                                                                                    |
| **PayU Latam**                                                         | API por comercio.                                                                                                            | No encontramos marketplace/split para Colombia en la documentación pública (el "Marketplace" de PayU es de Europa). | [Payments API Colombia](https://developers.payulatam.com/latam/en/docs/integrations/api-integration/payments-api-colombia.html)                                                                                                                                                       | Fuera del lanzamiento.                                                                                                                                                                                                       |
| **Mercado Pago Suscripciones** (para cobrar los planes de AdoptaFácil) | Es ingreso propio de AdoptaFácil, no donación.                                                                               | —                                                                                                                   | [Suscripciones (lista CO)](https://www.mercadopago.com.co/developers/es/docs/subscriptions/landing)                                                                                                                                                                                   | Documentado.                                                                                                                                                                                                                 |

Nota sobre la prueba anterior del equipo: usó **Orders API con `sponsor.id`**, que no es el mecanismo de
split. La documentación colombiana del split habla de **`/v1/payments` con el token del vendedor**. Vale la
pena una sola prueba en sandbox de ese camino y mandar a Mercado Pago lo que pidieron (sección 7), pero el
lanzamiento **no depende** de esa respuesta.

## 3. Decisión

**Cada organización cobra con su propia cuenta y ve el dinero en el instante en que le donan. AdoptaFácil
vive de planes de suscripción.** Decidido por el dueño el 2026-10-08.

- Cada organización conecta **su propia** pasarela. La donación se cobra con las credenciales de la
  organización: la organización es el comercio (merchant of record), recibe el dinero en su cuenta y paga
  su propia tarifa de pasarela. AdoptaFácil **nunca** recibe ni retiene una donación.
- Comisión de AdoptaFácil por transacción: **0 %**. El ingreso sale de **planes mensuales** que AdoptaFácil
  le cobra a la organización con su propia cuenta (ingreso propio, con factura electrónica 🧾). El catálogo,
  precios y cobro de planes los lleva el hilo "Planes y suscripciones" con un puerto aparte del de
  donaciones.
- El **4 %** se enciende después, solo con split en origen confirmado por escrito (ePayco o Mercado Pago si
  activa MCO). El contrato ya lo exige: sin `splitApprovalRef`, `platform_split` se rechaza.
- **Organizaciones informales** (persona natural, sin RUT) **sí pueden recaudar** (decisión del dueño, D6).
  Reciben un **comprobante de donación sin efecto tributario**; el certificado tributario sigue reservado a
  ESAL con RTE verificado por la plataforma (D9). El riesgo legal queda anotado en la sección 6.

Por qué esta y no otra:

| Pregunta (§3.7)              | Respuesta                                                                                                                          |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| ¿Qué problema resuelve?      | Permite recaudar dinero real ya, con varias pasarelas, sin esperar a Mercado Pago.                                                 |
| ¿Qué riesgo elimina?         | La custodia de fondos de terceros (PAY-001) y el bloqueo comercial por un solo proveedor.                                          |
| ¿Qué evidencia lo demuestra? | Tabla de la sección 2 y la respuesta escrita de Mercado Pago del 2026-10-01.                                                       |
| ¿Qué cuesta?                 | Un adaptador por pasarela, una migración (conexiones por organización), cifrado de credenciales, un flujo de conexión en el panel. |
| ¿Qué pasa si no lo hacemos?  | O se sale con custodia (ilegal o muy riesgoso ⚖️), o no se sale con dinero.                                                        |

Lo que se pierde: el 4 % en la fase inicial y la experiencia de "un solo checkout" idéntico para todas las
organizaciones (cada una ve el checkout de su pasarela).

## 4. Arquitectura de adaptadores

```
             web (Donar)                     panel de la organización
                 │                                    │ conectar pasarela
                 ▼                                    ▼
      DonationsService ── planCollection() ──► OrgGatewayConnection (por tenant, RLS)
                 │            (contrato puro)          │ credenciales cifradas (AF-014)
                 ▼                                     │
        GatewayRegistry.get(provider) ◄────────────────┘
          ├─ MercadoPagoDirectAdapter   (OAuth de la org, /v1/payments, sin fee)
          ├─ WompiDirectAdapter         (llaves de la org, firma de integridad + eventos)
          ├─ EpaycoSplitAdapter         (apagado: exige splitApprovalRef)
          ├─ ExternalLinkAdapter        (solo redirige; no verificable)
          └─ DisabledAdapter            (503; valor por defecto en producción)
                 │
                 ▼
     webhook firmado → leer el pago en la API de la pasarela con la credencial de ESA org
                 → findPaymentMismatches() (monto, moneda, cuenta receptora, referencia)
                 → aprobado | revisión + alerta
```

Reglas que el contrato ya fija y las pruebas cubren:

1. **No existe modo de custodia.** `CollectionPlan.collector` solo puede ser `'organization'`.
2. **Sin conexión activa de la propia organización, no hay botón Donar.** Se acaba el camino actual "si la
   organización no conectó, cobra la plataforma" (`donations.service.ts:200-217`).
3. **Comisión solo con split en origen y aprobación escrita** (`split_without_written_approval`).
4. **Un pago se aprueba solo si cuadra**: la cuenta que recibió el dinero debe ser la de la organización
   (alarma de custodia), y monto, moneda y referencia deben coincidir (PAY-003).
5. **Enlaces externos** (Bold, Nequi, ePayco, botón del banco) se muestran como "aportes reportados por la
   organización", nunca como confirmados por AdoptaFácil.

Lo que cambia en la API (siguiente PR, no este):

- Nueva tabla `org_payment_gateways` (una migración, con token de migración): `organization_id`, `provider`,
  `mode`, `status`, `gateway_account_id`, credenciales cifradas con `DATA_ENCRYPTION_KEY`, RLS `ENABLE` +
  `FORCE` + `tenant_isolation`, cubierta por `rls-no-leak`.
- `PaymentPort` sigue igual (contrato aditivo); se añade un `GatewayRegistry` y adaptadores con la
  credencial de la organización como argumento, nunca global.
- Webhooks por organización y pasarela: `/payments/webhooks/:provider/:connectionId`, firma verificada con
  el secreto de esa conexión, ventana anti-replay, idempotencia por evento, lectura de vuelta del pago.
- Solo Owner o Administrator conectan o revocan una pasarela; cada cambio queda en auditoría (sin
  secretos).
- `PAYMENT_FEE_CONFIG` deja de mostrar la tarifa de Wompi como si fuera de Mercado Pago (AF-022): en modo
  directo el desglose muestra "tarifa de tu pasarela según tu contrato" y comisión AdoptaFácil 0.
- Payouts T+1 y cuentas bancarias salen del flujo de donaciones (eran la pieza de custodia).

## 5. Orden de lanzamiento

1. **Mercado Pago directo por OAuth.** Ya existe el flujo de conexión (`mercadopago-connect.service.ts`) y el
   Card Payment Brick; hay que cobrar con el token de la organización en vez del de la plataforma.
2. **Enlace externo** como respaldo para organizaciones sin Mercado Pago (cero secretos, cero integración).
3. **Wompi directo** con las llaves de la organización.
4. **Planes de AdoptaFácil** con Mercado Pago Suscripciones en la cuenta de AdoptaFácil.
5. **ePayco split (4 %)** cuando ePayco lo active por escrito.

## 6. Revisión legal y tributaria pendiente

- ⚖️ Que AdoptaFácil actúe como proveedor tecnológico y la organización como comercio: términos con la
  organización, responsabilidad frente al donante, reembolsos y contracargos (los asume la organización).
- ⚖️ Fundaciones informales (persona natural) recibiendo donaciones en su cuenta personal (D6): sigue apagado
  por flag hasta concepto.
- ⚖️ Guardar tokens OAuth y llaves de comercio de terceros: obligaciones de seguridad y cláusula en los
  términos; Ley 1581 para los datos del donante que se comparten con la organización (quién es responsable y
  quién encargado).
- ⚖️ Aviso al donante: a quién le paga, quién emite el recibo y qué pasa si pide reversión.
- 🧾 Facturación electrónica de los planes (ingreso propio de AdoptaFácil), IVA del plan, y tratamiento del
  4 % cuando exista split.
- 🧾 Certificados de donación: siguen siendo de la organización (D9) y apagados.

## 7. Qué necesita el dueño entregar (sin pegar secretos en el chat)

| Qué                                                                                                           | Para qué                                                  | Cómo entregarlo                                                                                                                                                                                                                                                               |
| ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Elegir la opción de lanzamiento                                                                               | Arrancar la implementación                                | Responder en el hilo.                                                                                                                                                                                                                                                         |
| `client_id` y `client_secret` de la app de Mercado Pago (App ID 1063908913630070), en modo **prueba** primero | OAuth de las organizaciones en sandbox                    | Como variables de entorno del entorno cloud del proyecto (Configuración del proyecto → Entorno cloud → variables), nombres `MERCADOPAGO_CLIENT_ID`, `MERCADOPAGO_CLIENT_SECRET`, `MERCADOPAGO_WEBHOOK_SECRET`. En el VPS, en el `.env` del servidor, nunca en el repositorio. |
| Dos cuentas de prueba de Mercado Pago (vendedor y comprador)                                                  | Probar que el dinero llega a la cuenta de la organización | Se crean en "Tus integraciones → Cuentas de prueba"; basta con decir que existen y dejar sus credenciales como variables de entorno.                                                                                                                                          |
| 2–3 organizaciones piloto y qué pasarela tiene cada una                                                       | Priorizar adaptadores                                     | Responder en el hilo (nombres, no credenciales).                                                                                                                                                                                                                              |
| Respuesta a Mercado Pago con lo que pidieron                                                                  | Cerrar la duda del split en MCO                           | Enviar desde la cuenta del dueño el `order_id`, el cuerpo del `POST /v1/orders` sin datos de tarjeta y si se habilitó el flujo de autorización de marketplace; preguntar además por `/v1/payments` con `application_fee` y el token OAuth del vendedor.                       |
| Solicitud a ePayco de "Pagos divididos"                                                                       | Ruta del 4 %                                              | Cita comercial desde la cuenta del dueño.                                                                                                                                                                                                                                     |
| Precio y alcance de cada plan                                                                                 | Configurar planes (D7)                                    | En el hilo "Planes y suscripciones".                                                                                                                                                                                                                                          |
| Abogado y contador                                                                                            | Sección 6                                                 | Concepto escrito; su referencia va en `PAYMENTS_PRODUCTION_APPROVAL_REF`.                                                                                                                                                                                                     |

## 8. Qué hace este PR y qué no

Hace:

- Este documento y el contrato aditivo `payment-gateways.ts` (vocabulario, catálogo con fuentes,
  `planCollection`, `findPaymentMismatches`).
- `computeBreakdown` acepta tarifas opcionales y publica `DIRECT_COLLECTION_RATES` (comisión de plataforma
  0). Sin argumentos se comporta igual que antes.
- **Mercado Pago cobra con el token OAuth de la organización** (`mercadopago-payment.adapter.ts`). Sin cuenta
  conectada el adaptador real se niega a cobrar; ya no existe el camino "cobra la plataforma". Se retira
  `integration_data.sponsor.id`.
- Las donaciones con driver real exigen que la organización haya conectado su cuenta (409 si no).
- El webhook se verifica con el secreto de la app, ubica la organización por la cuenta notificada (función
  `mercadopago_account_organization_id`, una migración, solo devuelve el id de la organización), relee la
  orden **con el token de esa organización** y no aprueba si la organización, el monto o la moneda no
  cuadran (auditoría `donation.payment_mismatch`). Una cuenta conectada a dos organizaciones se ignora.
- El log del webhook ya no imprime la cola del secreto ni la firma calculada (AF-032).
- La web deja de mostrar el "4 %" y dice que AdoptaFácil no cobra comisión por la donación; el comprobante
  dice "No es un certificado tributario".

No hace (siguientes pasos):

- Prueba en sandbox: la red de este entorno bloquea `api.mercadopago.com`. Pendiente de habilitar ese
  dominio o de correrla en el equipo del dueño.
- Apadrinamientos: siguen llamando al puerto sin la cuenta de la organización, así que con el driver real
  fallan cerrados. Están apagados por flag; se conectan en el PR siguiente.
- Impedir que la misma cuenta de Mercado Pago se conecte a dos organizaciones (hoy se detecta y se ignora en
  el webhook).
- Wompi y enlace externo; payouts T+1 y cuentas bancarias siguen en el código, apagados.
- No activa pagos: los flags del PR de arranque seguro siguen mandando.

Reversión: revertir el PR. La migración solo crea una función de lectura; su reversión es
`DROP FUNCTION mercadopago_account_organization_id(TEXT);`.
