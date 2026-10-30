import { COPY, EMPTY } from '../engine/model';
import {
  campaignArt,
  availLine,
  fmt,
  ic,
  logoMark,
  paw,
  portrait,
  qs,
  qsa,
} from '../engine/runtime';
import { unesc } from '../engine/safe';
import type { TemplateDesign } from '../engine/types';

const CSS = `
.tpl-hogar{--sand:#FBF5EE;--ink:#1D1B19;--soft:#5E5852;--line:#ECE3D8;--card:#FFFFFF;--k-tint:var(--sand);--k-line:var(--line);--k-soft:var(--soft);--k-ink:var(--ink);--k-r:30px;--k-sh:0 0 0 1px var(--line),0 24px 50px -40px rgba(0,0,0,.3);font-family:'Plus Jakarta Sans',system-ui,sans-serif;color:var(--ink);background:#FFFFFF}
.tpl-hogar a{color:inherit}
.tpl-hogar .h-hdr{position:sticky;top:env(safe-area-inset-top,0px);z-index:40;transition:background .35s,box-shadow .35s}
.tpl-hogar .h-hdr.solid{background:rgba(255,255,255,.88);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);box-shadow:0 1px 0 var(--line)}
.tpl-hogar .h-hdr .w{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:16px;padding-block:14px}
.tpl-hogar .h-nav{display:flex;gap:6px}
.tpl-hogar .h-nav a{text-decoration:none;font-weight:600;font-size:15px;padding:10px 14px;border-radius:999px;transition:background .2s}
.tpl-hogar .h-nav a:hover{background:rgba(0,0,0,.05)}
.tpl-hogar .h-nav.r{justify-content:flex-end;align-items:center}
.tpl-hogar .h-logo{display:flex;align-items:center;gap:10px;text-decoration:none}
.tpl-hogar .h-logo i{width:44px;height:44px;border-radius:50%;background:var(--brand);color:var(--brand-ink);display:grid;place-items:center;font-style:normal;font-weight:800;font-size:15px}
.tpl-hogar .h-logo b{font-size:18px;font-weight:800;letter-spacing:-.02em}
.tpl-hogar .h-btn{display:inline-flex;align-items:center;gap:10px;min-height:48px;padding:0 22px;border-radius:999px;background:var(--brand);color:var(--brand-ink)!important;text-decoration:none;font-weight:700;font-size:15px;border:0;cursor:pointer;transition:transform .3s cubic-bezier(.2,.8,.2,1),box-shadow .3s}
.tpl-hogar .h-btn:hover{box-shadow:0 14px 30px -12px var(--brand)}
.tpl-hogar .h-btn svg{width:18px;transition:transform .3s}
.tpl-hogar .h-btn:hover svg{transform:translateX(4px)}
.tpl-hogar .h-btn.ghost{background:transparent;color:var(--ink)!important;box-shadow:inset 0 0 0 1.5px var(--line)}
.tpl-hogar .h-btn.lg{min-height:58px;padding:0 30px;font-size:17px}
@media (max-width:900px){.tpl-hogar .h-nav.l,.tpl-hogar .h-nav.r a:not(.h-btn){display:none}.tpl-hogar .h-hdr .w{grid-template-columns:auto 1fr;}.tpl-hogar .h-logo{order:-1}}

.tpl-hogar .h-hero{overflow-x:clip;padding-block:24px 80px;background:linear-gradient(var(--sand),#fff)}
.tpl-hogar .h-hero-grid{display:grid;grid-template-columns:minmax(0,.9fr) minmax(0,1.1fr);gap:48px;align-items:center}
.tpl-hogar .h-kick{display:inline-flex;align-items:center;gap:8px;font-weight:700;font-size:14px;color:var(--soft)}
.tpl-hogar .h-kick span{display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border-radius:999px;background:#fff;box-shadow:0 0 0 1px var(--line);color:var(--ink)}
.tpl-hogar .h-kick svg{width:14px;color:var(--brand)}
.tpl-hogar .h-h1{font-size:clamp(42px,5.6vw,80px);font-weight:800;letter-spacing:-.045em;line-height:.98;margin-top:20px}
.tpl-hogar .h-h1 em{font-style:normal;color:var(--brand);position:relative;white-space:nowrap}
.tpl-hogar .h-h1 em::after{content:"";position:absolute;left:0;right:0;bottom:.02em;height:.12em;background:currentColor;opacity:.18;border-radius:99px;transform-origin:left;animation:hLine 1.2s .6s cubic-bezier(.2,.8,.2,1) both}
@keyframes hLine{from{transform:scaleX(0)}}
.tpl-hogar .h-lede{font-size:19px;line-height:1.6;color:var(--soft);margin-top:22px;max-width:30em}
.tpl-hogar .h-ctas{display:flex;flex-wrap:wrap;gap:12px;margin-top:32px}
.tpl-hogar .h-stage{position:relative;aspect-ratio:1/1.05;max-height:680px;width:100%}
.tpl-hogar .h-slide{position:absolute;inset:0;border-radius:40px;overflow:hidden;opacity:0;transition:opacity 1.1s ease;box-shadow:0 40px 80px -40px rgba(29,27,25,.45)}
.tpl-hogar .h-slide.on{opacity:1}
.tpl-hogar .h-slide .portrait{transform:scale(1.08);transition:transform 7s linear}
.tpl-hogar .h-slide.on .portrait{transform:scale(1.0)}
.tpl-hogar .h-bars{position:absolute;left:24px;right:24px;top:20px;display:flex;gap:6px;z-index:3}
.tpl-hogar .h-bars i{flex:1;height:4px;border-radius:9px;background:rgba(255,255,255,.35);overflow:hidden}
.tpl-hogar .h-bars i b{display:block;height:100%;width:0;background:#fff}
.tpl-hogar .h-bars i.done b{width:100%}
.tpl-hogar .h-bars i.run b{animation:hBar 5s linear forwards}
@keyframes hBar{to{width:100%}}
.tpl-hogar .h-cap{position:absolute;left:24px;bottom:24px;right:24px;z-index:3;display:flex;justify-content:space-between;align-items:flex-end;gap:12px}
.tpl-hogar .h-cap-card{background:rgba(255,255,255,.92);backdrop-filter:blur(10px);border-radius:22px;padding:16px 20px}
.tpl-hogar .h-cap-card b{display:block;font-size:22px;letter-spacing:-.02em}
.tpl-hogar .h-cap-card span{font-size:14px;color:var(--soft)}
.tpl-hogar .h-stage-nav{display:flex;gap:8px}
.tpl-hogar .h-round{width:48px;height:48px;border-radius:50%;border:0;background:rgba(255,255,255,.92);display:grid;place-items:center;cursor:pointer;color:var(--ink)}
.tpl-hogar .h-round svg{width:18px}
.tpl-hogar .h-round.prev svg{transform:rotate(180deg)}
.tpl-hogar .h-blob{position:absolute;right:-40px;bottom:-40px;width:180px;height:180px;color:var(--brand);opacity:.12;z-index:-1}
@media (max-width:900px){.tpl-hogar .h-hero-grid{grid-template-columns:minmax(0,1fr)}.tpl-hogar .h-stage{order:-1;aspect-ratio:4/4.4}}

.tpl-hogar .h-sec{padding-block:96px}
.tpl-hogar .h-head{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:flex-end;gap:20px;margin-bottom:40px}
.tpl-hogar .h-eye{font-size:14px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:var(--brand)}
.tpl-hogar .h-h2{font-size:clamp(34px,4vw,56px);font-weight:800;letter-spacing:-.04em;line-height:1.02;margin-top:10px}
.tpl-hogar .h-sub{color:var(--soft);margin-top:12px;font-size:17px;max-width:34em}

.tpl-hogar .h-rail{display:grid;grid-auto-flow:column;grid-auto-columns:clamp(260px,30vw,380px);gap:24px;overflow-x:auto;scroll-snap-type:x mandatory;padding-bottom:28px;scrollbar-width:none;cursor:grab;padding-left:max(16px,calc((100vw - 1280px)/2 + 40px));padding-right:40px;scroll-padding-left:max(16px,calc((100vw - 1280px)/2 + 40px))}
.tpl-hogar .h-rail::-webkit-scrollbar{display:none}
.tpl-hogar .h-rail.drag{cursor:grabbing;scroll-snap-type:none}
.tpl-hogar .h-card{scroll-snap-align:start;border-radius:32px;background:var(--card);box-shadow:0 0 0 1px var(--line);overflow:hidden;display:flex;flex-direction:column;transition:transform .5s cubic-bezier(.2,.8,.2,1),box-shadow .4s;user-select:none}
.tpl-hogar .h-card:hover{transform:translateY(-8px);box-shadow:0 30px 60px -30px rgba(29,27,25,.35),0 0 0 1px var(--line)}
.tpl-hogar .h-card .ph{aspect-ratio:4/4.6;overflow:hidden}
.tpl-hogar .h-card .ph .portrait{transition:transform .8s cubic-bezier(.2,.8,.2,1)}
.tpl-hogar .h-card:hover .ph .portrait{transform:scale(1.05)}
.tpl-hogar .h-card .bd{padding:22px 24px 26px;display:flex;flex-direction:column;gap:12px}
.tpl-hogar .h-card h3{font-size:30px;font-weight:800;letter-spacing:-.03em}
.tpl-hogar .h-tags{display:flex;flex-wrap:wrap;gap:6px}
.tpl-hogar .h-tags span{font-size:13px;font-weight:600;padding:6px 10px;border-radius:999px;background:var(--sand)}
.tpl-hogar .h-card .h-btn{align-self:flex-start;margin-top:6px}
.tpl-hogar .h-railbar{display:flex;align-items:center;gap:16px}
.tpl-hogar .h-prog{flex:1;height:3px;background:var(--line);border-radius:9px;overflow:hidden;max-width:240px}
.tpl-hogar .h-prog i{display:block;height:100%;width:25%;background:var(--ink);border-radius:9px;transition:transform .2s}

.tpl-hogar .h-steps{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:24px;position:relative}
.tpl-hogar .h-steps svg.line{position:absolute;left:0;right:0;top:34px;width:100%;height:8px;overflow:visible}
.tpl-hogar .h-steps svg.line path{stroke:var(--brand);stroke-width:2.5;fill:none;stroke-dasharray:6 8}
.tpl-hogar .h-step{position:relative;display:flex;flex-direction:column;gap:12px}
.tpl-hogar .h-step .n{width:68px;height:68px;border-radius:50%;background:#fff;box-shadow:0 0 0 1.5px var(--line);display:grid;place-items:center;font-weight:800;font-size:22px;position:relative;z-index:1;transition:background .5s,color .5s,box-shadow .5s}
.tpl-hogar .h-step.lit .n{background:var(--brand);color:var(--brand-ink);box-shadow:0 0 0 8px color-mix(in srgb,var(--brand) 16%,transparent)}
.tpl-hogar .h-step h3{font-size:21px;font-weight:800;letter-spacing:-.02em}
.tpl-hogar .h-step p{color:var(--soft);font-size:15px;line-height:1.55}
@media (max-width:900px){.tpl-hogar .h-steps{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}.tpl-hogar .h-steps svg.line{display:none}}

.tpl-hogar .h-camp{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);border-radius:40px;overflow:hidden;background:var(--sand)}
.tpl-hogar .h-camp .ph{min-height:460px;position:relative}
.tpl-hogar .h-camp .ph .portrait{position:absolute;inset:0}
.tpl-hogar .h-camp .bd{padding:56px;display:flex;flex-direction:column;gap:18px;justify-content:center}
.tpl-hogar .h-ringrow{display:flex;align-items:center;gap:22px}
.tpl-hogar .h-ring{width:120px;height:120px;flex:none;position:relative}
.tpl-hogar .h-ring svg{transform:rotate(-90deg)}
.tpl-hogar .h-ring circle{fill:none;stroke-width:10}
.tpl-hogar .h-ring .t{stroke:#E6DACB}
.tpl-hogar .h-ring .v{stroke:var(--brand);stroke-linecap:round;stroke-dasharray:314;stroke-dashoffset:314;transition:stroke-dashoffset 1.8s cubic-bezier(.2,.8,.2,1)}
.tpl-hogar .h-ring b{position:absolute;inset:0;display:grid;place-items:center;font-size:26px;font-weight:800}
.tpl-hogar .h-money b{font-size:34px;font-weight:800;letter-spacing:-.03em;display:block}
.tpl-hogar .h-money span{color:var(--soft)}
@media (max-width:900px){.tpl-hogar .h-camp{grid-template-columns:minmax(0,1fr)}.tpl-hogar .h-camp .ph{min-height:300px}.tpl-hogar .h-camp .bd{padding:28px 22px}}

.tpl-hogar .h-trust{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,1fr);gap:48px;align-items:center}
.tpl-hogar .h-quote{font-size:clamp(26px,3vw,40px);font-weight:700;letter-spacing:-.03em;line-height:1.2}
.tpl-hogar .h-quote span{color:var(--soft)}
.tpl-hogar .h-seals{display:flex;flex-direction:column;gap:12px}
.tpl-hogar .h-seal{display:flex;align-items:center;gap:14px;padding:18px 20px;border-radius:20px;background:#fff;box-shadow:0 0 0 1px var(--line)}
.tpl-hogar .h-seal i{width:40px;height:40px;border-radius:50%;background:color-mix(in srgb,var(--brand) 14%,#fff);color:var(--brand);display:grid;place-items:center;flex:none}
.tpl-hogar .h-seal i svg{width:18px}
.tpl-hogar .h-seal b{display:block;font-size:16px}
.tpl-hogar .h-seal span{font-size:14px;color:var(--soft)}
@media (max-width:900px){.tpl-hogar .h-trust{grid-template-columns:minmax(0,1fr)}}

.tpl-hogar .h-rev{border-radius:40px;padding:56px;background:var(--ink);color:#fff;display:flex;flex-wrap:wrap;gap:28px;justify-content:space-between;align-items:center}
.tpl-hogar .h-rev h2{font-size:clamp(28px,3vw,44px);font-weight:800;letter-spacing:-.035em}
.tpl-hogar .h-rev p{color:#C9C2BA;margin-top:10px;max-width:30em}
.tpl-hogar .h-rev .h-btn{background:#fff;color:var(--ink)!important}
.tpl-hogar .h-ftr{background:var(--sand);padding-block:64px 40px;margin-top:96px}
.tpl-hogar .h-ftr .top{display:flex;flex-wrap:wrap;justify-content:space-between;gap:28px}
.tpl-hogar .h-ftr .bot{display:flex;flex-wrap:wrap;justify-content:space-between;gap:16px;margin-top:48px;padding-top:24px;border-top:1px solid var(--line);font-size:14px;color:var(--soft)}
.tpl-hogar .h-ftr .bot div{display:flex;flex-wrap:wrap;gap:20px}
.tpl-hogar .h-ftr .h-nav{flex-wrap:wrap;row-gap:10px}
`;

