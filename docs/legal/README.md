# Textos legales de AdoptaFácil (borradores para abogado)

> **Nada de esta carpeta es asesoría jurídica.** Son borradores redactados para que un abogado los revise, ajuste y firme antes del lanzamiento. Cada texto lo dice en su primera línea.

## Qué hay

| Documento                                                                         | Archivo                                    | ¿Quién lo acepta?                                                           |
| --------------------------------------------------------------------------------- | ------------------------------------------ | --------------------------------------------------------------------------- |
| Términos y condiciones de uso                                                     | `terminos/2026-10-15.md`                   | Toda cuenta y todo donante sin cuenta (casilla 1)                           |
| Qué es y qué no es AdoptaFácil (principios, límites, reportes)                    | `alcance/2026-10-15.md`                    | Forma parte de los términos (casilla 1)                                     |
| Autorización para el tratamiento de datos                                         | `autorizacion-datos/2026-10-15.md`         | Toda cuenta y todo donante sin cuenta (casilla 2, separada de los términos) |
| Política de tratamiento de datos personales                                       | `politica-de-datos/2026-10-15.md`          | Se acepta con la autorización (casilla 2)                                   |
| Condiciones para organizaciones y acuerdo de tratamiento de datos (transmisión)   | `condiciones-organizaciones/2026-10-15.md` | Solo cuentas de organización (casilla 3)                                    |
| Autorización opcional para usos comerciales                                       | `autorizacion-comercial/2026-10-15.md`     | Opcional, nunca marcada, revocable (casilla 4)                              |
| Autorización opcional para mejorar el producto y entrenar inteligencia artificial | `autorizacion-ia/2026-10-15.md`            | Opcional, aparte de la comercial, nunca marcada, revocable (casilla 5)      |
| Aviso de privacidad                                                               | `aviso-de-privacidad/2026-10-15.md`        | Informativo                                                                 |
| Política de cookies                                                               | `cookies/2026-10-15.md`                    | Informativo (hoy solo hay cookies necesarias)                               |

En la web se leen en `/legal`, `/legal/<slug>` y `/legal/<slug>/<versión>`.

## Cómo funciona la versión y la prueba

- Cada archivo es **inmutable**. Su SHA-256 está fijado en `packages/contracts/src/legal.ts`; una prueba falla si alguien edita una versión ya publicada.
- Para cambiar un texto: crear `docs/legal/<slug>/<nueva-fecha>.md`, apuntar `version` y `sha256` a la nueva versión en `legal.ts`. Las cuentas existentes verán un diálogo que no se cierra hasta aceptar la nueva versión obligatoria.
- Cada aceptación queda en la tabla `legal_acceptances` (solo inserción; ni el superusuario puede editarla): documento, versión, hash, fecha UTC, IP, navegador y canal (registro, nueva versión, donación sin cuenta, preferencias). Retirar la autorización comercial es una fila nueva.
- Al aceptar, la persona recibe por correo la lista de documentos y versiones con su enlace.
- El usuario ve su historial y da o retira las autorizaciones opcionales (comercial e IA) en `/mis-autorizaciones`.

## Quién es el responsable mientras no hay sociedad

AdoptaFácil la opera, mientras se constituye la sociedad, **una persona natural comerciante** con su RUT (actividad de servicios tecnológicos) y matrícula mercantil. Sus datos viven en **un solo lugar**: `LEGAL_CONTROLLER` en `packages/contracts/src/legal-controller.ts`. Los textos usan marcadores (`{{titular}}`, `{{titular.nombre}}`, …) que la web sustituye al mostrarlos.

- **Completar los datos:** editar `LEGAL_CONTROLLER`. No cambia el hash de los textos (el hash cubre la plantilla) y no obliga a re-aceptar.
- **Al constituir la sociedad:** cambiar `kind` a `'company'` y sus datos, y publicar una versión nueva de los textos con el aviso de cesión (Términos, sección 16). Así queda prueba de que los usuarios fueron avisados.
- **Cesión:** Términos 16, Autorización de datos, Política (sección 1) y Condiciones para organizaciones 5A.3 dicen que el contrato, la base de datos y las autorizaciones pasarán a la sociedad.
- **Firma electrónica:** Términos 14 (Ley 527 de 1999, Decreto 2364 de 2012).
- **Documentos que genera la plataforma:** Términos 15. Todos los PDF (reportes, certificados de voluntariado, contratos de adopción, carnés) y el certificado de donación llevan el aviso `PLATFORM_DOCUMENT_NOTICE`.

## Datos que faltan (marcados ⟦así⟧ en los textos o en `LEGAL_CONTROLLER`)

