# Revisión de las respuestas del asesor (2026-10-16)

> **Insumo, no dictamen.** Las respuestas del asesor de IA del cliente (recibidas el 2026-10-16) se contrastaron con los textos versión 2026-10-15 y con el código. Toda cita de norma, artículo o plazo que aquí aparece sigue **pendiente de validación del abogado o del contador** antes de tomarse como cierta.

## 1. Preguntas, insumo recibido y qué sigue abierto

| #   | Pregunta                                                   | Insumo del asesor (resumen)                                                                                                           | Qué hicimos                                                                                                                                                                                         | Sigue abierto                                                                 |
| --- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| A1  | Reparto responsable/encargado y acuerdo de transmisión     | Organización responsable, AdoptaFácil encargado; acuerdo con finalidades, instrucciones, subencargados, incidentes, devolución        | Ya estaba en Condiciones para organizaciones, Parte B. Se agregaron: aviso previo de nuevos subencargados, certificado de supresión, ayuda con derechos de titulares y verificación (ver sección 2) | Validación del abogado frente al Decreto 1074 de 2015, art. 2.2.2.25.5.2      |
| A2  | Transferencia internacional                                | Informar país, autorización o excepción legal, garantías contractuales con proveedores                                                | La política (secciones 7 y 8) ya informa y pide autorización. Se preparó el checklist de la sección 3                                                                                               | País del VPS; si hace falta declaración de conformidad ante la SIC            |
| A3  | Registro Nacional de Bases de Datos                        | Obligatorio según requisitos; cada organización registra las suyas                                                                    | Ya estaba (Parte B, 10.4)                                                                                                                                                                           | Si la persona natural que opera AdoptaFácil está obligada (umbral de activos) |
| A4  | Directorio y usos comerciales; casilla por canal; Ley 2300 | Autorización separada y específica; casilla por canal; opt-out; horarios                                                              | Usos comerciales **solo por correo**, con enlace de baja; SMS, WhatsApp y llamadas exigen casilla propia por canal (autorización comercial y política, sección 5)                                   | Horarios y frecuencia exactos de la Ley 2300 de 2023; alcance del directorio  |
| A5  | IA: anonimización, retiro, datos de organizaciones         | Solo anonimizado por defecto; anonimización irreversible y documentada; retiro hacia el futuro, informar límites técnicos             | Ya estaban el uso anonimizado por defecto y la doble autorización. Se agregó cómo anonimizamos y qué pasa con modelos ya entrenados al retirar la autorización                                      | Estándar exigible de anonimización                                            |
| A6  | Firma manuscrita: ¿dato biométrico?                        | Tratarla como dato sensible: cifrada, acceso restringido, fuera de IA                                                                 | Verificado en código: se guarda cifrada (AES-256-GCM, `core/crypto/signature-crypto.ts`). La política lo explica y la excluye de IA y de identificación biométrica                                  | Si exige autorización expresa adicional                                       |
| A7  | Limitación de responsabilidad (Ley 1480)                   | "En la máxima medida permitida por la ley"; no excluir daños directos                                                                 | Ya estaba (Términos, sección 10)                                                                                                                                                                    | Revisión de cláusulas abusivas                                                |
| A8  | Procedimiento de reportes                                  | Registro, plazos visibles, conservación de evidencia, facultad de denunciar                                                           | Sin cambios en los textos. El formulario dentro de la plataforma sigue pendiente (README)                                                                                                           | Plazos y deber o facultad de denunciar                                        |
| A9  | Jurisdicción                                               | Jurisdicción colombiana y reclamo extrajudicial en 15 días hábiles                                                                    | Ya estaba (Términos, sección 17)                                                                                                                                                                    | Redacción final                                                               |
| A10 | Persona natural como responsable                           | Es posible con RUT y matrícula mercantil                                                                                              | Ya estaba (Términos 16, `LEGAL_CONTROLLER`)                                                                                                                                                         | Confirmación del abogado                                                      |
| A11 | Cesión a la sociedad                                       | El aviso puede bastar para el contrato; para datos, informar y quizá pedir nueva aceptación de las autorizaciones opcionales          | Sin cambio: ya hay aviso de 15 días y derecho a cerrar la cuenta. Al cambiar de responsable se publica una versión nueva, y el sistema pide de nuevo la aceptación de los textos obligatorios       | Si las autorizaciones opcionales (comercial e IA) deben pedirse de nuevo      |
| A12 | Firma electrónica                                          | Válida si garantiza autenticidad, integridad y no repudio; registrar huella, fecha, IP; cifrar firma                                  | Ya estaba (Términos 14)                                                                                                                                                                             | Validación del mecanismo                                                      |
| C1  | Certificado de donación tributario                         | Campos mínimos: fecha, tipo de entidad, clase de bien, valor, forma de pago y destinación; firma de representante, contador o revisor | Verificado en código: solo se emite si la organización es ESAL con RTE vigente (`donation-certificates.service.ts`). **Faltan** forma de pago, clase de bien, destinación y firmante nombrado       | Que el contador confirme los campos y quién firma. Luego, tarea de producto   |
| C2  | Facturación de planes y comisiones                         | Factura electrónica; régimen según el RUT                                                                                             | Sin cambio                                                                                                                                                                                          | Régimen y facturación de la persona natural                                   |
| C3  | Conservación de soportes contables                         | 5 años para efectos fiscales; 10 recomendados                                                                                         | Propuesta de 10 años en la política (sección 11), marcada ⟦CONTADOR⟧                                                                                                                                | Plazo definitivo                                                              |
| C4  | Obligaciones de la persona natural                         | Régimen simple u ordinario, facturación, retenciones                                                                                  | Sin cambio                                                                                                                                                                                          | Definición del contador                                                       |
| C5  | Aviso de documentos generados                              | El aviso es correcto; los soportes tributarios necesitan firma de contador o revisor cuando la norma lo exige                         | El aviso ya está en todos los PDF y en el certificado                                                                                                                                               | Qué reportes deben exigir firma de contador antes de presentarse a terceros   |

