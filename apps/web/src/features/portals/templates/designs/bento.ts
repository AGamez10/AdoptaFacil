import { COPY, EMPTY, type TplAnimal } from '../engine/model';
import {
  animalArt,
  leadImage,
  leadSource,
  meta,
  modernCatalog,
  revealFallback,
} from '../engine/modern';
import { catControls, vtName } from '../engine/premium';
import { availLine, fmt, ic, logoMark, paw } from '../engine/runtime';
import type { TemplateDesign } from '../engine/types';

/*
 * Bento (gratuita, serie moderna).
 * Todo el portal en bloques, como el tablero de una app actual: cada pieza es
 * un componente que se adapta a SU espacio (container queries), no al de la
 * pantalla; las cifras escalan con su bloque y los bloques entran con una
 * animación ligada al scroll. Neutra y cálida, con el color de marca como acento.
 */
const CSS = `
.tpl-bento{--ink:#1B1A17;--soft:#6A665E;--line:rgba(27,26,23,.08);--bg:#ECEAE5;--card:#FFFFFF;--tint:#F4F2EE;--k-card:var(--card);--k-ink:var(--ink);--k-soft:var(--soft);--k-line:var(--line);--k-tint:var(--tint);--k-r:28px;--k-fd:'Manrope',system-ui,sans-serif;--k-fw:800;--k-ls:-.045em;--k-sh:0 1px 2px rgba(27,26,23,.05);--gap:clamp(10px,1.2vw,16px);font-family:'Manrope',system-ui,sans-serif;color:var(--ink);background:var(--bg);color-scheme:light}
.tpl-bento a{color:inherit}
.tpl-bento .rv{--i:0}
.tpl-bento .bn-hdr{position:sticky;top:10px;z-index:40;padding-top:10px}
.tpl-bento .bn-bar{display:flex;align-items:center;gap:10px;padding:8px 8px 8px 10px;border-radius:999px;background:rgba(255,255,255,.86);box-shadow:0 0 0 1px var(--line),0 10px 30px -18px rgba(27,26,23,.4)}
@supports ((-webkit-backdrop-filter:blur(1px)) or (backdrop-filter:blur(1px))){.tpl-bento .bn-bar{background:rgba(255,255,255,.7);-webkit-backdrop-filter:blur(16px) saturate(1.5);backdrop-filter:blur(16px) saturate(1.5)}}
.tpl-bento .bn-id{display:flex;align-items:center;gap:10px;text-decoration:none;min-width:0;padding-right:6px}
.tpl-bento .bn-id i{width:38px;height:38px;border-radius:50%;display:grid;place-items:center;font-style:normal;font-weight:800;font-size:13px;background:var(--brand);color:var(--brand-ink);flex:none;overflow:hidden}
.tpl-bento .bn-id b{font-weight:800;font-size:15px;letter-spacing:-.02em;line-height:1.15}
.tpl-bento .bn-nav{display:flex;gap:2px;margin-left:auto}
.tpl-bento .bn-nav a{padding:9px 14px;border-radius:999px;text-decoration:none;font-weight:600;font-size:14px;color:var(--soft)}
.tpl-bento .bn-nav a:hover{background:var(--tint);color:var(--ink)}
.tpl-bento .bn-don{display:inline-flex;align-items:center;gap:8px;min-height:44px;padding:0 18px;border-radius:999px;background:var(--ink);color:#fff!important;text-decoration:none;font-weight:700;font-size:14px;flex:none}
.tpl-bento .bn-don svg{width:15px}
@media (max-width:860px){.tpl-bento .bn-nav{display:none}.tpl-bento .bn-don{margin-left:auto}}

.tpl-bento .bn-tile{container-type:inline-size;position:relative;border-radius:var(--k-r);background:var(--card);box-shadow:var(--k-sh);padding:clamp(18px,2.2vw,28px);overflow:hidden;min-width:0;text-decoration:none;color:inherit}
.tpl-bento a.bn-tile{transition:translate .4s cubic-bezier(.2,.8,.2,1),box-shadow .4s}
.tpl-bento a.bn-tile:hover{translate:0 -4px;box-shadow:0 22px 40px -26px rgba(27,26,23,.45)}
.tpl-bento .bn-lab{display:flex;align-items:center;gap:8px;font-size:13px;font-weight:700;color:var(--soft)}
.tpl-bento .bn-lab svg{width:16px;color:var(--brand)}
.tpl-bento .bn-hero{padding-block:clamp(14px,2vw,22px) clamp(40px,5vw,72px)}
.tpl-bento .bn-grid{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));grid-auto-rows:minmax(150px,auto);gap:var(--gap)}
.tpl-bento .bn-a{grid-column:1/8;grid-row:span 2;display:flex;flex-direction:column;justify-content:space-between;gap:24px;background:var(--card)}
.tpl-bento .bn-a h1{font-weight:800;font-size:clamp(38px,9.5cqi,92px);line-height:.95;letter-spacing:-.05em;overflow-wrap:anywhere}
.tpl-bento .bn-a p{font-size:clamp(16px,2.6cqi,20px);line-height:1.55;color:var(--soft);max-width:34em;margin-top:16px}
.tpl-bento .bn-ctas{display:flex;flex-wrap:wrap;gap:8px}
.tpl-bento .bn-btn{display:inline-flex;align-items:center;gap:10px;min-height:52px;padding:0 22px;border-radius:999px;background:var(--brand);color:var(--brand-ink)!important;text-decoration:none;font-weight:700;font-size:15px}
.tpl-bento .bn-btn svg{width:17px}
.tpl-bento .bn-btn.gh{background:var(--tint);color:var(--ink)!important}
.tpl-bento .bn-b{grid-column:8/13;grid-row:span 2;padding:0;min-height:360px;background:var(--tint)}
.tpl-bento .bn-b .portrait{position:absolute;inset:0}
.tpl-bento .bn-b .cap{position:absolute;left:12px;bottom:12px;display:inline-flex;align-items:center;gap:8px;padding:8px 14px;border-radius:999px;background:rgba(255,255,255,.9);font-size:14px;font-weight:700}
.tpl-bento .bn-b .cap span{font-weight:500;color:var(--soft)}
.tpl-bento .bn-art{position:absolute;inset:0;display:grid;place-items:center;background:var(--brand);color:var(--brand-ink)}
.tpl-bento .bn-art svg{width:34%;opacity:.35}
.tpl-bento .bn-c{grid-column:1/4;display:flex;flex-direction:column;justify-content:space-between;gap:10px}
.tpl-bento .bn-num{font-weight:800;font-size:clamp(44px,30cqi,96px);line-height:.9;letter-spacing:-.06em;font-variant-numeric:tabular-nums}
.tpl-bento .bn-av{display:flex}
.tpl-bento .bn-av span{width:34px;height:34px;border-radius:50%;overflow:hidden;box-shadow:0 0 0 3px var(--card);margin-right:-8px;background:var(--tint)}
.tpl-bento .bn-d{grid-column:4/8;display:flex;flex-direction:column;justify-content:space-between;gap:12px}
.tpl-bento .bn-d b{font-weight:800;font-size:clamp(26px,11cqi,44px);letter-spacing:-.04em;line-height:1}
.tpl-bento .bn-meter{height:10px;border-radius:10px;background:var(--tint);overflow:hidden}
.tpl-bento .bn-meter i{display:block;height:100%;width:100%;border-radius:10px;background:var(--brand);transform-origin:0 50%;scale:var(--v,0) 1}
.tpl-bento .bn-e{grid-column:8/11;display:flex;flex-direction:column;justify-content:space-between;gap:10px}
.tpl-bento .bn-e b{font-weight:800;font-size:clamp(34px,24cqi,64px);letter-spacing:-.05em;line-height:.9;font-variant-numeric:tabular-nums}
.tpl-bento .bn-e small{font-size:13px;color:var(--soft);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.tpl-bento .bn-f{grid-column:11/13;display:flex;flex-direction:column;justify-content:space-between;gap:10px;background:var(--brand);color:var(--brand-ink)}
.tpl-bento .bn-f svg{width:clamp(26px,22cqi,40px)}
.tpl-bento .bn-f b{font-weight:800;font-size:clamp(20px,16cqi,30px);letter-spacing:-.03em;line-height:1}
.tpl-bento .bn-f .bn-lab{color:inherit}
@media (max-width:1000px){.tpl-bento .bn-a,.tpl-bento .bn-b{grid-column:1/-1}.tpl-bento .bn-b{min-height:300px;grid-row:span 1}.tpl-bento .bn-a{grid-row:span 1}.tpl-bento .bn-c,.tpl-bento .bn-d,.tpl-bento .bn-e,.tpl-bento .bn-f{grid-column:span 6}}
@media (max-width:560px){.tpl-bento .bn-grid{grid-auto-rows:minmax(132px,auto)}.tpl-bento .bn-d{grid-column:1/-1}.tpl-bento .bn-c,.tpl-bento .bn-e,.tpl-bento .bn-f{grid-column:span 6}.tpl-bento .bn-c{grid-column:1/-1}}

.tpl-bento .k-sec{padding-block:clamp(36px,5vw,72px)}
.tpl-bento .k-hd{margin-bottom:clamp(18px,2.4vw,30px)}
.tpl-bento .k-eb{font-size:12px;letter-spacing:.14em;color:color-mix(in oklab,var(--brand) 60%,var(--ink))}
.tpl-bento .k-nd .k,.tpl-bento .k-nd a,.tpl-bento .k-lnk{color:color-mix(in oklab,var(--brand) 60%,var(--ink))}
.tpl-bento .k-h2{font-size:clamp(32px,4.4vw,60px);line-height:.98;letter-spacing:-.05em;font-weight:800}
.tpl-bento .k-acts{gap:var(--gap)}
.tpl-bento .k-act{border-radius:var(--k-r);box-shadow:var(--k-sh);min-height:190px}
.tpl-bento .k-act:first-child p,.tpl-bento .k-act:first-child .n{opacity:1}
.tpl-bento .k-needs,.tpl-bento .k-prods,.tpl-bento .k-revs{gap:var(--gap)}
.tpl-bento .k-help{border-radius:36px}
.tpl-bento .k-help p{opacity:1}
.tpl-bento .k-contact{box-shadow:var(--k-sh)}
.tpl-bento .k-empty{background:var(--card)}

.tpl-bento .k-fbar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:8px;border-radius:999px;background:var(--card);box-shadow:var(--k-sh)}
.tpl-bento .k-q{display:flex;align-items:center;gap:8px;height:44px;padding:0 14px;border-radius:999px;background:var(--tint);flex:1 1 220px;min-width:0;max-width:360px}
.tpl-bento .k-q:focus-within{box-shadow:0 0 0 2px var(--brand)}
.tpl-bento .k-q svg{width:18px;color:var(--soft);flex:none}
.tpl-bento .k-q input{border:0;outline:0;background:transparent;min-width:0;width:100%;font-size:16px}
.tpl-bento .k-chips{display:flex;gap:4px;flex-wrap:wrap}
.tpl-bento .k-chip{display:inline-flex;align-items:center;gap:8px;height:44px;padding:0 16px;border-radius:999px;border:0;cursor:pointer;background:transparent;font-weight:700;font-size:14px}
.tpl-bento .k-chip:hover{background:var(--tint)}
.tpl-bento .k-chip span{font-size:12px;opacity:.8;font-variant-numeric:tabular-nums}
.tpl-bento .k-chip[aria-pressed="true"]{background:var(--ink);color:#fff}
.tpl-bento .k-sort{margin-left:auto}
.tpl-bento .k-sort select{height:44px;border-radius:999px;border:0;padding:0 14px;background:var(--tint);font-weight:700;font-size:14px;cursor:pointer}
@media (max-width:700px){.tpl-bento .k-fbar{border-radius:24px}.tpl-bento .k-sort{margin-left:0}}
.tpl-bento .k-cnt{margin:14px 4px 16px;font-size:14px;color:var(--soft)}
.tpl-bento .k-cnt b{color:var(--ink)}
.tpl-bento .k-more{display:flex;align-items:center;gap:12px;margin:26px auto 0;height:54px;padding:0 26px;border-radius:999px;border:0;cursor:pointer;background:var(--ink);color:#fff;font-weight:700;font-size:15px}
.tpl-bento .k-more span{font-weight:500;opacity:.65;font-size:13px}

.tpl-bento .bn-cat{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,210px),1fr));grid-auto-flow:dense;gap:var(--gap)}
.tpl-bento .bn-an{container-type:inline-size;position:relative;display:block;aspect-ratio:4/5;border-radius:var(--k-r);overflow:hidden;background:var(--tint);text-decoration:none;color:#fff;box-shadow:var(--k-sh)}
.tpl-bento .bn-an .portrait{position:absolute;inset:0;transition:scale .8s cubic-bezier(.2,.8,.2,1)}
.tpl-bento .bn-an:hover .portrait{scale:1.06}
.tpl-bento .bn-an::after{content:"";position:absolute;inset:auto 0 0;height:55%;background:linear-gradient(transparent,rgba(12,11,10,.72));pointer-events:none}
.tpl-bento .bn-an .cap{position:absolute;left:0;right:0;bottom:0;z-index:1;display:flex;flex-direction:column;gap:2px;padding:clamp(12px,7cqi,24px)}
.tpl-bento .bn-an b{font-weight:800;font-size:clamp(20px,11cqi,46px);letter-spacing:-.04em;line-height:1;overflow-wrap:anywhere}
.tpl-bento .bn-an small{font-size:clamp(13px,5.4cqi,16px);opacity:.88}
.tpl-bento .bn-an .tg{display:none;flex-wrap:wrap;gap:6px;margin-top:10px}
.tpl-bento .bn-an .tg i{font-style:normal;font-size:12px;font-weight:700;padding:4px 10px;border-radius:999px;background:rgba(255,255,255,.2)}
.tpl-bento .bn-an .nw{position:absolute;top:12px;left:12px;z-index:1;padding:5px 11px;border-radius:999px;background:var(--brand);color:var(--brand-ink);font-size:12px;font-weight:800}
@container (min-width:360px){.tpl-bento .bn-an .tg{display:flex}}
@media (min-width:760px){.tpl-bento .bn-an.big{grid-column:span 2;grid-row:span 2;aspect-ratio:auto}}

.tpl-bento .bn-camp{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:var(--gap)}
.tpl-bento .bn-camp .t{grid-column:1/8;display:flex;flex-direction:column;gap:14px}
.tpl-bento .bn-camp h2{font-weight:800;font-size:clamp(30px,8cqi,60px);line-height:.98;letter-spacing:-.05em}
.tpl-bento .bn-camp .t p{color:var(--soft);font-size:clamp(15px,2.4cqi,18px);line-height:1.55}
.tpl-bento .bn-camp .p{grid-column:8/13;display:flex;flex-direction:column;justify-content:space-between;gap:16px;background:var(--ink);color:#fff}
.tpl-bento .bn-camp .p b{font-weight:800;font-size:clamp(56px,34cqi,150px);line-height:.85;letter-spacing:-.06em;font-variant-numeric:tabular-nums}
.tpl-bento .bn-camp .p .bn-meter{background:rgba(255,255,255,.14)}
.tpl-bento .bn-camp .p .bn-lab{color:rgba(255,255,255,.7)}
.tpl-bento .bn-camp .fg{grid-column:span 4;display:flex;flex-direction:column;gap:4px}
.tpl-bento .bn-camp .fg span{font-size:13px;color:var(--soft);font-weight:600}
.tpl-bento .bn-camp .fg b{font-weight:800;font-size:clamp(22px,10cqi,34px);letter-spacing:-.03em;font-variant-numeric:tabular-nums}
.tpl-bento .bn-camp .tpl-more{grid-column:1/-1;margin:0}
@media (max-width:860px){.tpl-bento .bn-camp .t,.tpl-bento .bn-camp .p{grid-column:1/-1}.tpl-bento .bn-camp .fg{grid-column:span 6}.tpl-bento .bn-camp .fg:last-of-type{grid-column:1/-1}}

.tpl-bento .bn-ftr{padding-block:8px 28px}
.tpl-bento .bn-ftr .bn-tile{display:flex;flex-direction:column;gap:6px}
.tpl-bento .bn-ftr .k-soc{padding-block:0 10px}
.tpl-bento .bn-fl{display:flex;flex-wrap:wrap;justify-content:space-between;gap:8px 20px;font-size:14px;color:var(--soft)}
.tpl-bento .bn-fl button{background:none;border:0;padding:0;font:inherit;color:inherit;text-decoration:underline;text-underline-offset:3px;cursor:pointer}
.tpl-bento .bn-late{content-visibility:auto;contain-intrinsic-size:auto 720px}

@media (prefers-reduced-motion:no-preference){
  @supports ((animation-timeline:view()) and (animation-range:entry)){
    .tpl-bento .rv,.tpl-bento .k-act,.tpl-bento .k-nd,.tpl-bento .k-pr,.tpl-bento .k-revs figure{animation:bnIn linear both;animation-timeline:view();animation-range:entry calc(var(--i,0) * 5%) entry calc(70% + var(--i,0) * 5%)}
    @keyframes bnIn{from{opacity:0;scale:.92;translate:0 30px}}
    .tpl-bento .bn-meter i{animation:bnFill linear both;animation-timeline:view();animation-range:entry 30% cover 40%}
    @keyframes bnFill{from{scale:0 1}}
    /* En la portada la barra ya está a la vista: se llena por tiempo, no por scroll. */
    .tpl-bento .bn-hero .bn-meter i{animation:bnFill 1.2s .3s cubic-bezier(.2,.8,.2,1) both;animation-timeline:auto}
  }
}
`;

