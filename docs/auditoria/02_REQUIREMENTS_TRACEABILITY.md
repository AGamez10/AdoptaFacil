# 02 · Trazabilidad de requisitos

Línea base: commit `48cabad`. Matriz completa: `TRACEABILITY_MATRIX.csv` (91 filas, 18 columnas).
Convención de evidencia: [VERIFICADO] = leído en código · [VERIFICADO EJECUTANDO] = reproducido contra API local (BD `adoptafacil_ux`, API :3200, web :5273) · [PARCIAL] · [NO IMPLEMENTADO] · [ROTO] · [UNVERIFIABLE] · [ROADMAP].

## 1. Fuentes y correspondencia de IDs

| Fuente                                              | IDs                                           | Alcance                                                    | Prefijo en matriz   |
| --------------------------------------------------- | --------------------------------------------- | ---------------------------------------------------------- | ------------------- |
| `docs/AdoptaFácil MVP.pdf`                          | RF-01..RF-35, RNF-01..RNF-10                  | Solo Módulo 1 (organizaciones, formalización, firma, DIAN) | `MVP-`              |
| `docs/AdoptaFacil-Levantamiento-de-Informacion.pdf` | RF-01..RF-34, RNF-01..RNF-12 (módulos M1–M10) | Plataforma completa                                        | `LEV-`              |
| `Contrato de Adopción.pdf`                          | Plantilla                                     | Contrato M04                                               | citado en LEV-RF-15 |

El anexo de TANJIRO habla de "RF01–RF28 / RNF01–RNF12": coincide con el Levantamiento en los RNF, pero el Levantamiento vigente tiene **34** RF (RF-29..RF-34 son portales y suscripción). Los IDs del MVP.pdf **chocan** con los del Levantamiento (RF-05 significa cosas distintas). Por eso se usan prefijos. Recomendación: congelar el catálogo con estos prefijos.

**Contradicción documental:** la plantilla del cliente nombra como cedente a "Adopta Fácil (organización protectora de animales)". Eso choca con D8/D9 (AdoptaFácil es intermediario tecnológico y la organización es la parte). El código copió la plantilla literalmente (`apps/api/src/modules/adoptions/adoption-contract-pdf.ts:394,467`). Debe decidirlo el cliente con su abogado. Hasta entonces, el contrato no está apto.

## 2. Resultado agregado

| Estado (PASS / DONE) | MVP.pdf (45) | Levantamiento (46) | Total (91) | %    |
| -------------------- | ------------ | ------------------ | ---------- | ---- |
| PASS / DONE          | 8            | 13                 | 21         | 23 % |
| PARTIAL              | 16           | 23                 | 39         | 43 % |
| FAIL / BROKEN        | 6            | 8                  | 14         | 15 % |
| MISSING              | 13           | 0                  | 13         | 14 % |
| UNVERIFIABLE         | 1            | 1                  | 2          | 2 %  |
| ROADMAP              | 1            | 1                  | 2          | 2 %  |

Lectura: el **Módulo 1 (MVP.pdf) es el más débil**. Solo el 18 % está en PASS y el 42 % está en FAIL o MISSING. Falta toda la dimensión de estado operativo (Borrador, Pendiente, Observado, Aprobado, Rechazado, Suspendido), que es la base del RF-01, 02, 07, 10, 14, 17, 21, 23, 33 y 34. El Levantamiento sale mejor porque muchas funciones de experiencia existen, aunque con huecos.

## 3. Requisitos FAIL de mayor impacto (todos [VERIFICADO EJECUTANDO] salvo indicación)

| ID                                | Requisito                                      | Defecto                                                                                                     | Evidencia                                                                                                                                           |
| --------------------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| MVP-RF-05 / LEV-RF-05             | La formalidad requiere revisión administrativa | El Owner avanza solo de informal a en_proceso, formalizada y esal, sin documentos                           | `evidencia/producto/flowA.log`; `formalization.controller.ts:41-50`; `formalization.machine.ts:43-48` (TRANSITION_REQUIREMENTS vacío, TODO(client)) |
| MVP-RF-07                         | Dos dimensiones de estado                      | No existe el estado operativo                                                                               | grep en `prisma/schema/*.prisma`                                                                                                                    |
| MVP-RF-27 / LEV-RF-07 / LEV-RF-23 | Certificados solo para orgs formales con DIAN  | La DIAN es falsa y siempre verifica, y es el único driver                                                   | `fake-dian.adapter.ts:21-34`; `org.module.ts:70-87`; `certificate-verification-page.tsx:81-85`                                                      |
| MVP-RF-24                         | Firmantes reales                               | El adoptante del contrato sale del snapshot que manda el cliente y el firmante de la org es genérico        | `evidencia/producto/flowC.log` (pasos 2b, 2d); `adoptions.schemas.ts:9-40`                                                                          |
| LEV-RF-15                         | Contrato                                       | Nombra a AdoptaFácil como cedente; un emoji en los datos deja el PDF del contrato firmado en 500 permanente | `evidencia/producto/api_ux.log` ("WinAnsi cannot encode 0x1f436"); `adoption-contract-pdf.ts:394`                                                   |
| LEV-RF-29                         | Portal al aprobarse la org                     | El portal se publica sin aprobación y con el badge "✓ ESAL"                                                 | `evidencia/producto/capturas/visitante__portal-org-fantasma__desk.webp`                                                                             |
| MVP-RF-28                         | Reporte con la firma del rep. legal            | Sin imagen de firma ni PDF; la cabecera dice "AdoptaFácil"                                                  | `certificate-document.tsx:29-31,63-66`                                                                                                              |
| LEV-RNF-09                        | Ley 1581, T&C y políticas                      | Inexistentes                                                                                                | grep `consent                                                                                                                                       | privacidad | terminos` = 0; footer sin enlaces |
| LEV-RNF-08                        | Responsive y accesibilidad                     | Desborde horizontal a 390 px; sin modo oscuro; el login no es un `<form>`                                   | `evidencia/producto/capturas/report.json`                                                                                                           |
| LEV-RF-11                         | Favoritos                                      | Maqueta en estado local                                                                                     | `animal-card.tsx:59-76`                                                                                                                             |

