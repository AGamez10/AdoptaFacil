// Sirve el build de producción de la web (apps/web/dist) como lo hace Caddy en
// producción, con la MISMA Content-Security-Policy aplicada que trae
// deploy/Caddyfile, y pasa /api/* a la API quitando el prefijo. Así el
// recorrido detecta en un navegador real cualquier recurso que la CSP rompería.
// Solo escucha en 127.0.0.1. Ver README.md de esta carpeta.
import { existsSync, readFileSync, statSync } from 'node:fs';
import http from 'node:http';
import { extname, join, normalize } from 'node:path';

const PORT = Number(process.env.WEB_PORT ?? 5180);
const API = new URL(process.env.API_URL ?? 'http://127.0.0.1:3000');
const DIST = process.env.WEB_DIST ?? join(process.cwd(), 'apps/web/dist');
const caddy = readFileSync(join(process.cwd(), 'deploy/Caddyfile'), 'utf8');
const match = /^\s*header Content-Security-Policy "([^"]+)"/m.exec(caddy);
if (!match) {
  console.error('[web] deploy/Caddyfile no aplica una Content-Security-Policy');
  process.exit(2);
}
export const CSP = match[1];

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain',
  '.xml': 'application/xml',
  '.mp4': 'video/mp4',
};

/** try_files {path} {path}/index.html /app.html (como el Caddyfile). */
function resolveFile(pathname) {
  const safe = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, '');
  for (const candidate of [safe, join(safe, 'index.html')]) {
    const file = join(DIST, candidate);
    if (file.startsWith(DIST) && existsSync(file) && statSync(file).isFile()) return file;
  }
  return join(DIST, 'app.html');
}

http
  .createServer((req, res) => {
    const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
    if (url.pathname.startsWith('/api/')) {
      const upstream = http.request(
        {
          host: API.hostname,
          port: API.port,
          method: req.method,
          path: url.pathname.slice(4) + url.search,
          headers: { ...req.headers, host: API.host },
        },
        (up) => {
          res.writeHead(up.statusCode ?? 502, up.headers);
          up.pipe(res);
        },
      );
      upstream.on('error', () => {
        res.writeHead(502);
        res.end();
      });
      return req.pipe(upstream);
    }
    const file = resolveFile(url.pathname);
    res.writeHead(200, {
      'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream',
      'Content-Security-Policy': CSP,
      'X-Frame-Options': 'DENY',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(readFileSync(file));
  })
  .listen(PORT, '127.0.0.1', () => console.log(`[web] http://127.0.0.1:${PORT} (CSP aplicada)`));
