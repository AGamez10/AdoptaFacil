# 05 · Privacidad y preparación legal (Colombia)

> Repo `/home/claude/AdoptaFacil`, línea base **48cabad**, auditado en solo lectura el 2026-10-07.
> **No es asesoría jurídica.** Cada punto se clasifica como **LEGALMENTE REQUERIDO / BUENA PRÁCTICA / RECOMENDADO / POR CONFIRMAR CON ABOGADO** (o CONTADOR). Normas citadas con fuente primaria cuando se pudo abrir; lo que el entorno no pudo abrir queda **PENDIENTE DE VERIFICAR** con su URL.
> Complementa `PAGOS_borrador.md` (dinero) y el informe de seguridad (zona b).

---

## 0. Resumen ejecutivo (5 líneas)

1. **No existe** política de tratamiento de datos, aviso de privacidad, T&C ni captura de autorización en ninguna parte del producto (API, web, BD): AF-006 sigue **P0** y bloquea el piloto, contra la propia RNF-09 del levantamiento ("políticas de privacidad y términos y condiciones disponibles desde el lanzamiento").
2. El **contrato de adopción** pone a **"Adopta Fácil (organización protectora de animales)"** como parte cedente con el NIT de la organización real: error de partes que expone a AdoptaFácil (D8) y debilita el contrato; además le faltan cláusula de datos, identificación del animal, mecanismo de firma descrito y la marca "borrador sujeto a abogado". Sus citas normativas (Ley 84/1989, Ley 1774/2016, **Ley 2455 de 2025 "Ley Ángel"**) son reales; la Ley 2455 se verificó en fuente oficial.
3. **Certificados de donación**: una organización puede autodeclararse ESAL con RTE (avance libre de estados + "DIAN" fake que siempre verifica) y el sistema emite automáticamente certificados con encabezado "AdoptaFácil", sello "ESAL · RTE vigente" y verificación pública "**Auténtico**" — AF-003 vigente (P0).
4. **Menores**: el voluntariado acepta `isMinor` autodeclarado, sin control de edad, sin consentimiento del representante y sin flag de apagado; la constancia afirma "con la debida autorización de su acudiente" sin evidencia — AF-021 vigente (P1, fuera de producción).
5. **DIAN**: el repo **no inventa una API** (lo declara honestamente: "DIAN: SIN API"), pero usa un adaptador fake que **siempre aprueba** como compuerta real de RTE. No hay mandato electrónico (D16/F21) ni registro de consentimiento; los datos viven en EE. UU. (Render `oregon`) sin aviso de transferencia internacional.

---

## 1. Marco normativo consultado (fuentes primarias)

