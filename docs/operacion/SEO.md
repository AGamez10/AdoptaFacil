# SEO de AdoptaFácil

Cómo encuentra Google (y los asistentes de IA) a AdoptaFácil, qué hace el código y qué
tiene que hacer una persona. Nadie puede garantizar el primer puesto en Google; lo que sí
se controla es que cada página pública sea rastreable, rápida, clara y única.

## Qué hace el código

| Pieza        | Dónde                                                          | Qué hace                                                                                                                                                                                                                                                                                                                             |
| ------------ | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Prerender    | `apps/web/scripts/prerender-seo.mjs`                           | En el build escribe `dist/<ruta>/index.html` con título, descripción, canónica, hreflang, Open Graph, JSON-LD y contenido legible sin JavaScript: portada, `/adoptar` por especie y ciudad, fichas, portales (`/o/<slug>`), campañas activas, guías, `/ayudar`, `/voluntariados`, `/transparencia-nacional`, `/para-organizaciones`. |
| Cascarón     | `dist/app.html`                                                | Lo que reciben las rutas privadas, los 404 y las páginas creadas después del build. Sin canónica: cada pantalla pone la suya (`useSeo`).                                                                                                                                                                                             |
| Sitemap fijo | `dist/sitemap.xml`                                             | Todas las páginas que prerenderizó el build, con fotos (`image:image`).                                                                                                                                                                                                                                                              |
| Sitemap vivo | `GET /api/public/seo/sitemap.xml` (`apps/api/src/modules/seo`) | Fichas, portales, ciudades y campañas **de este momento** (cache 30 min). Solo lee las mismas funciones públicas del catálogo. Nunca ciudades sin animales.                                                                                                                                                                          |
| robots.txt   | build                                                          | Bloquea zonas privadas y transaccionales; enlaza los dos sitemaps.                                                                                                                                                                                                                                                                   |
| llms.txt     | build                                                          | Resumen en texto para asistentes de IA, con ciudades y refugios.                                                                                                                                                                                                                                                                     |
| JSON-LD      | `src/seo/seo.ts`, `page-meta.js`                               | `Organization`, `WebSite`, `FAQPage` (portada); `BreadcrumbList` e `ItemList` (listados); `AnimalShelter` (portal, solo ciudad y departamento, nunca la dirección); `Article` + `FAQPage` (guías).                                                                                                                                   |
| Velocidad    | `early-fetch.ts`, prerender                                    | El portal y la ficha piden perfil, tema y animal antes de montar React; el HTML precarga la foto de portada (`fetchpriority=high`) y el código de la ruta (`modulepreload`).                                                                                                                                                         |

Privacidad: nada de expedientes, documentos, donantes ni adoptantes en páginas públicas,
sitemaps ni JSON-LD. Portales en vista previa (sin aprobar) y campañas cerradas llevan `noindex`.

## Variables del build

| Variable                     | Para qué                                                                  | Si falta                                                                           |
| ---------------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `SITE_URL` / `VITE_SITE_URL` | Dominio público para canónicas y sitemap.                                 | Se usa `https://VITE_APP_DOMAIN`. Sin ninguno: sin canónicas absolutas ni sitemap. |
| `SEO_API_URL`                | API en marcha para prerenderizar fichas, portales y campañas en el build. | Solo páginas fijas; el sitemap vivo cubre el resto y Google ejecuta el JS.         |
| `SEO_LOCALE`                 | `es-CO` por defecto (`<html lang>`, `og:locale`, hreflang).               | —                                                                                  |

Recomendado: reconstruir la web una vez al día (con `SEO_API_URL` apuntando a la API) para
que las fichas nuevas tengan HTML propio, además del sitemap vivo.

## Lo que solo una persona puede hacer

1. **Google Search Console**: verificar el dominio (registro DNS TXT), enviar
   `https://<dominio>/sitemap.xml` y `https://<dominio>/api/public/seo/sitemap.xml`, y revisar
   cada semana "Páginas" y "Experiencia en la página".
2. **Perfil de Empresa de Google** (Google Business Profile) de AdoptaFácil, y animar a cada
   refugio a tener el suyo con el enlace a su portal `/o/<slug>`.
3. **Bing Webmaster Tools** (alimenta también a varios asistentes de IA): mismo par de sitemaps.
4. **Enlaces de calidad**: que cada refugio enlace su portal desde Instagram, Facebook y su web;
   alianzas con veterinarias, alcaldías (bienestar animal), universidades y medios locales.
5. **Contenido**: una guía nueva al mes (requisitos por ciudad, esterilización, adopción de
   adultos) con respuestas concretas; es lo que más citan los asistentes de IA.
6. **Otros países**: al abrir un mercado, publicar su versión (p. ej. `es-MX`) y enlazar cada
   par con hreflang; el build ya toma el idioma de `SEO_LOCALE`.
