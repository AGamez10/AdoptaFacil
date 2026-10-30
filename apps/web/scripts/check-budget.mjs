/**
 * Presupuesto de peso de la primera carga (landing y páginas públicas).
 * Corre después de `pnpm build` y falla si el JS o el CSS que el navegador
 * baja antes de pintar (lo que enlaza `dist/index.html`) supera el límite
 * comprimido con gzip. three.js nunca debe estar ahí: se baja aparte, solo en
 * equipos capaces y cuando la sección de la red se acerca a la pantalla.
 *
 *   pnpm --filter @adoptafacil/web budget
 */
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const BUDGET_KB = { js: 225, css: 30 };

const dist = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const html = await readFile(join(dist, 'index.html'), 'utf8');
const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+\.(js|css))"/g)].map((m) => ({
  path: m[1],
  kind: m[2],
}));

const totals = { js: 0, css: 0 };
let failed = false;
for (const asset of assets) {
  const size = gzipSync(await readFile(join(dist, asset.path))).length / 1024;
  totals[asset.kind] += size;
  console.log(`  ${asset.path.padEnd(42)} ${size.toFixed(1).padStart(7)} KB gzip`);
  if (/three/i.test(asset.path)) {
    console.error(`✗ ${asset.path}: three.js no puede ir en la primera carga.`);
    failed = true;
  }
}
for (const kind of ['js', 'css']) {
  const ok = totals[kind] <= BUDGET_KB[kind];
  console.log(
    `${ok ? '✓' : '✗'} ${kind.toUpperCase()} inicial: ${totals[kind].toFixed(1)} KB de ${BUDGET_KB[kind]} KB`,
  );
  if (!ok) failed = true;
}
process.exit(failed ? 1 : 0);