| Norma                                                                                           | Qué se usó                                                                                                                                                                                                                                                                                                                                                                                                                                          | Fuente                                                                                                                                                                                                                                                                                                                                           | Estado de verificación                                                                                                                                                              |
| ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ley 1581 de 2012                                                                                | Art. 3 (Responsable/Encargado), 5 (sensibles), 7 (NNA), 8 (derechos), 9 (autorización previa e informada), 12 (deber de informar), 17 (conservar copia de la autorización), 18 (encargado), 25 (RNBD), 26 (transferencias)                                                                                                                                                                                                                          | http://www.secretariasenado.gov.co/senado/basedoc/ley_1581_2012.html (abierta 2026-10-07)                                                                                                                                                                                                                                                        | VERIFICADO                                                                                                                                                                          |
| Decreto 1074 de 2015 (Cap. 25, compila Decreto 1377 de 2013)                                    | Art. 2.2.2.25.2.9 (NNA: interés superior, derechos fundamentales, autorización del representante legal considerando la opinión del menor)                                                                                                                                                                                                                                                                                                           | Concepto SIC: https://sedeelectronica.sic.gov.co/sites/default/files/normatividad/022019/Rad18_18267888PDG.PDF (abierto). Texto del decreto en SUIN/Función Pública **bloqueado por robots** (https://www.suin-juriscol.gov.co/viewDocument.asp?ruta=Decretos/1276081 , https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=53646) | Art. 2.2.2.25.2.9 VERIFICADO vía SIC; resto (políticas 2.2.2.25.3.1, aviso 2.2.2.25.3.2-3, prueba de autorización, contrato de transmisión 2.2.2.25.5.2) **PENDIENTE DE VERIFICAR** |
| Sentencia C-748 de 2011                                                                         | No hay prohibición absoluta de tratar datos de NNA                                                                                                                                                                                                                                                                                                                                                                                                  | Citada por la SIC en el concepto anterior                                                                                                                                                                                                                                                                                                        | VERIFICADO (indirecto)                                                                                                                                                              |
| Ley 527 de 1999                                                                                 | Art. 7 (firma: método que identifique al iniciador e indique aprobación, confiable y apropiado), art. 28 (firma digital)                                                                                                                                                                                                                                                                                                                            | http://www.secretariasenado.gov.co/senado/basedoc/ley_0527_1999.html (abierta)                                                                                                                                                                                                                                                                   | VERIFICADO. Decreto 2364 de 2012 (firma electrónica) **PENDIENTE DE VERIFICAR**                                                                                                     |
| Ley 2455 de 2025 "Ley Ángel"                                                                    | Título: "por la cual se fortalece la lucha contra el maltrato animal y se actualiza el Estatuto Nacional de Protección de los Animales Ley 84 de 1989 - Ley Ángel" (18-abr-2025); modifica C.P. 339A, 339B, 339C; art. 3–4: prohibición de "adquisición, tenencia, cuidado y refugio de animales… a través de cualquier título como compra, donación, permuta, **adopción**…", que "aplicará por el doble del tiempo de la pena principal impuesta" | Rama Judicial (SIDN): https://sidn.ramajudicial.gov.co/SIDN//NORMATIVA/TEXTOS_COMPLETOS/7_LEYES/LEYES%202025/Ley%202455%20de%202025.pdf (abierta)                                                                                                                                                                                                | **VERIFICADO**: existe y dice lo que el contrato afirma                                                                                                                             |
| Ley 84 de 1989                                                                                  | Art. 1 y art. 5 citados por el contrato                                                                                                                                                                                                                                                                                                                                                                                                             | http://www.secretariasenado.gov.co/senado/basedoc/ley_0084_1989.html                                                                                                                                                                                                                                                                             | **PENDIENTE DE VERIFICAR** (robots) — revisar además qué artículos modificó la Ley 2455                                                                                             |
| Ley 1774 de 2016                                                                                | Animales como seres sintientes; C.P. 339A/339B                                                                                                                                                                                                                                                                                                                                                                                                      | http://www.secretariasenado.gov.co/senado/basedoc/ley_1774_2016.html                                                                                                                                                                                                                                                                             | **PENDIENTE DE VERIFICAR** (robots)                                                                                                                                                 |
| Ley 1480 de 2011 (Estatuto del Consumidor) y comercio electrónico                               | Información veraz en el desglose de comisiones; marketplace                                                                                                                                                                                                                                                                                                                                                                                         | http://www.secretariasenado.gov.co/senado/basedoc/ley_1480_2011.html                                                                                                                                                                                                                                                                             | PENDIENTE DE VERIFICAR                                                                                                                                                              |
| Estatuto Tributario arts. 125-2, 257; DUR 1625 de 2016 (requisitos del certificado de donación) | Contenido mínimo del certificado, firma de representante legal/contador/revisor fiscal                                                                                                                                                                                                                                                                                                                                                              | https://normograma.dian.gov.co (no consultado; solo fuentes secundarias encontradas)                                                                                                                                                                                                                                                             | **POR CONFIRMAR CON CONTADOR**                                                                                                                                                      |
| Resolución 4210 de 1996 (MEN), servicio social estudiantil                                      | El repo imprime "Válido para servicio social estudiantil (Resolución 4210 de 1996, artículo 6°)"                                                                                                                                                                                                                                                                                                                                                    | https://www.mineducacion.gov.co                                                                                                                                                                                                                                                                                                                  | PENDIENTE DE VERIFICAR                                                                                                                                                              |
| DIAN — consultas públicas                                                                       | Página de consulta individual de actualización de RUT (NIT/cédula, interfaz web, **sin API ni servicio para terceros** mencionado)                                                                                                                                                                                                                                                                                                                  | https://www.dian.gov.co/tramitesservicios/Paginas/conanimodelucroasinanimodelucro.aspx (abierta)                                                                                                                                                                                                                                                 | VERIFICADO que no se ofrece API en esa página; existencia de otro servicio oficial **no encontrada**                                                                                |

---

