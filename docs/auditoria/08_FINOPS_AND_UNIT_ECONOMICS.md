# 08 · FinOps y economía unitaria

> Línea base del repo **48cabad** (2026-10-07). **Todo número que no lleve fuente es un SUPUESTO** y está marcado así. No hay datos reales de operación (no hay organizaciones pagando ni GMV real). El modelo reproducible está en `evidencia/legal_pagos/financial_model.py` → `FINANCIAL_MODEL.csv` (ejecutar `python3 -I evidencia/legal_pagos/financial_model.py > FINANCIAL_MODEL.csv`).
> Moneda: COP/mes salvo indicación. Tipo de cambio **SUPUESTO**: 1 USD = 4.000 COP.

---

## 0. Resumen (5 líneas)

1. **GMV ≠ revenue**: el ingreso de AdoptaFácil es el **4 %** del GMV procesado (más planes, dominios, B2B y proyectos); el IVA de la comisión (19 % del 4 % = 0,76 % del GMV) es un **pasivo**, no ingreso — hoy el dashboard lo suma dentro de `platformFeeTotal` (`packages/contracts/src/dashboards.ts:118-145`, PAY-011).
2. **El 4 % solo no sostiene la empresa**: con el fundador remunerado (6 M COP/mes, SUPUESTO) el punto de equilibrio **solo con comisión** es ~**496 orgs** en BASE y ~**81** en AGRESIVO; en CONSERVADOR **nunca** (>5.000). Sin sueldo del fundador: 159 (BASE) / 16 (AGRESIVO).
3. Con **B2B (patrocinio corporativo), planes, dominios y proyectos** el equilibrio con fundador baja a ~**123 orgs** (BASE) y ~**33** (AGRESIVO); el CONSERVADOR sigue sin cerrar: el negocio depende de que el B2B exista y de que las orgs **recauden de verdad** (% activas y GMV por org son las variables que más pesan).
4. La infraestructura no es el problema: **VPS Hostinger (D11) cuesta ~USD 15–55/mes hasta 100 orgs** (≈ 600–1.200 COP por org/mes); el costo dominante es **gente** (fundador, soporte, abogado/contador).
5. Con custodia (modelo actual del repo) habría que sumar GMF 4×1000 sobre la dispersión y costos de conciliación/tesorería; con **split real** esos costos desaparecen de AdoptaFácil — otra razón para PAY-001.

---

## 1. Contabilidad de una transacción (unidad), GMV ≠ revenue

Fórmula del repo (`packages/contracts/src/payments.ts:322-371`), modo "la organización absorbe" (`commissionPayer='organization'`), donación de **100.000 COP**:

| Concepto                                                                           | Valor           | Naturaleza                                                                                                                                       |
| ---------------------------------------------------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| GMV (bruto cobrado al donante)                                                     | 100.000         | Dinero de la organización (agente: AdoptaFácil **no** lo reconoce como ingreso)                                                                  |
| Fee de plataforma 4 %                                                              | 4.000           | **Revenue** de AdoptaFácil                                                                                                                       |
| IVA sobre el fee (19 %)                                                            | 760             | Pasivo (se traslada a la DIAN) — POR CONFIRMAR CON CONTADOR régimen de IVA de AdoptaFácil                                                        |
| Fee PSP (lo que el repo usa hoy: Wompi 2,65 % + 700)                               | 3.350           | Costo de la organización (con split real lo cobra el PSP al collector)                                                                           |
| IVA del fee PSP (19 %)                                                             | 637             | Costo de la organización                                                                                                                         |
| **Neto a la organización** (repo hoy)                                              | **91.253**      |                                                                                                                                                  |
| Fee PSP con referencia pública MP (3,29 % + 800 + IVA, Link de Pago "al instante") | 4.090 + 777 IVA | **Referencia**, no tarifa confirmada para Checkout API/Split — https://www.mercadopago.com.co/herramientas-para-vender/link-de-pago (2026-10-07) |
| Neto a la organización con referencia MP                                           | ≈ 90.373        | Coincide con el cálculo del proyecto anterior (ANEXO §6)                                                                                         |
| ICA sobre ingreso de AF (SUPUESTO 9,66 ‰)                                          | ≈ 39            | Costo de AF — POR CONFIRMAR CON CONTADOR                                                                                                         |
| **Ingreso neto AF por transacción**                                                | **≈ 3.961**     |                                                                                                                                                  |