## 2. Acuerdo encargado-responsable: requisitos mínimos y dónde está cada uno

El acuerdo ya existe: es la **Parte B de las Condiciones para organizaciones**, que acepta el Owner al crear la organización y queda registrado con versión, hash, fecha, IP y navegador. No se redactó otro modelo para no tener dos textos.

| Requisito                                                                                      | Dónde está                |
| ---------------------------------------------------------------------------------------------- | ------------------------- |
| Papeles de cada parte                                                                          | Parte B, 8.1 a 8.3        |
| Objeto y finalidades: solo para prestar el servicio                                            | 9.1                       |
| Instrucciones documentadas de la organización                                                  | 9.1                       |
| Medidas de seguridad                                                                           | 9.2                       |
| Confidencialidad del personal y los proveedores                                                | 9.3                       |
| Subencargados: lista, país, aviso previo de cambios y responsabilidad de AdoptaFácil por ellos | 9.4 y Política, sección 7 |
| Incidentes: aviso pactado en ⟦72 horas⟧ y colaboración en el reporte legal a la SIC            | 9.5                       |
| Confidencialidad después de terminar                                                           | 9.10                      |
| Consultas y reclamos de titulares                                                              | 9.6 y 9.8                 |
| Devolución, supresión y certificado al terminar                                                | 9.7                       |
| Verificación o auditoría por la organización                                                   | 9.9                       |
| Uso de datos para IA: solo anonimizados salvo doble autorización                               | 9.1                       |
| Obligaciones de la organización como responsable                                               | 10.1 a 10.4               |
| Cesión a la futura sociedad                                                                    | Parte A, 5A.3             |

El asesor envió después un modelo de acuerdo completo. Sus cláusulas útiles ya estaban o se agregaron (responsabilidad por subencargados, contenido del aviso de incidente, confidencialidad después de terminar). No se adoptó su cláusula 5, que exige autorización previa de la organización para cada subencargado: con varias organizaciones en la misma plataforma no es operable, y en su lugar hay aviso previo con derecho a terminar. Tampoco la evidencia anual de pruebas de seguridad, que queda como pregunta para el abogado.

**Pendiente del abogado:** si basta la aceptación en la plataforma o hace falta un contrato firmado aparte con cada organización (pregunta 13 del README).

## 3. Checklist de transmisión y transferencia internacional de datos

