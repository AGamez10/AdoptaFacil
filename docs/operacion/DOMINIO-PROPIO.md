# Dominio propio del portal (plan Pro)

**Decisión del dueño (2026-11-16):** la fundación compra su dominio y AdoptaFácil lo conecta.
El dominio queda a nombre de la organización (si se va, se lo lleva), AdoptaFácil no paga ni
renueva dominios ajenos y todo el flujo es automático.

## Cómo lo vive la fundación

1. Compra su dominio donde quiera (GoDaddy, Hostinger, Namecheap, Cloudflare…). Un `.org` o
   `.com.co` cuesta del orden de $50.000–$120.000 COP al año; lo paga ella al registrador.
2. En **Diseña tu portal → Tu dominio propio** escribe, por ejemplo, `www.turefugio.org`.
3. La pantalla le muestra dos registros DNS para crear en su registrador:
   - `CNAME www.turefugio.org → portales.adoptafacil.org` (o `A turefugio.org → IP del
servidor` si conecta la raíz y la plataforma definió `CUSTOM_DOMAIN_IPV4`);
   - `TXT _adoptafacil.www.turefugio.org → adoptafacil-verify=<código>` (prueba que es suyo).
4. Pulsa **Ya los creé, verificar**. Si algo falta, la pantalla dice qué (falta el TXT, el
   dominio aún no apunta, ya lo tiene otra organización, el DNS no respondió).
5. Verificado, el portal responde en `https://www.turefugio.org`; el certificado HTTPS lo emite
   Cloudflare en unos minutos.

## Estados

| Estado        | Qué significa                                                                | Se sirve |
| ------------- | ---------------------------------------------------------------------------- | -------- |
| `none`        | No ha pedido dominio                                                         | —        |
| `pending_dns` | Pedido; faltan los registros o aún no se ven                                 | No       |
| `active`      | Verificado y el plan lo incluye                                              | Sí       |
| `suspended`   | Verificado, pero el plan ya no incluye dominio propio (bajó de Pro o venció) | No       |
| `unavailable` | La plataforma aún no configuró `CUSTOM_DOMAIN_CNAME_TARGET`                  | —        |

- Varias organizaciones pueden **pedir** el mismo dominio; solo una puede **verificarlo**
  (índice único parcial). Así nadie bloquea un dominio a su dueño real pidiéndolo primero.
- Un fallo pasajero del DNS al revisar un dominio activo no lo apaga. Si los registros
  desaparecieron, vuelve a `pending_dns`.
- `suspended` no borra nada: al renovar Pro vuelve a funcionar solo.
- Quitar el dominio (botón **Desconectar dominio**) lo deja de servir; el portal sigue en
  `adoptafacil.org/o/<slug>`.
- Todo cambio queda en la auditoría: `portal.custom_domain_requested`, `_verified`, `_lost`,
  `_removed`.

## Encenderlo en producción (una vez): Cloudflare for SaaS

Con el VPS cerrado a solo IPs de Cloudflare ([BLINDAJE-VPS.md](./BLINDAJE-VPS.md)), los dominios
de las fundaciones también tienen que entrar por Cloudflare. Eso es **Cloudflare for SaaS**: gratis
hasta 100 dominios en el plan Free; después, unos US$0,10 al mes por dominio (confírmalo en
Cloudflare antes de pasar de 100). Cloudflare emite el certificado público de cada dominio; el WAF
y el límite de peticiones también los protegen.

1. **Registro destino.** Cloudflare → `adoptafacil.org` → DNS → Add record: `A`, nombre
   `portales`, valor la IP del VPS, **nube naranja**.
2. **Activar Custom Hostnames.** SSL/TLS → **Custom Hostnames** → **Enable Cloudflare for SaaS**
   (pide tarjeta aunque no cobre hasta los 100). En **Fallback Origin** escribe
   `portales.adoptafacil.org` → Add. Debe quedar **Active**.
3. **Regla de cifrado hacia el VPS.** Rules → **Configuration Rules** → Create rule
   `Dominios propios: SSL Full` → _Edit expression_:
   `not (http.host eq "adoptafacil.org" or ends_with(http.host, ".adoptafacil.org"))` →
   **SSL: Full** → Deploy. Para esos dominios Caddy cifra con su CA interna (Cloudflare tiene el
   certificado público); el resto del sitio sigue en Full (strict).
4. **Token mínimo para la API.** My Profile → API Tokens → Create Token → **Create Custom Token**:
   nombre `adoptafacil-saas`, permiso **Zone → SSL and Certificates → Edit**, Zone Resources
   _Include · Specific zone · adoptafacil.org_, Client IP Address Filtering _Is in · IP del VPS_ →
   Create. Copia el token una sola vez. Anota también el **Zone ID** (Overview de la zona, columna
   derecha, sección API).
5. `deploy/api.env`:
   ```
   CUSTOM_DOMAIN_CNAME_TARGET=portales.adoptafacil.org
   CLOUDFLARE_SAAS_ZONE_ID=<Zone ID>
   CLOUDFLARE_SAAS_API_TOKEN=<token del paso 4>
   ```
   Sin `CUSTOM_DOMAIN_IPV4`: con Cloudflare for SaaS solo se conectan subdominios
   (`www.turefugio.org`) por CNAME.
6. `deploy/.env`: `CUSTOM_DOMAINS=cloudflare`.
7. `sudo deploy/scripts/preflight.sh` y desplegar.

Al verificar un dominio, la API lo registra en Cloudflare; al quitarlo, cambiarlo o si sus
registros desaparecen, lo saca. Mientras Cloudflare emite el certificado (minutos), el panel de la
fundación lo dice. Si Cloudflare no responde al verificar, la fundación ve "no pudimos activar el
dominio en nuestra red" y puede reintentar.

> `CUSTOM_DOMAINS=on` (modo anterior: directo al VPS con nube gris en `portales` y certificado de
> Let's Encrypt al primer acceso) sigue disponible, pero exige el origen abierto a todo Internet.
> `verificar-blindaje.sh` lo marca como falla.

## Seguridad

- Caddy emite certificados _on demand_ **solo** si `GET /public/portal-domains/ask?domain=`
  responde 200: dominio verificado por TXT y organización con un plan que incluye
  `customDomain` hoy. Nadie puede hacernos emitir certificados para dominios ajenos.
- La web en un dominio propio llama a la API en su mismo origen (`/api`), igual que en los
  subdominios: cookies y CORS nunca cruzan dominios.
- La tabla `portal_custom_domains` tiene RLS (`ENABLE` + `FORCE` + `tenant_isolation`); lo
  público pasa por funciones `SECURITY DEFINER` que solo devuelven el slug.
