# Auditoría Fase 0 · AdoptaFácil

Auditoría forense de la entrega final del equipo, sobre la línea base `48cabad` (`main`, 2026-10-07), hecha en solo lectura según el PROMPT_MAESTRO (§6) y TANJIRO §2–§38.

**Empieza por [`01_EXECUTIVE_VERDICT.md`](./01_EXECUTIVE_VERDICT.md).**

| Informe                                                           | Contenido                                                                                             |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| [00 Línea base y build](./00_BASELINE_Y_BUILD.md)                 | AUDIT_BASELINE, build reproducible, CI, escaneos                                                      |
| [01 Veredicto ejecutivo](./01_EXECUTIVE_VERDICT.md)               | GO / NO-GO, puntuación, P0, condiciones, preguntas A–M y §35                                          |
| [02 Trazabilidad](./02_REQUIREMENTS_TRACEABILITY.md)              | 91 requisitos de los documentos del repo ([CSV](./TRACEABILITY_MATRIX.csv))                           |
| [03 Arquitectura](./03_ARCHITECTURE_AUDIT.md)                     | Lo que está bien, defectos estructurales, objetivo, módulos M01–M15                                   |
| [04 Seguridad](./04_SECURITY_AUDIT.md)                            | Aislamiento A vs B, AF-001…037 re-verificados, SEC-001…023, data map ([CSV](./SECURITY_FINDINGS.csv)) |
| [05 Privacidad y legal](./05_PRIVACY_LEGAL_READINESS.md)          | Ley 1581, contrato, certificados, menores, DIAN (LEG-001…018)                                         |
| [06 UX y procesos](./06_UX_PROCESS_AUDIT.md)                      | Recorridos por rol con capturas de escritorio y móvil                                                 |
| [07 Despliegue y operación](./07_DEPLOYMENT_AND_OPS.md)           | Render actual vs VPS decidido, backups, monitoreo (OPS-001…007)                                       |
| [08 FinOps](./08_FINOPS_AND_UNIT_ECONOMICS.md)                    | GMV ≠ revenue, escenarios, costos ([CSV](./FINANCIAL_MODEL.csv))                                      |
| [08b Pagos](./08b_PAYMENTS_AUDIT.md)                              | Flujo E, custodia, webhooks, comparativa de PSP (PAY-001…013)                                         |
| [09 Alcance MVP 1.0](./09_MVP_1_0_SCOPE.md)                       | KEEP / SIMPLIFY / FLAG / DEFER por módulo; estado F1–F34                                              |
| [10 Checklist y LAUNCH BLOCKER MATRIX](./10_RELEASE_CHECKLIST.md) | Qué bloquea piloto, pagos, lanzamiento y escala                                                       |
| [11 Plan de remediación](./11_REMEDIATION_PLAN.md)                | Fases 0–4 y propuesta de hilos de la Ola 1                                                            |
| [12 Runbook de entrega](./12_HANDOVER_RUNBOOK.md)                 | Cómo levantar, verificar y reproducir; qué falta para operar                                          |

Inventarios: [dependencias](./DEPENDENCY_INVENTORY.csv), [licencias](./LICENSE_INVENTORY.csv).

`evidencia/` guarda los logs, escaneos, scripts reproducibles y capturas (WebP). Los tokens de sesión de las pruebas se redactaron; ninguna prueba se ejecutó contra producción ni contra servicios externos.

Etiquetas de evidencia: `[VERIFICADO]` leído en código · `[VERIFICADO EJECUTANDO]` reproducido contra una instancia local · `[PARCIAL]` · `[NO IMPLEMENTADO]` · `[ROTO]` · `[INSEGURO]` · `[UNVERIFIABLE]` · `[ROADMAP]` · `[NO APLICA]`.
