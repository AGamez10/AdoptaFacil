# Pendientes y limitaciones conocidas

Estado de la rama `auditoria-2026-11-15` (base `0b530f8`). Se redactó para que la auditoría
parta de lo que no está resuelto. Si algo aquí no coincide con lo que encuentres en el código,
asume que el código manda y avísanos.

## A. Lo que no está validado de punta a punta

| Área                                            | Estado real                                                                                                                                     | Qué falta                                                     |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Planes de pago (suscripción)                    | Lógica implementada y con pruebas unitarias. No validada de punta a punta con cobros reales.                                                    | Cobro real en Mercado Pago de prueba y en producción.         |
| Mercado Pago OAuth                              | Caso abierto **PSO16** (ticket **WCS-58365**). La conexión de cuenta de una organización no está cerrada.                                       | Resolver PSO16 y repetir el flujo OAuth con cuenta de prueba. |
| Mercado Pago, órdenes y webhooks                | Implementado con el driver `mercadopago`. Con el driver `fake` se prueban los flujos internos.                                                  | Validar webhooks reales con firma de Mercado Pago.            |
| Donaciones, ofertas y voluntariado en navegador | Algunas pruebas unitarias. No recorridas en navegador contra la API en marcha.                                                                  | Recorrido manual o automatizado en navegador.                 |
| Retorno a la intención tras login o registro    | Implementado en esta rama: vuelve a la misma pantalla y acción, con la selección conservada. Sin open redirect. Cubierto por pruebas unitarias. | Recorrido en navegador con Google real.                       |
| Patrocinios (apadrinamiento)                    | Implementado. No validado de punta a punta.                                                                                                     | Flujo completo con pago.                                      |
| Correo electrónico                              | En desarrollo se usa el driver `log`. Mailpit sirve para revisar mensajes.                                                                      | Entrega real por SMTP con DKIM en el dominio final.           |

## B. Módulos o temas incompletos o en revisión

- **Informe anual de RTE (registro tributario):** en construcción. No debe considerarse funcional.
- **Rendición de cuentas:** el equipo reportó que la redirección de soporte apunta a `localhost`.
  No lo volvimos a verificar en esta rama.
- **Formulario de adopción:** pendiente el punto 10 según el equipo. No lo revisamos a fondo aquí.
- **Reportes para hogar y guardería:** rediseño pendiente.
- **Custodia de dinero y textos legales:** pendientes de revisión con abogado. Hay `TODO(client)`
  en la plantilla de custodia y en los textos legales.
- **Firma del representante legal en certificados:** según el análisis del 6 de noviembre, la firma
  se estampa sin que el representante firme (P0-2 de esa referencia). Verifica si sigue igual.
- **Menores de edad en voluntariado:** según el análisis del 6 de noviembre, el flag existe pero
  no todas las rutas lo consultan (P0-1). Verifica si sigue igual.
- **Solicitudes de adopción y verificación del animal:** según el análisis del 6 de noviembre,
  AF-024 sigue abierto (P0-3). Verifica si sigue igual.

## C. Seguridad y operación

- **Hallazgos de la fase 0** (`docs/auditoria/`, baseline `48cabad`, 7 de octubre de 2026) pueden
  estar corregidos en `0b530f8`. No se re-verificaron uno por uno contra esta rama.
- **Pruebas de carga (k6)** no se ejecutaron en un servidor real. Las cifras de capacidad son hipótesis.
- **Despliegue:** `deploy/` contiene una referencia de VPS y compose. No hay un entorno desplegado
  que podamos dar como vigente.
- **Proveedores fake:** `DIAN_DRIVER=fake` y `SIGNATURE_DRIVER=fake` en desarrollo. La facturación
  electrónica y la firma electrónica no se validaron con proveedores reales.
- **Credenciales:** `.env` no está versionado. `.env.example` solo tiene valores de desarrollo
  (por ejemplo `POSTGRES_PASSWORD=adoptafacil` para la base local). Los secretos de producción
  (`MERCADOPAGO_*`, `SMTP_PASS`, claves DKIM, `GOOGLE_OAUTH_CLIENT_ID`) están vacíos o comentados.
- **Historial de git:** los metadatos de autor de algunos commits incluyen correos personales.
  Están en el historial, así que un clon completo los muestra. Reescribir el historial no es parte
  de esta entrega. Ver `REFERENCIAS.md`.

## D. Lo que falta en el paquete de auditoría

- **PROMPT_MAESTRO** y **ANEXO_HALLAZGOS_Y_DECISIONES**: no están en el repositorio ni en los
  archivos del proyecto que tenemos a la vista. Hay que pedirlos al equipo para incluirlos.
- **Etiqueta `auditoria-2026-11-15`:** no se pudo crear. El envío de la etiqueta al origen devolvió
  HTTP 403. La rama sí está publicada. Hay que crear la etiqueta desde la interfaz de GitHub o
  dar permiso de etiquetas al token.
- **Pruebas de integración:** requieren PostgreSQL 16 y Redis en marcha. Sin ellos fallan al
  conectar. Esto no es un fallo del código.