Si el donante "cubre la comisión" (`commissionPayer='donor'`), el bruto se infla (gross-up) para que el neto ≈ monto deseado; el revenue de AF sigue siendo el 4 % del **bruto inflado**. Ojo legal: el donante paga IVA de la comisión de AF — POR CONFIRMAR CON CONTADOR quién es el cliente facturable (¿la org o el donante?).

**Con custodia (repo actual)**: GMF 4×1000 en cada dispersión (≈ 365 COP sobre 91.253 → ~9 % del ingreso neto por transacción) + riesgo de contracargos a cargo de AF. **Con split real**: 0 para AF.

---

## 2. Costo operativo: A VPS (D11) vs B gestionado vs C híbrido

### 2.1 Precios unitarios (fuente, consultados 2026-10-07)

| Ítem                                                     | Precio                                                       | Fuente                                                                            |
| -------------------------------------------------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| Hostinger VPS KVM 1 (1 vCPU/4 GB/50 GB)                  | USD 6,49 promo / **11,99 renovación**                        | https://www.hostinger.com/vps-hosting                                             |
| Hostinger KVM 2 (2 vCPU/8 GB/100 GB — D11)               | USD 8,99 promo / **14,99 renovación** (promo exige 24 meses) | idem                                                                              |
| Hostinger KVM 4 (4/16/200)                               | USD 12,99 / **28,99**                                        | idem                                                                              |
| Hostinger KVM 8 (8/32/400)                               | USD 25,99 / **49,99**                                        | idem; "free weekly backups" (en el mismo proveedor ⇒ **no** cuenta como off-site) |
| Render web Starter / Standard / Pro                      | USD 7 / 25 / 85                                              | https://render.com/pricing                                                        |
| Render Postgres Basic-256mb / Basic-1gb / Pro / Pro Plus | USD 6 / 19 / 40 / 200 (+0,30/GB)                             | idem                                                                              |
| Render Key Value Starter / Standard / Pro                | USD 10 / 20 / 60                                             | idem                                                                              |
| Render workspace Pro                                     | USD 25                                                       | idem                                                                              |
| Cloudflare R2                                            | USD 0,015/GB-mes, egress gratis, 10 GB gratis                | https://developers.cloudflare.com/r2/pricing/                                     |
| Backblaze B2 (backups off-site)                          | USD 6,95/TB-mes, 10 GB gratis                                | https://www.backblaze.com/cloud-storage/pricing                                   |
| Amazon SES                                               | USD 0,10 / 1.000 correos                                     | https://aws.amazon.com/ses/pricing/                                               |
| Dominio .com                                             | ~USD 12/año                                                  | **SUPUESTO**                                                                      |
| Monitoreo (uptime + errores)                             | USD 0–26 (planes gratuitos hasta cierto volumen)             | **SUPUESTO**                                                                      |

### 2.2 Configuraciones y costo mensual estimado (USD) — **SUPUESTO de dimensionamiento**

- **A · VPS + Docker Compose (D11):** Caddy + web + API + Postgres + Redis + almacenamiento S3-compatible en el VPS; staging en un KVM 1 desde 50 orgs; backups cifrados off-site en B2; SES.
- **B · Gestionado (Render, el `render.yaml` actual):** API + Postgres + Key Value + estático + disco/objetos; staging duplicado. Nota: `DEPLOY.md` §2 "Hallazgo S1-01" documenta que en Render la postura RLS correcta choca con la falta de `BYPASSRLS` del owner → costo de ingeniería extra.
- **C · Híbrido:** cómputo + Postgres + Redis en VPS; **objetos en R2** (evita operar MinIO, que el ANEXO §5.9 reporta en modo mantenimiento — re-verificar), backups en B2, correo SES, monitoreo SaaS.

