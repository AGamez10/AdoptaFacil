# Monitoreo y alertas

> R3-3 · OPS-002. Objetivo: que el dueño se entere por el teléfono de que algo
> falla antes que los usuarios, sin tener que mirar nada a diario.

## Tres capas

| Capa                              | Qué detecta                                                                                                                                                                | Cómo                                                                                                                                                      | Estado                                                   |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| 1. Uptime **externo**             | VPS caído, red, DNS, certificado, Caddy                                                                                                                                    | Servicio externo que pide `https://DOMINIO/api/health` cada 1–5 min y comprueba `"status":"ok"` (UptimeRobot, Better Stack, Uptime Kuma en otra máquina…) | Configurar en el panel del proveedor ⟦POR DEFINIR⟧ [VPS] |
| 2. Vigilancia **interna**         | Contenedor caído o `unhealthy`, `/health` degradado (BD o Redis), disco ≥ 85 %, último respaldo > 26 h, certificado < 14 días, ráfaga de errores de la API (> 20 en 5 min) | `deploy/scripts/monitor.sh` cada 5 min por cron                                                                                                           | Probado en local (abajo)                                 |
| 3. Dead man's switch de respaldos | El respaldo diario no corrió                                                                                                                                               | `BACKUP_HEALTHCHECK_URL` (p. ej. healthchecks.io): si no llega el ping diario, avisa                                                                      | Configurar [VPS]                                         |

La capa 1 es imprescindible: si el VPS se apaga, `monitor.sh` se apaga con él.

## Canal de alertas

`ALERT_WEBHOOK_URL` recibe un `POST` de texto plano. Funciona tal cual con
[ntfy](https://ntfy.sh) (app gratuita en Android/iOS; tema privado y difícil de
adivinar, o servidor ntfy propio). Para Slack/Discord/Telegram basta cambiar la
función `alert` de `deploy/scripts/lib.sh`. Las alertas **nunca** incluyen datos
personales ni líneas de log: solo qué comprobación falló.

`monitor.sh` alerta **solo cuando cambia el estado** (aparece un problema o se
recupera), para no repetir la misma alerta cada 5 minutos.

## Evidencia (stack de producción en local, webhook de prueba)

Redis detenido a mano y vuelto a arrancar; cuatro ejecuciones de `monitor.sh`:

```text
2026-10-07T23:44:27Z OK
2026-10-07T23:44:38Z PROBLEMAS: API /health no responde ok: {"status":"degraded","db":"up","redis":"down"};contenedor redis: exited ;
(tercera ejecución, mismo estado: sin alerta repetida)
2026-10-07T23:44:40Z OK
```

Alertas recibidas por el webhook: exactamente dos.

```text
[AdoptaFácil localhost] Problemas:
API /health no responde ok: {"status":"degraded","db":"up","redis":"down"}
contenedor redis: exited
[AdoptaFácil localhost] Recuperado: todo en orden de nuevo
```

## Logs

- Caddy: acceso en JSON por stdout. API, Postgres, Redis: stdout. Docker los
  rota (10 MB × 5 por servicio). Consultar: `docker compose ... logs -f api`.
- Pendiente (fuera de este PR): logs estructurados de la API sin datos
  personales y captura de errores con contexto (p. ej. Sentry autoalojado o
  GlitchTip), que tocan el arranque de la API (zona del hilo "Arranque seguro y
  flags").
