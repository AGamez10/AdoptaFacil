# Runner propio de GitHub Actions en tu PC (gratis)

## Por qué

El repositorio `AGamez10/AdoptaFacil` es **privado**. En un repo privado del plan gratuito, las máquinas de GitHub tienen un cupo de minutos al mes. Cuando se acaba, los jobs fallan en segundos sin máquina, que es lo que pasa hoy. Con `$0` de límite de gasto **no te cobran nada**: GitHub solo deja de correr los jobs hasta que el cupo se renueva al empezar el siguiente ciclo de facturación.

Un runner propio corre los mismos jobs en tu PC y no gasta minutos. Es seguro **solo porque el repo es privado**. Si algún día el repo pasa a ser público, hay que quitar el runner antes.

## Qué necesitas en tu PC (Windows)

- **WSL2 con Ubuntu.** Los jobs usan contenedores de servicio (Postgres y Redis) y comandos de Linux, y eso solo funciona en un runner Linux. En PowerShell como administrador: `wsl --install -d Ubuntu`.
- **Docker Desktop** con la integración de WSL activada para Ubuntu (Settings → Resources → WSL integration).
- Dentro de Ubuntu: `sudo apt update && sudo apt install -y curl git jq postgresql-client`.
- Unos 15 GB libres de disco.
- La PC encendida mientras quieras que corran las pruebas. Si está apagada, los jobs esperan en cola hasta 24 horas.

## Pasos

1. En GitHub, abre el repo y ve a **Settings → Actions → Runners → New self-hosted runner**. Elige **Linux** y **x64**.
2. GitHub te muestra unos comandos. Cópialos **en la terminal de Ubuntu (WSL)**, no en PowerShell. Traen un token de registro que vence en una hora: **no lo pegues en el chat ni en el repo**.
3. Cuando `./config.sh` pregunte:
   - Nombre del runner: por ejemplo `pc-desarrollo`.
   - Etiquetas adicionales: deja las que trae (`self-hosted`, `Linux`, `X64`).
   - Carpeta de trabajo: Enter (usa `_work`).
4. Para que arranque solo: `sudo ./svc.sh install && sudo ./svc.sh start`. Si prefieres arrancarlo a mano cada vez: `./run.sh`.
5. Revisa que en **Settings → Actions → Runners** aparezca en verde, con el estado **Idle**.
6. En **Settings → Secrets and variables → Actions → Variables**, crea la variable `CI_RUNS_ON` con el valor `["self-hosted","Linux"]`. Desde ese momento los flujos `ci.yml` y `security.yml` corren en tu runner. Si la borras, todo vuelve a las máquinas de GitHub sin tocar código.
7. Para probarlo, vuelve a correr el CI de cualquier PR abierto (o haz un push) y revisa en la pestaña **Actions** que el job diga "Runner name: pc-desarrollo".

## Seguridad

- En **Settings → Actions → General**, deja apagado **"Run workflows from fork pull requests"**. En repos privados viene apagado por defecto.
- El runner no recibe ninguna clave de producción: las pruebas usan valores de usar y tirar que se generan en cada job.
- Los puertos de prueba son 55432 (Postgres) y 56379 (Redis), para no chocar con tu Postgres (5433) y Redis (6379) de desarrollo. El job de Docker levanta la pila en los puertos 80 y 443 y la baja al terminar. Cierra otros servidores que usen esos puertos.
