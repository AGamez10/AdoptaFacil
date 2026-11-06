# Contabilidad de donaciones y firma del revisor fiscal

Estado: implementado (rama `claude/project-thread-rdduzp`). Depende de ADR-PAG-003
(Mercado Pago por OAuth, `docs/pagos/mercadopago-oauth.md`).

AdoptaFácil **prepara y concilia**; nunca firma, certifica ni declara. La firma es
del contador público o del revisor fiscal de la organización.

## Qué hace

| Pieza                     | Dónde                                                                   | Plan       |
| ------------------------- | ----------------------------------------------------------------------- | ---------- |
| Libro auxiliar del mes    | `GET /org/accounting/periods/:period`                                   | Todos      |
| Conciliación con MP       | `GET …/reconciliation`, `POST …/reread`                                 | Todos      |
| Exporte básico (CSV/XLSX) | `GET …/export?detail=basic`                                             | Todos      |
| Exporte completo          | `GET …/export?detail=full`                                              | Crece, Pro |
| Cierre de mes             | `POST …/close`                                                          | Crece, Pro |
| Libro firmable            | al cerrar, o `POST …/report` (reintento)                                | Crece, Pro |
| Compartir con el revisor  | `POST …/shares`, `DELETE /org/accounting/shares/:id`                    | Crece, Pro |
| Vista sin cuenta          | `/contabilidad-compartida#token=…` → `POST /public/accounting/shares/*` | —          |
| Soportes al firmar        | `/firmar` → `POST /public/accounting/signature-package`                 | —          |

Roles: ver (Owner, Administrador, Auditor de solo lectura); gestionar (Owner,
Administrador). Planes: `PlanGuard` responde 403 `PLAN_REQUIRED`.

## Reglas

- **Solo lo que Mercado Pago confirma.** Cada renglón sale de una donación
  aprobada y verificada con el token de la organización (read-back), con la
  comisión real (`fee_details`, `fee_payer = collector`) y la forma de pago.
- **Inmutable.** `accounting_entries`, `accounting_period_closes` y
  `accounting_shares` son de solo inserción (trigger que rechaza `UPDATE`/`DELETE`,
  también para el superusuario; en `accounting_shares` solo se puede marcar
  `revoked_at`). Las correcciones son renglones nuevos.
- **Idempotente.** `dedup_key` único por organización: `donation:<id>`,
  `refund:<pago>:<reembolso>`, `chargeback:<pago>`. El libro se sincroniza al
  leer, cerrar o compartir, con candado por organización y folio secuencial.
- **Meses en hora de Colombia** (UTC−5). Un reembolso de un mes ya cerrado entra
  como **ajuste** en el mes en curso, con su mes de origen; un contracargo se
  registra en el mes en que ocurre.
- **Cierre.** Solo meses terminados. Si la conciliación tiene diferencias, hay
  que confirmarlo (`acknowledgeDiscrepancies`) y se recomienda explicarlo en la
  nota. El cierre guarda totales, conciliación y la huella SHA-256 de los
  renglones. Si el libro firmable no se puede generar (p. ej. la política exige
  una firma no registrada), el mes queda cerrado y la respuesta trae
  `reportError`; se reintenta con `POST …/report`.
- **Firma sin cuenta.** Al vincular a un revisor fiscal o contador
  (Documentos → Firmantes) le llega un correo de bienvenida. Al cerrar, recibe
  el enlace `/firmar#token=…`: la primera vez registra su firma (dibujo o foto)
  y acepta el consentimiento; las siguientes solo confirma con su cédula.
- **Compartir.** Enlace de 30 días, revocable, solo a un firmante vinculado
  vigente; deja de servir si la vinculación se revoca o el plan vence. El token
  viaja en el fragmento de la URL y en el cuerpo de la petición, nunca en la
  ruta ni en los registros. Solo se guarda su hash.
- **Datos de donantes.** El exporte completo identifica solo a donantes con
  cuenta que autorizaron el uso de sus datos.
- **Multi-tenant.** RLS `ENABLE` + `FORCE` + `tenant_isolation` en las tres
  tablas; el acceso sin sesión pasa por la función `SECURITY DEFINER`
  `accounting_share_by_token_hash`.

## Pendiente de validación profesional

- 🧾 Texto de la declaración del contador/revisor en el PDF (`TODO(client)` en
  `report-pdf.ts`).
- 🧾 Si el libro auxiliar sirve como soporte contable tal cual o requiere
  campos adicionales (cuenta PUC, tercero, centro de costo).
- 🧾 Tratamiento de comisiones devueltas en reembolsos parciales.
- 🧾 Formato de información exógena (no se genera).
- ⚖️ Entrega de datos de donantes al contador (base: autorización del donante).
- ⚖️ Validez de la firma electrónica simple (Ley 527 de 1999, Decreto 2364 de 2012)
  para estos documentos.
