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
import { availLine, fmt, ic, logoMark, paw, qs } from '../engine/runtime';
import type { TemplateDesign } from '../engine/types';

/*
 * Brisa (gratuita, serie moderna).
 * Clara, aireada y fotográfica: una aurora suave con el color de marca detrás
 * de la portada, cabecera de vidrio que se asienta al bajar, fotos grandes con
 * esquinas generosas y entradas suaves ligadas al scroll (CSS, sin bucles de JS).
 */
const CSS = `
.tpl-brisa{--ink:#14181F;--soft:#5B6472;--line:rgba(20,24,31,.09);--bg:#F7F8FB;--card:#fff;--tint:color-mix(in oklab,var(--brand) 7%,#F1F3F7);--glow:color-mix(in oklab,var(--brand) 55%,#fff);--k-card:var(--card);--k-ink:var(--ink);--k-soft:var(--soft);--k-line:var(--line);--k-tint:var(--tint);--k-r:26px;--k-fd:'Bricolage Grotesque',system-ui,sans-serif;--k-fw:700;--k-ls:-.035em;--k-sh:0 1px 0 rgba(20,24,31,.04),0 18px 40px -28px rgba(20,24,31,.35),0 0 0 1px var(--line);font-family:'Figtree',system-ui,sans-serif;color:var(--ink);background:var(--bg);color-scheme:light}
.tpl-brisa a{color:inherit}
.tpl-brisa .rv{--i:0}
.tpl-brisa .br-prog{position:absolute;left:0;right:0;bottom:-1px;height:2px;background:var(--brand);transform-origin:0 50%;scale:0 1}
.tpl-brisa .br-hdr{position:sticky;top:0;z-index:40;isolation:isolate}
.tpl-brisa .br-hdr::before{content:"";position:absolute;inset:0;z-index:-1;background:rgba(247,248,251,.78);box-shadow:0 1px 0 var(--line);opacity:0;transition:opacity .3s}
@supports ((-webkit-backdrop-filter:blur(1px)) or (backdrop-filter:blur(1px))){.tpl-brisa .br-hdr::before{-webkit-backdrop-filter:saturate(1.6) blur(18px);backdrop-filter:saturate(1.6) blur(18px)}}
.tpl-brisa .br-hdr.on::before{opacity:1}
.tpl-brisa .br-hdr .w{display:flex;align-items:center;gap:14px;min-height:68px}
.tpl-brisa .br-id{display:flex;align-items:center;gap:12px;text-decoration:none;min-width:0}
.tpl-brisa .br-id i{width:40px;height:40px;border-radius:13px;display:grid;place-items:center;font-style:normal;font-weight:800;font-size:14px;background:var(--brand);color:var(--brand-ink);flex:none;overflow:hidden}
.tpl-brisa .br-id b{font-family:var(--k-fd);font-weight:700;font-size:18px;letter-spacing:-.02em;line-height:1.1}
.tpl-brisa .br-nav{display:flex;gap:2px;margin-left:auto}
.tpl-brisa .br-nav a{padding:10px 14px;border-radius:999px;text-decoration:none;font-weight:600;font-size:15px;color:var(--soft);transition:color .2s,background .2s}
.tpl-brisa .br-nav a:hover{color:var(--ink);background:rgba(20,24,31,.05)}
.tpl-brisa .br-don{display:inline-flex;align-items:center;gap:8px;min-height:44px;padding:0 18px;border-radius:999px;background:var(--ink);color:#fff!important;text-decoration:none;font-weight:700;font-size:15px;flex:none}
.tpl-brisa .br-don svg{width:16px}
@media (max-width:860px){.tpl-brisa .br-nav{display:none}.tpl-brisa .br-don{margin-left:auto}}

.tpl-brisa .br-hero{position:relative;padding-block:clamp(28px,5vw,72px) clamp(40px,6vw,88px);overflow:clip}
.tpl-brisa .br-aur{position:absolute;inset:-10% -5% auto;height:120%;pointer-events:none;z-index:0}
.tpl-brisa .br-aur i{position:absolute;border-radius:50%;opacity:.75;will-change:transform;animation:brDrift 22s ease-in-out infinite alternate}
.tpl-brisa .br-aur i:nth-child(1){width:62vmax;height:62vmax;left:-18vmax;top:-26vmax;background:radial-gradient(closest-side,color-mix(in oklab,var(--brand) 32%,transparent),transparent)}
.tpl-brisa .br-aur i:nth-child(2){width:50vmax;height:50vmax;right:-14vmax;top:-12vmax;background:radial-gradient(closest-side,color-mix(in oklab,var(--brand) 18%,#9EC5FF 30%),transparent);animation-duration:28s;animation-delay:-8s}
.tpl-brisa .br-aur i:nth-child(3){width:40vmax;height:40vmax;left:30%;top:20%;background:radial-gradient(closest-side,rgba(255,196,160,.38),transparent);animation-duration:34s;animation-delay:-14s}
@keyframes brDrift{to{transform:translate3d(6vmax,4vmax,0) scale(1.12)}}
.tpl-brisa .br-hin{position:relative;z-index:1;display:grid;grid-template-columns:minmax(0,1.05fr) minmax(0,.95fr);gap:clamp(28px,5vw,72px);align-items:center}
.tpl-brisa .br-kick{display:inline-flex;align-items:center;gap:8px;align-self:flex-start;padding:7px 14px 7px 8px;border-radius:999px;background:rgba(255,255,255,.7);box-shadow:0 0 0 1px var(--line);font-size:14px;font-weight:600;color:var(--soft)}
.tpl-brisa .br-kick span{width:22px;height:22px;border-radius:50%;display:grid;place-items:center;background:var(--brand);color:var(--brand-ink)}
.tpl-brisa .br-kick span svg{width:12px}
.tpl-brisa .br-copy{display:flex;flex-direction:column;gap:22px}
.tpl-brisa .br-h1{font-family:var(--k-fd);font-weight:800;font-size:clamp(46px,7.4vw,104px);line-height:.94;letter-spacing:-.045em}
.tpl-brisa .br-h1 em{font-style:normal;background:linear-gradient(100deg,var(--brand),color-mix(in oklab,var(--brand) 55%,#7A5CFF));-webkit-background-clip:text;background-clip:text;color:transparent}
.tpl-brisa .br-lede{font-size:clamp(17px,1.5vw,20px);line-height:1.6;color:var(--soft);max-width:33em}
.tpl-brisa .br-ctas{display:flex;flex-wrap:wrap;gap:10px}
.tpl-brisa .br-btn{display:inline-flex;align-items:center;gap:10px;min-height:54px;padding:0 24px;border-radius:999px;background:var(--brand);color:var(--brand-ink)!important;text-decoration:none;font-weight:700;font-size:16px;box-shadow:0 14px 30px -14px color-mix(in oklab,var(--brand) 80%,transparent);transition:translate .25s,box-shadow .25s}
.tpl-brisa .br-btn:hover{translate:0 -2px}
.tpl-brisa .br-btn svg{width:18px}
.tpl-brisa .br-btn.gh{background:#fff;color:var(--ink)!important;box-shadow:0 0 0 1px var(--line)}
.tpl-brisa .br-stats{display:flex;flex-wrap:wrap;gap:10px;margin:4px 0 0}
.tpl-brisa .br-stats div{padding:12px 16px;border-radius:18px;background:rgba(255,255,255,.7);box-shadow:0 0 0 1px var(--line);min-width:112px}
.tpl-brisa .br-stats dt{font-size:13px;color:var(--soft)}
.tpl-brisa .br-stats dd{margin:2px 0 0;font-family:var(--k-fd);font-weight:700;font-size:26px;letter-spacing:-.03em;font-variant-numeric:tabular-nums}
.tpl-brisa .br-col{position:relative;display:grid;grid-template-columns:1.25fr 1fr;grid-template-rows:1fr 1fr;gap:14px;aspect-ratio:1/1.02}
.tpl-brisa .br-tile{position:relative;display:block;border-radius:30px;overflow:hidden;background:var(--tint);box-shadow:0 30px 60px -36px rgba(20,24,31,.55);text-decoration:none;color:inherit;transition:translate .5s cubic-bezier(.2,.8,.2,1)}
.tpl-brisa a.br-tile:hover{translate:0 -6px}
.tpl-brisa .br-tile:first-child{grid-row:1/3}
.tpl-brisa .br-tile .portrait{position:absolute;inset:0}
.tpl-brisa .br-tile:only-child{grid-column:1/3}
.tpl-brisa .br-col:has(.br-tile:nth-child(2):last-child) .br-tile:nth-child(2){grid-row:1/3}
.tpl-brisa .br-glass{position:absolute;left:12px;right:12px;bottom:12px;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 14px;border-radius:18px;background:rgba(255,255,255,.82);box-shadow:0 0 0 1px rgba(255,255,255,.5);font-size:14px}
@supports ((-webkit-backdrop-filter:blur(1px)) or (backdrop-filter:blur(1px))){.tpl-brisa .br-glass{background:rgba(255,255,255,.62);-webkit-backdrop-filter:blur(14px) saturate(1.4);backdrop-filter:blur(14px) saturate(1.4)}}
.tpl-brisa .br-glass b{font-family:var(--k-fd);font-size:18px;letter-spacing:-.02em;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tpl-brisa .br-glass span{color:var(--soft);white-space:nowrap}
.tpl-brisa .br-empty-art{position:absolute;inset:0;display:grid;place-items:center;background:linear-gradient(140deg,var(--brand),color-mix(in oklab,var(--brand) 50%,#7A5CFF));color:var(--brand-ink)}
.tpl-brisa .br-empty-art svg{width:34%;opacity:.4}
@media (max-width:900px){.tpl-brisa .br-hin{grid-template-columns:minmax(0,1fr)}.tpl-brisa .br-col{aspect-ratio:1.25/1;max-width:640px}}
@media (max-width:520px){.tpl-brisa .br-col{aspect-ratio:1/1;gap:10px}.tpl-brisa .br-tile{border-radius:24px}.tpl-brisa .br-glass span{display:none}}

.tpl-brisa .k-sec{padding-block:clamp(48px,6.5vw,96px)}
.tpl-brisa .k-h2{font-size:clamp(34px,4.8vw,66px);line-height:.98;letter-spacing:-.04em}
.tpl-brisa .br-hero + .k-sec{padding-top:clamp(8px,2vw,24px)}
.tpl-brisa .k-hd{margin-bottom:clamp(24px,3vw,40px)}
.tpl-brisa .k-eb{font-size:13px;letter-spacing:.14em;color:color-mix(in oklab,var(--brand) 80%,var(--ink))}
.tpl-brisa .k-act{border-radius:var(--k-r);background:#fff}
.tpl-brisa .k-act:first-child{background:linear-gradient(140deg,var(--brand),color-mix(in oklab,var(--brand) 60%,#7A5CFF))}
.tpl-brisa .k-help{background:radial-gradient(80% 120% at 0% 0%,color-mix(in oklab,var(--brand) 70%,#fff),transparent 60%),radial-gradient(90% 120% at 100% 100%,color-mix(in oklab,var(--brand) 55%,#7A5CFF),transparent 60%),var(--brand)}
.tpl-brisa .k-btn{min-height:54px}
.tpl-brisa .k-empty{border-radius:22px}

.tpl-brisa .k-fbar{display:flex;flex-wrap:wrap;gap:10px;align-items:center}
.tpl-brisa .k-q{display:flex;align-items:center;gap:8px;height:48px;padding:0 16px;border-radius:999px;background:#fff;box-shadow:0 0 0 1px var(--line);flex:1 1 240px;min-width:0;max-width:380px}
.tpl-brisa .k-q:focus-within{box-shadow:0 0 0 2px var(--brand)}
.tpl-brisa .k-q svg{width:18px;color:var(--soft);flex:none}
.tpl-brisa .k-q input{border:0;outline:0;background:transparent;min-width:0;width:100%;font-size:16px}
.tpl-brisa .k-chips{display:flex;gap:6px;flex-wrap:wrap}
.tpl-brisa .k-chip{display:inline-flex;align-items:center;gap:8px;height:44px;padding:0 16px;border-radius:999px;border:0;cursor:pointer;background:#fff;box-shadow:0 0 0 1px var(--line);font-weight:600;font-size:15px;transition:background .2s,color .2s}
.tpl-brisa .k-chip span{font-size:12px;opacity:.8;font-variant-numeric:tabular-nums}
.tpl-brisa .k-chip[aria-pressed="true"]{background:var(--ink);color:#fff;box-shadow:none}
.tpl-brisa .k-sort select{height:44px;border-radius:999px;border:0;padding:0 14px;background:#fff;box-shadow:0 0 0 1px var(--line);font-weight:600;font-size:15px;cursor:pointer}
.tpl-brisa .k-cnt{margin:18px 0 22px;font-size:14px;color:var(--soft)}
.tpl-brisa .k-cnt b{color:var(--ink)}
.tpl-brisa .k-more{display:flex;align-items:center;gap:12px;margin:34px auto 0;height:54px;padding:0 26px;border-radius:999px;border:0;cursor:pointer;background:var(--ink);color:#fff;font-weight:700;font-size:15px}
.tpl-brisa .k-more span{font-weight:500;opacity:.65;font-size:13px}

.tpl-brisa .br-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,232px),1fr));gap:clamp(14px,2vw,24px)}
.tpl-brisa .br-card{container-type:inline-size;display:flex;flex-direction:column;border-radius:26px;background:#fff;box-shadow:var(--k-sh);text-decoration:none;overflow:hidden;transition:translate .45s cubic-bezier(.2,.8,.2,1),box-shadow .45s}
.tpl-brisa .br-card:hover{translate:0 -6px;box-shadow:0 1px 0 rgba(20,24,31,.04),0 30px 50px -30px rgba(20,24,31,.45),0 0 0 1px var(--line)}
.tpl-brisa .br-card .ph{position:relative;aspect-ratio:4/5;overflow:hidden;background:var(--tint)}
.tpl-brisa .br-card .ph .portrait{transition:scale .8s cubic-bezier(.2,.8,.2,1)}
.tpl-brisa .br-card:hover .ph .portrait{scale:1.05}
.tpl-brisa .br-card .nw{position:absolute;top:12px;left:12px;padding:5px 11px;border-radius:999px;background:rgba(255,255,255,.88);font-size:12px;font-weight:700;color:var(--ink)}
.tpl-brisa .br-card .cap{display:flex;flex-direction:column;gap:3px;padding:14px 16px 16px}
.tpl-brisa .br-card b{font-family:var(--k-fd);font-weight:700;font-size:22px;letter-spacing:-.03em;line-height:1.1;overflow-wrap:anywhere}
.tpl-brisa .br-card small{font-size:14px;color:var(--soft)}
.tpl-brisa .br-card .tags{display:none;flex-wrap:wrap;gap:6px;margin-top:8px}
.tpl-brisa .br-card .tags i{font-style:normal;font-size:12px;font-weight:600;padding:4px 10px;border-radius:999px;background:var(--tint)}
@container (min-width:250px){.tpl-brisa .br-card .tags{display:flex}}

.tpl-brisa .br-camp{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(0,.8fr);gap:clamp(20px,4vw,56px);align-items:center;padding:clamp(26px,4.4vw,64px);border-radius:36px;background:#fff;box-shadow:var(--k-sh);position:relative;overflow:hidden}
.tpl-brisa .br-camp::before{content:"";position:absolute;width:60%;aspect-ratio:1;right:-20%;top:-40%;border-radius:50%;background:radial-gradient(closest-side,color-mix(in oklab,var(--brand) 22%,transparent),transparent);pointer-events:none}
.tpl-brisa .br-camp h2{font-family:var(--k-fd);font-weight:800;font-size:clamp(34px,4.6vw,64px);line-height:.98;letter-spacing:-.04em;margin-top:10px}
.tpl-brisa .br-camp .tx{display:flex;flex-direction:column;gap:16px;position:relative}
.tpl-brisa .br-camp .k-sub{margin:0}
.tpl-brisa .br-figs{display:flex;flex-wrap:wrap;gap:8px 26px}
.tpl-brisa .br-figs span{display:block;font-size:13px;color:var(--soft)}
.tpl-brisa .br-figs b{font-family:var(--k-fd);font-size:24px;letter-spacing:-.02em;font-variant-numeric:tabular-nums}
@property --brp{syntax:'<number>';inherits:true;initial-value:0}
.tpl-brisa .br-ring{--brp:var(--pct);position:relative;justify-self:center;width:min(100%,300px);aspect-ratio:1;border-radius:50%;background:conic-gradient(var(--brand) calc(var(--brp) * 1%),var(--tint) 0);display:grid;place-items:center}
.tpl-brisa .br-ring::before{content:"";position:absolute;inset:18px;border-radius:50%;background:#fff;box-shadow:inset 0 0 0 1px var(--line)}
.tpl-brisa .br-ring div{position:relative;text-align:center}
.tpl-brisa .br-ring b{display:block;font-family:var(--k-fd);font-weight:800;font-size:clamp(44px,5vw,68px);letter-spacing:-.05em;line-height:1}
.tpl-brisa .br-ring span{font-size:14px;color:var(--soft)}
@media (max-width:860px){.tpl-brisa .br-camp{grid-template-columns:minmax(0,1fr)}.tpl-brisa .br-ring{width:min(70%,240px);grid-row:1}}

.tpl-brisa .br-ftr{padding-block:28px 40px;border-top:1px solid var(--line)}
.tpl-brisa .br-ftr .k-soc{padding-block:6px 18px}
.tpl-brisa .br-fl{display:flex;flex-wrap:wrap;justify-content:space-between;gap:8px 20px;font-size:14px;color:var(--soft)}
.tpl-brisa .br-fl button{background:none;border:0;padding:0;font:inherit;color:inherit;text-decoration:underline;text-underline-offset:3px;cursor:pointer}

/* Lo que está debajo de la portada se pinta cuando se acerca a la pantalla. */
.tpl-brisa .br-late{content-visibility:auto;contain-intrinsic-size:auto 720px}

@media (prefers-reduced-motion:no-preference){
  @supports ((animation-timeline:scroll()) and (animation-range:0 1px)){
    .tpl-brisa .br-prog{animation:brProg linear both;animation-timeline:scroll(root)}
    @keyframes brProg{to{scale:1 1}}
    .tpl-brisa .br-hdr::before{animation:brHdr linear both;animation-timeline:scroll(root);animation-range:0 140px}
    @keyframes brHdr{to{opacity:1}}
  }
  @supports ((animation-timeline:view()) and (animation-range:entry)){
    .tpl-brisa .rv{animation:brIn linear both;animation-timeline:view();animation-range:entry calc(var(--i) * 4%) entry calc(60% + var(--i) * 6%)}
    @keyframes brIn{from{opacity:0;translate:0 48px;scale:.96}}
    .tpl-brisa .br-ring{animation:brRing linear both;animation-timeline:view();animation-range:entry 10% cover 45%}
    @keyframes brRing{from{--brp:0}}
    .tpl-brisa .br-col .br-tile{animation:brPar linear both;animation-timeline:scroll(root);animation-range:0 90vh}
    .tpl-brisa .br-col .br-tile:nth-child(2){--d:-70px}.tpl-brisa .br-col .br-tile:nth-child(3){--d:-30px}
    @keyframes brPar{to{translate:0 var(--d,40px)}}
  }
}
`;

