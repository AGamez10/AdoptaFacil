# Estados formales, funciones y verificación de documentos

Qué puede hacer cada organización en AdoptaFácil según su estado ante la ley colombiana, qué documentos lo prueban, cómo los lee la plataforma y cómo los aprueba el superadmin.

> Este documento es diseño de producto con fuentes citadas, no asesoría legal. Las filas marcadas **Abogado** o **Contador** quedan como `TODO(client)` hasta que un profesional las firme. La matriz vive en código en `packages/contracts/src/legal-capabilities.ts`, así que la web y la API muestran y exigen exactamente lo mismo.

## 1. Los cinco estados

| Estado           | Quién es                                                                                                            | Cómo se prueba                                                                                                                       |
| ---------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| **Informal**     | Rescatista u hogar de paso, persona natural o colectivo sin personería jurídica.                                    | Nada legal. La plataforma aprueba la cuenta (estado operativo del PR #5).                                                            |
| **En proceso**   | Ya inició la constitución (acta, estatutos) pero aún no está inscrita.                                              | Lo declara el Owner. No desbloquea nada nuevo, así que no requiere revisión.                                                         |
| **Formalizada**  | Persona jurídica inscrita en la Cámara de Comercio.                                                                 | RUT y certificado de existencia y representación legal (CERL), ambos aprobados. La cédula del representante se pide pero no bloquea. |
| **ESAL**         | Fundación, asociación o corporación sin ánimo de lucro, en régimen ordinario de renta (responsabilidad 05 del RUT). | Un CERL aprobado que dice "sin ánimo de lucro". Solo la plataforma la sube a este estado.                                            |
| **ESAL con RTE** | ESAL calificada en el Régimen Tributario Especial (responsabilidad 04 del RUT) con su actualización anual al día.   | Un RUT aprobado y reciente con responsabilidad 04. Solo la plataforma la sube a este estado.                                         |

**Lo formal se habilita solo con documentos aprobados.** El servidor rechaza (400) pasar a Formalizada si el RUT y el CERL no están aprobados (`TRANSITION_REQUIREMENTS` en `apps/api/src/modules/org/formalization.machine.ts`), y rechaza subir a ESAL sin un CERL aprobado como evidencia o a ESAL con RTE sin un RUT aprobado (`PLATFORM_TRANSITION_EVIDENCE`). Mientras tanto, la pantalla de la organización explica qué falta y cómo conseguirlo.

Las ESAL se constituyen por acta o documento privado y adquieren personería al inscribirse en la Cámara de Comercio de su domicilio (Decreto 2150 de 1995, art. 40; Decreto 427 de 1996). El requisito de constitución incluye el PRE-RUT, así que toda ESAL inscrita tiene NIT.

## 2. Matriz estado → funciones

✅ habilitada · ❌ no habilitada

| Función                                                      | Informal              | En proceso | Formalizada | ESAL | ESAL con RTE               | Efecto legal                   | Revisa            |
| ------------------------------------------------------------ | --------------------- | ---------- | ----------- | ---- | -------------------------- | ------------------------------ | ----------------- |
| Portal público, animales y solicitudes                       | ✅                    | ✅         | ✅          | ✅   | ✅                         | Ninguno                        | —                 |
| Contrato de adopción                                         | ✅ (firma la persona) | ✅         | ✅          | ✅   | ✅                         | Contrato entre particulares    | Abogado           |
| Recibir donaciones en su propia cuenta                       | ✅                    | ✅         | ✅          | ✅   | ✅                         | Ninguno                        | Abogado, Contador |
| Campañas con meta pública                                    | ✅                    | ✅         | ✅          | ✅   | ✅                         | Ninguno                        | Abogado           |
| Apadrinamientos                                              | ✅                    | ✅         | ✅          | ✅   | ✅                         | Ninguno                        | Abogado           |
| Comprobante de donación **sin** efecto tributario            | ✅                    | ✅         | ✅          | ✅   | ✅                         | Ninguno (lo dice el documento) | Abogado           |
| Constancia de voluntariado                                   | ✅                    | ✅         | ✅          | ✅   | ✅                         | Ninguno                        | Abogado           |
| Sello "Verificada" y NIT en el portal                        | ❌                    | ❌         | ✅          | ✅   | ✅                         | Ninguno                        | —                 |
| Vender en la tienda                                          | ❌                    | ❌         | ✅          | ✅   | ✅                         | Factura                        | Contador          |
| Certificado de donación como soporte contable, sin descuento | ❌                    | ❌         | ❌          | ✅   | (lo reemplaza el de abajo) | Contable                       | Contador          |
| Certificado de donación **con** beneficio tributario         | ❌                    | ❌         | ❌          | ❌   | ✅                         | Tributario                     | Contador          |

Regla de vigencia: si una ESAL con RTE no tiene el RTE vigente (`rteVigente = false`), la plataforma la trata como ESAL y deja de emitir certificados tributarios. La DIAN cambia de oficio la responsabilidad 04 por la 05 cuando una entidad sale del RTE, así que un RUT reciente es la mejor prueba disponible.

### Por qué cada corte

- **Los informales sí recaudan.** Decisión del producto: mueven recursos importantes y la capa gratuita debe ser completa. El dinero llega a la cuenta de la persona responsable y, para ella, es un ingreso propio: las donaciones recibidas por personas naturales son ganancia ocasional (Estatuto Tributario, art. 302). Por eso el comprobante dice que no sirve para beneficio tributario y el portal dice que recibe una persona, no una entidad. **Contador:** cómo se lo explicamos al rescatista. **Abogado:** el texto que ve el donante.
- **El beneficio tributario es solo para ESAL con RTE.** El donante descuenta el 25 % de lo donado de su impuesto de renta solo si la entidad está calificada en el RTE (ET art. 257). La entidad debe estar legalmente constituida y bajo inspección y vigilancia del Estado (ET art. 125-1), la donación en dinero debe pagarse por cheque, tarjeta o intermediario financiero (ET art. 125-2; las pasarelas cumplen) y el certificado lo firma el contador o el revisor fiscal, con fecha, tipo de entidad, clase de bien, valor, forma de pago y destino (ET art. 125-3; DUR 1625 de 2016, art. 1.2.1.4.3, según el Oficio DIAN 6107 de 2024). El código ya bloquea el certificado a quien no es ESAL con RTE (`apps/api/src/modules/donations/donation-certificates.service.ts:29`).
- **La ESAL en régimen ordinario** puede soportar contablemente una donación, pero no da descuento. **Contador:** si vale la pena ofrecer este certificado o basta con el comprobante.
- **Vender** de forma habitual exige RUT y facturar (ET arts. 555-2 y 615). Por eso la tienda se abre desde Formalizada. **Contador:** facturación electrónica de lo que vende cada organización.
- **El RTE se actualiza cada año** en el registro web de la DIAN (ET art. 364-5; DUR 1625 de 2016, art. 1.2.1.5.1.9). Para 2026 el plazo fue el 30 de junio, y quien no actualiza pasa al régimen ordinario. **Contador:** confirmar el calendario de cada año para programar la reverificación.

## 3. Cómo se verifica (lectura en el servidor + una persona decide)

1. La organización sube el RUT, el CERL y la cédula del representante legal en "Documentos" (ya existe, con versiones).
2. El servidor lee el texto del PDF **dentro de AdoptaFácil**: el archivo nunca sale a un proveedor externo. Los RUT y los certificados que descargan la DIAN y las Cámaras traen capa de texto, así que no hace falta OCR de imagen. Un escaneo o una foto quedan en "revisión manual" (puerto `DocumentTextPort`, adaptador `PdfTextAdapter`; el OCR de fotos queda como otro adaptador del mismo puerto si el piloto lo pide).
3. La plataforma compara lo leído con lo que la organización declaró:

| Chequeo                                                             | RUT | CERL | Resultado si falla                 |
| ------------------------------------------------------------------- | --- | ---- | ---------------------------------- |
| Es el documento que dice ser                                        | ✅  | ✅   | Observar                           |
| Dígito de verificación del NIT (algoritmo DIAN)                     | ✅  | ✅   | Observar                           |
| El NIT coincide con el del perfil                                   | ✅  | ✅   | Observar                           |
| El nombre coincide                                                  | ✅  | ✅   | Aviso (puede ser sigla)            |
| Persona jurídica (casilla 24)                                       | ✅  |      | Aviso                              |
| Responsabilidad 04 (RTE) o 05 (ordinario), casilla 53               | ✅  |      | Aviso; con 04 propone ESAL con RTE |
| Sin ánimo de lucro                                                  |     | ✅   | Aviso; si sí, propone ESAL         |
| Inscripción activa (no cancelada, disuelta ni en liquidación)       |     | ✅   | Observar                           |
| Renovó este año (vence el 31 de marzo, Código de Comercio art. 33)  |     | ✅   | Aviso                              |
| Expedido hace menos de 30 días (`TODO(client)`)                     | ✅  | ✅   | Aviso                              |
| El representante legal coincide con el registrado (nombre y cédula) |     | ✅   | Observar                           |

4. El informe nunca aprueba solo. Sugiere **Aprobar**, **Observar** (con el motivo ya escrito para la organización) o **Revisión manual**. No se guarda el texto leído; se recalcula cada vez que se abre.

### Consultar el RUT directamente: no hay vía oficial

Se investigó si AdoptaFácil puede consultar el RUT o el registro mercantil por API con el solo NIT:

- **DIAN:** no publica una API del RUT. La consulta de estado del RUT (MUISCA) es un formulario para personas, con captcha; automatizarlo va contra sus condiciones de uso.
- **RUES:** solo ofrece la consulta web. Los "scrapers" de terceros que la automatizan no son una vía legal.
- **Proveedores KYC comerciales** (p. ej. Verifik) sí lo ofrecen, pero exigen contrato y un acuerdo de tratamiento de datos (Ley 1581 de 2012). Queda como opción `TODO(client)` detrás del mismo puerto.

Por eso el camino es que la organización **descargue su RUT y su CERL y los suba**: AdoptaFácil los lee, le **llena el perfil** (NIT con dígito de verificación válido y razón social, si confirma con "Usar en mi perfil") y la plataforma los verifica. A quien aún no tiene RUT, la pantalla de Formalización le dice qué hacer (constituir la entidad, inscribirla en la Cámara y sacar el RUT) con los enlaces oficiales.

Endpoints nuevos (sin migración):

- `GET /platform/documents/:id/verification`: informe de un documento de la cola (PlatformAdmin, PlatformSuperAdmin). Solo lee la cola por la función acotada que ya existe.
- `GET /org/formalization/capabilities`: lo que la organización puede hacer hoy y lo que desbloquea en el siguiente estado (cualquier miembro).
- `GET /org/documents/:id/prefill`: NIT y razón social leídos del RUT o el CERL propio, para llenar el perfil (Owner, Administrator). Solo ve documentos de su organización (RLS) y no escribe nada.

## 4. La pantalla del superadmin

Sobre el workspace de revisión del PR #4 (`/plataforma/documentos`), cada documento reservado muestra:

- Una franja con la sugerencia: verde "Todo coincide", ámbar "Revisa estos avisos" o rojo "Hay datos que no coinciden".
- Los datos leídos (NIT, tipo de contribuyente, régimen, fechas, código de verificación) junto a los chequeos con ✓, ! o ✗ y una frase cada uno.
- Un botón principal que hace lo sugerido en un clic: **Aprobar** o **Observar con este motivo** (el motivo se puede editar antes).
- Si los documentos aprobados respaldan un estado superior, arriba aparece **Subir a ESAL con RTE** (o ESAL / Formalizada). En un clic encadena los pasos que los documentos respaldan (por ejemplo En proceso → Formalizada → ESAL → ESAL con RTE), usando el endpoint de transición de plataforma del PR #5 con el documento como evidencia de cada paso.
- Enlaces a la consulta oficial (RUES y estado del RUT en la DIAN) para lo que la lectura no puede probar, como la autenticidad del certificado.

## 5. Para validar antes de recaudar dinero real

| #   | Pregunta                                                                                                                  | Quién    |
| --- | ------------------------------------------------------------------------------------------------------------------------- | -------- |
| 1   | Texto del comprobante sin efecto tributario y del aviso al donante cuando recibe una persona natural                      | Abogado  |
| 2   | Responsabilidad de la plataforma si un informal usa mal lo recaudado; términos con el organizador                         | Abogado  |
| 3   | Contrato de adopción firmado por una persona natural a nombre de un colectivo                                             | Abogado  |
| 4   | Si basta un RUT reciente con responsabilidad 04 para reconocer el RTE o si también se exige la constancia de calificación | Contador |
| 5   | Si se ofrece el certificado contable de la ESAL en régimen ordinario                                                      | Contador |
| 6   | Fecha anual para reverificar el RTE y qué pasa con los certificados emitidos entre el vencimiento y la reverificación     | Contador |
| 7   | Facturación electrónica en la tienda                                                                                      | Contador |
| 8   | Antigüedad máxima del RUT y del CERL (hoy 30 días)                                                                        | Abogado  |
| 9   | Si los documentos que hoy bloquean cada estado son los correctos (Formalizada: RUT y CERL; la cédula no bloquea)          | Abogado  |
| 10  | Si se contrata un proveedor KYC para consultar el RUT y el RUES por NIT, y el acuerdo de tratamiento de datos             | Abogado  |

## 6. Fuentes

- Estatuto Tributario arts. 125-1, 125-2, 125-3, 257, 302, 364-5, 555-2 y 615 ([estatuto.co](https://estatuto.co/125-1)).
- Descuento del 25 % por donaciones a ESAL del RTE ([Actualícese](https://actualicese.com/descuento-tributario-por-donaciones-a-entidades-del-regimen-tributario-especial/)).
- Contenido y firma del certificado de donación: [Oficio DIAN 6107 de 2024](https://normograma.dian.gov.co/dian/compilacion/docs/oficio_dian_6107_2024.htm).
- Cambio de oficio de la responsabilidad 04 a la 05: [DIAN](https://www.dian.gov.co/tramitesservicios/Paginas/esal05.aspx).
- Actualización anual del RTE en 2026: [ICEF](https://www.icef.com.co/component/k2/item/8395-esal-del-regimen-tributario-especial-deben-actualizar-registro-ante-la-dian); registro web: [ET art. 364-5](https://actualicese.com/estatutotributario/364-5/).
- Consultas oficiales: [RUES](https://www.rues.org.co/) y [estado del RUT en la DIAN](https://muisca.dian.gov.co/WebRutMuisca/DefConsultaEstadoRUT.faces).
- Constitución e inscripción de ESAL en Cámara de Comercio: [Decreto 427 de 1996](https://normas.cra.gov.co/Gestor/Docs/decreto_0427_1996.htm) y [requisitos de la Cámara de Comercio de Barranquilla](https://www.camarabaq.org.co/wp-content/uploads/2021/04/Requisitos-Constitucion-ESAL.pdf).