| Orgs | A VPS                                                            | B Gestionado                                                       | C Híbrido                  | Costo/org A | Comentario                             |
| ---- | ---------------------------------------------------------------- | ------------------------------------------------------------------ | -------------------------- | ----------- | -------------------------------------- |
| 5    | ~20 (KVM 2 + B2 + SES + dominio)                                 | ~50 (Starter API 7 + PG 6 + KV 10 + staging ~25)                   | ~22                        | USD 4,0     | A sobra                                |
| 20   | ~20                                                              | ~110 (Standard 25 + PG 1gb 19 + KV 10 + staging 30 + workspace 25) | ~25                        | USD 1,0     | A sobra                                |
| 50   | ~35 (+ staging KVM 1)                                            | ~180                                                               | ~40                        | USD 0,70    | A; activar staging separado            |
| 100  | ~55 (KVM 4 + staging + B2 + SES)                                 | ~245                                                               | ~70                        | USD 0,55    | A o C                                  |
| 500  | ~145 (KVM 8 app + KVM 4 BD + staging + backups + monitoreo pago) | ~600                                                               | ~190 (VPS + PG gestionado) | USD 0,29    | C recomendado (BD gestionada con PITR) |

### 2.3 Evaluación cualitativa

| Criterio                     | A VPS                                                           | B Gestionado                                                            | C Híbrido                                    |
| ---------------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------- | -------------------------------------------- |
| Costo                        | Muy bajo                                                        | 3–5× A                                                                  | Bajo                                         |
| Complejidad para el fundador | Media-alta (parches SO, Docker, Caddy, backups)                 | Baja                                                                    | Media                                        |
| Resiliencia                  | Un solo nodo = SPOF; RTO depende del restore probado            | Alta (servicio administrado, pero sin PITR en planes bajos — verificar) | Media-alta (objetos y backups fuera del VPS) |
| Backups                      | Hay que montarlos y **probar restore** (AF-020)                 | Incluidos según plan                                                    | B2 off-site + snapshots                      |
| Seguridad                    | Toda la superficie es tuya (puertos, credenciales, TLS interno) | Menor superficie                                                        | Intermedia                                   |
| Escalabilidad                | Vertical hasta KVM 8; luego separar BD                          | Horizontal fácil                                                        | Vertical + BD gestionada                     |
| Mantenimiento                | ~4–8 h/mes (SUPUESTO)                                           | ~1–2 h/mes                                                              | ~3–5 h/mes                                   |

### 2.4 Recomendación (coste + fiabilidad + velocidad + capacidad del fundador)

| Orgs | Opción                                                      | Condición para cambiar                                                   |
| ---- | ----------------------------------------------------------- | ------------------------------------------------------------------------ |
| 5    | **A** (D11) con backups off-site cifrados y restore probado | —                                                                        |
| 20   | **A**                                                       | Staging separado antes de dinero real                                    |
| 50   | **A → C** (objetos en R2, backups B2)                       | Si el fundador dedica >8 h/mes a operar o hay un incidente de disco      |
| 100  | **C**                                                       | p95 > 2 s sostenido, RAM > 75 %, o necesidad de PITR                     |
| 500  | **C** con Postgres gestionado (PITR) y 2 nodos de app       | Revisar B solo si hay equipo de operación dedicado y el costo no importa |

D11 aguanta cómodamente hasta ~100 orgs en un KVM 2/KVM 4 **si** el catálogo público no tiene el N+1 de AF-011 (verificar en zona b/c); el límite real es operativo (backups, parches, guardias), no de CPU.

---

## 3. Modelo financiero — supuestos declarados

