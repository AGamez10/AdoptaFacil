# 06 · Auditoría de UX y procesos

## Entorno de la prueba

**Servicios levantados**

| Pieza         | Detalle                                           |
| ------------- | ------------------------------------------------- |
| Base de datos | `adoptafacil_ux` en `:5433`                       |
| API           | `:3200`, con Redis aislada en `:6390`             |
| Web           | Vite en `:5273`                                   |
| Navegador     | Playwright con Chromium 1194 (`/opt/pw-browsers`) |

**Viewports:** escritorio 1440×900 y móvil 390×844.

**Datos de prueba**

- Semilla `seed:demo`.
- Una organización propia, "Refugio Fantasma UX", creada en el flujo A.

**Dónde está la evidencia**

- Capturas: `evidencia/producto/capturas/<rol>__<página>__{desk,mob}.webp`. Son 90 capturas, con métricas en `evidencia/producto/capturas/report.json` (h1, título, desbordamiento horizontal).
- Flujos por API: `evidencia/producto/flow{A,B,C,DE}.log`.
- Contrato generado: `evidencia/producto/contrato_ux.pdf`.

## 1. Flujos A–E de TANJIRO

| Flujo                                                | Resultado                                                                                          | Pasos rotos / riesgosos                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A** Registro de la org → portal                    | [VERIFICADO EJECUTANDO] El flujo "funciona" de punta a punta, pero en un orden de negocio inválido | Registro sin consentimiento ni verificación de correo → el Owner se autodeclara informal→en_proceso→formalizada→esal (HTTP 201) sin documentos → el portal público ya está visible con "✓ ESAL", "75 % formalización" y un CTA de donar → el admin aprueba un documento sin archivo y la org sube a Nivel 1. **No hay paso de aprobación de la organización.**                                                                                                                                                                                                                                              |
| **B** Animal → publicación                           | [VERIFICADO EJECUTANDO] PASS                                                                       | Crear, editar, fotos, publicar y aparecer en el catálogo global y en el portal funcionan. El dato clínico no se filtra a `/public/*` (0 coincidencias del marcador). Defecto de negocio: se publican animales de orgs no aprobadas.                                                                                                                                                                                                                                                                                                                                                                         |
| **C** Solicitud → contrato → firma → PDF             | [VERIFICADO EJECUTANDO] PARCIAL                                                                    | Se acepta una solicitud a un `animalId` inexistente. Los datos del adoptante del contrato salen del cliente ("Otro Nombre / otro@example.test") y se envía correo a ese tercero. El cedente es "Adopta Fácil". No hay aviso de borrador legal ni cláusula de Ley 1581. Las firmas sí se renderizan (pdfimages: 2 imágenes de 400×150). No llega correo con el PDF. El animal sigue `available`. Un emoji 🐶 en `healthStatus` deja el PDF del contrato **firmado e inmutable** en 500 para siempre. El adoptante no tiene pantalla de seguimiento post-adopción (las funciones del cliente existen sin UI). |
| **D** Campaña → evidencia → rendición                | [VERIFICADO EJECUTANDO] PARCIAL                                                                    | La campaña y su evidencia se crean, pero la evidencia se publica sin archivo y su URL da 404. Hay rendición pública, pero no un reporte descargable.                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| **E** Donación → recibo → conciliación → certificado | [VERIFICADO EJECUTANDO] PARCIAL (driver fake)                                                      | El desglose sale bien (100.000 → 109.498 al donante). Un **webhook sin firma aprueba** la donación (el replay es idempotente). Se emite el recibo. La campaña suma 100.000. La conciliación muestra pendiente 100.000 y dispersado 0. El payout no está implementado. El donante no puede pedir el certificado: el endpoint le devuelve 403 por su rol y la UI no lo explica.                                                                                                                                                                                                                               |

## 2. Los 7 recorridos UX (con capturas)

1. **Visitante → landing → catálogo → ficha → solicitar adopción**
   - `visitante__landing__*.webp`, `visitante__portal-org*__*.webp`.
   - La landing desborda en móvil.
   - El copy promete:
     - "Catálogo verificado" (`general-portal-features-section.tsx:80`).
     - "se dispersa a la organización" (`:94`).
     - "Libro público de transparencia" (`:110`).
   - Ninguna de las tres promesas es cierta hoy.
   - "Crear alerta" en el catálogo (`general-catalog-section.tsx:323`) no lleva a ningún flujo real.
2. **Visitante → portal de la organización (subdominio)**
   - Buen diseño de cabecera.
   - Muestra el badge "✓ ESAL" de una org fantasma (`visitante__portal-org-fantasma__desk.webp`).
   - Hay varias páginas sin `<h1>`.
   - Una URL pública desconocida lleva a `/login` en lugar de a un 404.
