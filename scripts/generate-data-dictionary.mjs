// Regenera el diccionario de datos y el MER (docs/diccionario-datos/) a partir
// de la base de datos REAL ya migrada y de los comentarios `///` del esquema
// Prisma. Así el documento nunca describe tablas que ya no existen.
//
// Requiere pandoc para el Word.
// Uso (con una base local migrada: `pnpm --filter @adoptafacil/api prisma migrate deploy`):
//   DATABASE_URL=postgresql://... node scripts/generate-data-dictionary.mjs
// Después: `node scripts/render-mer-images.mjs` para los SVG/PNG y el Word del MER.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'docs', 'diccionario-datos');
const require = createRequire(join(ROOT, 'apps', 'api', 'package.json'));
const { PrismaClient, Prisma } = require('@prisma/client');

const MODULES = {
  org: 'Organizaciones, identidad y seguridad (M01)',
  animals: 'Animales y expediente clínico (M03)',
  adoptions: 'Adopciones (M04)',
  donations: 'Donaciones (M05)',
  campaigns: 'Campañas (M06)',
  sponsorships: 'Apadrinamientos (M07)',
  volunteering: 'Voluntariado (M08)',
  resources: 'Banco de recursos (M09)',
  marketplace: 'Marketplace (M10)',
  community: 'Comunidad (M11)',
  reputation: 'Reputación y reseñas (M12)',
  dashboards: 'Dashboards (M13)',
  portals: 'Portales públicos (M14)',
  payments: 'Pagos con Mercado Pago (cuenta de cada organización)',
  ledger: 'Libro auxiliar de donaciones',
  accounting: 'Contabilidad de la organización',
  reports: 'Informes',
  billing: 'Planes y suscripciones de AdoptaFácil',
  legal: 'Textos legales y consentimientos',
  notifications: 'Notificaciones',
  'platform-workspace': 'Espacio de trabajo de la plataforma',
  schema: 'Sistema',
};

const GENERIC = {
  id: 'Identificador único del registro (UUID).',
  organization_id: 'Organización (tenant) propietaria del registro; base del aislamiento por RLS.',
  created_at: 'Fecha y hora de creación (UTC).',
  updated_at: 'Fecha y hora de la última actualización (UTC).',
};

const DEL = { a: 'NO ACTION', r: 'RESTRICT', c: 'CASCADE', n: 'SET NULL', d: 'SET DEFAULT' };
const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

