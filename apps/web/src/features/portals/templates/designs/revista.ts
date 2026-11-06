import { COPY, EMPTY } from '../engine/model';
import { availLine, campaignArt, fmt, ic, portrait, qs, qsa } from '../engine/runtime';
import type { TemplateDesign } from '../engine/types';

const CSS = `
.tpl-revista{--ink:#111111;--soft:#55524D;--rule:#111111;--hair:#DAD7D0;--paper:#FFFFFF;--k-r:2px;--k-fd:'Instrument Serif',Georgia,serif;--k-fw:400;--k-ls:-.01em;--k-tint:#F3F1EC;--k-line:var(--hair);--k-soft:var(--soft);--k-ink:var(--ink);--k-sh:inset 0 0 0 1px var(--hair);font-family:'Hanken Grotesk',system-ui,sans-serif;color:var(--ink);background:var(--paper)}
.tpl-revista a{color:inherit}
.tpl-revista .r-serif{font-family:'Instrument Serif',Georgia,'Times New Roman',serif;font-weight:400}
.tpl-revista .r-top{border-bottom:1px solid var(--rule)}
.tpl-revista .r-top .w{display:flex;justify-content:space-between;gap:16px;padding-block:10px;font-size:12px;font-weight:600;letter-spacing:.14em;text-transform:uppercase}
.tpl-revista .r-mast{padding-block:18px 0}
.tpl-revista .r-mast h1{font-family:'Instrument Serif',Georgia,serif;font-weight:400;line-height:.82;letter-spacing:-.035em;white-space:nowrap;font-size:clamp(40px,9vw,150px);overflow:hidden}
@media (max-width:600px){.tpl-revista .r-mast h1{white-space:normal;font-size:clamp(34px,10.5vw,52px)}}
.tpl-revista .r-mast h1 span{display:inline-block;animation:rUp 1.1s cubic-bezier(.2,.8,.2,1) both}
.tpl-revista .r-mast h1 em{font-style:italic;color:var(--brand)}
@keyframes rUp{from{transform:translateY(100%)}}
.tpl-revista .r-nav{position:sticky;top:env(safe-area-inset-top,0px);z-index:40;background:rgba(255,255,255,.94);backdrop-filter:blur(8px);border-top:3px double var(--rule);border-bottom:1px solid var(--rule);margin-top:14px}
.tpl-revista .r-nav .w{display:flex;align-items:center;justify-content:space-between;gap:16px;padding-block:6px;overflow-x:auto;scrollbar-width:none}
.tpl-revista .r-nav nav{display:flex;gap:28px}
.tpl-revista .r-nav a{font-size:13px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;text-decoration:none;white-space:nowrap;padding:10px 0;background:linear-gradient(currentColor,currentColor) 0 calc(100% - 6px)/0 1.5px no-repeat;transition:background-size .35s}
.tpl-revista .r-nav a:hover{background-size:100% 1.5px}
.tpl-revista .r-nav .r-sub{display:inline-flex;align-items:center;min-height:42px;padding:0 18px;background:var(--ink);color:#fff!important;font-size:13px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;text-decoration:none!important;background-image:none!important}

.tpl-revista .r-cover{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:24px;padding-block:48px 88px}
.tpl-revista .r-cover .meta{grid-column:1/4;display:flex;flex-direction:column;gap:24px;border-top:1px solid var(--rule);padding-top:14px}
.tpl-revista .r-cover .meta dt{font-size:11px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:var(--soft)}
.tpl-revista .r-cover .meta dd{margin:4px 0 0;font-size:15px;font-weight:600}
.tpl-revista .r-cover .meta .big{font-family:'Instrument Serif',serif;font-size:76px;line-height:.9;font-weight:400}
.tpl-revista .r-cover .head{grid-column:4/9;display:flex;flex-direction:column;gap:26px}
.tpl-revista .r-cover .head h2{font-family:'Instrument Serif',serif;font-weight:400;font-size:clamp(44px,5.4vw,84px);line-height:.95;letter-spacing:-.02em}
.tpl-revista .r-cover .head h2 em{font-style:italic}
.tpl-revista .r-lede{font-size:19px;line-height:1.65;column-gap:28px}
.tpl-revista .r-lede::first-letter{font-family:'Instrument Serif',serif;float:left;font-size:96px;line-height:.78;padding:6px 10px 0 0;color:var(--brand)}
.tpl-revista .r-by{font-size:12px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:var(--soft)}
.tpl-revista .r-cover .art{grid-column:9/13;position:relative}
.tpl-revista .r-arch{aspect-ratio:3/4.2;border-radius:999px 999px 0 0;overflow:hidden;clip-path:inset(100% 0 0 0);animation:rClip 1.4s .25s cubic-bezier(.7,0,.2,1) forwards}
@keyframes rClip{to{clip-path:inset(0 0 0 0)}}
.tpl-revista .r-cap{margin-top:10px;font-size:13px;color:var(--soft);display:flex;justify-content:space-between;border-top:1px solid var(--hair);padding-top:8px}
.tpl-revista .r-cap i{font-family:'Instrument Serif',serif;font-size:18px;color:var(--ink)}
.tpl-revista .r-btn{display:inline-flex;align-items:center;gap:12px;min-height:54px;padding:0 26px;font-family:'Hanken Grotesk',system-ui,sans-serif;font-size:16px;line-height:1;border:1.5px solid var(--ink);text-decoration:none;font-weight:700;letter-spacing:.04em;transition:background .3s,color .3s;align-self:flex-start;background:transparent;cursor:pointer;color:var(--ink)}
.tpl-revista .r-btn svg{width:18px}
.tpl-revista .r-btn:hover{background:var(--ink);color:#fff}
.tpl-revista .r-btn.fill{background:var(--brand);border-color:var(--brand);color:var(--brand-ink)}
.tpl-revista .r-btn.fill:hover{background:var(--ink);border-color:var(--ink);color:#fff}
@media (max-width:1000px){.tpl-revista .r-cover{grid-template-columns:minmax(0,1fr)}.tpl-revista .r-cover .meta,.tpl-revista .r-cover .head,.tpl-revista .r-cover .art{grid-column:1/-1}.tpl-revista .r-cover .art{order:-1;max-width:420px}.tpl-revista .r-cover .meta{flex-direction:row;flex-wrap:wrap}}

.tpl-revista .r-pin{height:calc(var(--n) * 100vh);position:relative;background:var(--ink);color:#fff}
.tpl-revista .r-pin .stick{position:sticky;top:calc(env(safe-area-inset-top,0px) + 108px);height:calc(100vh - 108px);overflow:hidden;display:flex;flex-direction:column}
.tpl-revista .r-pin .lab{display:flex;justify-content:space-between;align-items:center;padding-block:22px;font-size:12px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;border-bottom:1px solid rgba(255,255,255,.2)}
.tpl-revista .r-track{display:flex;height:100%;will-change:transform}
.tpl-revista .r-spread{flex:0 0 100vw;display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:48px;align-items:center;padding:4vh max(40px,6vw)}
.tpl-revista .r-spread .ph{height:min(66vh,640px);aspect-ratio:4/5;justify-self:end;overflow:hidden;position:relative}
.tpl-revista .r-spread .ph .portrait{transform:scale(1.15);transition:transform 1.4s cubic-bezier(.2,.8,.2,1)}
.tpl-revista .r-spread.act .ph .portrait{transform:scale(1)}
.tpl-revista .r-spread .tx{display:flex;flex-direction:column;gap:20px;max-width:520px}
.tpl-revista .r-num{font-family:'Instrument Serif',serif;font-size:22px;color:rgba(255,255,255,.6)}
.tpl-revista .r-name{font-family:'Instrument Serif',serif;font-style:italic;font-size:clamp(80px,11vw,180px);line-height:.85;letter-spacing:-.03em}
.tpl-revista .r-spec{display:grid;grid-template-columns:auto 1fr;gap:10px 28px;font-size:15px;border-top:1px solid rgba(255,255,255,.25);padding-top:18px}
.tpl-revista .r-spec dt{font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:rgba(255,255,255,.6);font-weight:700;padding-top:3px}
.tpl-revista .r-spec dd{margin:0}
.tpl-revista .r-spread .r-btn{border-color:#fff;color:#fff}
.tpl-revista .r-spread .r-btn:hover{background:#fff;color:var(--ink)}
.tpl-revista .r-dots{display:flex;gap:6px}
.tpl-revista .r-dots i{width:28px;height:2px;background:rgba(255,255,255,.25);transition:background .3s}
.tpl-revista .r-dots i.on{background:#fff}
@media (max-width:900px){.tpl-revista .r-pin{height:auto}.tpl-revista .r-pin .stick{position:static;height:auto}.tpl-revista .r-track{flex-direction:column;transform:none!important}.tpl-revista .r-spread{flex:none;grid-template-columns:minmax(0,1fr);padding:40px 16px;gap:24px}.tpl-revista .r-spread .ph{justify-self:stretch;height:auto;width:100%}.tpl-revista .r-spread .ph .portrait{transform:none}.tpl-revista .r-dots{display:none}}

.tpl-revista .r-pull{padding-block:120px;text-align:center}
.tpl-revista .r-pull blockquote{margin:0 auto;max-width:15em;font-family:'Instrument Serif',serif;font-size:clamp(40px,6vw,96px);line-height:1;letter-spacing:-.02em}
.tpl-revista .r-pull blockquote span{color:var(--hair);transition:color .4s}
.tpl-revista .r-pull blockquote span.on{color:var(--ink)}
.tpl-revista .r-pull cite{display:block;margin-top:28px;font-style:normal;font-size:12px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:var(--soft)}

.tpl-revista .r-report{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:24px;border-top:3px double var(--rule);padding-top:28px}
.tpl-revista .r-report .k{grid-column:1/4;font-size:12px;font-weight:700;letter-spacing:.16em;text-transform:uppercase}
.tpl-revista .r-report .k p{margin-top:10px;color:var(--soft);letter-spacing:.06em;text-transform:none;font-weight:500;font-size:14px}
.tpl-revista .r-report .body{grid-column:4/9;display:flex;flex-direction:column;gap:22px}
.tpl-revista .r-report h2{font-family:'Instrument Serif',serif;font-weight:400;font-size:clamp(40px,4.6vw,72px);line-height:.95;letter-spacing:-.02em}
.tpl-revista .r-report h2 em{font-style:italic;color:var(--brand)}
.tpl-revista .r-report .cols{columns:2;column-gap:28px;font-size:17px;line-height:1.65}
.tpl-revista .r-report .fig{grid-column:9/13;display:flex;flex-direction:column;gap:14px}
.tpl-revista .r-report .fig .n{font-family:'Instrument Serif',serif;font-size:clamp(64px,7vw,112px);line-height:.85}
.tpl-revista .r-rule{height:2px;background:var(--hair);position:relative}
.tpl-revista .r-rule i{position:absolute;inset:0 auto 0 0;width:0;background:var(--brand);transition:width 2s cubic-bezier(.2,.8,.2,1)}
@media (max-width:1000px){.tpl-revista .r-report{grid-template-columns:minmax(0,1fr)}.tpl-revista .r-report>*{grid-column:1/-1!important}.tpl-revista .r-report .cols{columns:1}}

.tpl-revista .r-colo{margin-top:120px;border-top:1px solid var(--rule);padding-block:28px 56px;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:24px;font-size:14px}
.tpl-revista .r-colo h4{font-size:11px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;margin-bottom:10px}
.tpl-revista .r-colo p,.tpl-revista .r-colo li{color:var(--soft);line-height:1.6}
.tpl-revista .r-colo ul{list-style:none;margin:0;padding:0}
@media (max-width:800px){.tpl-revista .r-colo{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}}
.tpl-revista .r-end{font-family:'Instrument Serif',serif;font-size:clamp(40px,8vw,120px);line-height:.9;border-top:3px double var(--rule);padding-block:28px 48px;display:flex;justify-content:space-between;align-items:flex-end;gap:20px;flex-wrap:wrap}
.tpl-revista .r-end em{font-style:italic;color:var(--brand)}
.tpl-revista .k-h2 em{font-style:italic}
.tpl-revista .k-act:first-child{background:var(--ink);color:#fff}
.tpl-revista .k-help{background:var(--ink);color:#fff}
.tpl-revista .k-help .k-btn{background:#fff;color:var(--ink)!important}
.tpl-revista .r-all{padding-block:72px 24px}
.tpl-revista .r-all-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:28px 20px;margin-top:28px}
.tpl-revista .r-all-grid a{text-decoration:none;display:flex;flex-direction:column;gap:10px}
.tpl-revista .r-all-grid .ph{aspect-ratio:4/5;overflow:hidden;position:relative}
.tpl-revista .r-all-grid b{font-family:'Instrument Serif',serif;font-weight:400;font-size:28px;line-height:1}
.tpl-revista .r-all-grid span{font-size:13px;color:var(--soft)}
.tpl-revista .r-empty{padding-block:72px}
.tpl-revista .r-link{background:none;border:0;padding:0;font:inherit;color:inherit;text-decoration:underline;cursor:pointer}
`;

