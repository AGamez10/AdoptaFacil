# ADR-PAG-002 · ePayco como pasarela principal, QR por refugio y planes

> Estado: **decidido por el dueño** (2026-10-15). Implementado detrás de flag, apagado. No activa dinero real.
> Complementa a [ADR-PAG-001](./pasarelas-multiples.md) (sin custodia), que sigue mandando.
> No es asesoría jurídica ni tributaria: lo marcado ⚖️ va al abogado y lo marcado 🧾 al contador.

## 1. Decisión del dueño

El 2026-10-15 el dueño decidió:

- Usar **ePayco** como pasarela principal, por su dispersión, el split 1:1 y el cobro de suscripciones
  mensuales.
- Dar a cada refugio un **QR propio** que lleve a su comunidad a la página de donación, con los medios de
  pago que ofrezca la pasarela.

~~Mercado Pago queda como segunda opción, con el mismo cobro directo de ADR-PAG-001.~~

**2026-10-17:** Mercado Pago retirado del producto por decisión del dueño; la tabla y los tokens se eliminan
con la migración 20261017110000 por decisión del dueño. ePayco es la única pasarela: la web nunca muestra
Mercado Pago y `PAYMENT_DRIVER` ya no acepta `mercadopago`. Los apadrinamientos (que cobraban con el Brick de
Mercado Pago) muestran "Pronto podrás apadrinar con pago en línea" hasta que exista el cobro recurrente con
ePayco.

## 2. Qué dice ePayco (consultado el 2026-10-15)

