# AdoptaFácil en el celular: PWA y apps nativas (Capacitor)

Una sola web, tres formas de usarla. No hay código aparte para el celular.

| Forma      | Cómo llega la persona                                                                           | Qué hay que hacer                                              |
| ---------- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Web        | Abre el dominio en el navegador                                                                 | Nada                                                           |
| PWA        | En el navegador: "Instalar app" (Chrome/Edge/Android) o "Compartir → Agregar a inicio" (iPhone) | Nada: viene con cada despliegue                                |
| App nativa | Play Store / App Store                                                                          | Cuentas de tienda + compilar en Android Studio / Xcode (abajo) |

## 1. PWA (instalable desde el navegador)

Archivos en `apps/web`:

- `public/manifest.webmanifest`: nombre, colores, `display: standalone` (pantalla completa sin barra del navegador), íconos 192/512 y maskable, accesos directos (Adoptar, Donar, Mi cuenta).
- `public/icons/`: íconos con solo el símbolo (el logo con texto no se lee en 48 px).
- `public/sw.js`: service worker mínimo. **Nunca guarda HTML ni respuestas de la API**: solo los archivos con hash de `/assets/` y los íconos. Si se navega sin conexión muestra `public/offline.html`.
- `src/lib/pwa.ts`: lo registra solo en el build de producción.
- `deploy/Caddyfile` y `render.yaml`: `sw.js` sin caché para que las versiones nuevas lleguen en la siguiente visita.

Para cambiar la estrategia de caché, sube `VERSION` en `sw.js`.

Requisito: el sitio debe servirse por **HTTPS** (localhost también vale para pruebas).

Probarla en local:

```bash
pnpm --filter @adoptafacil/web build
pnpm --filter @adoptafacil/web preview   # http://localhost:4173 → menú del navegador → "Instalar AdoptaFácil"
```

En Chrome: DevTools → Application → Manifest / Service workers. Para probar la pantalla sin conexión: Network → Offline y recargar.

## 2. Apps nativas con Capacitor (`apps/mobile`)

La app nativa abre la misma web publicada (`CAP_SERVER_URL`). Por qué así:

- La sesión usa una cookie HttpOnly y la API vive en el mismo dominio (`/api`). Cargando la web publicada todo sigue siendo del mismo origen: no hay que abrir CORS ni relajar cookies, y no se toca la seguridad de la API.
- Cada despliegue web actualiza también las apps, sin pasar por revisión de tienda (solo cambios de contenido web; los cambios nativos sí requieren nueva versión).
- Sin conexión se muestra `offline.html` empaquetado dentro de la app.
- Android no respalda los datos de la app en la nube (`allowBackup=false`), para que la cookie de sesión no salga del teléfono.

### Requisitos de la máquina

- Node 24 y pnpm 9 (igual que el resto del repo).
- Android: Android Studio (trae SDK y JDK 21).
- iOS: un Mac con Xcode actualizado (iOS 15 o superior como mínimo de la app). iOS no se puede compilar en Windows ni Linux.

### Comandos

```bash
pnpm install
pnpm --filter @adoptafacil/web build                     # genera apps/web/dist (offline.html, íconos)

# Apuntar la app a la web publicada (producción o staging) y copiar la config:
CAP_SERVER_URL=https://<tu-dominio> pnpm --filter @adoptafacil/mobile sync

pnpm --filter @adoptafacil/mobile open:android           # abre Android Studio → Run ▶
pnpm --filter @adoptafacil/mobile open:ios               # abre Xcode (solo Mac) → Run ▶
```

En Windows (PowerShell) la variable se pone así: `$env:CAP_SERVER_URL="https://<tu-dominio>"; pnpm --filter @adoptafacil/mobile sync`.

Desarrollo contra tu máquina: con `pnpm dev` corriendo, usa `CAP_SERVER_URL=http://10.0.2.2:5173` en el emulador Android (10.0.2.2 es el localhost de tu PC visto desde el emulador). En un celular físico usa la IP de tu PC en la red local. El http en claro solo se permite cuando la URL es http.

Si cambia el logo: reemplaza `apps/mobile/assets/icon-only.png` y corre `python3 apps/mobile/scripts/generate-icons.py` (necesita Pillow).

### Pasos que necesitan TUS cuentas (no se pueden hacer desde el repo)

1. **Confirmar el identificador de la app** antes de la primera subida: hoy es `co.adoptafacil.app` (en `capacitor.config.ts`, `android/app/build.gradle` y el proyecto de Xcode). Después de publicar no se puede cambiar.
2. **Google Play Console** (pago único de 25 USD): crear la app, completar ficha, clasificación de contenido, "Seguridad de los datos" y la URL de la política de privacidad (`/legal`).
   - Android Studio → Build → Generate Signed App Bundle → crear el keystore de subida. **Guarda el keystore y sus contraseñas fuera del repo** (gestor de contraseñas); perderlo complica las actualizaciones. Activa "Play App Signing".
   - Sube el `.aab` a prueba interna primero. Sube `versionCode` en `android/app/build.gradle` en cada envío.
3. **Apple Developer Program** (99 USD/año, se puede inscribir como organización con número D-U-N-S):
   - En Xcode → Signing & Capabilities → elegir el equipo; crear el App ID con el identificador del paso 1.
   - App Store Connect: crear la app, la ficha, "Privacidad de la app" y la URL de la política. Product → Archive → Distribute → TestFlight primero.
   - Sube la versión (`MARKETING_VERSION`) y el build (`CURRENT_PROJECT_VERSION`) en cada envío.

### Riesgos conocidos (leer antes de enviar a revisión)

- **Apple 4.2 (funcionalidad mínima)**: Apple puede rechazar apps que solo muestran un sitio web. Mitigación antes de enviar a App Store: agregar al menos una función nativa con valor real (notificaciones push de estado de solicitud, compartir nativo de fichas, cámara para fotos de animales). Google Play no suele poner este reparo.
- **Inicio de sesión con Google**: Google bloquea su login dentro de vistas web embebidas. En la app nativa, el botón de Google puede fallar; correo y contraseña funcionan. Arreglo futuro: login de Google con el navegador del sistema o el SDK nativo.
- **Pagos y enlaces externos**: los dominios distintos al de la app se abren en el navegador del sistema. Un pago que redirige de vuelta llega al navegador, no a la app. Antes de cobrar dentro de la app hay que agregar enlaces profundos (App Links / Universal Links).
- **Modo empaquetado (sin `CAP_SERVER_URL`)**: muestra las pantallas, pero la sesión no funcionará hasta que la API acepte el origen de la app (`https://localhost`, `capacitor://localhost`) y la cookie de sesión funcione entre sitios en iOS. No usarlo para publicar.
