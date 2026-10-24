# 01 · Veredicto ejecutivo · Fase 0

> AdoptaFácil · auditoría forense de la entrega final del equipo · línea base `48cabad` (`main`, 2026-10-07) · ejecutada el 2026-10-07.
> Etiquetas: [VERIFICADO], [VERIFICADO EJECUTANDO], [PARCIAL], [NO IMPLEMENTADO], [ROTO], [INSEGURO], [UNVERIFIABLE]. Cada afirmación remite al informe que la sustenta.

## Veredicto

| Uso                                                          | Decisión                                                                         |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| Producción con dinero real                                   | **NO-GO**                                                                        |
| Lanzamiento público                                          | **NO-GO**                                                                        |
| Piloto cerrado **sin dinero** (3–5 organizaciones conocidas) | **GO WITH CONDITIONS**: solo tras cerrar las condiciones C1–C10 de abajo (Ola 1) |

**¿Diamante en bruto, base mediocre que necesita cirugía o sistema para tirar?** **Diamante en bruto con heridas abiertas: reparar, no reescribir.** El núcleo que más cuesta construir está bien hecho y lo demostramos ejecutándolo: 0 fugas entre organizaciones en 304 pruebas HTTP de BOLA/IDOR, RLS `ENABLE + FORCE` en 54 tablas con un rol de runtime sin bypass, 1.372 pruebas unitarias y 589 de integración en verde, cero vías de SQL injection. Las heridas son de **configuración insegura por defecto**, **reglas de negocio ausentes** y **operación inexistente**, y todas se reparan en el código actual. No hay ninguna causal de reescritura de TANJIRO §31 (`03_ARCHITECTURE_AUDIT.md` §1).

## Puntuación (0–10)

| Dimensión             | Nota    | Por qué                                                                                                                      |
| --------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Product               | 5       | Funcionalidad amplia; 23 % de 91 requisitos completos, 43 % parciales (`02`)                                                 |
| Architecture          | 7       | Monolito modular con puertos y RLS; sin flags ni guardas de arranque (`03`)                                                  |
| Code quality          | 6       | Tipado estricto, lint verde, convenciones claras; deuda localizada (`03` §5)                                                 |
| Security              | 3       | 3 P0 de integridad y 10 P1 (`04`)                                                                                            |
| Multi-tenancy         | 7       | Aislamiento HTTP y RLS probados; 8 tablas sin RLS (SEC-004)                                                                  |
| Payments              | 1       | Modelo actual = custodia; webhooks falsificables con el driver desplegado (`08b`)                                            |
| Data model            | 6       | Esquema por módulo y migraciones limpias; faltan el estado operativo de la organización y las FK de adopción (`02`, SEC-015) |
| Testing               | 6       | Buena cobertura unitaria e integración; sin e2e; CI de `main` en rojo al entregar (`00`)                                     |
| DevOps                | 2       | Un solo workflow, sin gates de seguridad ni Dockerfile; el despliegue decidido (VPS) no existe (`07`)                        |
| Observability         | 1       | Solo logs de consola (`07`)                                                                                                  |
| UX                    | 5       | Diseño cuidado; desborde móvil en el panel y copy que promete lo que no existe (`06`)                                        |
| Legal readiness       | 1       | Sin Ley 1581; contrato con la parte equivocada; certificados emitidos como si fueran de AdoptaFácil (`05`)                   |
| Maintainability       | 6       | Documentación de arquitectura, MER y manuales; autoría del historial colapsada (BLD-007)                                     |
| Operational readiness | 1       | Sin backups, restore, alertas ni staging (`07`)                                                                              |
| Time-to-market        | 5       | El piloto sin dinero está a una ola de distancia                                                                             |
| Commercial readiness  | 2       | Sin dinero real, sin planes, sin B2B (`08`)                                                                                  |
| **Media**             | **4,0** |                                                                                                                              |

## Las seis heridas P0 (STOP SHIP)

