import type { CapacitorConfig } from '@capacitor/cli';

/**
 * AdoptaFácil nativo (Android / iOS) con Capacitor.
 *
 * La app nativa carga la MISMA web publicada (CAP_SERVER_URL, p. ej. el dominio
 * de producción). Así la sesión, las cookies y la API funcionan exactamente
 * igual que en el navegador (mismo origen, VITE_API_URL=/api), sin abrir CORS
 * ni relajar SameSite, y cada despliegue web actualiza también las apps.
 * Si no hay conexión, se muestra la página local `offline.html` del build web.
 *
 * Sin CAP_SERVER_URL la app empaqueta el build de apps/web/dist tal cual
 * (modo "embebido"); sirve para mirar pantallas públicas, pero la sesión no
 * funcionará hasta que la API acepte el origen de la app. Ver docs/mobile.md.
 *
 *   CAP_SERVER_URL=https://<tu-dominio> pnpm --filter @adoptafacil/mobile sync
 *   CAP_SERVER_URL=http://10.0.2.2:5173  … (emulador Android contra `pnpm dev`)
 */
const serverUrl = (process.env.CAP_SERVER_URL ?? '').trim().replace(/\/+$/, '');
const isHttp = serverUrl.startsWith('http://');

if (serverUrl && !/^https?:\/\/[^/\s]+/.test(serverUrl)) {
  throw new Error(`CAP_SERVER_URL no es una URL válida: "${serverUrl}"`);
}

const config: CapacitorConfig = {
  // OJO: el appId queda fijo para siempre al publicar en Play Store / App Store.
  // Confirmarlo antes de la primera subida (ver docs/mobile.md).
  appId: 'co.adoptafacil.app',
  appName: 'AdoptaFácil',
  webDir: '../web/dist',
  server: serverUrl
    ? {
        url: serverUrl,
        // Solo para desarrollo local por http (emulador). En producción, https.
        cleartext: isHttp,
        errorPath: 'offline.html',
      }
    : {
        androidScheme: 'https',
        errorPath: 'offline.html',
      },
  android: {
    // Nunca permitir contenido http dentro de una página https.
    allowMixedContent: false,
  },
  ios: {
    contentInset: 'automatic',
  },
};

export default config;