Solo para Colombia, con los proveedores del proyecto. Primero se clasifica cada proveedor:

- **Transmisión** (art. 2.2.2.25.5.2 del Decreto 1074 de 2015): el proveedor trata los datos por cuenta de AdoptaFácil, como encargado. Se cubre con un contrato de transmisión. Son todos los proveedores de la tabla.
- **Transferencia** (art. 26 de la Ley 1581 de 2012): los datos se entregan a otro responsable que decide sobre ellos. Exige país con nivel adecuado, una excepción del artículo 26 o declaración de conformidad de la SIC. Hoy no hay ninguna.

⟦ABOGADO: confirmar esta clasificación y si la transmisión a un encargado en un país sin nivel adecuado necesita algo más que el contrato y la autorización de la política (sección 8).⟧

| Proveedor                   | Tipo        | Datos que recibe                                 | País                                   | Contrato de transmisión o términos de datos | Garantías de seguridad |
| --------------------------- | ----------- | ------------------------------------------------ | -------------------------------------- | ------------------------------------------- | ---------------------- |
| Hostinger (VPS)             | Transmisión | Toda la base de datos y los archivos             | ⟦Confirmar el centro de datos elegido⟧ | ⟦ ⟧                                         | ⟦ ⟧                    |
| Cloudflare                  | Transmisión | Tráfico del sitio (IP, navegador, solicitudes)   | ⟦Red global; confirmar⟧                | ⟦ ⟧                                         | ⟦ ⟧                    |
| Proveedor de correo         | Transmisión | Correo, nombre y contenido de los mensajes       | ⟦Pendiente de elegir⟧                  | ⟦ ⟧                                         | ⟦ ⟧                    |
| Copias de seguridad         | Transmisión | Copia de la base de datos                        | ⟦Pendiente de elegir⟧                  | ⟦ ⟧                                         | ⟦ ⟧                    |
| Google (inicio de sesión)   | ⟦Confirmar⟧ | Nombre, correo y foto de la cuenta de Google     | ⟦Confirmar⟧                            | ⟦ ⟧                                         | ⟦ ⟧                    |
| Pasarela de pagos           | ⟦Confirmar⟧ | Datos de pago, en la cuenta de cada organización | ⟦Confirmar por pasarela⟧               | Contrato de la organización con la pasarela | ⟦ ⟧                    |
| Proveedor de IA (si se usa) | Transmisión | Solo datos anonimizados, salvo autorización      | ⟦Pendiente de elegir⟧                  | Debe prohibir que use los datos para sí     | ⟦ ⟧                    |

Por cada fila, antes de salir a producción y cada vez que cambie:

1. Anotar el país donde se guardan o procesan los datos. Si cambia, actualizar la política (sección 7) y publicar una versión nueva.
2. Guardar el contrato o los términos de datos del proveedor. Deben decir que solo trata los datos por cuenta de AdoptaFácil, con medidas de seguridad, sin usarlos para sí, con aviso de incidentes y con supresión al terminar.
3. Revisar las garantías técnicas: cifrado en tránsito y en reposo, acceso con segundo factor, y certificaciones (ISO 27001 o SOC 2) si las tiene.
4. Si alguna fila resulta ser transferencia, revisar si el país tiene nivel adecuado según la SIC, si aplica una excepción del artículo 26 o si hace falta declaración de conformidad. ⟦ABOGADO⟧
5. Revisar la tabla una vez al año y cada vez que se contrate un proveedor nuevo.

**Incidentes, dos plazos distintos.** Las ⟦72 horas⟧ del acuerdo con las organizaciones son un plazo **pactado** entre AdoptaFácil y cada organización. Aparte, la ley obliga al responsable a informar a la SIC los incidentes de seguridad (Ley 1581 de 2012, art. 17, literal n, y art. 18, literal k). ⟦ABOGADO: confirmar el plazo y el canal de ese reporte.⟧

## 4. Cláusula de consentimiento y política de privacidad: comparación

No se redactaron textos nuevos: los que el asesor propone ya existen en los 9 textos de la versión 2026-10-15. Se ajustó lo que faltaba.

