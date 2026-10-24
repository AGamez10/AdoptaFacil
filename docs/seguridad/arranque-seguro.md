# Arranque seguro, adaptadores y flags de módulo

> Ola 1 · hilo 1 (R0-1, R0-2, R0-5, R1-1, R1-3, R1-7). Cierra SEC-001 y SEC-002 y
> la parte de arranque de SEC-003, SEC-009 y SEC-010; cumple las condiciones C1 y
> C2 del piloto sin dinero.

## 1. Qué impide arrancar en producción

Con `NODE_ENV=production`, la validación de entorno
(`apps/api/src/config/env.validation.ts`, `assertProductionSafety`) aborta el
arranque y lista cada variable culpable cuando:

| Regla                                                                                                                           | Por qué                                                                                                             |
| ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `AUTH_IDENTITY_DRIVER=fake`                                                                                                     | SEC-001: aceptaba `fake:<correo>:x` y daba la sesión de cualquier cuenta, incluido el PlatformSuperAdmin.           |
| `PAYMENT_DRIVER=fake`                                                                                                           | SEC-002: aprobaba donaciones con un webhook sin firma.                                                              |
| `STORAGE_DRIVER=stub`                                                                                                           | Guardaba archivos en memoria: se pierden al reiniciar.                                                              |
| `NOTIFICATION_DRIVER=log`                                                                                                       | Solo escribía en el log: ningún correo salía (F15: nunca modo log en producción).                                   |
| `DIAN_DRIVER=fake`                                                                                                              | SEC-003: verificaba el RTE al primer intento.                                                                       |
| `SIGNATURE_DRIVER=fake`                                                                                                         | Ponía firmas `fake:` con proveedor `fake-local` en contratos reales.                                                |
| `FEATURE_PAYMENTS` o `FEATURE_SPONSORSHIPS` en `true` sin `PAYMENT_DRIVER=mercadopago` y sin `PAYMENTS_PRODUCTION_APPROVAL_REF` | D1–D7 y D17: dinero real solo con confirmación escrita del proveedor y revisión del abogado, y por orden del dueño. |
| `FEATURE_DONATION_CERTIFICATES=true` sin `FEATURE_PAYMENTS`                                                                     | No hay certificado sin donación.                                                                                    |
| `FEATURE_VOLUNTEERING_MINORS=true`                                                                                              | §3.5 / F23: menores fuera de producción hasta tener control de edad, representante y consentimiento.                |
| `TRUST_PROXY_HOPS` sin declarar                                                                                                 | Detrás de Caddy, sin este dato todos los usuarios comparten una IP para el rate limit.                              |
| `THROTTLER_STORAGE=memory`                                                                                                      | El límite debe compartirse entre instancias y sobrevivir reinicios.                                                 |

Los adaptadores simulados siguen siendo el valor por defecto en desarrollo y
pruebas: nada cambia para quien trabaja en local.

Evidencia (build real, `NODE_ENV=production` con el `.env` de desarrollo):

```text
ERROR [ExceptionHandler] Invalid environment configuration:
  - AUTH_IDENTITY_DRIVER: AUTH_IDENTITY_DRIVER=fake is a simulated adapter and is not allowed in production
  - PAYMENT_DRIVER: PAYMENT_DRIVER=fake is a simulated adapter and is not allowed in production
  - NOTIFICATION_DRIVER: NOTIFICATION_DRIVER=log is a simulated adapter and is not allowed in production
  - DIAN_DRIVER: DIAN_DRIVER=fake is a simulated adapter and is not allowed in production
  - SIGNATURE_DRIVER: SIGNATURE_DRIVER=fake is a simulated adapter and is not allowed in production
  - TRUST_PROXY_HOPS: declare how many reverse proxies sit in front of the API (0 if none)
exit=1
```

## 2. Adaptadores `disabled`

Para que producción pueda arrancar sin credenciales de terceros, cada puerto
que solo tenía un adaptador simulado ganó uno `disabled` que se niega en vez
de fingir:

| Variable               | `disabled` hace                                            | Archivo                                                                  |
| ---------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------ |
| `AUTH_IDENTITY_DRIVER` | `POST /auth/google` responde 404                           | `apps/api/src/core/identity/disabled-identity.adapter.ts`                |
| `PAYMENT_DRIVER`       | todo cobro, consulta y webhook responde 503                | `apps/api/src/core/payments/disabled-payment.adapter.ts`                 |
| `DIAN_DRIVER`          | ningún RTE se verifica automáticamente (`verified: false`) | `apps/api/src/modules/org/disabled-dian.adapter.ts`                      |
| `SIGNATURE_DRIVER`     | firmar un contrato responde 503                            | `apps/api/src/modules/adoptions/signature/disabled-signature.adapter.ts` |

`render.yaml` declara todos en `disabled` y el correo en `smtp`. La prueba
`apps/api/src/config/render-blueprint.spec.ts` lee ese archivo, rellena lo que
Render pone en el despliegue y ejecuta la misma validación del arranque: si
alguien vuelve a declarar un adaptador simulado, CI se pone en rojo.

## 3. Flags de módulo

Apagados salvo que el valor sea exactamente `"true"` (un flag ausente o mal
escrito queda apagado):

| Variable                        | Clave                  | Qué apaga en la API (404)                                                                                                                                     | Qué oculta en la web                                                                        |
| ------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `FEATURE_PAYMENTS`              | `payments`             | donaciones, webhooks de pago y de dispersión, cuentas de pago y Mercado Pago, dispersiones, conciliación, reconciliación de campañas, dashboard de donaciones | `/donaciones`, `/mis-donaciones`, `/donaciones-recibidas`                                   |
| `FEATURE_SPONSORSHIPS`          | `sponsorships`         | apadrinamientos y sus planes                                                                                                                                  | `/apadrinar`, `/organizacion/apadrinamientos`                                               |
| `FEATURE_DONATION_CERTIFICATES` | `donationCertificates` | certificado de donación, su emisión automática y su verificación pública                                                                                      | `/certificado`, `/verificar`                                                                |
| `FEATURE_COMMUNITY`             | `community`            | directorio de servicios, reseñas de servicios, ficha de mascota y su moderación                                                                               | `/servicios`, `/mi-negocio`, `/mis-mascotas`, `/plataforma/servicios`                       |
| `FEATURE_COMMUNITY_WALL`        | `communityWall`        | muro de publicaciones y su moderación (solo si `FEATURE_COMMUNITY` también está encendido)                                                                    | `/comunidad`, `/mis-publicaciones`, `/plataforma/comunidad`                                 |
| `FEATURE_REPUTATION`            | `reputation`           | reseñas e indicadores públicos                                                                                                                                | `/resenas`, `/organizacion/resenas`, `/plataforma/resenas`, `/organizaciones/:slug/resenas` |
| `FEATURE_RESOURCES`             | `resources`            | banco de recursos                                                                                                                                             | `/recursos`, `/ofrecer`, `/mis-ofertas`, `/organizacion/recursos`                           |
| `FEATURE_MARKETPLACE`           | `marketplace`          | marketplace                                                                                                                                                   | `/marketplace`, `/organizacion/marketplace`                                                 |
| `FEATURE_VOLUNTEERING_MINORS`   | `volunteeringMinors`   | (solo se publica; el rechazo de menores es la tarea R2-7)                                                                                                     | —                                                                                           |

Cómo funciona:

- **API.** `@RequireFeature('<clave>')` en el controlador (o en un handler) y un
  guard global (`apps/api/src/core/features/feature-flag.guard.ts`) que corre
  antes de la autenticación y responde exactamente lo mismo que una ruta
  inexistente: `{"statusCode":404,"error":"Not Found","message":"Cannot GET /…"}`.
  `feature-coverage.spec.ts` falla si un controlador nuevo de estos módulos
  queda sin flag.
- **Capacidades.** `GET /public/config/features` (público, sin datos de
  ninguna organización) devuelve los booleanos y `googleSignIn`.
- **Web.** `CapabilitiesProvider` (`apps/web/src/shell/capabilities`) los lee al
  cargar; mientras carga y si la API no responde, todo cuenta como apagado. El
  menú lateral, el navbar y el pie públicos ocultan los enlaces, y
  `FeatureRouteGate` muestra "Página no encontrada" en esas rutas.

