# Contrato de adopción v2: fuentes, cambios y revisión del abogado

Texto fuente: [`packages/contracts/src/adoptions-contract-template.ts`](../../packages/contracts/src/adoptions-contract-template.ts).
El PDF de la api y la vista previa de la web salen de esa misma función, así que lo que la persona
lee en pantalla es lo que firma y lo que recibe por correo.

> Este documento no es asesoría jurídica. Es la base técnica para que el abogado del cliente valide
> el texto antes de usarlo en un piloto con adoptantes reales (ver la última sección).

## Versionado

- `v1` es el texto original del cliente (`docs/Contrato de Adopción.pdf`). Se conserva **literal**
  para los contratos ya firmados con él, incluidos sus defectos.
- `v2` es el texto revisado. Todo contrato nuevo se genera con `templateVersion: 'v2'`.
- `templateVersion` entra al sello SHA-256 del contrato. Un contrato firmado se sigue mostrando con el
  texto exacto que se firmó aunque la plantilla cambie. Para cambiar la redacción se crea `v3`; nunca
  se edita una versión publicada.

## Qué se corrigió del texto v1 y por qué

| Problema en v1                                                                                       | Riesgo                                                                                                          | Cambio en v2                                                                                                                                                              |
| ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| El cedente aparecía como "Adopta Fácil (organización protectora de animales)" en todos los contratos | El contrato vinculaba a la plataforma y no a la fundación que entrega el animal                                 | El cedente es la organización (razón social, NIT, domicilio y representante). Cláusula expresa: AdoptaFácil no es parte                                                   |
| "El cedente podrá rescindir el contrato y recuperar la mascota sin responsabilidad alguna"           | Autoriza vías de hecho; recuperar al animal por la fuerza expone a la fundación a responsabilidad civil y penal | Procedimiento: requerimiento escrito, conciliación (Ley 2220 de 2022) y autoridad. Prohibición expresa de usar la fuerza o entrar al domicilio sin consentimiento u orden |
| Visitas de seguimiento a petición del cedente                                                        | Choca con la inviolabilidad del domicilio (Constitución, art. 28) y con el seguimiento ligero del estudio v4    | Seguimiento digital según el plan elegido (ligero o acompañado). Visitas solo con acuerdo previo                                                                          |
| "Renunciando a otro fuero"                                                                           | Renuncia de fuero con una persona natural, de dudosa validez                                                    | Diálogo, conciliación y juez competente según el Código General del Proceso                                                                                               |
| Sin base civil para la restitución                                                                   | La restitución quedaba sin fundamento cuando la propiedad ya se transfirió                                      | Entrega gratuita con cargas: el cedente puede pedir el cumplimiento o la rescisión si el adoptante incumple (Código Civil, art. 1483)                                     |
| Sin cláusula de datos personales                                                                     | Incumple el deber de informar y obtener autorización (Ley 1581 de 2012)                                         | Responsable (la organización), encargado (AdoptaFácil), finalidades y derechos                                                                                            |
| Sin cláusula de firma electrónica ni de copias                                                       | Dificulta probar la validez y la integridad                                                                     | Validez de la firma electrónica (Ley 527 de 1999), sello SHA-256 y una copia para cada parte                                                                              |
| Solo dos firmas en el PDF; un testigo firmaba pero no aparecía                                       | Documento incompleto                                                                                            | Bloque de firmas con todas las partes                                                                                                                                     |
| La firma del representante se leía en vivo                                                           | Si la organización cambiaba de representante, un contrato ya firmado mostraba la firma del nuevo                | Se congela la referencia a la firma usada al firmar                                                                                                                       |

## Lo nuevo de la v2 (decisiones del estudio de adopción v4)

- **Semana de prueba previa**: si la hubo, el contrato deja constancia de que el animal estuvo en
  comodato (Código Civil, art. 2200) y la propiedad siguió siendo de la fundación. El acta de prueba
  en sí, con sus estados y preguntas, es otro trabajo (estudio v4 §A).
- **Edad mínima de firma**: 18 por defecto. Cada organización del piloto puede subirla hasta 30 con
  la variable de entorno `ADOPTION_MIN_SIGNER_AGE_BY_ORG="<orgId>:25"`. Con un **responsable
  firmante** (`co_adopter`), que se obliga de forma solidaria (Código Civil, art. 1568), firma alguien
  del hogar que sí cumple la edad.
- **Verificación de identidad** con el documento original, sin guardar copia.
- **Identificación del animal** (microchip, placa o ninguna) y **esterilización** con plazo si se
  entrega sin esterilizar.
- **Seguimiento ligero por defecto**: al mes, a los 4 y a los 12 meses. El acompañado agrega un
  contacto a los 15 días. El plazo por defecto pasa de 6 a 12 meses.
- **Cuidador de respaldo** con la declaración del adoptante de que lo informó.
- **Devolución acordada**, sin culpa: señal temprana, plan de apoyo de 14 días como máximo y acta.
- **Declaración del adoptante** de no tener vigente la pena de prohibición de tenencia de animales.