3. **Donante → donar → mis donaciones → recibo**
   - Las páginas de la cuenta no desbordan en móvil.
   - `/donar` desborda.
   - Los textos "pago simulado" quedan expuestos según el driver.
4. **Adoptante → mis solicitudes → contrato → firmar**
   - `donante__mis-solicitudes__*.webp` y `donante__contrato__*.webp` funcionan.
   - No hay seguimiento post-adopción.
5. **Owner → onboarding → perfil, formalización, documentos, rep. legal y portal**
   - Las **16 páginas de organización capturadas desbordan horizontalmente a 390 px** (report.json: `hscroll=true` en todas las `organizacion__*__mob`).
   - No hay onboarding guiado ni CTA de ayuda con WhatsApp 302 852 8926 / adoptafacil.oficial@gmail.com (F20).
   - "Transparencia nacional" y "Reporte exógeno 2575" son páginas "Disponible próximamente".
   - El dashboard de donaciones muestra "Aprobadas 1" junto a "Donaciones recibidas $0".
   - En pantalla aparece el texto de desarrollador "el contrato de donación todavía no existe en el sistema" (`org-donations-dashboard-section.tsx:115`).
6. **Owner → animales → adopciones (kanban) → contrato**
   - Funcional en escritorio.
   - En móvil, el kanban y las tablas desbordan.
   - El kanban no tiene estados de cancelada ni finalizada.
7. **PlatformSuperAdmin → inicio → revisión de documentos → duplicados → finanzas**
   - Sin desborde.
   - No hay cola de organizaciones, ni "tomar ticket", ni suspender o aprobar orgs (F19).
   - El menú lateral del superadmin muestra entradas de persona (donaciones y solicitudes propias).
   - El banner y el mapa son de Colombia, no un mapamundi.

## 3. Accesibilidad y calidad de la interfaz

- **`<title>` siempre "AdoptaFácil"** en las 90 capturas.
  - No cambia por página: es malo para lectores de pantalla, para el historial y para SEO.
- **Páginas sin `<h1>`:** varias públicas (ficha, adopción y portal).
- **Login:**
  - No usa `<form>` y el botón es `type="button"`, así que Enter no envía el formulario.
  - El gestor de contraseñas se degrada.
- **Errores de la API en inglés** que pueden llegar a la UI. Ejemplos:
  - "Insufficient role for this operation" (`roles.guard.ts:53`).
  - "Cannot advance to "ESAL_RTE"".
- **Movimiento:** `prefers-reduced-motion` solo aparece en 7 sitios. No hay three.js (F4/F8 no iniciados).
- **Sin modo oscuro** (LEV-RNF-08).
- **Sin enlaces legales en el footer:** privacidad, T&C y tratamiento de datos.
- **Favorito (corazón)** que solo vive en el estado local y se pierde al recargar. Es una maqueta que engaña al usuario.

## 4. Bundle y rendimiento

| Métrica                | Valor                                            | Fuente                                 |
| ---------------------- | ------------------------------------------------ | -------------------------------------- |
| JS principal           | **1.703,41 kB** (369,37 kB gzip), un único chunk | `00_BASELINE_Y_BUILD.md` (build)       |
| Code-splitting         | Ninguno: `routes.tsx` sin `lazy()`               | `apps/web/src/shell/router/routes.tsx` |
| Compresión de imágenes | No hay (TODO)                                    | `disk-storage.adapter.ts:22`           |

**Objetivo propuesto:**

- `lazy()` por zona: público, cuenta, organización y plataforma.
- Gráficos y mapa cargados de forma diferida.
- Presupuesto inicial menor a 250 kB gzip para la landing.
- Medir el LCP con Lighthouse en móvil.

## 5. Prioridad UX para el MVP 1.0

| Prioridad | Qué hacer                                                                                                                                                                     |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0        | Quitar el copy que promete verificación, dispersión y transparencia inexistentes. Quitar "(prueba)" y "simulado". No mostrar el badge ESAL sin verificación de la plataforma. |
| P1        | Desborde móvil del panel de organización (contenedor `min-w-0`/`overflow-x-auto` en tablas y kanban). Login como `<form>`. `<title>` por ruta. 404 público real.              |
| P1        | Onboarding con CTA de contacto (F20). UI de seguimiento del adoptante. Explicar el 403 del certificado.                                                                       |
| P2        | Code-splitting. Mensajes de error en español con los textos literales del cliente. Ocultar con flags las páginas "próximamente".                                              |