// Modelo Prisma → archivo (módulo) que lo declara.
const SCHEMA_DIR = join(ROOT, 'prisma', 'schema');
const modelFile = new Map();
for (const f of readdirSync(SCHEMA_DIR).filter((x) => x.endsWith('.prisma'))) {
  for (const m of readFileSync(join(SCHEMA_DIR, f), 'utf8').matchAll(/^model\s+(\w+)\s*\{/gm)) {
    modelFile.set(m[1], f.replace(/\.prisma$/, ''));
  }
}
const modelByTable = new Map();
for (const m of Prisma.dmmf.datamodel.models) modelByTable.set(m.dbName ?? m.name, m);

const db = new PrismaClient();
// Consultas fijas, sin valores del usuario: plantilla etiquetada (parametrizada).
const q = (strings, ...values) => db.$queryRaw(strings, ...values);

const tables = await q`
  SELECT c.relname AS name, c.relrowsecurity AS rls, c.relforcerowsecurity AS force,
         COALESCE((SELECT string_agg(p.polname, ', ' ORDER BY p.polname) FROM pg_policy p WHERE p.polrelid = c.oid), '') AS policies
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind IN ('r','p') AND c.relname <> '_prisma_migrations'
  ORDER BY c.relname`;
const columns = await q`
  SELECT table_name AS t, column_name AS c, ordinal_position::int AS pos, is_nullable = 'YES' AS nullable,
         column_default AS def,
         CASE WHEN data_type = 'USER-DEFINED' THEN udt_name
              WHEN data_type = 'ARRAY' THEN substr(udt_name, 2) || '[]'
              WHEN data_type LIKE 'timestamp%' THEN 'timestamp(' || datetime_precision || ')' || CASE WHEN data_type LIKE '%with time zone' THEN ' tz' ELSE '' END
              WHEN data_type = 'character varying' THEN 'varchar' || COALESCE('(' || character_maximum_length || ')', '')
              WHEN data_type = 'numeric' AND numeric_precision IS NOT NULL THEN 'numeric(' || numeric_precision || ',' || numeric_scale || ')'
              ELSE data_type END AS type
  FROM information_schema.columns WHERE table_schema = 'public' ORDER BY table_name, ordinal_position`;
const constraints = await q`
  SELECT cl.relname AS t, co.conname AS name, co.contype AS kind, pg_get_constraintdef(co.oid) AS def,
         ARRAY(SELECT a.attname::text FROM unnest(co.conkey) WITH ORDINALITY k(n, o) JOIN pg_attribute a ON a.attrelid = co.conrelid AND a.attnum = k.n ORDER BY k.o) AS cols,
         rf.relname AS ref_table,
         ARRAY(SELECT a.attname::text FROM unnest(co.confkey) WITH ORDINALITY k(n, o) JOIN pg_attribute a ON a.attrelid = co.confrelid AND a.attnum = k.n ORDER BY k.o) AS ref_cols,
         co.confdeltype AS on_delete
  FROM pg_constraint co JOIN pg_class cl ON cl.oid = co.conrelid JOIN pg_namespace n ON n.oid = cl.relnamespace
  LEFT JOIN pg_class rf ON rf.oid = co.confrelid
  WHERE n.nspname = 'public' ORDER BY cl.relname, co.conname`;
const indexes = await q`
  SELECT tablename AS t, indexname AS name, indexdef AS def FROM pg_indexes
  WHERE schemaname = 'public' ORDER BY tablename, indexname`;
await db.$disconnect();

const tableNames = new Set(tables.map((t) => t.name));
const byTable = (rows) => {
  const m = new Map();
  for (const r of rows) (m.get(r.t) ?? m.set(r.t, []).get(r.t)).push(r);
  return m;
};
const colsBy = byTable(columns);
const consBy = byTable(constraints);
const idxBy = byTable(indexes);

const fks = constraints.filter((c) => c.kind === 'f');
const fkCols = new Map(); // "t.c" → fk
for (const fk of fks) if (fk.cols.length === 1) fkCols.set(`${fk.t}.${fk.cols[0]}`, fk);

// Referencias lógicas: columnas uuid *_id sin FK física cuyo destino se deduce por nombre.
function logicalTarget(col) {
  if (!col.endsWith('_id') || col === 'id') return null;
  if (col.endsWith('user_id') || col === 'mp_user_id') return col === 'mp_user_id' ? null : 'users';
  const base = col.slice(0, -3);
  for (const cand of [`${base}s`, `${base}es`, base.replace(/y$/, 'ies')])
    if (tableNames.has(cand)) return cand;
  const last = base.split('_').pop();
  for (const cand of [`${last}s`, `${last}es`]) if (tableNames.has(cand)) return cand;
  return null;
}
const logical = [];
for (const c of columns) {
  if (c.type !== 'uuid' || fkCols.has(`${c.t}.${c.c}`)) continue;
  const target = logicalTarget(c.c);
  if (target && target !== c.t)
    logical.push({ t: c.t, c: c.c, ref_table: target, nullable: c.nullable });
}

// Agrupación por módulo.
const moduleOf = (t) => {
  const model = modelByTable.get(t);
  return (model && modelFile.get(model.name)) || 'schema';
};
const groups = new Map(Object.keys(MODULES).map((k) => [k, []]));
for (const t of tables) groups.get(moduleOf(t.name)).push(t);
for (const [k, v] of groups) if (v.length === 0) groups.delete(k);

function describeDefault(t, c) {
  const model = modelByTable.get(t);
  const field = model?.fields.find((f) => (f.dbName ?? f.name) === c.c);
  if (field?.isUpdatedAt) return '(actualizado por la app)';
  if (c.def) return c.def.replace(/::[a-z_ ]+(\[\])?/gi, '');
  const d = field?.default;
  if (d && typeof d === 'object' && d.name) return `${d.name}() (app)`;
  return '';
}
function keysOf(t, c, cons) {
  const k = [];
  if (cons.some((x) => x.kind === 'p' && x.cols.includes(c))) k.push('PK');
  if (cons.some((x) => x.kind === 'f' && x.cols.includes(c))) k.push('FK');
  if (cons.some((x) => x.kind === 'u' && x.cols.length === 1 && x.cols[0] === c)) k.push('UK');
  if (
    (idxBy.get(t) ?? []).some(
      (i) =>
        /CREATE UNIQUE INDEX/.test(i.def) &&
        !/ WHERE /.test(i.def) &&
        new RegExp(`\\(${c}\\)$`).test(i.def),
    )
  ) {
    if (!k.includes('UK') && !k.includes('PK')) k.push('UK');
  }
  return k.join(', ');
}

const generatedOn = new Date().toISOString().slice(0, 10);
const totalCols = columns.filter((c) => tableNames.has(c.t)).length;
const rlsCount = tables.filter((t) => t.rls).length;

// ---------------------------------------------------------------- diccionario
let nav = '';
let body = '';
for (const [mod, list] of groups) {
  nav += `<a class="m" href="#${mod}">${esc(MODULES[mod])}</a>`;
  body += `<h2 id="${mod}">${esc(MODULES[mod])}</h2>`;
  for (const t of list) {
    nav += `<a class="t" data-n="${t.name}" href="#t-${t.name}">${t.name}</a>`;
    const model = modelByTable.get(t.name);
    const cons = consBy.get(t.name) ?? [];
    const rls = t.rls
      ? `Sí (ENABLE${t.force ? ' + FORCE' : ''}${t.policies ? `, ${esc(t.policies)}` : ''})`
      : 'No (tabla global o de plataforma)';
    body += `<h3 id="t-${t.name}">${t.name}</h3><div class="meta"><b>Modelo Prisma:</b> ${esc(model?.name ?? '—')} · <b>RLS:</b> ${rls}${model?.documentation ? `<br>${esc(model.documentation)}` : ''}</div>`;
    body +=
      '<div class="w"><table><thead><tr><th>Columna</th><th>Tipo</th><th>Nulo</th><th>Clave</th><th>Por defecto</th><th>Descripción</th></tr></thead><tbody>';
    for (const c of colsBy.get(t.name) ?? []) {
      const field = model?.fields.find((f) => (f.dbName ?? f.name) === c.c);
      const desc = field?.documentation ?? GENERIC[c.c] ?? '—';
      body += `<tr><td class="c">${c.c}</td><td class="c">${esc(c.type)}</td><td>${c.nullable ? 'Sí' : 'No'}</td><td class="k">${keysOf(t.name, c.c, cons)}</td><td class="c">${esc(describeDefault(t.name, c))}</td><td>${esc(desc)}</td></tr>`;
    }
    body += '</tbody></table></div>';
    const tFks = cons.filter((x) => x.kind === 'f');
    if (tFks.length)
      body += `<div><b>Claves foráneas:</b><ul>${tFks.map((f) => `<li><code>${f.cols.join(', ')} → ${f.ref_table}(${f.ref_cols.join(', ')}) · ON DELETE ${DEL[f.on_delete]}</code></li>`).join('')}</ul></div>`;
    const idx = (idxBy.get(t.name) ?? []).filter(
      (i) => !cons.some((x) => x.kind === 'p' && x.name === i.name),
    );
    const checks = cons.filter((x) => x.kind === 'c');
    if (idx.length || checks.length) {
      body += '<div><b>Índices y restricciones:</b><ul>';
      for (const i of idx) {
        const unique = /CREATE UNIQUE INDEX/.test(i.def);
        const m = i.def.match(/USING \w+ \((.*?)\)(?: WHERE (.*))?$/);
        body += `<li>${unique ? 'Único' : 'Índice'}: <code>${esc(m ? m[1] : i.def)}</code>${m?.[2] ? ` solo donde <code>${esc(m[2])}</code>` : ''}</li>`;
      }
      for (const c of checks)
        body += `<li>Regla <code>${esc(c.name)}</code>: <code>${esc(c.def)}</code></li>`;
      body += '</ul></div>';
    }
  }
}
nav += '<a class="m" href="#relaciones">Relaciones (FK)</a>';
body +=
  '<h2 id="relaciones">Relaciones (claves foráneas)</h2><div class="w"><table><thead><tr><th>Tabla origen</th><th>Columna</th><th>Tabla referenciada</th><th>Columna ref.</th><th>ON DELETE</th></tr></thead><tbody>';
for (const f of fks)
  body += `<tr><td class="c">${f.t}</td><td class="c">${f.cols.join(', ')}</td><td class="c">${f.ref_table}</td><td class="c">${f.ref_cols.join(', ')}</td><td>${DEL[f.on_delete]}</td></tr>`;
body += '</tbody></table></div>';

const STYLE = `:root{--bg:#fff;--fg:#1f2937;--mut:#6b7280;--bd:#e5e7eb;--hd:#0f766e;--soft:#f0fdfa;--code:#f3f4f6}
@media(prefers-color-scheme:dark){:root{--bg:#111827;--fg:#e5e7eb;--mut:#9ca3af;--bd:#374151;--hd:#2dd4bf;--soft:#0b2a28;--code:#1f2937}}
*{box-sizing:border-box}body{margin:0;font:14px/1.5 system-ui,Segoe UI,sans-serif;background:var(--bg);color:var(--fg);display:flex}
nav{position:sticky;top:0;height:100vh;overflow:auto;width:290px;flex:none;border-right:1px solid var(--bd);padding:16px;font-size:13px}
nav input{width:100%;padding:6px 8px;border:1px solid var(--bd);border-radius:6px;background:var(--bg);color:var(--fg);margin-bottom:10px}
nav a{display:block;color:var(--fg);text-decoration:none;padding:2px 0}nav a:hover{color:var(--hd)}nav .m{font-weight:600;margin-top:10px;color:var(--hd)}nav .t{padding-left:12px;color:var(--mut)}
main{flex:1;min-width:0;padding:24px 32px;max-width:1200px}h1{margin:0 0 4px;color:var(--hd)}h2{border-bottom:2px solid var(--hd);padding-bottom:4px;margin-top:40px}
h3{margin:28px 0 4px;font-family:ui-monospace,Consolas,monospace}.mut{color:var(--mut)}.meta{background:var(--soft);padding:8px 12px;border-radius:6px;margin:8px 0;font-size:13px}
.w{overflow-x:auto}table{border-collapse:collapse;width:100%;font-size:13px;margin:8px 0}th,td{border:1px solid var(--bd);padding:4px 8px;text-align:left;vertical-align:top}th{background:var(--soft)}
td.c,code{font-family:ui-monospace,Consolas,monospace;font-size:12px}td.k{font-weight:600;color:var(--hd)}code{background:var(--code);padding:1px 4px;border-radius:4px}
.stats{display:flex;gap:12px;flex-wrap:wrap;margin:16px 0}.stats div{border:1px solid var(--bd);border-radius:8px;padding:8px 14px}.stats b{display:block;font-size:20px;color:var(--hd)}
@media(max-width:800px){body{display:block}nav{position:static;height:auto;width:auto;border-right:0;border-bottom:1px solid var(--bd)}main{padding:16px}}
@media print{nav{display:none}}`;

const intro = `<h1>Diccionario de Datos — AdoptaFácil V2.0</h1>
<div class="mut">Base de datos PostgreSQL 16 · Generado el ${generatedOn} desde la base migrada (<code>prisma/migrations</code>) y los comentarios de <code>prisma/schema/*.prisma</code> con <code>scripts/generate-data-dictionary.mjs</code></div>
<div class="stats"><div><b>${tables.length}</b>tablas</div><div><b>${totalCols}</b>columnas</div><div><b>${fks.length}</b>claves foráneas</div><div><b>${rlsCount}</b>tablas con RLS</div><div><b>${groups.size}</b>módulos</div></div>
<h2 id="intro">Convenciones</h2><ul><li>Plataforma <b>multi-tenant</b>: toda tabla de negocio lleva <code>organization_id</code> y RLS (<code>ENABLE</code> + <code>FORCE</code> + política <code>tenant_isolation</code>). El runtime conecta con el rol no-superusuario <code>adoptafacil_app</code>.</li>
<li>Fechas en <b>UTC</b>; la hora Colombia solo se aplica en presentación.</li><li>Claves: <b>PK</b> primaria, <b>FK</b> foránea, <b>UK</b> única. Los estados se guardan como texto (sin enums de BD).</li>
<li>Dinero: AdoptaFácil no custodia donaciones ni cobra comisión por ellas (0 %). Cada donación se cobra con la cuenta de Mercado Pago de la propia organización.</li>
<li>Las descripciones provienen de los comentarios del esquema; “—” indica columna sin comentario. Las columnas <code>jsonb</code> contienen estructuras definidas en <code>packages/contracts</code>.</li></ul>`;

const dictHtml = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Diccionario de Datos — AdoptaFácil V2.0</title><style>
${STYLE}</style></head><body><nav><input id="q" placeholder="Buscar tabla…"><div id="ix">${nav}</div></nav><main>${intro}${body}
</main><script>const q=document.getElementById('q');q.oninput=()=>{const v=q.value.toLowerCase();document.querySelectorAll('nav a.t').forEach(a=>a.style.display=a.dataset.n.includes(v)?'':'none')}</script></body></html>
`;
writeFileSync(join(OUT, 'diccionario-datos.html'), dictHtml);
// Word con pandoc (comprime y respeta las tablas).
execFileSync(
  'pandoc',
  [
    '-f',
    'html',
    '-o',
    join(OUT, 'diccionario-datos.docx'),
    '--metadata',
    'title=Diccionario de Datos — AdoptaFácil V2.0',
  ],
  {
    input: `<!doctype html><html lang="es"><head><meta charset="utf-8"></head><body>${intro.replace(/<h1>.*?<\/h1>/, '')}${body}</body></html>`,
  },
);

// ---------------------------------------------------------------- MER (Mermaid)
const mType = (t) =>
  t
    .replace(/\(.*?\)/g, '')
    .replace(/\[\]/, '_array')
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/gi, '') || 'text';
function entity(t, full) {
  const cons = consBy.get(t) ?? [];
  const lines = [];
  for (const c of colsBy.get(t) ?? []) {
    const k = keysOf(t, c.c, cons).replace(/ /g, '');
    if (!full && !/PK|FK/.test(k)) continue;
    lines.push(`    ${mType(c.type)} ${c.c}${k ? ` ${k}` : ''}`);
  }
  return `  ${t} {\n${lines.join('\n')}\n  }`;
}
function card(nullable, unique) {
  return `${nullable ? '|o' : '||'}--${unique ? 'o|' : 'o{'}`;
}
const isUniqueCol = (t, c) => /UK|PK/.test(keysOf(t, c, consBy.get(t) ?? []));
function relLine(r, isLogical) {
  const col = columns.find((x) => x.t === r.t && x.c === (r.cols?.[0] ?? r.c));
  const uniq = isUniqueCol(r.t, r.cols?.[0] ?? r.c);
  const op = card(col?.nullable, uniq);
  return isLogical
    ? `  ${r.ref_table} ${op.replace('--', '..')} ${r.t} : "${r.c} (lógica)"`
    : `  ${r.ref_table} ${op} ${r.t} : "${r.cols.join(', ')}"`;
}

const merDir = join(OUT, 'mer');
rmSync(merDir, { recursive: true, force: true });
mkdirSync(merDir, { recursive: true });
const diagrams = [];
// Vista general: todas las tablas solo con PK/FK, FK físicas y lógicas entre tablas (sin users).
{
  const parts = ['erDiagram', ...tables.map((t) => entity(t.name, false))];
  for (const f of fks) parts.push(relLine(f, false));
  for (const l of logical) if (l.ref_table !== 'users') parts.push(relLine(l, true));
  diagrams.push({ id: 'general', title: 'Vista general', src: parts.join('\n') });
}
for (const [mod, list] of groups) {
  const own = new Set(list.map((t) => t.name));
  const rel = fks.filter((f) => own.has(f.t) || own.has(f.ref_table));
  const lrel = logical.filter((l) => own.has(l.t));
  const others = new Set(
    [...rel, ...lrel].flatMap((r) => [r.t, r.ref_table]).filter((x) => !own.has(x)),
  );
  const parts = [
    'erDiagram',
    ...list.map((t) => entity(t.name, true)),
    ...[...others].sort().map((t) => entity(t, false)),
  ];
  for (const f of rel) parts.push(relLine(f, false));
  for (const l of lrel) parts.push(relLine(l, true));
  diagrams.push({ id: mod, title: MODULES[mod], src: parts.join('\n') });
}
for (const d of diagrams) writeFileSync(join(merDir, `mer-${d.id}.mmd`), `${d.src}\n`);

const merHtml = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>MER — AdoptaFácil V2.0</title><style>
:root{--bg:#fff;--fg:#1f2937;--mut:#6b7280;--bd:#e5e7eb;--hd:#0f766e;--soft:#f0fdfa}
@media(prefers-color-scheme:dark){:root{--bg:#111827;--fg:#e5e7eb;--mut:#9ca3af;--bd:#374151;--hd:#2dd4bf;--soft:#0b2a28}}
*{box-sizing:border-box}body{margin:0;font:14px/1.5 system-ui,Segoe UI,sans-serif;background:var(--bg);color:var(--fg)}
header{padding:20px 32px 8px}h1{margin:0;color:var(--hd)}.mut{color:var(--mut)}
nav{position:sticky;top:0;background:var(--bg);border-bottom:1px solid var(--bd);padding:8px 32px;display:flex;flex-wrap:wrap;gap:4px 14px;font-size:13px;z-index:2}
nav a{color:var(--hd);text-decoration:none}section{padding:8px 32px 24px}h2{border-bottom:2px solid var(--hd);padding-bottom:4px}
.note{background:var(--soft);border-radius:6px;padding:8px 12px;font-size:13px;margin:8px 0}.box{overflow:auto;border:1px solid var(--bd);border-radius:8px;background:#fff;padding:8px}
.tools{margin:6px 0}.tools button{margin-right:4px}pre.mermaid{margin:0}
@media(max-width:800px){header,nav,section{padding-left:16px;padding-right:16px}}</style></head><body>
<header><h1>Modelo Entidad–Relación (MER) — AdoptaFácil V2.0</h1>
<div class="mut">PostgreSQL 16 · ${tables.length} tablas · ${fks.length} claves foráneas + ${logical.length} referencias lógicas · generado el ${generatedOn} desde la base migrada</div>
<div class="note"><b>Notación (crow's foot):</b> <code>||</code> exactamente uno · <code>|o</code> cero o uno · <code>o{</code> cero o muchos. Padre → hijo; la etiqueta es la columna FK.
Línea continua = clave foránea <b>física</b>; línea punteada (<code>(lógica)</code>) = referencia sin FK en la base de datos (las referencias a <code>users</code> solo se dibujan en los diagramas por módulo). En los diagramas por módulo, las tablas de otros módulos aparecen solo con PK/FK. Imágenes estáticas en <code>mer/*.svg</code> y <code>mer/*.png</code>.</div></header>
<nav>${diagrams.map((d) => `<a href="#${d.id}">${esc(d.title)}</a>`).join('')}</nav>
${diagrams.map((d) => `<section id="${d.id}"><h2>${esc(d.title)}</h2><div class="tools"><button data-z="0.8">−</button><button data-z="1.25">+</button><button data-z="reset">100%</button></div><div class="box"><pre class="mermaid">${esc(d.src)}</pre></div></section>`).join('\n')}
<script type="module">
import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@11.4.1/dist/mermaid.esm.min.mjs';
mermaid.initialize({startOnLoad:false,theme:'default',maxTextSize:900000,maxEdges:2000,er:{useMaxWidth:false,layoutDirection:'TB'},securityLevel:'strict'});
let n=0;for(const el of document.querySelectorAll('pre.mermaid')){try{const {svg}=await mermaid.render('mer'+(n++),el.textContent);el.innerHTML=svg;}catch(e){el.innerHTML='<b style="color:#b91c1c">Error al renderizar: '+String(e.message||e).replace(/</g,'&lt;')+'</b>'}}
document.querySelectorAll('.tools button').forEach(b=>b.onclick=()=>{const s=b.closest('section').querySelector('svg');if(!s)return;const w=s.dataset.w||s.getBoundingClientRect().width;s.dataset.w=w;
 const cur=parseFloat(s.dataset.k||1);const k=b.dataset.z=='reset'?1:cur*parseFloat(b.dataset.z);s.dataset.k=k;s.style.width=(w*k)+'px';s.style.maxWidth='none';s.style.height='auto'});
</script></body></html>
`;
writeFileSync(join(OUT, 'mer.html'), merHtml);
writeFileSync(
  join(merDir, 'index.json'),
  `${JSON.stringify(
    diagrams.map(({ id, title }) => ({ id, title })),
    null,
    2,
  )}\n`,
);
console.log(
  `${tables.length} tablas, ${totalCols} columnas, ${fks.length} FK, ${logical.length} lógicas, ${diagrams.length} diagramas`,
);