## 2. Hallazgos legales y de privacidad

Formato: ID · título · severidad · clasificación · evidencia · impacto · remediación · bloquea (piloto / pagos / lanzamiento / escala).

### LEG-001 · No hay política de tratamiento, aviso de privacidad, T&C ni autorización capturada (AF-006) — **P0** · LEGALMENTE REQUERIDO

- **Evidencia:** búsqueda de `consent|habeas|privacidad|términos|privacy` en `apps/api/src`, `apps/web/src`, `prisma/schema` solo devuelve comentarios "Ley 1581" (p. ej. `prisma/schema/donations.prisma:50`, `packages/contracts/src/adoptions.ts:42`); no hay rutas legales en `apps/web/src/shell/router/routes.tsx:159-625`; los formularios `apps/web/src/features/auth/pages/register-person-form.tsx`/`register-organization-form.tsx` no tienen casilla de autorización; ninguna tabla de consentimientos. Requisito propio: levantamiento RNF-09 (`docs/AdoptaFacil-Levantamiento-de-Informacion.pdf`, "políticas de privacidad y términos y condiciones disponibles desde el lanzamiento").
- **Datos afectados (data map resumido):** usuarios (`users`: email, phone, `document_id`, address — `prisma/schema/org.prisma:193-201`), representantes legales (documento, firma manuscrita cifrada — `org.prisma:355`), solicitantes de adopción (contacto y respuestas — `prisma/schema/adoptions.prisma:27,103`), firmas de adoptantes, donantes e invitados (`donations.payer` JSONB con `fullName/email/documentId`, `prisma/schema/donations.prisma:50`), voluntarios incl. menores y acudientes, documentos de la org (RUT, cámara de comercio), cuentas bancarias y tokens MP.
- **Impacto:** tratamiento sin autorización previa, expresa e informada (Ley 1581 art. 9) ni prueba de ella (art. 17 lit. b); sin deber de información (art. 12); exposición a sanciones de la SIC (art. 23, monto **POR CONFIRMAR**).
- **Remediación (Ola 2, F22):** tabla `consent_records` append-only con RLS (usuario/titular, documento, versión, hash SHA-256 del texto, fecha UTC, IP/agente, canal, finalidades aceptadas); textos versionados e inmutables (nunca editar uno publicado); checkbox **no premarcado** y separado de T&C; "Mis autorizaciones" con revocación; consentimiento también en checkout invitado y en formularios de adopción/voluntariado; textos marcados "borrador sujeto a revisión de abogado".
- **Bloquea:** piloto ✅ · pagos ✅ · lanzamiento ✅.

### LEG-002 · Sin definición de Responsable vs Encargado ni contrato de transmisión con las organizaciones — **P1** · LEGALMENTE REQUERIDO (definición) / POR CONFIRMAR CON ABOGADO (reparto)

- **Evidencia:** no hay T&C ni acuerdo de tratamiento; cada org sube datos de terceros (adoptantes, voluntarios, veterinaria) a su tenant.
- **Propuesta para el abogado:** AdoptaFácil **responsable** de datos de cuentas de plataforma (registro, login, donantes invitados en lo que respecta a la plataforma) y **encargado** de los datos que cada organización trata en su tenant (adoptantes, expediente, voluntarios), con contrato de transmisión (Decreto 1074, art. 2.2.2.25.5.2 — PENDIENTE DE VERIFICAR) aceptado por la org al registrarse. La org responde por su base legal frente a sus titulares.
- **Bloquea:** piloto ✅ (al menos el texto borrador aceptado por las orgs piloto).

### LEG-003 · Derechos del titular no operables (consulta, rectificación, supresión, revocación) — **P1** · LEGALMENTE REQUERIDO

- **Evidencia:** solo `GET /auth/me` y `PATCH /auth/me/profile` (`apps/api/src/core/auth/auth.controller.ts:181,211`); no hay borrado/anonimización de cuenta, exportación, revocación ni canal de reclamos. AF-033 (orgs no eliminables por FK a auditoría) no se resolvió.
- **Remediación:** endpoints y procedimiento: consulta (≤10 días hábiles) y reclamo (≤15) — **plazos de Ley 1581 arts. 14-15, PENDIENTE DE VERIFICAR texto**; supresión = anonimización que respete la auditoría inmutable (sustituir PII por seudónimo, conservar hash); política de retención y purga (incluidos backups); canal oficial (D10: adoptafacil.oficial@gmail.com — RECOMENDADO dominio propio).
- **Bloquea:** lanzamiento ✅ · piloto ⚠️ (basta procedimiento manual documentado).

