# Correo transaccional en producción

> Revisado el 2026-11-06 sobre `claude/templates-on-main`. Los precios y cupos de
> proveedores son de lista y hay que confirmarlos al crear la cuenta.

## 1. Qué hay hoy en el código (verificado)

| Pieza             | Estado                                                                                                                                   | Dónde                                                          |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Librería de envío | **nodemailer** (código abierto, licencia MIT), con conexiones reutilizadas (`pool`)                                                      | `apps/api/src/core/notifications/smtp-notification.adapter.ts` |
| Cola              | Cada correo es un trabajo de BullMQ en Redis, con reintentos y ritmo configurable (`EMAIL_QUEUE_*`)                                      | `apps/api/src/core/notifications/delivery/`                    |
| Selección         | `NOTIFICATION_DRIVER=smtp`. En producción la API se niega a arrancar con `log`                                                           | `apps/api/src/config/env.validation.ts`                        |
| Prueba rápida     | `pnpm --filter @adoptafacil/api mail:test tu@correo.com` usa las mismas opciones de conexión que la API (TLS, usuario, DKIM)             | `apps/api/scripts/mail-test.ts`                                |
| Remitente         | `SMTP_FROM` fijo para todo. Los correos con marca de una organización cambian solo el nombre visible y el `Reply-To`, nunca la dirección | `smtp-notification.adapter.ts`                                 |

**La librería ya existe y es código abierto.** Lo que falta para producción no es
una librería sino un **servidor que entregue** los correos y los **registros DNS**
que prueban que `adoptafacil.org` autoriza ese envío.

Cambios de este PR (todos aditivos y por variables de entorno):

- **Puerto 587 exige STARTTLS** (`requireTLS`). Antes, si alguien en el camino
  quitaba el STARTTLS, nodemailer podía mandar la contraseña en claro.
- **`SMTP_USER`/`SMTP_PASS` opcionales, pero juntas.** Sin ellas no hay AUTH:
  solo sirve con un Postfix propio dentro de la red interna de Docker.
- **Firma DKIM hecha por la propia API** (`SMTP_DKIM_DOMAIN`, `SMTP_DKIM_SELECTOR`,
  `SMTP_DKIM_PRIVATE_KEY`, las tres juntas). Es una capacidad de nodemailer;
  con ella un Postfix mínimo no necesita OpenDKIM.

## 2. Opciones evaluadas

| Opción                                                      | Código abierto                          | Entregabilidad el día 1                                                                                      | Costo                                                                                                           | Esfuerzo                                 | Veredicto                                                                                                                  |
| ----------------------------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| **A. nodemailer → relay SMTP** (Brevo, SMTP2GO, Amazon SES) | La librería sí; el relay es un servicio | **Alta**: IPs con reputación ya construida                                                                   | Brevo: plan gratis ≈ 300 correos/día. SES: ≈ 0,10 USD por 1.000, pero exige pedir salida del "sandbox" (≈ 24 h) | 30–60 min                                | **Recomendada para salir**                                                                                                 |
| **B. nodemailer → Postfix propio en el VPS** (solo envío)   | 100 %                                   | **Baja al inicio**: IP nueva de Hostinger, sin historial; Gmail y Outlook la tratan con desconfianza semanas | 0 USD extra                                                                                                     | Medio día + 2–4 semanas de calentamiento | Fase 2, cuando haya volumen y paciencia                                                                                    |
| C. Mailu (suite completa en Docker)                         | Sí (MIT)                                | Igual que B                                                                                                  | 0 USD, pero ≈ 1–2 GB de RAM (antispam, webmail, IMAP)                                                           | 1 día                                    | Descartada: trae recepción, webmail y antivirus que no usamos y compite por la RAM del VPS                                 |
| D. Stalwart (servidor todo en uno, Rust)                    | Sí (AGPL)                               | Igual que B                                                                                                  | 0 USD, liviano                                                                                                  | Medio día                                | Buena alternativa a Postfix si algún día se quiere recibir correo; para solo enviar, Postfix es más conocido y documentado |
| E. Haraka (MTA en Node.js)                                  | Sí (MIT)                                | Igual que B                                                                                                  | 0 USD                                                                                                           | Medio día + plugins                      | Descartada: menos documentación en español y nadie del equipo lo opera                                                     |
| F. Gmail con contraseña de aplicación                       | No                                      | Media                                                                                                        | Gratis                                                                                                          | 10 min                                   | **Solo para desarrollo**: el remitente sería `@gmail.com`, no `@adoptafacil.org`, con tope ≈ 500/día                       |