| Lo que propone el asesor                                                | Dónde está                                                           |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Autorización previa, expresa e informada, separada de los términos      | Casilla 2 (Autorización de datos), aparte de la casilla 1 (Términos) |
| Política con responsable, finalidades, derechos, canales y plazos       | Política de tratamiento de datos, secciones 1 a 15                   |
| Autorización comercial separada, opcional y revocable                   | Casilla 4 (Autorización comercial)                                   |
| Casilla por canal (correo, SMS, WhatsApp)                               | **Nuevo:** solo correo; los demás canales requieren casilla propia   |
| IA: anonimizado por defecto; datos identificables solo con autorización | Casilla 5 (Autorización de IA) y Política, sección 5                 |
| Retiro de la autorización frente a modelos ya entrenados                | **Nuevo:** Autorización de IA y Política, sección 5                  |
| Firma tratada como dato sensible, cifrada y fuera de IA                 | **Nuevo:** Política, sección 3                                       |
| Registro de cada aceptación: fecha, IP, versión                         | Tabla `legal_acceptances`, de solo inserción                         |
| Aviso de privacidad corto                                               | Aviso de privacidad                                                  |
| Conservación de soportes                                                | **Nuevo:** propuesta de 10 años, marcada ⟦CONTADOR⟧                  |

Los plazos de consultas (10 días hábiles) y reclamos (15 días hábiles) de la política ya siguen los de la Ley 1581 de 2012, artículos 14 y 15. ⟦ABOGADO: confirmar.⟧

## 5. Segundo envío del asesor: qué se descartó y por qué

- **Citas que no corresponden.** La "Resolución 13 de 2021 DIAN" no regula la protección de datos personales, que es competencia de la SIC. El "Decreto 2242 de 2015" trata de factura electrónica, no de firma electrónica: la norma correcta es la Ley 527 de 1999 y el Decreto 2364 de 2012, compilado en el Decreto 1074 de 2015. No se usaron. La "Sentencia C-091/21" no se pudo verificar. La sentencia de control de constitucionalidad de la Ley 1581 que el asesor cita sin número es la C-748 de 2011. ⟦ABOGADO: confirmar.⟧
- **Una sola casilla para AdoptaFácil y la organización, con transferencia incluida.** No se adoptó. Los textos ya separan cada autorización por finalidad: términos, datos, condiciones de organización, comercial e IA. La política distingue transmisión de transferencia (sección 8).
- **Casilla comercial con varios canales.** Se adoptó en otra forma: los usos comerciales van solo por correo, y cada canal adicional tendrá su propia casilla cuando exista.
- **Registro de transferencias y evaluación de impacto como pasos obligatorios.** Hoy no hay transferencias. El checklist de la sección 3 cumple esa función para las transmisiones. ⟦ABOGADO: decidir si se exige una evaluación de impacto formal antes de usar un proveedor de IA.⟧
- **Chile y México.** Fuera de alcance: la plataforma opera solo en Colombia.

## 6. Siguientes pasos exactos

1. **Cliente:** completar en `packages/contracts/src/legal-controller.ts` (`LEGAL_CONTROLLER`) el nombre, la cédula, el NIT del RUT, la matrícula mercantil y el domicilio. Confirmar el país del centro de datos del VPS de Hostinger y elegir el proveedor de correo y el de copias de seguridad. Con eso se llenan la política (sección 7) y la tabla de la sección 3.
2. **Abogado:** revisar los 9 textos de la versión 2026-10-15 y cada marca ⟦ABOGADO⟧, usando las secciones 1 a 5 de este archivo y las preguntas 1 a 13 del README.
3. **Contador:** responder las preguntas 1 a 5 del README y confirmar los campos y el firmante del certificado de donación tributario (fila C1).
4. **Producto, después del contador:** agregar al certificado de donación la forma de pago, la clase de bien, la destinación y el firmante nombrado.
5. **Producto, después del abogado:** publicar una versión nueva de los textos con las redacciones definitivas (`docs/legal/<slug>/<fecha>.md` y su hash en `packages/contracts/src/legal.ts`).
6. Para regenerar el documento del abogado: `python3 -I /mnt/project-files/legal/build_legal.py /mnt/project-files/legal/textos-legales-adoptafacil.html`, desde la raíz del repositorio.