### LEG-004 · Certificado tributario emitible por una ESAL con RTE **autodeclarada** (AF-003) — **P0** · LEGALMENTE REQUERIDO (no inducir a error) / POR CONFIRMAR CON CONTADOR

- **Evidencia:** el Owner avanza estados solo, de a un paso, hasta `ESAL_RTE` (`apps/api/src/modules/org/formalization.controller.ts:42-49`, `@Roles(Role.Owner)`); requisitos documentales **vacíos** (`formalization.machine.ts:43-47`, `TODO(client)`); la única compuerta de RTE es `dianStatus` y la "verificación DIAN" usa `FakeDianAdapter`, que devuelve `verified: true` (`fake-dian.adapter.ts:26-34`, sin fallos por defecto) y es el **único** driver permitido (`org.module.ts:69-86`); `rteVigente = true` al llegar a `ESAL_RTE` (`formalization.machine.ts:134-136`); el certificado se emite **automáticamente** al aprobarse el pago si `esal_rte` (`donation-certificates.service.ts:29-30, 60-80`; `donations.service.ts:390-396`).
- **Impacto:** una "fundación fantasma" puede emitir certificados de donación con apariencia tributaria en minutos; riesgo de fraude fiscal de terceros con AdoptaFácil como facilitador; contradice D9 (solo ESAL con RTE **verificado por plataforma** y con concepto de contador).
- **Remediación:** (a) transiciones de formalización decididas **solo por PlatformAdmin** con documento aprobado (F16/C3); (b) `FakeDianAdapter` prohibido en producción — sustituir por "verificación manual por plataforma con evidencia" (carga del RUT/constancia RTE + revisor humano + registro de quién validó); (c) certificados tributarios **apagados por flag** hasta concepto de contador/abogado; (d) emisión **explícita** por la org (no automática).
- **Bloquea:** piloto ✅ (si el módulo está expuesto) · pagos ✅ · lanzamiento ✅.

### LEG-005 · Presentación del certificado: AdoptaFácil en el membrete, "Auténtico" y firmante no real (D8/D9) — **P1** · BUENA PRÁCTICA / POR CONFIRMAR CON CONTADOR

- **Evidencia:** `apps/web/src/features/certificates/components/certificate-document.tsx:29-31` (eyebrow "AdoptaFácil" como cabecera + badge "ESAL · RTE vigente"), `:40` ("Certifica que" sin sujeto explícito), `:70-72` ("Documento emitido electrónicamente por el representante legal" sin firma ni nombre — `TODO(S-1)`), `certificate-verification-page.tsx:80-86` ("Certificado válido", "**Auténtico**", "Evidencia de autenticidad emitida por una ESAL con RTE vigente").
- **Impacto:** el lector entiende que AdoptaFácil emite/garantiza; afirma autenticidad y RTE que la plataforma no verificó; contenido mínimo tributario no garantizado (forma de pago, destinación, firma de contador/revisor — POR CONFIRMAR CON CONTADOR).
- **Remediación:** emisor = la organización (razón social, NIT, logo, firmas por cargo: F12/F13); pie discreto "Generado vía AdoptaFácil"; página de verificación que distinga "documento generado y no alterado (hash coincide)" de "organización con RTE verificado por la plataforma el <fecha> con evidencia <id>" y nunca diga "Auténtico" a secas; estados del documento (generado/firmado/emitido/revocado).
- **Bloquea:** lanzamiento ✅ · pagos ✅.

### LEG-006 · Contrato de adopción: AdoptaFácil figura como parte cedente — **P0** · LEGALMENTE REQUERIDO (identificación correcta de las partes) / POR CONFIRMAR CON ABOGADO