const PAGE = 14;
const card = (a: TplAnimal, i: number) =>
  `<a class="bn-an rv${i % 7 === 0 ? ' big' : ''}" href="${a.href}" data-id="${a.id}" style="--i:${i % 3};view-transition-name:${vtName('bn', a.id)}">${animalArt(a, { decor: true, dx: 6, dy: 12, s: 1.1 })}${a.isNew ? '<span class="nw">Nuevo</span>' : ''}<span class="cap"><b>${a.name}</b><small>${meta(a)}</small><span class="tg"><i>${a.sizeLabel}</i>${a.sex ? `<i>${a.sex}</i>` : ''}${a.breed ? `<i>${a.breed}</i>` : ''}</span></span></a>`;

export const bento: TemplateDesign = {
  id: 'bento',
  kit: true,
  fonts: 'family=Manrope:wght@500..800',
  css: CSS,
  html(m, KIT) {
    const { ORG, ANIMALS, CAMPAIGN, SHOW } = m;
    const n = ANIMALS.length;
    const lead = leadSource(m);
    const photo =
      lead.kind === 'cover'
        ? `<div class="bn-tile bn-b">${leadImage(ORG.cover as string, `Portada de ${ORG.name}`)}</div>`
        : lead.kind === 'animal' && lead.animal
          ? `<a class="bn-tile bn-b" href="${lead.animal.href}">${animalArt(lead.animal, { lead: true, decor: true, dx: 6, dy: 12, s: 1.1 })}<span class="cap">${lead.animal.name}<span>${meta(lead.animal)}</span></span></a>`
          : `<div class="bn-tile bn-b"><span class="bn-art">${paw()}</span></div>`;
    const avatars = ANIMALS.slice(0, 4)
      .map((a) => `<span>${animalArt(a, { decor: true, dx: 6, dy: 12, s: 1.1 })}</span>`)
      .join('');
    const trust = SHOW.transparencia
      ? `<a class="bn-tile bn-d rv" href="#bn-ldg" style="--i:1"><span class="bn-lab">${ic.shield}Verificación AdoptaFácil</span><b>Nivel ${ORG.level}${ORG.levelLabel ? ` · ${ORG.levelLabel}` : ''}</b><span><span class="bn-lab" style="justify-content:space-between"><span>Formalización</span><span>${ORG.formalization}%</span></span><span class="bn-meter" style="margin-top:8px"><i style="--v:${ORG.formalization / 100}"></i></span></span></a>`
      : `<a class="bn-tile bn-d rv" href="#bn-ldg" style="--i:1"><span class="bn-lab">${ic.book}Transparencia</span><b>Libro público</b><span class="bn-lab">Cada donación y cada gasto, con fecha.</span></a>`;
    const camp = CAMPAIGN.active
      ? `<a class="bn-tile bn-e rv" href="#bn-camp" style="--i:2"><span class="bn-lab">${ic.heart}Campaña</span><b>${CAMPAIGN.pct}%</b><small>${CAMPAIGN.title}</small></a>`
      : `<a class="bn-tile bn-e rv" href="#bn-needs" style="--i:2"><span class="bn-lab">${ic.bag}Banco de recursos</span><b>${m.NEEDS.length}</b><small>${m.NEEDS.length === 1 ? 'necesidad publicada' : 'necesidades publicadas'}</small></a>`;
    return `
<header class="bn-hdr"><div class="w"><div class="bn-bar">
  <a class="bn-id" href="#bn-top"><i>${logoMark(m)}</i><b>${ORG.name}</b></a>
  <nav class="bn-nav" aria-label="Secciones"><a href="#bn-cat">Adopta</a><a href="#bn-camp">Campaña</a><a href="#bn-ldg">Transparencia</a></nav>
  <a class="bn-don" href="${ORG.donateHref}">${ic.heart}Donar</a>
</div></div></header>
<div style="margin-top:12px">${KIT.tbar()}</div>
<main>
<section class="w bn-hero" id="bn-top"><div class="bn-grid">
  <div class="bn-tile bn-a"><div><span class="bn-lab">${ic.pin}${[ORG.type, ORG.place].filter(Boolean).join(' · ') || 'Adopción responsable'}</span><h1 style="margin-top:18px">${ORG.name}</h1><p>${ORG.lede || availLine(m)}</p></div>
    <div class="bn-ctas"><a class="bn-btn" href="#bn-cat" data-magnet>Ver animales ${ic.arrow}</a><a class="bn-btn gh" href="${ORG.donateHref}">${COPY.helpCta}</a></div></div>
  ${photo}
  <a class="bn-tile bn-c rv" href="#bn-cat"><span class="bn-lab">${ic.paw.replace('<svg', '<svg style="width:16px"')}En adopción</span><span class="bn-num">${n}</span>${avatars ? `<span class="bn-av" aria-hidden="true">${avatars}</span>` : ''}</a>
  ${trust}
  ${camp}
  <a class="bn-tile bn-f rv" href="${ORG.donateHref}" style="--i:3">${ic.heart}<span><span class="bn-lab">Aporta</span><b>Donar</b></span></a>
</div></section>
${KIT.acts(['#bn-cat', '#bn-cat', ORG.donateHref], KIT.hd('Cómo participar', 'Elige cómo ayudar'))}
<section class="w k-sec" id="bn-cat" data-sec="animales">
  ${KIT.hd('En adopción', n === 1 ? 'Conócelo' : 'Conócelos')}
  ${n ? catControls('bn-f', 'Busca por nombre o raza') : ''}
  <div class="bn-cat" id="bn-grid">${n ? ANIMALS.slice(0, PAGE).map(card).join('') : `<p class="k-empty">${EMPTY.animales}</p>`}</div>
  <button type="button" class="k-more" id="bn-more"${n > PAGE ? '' : ' hidden'}>Ver ${Math.min(PAGE, n - PAGE)} más <span>quedan ${n - PAGE}</span></button>
</section>
${
  CAMPAIGN.active
    ? `<section class="w k-sec" id="bn-camp" data-sec="campana"><div class="bn-camp">
  <div class="bn-tile t rv"><span class="bn-lab">${ic.heart}Campaña activa${CAMPAIGN.category ? ` · ${CAMPAIGN.category}` : ''}</span><h2>${CAMPAIGN.title}</h2>${CAMPAIGN.description ? `<p>${CAMPAIGN.description}</p>` : ''}<a class="bn-btn" href="${CAMPAIGN.href}" style="align-self:flex-start;margin-top:auto" data-magnet>Ver campaña y aportar ${ic.arrow}</a></div>
  <div class="bn-tile p rv" style="--i:1"><span class="bn-lab">Avance de la meta</span><b>${CAMPAIGN.pct}%</b><span class="bn-meter" role="img" aria-label="${CAMPAIGN.pct}% de la meta"><i style="--v:${CAMPAIGN.pct / 100}"></i></span></div>
  <div class="bn-tile fg rv"><span>Recaudado</span><b>${fmt(CAMPAIGN.raised)}</b></div>
  <div class="bn-tile fg rv" style="--i:1"><span>Meta</span><b>${fmt(CAMPAIGN.goal)}</b></div>
  <div class="bn-tile fg rv" style="--i:2"><span>Cierra</span><b>${CAMPAIGN.deadline || '—'}</b></div>
  ${KIT.moreCampaigns()}
</div></section>`
    : `<div id="bn-camp">${KIT.campEmpty()}</div>`
}
<div class="bn-late" id="bn-needs">${KIT.needs()}${KIT.prods()}</div>
${KIT.help()}
<div class="bn-late">${KIT.about()}${KIT.revs()}</div>
<div class="bn-late" id="bn-ldg">${KIT.ledger()}</div>
${KIT.contact()}
</main>
<footer class="w bn-ftr"><div class="bn-tile">${KIT.socials()}<div class="bn-fl"><span>© ${ORG.name}${ORG.place ? ` · ${ORG.place}` : ''}</span><span><button type="button" data-ledger>Libro público</button></span></div></div></footer>`;
  },
  init(app, env) {
    if (env.m.ANIMALS.length)
      modernCatalog(app, env, {
        id: 'bn-f',
        grid: '#bn-grid',
        more: '#bn-more',
        page: PAGE,
        render: (L) => L.map(card).join(''),
      });
    revealFallback(app, env, '.rv, .k-act, .k-nd, .k-pr, .k-revs figure');
    env.motion.magnet(app);
  },
};