export const hogar: TemplateDesign = {
  id: 'hogar',
  kit: true,
  fonts: 'family=Plus+Jakarta+Sans:ital,wght@0,400;0,500;0,600;0,700;0,800;1,500',
  css: CSS,
  html(m, KIT) {
    const { ORG, CAMPAIGN, ANIMALS, SHOW } = m;
    // El hero muestra hasta 6 retratos (historias); el carrusel, todos.
    const a = ANIMALS.slice(0, 6);
    const slides = a
      .map(
        (x, i) =>
          `<div class="h-slide${i === 0 ? ' on' : ''}" data-i="${i}">${portrait(x, { k: 'hs', dx: 10, dy: 20, s: 1 })}</div>`,
      )
      .join('');
    const cards = ANIMALS.map(
      (x) => `<article class="h-card">
        <a class="ph" href="${x.href}" aria-label="Ver a ${x.name}">${portrait(x, { k: 'hc', dx: 8, dy: 26, s: 1 })}</a>
        <div class="bd"><h3>${x.name}</h3>
          <div class="h-tags"><span>${x.spLabel}</span><span>${x.age}</span><span>${x.sizeLabel}</span>${x.breed ? `<span>${x.breed}</span>` : ''}</div>
          <a class="h-btn" href="${x.href}">Quiero conocer${x.sex === 'Hembra' ? 'la' : 'lo'} ${ic.arrow}</a></div>
      </article>`,
    ).join('');
    const steps = [
      ['Elige', 'Mira los perfiles y envía tu solicitud desde el animal que te enamoró.'],
      ['Conversamos', 'La organización revisa tu solicitud y se pone en contacto contigo.'],
      ['Firmas', 'El contrato de adopción se firma en línea y recibes tu copia.'],
      ['Acompañamos', 'La organización hace el seguimiento de la adopción.'],
    ]
      .map(
        (s, i) =>
          `<div class="h-step"><span class="n">${i + 1}</span><h3>${s[0]}</h3><p>${s[1]}</p></div>`,
      )
      .join('');
    const kick = m.BADGES.length
      ? `<span>${m.BADGES[0].ok ? ic.check : ''}${m.BADGES.map((b) => b.t).join(' · ')}</span>`
      : '';
    return `
<header class="h-hdr" id="h-hdr"><div class="w">
  <nav class="h-nav l" aria-label="Secciones"><a href="#h-animales">Animales</a><a href="#h-adoptar">Cómo adoptar</a></nav>
  <a class="h-logo" href="#h-top"><i>${logoMark(m)}</i><b>${ORG.short}</b></a>
  <nav class="h-nav r" aria-label="Más">${SHOW.nosotros ? '<a href="#h-nosotros">Nosotros</a>' : ''}<a class="h-btn" href="${ORG.donateHref}" data-magnet>Donar</a></nav>
</div></header>
<main id="h-top">
${KIT.tbar()}
<section class="h-hero"><div class="w h-hero-grid">
  <div>
    <p class="h-kick">${kick}${ORG.type ? `${ORG.type}` : ''}${ORG.type && ORG.place ? ' · ' : ''}${ORG.place}</p>
    <h1 class="h-h1">${ORG.name}</h1>
    <p class="h-lede">${ORG.lede || availLine(m, '<em>hogar</em>')}</p>
    <div class="h-ctas"><a class="h-btn lg" href="#h-animales" data-magnet>Conocerlos ${ic.arrow}</a><a class="h-btn ghost lg" href="#h-adoptar">Cómo adoptar</a></div>
  </div>
  <div class="h-stage${a.length ? '' : ' empty'}" id="h-stage">
    ${a.length ? slides : `<div class="h-slide on">${campaignArt(m)}</div>`}
    ${a.length > 1 ? `<div class="h-bars" aria-hidden="true">${a.map(() => '<i><b></b></i>').join('')}</div>` : ''}
    ${
      a.length
        ? `<div class="h-cap"><div class="h-cap-card" aria-live="polite"><b id="h-capn">${a[0].name}</b><span id="h-capd">${a[0].spLabel} · ${a[0].age} · ${a[0].sizeLabel}</span></div>
      ${a.length > 1 ? `<div class="h-stage-nav"><button class="h-round prev" type="button" aria-label="Anterior">${ic.arrow}</button><button class="h-round next" type="button" aria-label="Siguiente">${ic.arrow}</button></div>` : ''}</div>`
        : ''
    }
    <span class="h-blob">${paw()}</span>
  </div>
</div></section>

${KIT.acts(['#h-animales', '#h-animales', ORG.donateHref])}
<section class="h-sec" id="h-animales" data-sec="animales" style="padding-bottom:40px">
  <div class="w h-head"><div><p class="h-eye">Mascotas en adopción</p><h2 class="h-h2">Conócelos uno por uno</h2><p class="h-sub">${ANIMALS.length ? 'Arrastra para ver a todos. Cada perfil tiene su ficha y su solicitud de adopción.' : EMPTY.animales}</p></div>
    ${ANIMALS.length > 1 ? `<div class="h-railbar"><div class="h-prog"><i id="h-prog"></i></div><button class="h-round prev" type="button" id="h-rp" aria-label="Anterior" style="box-shadow:0 0 0 1.5px var(--line)">${ic.arrow}</button><button class="h-round" type="button" id="h-rn" aria-label="Siguiente" style="box-shadow:0 0 0 1.5px var(--line)">${ic.arrow}</button></div>` : ''}</div>
  ${ANIMALS.length ? `<div class="h-rail" id="h-rail">${cards}</div>` : ''}
</section>

<section class="h-sec w" id="h-adoptar">
  <div class="h-head"><div><p class="h-eye">Cómo adoptar</p><h2 class="h-h2">Cuatro pasos, sin vueltas</h2></div></div>
  <div class="h-steps" id="h-steps"><svg class="line" viewBox="0 0 1000 8" preserveAspectRatio="none" aria-hidden="true"><path id="h-path" d="M40 4 H960"/></svg>${steps}</div>
</section>

${
  CAMPAIGN.active
    ? `<section class="w" id="h-campana" data-sec="campana">
  <div class="h-camp h-rv">
    <div class="ph">${campaignArt(m)}</div>
    <div class="bd"><p class="h-eye">Campaña activa · vence ${CAMPAIGN.deadline}</p><h2 class="h-h2" style="font-size:clamp(30px,3.4vw,46px)">${CAMPAIGN.title}</h2>
      <div class="h-ringrow"><div class="h-ring"><svg viewBox="0 0 120 120" aria-hidden="true"><circle class="t" cx="60" cy="60" r="50"/><circle class="v" id="h-ring" cx="60" cy="60" r="50"/></svg><b><span><span id="h-pct">${CAMPAIGN.pct}</span>%</span></b></div>
        <div class="h-money"><b id="h-raised">${fmt(CAMPAIGN.raised)}</b><span>recaudados de ${fmt(CAMPAIGN.goal)}</span></div></div>
      ${CAMPAIGN.description ? `<p style="color:var(--soft)">${CAMPAIGN.description}</p>` : ''}
      <p style="color:var(--soft)">${COPY.adoptNote}</p>
      <div class="h-ctas" style="margin-top:6px"><a class="h-btn lg" href="${CAMPAIGN.href}" data-magnet>Ver campaña y aportar ${ic.arrow}</a></div>
      ${KIT.moreCampaigns()}</div>
  </div>
</section>`
    : KIT.campEmpty()
}
${KIT.needs()}
${KIT.prods()}
${KIT.help()}

${
  SHOW.nosotros
    ? `<section class="h-sec w" id="h-nosotros" data-sec="nosotros">
  <div class="h-trust">
    <p class="h-quote h-rv" style="font-size:clamp(20px,2vw,28px);font-weight:600;line-height:1.45"><b style="display:block;font-size:clamp(34px,4vw,56px);font-weight:800;letter-spacing:-.04em;margin-bottom:14px">Nosotros</b><span>${ORG.about}</span></p>
    <div class="h-seals">
      ${m.BADGES.map((b) => `<div class="h-seal h-rv"><i>${b.ok ? ic.check : ic.clock}</i><div><b>${b.t}</b><span>Estado registrado en AdoptaFácil</span></div></div>`).join('')}
    </div>
  </div>
</section>`
    : ''
}

${KIT.revs()}
${KIT.ledger()}
${KIT.contact()}
</main>
<footer class="h-ftr"><div class="w">
  <div class="top"><a class="h-logo" href="#h-top"><i>${logoMark(m)}</i><b>${ORG.name}</b></a>
    <nav class="h-nav" aria-label="Pie"><a href="#h-animales">Animales</a><a href="#h-adoptar">Cómo adoptar</a><a href="${ORG.donateHref}">Donar</a><button type="button" data-ledger style="background:none;border:0;padding:0;cursor:pointer;font:inherit;font-weight:inherit;color:inherit">Transparencia</button></nav></div>
  ${KIT.socials()}
  <div class="bot"><span>${ORG.place}</span><div><span>Hecho con AdoptaFácil</span></div></div>
</div></footer>`;
  },
  init(app, env) {
    const { m, motion, kit } = env;
    const { signal } = motion;
    const $ = (sel: string) => qs(app, sel);
    const hdr = $('#h-hdr');
    addEventListener('scroll', () => hdr?.classList.toggle('solid', scrollY > 40), {
      passive: true,
      signal,
    });
    // Historias del hero
    const slides = qsa(app, '.h-slide');
    const bars = qsa(app, '.h-bars i');
    const capn = $('#h-capn');
    const capd = $('#h-capd');
    const hero = m.ANIMALS.slice(0, 6);
    let cur = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    function go(i: number) {
      if (hero.length < 2) return;
      cur = (i + slides.length) % slides.length;
      slides.forEach((s, k) => s.classList.toggle('on', k === cur));
      bars.forEach((b, k) => {
        b.className = k < cur ? 'done' : '';
      });
      void bars[cur]?.offsetWidth;
      if (bars[cur]) bars[cur].className = motion.reduce ? 'done' : 'run';
      const x = hero[cur];
      if (capn) capn.textContent = unesc(x.name);
      if (capd) capd.textContent = `${x.spLabel} · ${x.age} · ${x.sizeLabel}`;
      clearTimeout(timer);
      if (!motion.reduce) timer = setTimeout(() => go(cur + 1), 5000);
    }
    go(0);
    signal.addEventListener('abort', () => clearTimeout(timer));
    $('.h-stage .next')?.addEventListener('click', () => go(cur + 1), { signal });
    $('.h-stage .prev')?.addEventListener('click', () => go(cur - 1), { signal });
    // Carrusel con arrastre
    const rail = $('#h-rail');
    const prog = $('#h-prog');
    if (rail && prog) {
      const upd = () => {
        const max = rail.scrollWidth - rail.clientWidth;
        const k = max > 0 ? rail.scrollLeft / max : 0;
        const w = Math.max(18, (rail.clientWidth / Math.max(1, rail.scrollWidth)) * 100);
        prog.style.width = w + '%';
        prog.style.transform = `translateX(${k * (100 / (w / 100) - 100)}%)`;
      };
      rail.addEventListener('scroll', upd, { passive: true, signal });
      upd();
      let down = false;
      let sx = 0;
      let sl = 0;
      let moved = false;
      rail.addEventListener(
        'pointerdown',
        (e) => {
          if (e.pointerType !== 'mouse') return;
          down = true;
          moved = false;
          sx = e.clientX;
          sl = rail.scrollLeft;
          rail.classList.add('drag');
        },
        { signal },
      );
      addEventListener(
        'pointermove',
        (e) => {
          if (!down) return;
          if (Math.abs(e.clientX - sx) > 5) moved = true;
          rail.scrollLeft = sl - (e.clientX - sx);
        },
        { signal },
      );
      addEventListener(
        'pointerup',
        () => {
          if (down) {
            down = false;
            rail.classList.remove('drag');
          }
        },
        { signal },
      );
      // Un arrastre no debe abrir la ficha al soltar.
      rail.addEventListener(
        'click',
        (e) => {
          if (moved) {
            e.preventDefault();
            e.stopPropagation();
            moved = false;
          }
        },
        { capture: true, signal },
      );
      const step = () => (qs(rail, '.h-card')?.offsetWidth ?? 300) + 24;
      $('#h-rn')?.addEventListener(
        'click',
        () => rail.scrollBy({ left: step(), behavior: 'smooth' }),
        { signal },
      );
      $('#h-rp')?.addEventListener(
        'click',
        () => rail.scrollBy({ left: -step(), behavior: 'smooth' }),
        { signal },
      );
    }
    // Pasos que se encienden
    const stepsEl = qsa(app, '.h-step');
    const path = $('#h-path');
    if (path) path.style.strokeDashoffset = '0';
    const stepsBox = $('#h-steps');
    if (stepsBox)
      motion.observe(
        [stepsBox],
        (en, io) => {
          if (!en.isIntersecting) return;
          io.disconnect();
          stepsEl.forEach((s, i) => {
            const t = setTimeout(() => s.classList.add('lit'), motion.reduce ? 0 : 250 + i * 380);
            signal.addEventListener('abort', () => clearTimeout(t));
          });
        },
        { threshold: 0.5 },
      );
    if (typeof IntersectionObserver !== 'function') stepsEl.forEach((s) => s.classList.add('lit'));
    // Anillo y montos
    const ring = $('#h-ring');
    if (ring) {
      const off = String(314 * (1 - m.CAMPAIGN.pct / 100));
      if (motion.reduce || typeof IntersectionObserver !== 'function')
        ring.style.strokeDashoffset = off;
      else
        motion.observe(
          [ring],
          (en, io) => {
            if (!en.isIntersecting) return;
            io.disconnect();
            ring.style.strokeDashoffset = off;
          },
          { threshold: 0.5 },
        );
      motion.countUp($('#h-raised'), m.CAMPAIGN.raised, fmt);
    }
    void kit;
    motion.reveal(app, '.h-rv, .h-card', { stagger: 90 });
    motion.magnet(app);
  },
};