const card = (a: TplAnimal) =>
  `<a class="br-card rv" href="${a.href}" data-id="${a.id}" style="view-transition-name:${vtName('br', a.id)}"><span class="ph">${animalArt(a)}${a.isNew ? '<span class="nw">Recién llegado</span>' : ''}</span><span class="cap"><b>${a.name}</b><small>${meta(a)}</small><span class="tags"><i>${a.sizeLabel}</i>${a.sex ? `<i>${a.sex}</i>` : ''}${a.breed ? `<i>${a.breed}</i>` : ''}</span></span></a>`;

const PAGE = 12;

export const brisa: TemplateDesign = {
  id: 'brisa',
  kit: true,
  fonts: 'family=Bricolage+Grotesque:opsz,wght@12..96,600..800&family=Figtree:wght@400..700',
  css: CSS,
  html(m, KIT) {
    const { ORG, ANIMALS, CAMPAIGN, SHOW } = m;
    const n = ANIMALS.length;
    const lead = leadSource(m);
    const rest = ANIMALS.filter((a) => a !== lead.animal).slice(0, 2);
    const tile = (a: TplAnimal, first: boolean) =>
      `<a class="br-tile" href="${a.href}" aria-label="${a.name}, ${meta(a)}">${animalArt(a, { lead: first, decor: true })}<span class="br-glass"><b>${a.name}</b><span>${meta(a)}</span></span></a>`;
    const tiles =
      lead.kind === 'cover'
        ? [
            `<div class="br-tile">${leadImage(ORG.cover as string, `Portada de ${ORG.name}`)}</div>`,
            ...rest.map((a) => tile(a, false)),
          ]
        : lead.kind === 'animal'
          ? [tile(lead.animal as TplAnimal, true), ...rest.map((a) => tile(a, false))]
          : [`<div class="br-tile"><span class="br-empty-art">${paw()}</span></div>`];
    const stats = [
      `<div><dt>En adopción</dt><dd>${n}</dd></div>`,
      SHOW.transparencia ? `<div><dt>Verificación</dt><dd>Nivel ${ORG.level}</dd></div>` : '',
      CAMPAIGN.active ? `<div><dt>Campaña</dt><dd>${CAMPAIGN.pct}%</dd></div>` : '',
    ].join('');
    const cards = ANIMALS.slice(0, PAGE).map(card).join('');
    return `
<header class="br-hdr"><div class="w">
  <a class="br-id" href="#br-top"><i>${logoMark(m)}</i><b>${ORG.name}</b></a>
  <nav class="br-nav" aria-label="Secciones"><a href="#br-cat">Adopta</a><a href="#br-camp">Campaña</a><a href="#br-ldg">Transparencia</a>${SHOW.contacto ? '<a href="#br-contacto">Contacto</a>' : ''}</nav>
  <a class="br-don" href="${ORG.donateHref}">${ic.heart}Donar</a>
</div><span class="br-prog" aria-hidden="true"></span></header>
${KIT.tbar()}
<main>
<section class="br-hero" id="br-top">
  <div class="br-aur" aria-hidden="true"><i></i><i></i><i></i></div>
  <div class="w br-hin">
    <div class="br-copy">
      <span class="br-kick"><span>${paw()}</span>${[ORG.name, ORG.city].filter(Boolean).join(' · ')}</span>
      <h1 class="br-h1">Un hogar empieza con <em>un sí</em></h1>
      <p class="br-lede">${ORG.lede || availLine(m)}</p>
      <div class="br-ctas"><a class="br-btn" href="#br-cat" data-magnet>${n ? `Conocer ${n === 1 ? 'a quien espera' : `a los ${n}`}` : 'Ver cómo ayudar'} ${ic.arrow}</a><a class="br-btn gh" href="${ORG.donateHref}">${COPY.helpCta}</a></div>
      <dl class="br-stats">${stats}</dl>
    </div>
    <div class="br-col">${tiles.join('')}</div>
  </div>
</section>
${KIT.acts(['#br-cat', '#br-cat', ORG.donateHref], KIT.hd('Cómo participar', 'Tres formas de ayudar'))}
<section class="w k-sec" id="br-cat" data-sec="animales">
  ${KIT.hd('En adopción', n === 1 ? 'Te está esperando' : 'Te están esperando')}
  ${n ? catControls('br-f', 'Busca por nombre o raza') : ''}
  <div class="br-grid" id="br-grid">${n ? cards : `<p class="k-empty">${EMPTY.animales}</p>`}</div>
  <button type="button" class="k-more" id="br-more"${n > PAGE ? '' : ' hidden'}>Ver ${Math.min(PAGE, n - PAGE)} más <span>quedan ${n - PAGE}</span></button>
</section>
${
  CAMPAIGN.active
    ? `<section class="w k-sec" id="br-camp" data-sec="campana"><div class="br-camp rv">
  <div class="tx"><p class="k-eb">Campaña activa${CAMPAIGN.category ? ` · ${CAMPAIGN.category}` : ''}</p><h2>${CAMPAIGN.title}</h2>${CAMPAIGN.description ? `<p class="k-sub">${CAMPAIGN.description}</p>` : ''}
  <div class="br-figs"><div><span>Recaudado</span><b>${fmt(CAMPAIGN.raised)}</b></div><div><span>Meta</span><b>${fmt(CAMPAIGN.goal)}</b></div><div><span>Cierra</span><b>${CAMPAIGN.deadline || '—'}</b></div></div>
  <a class="br-btn" href="${CAMPAIGN.href}" style="align-self:flex-start" data-magnet>Ver campaña y aportar ${ic.arrow}</a>${KIT.moreCampaigns()}</div>
  <div class="br-ring" style="--pct:${CAMPAIGN.pct}" role="img" aria-label="${CAMPAIGN.pct}% de la meta"><div><b>${CAMPAIGN.pct}%</b><span>de la meta</span></div></div>
</div></section>`
    : `<div id="br-camp">${KIT.campEmpty()}</div>`
}
<div class="br-late">${KIT.needs()}${KIT.prods()}</div>
${KIT.help()}
<div class="br-late">${KIT.about()}${KIT.revs()}</div>
<div class="br-late" id="br-ldg">${KIT.ledger()}</div>
<div id="br-contacto">${KIT.contact()}</div>
</main>
<footer class="br-ftr"><div class="w">${KIT.socials()}<div class="br-fl"><span>© ${ORG.name}${ORG.place ? ` · ${ORG.place}` : ''}</span><span><button type="button" data-ledger>Libro público</button></span></div></div></footer>`;
  },
  init(app, env) {
    const { m, motion } = env;
    const hdr = qs(app, '.br-hdr');
    // Sin animaciones ligadas al scroll, la cabecera se asienta con un observador.
    if (hdr && !window.CSS?.supports?.('animation-timeline: scroll()')) {
      const top = qs(app, '#br-top');
      if (top)
        motion.observe([top], (en) => hdr.classList.toggle('on', en.intersectionRatio < 0.9), {
          threshold: [0, 0.9],
        });
    }
    if (m.ANIMALS.length)
      modernCatalog(app, env, {
        id: 'br-f',
        grid: '#br-grid',
        more: '#br-more',
        page: PAGE,
        render: (L) => L.map(card).join(''),
      });
    revealFallback(app, env, '.rv, .k-act, .k-nd, .k-pr, .k-revs figure');
    motion.magnet(app);
  },
};
