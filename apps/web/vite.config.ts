import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

/**
 * La web lee `@adoptafacil/contracts` desde su código fuente, no desde `dist/`.
 * Con el `dist/` compilado, traer una rama con un export nuevo (p. ej.
 * INVITABLE_ORG_ROLES) dejaba todo el módulo `features/org` sin cargar hasta
 * recompilar a mano: /organizacion y las pantallas de plataforma (aprobar
 * organizaciones, planes, documentos, duplicadas) caían en "Error 500".
 * Desde el fuente, Vite recarga los contratos al instante y no hay copia vieja.
 */
export const contractsSourceAlias = {
  '@adoptafacil/contracts': fileURLToPath(
    new URL('../../packages/contracts/src/index.ts', import.meta.url),
  ),
};

export default defineConfig({
  plugins: [react()],
  resolve: { alias: contractsSourceAlias },
  // Vite's envDir defaults to the project root (this folder, apps/web), but
  // the repo keeps a single .env at the monorepo root (see `pnpm setup:env`).
  // Without this, VITE_* vars set only at the root (e.g. VITE_GOOGLE_CLIENT_ID)
  // are silently invisible to the browser bundle — no error, just undefined.
  envDir: '../..',
  css: {
    preprocessorOptions: {
      scss: {
        // Vite 5 defaults to Sass's legacy JS API, which Dart Sass deprecated:
        // it prints a "legacy-js-api" warning for every .scss module (~100 per
        // cold page load here) and spins up a fresh compiler per file.
        // 'modern-compiler' keeps one long-lived compiler for the whole dev
        // session — no warnings and much cheaper per file, which matters on
        // slower filesystems such as WSL.
        api: 'modern-compiler',
        // `@import` is also deprecated (Dart Sass 3). Our shared tokens still
        // use it; migrating to @use is a separate change, so keep the dev log
        // readable until then.
        silenceDeprecations: ['import'],
      },
    },
  },
  server: {
    port: 5173,
    strictPort: false,
    // TEMPORARY (client demo via a single ngrok tunnel on the free plan, which
    // only allows one public endpoint): proxy /api/* to the local API so the
    // browser only ever talks to ONE origin (the tunnel's), avoiding CORS and
    // cross-origin cookie issues entirely. `allowedHosts: true` disables Vite's
    // DNS-rebinding host check so the ngrok hostname isn't rejected. Revert
    // both once the demo is over — not needed for normal local dev.
    allowedHosts: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
});