| Variable                                                     | CONSERVADOR            | BASE           | AGRESIVO         | Origen                                                                                                                                          |
| ------------------------------------------------------------ | ---------------------- | -------------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| % de orgs que recaudan en el mes ("% capturado")             | 30 %                   | 50 %           | 65 %             | SUPUESTO (BASE ≈ ANEXO §6: 65 de 100 activas)                                                                                                   |
| GMV/mes por org que recauda                                  | 1,0 M                  | 2,5 M          | 5,0 M            | SUPUESTO (BASE ≈ ANEXO §6: 162 M/65)                                                                                                            |
| Comisión                                                     | 4 %                    | 4 %            | 4 %              | D2                                                                                                                                              |
| Fee PSP a cargo de AF                                        | 0                      | 0              | 0                | SUPUESTO: con split real lo paga el collector (org) — **confirmar con MP**                                                                      |
| Planes mensuales (adopción × precio)                         | 5 % × 49.000           | 10 % × 79.000  | 15 % × 99.000    | **HIPÓTESIS — precio POR DEFINIR por el dueño** (D7). Nota: `AGENTS.md` dice "Gratis para organizaciones"; los planes serían premium opcionales |
| Dominio propio (adopción × precio)                           | 2 % × 25.000           | 5 % × 25.000   | 8 % × 25.000     | HIPÓTESIS (F7, precio POR DEFINIR)                                                                                                              |
| Patrocinios B2B (1 por cada N orgs) × fee de gestión/mes     | 1/25 × 300.000         | 1/15 × 600.000 | 1/10 × 1.000.000 | HIPÓTESIS (D13; contrato y precio POR DEFINIR)                                                                                                  |
| Proyectos de infraestructura (1 por cada N orgs/año) × valor | 0                      | 1/50 × 8 M     | 1/25 × 12 M      | HIPÓTESIS; margen 50 %                                                                                                                          |
| Soporte por org/mes                                          | 15.000                 | 12.000         | 10.000           | SUPUESTO                                                                                                                                        |
| Cloud                                                        | tabla §2.2 opción A    |                |                  | Fuentes §2.1                                                                                                                                    |
| Correo + almacenamiento + monitoreo                          | USD 5 + 0,05/org       |                |                  | SUPUESTO                                                                                                                                        |
| ICA                                                          | 9,66 ‰ del ingreso     |                |                  | SUPUESTO — POR CONFIRMAR CON CONTADOR                                                                                                           |
| Abogado + contador (servicios externos)                      | 1,5 M/mes              | 1,5 M          | 1,5 M            | SUPUESTO                                                                                                                                        |
| Seguridad (pentest anual prorrateado)                        | 1 M/mes desde 50 orgs  |                |                  | SUPUESTO                                                                                                                                        |
| Compensación del fundador                                    | 6 M/mes                | 6 M            | 6 M              | SUPUESTO (ANEXO §6)                                                                                                                             |
| CAC por org                                                  | 400.000                | 250.000        | 150.000          | SUPUESTO                                                                                                                                        |
| Churn mensual                                                | 4 %                    | 2,5 %          | 1,5 %            | SUPUESTO                                                                                                                                        |
| Altas/mes                                                    | churn + 5 % de la base |                |                  | SUPUESTO                                                                                                                                        |
| Caja inicial                                                 | 30 M                   | 30 M           | 30 M             | SUPUESTO — POR DEFINIR por el dueño                                                                                                             |
| Tipo de cambio                                               | 4.000 COP/USD          |                |                  | SUPUESTO                                                                                                                                        |

Definiciones: **MRR** = fee 4 % + planes + dominios + B2B (proyectos fuera); **Net revenue** = MRR + proyectos (sin IVA); **margen bruto** = net revenue − (cloud + correo/almacenamiento + dominios + soporte + ICA + costo de proyectos); **burn** = −EBITDA cuando es negativo; **runway** = caja / burn; **LTV** = margen bruto por org / churn; **payback** = CAC / margen bruto mensual por org.

---

## 4. Resultados (COP/mes; ver `FINANCIAL_MODEL.csv` para todas las columnas)