- Nombre completo, cédula, NIT del RUT, matrícula mercantil, ciudad y dirección de la persona natural. Luego, razón social y NIT de la sociedad. Fecha de publicación. Dominio: adoptafacil.org (ya completado).
- Encargados: Hostinger (VPS), Cloudflare (dominio y red), correo, copias de seguridad y pasarelas de pago (hoy ninguna conectada; la versión vigente de la política aún nombra pasarelas retiradas y debe actualizarse en la próxima versión), en la política, sección 7. Falta confirmar el **país del centro de datos** elegido al contratar; como Hostinger es extranjera, puede ser transferencia internacional. Proveedores de correo y copias de seguridad, y el país donde procesa cada uno: pendientes.
- Plazos: conservación de datos tras cerrar la cuenta, conservación de evidencia de reportes, atención de reportes, aviso de cambios (propuesto 15 días), aviso de precios (30 días), aviso de incidentes a organizaciones (72 horas), exportación al terminar (30 días), registro de trazabilidad (10 años).

Las respuestas del asesor del cliente a estas preguntas, contrastadas con los textos, están en `revision-asesor.md`, junto con el checklist de transferencia internacional y la tabla del acuerdo encargado-responsable.

## Preguntas para el abogado

1. Reparto responsable/encargado propuesto y validez del acuerdo de transmisión (Decreto 1074 de 2015, art. 2.2.2.25.5.2).
2. Transferencia internacional según la región final de los servidores (Ley 1581, art. 26) y si hace falta declaración de conformidad ante la SIC.
3. Obligación de inscribir bases en el Registro Nacional de Bases de Datos.
4. Viabilidad del directorio de profesionales y de los usos comerciales; si cada canal (correo, SMS, WhatsApp) necesita casilla propia; horarios y frecuencia de la Ley 2300 de 2023.
5. Uso de datos para mejorar el producto y entrenar inteligencia artificial: estándar de anonimización para que la información deje de ser dato personal; si el entrenamiento con datos identificables exige requisitos adicionales; alcance del retiro de la autorización sobre modelos ya entrenados; datos de titulares de las organizaciones (la plataforma es encargada); transferencia a proveedores de IA fuera de Colombia. Reglas propuestas en la política (sección 5) y en `autorizacion-ia`.
6. Si la imagen de la firma manuscrita capturada en pantalla es dato biométrico.
7. Limitación de responsabilidad e indemnidad frente a la Ley 1480 de 2011 (cláusulas abusivas).
8. Procedimiento de reportes: plazos, conservación de evidencia, deber o facultad de denunciar, revisión de medidas.
9. Jurisdicción y mecanismo de solución de controversias.
10. Si una persona natural comerciante puede ser responsable del tratamiento y operar la plataforma mientras se constituye la sociedad, y qué debe inscribir (RUT, matrícula mercantil, Registro Nacional de Bases de Datos si aplica).
11. Validez de la cesión anticipada del contrato, la base de datos y las autorizaciones a la futura sociedad (Código de Comercio, art. 887 y siguientes): si basta el aviso previo o hace falta nueva autorización.
12. Si el mecanismo de firma electrónica es confiable y apropiado (Decreto 1074 de 2015, art. 2.2.2.47.4) para el contrato de adopción y los reportes firmados.
13. Si las Condiciones para organizaciones bastan como contrato de servicio y de transmisión de datos, o se necesita un contrato firmado aparte con cada organización.

## Preguntas para el contador

1. Contenido mínimo y firmas del certificado de donación con efectos tributarios.
2. Régimen de facturación de los planes que AdoptaFácil cobra a las organizaciones.
3. Plazos de conservación de soportes contables.
4. Obligaciones de la persona natural comerciante: régimen (simple o ordinario), facturación electrónica de las comisiones y los planes, y retenciones.
5. Si el aviso de los documentos generados ("no reemplaza la certificación de contador público ni de revisor fiscal") basta, y qué reportes necesitan firma de contador.

## Qué no cubre todavía el producto

- **Supresión y exportación de datos** desde la cuenta: hoy se atienden por correo (procedimiento manual descrito en la política).
- **Formulario de reporte** dentro de la plataforma: hoy el canal es el correo con asunto "Reporte".
- **Voluntariado de menores**: la política dice que estará apagado hasta tener autorización del representante legal; el apagado en el producto es otra tarea (hallazgo LEG-008 de la auditoría).
- Las afirmaciones "no custodia donaciones" y "cada organización cobra en su propia cuenta" dependen de que se fusione el cambio de pagos sin custodia (ADR-PAG-001).
