# Verificación: ¿cada plan habilita lo que promete?

Fecha: 2026-11-06 · Rama base: `claude/templates-on-main` (16bce40)
Evidencia: `apps/api/test/plan-entitlements-matrix.integration-spec.ts` (31 pruebas) más
`plans.integration-spec.ts` y `plans-enforcement.integration-spec.ts` (15 pruebas), corridas
contra PostgreSQL 16 y Redis reales, con los planes **encendidos** y la promoción terminada.
Resultado: 58/58 en verde junto con las suites de auditoría y roles.

## Lo primero: hoy los planes están apagados

`PLAN_ENFORCEMENT` viene apagado por defecto (`env.validation.ts`, `deploy/api.env.example`
lo tiene comentado). Mientras esté apagado **toda organización es Pro y nada se bloquea**
(probado: «con los planes apagados toda organización es Pro»). Al encenderlo, quien no tenga
suscripción tiene Pro gratis 3 meses desde `PLAN_LAUNCH_DATE` y después queda en Gratis.

## Tabla plan → derechos

✅ = el servidor lo hace cumplir y una prueba lo demuestra · ⚠️ = se vende pero el servidor
no lo controla · 🕒 = marcado «próximamente» en la oferta (no se promete como disponible)

| Derecho                                 | Gratis    | Crece     | Pro        | Dónde se hace cumplir                                                                  | Estado                                            |
| --------------------------------------- | --------- | --------- | ---------- | -------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Miembros del equipo                     | 3         | 10        | sin límite | invitaciones (crear y aceptar) y, desde este PR, asignación directa de rol             | ✅ (hueco corregido aquí)                         |
| Almacenamiento                          | 1 GB      | 10 GB     | 50 GB      | subida genérica (fotos de animales, logo), documentos, marketplace, soportes contables | ✅                                                |
| Plantillas Pro del portal ("historias") | bloqueado | sí        | sí         | `PUT /portals/theme` + portal público                                                  | ✅                                                |
| Quitar sello "Hecho con AdoptaFácil"    | bloqueado | sí        | sí         | `PUT /portals/theme` + portal público                                                  | ✅                                                |
| Correos con la marca de la organización | no        | 5.000/mes | 20.000/mes | cola de correos (pasado el tope sale con marca AdoptaFácil)                            | ✅                                                |
| Exportar datos a Excel                  | 403       | 200       | 200        | `PlanGuard` en `/org/exports/data.xlsx`                                                | ✅                                                |
| Reporte de impacto PDF                  | 403       | 200       | 200        | `PlanGuard` en `/org/exports/impact-report.pdf`                                        | ✅                                                |
| Todos los diseños gratuitos del portal  | sí        | sí        | sí         | —                                                                                      | ✅                                                |
| Personalización avanzada del portal     | sí (!)    | sí        | sí         | **ninguna comprobación** en el servidor                                                | ⚠️ se vende en Crece pero Gratis también la tiene |
| Soporte prioritario por WhatsApp        | —         | —         | sí         | no hay código: es un proceso del equipo                                                | ⚠️ marcado disponible, depende de operación       |
| Dominio propio                          | —         | —         | sí         | no construido                                                                          | 🕒                                                |
| Patrocinio de empresas                  | —         | —         | sí         | no construido                                                                          | 🕒                                                |
| Límite "Diseños de portal" (5)          | 5         | 5         | 5          | ninguno; igual en los tres planes                                                      | sin efecto                                        |

Lo que nunca se cobra (contrato, seguimientos, auditoría, documentos legales, comprobantes,
recaudo de donaciones) no lleva ningún bloqueo de plan, como dice el catálogo. Los archivos
que suben terceros (pruebas de un donante en el banco de recursos, fotos y videos de
seguimiento del adoptante, contratos y documentos del representante legal) no consumen la
cuota: un límite comercial no detiene un proceso de protección.

## Ciclo de vida (probado)

| Situación                                  | Qué pasa                                                                                                                                                                                                       |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contratar                                  | La organización pulsa «Quiero el plan» → abre WhatsApp/enlace de contacto. Un administrador de plataforma activa el plan con `PUT /platform/organizations/:id/plan`. Rige de inmediato y queda auditado.       |
| Subir de plan                              | Inmediato.                                                                                                                                                                                                     |
| Bajar de plan / dejar de pagar             | No se borra nada: la plantilla Pro y el "sin sello" quedan guardados, el portal vuelve a la gratuita con sello, y regresan solos al pagar. Los miembros de más se conservan; solo no se pueden agregar nuevos. |
| Pago vencido (`past_due` o fecha pasada)   | Sigue funcionando 15 días de gracia; luego Gratis automáticamente, sin tareas programadas.                                                                                                                     |
| Cancelado                                  | Gratis de inmediato aunque quede periodo.                                                                                                                                                                      |
| Una organización intenta asignarse un plan | 403.                                                                                                                                                                                                           |

## Lo que falta para cobrar planes de verdad

1. **No hay cobro automático.** No existe integración de suscripciones con ePayco ni Mercado
   Pago para la cuenta de AdoptaFácil; el proveedor es `manual`. El precio, el IVA y el
   descuento se guardan pero nada los cobra ni factura.
2. **No hay pantalla de superadmin para asignar planes.** Hoy se hace llamando la API.
3. **Nadie pasa una suscripción a `past_due` ni avisa antes del vencimiento.** El vencimiento
   funciona solo por fecha; no hay correo de "tu plan vence en N días".
4. **Personalización avanzada** se ofrece como beneficio de Crece pero Gratis también la
   tiene. Decisión pendiente: o se bloquea en el servidor (definir qué cuenta: orden de
   secciones, tipografía, galería o video de portada) o se quita de la lista de Crece.
5. `discountPercent` se guarda y la pantalla del plan muestra "% de descuento fundador", pero
   no cambia ningún precio calculado ni cobrado.

## Corrección incluida en este PR

**Asignación directa de roles saltaba el límite de miembros.** `POST /rbac/roles` daba un
rol a alguien de la organización que no tenía ninguno sin contar el tope del plan: revocar
los roles de alguien, invitar a otra persona y luego devolverle un rol dejaba 4 miembros en
Gratis. Ahora dar el primer rol cuenta como un miembro nuevo (igual que aceptar una
invitación); dar un rol adicional a quien ya es miembro no. La prueba falla sin el cambio y
pasa con él.