| Escenario   | Orgs | GMV     | Fee 4 % | Net revenue | MRR    | ARR    | Margen bruto | MB %  | EBITDA  | Burn   | Runway (m) | Rev/org | LTV    | LTV/CAC | Payback (m) |
| ----------- | ---- | ------- | ------- | ----------- | ------ | ------ | ------------ | ----- | ------- | ------ | ---------- | ------- | ------ | ------- | ----------- |
| CONSERVADOR | 10   | 3,0 M   | 120 k   | 150 k       | 150 k  | 1,8 M  | −105 k       | −70 % | −8,2 M  | 8,2 M  | 3,7        | 15 k    | <0     | <0      | ∞           |
| CONSERVADOR | 25   | 7,5 M   | 300 k   | 674 k       | 674 k  | 8,1 M  | 125 k        | 19 %  | −8,3 M  | 8,3 M  | 3,6        | 27 k    | 125 k  | 0,31    | 80          |
| CONSERVADOR | 50   | 15 M    | 600 k   | 1,35 M      | 1,35 M | 16,2 M | 410 k        | 31 %  | −9,9 M  | 9,9 M  | 3,0        | 27 k    | 205 k  | 0,51    | 49          |
| CONSERVADOR | 100  | 30 M    | 1,2 M   | 2,7 M       | 2,7 M  | 32,3 M | 901 k        | 33 %  | −11,2 M | 11,2 M | 2,7        | 27 k    | 225 k  | 0,56    | 44          |
| CONSERVADOR | 300  | 90 M    | 3,6 M   | 8,1 M       | 8,1 M  | 97 M   | 3,0 M        | 37 %  | −16,3 M | 16,3 M | 1,8        | 27 k    | 250 k  | 0,63    | 40          |
| BASE        | 10   | 12,5 M  | 500 k   | 725 k       | 592 k  | 7,1 M  | 427 k        | 59 %  | −7,4 M  | 7,4 M  | 4,1        | 72 k    | 1,7 M  | 6,8     | 5,9         |
| BASE        | 25   | 31 M    | 1,25 M  | 2,4 M       | 2,1 M  | 24,9 M | 1,75 M       | 73 %  | −6,2 M  | 6,2 M  | 4,8        | 96 k    | 2,8 M  | 11,2    | 3,6         |
| BASE        | 50   | 62,5 M  | 2,5 M   | 5,4 M       | 4,8 M  | 57,1 M | 4,3 M        | 79 %  | −5,2 M  | 5,2 M  | 5,8        | 108 k   | 3,4 M  | 13,6    | 2,9         |
| BASE        | 100  | 125 M   | 5,0 M   | 10,8 M      | 9,5 M  | 114 M  | 8,6 M        | 79 %  | −1,8 M  | 1,8 M  | 16,9       | 108 k   | 3,4 M  | 13,8    | 2,9         |
| BASE        | 300  | 375 M   | 15 M    | 33,7 M      | 29,7 M | 357 M  | 27,3 M       | 81 %  | +13,2 M | 0      | ∞          | 112 k   | 3,6 M  | 14,6    | 2,7         |
| AGRESIVO    | 10   | 32,5 M  | 1,3 M   | 2,9 M       | 2,5 M  | 29,6 M | 2,4 M        | 85 %  | −5,2 M  | 5,2 M  | 5,7        | 287 k   | 16,2 M | 108     | 0,6         |
| AGRESIVO    | 25   | 81 M    | 3,25 M  | 6,7 M       | 5,7 M  | 68 M   | 5,7 M        | 85 %  | −2,1 M  | 2,1 M  | 14,6       | 267 k   | 15,2 M | 101     | 0,7         |
| AGRESIVO    | 50   | 162,5 M | 6,5 M   | 14,3 M      | 12,3 M | 148 M  | 12,5 M       | 87 %  | +3,5 M  | 0      | ∞          | 287 k   | 16,7 M | 111     | 0,6         |
| AGRESIVO    | 100  | 325 M   | 13 M    | 28,7 M      | 24,7 M | 296 M  | 25,1 M       | 88 %  | +15,6 M | 0      | ∞          | 287 k   | 16,7 M | 112     | 0,6         |
| AGRESIVO    | 300  | 975 M   | 39 M    | 86 M        | 74 M   | 889 M  | 75,6 M       | 88 %  | +64,2 M | 0      | ∞          | 287 k   | 16,8 M | 112     | 0,6         |