| Tema                    | Qué dice la fuente                                                                                                                                                                                                                                                                                                                                                                        | Fuente                                                                                                   |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Split, modelo agregador | Solo para cuentas en modelo agregador. La transacción la hace el **comercio principal**, "a cuyo nombre queda la transacción" y "desde el cual se ejecutará la dispersión". Cada receptor debe estar registrado como comercio **y** como receptor, asociado al principal. La cuenta principal pide la activación por ticket de soporte. `fee` es lo que el receptor le paga al principal. | [Pagos divididos](https://docs.epayco.com/docs/split-descripcion)                                        |
| Split, producto         | 1:1 y 1:N en agregador; el modelo gateway solo hace 1:1, exige NIT, paquete transaccional y solo funciona con tarjeta. "No funciona con las herramientas de cobro" (links, botones). No dice cuándo ve el receptor el dinero.                                                                                                                                                             | [epayco.com/pagos-divididos](https://epayco.com/pagos-divididos/)                                        |
| Checkout                | Checkout v2: el servidor hace login en Apify con las llaves del comercio, crea una sesión y el navegador la abre. La sesión acepta `splitPayment`.                                                                                                                                                                                                                                        | [Implementación](https://docs.epayco.com/docs/checkout-implementacion)                                   |
| Confirmación            | POST a la URL de confirmación con `x_signature = SHA256(p_cust_id_cliente^p_key^x_ref_payco^x_transaction_id^x_amount^x_currency_code)`. Consulta de la transacción por `ref_payco` en `secure.epayco.co/validation/v1/reference/…`.                                                                                                                                                      | [Respuesta y confirmación](https://docs.epayco.com/docs/checkout-respuesta-y-confirmacion)               |
| Suscripciones           | Planes, clientes, tokens de tarjeta y suscripciones vía SDK (PHP, Node, Python, Ruby). La página pública no publica las rutas HTTP y está marcada como desactualizada (2021).                                                                                                                                                                                                             | [Planes](https://docs.epayco.com/docs/planes), [SDK Node](https://github.com/roberto-epayco/epayco-node) |

## 3. Qué significa para "sin custodia" ⚖️

Hay dos formas de usar ePayco y no son equivalentes:

| Modo                                       | Quién es el comercio                        | ¿Por dónde pasa el dinero?                                                      | Comisión AdoptaFácil     | Estado en el código                                                                                         |
| ------------------------------------------ | ------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------ | ----------------------------------------------------------------------------------------------------------- |
| **Directo** (`direct_to_org`), por defecto | El refugio, con **su propia** cuenta ePayco | Cae en el saldo ePayco del refugio en el momento del pago.                      | 0 %; vive de los planes. | Implementado, detrás de `PAYMENT_DRIVER=epayco`.                                                            |
| **Split agregador** (`platform_split`)     | **AdoptaFácil**, como comercio principal    | La transacción queda a nombre de AdoptaFácil y la dispersión sale de su cuenta. | La que se pacte (`fee`). | Implementado pero **apagado**: exige `EPAYCO_COLLECTION_MODE=platform_split` y `EPAYCO_SPLIT_APPROVAL_REF`. |

El split agregador, tal como lo describe ePayco, hace a AdoptaFácil el comercio de la transacción. Eso se
parece mucho a **recaudar a nombre de terceros**, que es justo lo que ADR-PAG-001 evitaba. Antes de
encenderlo hace falta:

1. ⚖️ **Concepto del abogado.** Las preguntas son:
   - Si ser comercio principal en el split cuenta como custodia o recaudo para terceros.
   - Qué contrato de mandato se necesita con cada refugio.
   - Quién responde ante el donante por reembolsos y contracargos.
   - Si aplica alguna obligación SARLAFT o de reporte.
2. 🧾 **Concepto del contador.** Las preguntas son:
   - Si la transacción completa entra como ingreso de AdoptaFácil (ingreso para terceros) o solo el `fee`.
   - Retenciones (ePayco lista retefuente en su ejemplo), IVA sobre la comisión y factura electrónica.
3. **Respuesta escrita de ePayco**, con su referencia en `EPAYCO_SPLIT_APPROVAL_REF`. Las preguntas son:
   - ¿El receptor ve el dinero en su saldo en el momento del pago, o después de la dispersión?
   - ¿A nombre de quién se emite el soporte de la transacción?
   - ¿El receptor puede ser persona natural?

Mientras eso no exista, el modo directo ya cumple el deseo del dueño de que el refugio vea el dinero desde
el mismo instante: el pago cae en **su** saldo ePayco.

**Refugios informales:** en modo directo basta con que el refugio abra su cuenta ePayco como persona natural.
⚖️ Sigue vigente la nota de ADR-PAG-001: reciben un comprobante sin efecto tributario, nunca un certificado.

## 4. Diseño

```
QR impreso ─► https://<subdominio>/donar  ó  https://adoptafacil…/o/<slug>/donar
                         │ (resuelve la organización pública)
                         ▼
                 /donaciones?organizationId=…   (página de donación de siempre)
                         │ POST /donations
                         ▼
DonationsService ─ llaves ePayco del refugio (cifradas, RLS) ─► EpaycoPaymentAdapter
                         │  login Apify + sesión checkout v2 (con las llaves del REFUGIO)
                         ▼
navegador: checkout-v2.js abre la sesión → tarjeta, PSE, Nequi, Daviplata, efectivo…
                         │
ePayco ─► POST /donations/webhook (confirmación)
           → firma con el P_KEY del refugio → x_cust_id_cliente = el refugio
           → relectura en secure.epayco.co → monto, moneda y receptor cuadran → aprobada
```

- **QR estable.** El QR apunta a AdoptaFácil, nunca a un link de la pasarela. Así un QR impreso sigue
  sirviendo si el refugio cambia de pasarela o activa más medios. Si existen subdominio y dominio base, la URL
  es `https://<subdominio>.<dominio>/donar`. Si no, es `<origen>/o/<slug>/donar`. Las dos rutas llevan a la
  misma página (`buildOrganizationDonateUrl` en `packages/contracts/src/donation-links.ts`).
- **Medios de pago.** Los decide la cuenta ePayco de cada refugio. El checkout v2 muestra los que el refugio
  tenga habilitados; AdoptaFácil no los filtra.
- **Llaves del refugio.** Las entrega el Owner o Administrator una sola vez desde el panel:
  P_CUST_ID_CLIENTE, P_KEY, PUBLIC_KEY y PRIVATE_KEY.
  - Las dos secretas se cifran con AES-256-GCM, con una clave derivada por HKDF de
    `SIGNATURE_ENCRYPTION_KEY`, y nunca se devuelven.
  - La tabla tiene RLS y está cubierta por `rls-no-leak`.
  - Una misma cuenta ePayco no puede quedar conectada a dos organizaciones.
- **Planes de AdoptaFácil.** Se cobran con la cuenta ePayco **de AdoptaFácil**, porque es ingreso propio y
  no toca donaciones (`EpaycoBillingClient`).
  - Los ids de plan son estables (`af-crece-month`) y el precio lleva el IVA incluido.
  - La tarjeta se tokeniza en el navegador; aquí solo llega el token.
  - Las rutas de la API de recurrencia vienen de los SDK oficiales y quedan marcadas `TODO(client)` hasta
    probarlas en sandbox.
  - Falta conectarlo al flujo de compra del plan en `core/plans`; va en un PR aparte.

## 5. Qué necesita el dueño entregar (sin pegar secretos en el chat)

| Qué                                                                                                    | Para qué                                           | Cómo                                                                                                                                                                                                                             |
| ------------------------------------------------------------------------------------------------------ | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hosts en la política de red del entorno: `apify.epayco.co`, `secure.epayco.co` y `api.secure.payco.co` | Prueba real en sandbox                             | Configuración del proyecto → Entorno cloud → Añadir entorno → dominios permitidos.                                                                                                                                               |
| Llaves de prueba de la cuenta ePayco **de AdoptaFácil**                                                | Planes, y split si algún día se aprueba            | Variables de entorno `EPAYCO_PLATFORM_CUST_ID`, `EPAYCO_PLATFORM_P_KEY`, `EPAYCO_PLATFORM_PUBLIC_KEY` y `EPAYCO_PLATFORM_PRIVATE_KEY`, en el mismo diálogo. En el servidor, en su `.env`. Nunca en el repositorio ni en el chat. |
| Llaves de prueba de una segunda cuenta ePayco que haga de refugio                                      | Probar que el dinero llega a la cuenta del refugio | Variables `EPAYCO_TEST_ORG_CUST_ID`, `EPAYCO_TEST_ORG_P_KEY`, `EPAYCO_TEST_ORG_PUBLIC_KEY` y `EPAYCO_TEST_ORG_PRIVATE_KEY`; la prueba las carga en la organización de prueba por el endpoint de conexión.                        |
| Respuesta escrita de ePayco a las tres preguntas de la sección 3                                       | Decidir si el split se enciende                    | Ticket desde la cuenta del dueño; su referencia va en `EPAYCO_SPLIT_APPROVAL_REF`.                                                                                                                                               |
| Concepto del abogado y del contador sobre la sección 3                                                 | Encender el split o descartarlo                    | Concepto escrito.                                                                                                                                                                                                                |
| Dominio base del portal (`VITE_PORTAL_BASE_DOMAIN`) y DNS comodín                                      | Que el QR use el subdominio                        | Mientras no exista, el QR usa `/o/<slug>/donar`, que no deja de funcionar al pasar a subdominio.                                                                                                                                 |

## 6. Configuración

- `PAYMENT_DRIVER=epayco` enciende el adaptador. El valor por defecto sigue siendo `fake` en desarrollo y los
  flags del arranque seguro siguen mandando en producción.
- `EPAYCO_TEST=true` usa el sandbox.
- `EPAYCO_COLLECTION_MODE` vale `direct_to_org` por defecto. El valor `platform_split` solo funciona con
  `EPAYCO_SPLIT_APPROVAL_REF`, `EPAYCO_SPLIT_FEE_RATE` y las llaves `EPAYCO_PLATFORM_*`.
- En la web, ePayco es la opción por defecto: muestra "Conectar ePayco" y abre su checkout al donar.
  `VITE_PAYMENT_PROVIDER=off` (o `none`/`disabled`) es el interruptor de apagado: oculta el pago en línea.

Reversión: revertir el PR. La migración crea una tabla y una función. Para deshacerla:

```sql
DROP FUNCTION epayco_account_organization_id(TEXT);
DROP TABLE organization_epayco_accounts;
```