- **Evidencia:** `apps/api/src/modules/adoptions/adoption-contract-pdf.ts:393-396` ("Cedente/Entregante: **Adopta Fácil (organización protectora de animales)**, con domicilio en … y NIT {NIT de la org}"), `:467` ("Por el Cedente (Adopta Fácil)"); mismo texto en la plantilla original `docs/Contrato de Adopción.pdf` (líneas "PARTES" y pie "Adopta Fácil — Documento Legal"). El nombre de la organización real **no aparece** como parte.
- **Impacto:** AdoptaFácil (empresa SaaS, D8) aparece asumiendo obligaciones de entregante y "organización protectora", con NIT ajeno: inconsistencia que puede invalidar o confundir la identificación de la parte y traslada responsabilidad a la plataforma.
- **Remediación:** parte cedente = razón social de la organización (o nombre del rescatista persona natural si D6 se habilita), tipo/número de identificación, domicilio, representante que firma y cargo; AdoptaFácil solo como "plataforma tecnológica que facilita la firma electrónica; no es parte" en una nota al pie.
- **Bloquea:** piloto ✅ (es MVP P0: adopción con contrato).

### LEG-007 · Contrato de adopción: contenido incompleto frente a F11 — **P1** · RECOMENDADO / POR CONFIRMAR CON ABOGADO

- **Evidencia:** texto en `adoption-contract-pdf.ts:20-145` y `docs/Contrato de Adopción.pdf`; payload declara `['Ley 527/1999', 'Ley 1581/2012']` (`packages/contracts/src/adoptions.ts:152`) pero el **cuerpo no contiene cláusula de datos ni de firma electrónica**. Faltan, en concreto:
  1. Identificación de la organización cedente (LEG-006) y tipo de documento del adoptante distinto de cédula (CE, pasaporte, PPT).
  2. Identificación del animal: microchip/código interno, señas, foto, estado de esterilización y vacunas con referencia al expediente entregado.
  3. Declaración del adoptante de **no estar inhabilitado** por condena de maltrato animal (Ley 2455/2025, arts. 3–4 — verificado) y de mayoría de edad.
  4. Esterilización (compromiso/plazo si no viene esterilizado), gastos y "cuota de recuperación" con valor y recibo si aplica.
  5. Seguimiento: canal, frecuencia, consentimiento para visitas y fotos (con base en Ley 1581), y plazo (hoy `followUpMonths` editable, default 6).
  6. Causales de **revocación/restitución** con procedimiento (notificación, plazo, mecanismo de entrega), sin autotutela que implique ingreso al domicilio sin consentimiento; cláusula numerada 1–2 omitida en el PDF original (salta a "3.").
  7. Cláusula de **tratamiento de datos** (responsable = la organización, finalidades: evaluación, contrato, seguimiento; derechos; canal).
  8. Cláusula de **firma electrónica** (Ley 527 art. 7): método (firma manuscrita capturada + cuenta autenticada + correo + hash del documento + sello de tiempo UTC + IP), aceptación de ambas partes y entrega de copia a ambas por correo.
  9. Resolución de conflictos coherente (hoy "jueces civiles… renunciando a otro fuero" — revisar validez de la renuncia de fuero en contrato de adhesión).
  10. Marca visible "Borrador sujeto a revisión de abogado" hasta concepto.
- **Citas normativas:** Ley 84/1989 y Ley 1774/2016 (PENDIENTE DE VERIFICAR artículos citados); Ley 2455/2025 y C.P. 339A–339C (VERIFICADO: modificados por la Ley 2455).
- **Bloquea:** piloto ⚠️ (la marca de borrador + LEG-006 son mínimos) · lanzamiento ✅.

### LEG-008 · Menores en voluntariado sin control de edad, sin consentimiento del representante y sin flag (AF-021) — **P1** · LEGALMENTE REQUERIDO (Decreto 1074 art. 2.2.2.25.2.9)

- **Evidencia:** `apps/api/src/modules/volunteering/volunteer-enrollments.schemas.ts:5-17` (`isMinor` opcional y autodeclarado; datos del acudiente opcionales "even when `isMinor` is true"); `volunteer-enrollments.service.ts:174-195` (passthrough a `create_volunteer_enrollment`); el único control es `missingGuardianInfo` al emitir constancia de servicio social (`volunteer-certificate-eligibility.ts:75-85`); no hay fecha de nacimiento, verificación ni consentimiento firmado del representante; búsqueda de `MINORS|minors` sin flag. La constancia imprime "quien actuó con la debida autorización de su acudiente {nombre} (documento {doc})" (`volunteer-certificates.service.ts:619-621`) — **afirma una autorización nunca recabada**.
- **Impacto:** tratamiento de datos de NNA (nombre, colegio, horas, documento del acudiente) sin autorización del representante; riesgo de exposición de menores a terceros (organizaciones) sin controles; documento con declaración falsa.
- **Remediación:** apagar voluntariado de menores (flag de API, 404) en MVP; para encenderlo: fecha de nacimiento, flujo de autorización del representante legal con identificación y firma, registro en `consent_records`, acceso restringido a datos del menor, texto de la constancia condicionado a evidencia real.
- **Bloquea:** piloto ✅ si M08 está expuesto con menores · lanzamiento ✅.