| ID                | Qué pasa                                                                                                                                                                                                                     | Evidencia                                                                               |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| SEC-001           | Cualquiera entra como **cualquier cuenta, incluido PlatformSuperAdmin**, con `POST /auth/google` y el token `fake:<correo>:x`. El driver de identidad es `fake` por defecto y nada lo impide en producción.                  | `evidencia/seguridad/03_af001.out`                                                      |
| SEC-002 / PAY-002 | Un `POST /donations/webhook` **sin firma** aprueba donaciones y emite recibos. `render.yaml:110` despliega `PAYMENT_DRIVER=fake`.                                                                                            | `04` SEC-002                                                                            |
| SEC-003 / LEG-004 | Una organización se autodeclara ESAL con RTE en minutos; la "DIAN" es un adaptador fake que siempre aprueba, y la verificación pública de su certificado tributario lo da por válido.                                        | `evidencia/producto/flowA.log`, `fake-dian.adapter.ts:26-34`                            |
| PAY-001           | El dinero entra a la cuenta Mercado Pago **de AdoptaFácil** (token de la plataforma, recaudo consolidado y dispersión T+1 manual): es **custodia**, prohibida por D1 y §3.4. La comisión del 4 % no se cobra en origen.      | `mercadopago-payment.adapter.ts:197,266-288`, `packages/contracts/src/payments.ts:9-14` |
| LEG-001           | No hay política de tratamiento de datos, aviso de privacidad, T&C ni captura de autorización (Ley 1581).                                                                                                                     | `05` LEG-001                                                                            |
| LEG-006           | El contrato de adopción nombra como cedente a "Adopta Fácil (organización protectora de animales)" con el NIT de la organización real. El error viene de la plantilla oficial del cliente (`docs/Contrato de Adopción.pdf`). | `adoption-contract-pdf.ts:393-396,467`                                                  |

