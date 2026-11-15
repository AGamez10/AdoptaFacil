# Referencias de auditoría incluidas

## En el repositorio

| Ruta                                     | Qué es                                                                                                                | Fecha y base                             | Notas                                                                                                                               |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `docs/auditoria/`                        | Fase 0: veredicto ejecutivo, seguridad, privacidad y legal, arquitectura, pagos, FinOps, plan de remediación, runbook | Baseline `48cabad`, 7 de octubre de 2026 | Veredicto de la fase: producción NO-GO. Piloto sin dinero GO con condiciones C1–C10. Puede estar desactualizado frente a `0b530f8`. |
| `docs/auditoria/SECURITY_FINDINGS.csv`   | Hallazgos de seguridad                                                                                                | Fase 0                                   |                                                                                                                                     |
| `docs/auditoria/TRACEABILITY_MATRIX.csv` | Matriz de trazabilidad de requisitos                                                                                  | Fase 0                                   |                                                                                                                                     |
| `docs/auditoria/evidencia/`              | Evidencia: baseline, pruebas de seguridad (BOLA, RBAC, RLS), capturas de producto                                     | Fase 0                                   | La fase 0 indica que los tokens debían ir redactados; no se re-verificó archivo por archivo.                                        |

## Añadido en la carpeta `AUDITORIA/`

| Ruta                                                           | Qué es                                                                         | Fecha                  | Notas                                                                                    |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------ | ---------------------- | ---------------------------------------------------------------------------------------- |
| `AUDITORIA/referencias/auditoria-logica-negocio-2026-11-06.md` | Auditoría de la lógica de negocio: P0, P1, P2, PR abiertos y orden recomendado | 6 de noviembre de 2026 | Anterior a esta rama. Sus P0 y PR abiertos hay que verificarlos contra el código actual. |

## No incluido

- **PROMPT_MAESTRO**: no encontrado en el repositorio ni en los archivos del proyecto disponibles.
- **ANEXO_HALLAZGOS_Y_DECISIONES**: no encontrado en el repositorio ni en los archivos del proyecto disponibles.

Ambos se incluirán si el equipo los entrega, siempre que no tengan secretos ni datos personales.

## Datos personales detectados (no modificados)

- `docs/auditoria/evidencia/baseline/09_gitleaks_history.json`: contiene correos de autores de
  commits. Es evidencia del escaneo y se dejó tal cual para no alterar la evidencia.
- `docs/auditoria/05_PRIVACY_LEGAL_READINESS.md` y `06_UX_PROCESS_AUDIT.md`: contienen el correo
  y el WhatsApp de contacto de la organización (datos de negocio, no personales).
- Los metadatos de autor de los commits del historial no se pueden cambiar sin reescribir el
  historial. Es una decisión del equipo, no de esta entrega.

## Archivos generados que no deben versionarse

Se quitaron del índice cuatro archivos `__pycache__/*.pyc` que estaban versionados por error en
`docs/auditoria/evidencia/seguridad/scripts/`. `.gitignore` ahora excluye `__pycache__/` y `*.pyc`.