### LEG-009 · "Verificación DIAN" fake usada como compuerta real; no hay servicio oficial público/API — **P1** · BUENA PRÁCTICA (no afirmar validaciones inexistentes)

- **Evidencia:** `apps/api/src/modules/org/dian.port.ts:1-13` (honesto: "DIAN: SIN API… no se inventa aquí"); pero `org.module.ts:69-86` solo admite `fake` y `fake-dian.adapter.ts:26-34` aprueba siempre; migración `prisma/migrations/20260823002540_s2_dian_verification`; `docs/AdoptaFácil MVP.pdf` §2.2 excluye validación externa con DIAN y §5.7 (RF-27…RF-30) describe estados "RECHAZADO POR DIAN" sobre un **mock**. Página `apps/web/src/features/org/pages/exogenous-report-page.tsx` promete "el formato exigido por la DIAN" (`ComingSoon`).
- **Hallazgo de fuente:** la DIAN ofrece consultas web individuales (p. ej. https://www.dian.gov.co/tramitesservicios/Paginas/conanimodelucroasinanimodelucro.aspx, por NIT, sin API para terceros mencionada). No se encontró servicio oficial de consulta programática del RUT.
- **Remediación (F17/F18):** reemplazar el fake por **verificación humana** con evidencia (RUT PDF/constancia RTE cargada, OCR que asiste, validación en 1 clic con quién/qué/cuándo); textos "Verificado por la plataforma el … con base en el documento …", nunca "verificado ante la DIAN"; quitar la promesa del reporte exógeno hasta concepto de contador.
- **Bloquea:** pagos ✅ · lanzamiento ✅.

### LEG-010 · Mandato electrónico de trámites inexistente (D16/F21) — **P2** · POR CONFIRMAR CON ABOGADO

- **Evidencia:** sin coincidencias de `mandato|mandate` en `apps/`/`packages/`.
- **Remediación:** solo arquitectura en MVP: checkbox separado no premarcado, texto versionado con hash, firma electrónica ya validada, registro append-only (quién, versión, cuándo, IP/agente), revocable, marcado "borrador sujeto a abogado".
- **Bloquea:** ninguno (es funcionalidad nueva).

### LEG-011 · Formalidad: capacidades formales sin verificación de plataforma (F16) — **P1** · BUENA PRÁCTICA

- **Evidencia:** igual que LEG-004 (`formalization.machine.ts:10-13, 43-47, 88-121`: "forward (i → i+1) freely"). El levantamiento exige "Generación de documentos que simulen validez formal para organizaciones no [formales]" fuera de alcance (`docs/AdoptaFácil MVP.pdf` §2.2.6).
- **Remediación:** las transiciones las decide un PlatformAdmin con documentos aprobados y vigentes; catálogo de documentos por nivel = `TODO(client)` con propuesta (Formalizada: certificado de existencia y representación; ESAL: RUT con responsabilidad de ESAL; ESAL_RTE: constancia de calificación/permanencia RTE) — **POR CONFIRMAR CON ABOGADO/CONTADOR**.
- **Bloquea:** pagos ✅ · lanzamiento ✅.

### LEG-012 · Transferencias internacionales y encargados sin declarar — **P1** · LEGALMENTE REQUERIDO (informar) / POR CONFIRMAR CON ABOGADO

- **Evidencia:** `render.yaml:24, 31, 39, 122` (`region: oregon` — EE. UU.) para BD, Redis, API y web; correo por SMTP de Gmail sugerido en `.env.example` (`SMTP_HOST=smtp.gmail.com`); identidad Google Sign-In (`AUTH_IDENTITY_DRIVER=google`); Mercado Pago (PSP). D11 cambia a VPS Hostinger — **ubicación del datacenter ⟦POR DEFINIR⟧** (Hostinger ofrece varias regiones; confirmar al contratar). MinIO en el mismo VPS.
- **Impacto:** Ley 1581 art. 26 condiciona la transferencia a países con nivel adecuado o excepciones; transmisión a encargados requiere contrato.
- **Remediación:** inventario de encargados (hosting, correo, PSP, identidad, backups off-site) con país y contrato/DPA; mención en política y aviso; evaluar región del VPS (EE. UU./Brasil/UE) y si se requiere declaración de conformidad ante la SIC — **POR CONFIRMAR CON ABOGADO**.
- **Bloquea:** lanzamiento ✅ · piloto ⚠️ (mencionar en el aviso).

### LEG-013 · Datos sensibles y financieros sin cifrado ni minimización — **P1** · LEGALMENTE REQUERIDO (seguridad, art. 17 lit. d) / BUENA PRÁCTICA

- **Evidencia:** tokens MP y cuentas bancarias en claro (ver PAY-006); `donations.payer.documentId` en JSONB plano (`donations.schemas.ts:16-22`) pedido en checkout aunque solo sirve para certificado tributario; documentos de acudientes de menores en claro. Las firmas manuscritas **sí** están cifradas AES-256-GCM (`apps/api/src/core/crypto/signature-crypto.ts:1-84`) — conservar.
- **Remediación:** cifrar en aplicación los campos financieros y de identificación; no pedir `documentId` salvo cuando se solicita certificado; retención definida.
- **Bloquea:** pagos ✅ · lanzamiento ✅.

### LEG-014 · Incidentes de seguridad: sin procedimiento — **P2** · LEGALMENTE REQUERIDO (reportar a la SIC — plazo y forma PENDIENTE DE VERIFICAR)

- **Evidencia:** no hay runbook de incidentes en `docs/`; `DEPLOY.md` documenta workarounds de RLS (`NO FORCE`, `DATABASE_URL_APP=DATABASE_URL`, `DEPLOY.md` §2 "Hallazgo S1-01") que, en producción, aumentan la probabilidad de un incidente reportable.
- **Remediación:** runbook (detección, contención, evaluación, notificación SIC y titulares, registro), responsable designado.
- **Bloquea:** lanzamiento ✅.

### LEG-015 · RNBD (Registro Nacional de Bases de Datos) — **P3** · POR CONFIRMAR CON ABOGADO

- **Evidencia:** Ley 1581 art. 25 (verificado). La obligatoriedad depende de umbrales de activos fijados por decreto (**PENDIENTE DE VERIFICAR**; https://www.sic.gov.co/registro-nacional-de-bases-de-datos).
- **Remediación:** confirmar si AdoptaFácil (y cada ESAL) está obligada; si sí, inscribir bases.

### LEG-016 · Marketplace: sin transacciones internas (bien), pero sin T&C de publicación — **P3** · RECOMENDADO

- **Evidencia:** productos con precio y contacto por `wa.me` (`apps/web/src/features/marketplace/model/marketplace-view.ts:53-56`); sin pago en plataforma (no hay `payment` en `apps/api/src/modules/marketplace`).
- **Remediación:** T&C: la org es el vendedor; AdoptaFácil no intermedia ni garantiza (Ley 1480 — POR CONFIRMAR CON ABOGADO si aplica como portal de contacto); mantener detrás de flag (F26).

### LEG-017 · Desglose de comisiones con tarifas de otro PSP (Wompi) — **P1** · POR CONFIRMAR CON ABOGADO (información al consumidor/donante)

- Ver PAY-005 (`packages/contracts/src/payments.ts:303-311`).

### LEG-018 · Correo oficial y contacto (D10) — **P3** · RECOMENDADO

- **Evidencia:** no aparecen `3028528926` ni `adoptafacil.oficial@gmail.com` en el producto (búsqueda sin coincidencias); D10 los fija.
- **Remediación:** publicarlos en la política (canal de habeas data) y en el onboarding (F20); recomendado migrar a buzón en dominio propio para reclamos.

---

## 3. Certificados: tabla de distinciones exigidas (TANJIRO §17) vs. estado

| Distinción                              | ¿Existe en el modelo?                                     | Evidencia                                    |
| --------------------------------------- | --------------------------------------------------------- | -------------------------------------------- |
| Organización en RTE (declarado)         | Sí, como `formalizationState='esal_rte'` + `rteVigente`   | `formalization.machine.ts:134-136`           |
| RTE **verificado por plataforma**       | **No** (lo "verifica" un fake)                            | `fake-dian.adapter.ts:26-34`                 |
| Documento generado                      | Sí (código + hash SHA-256)                                | `donation-certificate-hash.ts`               |
| Documento firmado                       | **No** (placeholder)                                      | `certificate-document.tsx:70-72`             |
| Emitido por la ESAL                     | Parcial (nombre/NIT de la org, pero membrete AdoptaFácil) | `certificate-document.tsx:29-36`             |
| Estado del documento (vigente/revocado) | **No**                                                    | —                                            |
| Constancias de voluntariado             | Emisor = organización con firmante y cargo (bien, D9)     | `volunteer-certificates.service.ts:~585-700` |

---

## 4. Tabla de checklist

| Ítem                                               | Estado         | Evidencia                                                                                      |
| -------------------------------------------------- | -------------- | ---------------------------------------------------------------------------------------------- |
| Política de tratamiento publicada                  | ❌             | sin rutas/textos (`routes.tsx:159-625`)                                                        |
| Aviso de privacidad                                | ❌             | idem                                                                                           |
| T&C versionados                                    | ❌             | idem                                                                                           |
| Autorización capturada con versión/fecha/evidencia | ❌             | sin tabla de consentimientos en `prisma/schema/`                                               |
| Derechos del titular operables                     | ❌             | `auth.controller.ts:181,211` solo lectura/edición de perfil                                    |
| Responsable/encargado definido                     | ❌             | —                                                                                              |
| Transferencias internacionales informadas          | ❌             | `render.yaml:24-122` (`oregon`)                                                                |
| Menores fuera de producción                        | ❌             | `volunteer-enrollments.schemas.ts:5-17`, sin flag                                              |
| AdoptaFácil no "certifica"                         | ⚠️             | membrete y "Auténtico" (`certificate-document.tsx:29`, `certificate-verification-page.tsx:82`) |
| RTE verificado por plataforma                      | ❌             | `fake-dian.adapter.ts:26-34`                                                                   |
| Sin API DIAN inventada                             | ✅             | `dian.port.ts:5-12`                                                                            |
| Contrato con partes correctas                      | ❌             | `adoption-contract-pdf.ts:393-396, 467`                                                        |
| Normas del contrato verificadas                    | ⚠️             | Ley 2455/2025 ✅; Ley 84/1989 y 1774/2016 pendientes                                           |
| Firma electrónica descrita en el contrato          | ❌             | ausente del texto                                                                              |
| Firmas manuscritas cifradas                        | ✅             | `core/crypto/signature-crypto.ts:67-84`                                                        |
| Mandato electrónico                                | ❌ (no existe) | sin coincidencias                                                                              |
| Auditoría sin PII en claro                         | ✅ (muestra)   | `donations.service.ts:256-262`, `bank-accounts.service.ts:49-55`                               |

---

## 5. Pendientes y riesgos antes del PR de remediación

- Abrir y citar textualmente Decreto 1074/2015 (cap. 25), Ley 84/1989, Ley 1774/2016, Ley 1480/2011 y DUR 1625/2016 desde un entorno con acceso (SUIN/Función Pública/Senado/DIAN bloquearon el fetch por robots).
- Todos los textos legales que se redacten en la Ola 2 son **borrador para abogado**.
- No encender certificados tributarios, voluntariado de menores, mandato ni dinero real sin concepto escrito.

## 6. Preguntas que solo el dueño / abogado / contador pueden responder

1. **Abogado:** reparto responsable/encargado; texto de política, aviso y T&C; validez del método de firma electrónica (Ley 527 art. 7) para el contrato de adopción; si la renuncia de fuero es válida; si fundaciones informales (persona natural) pueden ser parte cedente y recaudar (D6); forma válida del mandato (D16); transferencia internacional según la región del VPS; obligatoriedad del RNBD.
2. **Contador:** requisitos del certificado de donación (contenido, firmas, quién lo expide), reporte exógeno, y si el certificado puede generarse en plataforma con firma electrónica.
3. **Dueño:** ubicación del VPS Hostinger y proveedor de backups/correo; nueva fecha y umbral de certificados de servicio social (D15) y si incluyen menores (recomendación: no en MVP); confirmar canal oficial de reclamos.
