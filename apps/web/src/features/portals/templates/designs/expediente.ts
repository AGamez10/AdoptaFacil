import { COPY, EMPTY } from '../engine/model';
import { availLine, fmt, ic, logoMark, portrait, qs, qsa } from '../engine/runtime';
import type { TemplateDesign } from '../engine/types';

const CSS = `
.tpl-expediente{--ink:#0E0F11;--soft:#5A5F66;--hair:#D7D9DC;--bg:#F4F5F6;--card:#FFFFFF;--ok:#0F8A6A;--k-r:6px;--k-tint:#ECEEF0;--k-line:var(--hair);--k-soft:var(--soft);--k-ink:var(--ink);--k-sh:0 0 0 1px var(--hair);--k-ls:-.035em;font-family:'Archivo',system-ui,sans-serif;font-stretch:100%;color:var(--ink);background:var(--bg)}
.tpl-expediente a{color:inherit}
.tpl-expediente .x-mono{font-family:'JetBrains Mono',ui-monospace,monospace;font-variant-numeric:tabular-nums}
.tpl-expediente .x-lab{font-family:'JetBrains Mono',ui-monospace,monospace;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--soft)}
.tpl-expediente .x-grid-bg{position:absolute;inset:0;pointer-events:none;display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:24px}
.tpl-expediente .x-grid-bg i{border-left:1px solid var(--hair);border-right:1px solid var(--hair);opacity:.55;transform-origin:top;animation:xDraw 1.2s cubic-bezier(.7,0,.2,1) both}
@keyframes xDraw{from{transform:scaleY(0)}}
.tpl-expediente .x-hdr{position:sticky;top:env(safe-area-inset-top,0px);z-index:40;background:var(--ink);color:#fff}
.tpl-expediente .x-hdr .w{display:flex;align-items:center;justify-content:space-between;gap:16px;padding-block:12px}
.tpl-expediente .x-id{display:flex;align-items:center;gap:14px}
.tpl-expediente .x-id i{width:36px;height:36px;background:var(--brand);color:var(--brand-ink);display:grid;place-items:center;font-style:normal;font-weight:900;font-size:13px}
.tpl-expediente .x-id b{font-weight:800;font-stretch:112%;letter-spacing:.02em;text-transform:uppercase;font-size:14px}
.tpl-expediente .x-hdr nav{display:flex;gap:2px}
.tpl-expediente .x-hdr nav a{font-family:'JetBrains Mono',monospace;font-size:12px;text-transform:uppercase;letter-spacing:.06em;text-decoration:none;padding:10px 12px;border:1px solid transparent}
.tpl-expediente .x-hdr nav a:hover{border-color:rgba(255,255,255,.3)}
.tpl-expediente .x-live{display:inline-flex;align-items:center;gap:8px;font-family:'JetBrains Mono',monospace;font-size:12px;letter-spacing:.06em;color:#7FE3C4}
.tpl-expediente .x-live::before{content:"";width:8px;height:8px;border-radius:50%;background:#2BD49F;box-shadow:0 0 0 0 rgba(43,212,159,.7);animation:xPulse 2s infinite}
@keyframes xPulse{70%{box-shadow:0 0 0 8px rgba(43,212,159,0)}100%{box-shadow:0 0 0 0 rgba(43,212,159,0)}}
@media (max-width:900px){.tpl-expediente .x-hdr nav{display:none}}

.tpl-expediente .x-hero{position:relative;padding-block:64px 80px;border-bottom:1px solid var(--hair)}
.tpl-expediente .x-hero .w{position:relative}
.tpl-expediente .x-hero-in{position:relative;display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:24px;align-items:center}
.tpl-expediente .x-hero .t{grid-column:1/8;display:flex;flex-direction:column;gap:22px}
.tpl-expediente .x-h1{font-weight:900;font-stretch:125%;text-transform:uppercase;font-size:clamp(40px,5.8vw,92px);line-height:.88;letter-spacing:-.02em}
.tpl-expediente .x-h1 span{display:block;overflow:hidden}
.tpl-expediente .x-h1 span b{display:block;font-weight:inherit;animation:xUp .9s cubic-bezier(.2,.8,.2,1) both}
@keyframes xUp{from{transform:translateY(102%)}}
.tpl-expediente .x-row{display:flex;flex-wrap:wrap;gap:0;border:1px solid var(--ink);background:var(--card);align-self:flex-start}
.tpl-expediente .x-row div{padding:12px 16px;display:flex;flex-direction:column;gap:4px}
.tpl-expediente .x-row div + div{border-left:1px solid var(--ink)}
.tpl-expediente .x-row b{font-family:'JetBrains Mono',monospace;font-size:20px;font-weight:600}
.tpl-expediente .x-btn{display:inline-flex;align-items:center;justify-content:center;gap:12px;min-height:54px;padding:0 24px;background:var(--ink);color:#fff!important;text-decoration:none;font-weight:800;font-stretch:112%;text-transform:uppercase;letter-spacing:.04em;font-size:14px;border:0;cursor:pointer;transition:background .25s}
.tpl-expediente .x-btn svg{width:18px}
.tpl-expediente .x-btn:hover{background:var(--brand)}
.tpl-expediente .x-btn.o{background:transparent;color:var(--ink)!important;box-shadow:inset 0 0 0 1.5px var(--ink)}
.tpl-expediente .x-btn.o:hover{background:var(--ink);color:#fff!important}
.tpl-expediente .x-cardwrap{grid-column:8/13;perspective:1400px;display:flex;flex-direction:column;gap:14px;align-items:center}
.tpl-expediente .x-card{width:min(100%,440px);aspect-ratio:1.586/1;position:relative;transform-style:preserve-3d;transition:transform .9s cubic-bezier(.2,.8,.2,1);cursor:pointer;border:0;padding:0;background:none;font:inherit;color:inherit;text-align:left}
.tpl-expediente .x-card.flip .x-in{transform:rotateY(180deg)}
.tpl-expediente .x-in{position:absolute;inset:0;transform-style:preserve-3d;transition:transform 1s cubic-bezier(.2,.8,.2,1)}
.tpl-expediente .x-face{position:absolute;inset:0;backface-visibility:hidden;-webkit-backface-visibility:hidden;border-radius:16px;overflow:hidden;background:var(--card);box-shadow:0 40px 80px -40px rgba(14,15,17,.55),0 0 0 1px var(--hair);padding:20px;display:flex;flex-direction:column;justify-content:space-between}
.tpl-expediente .x-face.b{transform:rotateY(180deg);background:var(--ink);color:#fff}
.tpl-expediente .x-face .band{position:absolute;left:0;right:0;top:0;height:8px;background:var(--brand)}
.tpl-expediente .x-face .glare{position:absolute;inset:0;background:linear-gradient(115deg,transparent 30%,rgba(255,255,255,.55) 45%,transparent 60%);transform:translateX(var(--gl,-60%));pointer-events:none;mix-blend-mode:soft-light}
.tpl-expediente .x-fr{display:flex;gap:16px;align-items:flex-start}
.tpl-expediente .x-fr .lg{width:64px;height:64px;background:var(--brand);color:var(--brand-ink);display:grid;place-items:center;font-weight:900;font-size:20px;flex:none}
.tpl-expediente .x-fr b{display:block;font-weight:900;font-stretch:115%;text-transform:uppercase;font-size:19px;line-height:1.05}
.tpl-expediente .x-kv{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
.tpl-expediente .x-kv span{display:block}
.tpl-expediente .x-kv b{font-family:'JetBrains Mono',monospace;font-size:13px;font-weight:600}
.tpl-expediente .x-code{display:flex;gap:2px;height:28px;align-items:stretch}
.tpl-expediente .x-code i{background:var(--ink);flex:none}
.tpl-expediente .x-stamp{position:absolute;right:18px;bottom:18px;border:3px solid var(--ok);color:var(--ok);padding:6px 12px;font-family:'JetBrains Mono',monospace;font-weight:600;font-size:13px;letter-spacing:.12em;transform:rotate(-12deg);border-radius:6px;opacity:.9}
.tpl-expediente .x-stamp.go{animation:xStamp .5s .9s cubic-bezier(.3,1.6,.5,1) both}
@keyframes xStamp{from{transform:rotate(-12deg) scale(2.4);opacity:0}}
.tpl-expediente .x-face.b ul{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:10px}
.tpl-expediente .x-face.b li{display:flex;gap:10px;align-items:center;font-size:14px}
.tpl-expediente .x-face.b li i{width:22px;height:22px;border-radius:50%;background:#2BD49F;color:var(--ink);display:grid;place-items:center;flex:none}
.tpl-expediente .x-face.b li i svg{width:13px}
@media (max-width:1000px){.tpl-expediente .x-hero-in{grid-template-columns:minmax(0,1fr)}.tpl-expediente .x-hero .t,.tpl-expediente .x-cardwrap{grid-column:1/-1}.tpl-expediente .x-grid-bg{grid-template-columns:repeat(4,minmax(0,1fr))}.tpl-expediente .x-grid-bg i:nth-child(n+5){display:none}}

.tpl-expediente .x-sec{padding-block:88px;border-bottom:1px solid var(--hair)}
.tpl-expediente .x-sh{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:24px;margin-bottom:40px;align-items:end}
.tpl-expediente .x-sh .c{grid-column:1/4}
.tpl-expediente .x-sh h2{grid-column:4/13;font-weight:900;font-stretch:120%;text-transform:uppercase;font-size:clamp(32px,4vw,60px);line-height:.92;letter-spacing:-.01em}
@media (max-width:900px){.tpl-expediente .x-sh{grid-template-columns:minmax(0,1fr)}.tpl-expediente .x-sh .c,.tpl-expediente .x-sh h2{grid-column:1/-1}}

.tpl-expediente .x-recs{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:0;border:1px solid var(--ink);background:var(--card)}
.tpl-expediente .x-rec{display:flex;flex-direction:column;text-decoration:none;position:relative}
.tpl-expediente .x-rec + .x-rec{border-left:1px solid var(--ink)}
.tpl-expediente .x-rec .top{display:flex;justify-content:space-between;padding:12px 14px;border-bottom:1px solid var(--ink)}
.tpl-expediente .x-rec .ph{aspect-ratio:1/1;overflow:hidden;position:relative;filter:grayscale(1) contrast(1.05);transition:filter .5s}
.tpl-expediente .x-rec .ph::after{content:"";position:absolute;inset:0;background:var(--brand);mix-blend-mode:color;opacity:.0;transition:opacity .5s}
.tpl-expediente .x-rec:hover .ph{filter:none}
.tpl-expediente .x-rec h3{font-weight:900;font-stretch:118%;text-transform:uppercase;font-size:28px;padding:16px 14px 6px}
.tpl-expediente .x-rec dl{margin:0;display:grid;grid-template-columns:1fr 1fr;border-top:1px solid var(--hair)}
.tpl-expediente .x-rec dl div{padding:10px 14px;border-bottom:1px solid var(--hair)}
.tpl-expediente .x-rec dl div:nth-child(odd){border-right:1px solid var(--hair)}
.tpl-expediente .x-rec dd{margin:3px 0 0;font-family:'JetBrains Mono',monospace;font-size:13px}
.tpl-expediente .x-rec .go{display:flex;justify-content:space-between;align-items:center;padding:14px;font-weight:800;font-stretch:112%;text-transform:uppercase;font-size:13px;letter-spacing:.04em;transition:background .25s,color .25s}
.tpl-expediente .x-rec .go svg{width:16px}
.tpl-expediente .x-rec:hover .go{background:var(--ink);color:#fff}
@media (max-width:1000px){.tpl-expediente .x-recs{grid-template-columns:repeat(2,minmax(0,1fr))}.tpl-expediente .x-rec:nth-child(3){border-left:0}.tpl-expediente .x-rec:nth-child(n+3){border-top:1px solid var(--ink)}}
@media (max-width:540px){.tpl-expediente .x-recs{grid-template-columns:minmax(0,1fr)}.tpl-expediente .x-rec + .x-rec{border-left:0;border-top:1px solid var(--ink)}}

.tpl-expediente .x-receipt-row{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,420px);gap:48px;align-items:start}
.tpl-expediente .x-receipt{background:var(--card);padding:28px 26px 34px;position:relative;filter:drop-shadow(0 30px 40px rgba(14,15,17,.18));--z:10px;-webkit-mask:radial-gradient(circle var(--z) at 50% 0,#0000 98%,#000) 50% 0/calc(2*var(--z) + 6px) 51% repeat-x,radial-gradient(circle var(--z) at 50% 100%,#0000 98%,#000) 50% 100%/calc(2*var(--z) + 6px) 51% repeat-x;mask:radial-gradient(circle var(--z) at 50% 0,#0000 98%,#000) 50% 0/calc(2*var(--z) + 6px) 51% repeat-x,radial-gradient(circle var(--z) at 50% 100%,#0000 98%,#000) 50% 100%/calc(2*var(--z) + 6px) 51% repeat-x;font-family:'JetBrains Mono',monospace;font-size:14px}
.tpl-expediente .x-receipt h3{font-family:'Archivo',sans-serif;font-weight:900;font-stretch:118%;text-transform:uppercase;font-size:22px;text-align:center;margin-bottom:4px}
.tpl-expediente .x-receipt .c{text-align:center;color:var(--soft);font-size:12px}
.tpl-expediente .x-receipt hr{border:0;border-top:1.5px dashed var(--hair);margin:16px 0}
.tpl-expediente .x-receipt .l{display:flex;justify-content:space-between;gap:12px;padding:5px 0}
.tpl-expediente .x-receipt .l.big{font-size:18px;font-weight:600}
.tpl-expediente .x-segs{display:grid;grid-template-columns:repeat(50,minmax(0,1fr));gap:2px;margin:14px 0 6px}
.tpl-expediente .x-segs i{height:18px;background:var(--hair);transition:background .2s}
.tpl-expediente .x-segs i.on{background:var(--brand)}
.tpl-expediente .x-amts{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px;margin-top:6px}
.tpl-expediente .x-amt{min-height:44px;border:1.5px solid var(--ink);background:transparent;font-family:'JetBrains Mono',monospace;font-size:13px;cursor:pointer;color:var(--ink)}
.tpl-expediente .x-amt[aria-pressed="true"]{background:var(--ink);color:#fff}
.tpl-expediente .x-copy{display:flex;flex-direction:column;gap:18px}
.tpl-expediente .x-copy p{font-size:18px;line-height:1.6;color:var(--soft);max-width:32em}
@media (max-width:900px){.tpl-expediente .x-receipt-row{grid-template-columns:minmax(0,1fr)}}

.tpl-expediente .x-table{border:1px solid var(--ink);background:var(--card);overflow-x:auto}
.tpl-expediente .x-table table{width:100%;border-collapse:collapse;font-size:14px;min-width:560px}
.tpl-expediente .x-table th{text-align:left;font-family:'JetBrains Mono',monospace;font-weight:400;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--soft);padding:12px 16px;border-bottom:1px solid var(--ink)}
.tpl-expediente .x-table td{padding:14px 16px;border-bottom:1px solid var(--hair)}
.tpl-expediente .x-table tr:hover td{background:#F7F8F9}
.tpl-expediente .x-empty td{padding:36px 16px;text-align:center;color:var(--soft)}
.tpl-expediente .x-ftr{background:var(--ink);color:#C9CDD2;padding-block:48px}
.tpl-expediente .x-ftr .g{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:24px;font-size:14px}
.tpl-expediente .x-ftr h4{font-family:'JetBrains Mono',monospace;font-weight:400;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#7F868E;margin-bottom:10px}
.tpl-expediente .x-ftr .big{font-weight:900;font-stretch:125%;text-transform:uppercase;font-size:clamp(36px,7vw,110px);line-height:.85;color:#fff;margin-top:48px;letter-spacing:-.02em}
@media (max-width:800px){.tpl-expediente .x-ftr .g{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}}
.tpl-expediente .k-eb{font-family:'JetBrains Mono',ui-monospace,monospace;font-weight:500;letter-spacing:.06em}
.tpl-expediente .x-table td .lk{font-size:12px;padding:3px 8px;border:1px solid var(--hair)}
.tpl-expediente .x-table td.num{text-align:right;white-space:nowrap;font-family:'JetBrains Mono',ui-monospace,monospace}
`;

