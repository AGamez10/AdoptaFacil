# Checklist de auditoría de seguridad: borde Cloudflare, origen y secretos

> Corte: 2026-11-21. Sirve para que un tercero audite AdoptaFácil con una revisión tipo "Cloudflare security
> audit" (zona, DNS, TLS, WAF, rate limiting, túneles, exposición del origen, cabeceras y secretos).
> Cada punto dice qué se espera, dónde está la evidencia en el repo y su estado.
>
> - ✅ **Cumple:** verificado en el código o la configuración versionada.
> - 👤 **Dueño:** se configura en el panel de Cloudflare, Hostinger o el VPS, y el repo no lo puede probar.
> - ⚠️ **Hallazgo:** abierto, con recomendación.

Topología: navegador → Cloudflare (DNS en el plan Free) → VPS de Hostinger con Caddy (TLS de Let's Encrypt por
DNS-01) → API NestJS y web estática en Docker. Postgres y Redis no publican puertos.

## 0. Decisión previa: ¿proxy de Cloudflare (nube naranja) o solo DNS (nube gris)?

✅ **H-CF-01. Resuelto el 2026-11-24:** toda la documentación pide nube naranja y Full (strict), y el dominio principal saca su certificado por DNS-01 (`deploy/edge-tls-cloudflare.caddy`). Contexto original:

- [DESPLIEGUE_VPS.md](./DESPLIEGUE_VPS.md) §Opción A y [SALIDA-A-PRODUCCION.md](./SALIDA-A-PRODUCCION.md) §1
  piden registros **sin proxy (nube gris)**.