### Por qué A primero y B después

La entregabilidad depende de la **reputación de la IP y del dominio**, no del
software. Postfix envía igual de bien que cualquier proveedor; lo que no tiene
una IP nueva es historial. Un correo de "restablecer contraseña" que cae en spam
el día del lanzamiento es un incidente de soporte. Con un relay, el dominio
construye reputación (SPF, DKIM y DMARC alineados) desde el día 1, y como esa
reputación es **del dominio**, se conserva cuando luego se pase a Postfix.

Pasar de A a B es **solo cambiar variables** en `deploy/api.env`. No hay que tocar código.

### Puerto 25 en Hostinger

Hostinger dice en su centro de ayuda que **no bloquea** el puerto 25 de salida en
VPS ([artículo](https://www.hostinger.com/support/7854530-is-smtp-port-25-blocked-on-vps/)).
**No lo verifiqué desde el VPS.** Compruébalo antes de elegir B:

```bash
nc -vz -w 5 gmail-smtp-in.l.google.com 25   # "succeeded" = abierto
```

El PTR (DNS inverso de la IP) lo controla Hostinger, no Cloudflare. No encontré
documentación pública de cómo cambiarlo en el panel: hay que buscarlo en hPanel
o pedirlo a soporte. Sin PTR que coincida, Gmail rechaza o manda a spam.

## 3. Opción A paso a paso (relay, recomendada)

Ejemplo con **Brevo** (cualquier relay sirve igual; cambian host y registros).

1. Crea la cuenta y agrega el dominio `adoptafacil.org` como remitente.
2. Brevo te muestra los registros DNS a crear (un TXT de verificación y el DKIM,
   normalmente un TXT o CNAME en `brevo1._domainkey` o similar). Créalos en
   Cloudflare tal como los da, en modo **solo DNS** (nube gris).
3. Crea una **clave SMTP** (no uses la contraseña de la cuenta).
4. En el servidor, `deploy/api.env` (permisos 600, nunca en el repo):

   ```dotenv
   NOTIFICATION_DRIVER=smtp
   SMTP_HOST=smtp-relay.brevo.com
   SMTP_PORT=587
   SMTP_USER=<usuario SMTP que da Brevo>
   SMTP_PASS=<clave SMTP>
   SMTP_FROM="AdoptaFácil" <no-reply@adoptafacil.org>
   # Plan gratis ≈ 300/día: no vale la pena correr más rápido que el cupo.
   EMAIL_QUEUE_RATE_MAX=2
   EMAIL_QUEUE_RATE_DURATION_MS=1000
   ```

5. Prueba la conexión desde tu computador antes de tocar el servidor: pon las
   mismas variables en el `.env` de la raíz del repo y corre
   `pnpm --filter @adoptafacil/api mail:test tu@correo.com`. Dice en español si salió o por qué
   no (usuario, puerto, remitente). En el VPS no hay atajo equivalente: el
   servicio `migrate`, que trae `ts-node`, no tiene salida a internet.

6. Reinicia `api` y `worker`
   (`sudo docker compose -f deploy/compose.yaml --env-file deploy/.env up -d --wait api worker`),
   pide "Olvidé mi contraseña" con un correo tuyo y revisa
   `sudo docker compose -f deploy/compose.yaml --env-file deploy/.env logs worker | grep NotificationPort`:
   debe decir `result=ok`. En Gmail, "Mostrar original" debe decir
   **SPF: PASS, DKIM: PASS, DMARC: PASS**.

## 4. Registros DNS (Cloudflare, todos en "solo DNS")

Una sola regla: **un solo registro SPF** por nombre. Si dos servicios envían,
se combinan en el mismo TXT.

| Tipo        | Nombre                  | Valor                                                                                      | Para qué                                             |
| ----------- | ----------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| TXT         | `@`                     | `v=spf1 include:spf.brevo.com ~all` (opción A) · `v=spf1 ip4:<IP_DEL_VPS> ~all` (opción B) | Qué servidores pueden enviar como `@adoptafacil.org` |
| TXT o CNAME | `<selector>._domainkey` | El que dé el proveedor (A) · `v=DKIM1; k=rsa; p=<clave pública>` con selector `af1` (B)    | Firma que prueba que el correo no fue alterado       |
| TXT         | `_dmarc`                | `v=DMARC1; p=none; rua=mailto:dmarc@adoptafacil.org; adkim=r; aspf=r`                      | Política si SPF/DKIM fallan, y reportes              |
| PTR         | (en Hostinger)          | `<IP_DEL_VPS>` → `mail.adoptafacil.org`, más un `A mail` → IP                              | Solo opción B                                        |

- Empieza con `~all` y `p=none`. Tras 2–4 semanas con reportes limpios, sube a
  `-all` y `p=quarantine`.
- El `include` exacto del SPF lo da cada proveedor; el de Brevo es el de su panel
  al momento de crear la cuenta (por verificar).
- **Recibir** en `dmarc@` y `contacto@`: Cloudflare Email Routing (gratis) reenvía
  a un Gmail. Agrega sus registros `MX` y suma `include:_spf.mx.cloudflare.net`
  al mismo SPF.

## 5. Opción B: Postfix propio (100 % código abierto, fase 2)

> **No probada en este entorno** (sin Docker ni VPS). Pruébala en un staging.

1. Genera la clave DKIM (una vez, en el VPS):

   ```bash
   openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out dkim-af1.pem
   # Pública para el TXT af1._domainkey (todo en una línea, sin encabezados):
   openssl pkey -in dkim-af1.pem -pubout | grep -v '^-----' | tr -d '\n'
   # Privada en una línea para deploy/api.env:
   awk 'BEGIN{ORS="\\n"} {print}' dkim-af1.pem
   ```

2. Agrega un servicio de solo envío al compose (imagen propia, sin terceros):

   ```dockerfile
   # deploy/docker/postfix.Dockerfile
   FROM alpine:3.20
   RUN apk add --no-cache postfix ca-certificates \
    && postconf -e 'myhostname=mail.adoptafacil.org' \
                   'inet_interfaces=all' 'inet_protocols=ipv4' \
                   'mynetworks=127.0.0.0/8 172.16.0.0/12 10.0.0.0/8' \
                   'smtpd_relay_restrictions=permit_mynetworks,reject' \
                   'smtp_tls_security_level=may' 'maillog_file=/dev/stdout'
   CMD ["postfix", "start-fg"]
   ```

   En `deploy/compose.yaml`, un servicio `postfix` en la red `edge`, **sin
   `ports:`** (nadie de fuera puede usarlo como relay).

3. `deploy/api.env`:

   ```dotenv
   SMTP_HOST=postfix
   SMTP_PORT=25
   SMTP_FROM="AdoptaFácil" <no-reply@adoptafacil.org>
   SMTP_DKIM_DOMAIN=adoptafacil.org
   SMTP_DKIM_SELECTOR=af1
   SMTP_DKIM_PRIVATE_KEY=<salida del awk del paso 1>
   ```

4. Calienta la IP: empieza con correos a cuentas propias, luego pocos cientos por
   día, y revisa [Google Postmaster Tools](https://postmaster.google.com) y las
   listas negras (`mxtoolbox.com/blacklists`) antes de mover todo el tráfico.

## 6. Qué necesito de ti

- Confirmar que el dominio es `adoptafacil.org` y que su DNS ya está en Cloudflare.
- Elegir relay (recomiendo Brevo para salir mañana; SES si quieres el menor costo
  a escala y puedes esperar la aprobación).
- Crear la cuenta del relay y agregar los registros DNS que te muestre (no
  puedo crear cuentas ni tocar tu DNS desde aquí).
- Un buzón para recibir los reportes de DMARC (o activar Email Routing).