Encender un módulo: poner su variable en `true` y reiniciar la API. La web lo
ve en la siguiente carga. Dinero real en producción exige además
`PAYMENT_DRIVER=mercadopago` y `PAYMENTS_PRODUCTION_APPROVAL_REF`.

## 4. Botón de Google

El botón "Continuar con Google (prueba)" solo existe en el servidor de
desarrollo (`vite dev` / pruebas). `vite build` siempre corre en modo
`production`, así que ese código queda muerto en el build; verificado con
`grep` sobre `apps/web/dist/assets/*.js` (0 apariciones, también cuando un
`.env` local filtra `NODE_ENV=development`). Sin `VITE_GOOGLE_CLIENT_ID` o con
`googleSignIn=false` en las capacidades no se muestra ningún botón de Google
ni el separador "o".

## 5. HTTP: cabeceras, proxy y rate limit

`apps/api/src/core/http/configure-http.ts` (lo usa `main.ts` y las pruebas):

- sin `X-Powered-By`;
- `X-Content-Type-Options: nosniff`, `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'`,
  `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`,
  `Cross-Origin-Opener-Policy: same-origin`, `Permissions-Policy` restrictiva y
  HSTS de un año en producción. No se envía `Cross-Origin-Resource-Policy`
  porque la web carga imágenes de `/storage/public` desde otro origen;
- `trust proxy` = `TRUST_PROXY_HOPS` (número de saltos, nunca `true`).

Los contadores del rate limit de `/auth/*` viven en Redis
(`apps/api/src/core/auth/redis-throttler.storage.ts`, script Lua atómico). Las
claves solo llevan el hash que genera el throttler: nunca correos ni IPs en
claro.

## 6. Redis completo

`parseRedisUrl` conserva usuario, contraseña, índice de base (`/n`) y TLS
(`rediss://`). Antes BullMQ solo recibía host y puerto: un Redis con
contraseña no autenticaba y dos entornos en `/1` y `/2` se robaban los jobs
(BLD-003). `redis-connection.integration-spec.ts` lo prueba con dos colas.

## 7. `.env` generado y `start`

Un valor vacío (`KEY=`) cuenta como ausente: el `.env` de `pnpm setup:env`
vuelve a arrancar la API (BLD-001). `pnpm --filter @adoptafacil/api start`
apunta a `dist/src/main.js`, que es donde `nest build` deja el archivo.

## 8. Pruebas que lo demuestran

| Prueba                                                 | Qué demuestra                                                                                                                                                                                                |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `apps/api/src/config/production-guard.spec.ts`         | cada adaptador simulado, flag de dinero sin aprobación, menores, proxy y rate limit en memoria abortan el arranque en producción; flags fallan cerrados; `.env` con vacíos arranca; `parseRedisUrl` completo |
| `apps/api/src/config/render-blueprint.spec.ts`         | `render.yaml` describe una producción que la API acepta (falla contra el `render.yaml` anterior)                                                                                                             |
| `apps/api/test/production-posture.integration-spec.ts` | con la configuración de producción: token Google falso → 404 sin sesión (SEC-001); webhook falso → 404 (SEC-002); 34 rutas de módulos apagados → 404 idéntico a una ruta inexistente; MVP intacto            |
| `apps/api/test/http-hardening.integration-spec.ts`     | cabeceras; dos instancias comparten el presupuesto de login vía Redis; IP real tras el proxy; sin proxy de confianza, `X-Forwarded-For` falso no compra presupuesto                                          |
| `apps/api/test/redis-connection.integration-spec.ts`   | colas en `/1` y `/2` aisladas                                                                                                                                                                                |
| `apps/api/src/core/features/feature-coverage.spec.ts`  | todo controlador de un módulo apagable lleva su flag                                                                                                                                                         |
| `apps/web/src/shell/capabilities/*.test.ts(x)`         | la web falla cerrada, oculta menú/enlaces/rutas y el botón de Google                                                                                                                                         |

## 9. Reversión

Todo es configuración o código sin migraciones. Para volver al comportamiento
anterior en un entorno que no sea producción basta con las variables
(`FEATURE_*=true`, drivers `fake`). En producción no hay reversión a los
adaptadores simulados: esa es la intención. Revertir el PR completo devuelve
los P0 SEC-001 y SEC-002.
