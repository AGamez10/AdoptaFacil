# Verificación: ¿cada plan habilita lo que promete?

Fecha: 2026-11-06 (actualizado tras #87, #88 y #90) · Rama base: `claude/templates-on-main`
Evidencia: `apps/api/test/plan-entitlements-matrix.integration-spec.ts` (31 pruebas) más
`plans.integration-spec.ts` y `plans-enforcement.integration-spec.ts` (15 pruebas), corridas
contra PostgreSQL 16 y Redis reales, con los planes **encendidos** y la promoción terminada.
Cobro con Mercado Pago: `apps/api/test/plan-billing.integration-spec.ts` (11 pruebas, Mercado Pago
simulado sin red). Resultado: 105/105 en las suites de planes, portal, exportes y correos.

## Lo primero: hoy los planes están apagados

`PLAN_ENFORCEMENT` viene apagado por defecto (`env.validation.ts`, `deploy/api.env.example`
lo tiene comentado). Mientras esté apagado **toda organización es Pro y nada se bloquea**
(probado: «con los planes apagados toda organización es Pro»). Al encenderlo, quien no tenga
suscripción tiene Pro gratis 3 meses desde `PLAN_LAUNCH_DATE` y después queda en Gratis.

## Tabla plan → derechos

✅ = el servidor lo hace cumplir y una prueba lo demuestra · ⚠️ = se vende pero el servidor
no lo controla · 🕒 = marcado «próximamente» en la oferta (no se promete como disponible)

| Derecho                                 | Gratis    | Crece     | Pro        | Dónde se hace cumplir                                                                  | Estado                                      |
| --------------------------------------- | --------- | --------- | ---------- | -------------------------------------------------------------------------------------- | ------------------------------------------- |
| Miembros del equipo                     | 3         | 10        | sin límite | invitaciones (crear y aceptar) y, desde este PR, asignación directa de rol             | ✅ (hueco corregido aquí)                   |
| Almacenamiento                          | 1 GB      | 10 GB     | 50 GB      | subida genérica (fotos de animales, logo), documentos, marketplace, soportes contables | ✅                                          |
| Plantillas Pro del portal ("historias") | bloqueado | sí        | sí         | `PUT /portals/theme` + portal público                                                  | ✅                                          |
| Quitar sello "Hecho con AdoptaFácil"    | bloqueado | sí        | sí         | `PUT /portals/theme` + portal público                                                  | ✅                                          |
| Correos con la marca de la organización | no        | 5.000/mes | 20.000/mes | cola de correos (pasado el tope sale con marca AdoptaFácil)                            | ✅                                          |
| Exportar datos a Excel                  | 403       | 200       | 200        | `PlanGuard` en `/org/exports/data.xlsx`                                                | ✅                                          |
| Reporte de impacto PDF                  | 403       | 200       | 200        | `PlanGuard` en `/org/exports/impact-report.pdf`                                        | ✅                                          |
| Todos los diseños gratuitos del portal  | sí        | sí        | sí         | —                                                                                      | ✅                                          |
| Personalización avanzada del portal     | sí        | sí        | sí         | incluida en todos los planes desde el 2026-11-06 (no se vende como exclusiva)          | ✅                                          |
| Soporte prioritario por WhatsApp        | —         | —         | sí         | no hay código: es un proceso del equipo                                                | ⚠️ marcado disponible, depende de operación |
| Dominio propio                          | —         | —         | sí         | no construido                                                                          | 🕒                                          |
| Patrocinio de empresas                  | —         | —         | sí         | no construido                                                                          | 🕒                                          |
| Límite "Diseños de portal" (5)          | 5         | 5         | 5          | ninguno; igual en los tres planes                                                      | sin efecto                                  |

Lo que nunca se cobra (contrato, seguimientos, auditoría, documentos legales, comprobantes,
recaudo de donaciones) no lleva ningún bloqueo de plan, como dice el catálogo. Los archivos
que suben terceros (pruebas de un donante en el banco de recursos, fotos y videos de
seguimiento del adoptante, contratos y documentos del representante legal) no consumen la
cuota: un límite comercial no detiene un proceso de protección.

## Ciclo de vida (probado)

| Situación                                  | Qué pasa                                                                                                                                                                                                                                                                                                                 |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Contratar en línea                         | «Pagar con Mercado Pago» crea una suscripción mensual en la cuenta de AdoptaFácil, con IVA y descuento fundador. El plan rige cuando Mercado Pago confirma el primer cobro aprobado (firma verificada); autorizar sin cobro no lo activa. Con los planes apagados responde 409: nadie paga por algo que ya tiene gratis. |
| Contratar por transferencia                | La plataforma lo activa en **Plataforma → Planes de organizaciones** (`/plataforma/planes`) con fecha, factura y descuento. Queda auditado.                                                                                                                                                                              |
| Renovación                                 | Cada cobro mensual aprobado extiende el periodo un mes. Repetir la misma notificación no cambia nada.                                                                                                                                                                                                                    |
| Cobro rechazado                            | La suscripción pasa a **pago vencido**: sigue funcionando hasta 15 días después del fin de periodo mientras Mercado Pago reintenta. Un cobro aprobado la reactiva. Pasada la gracia, Gratis.                                                                                                                             |
| Subir o bajar de plan                      | La suscripción nueva rige con su primer cobro aprobado y la anterior **se cancela en Mercado Pago** (sin doble cobro).                                                                                                                                                                                                   |
| Cancelar                                   | Botón «Cancelar mi plan» (Owner/Administrador). Primero se detiene el cobro en Mercado Pago; si Mercado Pago no responde no se marca nada. El plan sigue hasta el último día pagado, sin gracia, y luego Gratis.                                                                                                         |
| Cancelación de la plataforma               | Cancelado sin fecha = Gratis de inmediato; con fecha = hasta ese día. Si la organización pagaba por Mercado Pago, ese cobro se cancela antes de guardar.                                                                                                                                                                 |
| Dejar de pagar / bajar                     | No se borra nada: plantilla Pro y "sin sello" quedan guardados y vuelven al pagar. Los miembros de más se conservan; solo no se agregan nuevos.                                                                                                                                                                          |
| Una organización intenta asignarse un plan | 403.                                                                                                                                                                                                                                                                                                                     |

## Avisos por correo (diarios, solo con planes encendidos)

Al dueño de la organización, una vez por situación:

- plan pagado por transferencia que vence en 7 días o menos ("Tu plan Crece vence el…");
- cobro fallido o periodo vencido, con la fecha en que pasa a Gratis;
- plan cancelado que termina en 7 días o menos.

Quien paga con Mercado Pago y renueva normalmente no recibe nada.

## Para salir mañana

- **Planes apagados** (`PLAN_ENFORCEMENT` sin poner): todas las organizaciones tienen todo gratis
  y el botón de pagar responde «no hay nada que pagar todavía».
- Para empezar a cobrar: `PLAN_ENFORCEMENT=true`, `PLAN_LAUNCH_DATE=<fecha>` (3 meses de Pro
  gratis desde esa fecha) y `MERCADOPAGO_PLATFORM_ACCESS_TOKEN` de la cuenta de AdoptaFácil, más
  el webhook de **Planes y suscripciones** en la app de Mercado Pago apuntando a
  `https://<api>/billing/webhooks/mercadopago` (ver `docs/pagos/mercadopago-oauth.md` §7).

## Lo que sigue sin estar

1. **Probado solo con Mercado Pago simulado.** Falta una corrida en el sandbox de Mercado Pago
   con un usuario de prueba antes de cobrar dinero real.
2. **Factura electrónica** del plan: no se genera; la emite el contador. 🧾
3. **Soporte prioritario por WhatsApp** (Pro) depende del equipo, no del código.
4. **Dominio propio** y **patrocinio de empresas** siguen «próximamente».
5. El límite "Diseños de portal" (5) es igual en los tres planes y no se aplica.

## Correcciones de esta verificación

- **#87:** asignar un rol directamente se saltaba el límite de miembros. Ahora dar el primer rol
  cuenta como un miembro nuevo.
- **Este PR:** cancelación con lo pagado respetado, cancelación del cobro anterior al cambiar de
  plan, cobro rechazado → pago vencido, avisos por correo, pantalla de superadmin, botón de
  cancelar y personalización avanzada en todos los planes.
