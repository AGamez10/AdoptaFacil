# Verificación: ¿cada plan habilita lo que promete?

Fecha: 2026-11-06 (actualizado tras #87, #88 y #90) · Rama base: `claude/templates-on-main`
Evidencia: `apps/api/test/plan-entitlements-matrix.integration-spec.ts` (31 pruebas) más
`plans.integration-spec.ts` y `plans-enforcement.integration-spec.ts` (15 pruebas), corridas
contra PostgreSQL 16 y Redis reales, con los planes **encendidos** y la promoción terminada.
Cobro con Mercado Pago: `apps/api/test/plan-billing.integration-spec.ts` (11 pruebas, Mercado Pago
simulado sin red). Resultado: 105/105 en las suites de planes, portal, exportes y correos.

## Verificación 2026-11-24: ¿se cumple todo lo que se ofrece?

Rama base: `claude/project-thread-svlwgg` (tras #159, planes sin IVA). Se revisó cada promesa de la
landing, de «Plan y facturación», del correo de activación y de las Condiciones para
organizaciones 2026-11-23.

| Promesa                                                     | Dónde se promete                     | Estado                                                                                     |
| ----------------------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------ |
| Plantillas Pro del portal                                   | landing, Plan y facturación, correo  | ✅ (la etiqueta decía «como Historias», que es gratis desde #130; ahora dice «Documental») |
| Portal sin sello, correos con tu marca, Excel, reporte PDF  | ídem                                 | ✅                                                                                         |
| Cierre mensual, exporte contable completo, paquete contador | ídem                                 | ✅                                                                                         |
| Miembros (10 / sin límite) y almacenamiento (10 / 50 GB)    | ídem                                 | ✅                                                                                         |
| Dominio propio (Pro)                                        | ídem                                 | ✅ con `CUSTOM_DOMAINS=on` en el servidor                                                  |
| Soporte prioritario por WhatsApp (Pro)                      | ídem                                 | ✅ canal visible; la prioridad la da el equipo                                             |
| Patrocinio de empresas (Pro)                                | tarjeta de Pro con «Próximamente»    | ❌ no existe → **se quitó de la oferta** hasta que funcione                                |
| «Diseños de portal: 5» en cada plan                         | Plan y facturación                   | ❌ hay 30 diseños y el límite no se aplica → **se dejó de mostrar**                        |
| Comprobante de cada cobro con identificación tributaria     | Condiciones para organizaciones §5.3 | ❌ solo había aviso de activación → **nuevo correo `plan.charged` en cada cobro aprobado** |
| Conciliación contra Mercado Pago «en Crece y Pro»           | guía de Contabilidad                 | ⚠️ es gratis para todos → texto corregido                                                  |
| Precio anual                                                | landing, Plan y facturación          | ✅ por transferencia, la plataforma lo activa a mano                                       |

Evidencia: `plan-pro-activation.integration-spec.ts` ahora exige el comprobante (con NIT, sin IVA,
sin marca de la organización, uno por cobro, sin duplicar si Mercado Pago repite la notificación
y otro en la renovación); `packages/contracts/test/plans.test.ts` impide anunciar junto a un precio
algo con `available: false` y exige que la plantilla nombrada en la etiqueta sea de pago.

## Verificación 2026-11-21: pagar un plan activa lo que promete

Evidencia: `apps/api/test/plan-pro-activation.integration-spec.ts` (Mercado Pago simulado, planes
encendidos, sin promoción ni prueba). Una organización en Gratis paga con el flujo real
(checkout → autorización → cobro aprobado por webhook firmado) y, sin que nadie de la plataforma
haga nada, cada derecho se prueba por HTTP antes y después del pago.

| Promesa de la tarjeta (landing y Plan y facturación) | Crece | Pro        | Tras el pago aprobado                                                                                                       |
| ---------------------------------------------------- | ----- | ---------- | --------------------------------------------------------------------------------------------------------------------------- |
| Plantillas Pro del portal                            | sí    | sí         | ✅ se habilita y el portal público la muestra                                                                               |
| Portal sin el sello                                  | sí    | sí         | ✅                                                                                                                          |
| Correos con tu marca                                 | 5.000 | 20.000     | ✅ (tope visible en Plan y facturación)                                                                                     |
| Exportar a Excel y reporte de impacto PDF            | sí    | sí         | ✅ 403 → 200                                                                                                                |
| Cierre mensual, exporte contable completo, contador  | sí    | sí         | ✅                                                                                                                          |
| Miembros del equipo                                  | 10    | sin límite | ✅                                                                                                                          |
| Dominio propio                                       | —     | sí         | ✅ (necesita `CUSTOM_DOMAINS` configurado en el servidor)                                                                   |
| Soporte prioritario por WhatsApp                     | —     | sí         | ✅ desde este PR la pantalla de Pro muestra el canal; lo atiende el equipo                                                  |
| Patrocinio de empresas                               | —     | sí         | 🕒 «Próximamente» en la tarjeta (no se promete como disponible)                                                             |
| Aviso al dueño                                       | sí    | sí         | ✅ desde este PR: correo «Tu plan Pro ya está activo» con la plantilla                                                      |
| Precio anual                                         | sí    | sí         | ⚠️ en línea solo hay cobro mensual; el anual se paga por transferencia y la plataforma lo activa (ahora la tarjeta lo dice) |

También probado: cancelar deja el plan hasta el fin de lo pagado; luego Gratis sin borrar nada
(la plantilla Pro y el «sin sello» quedan guardados) y al volver a pagar regresan solos. Subir de
Crece a Pro cancela el cobro de Crece. Una notificación repetida de Mercado Pago no cambia nada ni
reenvía el aviso.

Bajar de plan con periodo pagado (decisión del dueño, 2026-11-21): quien tiene Pro pagado y elige
Crece conserva Pro hasta el último día pagado. Al autorizar Crece, el cobro mensual de Pro se
detiene y Crece queda programado (`scheduled_plan`); Mercado Pago hace el primer cobro de Crece ese
día (`start_date`) y entonces rige Crece. Si ese cobro no llega, Pro termina en su fecha y queda
Gratis. «Cancelar mi plan» también detiene el plan programado. Probado en
`plan-pro-activation.integration-spec.ts`.

## Lo primero: hoy los planes están apagados

`PLAN_ENFORCEMENT` viene apagado por defecto (`env.validation.ts`, `deploy/api.env.example`
lo tiene comentado). Mientras esté apagado **toda organización es Pro y nada se bloquea**
(probado: «con los planes apagados toda organización es Pro»). Al encenderlo, quien no tenga
suscripción tiene Pro gratis 3 meses desde `PLAN_LAUNCH_DATE` y después queda en Gratis.

## Tabla plan → derechos

✅ = el servidor lo hace cumplir y una prueba lo demuestra · ⚠️ = se vende pero el servidor
no lo controla · 🕒 = marcado «próximamente» en la oferta (no se promete como disponible)

| Derecho                                 | Gratis    | Crece     | Pro        | Dónde se hace cumplir                                                                                                  | Estado                                      |
| --------------------------------------- | --------- | --------- | ---------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| Miembros del equipo                     | 3         | 10        | sin límite | invitaciones (crear y aceptar) y, desde este PR, asignación directa de rol                                             | ✅ (hueco corregido aquí)                   |
| Almacenamiento                          | 1 GB      | 10 GB     | 50 GB      | subida genérica (fotos de animales, logo), documentos, marketplace, soportes contables                                 | ✅                                          |
| Plantillas Pro del portal ("historias") | bloqueado | sí        | sí         | `PUT /portals/theme` + portal público                                                                                  | ✅                                          |
| Quitar sello "Hecho con AdoptaFácil"    | bloqueado | sí        | sí         | `PUT /portals/theme` + portal público                                                                                  | ✅                                          |
| Correos con la marca de la organización | no        | 5.000/mes | 20.000/mes | cola de correos (pasado el tope sale con marca AdoptaFácil)                                                            | ✅                                          |
| Exportar datos a Excel                  | 403       | 200       | 200        | `PlanGuard` en `/org/exports/data.xlsx`                                                                                | ✅                                          |
| Reporte de impacto PDF                  | 403       | 200       | 200        | `PlanGuard` en `/org/exports/impact-report.pdf`                                                                        | ✅                                          |
| Todos los diseños gratuitos del portal  | sí        | sí        | sí         | —                                                                                                                      | ✅                                          |
| Personalización avanzada del portal     | sí        | sí        | sí         | incluida en todos los planes desde el 2026-11-06 (no se vende como exclusiva)                                          | ✅                                          |
| Soporte prioritario por WhatsApp        | —         | —         | sí         | no hay código: es un proceso del equipo                                                                                | ⚠️ marcado disponible, depende de operación |
| Dominio propio                          | —         | —         | sí         | la org compra el dominio; CNAME + TXT; verificación DNS y HTTPS on-demand (`portal-custom-domain.integration-spec.ts`) | ✅ (encender con `CUSTOM_DOMAINS=on`)       |
| Patrocinio de empresas                  | —         | —         | sí         | no construido; fuera de la oferta desde 2026-11-24                                                                     | 🕒                                          |
| Límite "Diseños de portal" (5)          | 5         | 5         | 5          | ninguno; igual en los tres planes                                                                                      | sin efecto                                  |

Lo que nunca se cobra (contrato, seguimientos, auditoría, documentos legales, comprobantes,
recaudo de donaciones) no lleva ningún bloqueo de plan, como dice el catálogo. Los archivos
que suben terceros (pruebas de un donante en el banco de recursos, fotos y videos de
seguimiento del adoptante, contratos y documentos del representante legal) no consumen la
cuota: un límite comercial no detiene un proceso de protección.

## Ciclo de vida (probado)

| Situación                                  | Qué pasa                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contratar en línea                         | «Pagar con Mercado Pago» crea una suscripción mensual en la cuenta de AdoptaFácil, sin IVA mientras el titular no sea responsable de IVA (#159), con descuento fundador. El plan rige cuando Mercado Pago confirma el primer cobro aprobado (firma verificada); autorizar sin cobro no lo activa. Con los planes apagados responde 409: nadie paga por algo que ya tiene gratis. |
| Contratar por transferencia                | La plataforma lo activa en **Plataforma → Planes de organizaciones** (`/plataforma/planes`) con fecha, factura y descuento. Queda auditado.                                                                                                                                                                                                                                      |
| Renovación                                 | Cada cobro mensual aprobado extiende el periodo un mes. Repetir la misma notificación no cambia nada.                                                                                                                                                                                                                                                                            |
| Cobro rechazado                            | La suscripción pasa a **pago vencido**: sigue funcionando hasta 15 días después del fin de periodo mientras Mercado Pago reintenta. Un cobro aprobado la reactiva. Pasada la gracia, Gratis.                                                                                                                                                                                     |
| Subir o bajar de plan                      | La suscripción nueva rige con su primer cobro aprobado y la anterior **se cancela en Mercado Pago** (sin doble cobro).                                                                                                                                                                                                                                                           |
| Cancelar                                   | Botón «Cancelar mi plan» (Owner/Administrador). Primero se detiene el cobro en Mercado Pago; si Mercado Pago no responde no se marca nada. El plan sigue hasta el último día pagado, sin gracia, y luego Gratis.                                                                                                                                                                 |
| Cancelación de la plataforma               | Cancelado sin fecha = Gratis de inmediato; con fecha = hasta ese día. Si la organización pagaba por Mercado Pago, ese cobro se cancela antes de guardar.                                                                                                                                                                                                                         |
| Dejar de pagar / bajar                     | No se borra nada: plantilla Pro y "sin sello" quedan guardados y vuelven al pagar. Los miembros de más se conservan; solo no se agregan nuevos.                                                                                                                                                                                                                                  |
| Una organización intenta asignarse un plan | 403.                                                                                                                                                                                                                                                                                                                                                                             |

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

1. **Probado solo con Mercado Pago simulado.** Falta un cobro real pequeño (que luego se
   reembolsa) para ver de punta a punta la activación y el comprobante antes de abrir el cobro.
2. **Factura electrónica** del plan: no se genera; la emite el contador. 🧾
3. **Soporte prioritario por WhatsApp** (Pro) depende del equipo, no del código.
4. **Patrocinio de empresas** sigue «próximamente». El **dominio propio** está construido (ver `docs/operacion/DOMINIO-PROPIO.md`).
5. El límite "Diseños de portal" (5) es igual en los tres planes y no se aplica.

## Correcciones de esta verificación

- **#87:** asignar un rol directamente se saltaba el límite de miembros. Ahora dar el primer rol
  cuenta como un miembro nuevo.
- **Este PR:** cancelación con lo pagado respetado, cancelación del cobro anterior al cambiar de
  plan, cobro rechazado → pago vencido, avisos por correo, pantalla de superadmin, botón de
  cancelar y personalización avanzada en todos los planes.
