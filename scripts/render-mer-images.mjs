/* global window, document */
// Dibuja los diagramas de docs/diccionario-datos/mer/*.mmd como SVG y PNG con el
// Chromium de Playwright y arma mer.docx. Corre después de
// scripts/generate-data-dictionary.mjs. Requiere pandoc para el Word.
//
//   MERMAID_JS=/ruta/a/mermaid.min.js node scripts/render-mer-images.mjs
// (mermaid.min.js sale de `npm pack mermaid@11.4.1`; no es dependencia del repo).
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MER = join(ROOT, 'docs', 'diccionario-datos', 'mer');
const mermaidJs = process.env.MERMAID_JS;
if (!mermaidJs) throw new Error('Falta MERMAID_JS (ruta a mermaid.min.js).');
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const diagrams = JSON.parse(readFileSync(join(MER, 'index.json'), 'utf8'));
const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });
await page.setContent(
  '<!doctype html><html><body style="margin:0;background:#fff"><div id="out"></div></body></html>',
);
await page.addScriptTag({ content: readFileSync(mermaidJs, 'utf8') });
await page.evaluate(() =>
  window.mermaid.initialize({
    startOnLoad: false,
    theme: 'default',
    maxTextSize: 900000,
    maxEdges: 2000,
    securityLevel: 'strict',
    er: { useMaxWidth: false, layoutDirection: 'TB' },
  }),
);

const pngs = [];
for (const d of diagrams) {
  const src = readFileSync(join(MER, `mer-${d.id}.mmd`), 'utf8');
  const svg = await page.evaluate(
    async ({ id, src }) => {
      const { svg } = await window.mermaid.render(`m-${id}`, src);
      document.getElementById('out').innerHTML = svg;
      return svg;
    },
    { id: d.id, src },
  );
  writeFileSync(join(MER, `mer-${d.id}.svg`), svg);
  const el = await page.$('#out svg');
  const png = await el.screenshot({ type: 'png' });
  writeFileSync(join(MER, `mer-${d.id}.png`), png);
  pngs.push({ ...d, png });
  console.log('ok', d.id);
}
await browser.close();

const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>MER</title></head><body>
<h1>Modelo Entidad–Relación (MER) — AdoptaFácil V2.0</h1>
<p>Notación crow's foot. Línea continua: clave foránea física; punteada: referencia lógica sin FK.</p>
${pngs.map((p) => `<h2>${p.title}</h2><p><img src="data:image/png;base64,${p.png.toString('base64')}" /></p>`).join('\n')}
</body></html>`;
execFileSync('pandoc', ['-f', 'html', '-o', join(ROOT, 'docs', 'diccionario-datos', 'mer.docx')], {
  input: html,
  maxBuffer: 1 << 30,
});
console.log('mer.docx listo');