- El `Caddyfile` (PR #129) y `TRUST_PROXY_HOPS=2` en `deploy/compose.yaml` asumen la **nube naranja**.

Con la nube gris, nada de lo que el auditor revise en Cloudflare (WAF, rate limiting, Bot Management, ocultar el
origen) protege el sitio, y la IP del VPS es pública.

**Recomendación:**

- Nube naranja en `@` y `www`.
- SSL/TLS en **Full (strict)**. Caddy sigue emitiendo su certificado por DNS-01, así que no se rompe.
- El comodín `*` también en naranja: el plan Free lo permite en proxy.
- Los dominios propios de los portales (Pro) apuntan directo al origen y no pasan por Cloudflare. Si se cierra
  el origen a solo IP de Cloudflare (§3), esos dominios dejan de funcionar hasta usar Cloudflare for SaaS o
  dejarlos fuera de la regla. Decídelo antes de cerrar el origen.

El estado real de la zona lo confirma el dueño en Cloudflare → DNS → Records 👤.

## 1. DNS y zona

| #   | Control                                                                                                | Evidencia / dónde           | Estado                        |
| --- | ------------------------------------------------------------------------------------------------------ | --------------------------- | ----------------------------- |
| 1.1 | DNSSEC activo en Cloudflare y registro DS publicado en el registrador                                  | Cloudflare → DNS → Settings | 👤                            |
| 1.2 | Registro `CAA` que limite la emisión a `letsencrypt.org` (y a los emisores de Cloudflare si hay proxy) | Cloudflare → DNS            | 👤                            |
| 1.3 | SPF, DKIM y DMARC (`p=quarantine` o más) del dominio de correo, en nube gris                           | [CORREO.md](./CORREO.md) §4 | 👤                            |
| 1.4 | Sin registros huérfanos (subdominios que apunten a servicios dados de baja)                            | Cloudflare → DNS            | 👤                            |
| 1.5 | Token de Cloudflare para Caddy con alcance mínimo: _Edit zone DNS_ solo en `adoptafacil.org`           | DESPLIEGUE_VPS.md §Opción A | ✅ documentado · 👤 verificar |
| 1.6 | MFA en la cuenta de Cloudflare y en el registrador (Namecheap)                                         | Paneles                     | 👤                            |

## 2. TLS

| #   | Control                                                                          | Evidencia                               | Estado |
| --- | -------------------------------------------------------------------------------- | --------------------------------------- | ------ |
| 2.1 | SSL/TLS **Full (strict)** si hay proxy; nunca _Flexible_                         | Cloudflare → SSL/TLS                    | 👤     |
| 2.2 | _Always Use HTTPS_ y TLS mínimo 1.2                                              | Cloudflare → Edge Certificates          | 👤     |
| 2.3 | HSTS en el origen: `max-age=31536000; includeSubDomains`                         | `deploy/Caddyfile` `(app)`              | ✅     |
| 2.4 | No se emite on-demand TLS sin autorización: `ask` a `/public/portal-domains/ask` | `deploy/Caddyfile` global               | ✅     |
| 2.5 | En producción, la redirect URI de OAuth debe ser https                           | `apps/api/src/config/env.validation.ts` | ✅     |

## 3. Exposición del origen y túneles

| #   | Control                                                                                                                                                                                                                                                                                                                                                                           | Evidencia                                                 | Estado                                                                                           |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| 3.1 | Postgres y Redis sin puertos publicados                                                                                                                                                                                                                                                                                                                                           | `deploy/compose.yaml` (solo Caddy publica 80/443)         | ✅                                                                                               |
| 3.2 | Firewall de Hostinger con solo 22, 80, 443/tcp y 443/udp                                                                                                                                                                                                                                                                                                                          | SALIDA-A-PRODUCCION.md §1                                 | ✅ documentado · 👤 verificar                                                                    |
| 3.3 | ⚠️ **H-CF-02.** 80 y 443 abiertos a todo Internet: quien conozca la IP salta el WAF. **Recomendación:** en el firewall de Hostinger, permitir 80/443 solo desde los [rangos de Cloudflare](https://www.cloudflare.com/ips/), o reemplazar los puertos públicos por **Cloudflare Tunnel (`cloudflared`)** con salida solo hacia Cloudflare. Ver la nota de dominios propios en §0. | Firewall de Hostinger                                     | ✅ `deploy/host/cloudflare-origen.sh` (DOCKER-USER, rangos refrescados cada lunes) · 👤 instalar |
| 3.4 | Si se usa `cloudflared`: token del túnel solo en el VPS, servicio con usuario sin privilegios, ingress solo a `caddy:443`, y SSH no expuesto por el túnel sin Cloudflare Access                                                                                                                                                                                                   | Configuración del túnel                                   | 👤 (no implementado)                                                                             |
| 3.5 | SSH solo con llave, sin contraseña para root                                                                                                                                                                                                                                                                                                                                      | DESPLIEGUE_VPS.md                                         | 👤                                                                                               |
| 3.6 | IP real del visitante: Caddy confía en `X-Forwarded-For` solo si viene de rangos de Cloudflare; la API cuenta `TRUST_PROXY_HOPS`                                                                                                                                                                                                                                                  | `deploy/Caddyfile` `trusted_proxies`, `env.validation.ts` | ✅ · revisar los rangos si Cloudflare los cambia                                                 |
| 3.7 | El script de revisión del servidor es solo lectura y no imprime secretos                                                                                                                                                                                                                                                                                                          | `scripts/ops/auditoria-servidor.sh`                       | ✅                                                                                               |

## 4. WAF, bots y rate limiting

| #   | Control                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Evidencia                                                                                 | Estado |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------ |
| 4.1 | ⚠️ **H-CF-03. Excepción para los webhooks de Mercado Pago.** Con proxy, _Bot Fight Mode_, un _Managed Challenge_ o un nivel de seguridad alto pueden bloquear las llamadas servidor a servidor de Mercado Pago, y los pagos se cobran pero no se confirman. **Regla WAF de tipo _Skip_** (Security → WAF → Custom rules), sin saltarse el rate limiting: `http.request.method eq "POST" and (starts_with(http.request.uri.path, "/api/donations/webhook") or starts_with(http.request.uri.path, "/api/billing/webhooks/") or starts_with(http.request.uri.path, "/api/coffee/webhooks/"))`. En el plan Free, Bot Fight Mode no admite excepciones: si bloquea estas rutas, apágalo y usa reglas propias. La autenticidad la garantiza la firma HMAC `x-signature` y la relectura del pago, no el WAF. | `apps/api/src/core/payments/mercadopago-payment.adapter.ts` (firma con `timingSafeEqual`) | ⚠️ 👤  |
| 4.2 | Reglas administradas de Cloudflare activas (Free Managed Ruleset)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Cloudflare → Security                                                                     | 👤     |
| 4.3 | Rate limiting en el borde para `/api/auth/*` (login, registro, recuperación): por ejemplo 10 por minuto por IP, con bloqueo                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Cloudflare → Security → Rate limiting rules                                               | 👤     |
| 4.4 | Rate limiting en la aplicación: guard global `PublicApiThrottlerGuard` (`core/bots`), `@Throttle` por ruta y almacén en Redis exigido en producción, con la IP real (3.6)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | `apps/api/src/**` `@Throttle`                                                             | ✅     |
| 4.5 | Tope de cuerpo de 100 MB en Caddy y límites del multipart en la API                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | `deploy/Caddyfile` `request_body`                                                         | ✅     |

## 5. Cabeceras de seguridad (origen)

| #   | Control                                                                                                                                                                                                                                       | Evidencia                                             | Estado       |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ------------ |
| 5.1 | `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`; sin `Server` ni `X-Powered-By`                                                                                                           | `deploy/Caddyfile` `(app)`                            | ✅           |
| 5.2 | ⚠️ **H-CF-04.** La CSP está en **Report-Only**. Recomendación: revisar el log de `csp-report` de producción y pasarla a `Content-Security-Policy` (enforce) antes de la auditoría pública. Ya se corrigieron los huecos `blob:` (run-2 R-05). | `deploy/Caddyfile`, `/api/public/security/csp-report` | ⚠️           |
| 5.3 | Al pasar a enforce, comprobar que el regreso desde Mercado Pago (`back_urls`) y el botón de Google siguen funcionando. El checkout es una redirección, así que no necesita `frame-src` de Mercado Pago.                                       | Prueba manual                                         | 👤           |
| 5.4 | Cookie de refresco `httpOnly`, `Secure` en producción y `SameSite=None`: se manda solo al mismo origen `/api`. El auditor debe revisar la protección CSRF del endpoint de refresco.                                                           | `apps/api/src/core/auth/refresh-cookie.util.ts`       | ✅ · revisar |
| 5.5 | Caché: assets con hash `immutable`; `index.html`, `sw.js` y el manifiesto con `no-cache`. Si hay proxy, **no** activar _Cache Everything_ sobre `/api/*`                                                                                      | `deploy/Caddyfile`                                    | ✅ · 👤      |

## 6. Secretos

| #   | Control                                                                                                                                                                              | Evidencia                                                   | Estado                  |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------- | ----------------------- |
| 6.1 | Ningún secreto en el repositorio; gitleaks recorre toda la historia en cada PR                                                                                                       | `.github/workflows/*` (job gitleaks), `.gitleaks.toml`      | ✅                      |
| 6.2 | Secretos de producción solo en `deploy/.env` y `deploy/api.env`, con `chmod 600`                                                                                                     | SALIDA-A-PRODUCCION.md                                      | 👤                      |
| 6.3 | La API se niega a arrancar en producción con valores inseguros: `MERCADOPAGO_BASE_URL` ajeno, `MERCADOPAGO_TEST_PAYER_EMAIL`, redirect sin https o `TRUST_PROXY_HOPS` sin definir    | `apps/api/src/config/env.validation.ts`                     | ✅                      |
| 6.4 | Tokens OAuth de los refugios cifrados en reposo, con llave derivada de `SIGNATURE_ENCRYPTION_KEY`                                                                                    | `apps/api/src/modules/payments/mercadopago-token-crypto.ts` | ✅                      |
| 6.5 | Rotar cualquier credencial que se haya compartido alguna vez por chat o captura (Cloudflare, Mercado Pago, SMTP)                                                                     | Paneles                                                     | 👤                      |
| 6.6 | ⚠️ **H-CF-05.** El historial de git tiene correos personales en los autores. Reescribir la historia solo con autorización expresa del dueño. Alternativa: `.mailmap` hacia adelante. | `git log --format='%ae'`                                    | ⚠️ (decisión del dueño) |

## 7. Registro y monitoreo

| #   | Control                                                                                                          | Evidencia                      | Estado |
| --- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------ | ------ |
| 7.1 | Logs de acceso de Caddy en JSON con rotación                                                                     | `deploy/Caddyfile` `log`       | ✅     |
| 7.2 | Monitor externo de `/api/health` cada 5 minutos y alertas por ntfy                                               | [MONITOREO.md](./MONITOREO.md) | 👤     |
| 7.3 | Respaldos cifrados con `age`, copia fuera del servidor y restauración probada                                    | [BACKUPS.md](./BACKUPS.md)     | 👤     |
| 7.4 | Notificaciones de seguridad de Cloudflare (ataques DDoS, cambios de DNS, certificados) hacia el correo del dueño | Cloudflare → Notifications     | 👤     |

## 8. Cómo comprobarlo desde fuera (para el auditor)

```bash
curl -sI https://adoptafacil.org/ | grep -iE 'server|cf-ray|strict-transport|content-security|x-frame|x-content|referrer|permissions'
curl -s https://adoptafacil.org/api/health
# Con proxy: debe fallar o colgarse si el origen está cerrado a Cloudflare (H-CF-02)
curl -skI --resolve adoptafacil.org:443:<IP_DEL_VPS> https://adoptafacil.org/
# Firma inválida en un webhook: debe responder 403
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://adoptafacil.org/api/billing/webhooks/mercadopago \
  -H 'content-type: application/json' -H 'x-signature: ts=1,v1=00' -H 'x-request-id: x' \
  -d '{"type":"payment","data":{"id":"1"}}'
```