## 4. Verificación de hipótesis del ANEXO (zona producto)

| Hallazgo del anexo                 | Estado a 48cabad                                                                                             | Evidencia                                                                   |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| AF-003 formalización autodeclarada | **Persiste con otra forma**: ahora hay revisión de documentos, pero está desacoplada del estado              | flowA.log                                                                   |
| AF-005 custodia de fondos          | **Persiste**: recaudo consolidado con el token de la plataforma, T+1 manual y `createPayout` no implementado | `mercadopago-payment.adapter.ts:150-175,255-300`                            |
| AF-006 sin Ley 1581                | Persiste                                                                                                     | ver LEV-RNF-09                                                              |
| AF-007 / AF-008 RBAC               | Persiste                                                                                                     | `rbac.controller.ts:37-46`; `rbac.service.ts:74-76`                         |
| AF-017 sin invitaciones            | Persiste: los roles distintos de Owner no se pueden usar en la práctica                                      | no hay endpoint `/invitations` (endpoints.tsv)                              |
| AF-021 menores en voluntariado     | Persiste: `isMinor` es autodeclarado y el acudiente es opcional                                              | `volunteer-enrollments.schemas.ts:15`                                       |
| AF-022 tarifa tipo Wompi           | Persiste                                                                                                     | flowDE.log E1 (2,65 % + 700)                                                |
| AF-023 sin suspensión              | Persiste                                                                                                     | endpoints.tsv                                                               |
| AF-024 snapshot del cliente        | Persiste y se agravó: se acepta un animal inexistente y se envían correos a terceros                         | flowC.log; `evidencia/producto/api_ux.log`                                  |
| AF-029 botón "Google (prueba)"     | Persiste; en producción la identidad es fake por defecto                                                     | `identity.module.ts:27-31`; `render.yaml` (sin AUTH_IDENTITY_DRIVER)        |
| AF-031 bundle                      | Persiste: 1.703 kB                                                                                           | `00_BASELINE_Y_BUILD.md` (build)                                            |
| AF-036 sin verificación de correo  | Persiste                                                                                                     | grep                                                                        |
| AF-037 credenciales por defecto    | Persiste: `admin@adoptafacil.local / changeme123`                                                            | `apps/api/scripts/seed-platform-admin.ts:58-61`                             |
| AF-019 .env de ejemplo no arranca  | **Reproducido**                                                                                              | SMTP__/MERCADOPAGO__ `min(1).optional()` con valor vacío                    |
| NUEVO                              | Roles legales contador y revisor fiscal: se guardan pero nunca se imprimen                                   | `legal-representative.schemas.ts:21`; `legal-representative.service.ts:190` |
| NUEVO                              | La cola BullMQ ignora el índice de BD de Redis y otro entorno consume los jobs                               | `queue.module.ts:19`; job huérfano `bull:dian-verification:1` en db0        |
| NUEVO                              | El admin aprueba un documento cuyos bytes nunca se subieron                                                  | flowA.log, pasos 9–11                                                       |
| NUEVO                              | Producción en `render.yaml` con PAYMENT_DRIVER=fake y NOTIFICATION_DRIVER=log                                | `render.yaml:98-99,110-111`                                                 |

## 5. Huecos de la matriz (qué falta para "DONE")

- No hay E2E web en el repo. La columna E2E solo refleja mis ejecuciones manuales y por API.
- No ejecuté la suite de integración (92 archivos, 35 rls-no-leak); queda en manos del auditor de seguridad. Por eso los requisitos de aislamiento están en PARTIAL o UNVERIFIABLE, no en PASS.
- Unitarios ejecutados: API 551, web 748, ui 39 y contracts 34, todos en verde.