export const revista: TemplateDesign = {
  id: 'revista',
  kit: true,
  fonts: 'family=Hanken+Grotesk:wght@400;500;600;700&family=Instrument+Serif:ital@0;1',
  css: CSS,
  html(m, KIT) {
    const { ORG, CAMPAIGN, ANIMALS, SHOW } = m;
    const words = [
      'Ninguna',
      'Una',
      'Dos',
      'Tres',
      'Cuatro',
      'Cinco',
      'Seis',
      'Siete',
      'Ocho',
      'Nueve',
      'Diez',
      'Once',
      'Doce',
    ];
    const n = m.COUNTS.total;
    const month = new Date().toLocaleDateString('es-CO', {
      month: 'long',
      year: 'numeric',
      timeZone: 'America/Bogota',
    });
    const parts = ORG.name.split(' ');
    const mast = parts
      .map(
        (p, i) =>
          `<span style="animation-delay:${i * 90}ms">${i === parts.length - 1 && parts.length > 1 ? `<em>${p}</em>` : p}</span>`,
      )
      .join(' ');
    // Las páginas guiadas por scroll muestran hasta 6 retratos; el índice, todos.
    const feat = ANIMALS.slice(0, 6);
    const spreads = feat
      .map(
        (x, i) => `<article class="r-spread" data-i="${i}">
        <a class="ph" href="${x.href}" aria-label="Ver a ${x.name}">${portrait(x, { k: 'rs', dx: 6, dy: 18, s: 1.05 })}</a>
        <div class="tx"><span class="r-num">${String(i + 1).padStart(2, '0')} / ${String(feat.length).padStart(2, '0')}</span>
          <h3 class="r-name">${x.name}</h3>
          <dl class="r-spec"><dt>Especie</dt><dd>${x.spLabel}${x.breed ? `, ${x.breed}` : ''}</dd><dt>Edad</dt><dd>${x.age}</dd><dt>Tamaño</dt><dd>${x.sizeLabel}</dd><dt>Sexo</dt><dd>${x.sex}</dd></dl>
          <a class="r-btn" href="${x.href}">Ver su ficha ${ic.arrow}</a></div>
      </article>`,
      )
      .join('');
    const rest = ANIMALS.slice(feat.length);
    const index = rest.length
      ? `<div class="w r-all"><p class="r-by">Índice · ${ANIMALS.length} en esta edición</p><div class="r-all-grid">${rest
          .map(
            (x) =>
              `<a href="${x.href}"><span class="ph">${portrait(x, { k: 'ri', dx: 6, dy: 18, s: 1 })}</span><b>${x.name}</b><span>${x.spLabel} · ${x.age} · ${x.sizeLabel}</span></a>`,
          )
          .join('')}</div></div>`
      : '';
    // La cita es la descripción que escribió la organización (nunca un texto inventado).
    const quote = ORG.lede
      .split(' ')
      .map((w) => `<span>${w}</span>`)
      .join(' ');
    const lead =
      n === 0
        ? 'Pronto, nuevas historias'
        : `${words[n] ?? n} ${n === 1 ? 'historia que <em>espera</em>' : 'historias que <em>esperan</em>'} un final feliz`;
    const badgeTxt = m.BADGES.map((b) => b.t).join(' · ');
    return `
<div class="r-top"><div class="w"><span>${ORG.city ? `${ORG.city} · ` : ''}${month}</span><span>${[ORG.type, badgeTxt].filter(Boolean).join(' · ')}</span></div></div>
<header class="r-mast"><div class="w"><h1>${mast}</h1></div></header>
<div class="r-nav"><div class="w"><nav aria-label="Secciones"><a href="#r-portada">Portada</a><a href="#r-retratos">Retratos</a><a href="#r-reportaje">Reportaje</a><a href="#r-colofon">Colofón</a></nav><a class="r-sub" href="${ORG.donateHref}">Donar</a></div></div>
${KIT.tbar()}
<main>
<section class="w r-cover" id="r-portada">
  <dl class="meta"><div><dt>En esta edición</dt><dd class="big">${n}</dd><dd>${n === 1 ? 'animal busca hogar' : 'animales buscan hogar'}</dd></div>${ORG.place ? `<div><dt>Dónde</dt><dd>${ORG.place}</dd></div>` : ''}${SHOW.transparencia ? `<div><dt>Verificación</dt><dd>Nivel ${ORG.level} · ${ORG.formalization}% formalización</dd></div>` : ''}</dl>
  <div class="head"><h2>${lead}</h2>
    <p class="r-lede">${ORG.lede || availLine(m)}</p><p class="r-by">Por el equipo de ${ORG.name}</p>
    <a class="r-btn fill" href="#r-retratos" data-magnet>Ver los retratos ${ic.arrow}</a></div>
  ${
    feat.length
      ? `<figure class="art" style="margin:0"><a class="r-arch" href="${feat[0].href}" aria-label="Ver a ${feat[0].name}" style="display:block">${portrait(feat[0], { k: 'ra', dx: 4, dy: 20, s: 1.1 })}</a><figcaption class="r-cap"><i>${feat[0].name}</i><span>${feat[0].spLabel}, ${feat[0].age}</span></figcaption></figure>`
      : `<figure class="art" style="margin:0"><div class="r-arch" style="position:relative">${campaignArt(m)}</div></figure>`
  }
</section>

${KIT.acts(['#r-retratos', '#r-retratos', ORG.donateHref])}
${
  feat.length
    ? `<section class="r-pin" id="r-retratos" data-sec="animales" style="--n:${feat.length}"><div class="stick">
  <div class="w lab"><span>Retratos</span><div class="r-dots" aria-hidden="true">${feat.map((_, i) => `<i${i === 0 ? ' class="on"' : ''}></i>`).join('')}</div><span>${feat.length > 1 ? 'Baja para pasar página' : ''}</span></div>
  <div class="r-track" id="r-track">${spreads}</div>
</div></section>${index}`
    : `<section class="w r-empty" id="r-retratos" data-sec="animales">${KIT.hd('Retratos', 'Mascotas en adopción')}<p class="k-empty">${EMPTY.animales}</p></section>`
}

${ORG.lede ? `<section class="w r-pull"><blockquote id="r-quote">${quote}</blockquote><cite>${ORG.name}${ORG.city ? `, ${ORG.city}` : ''}</cite></section>` : ''}

${
  CAMPAIGN.active
    ? `<section class="w r-report" id="r-reportaje" data-sec="campana">
  <div class="k">Reportaje${CAMPAIGN.category ? ` · ${CAMPAIGN.category}` : ''}<p>Campaña activa hasta el ${CAMPAIGN.deadline}</p></div>
  <div class="body"><h2>${CAMPAIGN.title}</h2>
    <div class="cols">${CAMPAIGN.description ? `<p>${CAMPAIGN.description}</p>` : ''}<p style="margin-top:14px">${COPY.adoptNote}</p></div>
    <a class="r-btn fill" href="${CAMPAIGN.href}" data-magnet>Ver campaña y aportar ${ic.arrow}</a>${KIT.moreCampaigns()}</div>
  <div class="fig"><span class="n r-serif" id="r-raised">${fmt(CAMPAIGN.raised)}</span><span style="color:var(--soft)">recaudados de ${fmt(CAMPAIGN.goal)}</span><div class="r-rule"><i id="r-rule"></i></div><span style="font-size:12px;font-weight:700;letter-spacing:.16em;text-transform:uppercase">${CAMPAIGN.pct}% de la meta</span></div>
</section>`
    : `<div id="r-reportaje">${KIT.campEmpty()}</div>`
}
${KIT.needs(KIT.hd('Banco de recursos', 'Lista de <em>necesidades</em>'))}
${KIT.prods(KIT.hd('La tienda', 'Productos que <em>ayudan</em>'))}
${KIT.help()}
${KIT.about()}
${KIT.revs(KIT.hd('Cartas al editor', 'Reseñas', `<button type="button" class="k-lnk" data-review>Registrar reseña ${ic.arrow}</button>`))}
${KIT.ledger(KIT.hd('Transparencia', 'Libro <em>público</em>', `<button type="button" class="k-lnk" data-ledger>Ver libro completo ${ic.arrow}</button>`))}
${KIT.contact()}

<section class="w" id="r-colofon">
  <div class="r-colo">
    <div><h4>Colofón</h4><p>${ORG.name}.${ORG.type ? ` ${ORG.type}` : ''}${ORG.place ? `${ORG.type ? ' en' : ''} ${ORG.place}` : ''}.</p></div>
    ${m.BADGES.length || SHOW.transparencia ? `<div><h4>Estado</h4><ul>${m.BADGES.map((b) => `<li>${b.t}</li>`).join('')}${SHOW.transparencia ? `<li>Formalización ${ORG.formalization}%</li>` : ''}</ul></div>` : ''}
    <div><h4>Cartas al editor</h4><p>${m.REVIEWS.length === 1 ? '1 reseña publicada' : `${m.REVIEWS.length} reseñas publicadas`}. <button type="button" class="r-link" data-review>Registra la tuya</button> si adoptaste o donaste aquí.</p></div>
    <div><h4>Letra pequeña</h4><ul><li><button type="button" class="r-link" data-ledger>Transparencia</button></li><li>Hecho con AdoptaFácil</li></ul></div>
  </div>
  ${KIT.socials()}
  <div class="r-end"><span>Hasta la próxima <em>edición.</em></span><a class="r-btn" href="#r-portada">Volver a la portada</a></div>
</section>
</main>`;
  },
  init(app, env) {
    const { m, motion } = env;
    const { signal } = motion;
    // El nombre ocupa exactamente el ancho de la cabecera
    const mh = qs(app, '.r-mast h1');
    const box = mh?.parentElement;
    if (mh && box) {
      const fit = () => {
        mh.style.fontSize = '';
        const cs = getComputedStyle(box);
        const w = box.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
        const size = parseFloat(getComputedStyle(mh).fontSize);
        mh.style.width = 'max-content';
        const nat = mh.offsetWidth;
        mh.style.width = '';
        mh.style.fontSize = Math.min(size * (w / Math.max(1, nat)) * 0.985, 230) + 'px';
      };
      void document.fonts?.ready.then(() => {
        if (!signal.aborted) fit();
      });
      fit();
      addEventListener('resize', fit, { signal });
    }
    // Galería horizontal guiada por el scroll vertical
    const pin = qs(app, '.r-pin');
    const track = qs(app, '#r-track');
    const spreads = qsa(app, '.r-spread');
    const dots = qsa(app, '.r-dots i');
    if (pin && track) {
      const onScroll = () => {
        if (innerWidth <= 900) {
          spreads.forEach((s) => s.classList.add('act'));
          return;
        }
        const r = pin.getBoundingClientRect();
        const total = pin.offsetHeight - innerHeight;
        const k = Math.min(1, Math.max(0, -r.top / Math.max(1, total)));
        const x = k * (spreads.length - 1);
        track.style.transform = `translate3d(${-x * 100}vw,0,0)`;
        const idx = Math.round(x);
        spreads.forEach((s, i) => s.classList.toggle('act', i === idx));
        dots.forEach((d, i) => d.classList.toggle('on', i === idx));
      };
      addEventListener('scroll', onScroll, { passive: true, signal });
      addEventListener('resize', onScroll, { signal });
      onScroll();
    }
    // Cita que se enciende palabra por palabra con el scroll
    const q = qs(app, '#r-quote');
    if (q) {
      const ws = qsa(q, 'span');
      const onQ = () => {
        const r = q.getBoundingClientRect();
        const k = motion.reduce
          ? 1
          : Math.min(
              1,
              Math.max(0, (innerHeight * 0.85 - r.top) / (r.height + innerHeight * 0.35)),
            );
        const on = Math.round(k * ws.length);
        ws.forEach((w, i) => w.classList.toggle('on', i < on));
      };
      addEventListener('scroll', onQ, { passive: true, signal });
      onQ();
    }
    const rule = qs(app, '#r-rule');
    if (rule) {
      if (typeof IntersectionObserver !== 'function') rule.style.width = m.CAMPAIGN.pct + '%';
      motion.observe(
        [rule],
        (en, io) => {
          if (en.isIntersecting) {
            rule.style.width = m.CAMPAIGN.pct + '%';
            io.disconnect();
          }
        },
        { threshold: 0.5 },
      );
      motion.countUp(qs(app, '#r-raised'), m.CAMPAIGN.raised, fmt);
    }
    motion.reveal(app, '.r-report > *, .r-colo > div', { stagger: 110 });
    motion.magnet(app);
  },
};
