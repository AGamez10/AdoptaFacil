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

| Requisito                                                        | Dónde está                |
| ---------------------------------------------------------------- | ------------------------- |
| Papeles de cada parte                                            | Parte B, 8.1 a 8.3        |
| Objeto y finalidades: solo para prestar el servicio              | 9.1                       |
| Instrucciones documentadas de la organización                    | 9.1                       |
| Medidas de seguridad                                             | 9.2                       |
| Confidencialidad del personal y los proveedores                  | 9.3                       |
| Subencargados: lista, país y aviso previo de cambios             | 9.4 y Política, sección 7 |
| Incidentes: aviso en ⟦72 horas⟧ y colaboración ante la SIC       | 9.5                       |
| Consultas y reclamos de titulares                                | 9.6 y 9.8                 |
| Devolución, supresión y certificado al terminar                  | 9.7                       |
| Verificación o auditoría por la organización                     | 9.9                       |
| Uso de datos para IA: solo anonimizados salvo doble autorización | 9.1                       |
| Obligaciones de la organización como responsable                 | 10.1 a 10.4               |
| Cesión a la futura sociedad                                      | Parte A, 5A.3             |

**Pendiente del abogado:** si basta la aceptación en la plataforma o hace falta un contrato firmado aparte con cada organización (pregunta 13 del README).

## 3. Checklist de transferencia internacional de datos

Para cada proveedor que trate datos personales, antes de salir a producción y cada vez que cambie:

| Proveedor                   | Datos que recibe                                 | País                                   | Contrato o términos de tratamiento de datos | Garantías de seguridad | Política actualizada |
| --------------------------- | ------------------------------------------------ | -------------------------------------- | ------------------------------------------- | ---------------------- | -------------------- |
| Hostinger (VPS)             | Toda la base de datos y los archivos             | ⟦Confirmar el centro de datos elegido⟧ | ⟦ ⟧                                         | ⟦ ⟧                    | Sí (sección 7)       |
| Cloudflare                  | Tráfico del sitio (IP, navegador, solicitudes)   | ⟦Red global; confirmar⟧                | ⟦ ⟧                                         | ⟦ ⟧                    | Sí (sección 7)       |
| Proveedor de correo         | Correo, nombre y contenido de los mensajes       | ⟦Pendiente de elegir⟧                  | ⟦ ⟧                                         | ⟦ ⟧                    | Marcado pendiente    |
| Copias de seguridad         | Copia de la base de datos                        | ⟦Pendiente de elegir⟧                  | ⟦ ⟧                                         | ⟦ ⟧                    | Marcado pendiente    |
| Google (inicio de sesión)   | Nombre, correo y foto de la cuenta de Google     | ⟦Confirmar⟧                            | ⟦ ⟧                                         | ⟦ ⟧                    | Sí (sección 7)       |
| Mercado Pago o ePayco       | Datos de pago, en la cuenta de cada organización | ⟦Confirmar por pasarela⟧               | Contrato de la organización con la pasarela | ⟦ ⟧                    | Sí (sección 7)       |
| Proveedor de IA (si se usa) | Solo datos anonimizados, salvo autorización      | ⟦Pendiente de elegir⟧                  | Debe prohibir que use los datos para sí     | ⟦ ⟧                    | Sí (sección 5)       |

Por cada fila:

1. Anotar el país donde se guardan o procesan los datos. Si cambia, actualizar la tabla de la política (sección 7) y publicar una versión nueva.
2. Revisar si el país tiene un nivel adecuado de protección según la lista de la SIC. ⟦ABOGADO: confirmar la lista vigente.⟧
3. Si no lo tiene, confirmar que la autorización del titular cubre la transferencia (política, sección 8) o que aplica una excepción del artículo 26 de la Ley 1581 de 2012. ⟦ABOGADO⟧
4. Guardar el contrato o los términos de tratamiento de datos del proveedor: que solo trate los datos por cuenta de AdoptaFácil, con medidas de seguridad, sin usarlos para sí y con aviso de incidentes.
5. Decidir si hace falta declaración de conformidad ante la SIC. ⟦ABOGADO⟧
6. Revisar la tabla una vez al año y cada vez que se contrate un proveedor nuevo.

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