export const expediente: TemplateDesign = {
  id: 'expediente',
  kit: true,
  fonts:
    'family=Archivo:wdth,wght@62..125,400;62..125,600;62..125,800;62..125,900&family=JetBrains+Mono:wght@400;600',
  css: CSS,
  html(m, KIT) {
    const { ORG, CAMPAIGN, ANIMALS, SHOW, BADGES } = m;
    const bars = Array.from(
      { length: 42 },
      (_, i) => `<i style="width:${[1, 2, 3, 1, 1, 2, 4, 1][i % 8]}px"></i>`,
    ).join('');
    const recs = ANIMALS.map(
      (x, i) => `<a class="x-rec" href="${x.href}">
        <div class="top"><span class="x-lab">Registro Nº ${String(i + 1).padStart(2, '0')}</span><span class="x-lab" style="color:var(--ok)">● En adopción</span></div>
        <div class="ph">${portrait(x, { k: 'xr', dx: 10, dy: 22, s: 1 })}</div>
        <h3>${x.name}</h3>
        <dl><div><dt class="x-lab">Especie</dt><dd>${x.spLabel}</dd></div><div><dt class="x-lab">Edad</dt><dd>${x.age}</dd></div><div><dt class="x-lab">Tamaño</dt><dd>${x.sizeLabel}</dd></div><div><dt class="x-lab">Sexo</dt><dd>${x.sex}</dd></div></dl>
        <span class="go">Abrir ficha ${ic.arrow}</span>
      </a>`,
    ).join('');
    const live = [BADGES[0]?.t, SHOW.transparencia ? `Nivel ${ORG.level}` : '']
      .filter(Boolean)
      .join(' · ');
    const n = m.COUNTS.total;
    return `
<header class="x-hdr"><div class="w">
  <div class="x-id"><i>${logoMark(m)}</i><b>${ORG.name}</b></div>
  <nav aria-label="Secciones"><a href="#x-ficha">Ficha</a><a href="#x-registros">Registros</a><a href="#x-aporte">Aporte</a><a href="#x-libro">Libro</a></nav>
  ${live ? `<span class="x-live">${live}</span>` : '<span></span>'}
</div></header>
${KIT.tbar()}
<main>
<section class="x-hero" id="x-ficha"><div class="w">
  <div class="x-grid-bg" aria-hidden="true">${Array.from({ length: 12 }, (_, i) => `<i style="animation-delay:${i * 50}ms"></i>`).join('')}</div>
  <div class="x-hero-in">
    <div class="t">
      <span class="x-lab">${['Expediente público', ORG.type, ORG.place].filter(Boolean).join(' · ')}</span>
      <h1 class="x-h1">${ORG.name
        .split(' ')
        .map((w, i) => `<span><b style="animation-delay:${i * 90}ms">${w}</b></span>`)
        .join('')}</h1>
      <p style="font-size:18px;line-height:1.6;color:var(--soft);max-width:34em">${ORG.lede || availLine(m)}</p>
      <div class="x-row"><div><span class="x-lab">En adopción</span><b class="x-mono" id="x-n">${n}</b></div>${SHOW.transparencia ? `<div><span class="x-lab">Formalización</span><b class="x-mono"><span id="x-f">${ORG.formalization}</span>%</b></div><div><span class="x-lab">Nivel</span><b class="x-mono">${ORG.level}</b></div>` : ''}<div><span class="x-lab">Reseñas</span><b class="x-mono">${m.REVIEWS.length}</b></div></div>
      <div style="display:flex;flex-wrap:wrap;gap:10px"><a class="x-btn" href="#x-registros" data-magnet>Ver registros ${ic.arrow}</a><a class="x-btn o" href="${ORG.donateHref}">Hacer un aporte</a></div>
    </div>
    <div class="x-cardwrap">
      <button class="x-card" id="x-card" type="button" aria-label="Carnet de la organización. Toca para ver su estado registrado.">
        <div class="x-in">
          <div class="x-face f"><span class="band"></span><span class="glare"></span>
            <div class="x-fr" style="margin-top:8px"><span class="lg">${logoMark(m)}</span><div><span class="x-lab">Carnet de organización</span><b>${ORG.name}</b></div></div>
            <div class="x-kv">${ORG.type ? `<div><span class="x-lab">Tipo</span><b>${ORG.type}</b></div>` : ''}${ORG.city ? `<div><span class="x-lab">Ciudad</span><b>${ORG.city}</b></div>` : ''}${SHOW.transparencia ? `<div><span class="x-lab">Nivel</span><b>${ORG.level}</b></div>` : ''}</div>
            <div class="x-code" aria-hidden="true">${bars}</div>
            ${BADGES[0] ? `<span class="x-stamp${BADGES[0].ok ? ' go' : ''}">${BADGES[0].t}${BADGES[0].ok ? ' ✓' : ''}</span>` : ''}
          </div>
          <div class="x-face b"><span class="x-lab" style="color:#8A939C">Estado registrado en AdoptaFácil</span>
            <ul>${BADGES.length ? BADGES.map((b) => `<li><i>${b.ok ? ic.check : ic.clock}</i>${b.t}</li>`).join('') : '<li>Sin estado de formalización registrado</li>'}</ul>
            ${SHOW.transparencia ? `<span class="x-lab" style="color:#8A939C">Nivel ${ORG.level} · formalización ${ORG.formalization}%</span>` : ''}</div>
        </div>
      </button>
      <span class="x-lab">Toca el carnet para voltearlo</span>
    </div>
  </div>
</div></section>

${KIT.acts(['#x-registros', '#x-registros', ORG.donateHref], KIT.hd('01 · Cómo participar', 'Adopta, apadrina o dona'))}
<section class="x-sec" id="x-registros" data-sec="animales"><div class="w">
  <div class="x-sh"><span class="c x-lab">02 · Registros de adopción</span><h2>${n === 0 ? 'Sin registros abiertos' : n === 1 ? '1 animal con ficha abierta' : `${n} animales con ficha abierta`}</h2></div>
  ${ANIMALS.length ? `<div class="x-recs">${recs}</div>` : `<p class="k-empty">${EMPTY.animales}</p>`}
</div></section>

${
  CAMPAIGN.active
    ? `<section class="x-sec" id="x-aporte" data-sec="campana"><div class="w">
  <div class="x-sh"><span class="c x-lab">03 · Campaña activa</span><h2>${CAMPAIGN.title}</h2></div>
  <div class="x-receipt-row">
    <div class="x-copy">${CAMPAIGN.description ? `<p>${CAMPAIGN.description}</p>` : ''}<p>Campaña abierta hasta el ${CAMPAIGN.deadline}.</p><p>${COPY.adoptNote}</p>${KIT.moreCampaigns()}</div>
    <div class="x-receipt" aria-label="Resumen de la campaña">
      <h3>${CAMPAIGN.title}</h3><p class="c">${ORG.name} · vence ${CAMPAIGN.deadlineShort}</p><hr>
      <div class="l"><span>Meta</span><span>${fmt(CAMPAIGN.goal)}</span></div>
      <div class="l"><span>Recaudado</span><span id="x-raised">${fmt(CAMPAIGN.raised)}</span></div>
      <div class="l"><span>Falta</span><span>${fmt(Math.max(0, CAMPAIGN.goal - CAMPAIGN.raised))}</span></div>
      <div class="x-segs" id="x-segs" aria-hidden="true">${Array.from({ length: 50 }, () => '<i></i>').join('')}</div>
      <div class="l" style="font-size:12px;color:var(--soft)"><span>Avance</span><span>${CAMPAIGN.pct}%</span></div><hr>
      <a class="x-btn" href="${CAMPAIGN.href}" style="width:100%;margin-top:14px">Ver campaña y aportar</a>
    </div>
  </div>
</div></section>`
    : `<div id="x-aporte">${KIT.campEmpty(KIT.hd('03 · Campaña activa', 'Sin campaña por ahora'))}</div>`
}
${KIT.needs(KIT.hd('04 · Banco de recursos', 'Necesita hoy'))}
${KIT.prods(KIT.hd('05 · Tienda', 'Productos'))}
${KIT.help()}
${KIT.about(`<div><p class="k-eb">06 · Quiénes somos</p><h2 class="k-h2">Sobre nosotros</h2></div>`)}
${KIT.revs(KIT.hd('07 · Reseñas', 'Lo que dicen las familias', `<button type="button" class="k-lnk" data-review>Registrar reseña ${ic.arrow}</button>`))}

<section class="x-sec" id="x-libro" data-sec="libro"><div class="w">
  <div class="x-sh"><span class="c x-lab">08 · Transparencia · libro público</span><h2>Ingresos y gastos</h2></div>
  <p style="color:var(--soft);margin:-10px 0 20px">${COPY.ledgerText} <button type="button" class="k-lnk" data-ledger>Ver libro completo ${ic.arrow}</button></p>
  <div class="x-table" style="overflow-x:auto"><table style="min-width:600px"><thead><tr><th>Fecha</th><th>Concepto</th><th>Tipo</th><th style="text-align:right">Monto</th><th>Responsable</th></tr></thead>
    <tbody><tr class="x-empty"><td colspan="5">${EMPTY.libro}</td></tr></tbody></table></div>
</div></section>
${KIT.contact()}
</main>
<footer class="x-ftr"><div class="w">
  <div class="g"><div><h4>Organización</h4><p>${ORG.name}${ORG.place ? `<br>${ORG.place}` : ''}</p></div>${SHOW.transparencia ? `<div><h4>Verificación</h4><p>Nivel ${ORG.level}<br>Formalización ${ORG.formalization}%</p></div>` : ''}<div><h4>Reseñas</h4><p>${m.REVIEWS.length === 1 ? '1 publicada' : `${m.REVIEWS.length} publicadas`}<br><button type="button" class="k-lnk" data-review style="font-size:inherit">Registrar reseña</button></p></div><div><h4>Transparencia</h4><p><button type="button" class="k-lnk" data-ledger style="font-size:inherit">Libro público</button><br>Hecho con AdoptaFácil</p></div></div>
  ${KIT.socials()}
  <div class="big">${ORG.short}</div>
</div></footer>`;
  },
  init(app, env) {
    const { m, motion } = env;
    const { signal } = motion;
    const card = qs(app, '#x-card');
    if (card) {
      card.addEventListener('click', () => card.classList.toggle('flip'), { signal });
      if (!motion.reduce && motion.hover) {
        card.addEventListener(
          'pointermove',
          (e) => {
            const r = card.getBoundingClientRect();
            const x = (e.clientX - r.left) / r.width;
            const y = (e.clientY - r.top) / r.height;
            card.style.transform = `rotateX(${((0.5 - y) * 14).toFixed(2)}deg) rotateY(${((x - 0.5) * 18).toFixed(2)}deg)`;
            qsa(card, '.glare').forEach((g) => g.style.setProperty('--gl', (x - 0.5) * 160 + '%'));
          },
          { signal },
        );
        card.addEventListener('pointerleave', () => (card.style.transform = ''), { signal });
      }
    }
    // Segmentos del recibo
    const segsBox = qs(app, '#x-segs');
    if (segsBox) {
      const segs = qsa(segsBox, 'i');
      const on = Math.round((segs.length * m.CAMPAIGN.pct) / 100);
      const light = () =>
        segs.forEach((s, i) => {
          if (i >= on) return;
          const t = setTimeout(() => s.classList.add('on'), motion.reduce ? 0 : 400 + i * 120);
          signal.addEventListener('abort', () => clearTimeout(t));
        });
      if (typeof IntersectionObserver !== 'function') light();
      motion.observe(
        [segsBox],
        (en, io) => {
          if (!en.isIntersecting) return;
          io.disconnect();
          light();
        },
        { threshold: 0.4 },
      );
      motion.countUp(qs(app, '#x-raised'), m.CAMPAIGN.raised, fmt);
    }
    motion.countUp(qs(app, '#x-f'), m.ORG.formalization);
    motion.reveal(app, '.x-rec, .x-receipt, .x-copy, .x-table', { stagger: 80 });
    motion.magnet(app);
  },
};
