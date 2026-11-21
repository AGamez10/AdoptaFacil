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
5. Verificado, el portal responde en `https://www.turefugio.org`; el certificado HTTPS se
   emite solo la primera vez que alguien entra.

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

## Encenderlo en producción (una vez)

1. En el DNS de `adoptafacil.org`, crear `portales.adoptafacil.org` → IP del servidor, **sin el
   proxy de Cloudflare (nube gris)**: el certificado del dominio de la fundación lo emite Caddy
   por HTTP-01 y necesita llegar directo.
2. `deploy/api.env`:
   ```
   CUSTOM_DOMAIN_CNAME_TARGET=portales.adoptafacil.org
   CUSTOM_DOMAIN_IPV4=<IP pública del servidor>   # opcional: permite conectar la raíz
   ```
3. `deploy/.env`: `CUSTOM_DOMAINS=on` (Caddy carga `deploy/custom-domains-on.caddy`).
4. Reconstruir y desplegar (la web recibe `VITE_APP_DOMAIN` = `APP_DOMAIN` para reconocer un
   host ajeno como dominio de una organización).

## Seguridad

- Caddy emite certificados _on demand_ **solo** si `GET /public/portal-domains/ask?domain=`
  responde 200: dominio verificado por TXT y organización con un plan que incluye
  `customDomain` hoy. Nadie puede hacernos emitir certificados para dominios ajenos.
- La web en un dominio propio llama a la API en su mismo origen (`/api`), igual que en los
  subdominios: cookies y CORS nunca cruzan dominios.
- La tabla `portal_custom_domains` tiene RLS (`ENABLE` + `FORCE` + `tenant_isolation`); lo
  público pasa por funciones `SECURITY DEFINER` que solo devuelven el slug.