Patrón raíz: el mismo del repo anterior, **adaptadores fake activos por defecto sin guarda de entorno**. Las correcciones del proyecto anterior (PR #1–#19) no están en este repo: F2 **retrocedió**.

## Condiciones del piloto sin dinero (todas obligatorias)

- **C1** La API no arranca en producción con drivers fake/stub/log (identidad, pagos, DIAN, firma, correo) y desaparece "Continuar con Google (prueba)" (SEC-001, AF-029).
- **C2** Donaciones, apadrinamientos, payouts, conexión MP y certificados tributarios apagados por flag, con 404/503 en la API y ocultos en la navegación (PAY-001/002, SEC-002).
- **C3** El nivel de formalidad (ESAL, RTE) solo lo cambia un PlatformAdmin con documento aprobado y archivo existente; estado operativo de la organización con aprobación y suspensión (SEC-003, LEG-011, AF-023).
- **C4** Solo un Owner otorga Owner; el último Owner no se revoca; invitación de miembros (SEC-006, SEC-007, AF-017).
- **C5** Política de datos, aviso y T&C como borradores para abogado, con autorización versionada e inmutable (LEG-001).
- **C6** Contrato de adopción con la organización como parte, aviso de "borrador sujeto a revisión de abogado", datos construidos en el servidor y PDF tolerante a Unicode (LEG-006, LEG-007, SEC-015).
- **C7** Higiene mínima: sin admin `changeme123`, helmet/HSTS/nosniff, `trust proxy` + rate limit en Redis, esquemas `https:` en URLs, RLS en cuentas bancarias y tokens del PSP (SEC-004, 008, 009, 010, 012).
- **C8** Voluntariado sin menores (flag) y certificados emitidos por la organización (LEG-008, LEG-005).
- **C9** Backup diario con restore probado en el entorno real, alertas de errores y de uptime (OPS-001, OPS-002).
- **C10** CI en verde con gates de secretos, dependencias (sin críticas en runtime) y guarda de drivers (BLD-002, BLD-004, BLD-005).

**Para cobrar dinero, además:** split real sin custodia confirmado **por escrito** por el PSP, concepto de abogado (custodia, informales D6, certificados), firma de webhook verificada en sandbox con monto, moneda y receptor, tokens y cuentas cifrados, tarifas reales del PSP, reembolsos y contracargos modelados.

## Respuestas TANJIRO §0 (A–M)

- **A. ¿Qué compramos?** Un monolito NestJS + React de ~110 k líneas con 14 módulos backend y 62 migraciones, sólido en aislamiento y pruebas, con dinero y legal en estado de demo. Lo pactado contractualmente queda **UNVERIFIABLE** porque faltan los contratos de los desarrolladores, la Auditoría Integral y el Documento Maestro V4.
- **B. ¿Qué existe?** Ver el mapa de módulos en `03` §5.1 (219 endpoints).
- **C/D. ¿Qué cumple y qué no?** De 91 requisitos de los documentos del repo: 21 PASS, 39 PARTIAL, 14 FAIL, 13 MISSING, 2 UNVERIFIABLE, 2 ROADMAP (`02`).
- **E. ¿Qué funciona "de mentira"?** Identidad Google, pagos, DIAN y firma con adaptadores fake; favoritos en estado local; páginas "próximamente"; correo en modo log.
- **F/G. ¿Qué es inseguro y qué bloquea?** Las seis P0 de arriba y los P1 de `04`, `05` y `08b`.
- **H. ¿Qué se repara rápido?** C1, C4, C7 y los headers: de horas a un día cada uno.
- **I. ¿Qué se apaga?** Dinero (M05, M07, M15 pagos), certificados tributarios, menores, comunidad, reputación y recursos (`09`).
- **J. Camino más corto a RC1:** Ola 1 = C1–C10 (`11_REMEDIATION_PLAN.md`).
- **K. Costo de operar:** VPS Hostinger de USD 15–55/mes hasta 100 organizaciones; el costo dominante son personas, no infraestructura (`08`).
- **L. Modelo financiero:** el 4 % solo no sostiene la empresa: el equilibrio con fundador remunerado llega con ~496 organizaciones en el escenario BASE. Con B2B, planes, dominios y proyectos baja a ~123 (`08`; todos los precios son hipótesis).
- **M. Blockchain sin contaminar el MVP:** `EvidenceProofProvider → InternalProofProvider` (cadena de hashes por tenant sobre la auditoría existente), con `BlockchainAnchorProvider` futuro que solo publica hashes por lote. Sin token ni wallet (`03` §4).

## Las 20 preguntas de TANJIRO §35

1. **¿Sirve?** Sí como base. Hoy no sirve para dinero ni para el público.
2. **¿Cuánto del V2.0 está implementado?** El 23 % completo y el 43 % parcial de lo que fijan los documentos del repo. El V2.0 original no está en el repo.
3. **¿Producción real vs mock?** Los módulos de datos (organizaciones, animales, adopciones, campañas) son reales. Las integraciones (identidad, pagos, DIAN, firma, correo) son mock en la configuración desplegada.
4. **Excelente:** aislamiento multi-tenant, RLS, pruebas automatizadas, SQL parametrizado, firmas cifradas, idempotencia de webhooks.
5. **Mediocre:** operación, flags, UX móvil del panel, bundle de 1,7 MB.
6. **Peligroso:** drivers fake por defecto; custodia de fondos; autodeclaración de RTE.
7. **Mal planteado:** "split" implementado como `sponsor.id` con token de plataforma; contrato con AdoptaFácil como parte; certificados con membrete de AdoptaFácil.
8. **Sobra (para el MVP):** comunidad, reputación, recursos, marketplace y apadrinamientos recurrentes. Se apagan con flag, no se borran.
9. **Falta:** Ley 1581, estado operativo y aprobación de organizaciones, invitaciones, flags, backups, monitoreo, despliegue VPS, plantillas de correo, three.js en la landing.
10. **¿Qué arreglaría primero?** C1 (guarda de drivers): cierra SEC-001/002/003 de una vez.
11. **¿Qué NO tocaría?** RLS, `PrismaService.withTenant`, funciones `SECURITY DEFINER`, contratos compartidos y la suite de pruebas.
12. **¿Cuánto falta para RC1?** Estimación: 10–15 días-persona de desarrollo para C1–C10, más la revisión del abogado (fuera del control técnico). Es una inferencia por tamaño de tarea, no una medición.
13. **¿Cuánto cuesta operar?** USD 15–55/mes de infraestructura hasta 100 organizaciones, más correo y backups off-site por definir.
14. **¿Cuál debe ser el MVP?** Organizaciones (con aprobación), RBAC con invitaciones, animales, adopción con contrato, campañas con evidencia sin cobro, portal público, auditoría y plataforma (`09`).
15. **¿Qué bloquea pagos?** PAY-001 a PAY-010, la confirmación escrita del PSP y el concepto del abogado.
16. **¿Qué bloquea producción?** Las seis P0, las condiciones C1–C10 y la operación.
17. **¿Qué bloquea escala?** Storage local, RLS incompleta, colas sin credenciales, bundle monolítico, sin observabilidad.
18. **¿Blockchain sin retrasar?** Ver M: interfaz más cadena de hashes interna, nada on-chain.
19. **¿Cuánto dinero adicional?** No hay cifra honesta sin cotizaciones. Las partidas son: abogado (datos, contrato, custodia, mandato), contador (IVA/ICA, certificados), proveedor de correo y backups off-site, y el tiempo de desarrollo de la Ola 1. La infraestructura es marginal.
20. **¿Continuar, reparar, reconstruir o abandonar?** **Continuar y reparar.** Apagar (sin borrar) lo que no entra al MVP. No reconstruir nada.

## Qué necesita el dueño (decisiones que la técnica no puede tomar)

1. Si hoy existe un despliegue en Render con este `render.yaml`, **SEC-001 es explotable ya**: hay que apagarlo o contenerlo de inmediato.
2. Escribir a Mercado Pago con las preguntas de `08b` (split real con `/v1/payments` o Checkout Pro frente a la API Orders actual).
3. Abogado: plantilla de contrato (quién es el cedente), textos Ley 1581, custodia, informales (D6), mandato (D16).
4. Subir el Documento Maestro V4, la Auditoría Integral y los contratos de los desarrolladores para cerrar "¿qué compramos?".
5. Fijar los precios (planes, dominio propio, fee B2B) y los proveedores de correo y backups.