**Break-even (número de organizaciones):**

| Escenario   | Con todas las fuentes, con fundador | …sin fundador | Solo comisión 4 %, con fundador | …sin fundador |
| ----------- | ----------------------------------- | ------------- | ------------------------------- | ------------- |
| CONSERVADOR | > 5.000 (no cierra)                 | > 5.000       | > 5.000                         | > 5.000       |
| BASE        | **123**                             | 30            | **496**                         | 159           |
| AGRESIVO    | **33**                              | 10            | **81**                          | 16            |

### Lectura honesta

- El revenue por org del AGRESIVO (≈ 287 k/mes) y su LTV/CAC > 100 están **dominados por el B2B prorrateado** (1 patrocinio de 1 M por cada 10 orgs) y por un CAC muy bajo: son **hipótesis optimistas**, no un plan. El CSV permite repetir el cálculo solo con comisión.
- La variable más sensible es **GMV por org que recauda × % que recauda**: hoy no hay un solo dato real. Antes de invertir en más funcionalidades, medir en el piloto (sin dinero) cuántas orgs **harían** campañas y con qué ticket.
- En CONSERVADOR el margen bruto unitario no cubre el soporte por org (MB negativo a 10 orgs): el soporte humano por org es el costo que hay que automatizar (onboarding asistido F20, asistente F29).
- Ningún escenario financia al fundador en los primeros 10–25 orgs: **runway de 3–6 meses** con 30 M de caja (SUPUESTO). Necesidad de capital puente o ingresos B2B tempranos.

---

## 5. Hallazgos FinOps

### FIN-001 · El cálculo de fees usa tarifas de otro PSP (Wompi) — **P1** — ver PAY-005 (`packages/contracts/src/payments.ts:303-311`). Bloquea pagos.

### FIN-002 · Revenue mezclado con IVA en el dashboard de plataforma — **P2** — `packages/contracts/src/dashboards.ts:118-145`; `apps/api/src/modules/dashboards/platform-super-admin-dashboard.service.ts:99`. Remediación: separar `platformFee` (revenue) de `platformFeeVat` (pasivo); nunca presentar GMV ni IVA como ingreso. Bloquea pagos (reporting).

### FIN-003 · Sin modelo de ingresos no transaccionales en el producto (planes, B2B, dominios) — **P2** — ver PAY-013. El modelo muestra que sin ellos el BASE necesita ~500 orgs para pagar al fundador. Bloquea escala/negocio, no piloto.

### FIN-004 · Custodia añade GMF 4×1000 y costos de tesorería/conciliación — **P1** (financiero) — consecuencia de PAY-001; eliminarlos con split real.

### FIN-005 · Despliegue documentado en Render (B) cuesta 3–5× la opción A decidida (D11) y arrastra el bloqueo RLS S1-01 — **P2** — `render.yaml`, `DEPLOY.md` §2. Remediación: compose del VPS con backups off-site y restore probado (zona a/ops).

### FIN-006 · Backups "gratis" de Hostinger no son off-site — **P1** (operación) — fuente §2.1. Remediación: B2 (o equivalente) cifrado + restore mensual probado. Bloquea piloto (AF-020/C8).

---

## 6. Preguntas para el dueño / contador

1. **Dueño:** precio y contenido de planes mensuales (o confirmar que el producto es gratis y los planes son premium opcionales), precio del dominio propio, precio del fee de gestión B2B, caja disponible y si el fundador cobra sueldo desde el día 1.
2. **Dueño:** metas del piloto para medir % de orgs que recaudan y GMV por org (las dos variables que deciden la viabilidad).
3. **Contador:** régimen tributario de AdoptaFácil (IVA, ICA por municipio, retenciones que aplicará el PSP sobre la comisión), facturación electrónica de la comisión a cada org, tratamiento del IVA cuando el donante cubre la comisión.
4. **MP:** tarifa efectiva para Split 1:1/Checkout API en la cuenta del cliente y si cobra algo sobre `application_fee`.