## Fuentes consultadas (9 de octubre de 2026)

| Norma                                         | Para qué se usa                                                                                                                      | Fuente                                                                                                                                                                                                                         |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Ley 84 de 1989, art. 5 y art. 46A             | Deberes del tenedor; aprehensión preventiva                                                                                          | Texto citado en la Ley 2455 de 2025                                                                                                                                                                                            |
| Ley 1774 de 2016, arts. 1, 2 y 3              | Animales como seres sintientes (modifica el art. 655 del Código Civil); cinco libertades                                             | Ley 1774 de 2016                                                                                                                                                                                                               |
| Ley 2455 de 2025 ("Ley Ángel")                | Arts. 339A y 339B modificados, 339C nuevo; pena de prohibición de tenencia (C. P. arts. 43 num. 12, 50A y 51); art. 46A de la Ley 84 | [DMS Jurídica](https://www.dmsjuridica.com/buscador_20179478954/legislacion/leyes/?p=5372), [Rama Judicial](https://sidn.ramajudicial.gov.co/SIDN//NORMATIVA/TEXTOS_COMPLETOS/7_LEYES/LEYES%202025/Ley%202455%20de%202025.pdf) |
| Ley 1801 de 2016, arts. 117 y 124             | Traílla, bozal, excrementos, ataques                                                                                                 | [Código de Policía, cap. III](https://www.colombia.com/actualidad/codigos-leyes/codigo-de-policia/Libro2Tit13Cp3-convivencia-con-animales.aspx)                                                                                |
| Ley 2054 de 2020                              | Modifica el art. 117 de la Ley 1801; "perro de manejo especial"                                                                      | [Cancillería, normograma](https://cancilleria.gov.co/sites/default/files/Normograma/docs/ley_2054_2020.htm)                                                                                                                    |
| Código Civil, art. 1483                       | Rescisión de la donación si el donatario no cumple la carga                                                                          | [leyes.co](https://leyes.co/codigo_civil/1483.htm)                                                                                                                                                                             |
| Código Civil, arts. 1568, 2200 y 2353         | Solidaridad, comodato, daños causados por animales                                                                                   | Código Civil                                                                                                                                                                                                                   |
| Ley 2220 de 2022                              | Conciliación extrajudicial                                                                                                           | Estatuto de Conciliación                                                                                                                                                                                                       |
| Ley 527 de 1999, art. 7; Decreto 1074 de 2015 | Validez de la firma electrónica (compila el Decreto 2364 de 2012)                                                                    | Ley 527 de 1999                                                                                                                                                                                                                |
| Ley 1581 de 2012, arts. 8 y 9                 | Derechos del titular y autorización                                                                                                  | Ley 1581 de 2012                                                                                                                                                                                                               |
| Constitución Política, art. 28                | Inviolabilidad del domicilio                                                                                                         | Constitución                                                                                                                                                                                                                   |

Las referencias sin enlace se citaron por conocimiento previo y el abogado debe confirmarlas en la
fuente oficial (SUIN-Juriscol o Secretaría del Senado), en especial el art. 46A de la Ley 84 en su
redacción vigente y la compilación del Decreto 2364 en el Decreto 1074.

## Qué debe validar el abogado antes del piloto

1. **Naturaleza del contrato**: si la entrega gratuita con cargas se sostiene como donación modal y si
   el art. 1483 del Código Civil basta para pedir la restitución una vez transferida la propiedad.
   Alternativa: entregar en comodato durante el seguimiento y transferir al final.
2. **Causales de restitución**: que (a) a (d) sean suficientes y exigibles, y el plazo razonable del
   requerimiento escrito (hoy no fija días: `TODO(client)`).
3. **Ruta ante la negativa**: el orden conciliación, inspección de policía y Fiscalía, y qué documentos
   debe llevar la fundación (el expediente que exporta AdoptaFácil).
4. **Edad mínima mayor de 18**: si es válida como política de la fundación y si el responsable
   firmante debe ser solidario o fiador.
5. **Declaración sobre condenas**: si basta la declaración juramentada o si la fundación debe consultar
   el registro de inhabilitados que crea el art. 28 de la Ley 2455.
6. **Datos personales**: el plazo de conservación (hoy "mientras exista un deber legal o contractual"),
   el aviso de privacidad de la fundación y el contrato de transmisión con AdoptaFácil como encargado.
   Enviar el contrato con datos personales por correo a las partes.
7. **Cuidador de respaldo**: si basta la declaración del adoptante o el cuidador debe autorizar por sí
   mismo.
8. **Firma electrónica**: si la firma dibujada con sesión autenticada y sello SHA-256 es "confiable y
   apropiada" para el art. 7 de la Ley 527, o si conviene un código al celular.
9. **Cuota de recuperación**: que no convierta la entrega en compraventa y qué pasa con ella en una
   devolución.
10. **Textos**: el correo de la copia firmada (`apps/api/src/modules/adoptions/adoption-contract-email.ts`).
