import type { TplAnimal } from '../engine/model';
import { animalArt, leadImage, leadSource, meta, revealFallback } from '../engine/modern';
import { pic, premiumDesign, scopedTransition, vtName } from '../engine/premium';
import { availLine, fmt, logoMark, paw, qs, qsa } from '../engine/runtime';

/*
 * Halo (de pago, serie moderna).
 * Pensada como la página de lanzamiento de un producto: titular enorme con un
 * halo de luz detrás, una portada que se abre a todo el ancho mientras bajas,
 * una vitrina horizontal de animales que crecen al pasar por el centro y un
 * catálogo que se reacomoda con transiciones de vista. Todo con CSS ligado al
 * scroll (sin bucles de JavaScript) y con mejora progresiva.
 * Claro, "Día": blanco perla y tinta. Oscuro, "Noche": negro profundo y luz de marca.
 */
const CSS = `
.tpl-halo{--k-fd:'Geist',system-ui,sans-serif;--k-fw:700;--k-ls:-.045em;--k-r:24px;font-family:'Geist',system-ui,sans-serif;--glow:color-mix(in oklab,var(--brand) 70%,#7AA8FF)}
.tpl-halo[data-mode=light]{--k-bg:#FBFBFD;--k-ink:#1D1D1F;--k-soft:#6E6E73;--k-line:rgba(0,0,0,.08);--k-card:#FFFFFF;--k-tint:#F2F2F5;--k-sh:0 0 0 1px rgba(0,0,0,.05),0 20px 40px -30px rgba(0,0,0,.25);--hx:.55;color-scheme:light}
.tpl-halo[data-mode=dark]{--k-bg:#000000;--k-ink:#F5F5F7;--k-soft:#A1A1A6;--k-line:rgba(255,255,255,.1);--k-card:#111113;--k-tint:rgba(255,255,255,.06);--k-sh:0 0 0 1px rgba(255,255,255,.08);--hx:1;color-scheme:dark}
.tpl-halo .rv{--i:0}
.tpl-halo .hl-top{position:sticky;top:0;z-index:40;isolation:isolate}
.tpl-halo .hl-top::before{content:"";position:absolute;inset:0;z-index:-1;background:color-mix(in srgb,var(--k-bg) 80%,transparent);box-shadow:0 1px 0 var(--k-line)}
@supports ((-webkit-backdrop-filter:blur(1px)) or (backdrop-filter:blur(1px))){.tpl-halo .hl-top::before{background:color-mix(in srgb,var(--k-bg) 66%,transparent);-webkit-backdrop-filter:saturate(1.8) blur(20px);backdrop-filter:saturate(1.8) blur(20px)}}
.tpl-halo .hl-top .w{display:flex;align-items:center;gap:12px;min-height:60px}
.tpl-halo .hl-id{display:flex;align-items:center;gap:10px;text-decoration:none;min-width:0}
.tpl-halo .hl-id i{width:32px;height:32px;border-radius:9px;display:grid;place-items:center;font-style:normal;font-weight:700;font-size:12px;background:var(--k-acc);color:var(--k-acc-ink);flex:none;overflow:hidden}
.tpl-halo .hl-id b{font-weight:600;font-size:15px;letter-spacing:-.01em;line-height:1.15}
.tpl-halo .hl-nav{display:flex;gap:2px;margin-left:auto}
.tpl-halo .hl-nav a{padding:8px 12px;text-decoration:none;font-size:14px;color:var(--k-soft);border-radius:999px}
.tpl-halo .hl-nav a:hover{color:var(--k-ink)}
.tpl-halo .hl-top .k-mode{height:38px;font-size:13px}
.tpl-halo .hl-don{display:inline-flex;align-items:center;min-height:38px;padding:0 16px;border-radius:999px;background:var(--k-ink);color:var(--k-bg)!important;text-decoration:none;font-weight:600;font-size:14px;flex:none}
@media (max-width:860px){.tpl-halo .hl-nav{display:none}.tpl-halo .hl-top .k-mode{margin-left:auto}.tpl-halo .hl-top .k-mode span{display:none}.tpl-halo .hl-top .k-mode{padding:0 11px}}

.tpl-halo .hl-hero{position:relative;text-align:center;padding-block:clamp(56px,10vw,132px) clamp(36px,5vw,64px);overflow:clip}
.tpl-halo .hl-halo{position:absolute;left:50%;top:clamp(20px,4vw,60px);width:min(980px,130vw);aspect-ratio:1;translate:-50% 0;pointer-events:none;opacity:var(--hx)}
.tpl-halo .hl-halo::before,.tpl-halo .hl-halo::after{content:"";position:absolute;inset:0;border-radius:50%}
.tpl-halo .hl-halo::before{background:conic-gradient(from 0deg,transparent 0 12%,color-mix(in oklab,var(--brand) 60%,transparent) 24%,transparent 38%,color-mix(in oklab,var(--glow) 55%,transparent) 62%,transparent 76%);-webkit-mask:radial-gradient(closest-side,transparent 64%,#000 66%,#000 70%,transparent 74%);mask:radial-gradient(closest-side,transparent 64%,#000 66%,#000 70%,transparent 74%);animation:hlSpin 26s linear infinite;will-change:transform}
.tpl-halo .hl-halo::after{background:radial-gradient(closest-side,color-mix(in oklab,var(--brand) 26%,transparent),transparent 70%)}
@keyframes hlSpin{to{rotate:1turn}}
.tpl-halo .hl-hero .w{position:relative;display:flex;flex-direction:column;align-items:center;gap:22px}
.tpl-halo .hl-eb{font-size:15px;font-weight:600;color:var(--k-acc)}
.tpl-halo[data-mode=dark] .hl-eb{color:var(--glow)}
.tpl-halo .hl-h1{font-weight:700;font-size:clamp(48px,9vw,128px);line-height:.95;letter-spacing:-.055em;max-width:11em}
.tpl-halo .hl-g{background:linear-gradient(92deg,var(--k-ink) 10%,var(--brand) 55%,var(--glow) 95%);-webkit-background-clip:text;background-clip:text;color:transparent}
.tpl-halo .hl-lede{font-size:clamp(18px,1.7vw,22px);line-height:1.5;color:var(--k-soft);max-width:32em}
.tpl-halo .hl-cta{display:flex;flex-wrap:wrap;gap:12px;justify-content:center}
.tpl-halo .hl-cta .k-btn{min-height:52px}
.tpl-halo .hl-cta .gh{display:inline-flex;align-items:center;gap:8px;min-height:52px;padding:0 22px;border-radius:999px;text-decoration:none;font-weight:600;color:var(--k-acc)}
.tpl-halo[data-mode=dark] .hl-cta .gh{color:var(--glow)}
.tpl-halo .hl-cta .gh svg{width:16px}

.tpl-halo .hl-stage{padding-inline:clamp(12px,3vw,40px);padding-bottom:clamp(40px,6vw,90px)}
.tpl-halo .hl-frame{position:relative;max-width:1440px;margin:0 auto;aspect-ratio:16/8;border-radius:clamp(22px,3vw,40px);overflow:hidden;background:var(--k-tint);transform-origin:50% 0}
.tpl-halo .hl-frame>.portrait,.tpl-halo .hl-frame>a>.portrait{position:absolute;inset:0}
.tpl-halo .hl-frame>a{position:absolute;inset:0}
.tpl-halo .hl-art{position:absolute;inset:0;display:grid;place-items:center;background:radial-gradient(60% 80% at 50% 120%,var(--glow),transparent 70%),var(--brand);color:var(--brand-ink)}
.tpl-halo .hl-art svg{width:22%;opacity:.3}
.tpl-halo .hl-cap{position:absolute;left:50%;bottom:clamp(12px,2vw,26px);translate:-50% 0;display:flex;gap:0;border-radius:22px;background:rgba(255,255,255,.82);color:#1D1D1F;box-shadow:0 10px 30px -10px rgba(0,0,0,.3);overflow:hidden;max-width:calc(100% - 24px)}
@supports ((-webkit-backdrop-filter:blur(1px)) or (backdrop-filter:blur(1px))){.tpl-halo .hl-cap{background:rgba(255,255,255,.6);-webkit-backdrop-filter:blur(20px) saturate(1.6);backdrop-filter:blur(20px) saturate(1.6)}}
.tpl-halo[data-mode=dark] .hl-cap{background:rgba(20,20,22,.7);color:#F5F5F7}
.tpl-halo .hl-cap div{padding:12px clamp(14px,2vw,24px);display:flex;flex-direction:column;gap:2px;min-width:0}
.tpl-halo .hl-cap div+div{border-left:1px solid rgba(127,127,127,.25)}
.tpl-halo .hl-cap span{font-size:12px;opacity:.7;white-space:nowrap}
.tpl-halo .hl-cap b{font-size:clamp(18px,2vw,26px);font-weight:700;letter-spacing:-.03em;font-variant-numeric:tabular-nums;white-space:nowrap}
@media (max-width:700px){.tpl-halo .hl-frame{aspect-ratio:4/5}.tpl-halo .hl-cap div:nth-child(3){display:none}}

.tpl-halo .hl-railw{position:relative}
.tpl-halo .hl-rail{display:grid;grid-auto-flow:column;grid-auto-columns:clamp(230px,24vw,330px);gap:clamp(12px,1.6vw,22px);overflow-x:auto;scroll-snap-type:x mandatory;overscroll-behavior-x:contain;scrollbar-width:none;padding:10px max(16px,calc((100% - 1320px) / 2 + 40px)) 26px;scroll-padding-inline:max(16px,calc((100% - 1320px) / 2 + 40px))}
.tpl-halo .hl-rail::-webkit-scrollbar{display:none}
.tpl-halo .hl-slide{scroll-snap-align:start;display:flex;flex-direction:column;gap:12px;text-decoration:none;color:inherit}
.tpl-halo .hl-slide .ph{position:relative;aspect-ratio:3/4;border-radius:var(--k-r);overflow:hidden;background:var(--k-tint);box-shadow:var(--k-sh)}
.tpl-halo .hl-slide .ph .portrait{position:absolute;inset:0;transition:scale .8s cubic-bezier(.2,.8,.2,1)}
.tpl-halo .hl-slide:hover .ph .portrait{scale:1.05}
.tpl-halo .hl-slide b{font-size:22px;font-weight:700;letter-spacing:-.03em}
.tpl-halo .hl-slide small{display:block;font-size:14px;color:var(--k-soft)}
.tpl-halo .hl-nb{display:flex;gap:8px;justify-content:flex-end;margin-top:-8px}
.tpl-halo .hl-nb button{width:44px;height:44px;border-radius:50%;border:0;background:var(--k-tint);color:var(--k-ink);display:grid;place-items:center;cursor:pointer}
.tpl-halo .hl-nb button svg{width:18px}
.tpl-halo .hl-nb button:disabled{opacity:.35;cursor:default}
@media (hover:none){.tpl-halo .hl-nb{display:none}}

.tpl-halo .hl-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,220px),1fr));gap:clamp(16px,2vw,28px) clamp(12px,1.6vw,20px)}
.tpl-halo .hl-card{container-type:inline-size;display:flex;flex-direction:column;gap:12px;text-decoration:none;color:inherit}
.tpl-halo .hl-card .ph{position:relative;aspect-ratio:4/5;border-radius:var(--k-r);overflow:hidden;background:var(--k-tint);box-shadow:var(--k-sh)}
.tpl-halo .hl-card .ph .portrait{position:absolute;inset:0;transition:scale .8s cubic-bezier(.2,.8,.2,1)}
.tpl-halo .hl-card:hover .ph .portrait{scale:1.05}
.tpl-halo .hl-card .nw{position:absolute;top:12px;left:12px;padding:5px 10px;border-radius:999px;background:rgba(255,255,255,.88);color:#1D1D1F;font-size:12px;font-weight:600}
.tpl-halo .hl-card .row{display:flex;justify-content:space-between;align-items:baseline;gap:10px;padding:0 4px}
.tpl-halo .hl-card b{font-size:20px;font-weight:700;letter-spacing:-.03em;min-width:0;overflow-wrap:anywhere}
.tpl-halo .hl-card small{font-size:14px;color:var(--k-soft);padding:0 4px;margin-top:-8px}
.tpl-halo .hl-card .go{font-size:14px;font-weight:600;color:var(--k-acc);white-space:nowrap;display:none}
.tpl-halo[data-mode=dark] .hl-card .go{color:var(--glow)}
@container (min-width:240px){.tpl-halo .hl-card .go{display:inline}}
.tpl-halo[data-mode=dark] .hl-card:hover .ph,.tpl-halo[data-mode=dark] .hl-slide:hover .ph{box-shadow:0 0 0 1px color-mix(in oklab,var(--glow) 50%,transparent),0 30px 60px -30px color-mix(in oklab,var(--glow) 70%,transparent)}

.tpl-halo .hl-camp{position:relative;text-align:center;display:flex;flex-direction:column;align-items:center;gap:18px;padding:clamp(36px,6vw,96px) clamp(18px,4vw,64px);border-radius:clamp(26px,3vw,44px);background:var(--k-card);box-shadow:var(--k-sh);overflow:hidden}
.tpl-halo .hl-camp::before{content:"";position:absolute;left:50%;top:-30%;width:90%;aspect-ratio:1;translate:-50% 0;border-radius:50%;background:radial-gradient(closest-side,color-mix(in oklab,var(--brand) calc(var(--hx) * 22%),transparent),transparent);pointer-events:none}
.tpl-halo .hl-camp>*{position:relative}
.tpl-halo .hl-camp h2{font-weight:700;font-size:clamp(34px,5vw,72px);line-height:.98;letter-spacing:-.05em;max-width:14em}
.tpl-halo .hl-pct{font-weight:800;font-size:clamp(96px,18vw,260px);line-height:.85;letter-spacing:-.07em;font-variant-numeric:tabular-nums}
.tpl-halo .hl-line{width:min(100%,640px);height:6px;border-radius:6px;background:var(--k-tint);overflow:hidden}
.tpl-halo .hl-line i{display:block;height:100%;width:100%;background:linear-gradient(90deg,var(--brand),var(--glow));transform-origin:0 50%;scale:var(--v) 1;border-radius:6px}
.tpl-halo .hl-figs{display:flex;flex-wrap:wrap;justify-content:center;gap:10px 36px}
.tpl-halo .hl-figs span{display:block;font-size:13px;color:var(--k-soft)}
.tpl-halo .hl-figs b{font-size:clamp(20px,2vw,28px);font-weight:700;letter-spacing:-.03em;font-variant-numeric:tabular-nums}
.tpl-halo .hl-camp .tpl-more{width:min(100%,640px);text-align:left}
.tpl-halo .k-act,.tpl-halo .k-nd,.tpl-halo .k-pr,.tpl-halo .k-revs figure{border-radius:var(--k-r)}
.tpl-halo .k-help{background:radial-gradient(70% 120% at 50% 120%,var(--glow),transparent 70%),var(--brand)}
.tpl-halo[data-mode=dark] .k-act{background:linear-gradient(180deg,rgba(255,255,255,.05),transparent),var(--k-card)}
.tpl-halo[data-mode=dark] .k-act:first-child{background:radial-gradient(90% 90% at 0% 0%,var(--glow),transparent 70%),var(--k-acc)}
.tpl-halo .hl-late{content-visibility:auto;contain-intrinsic-size:auto 760px}

@media (prefers-reduced-motion:no-preference){
  @supports ((animation-timeline:view()) and (animation-range:entry)){
    .tpl-halo .hl-frame{animation:hlGrow linear both;animation-timeline:view();animation-range:entry 0% cover 42%}
    @keyframes hlGrow{from{scale:.86;opacity:.6}}
    .tpl-halo .hl-hero .w{animation:hlLift linear both;animation-timeline:scroll(root);animation-range:0 70vh}
    @keyframes hlLift{to{opacity:0;translate:0 -80px;scale:.96}}
    .tpl-halo .hl-slide{animation:hlSlide linear both;animation-timeline:view(inline)}
    @keyframes hlSlide{entry 0%{opacity:.25;scale:.88}entry 100%,exit 0%{opacity:1;scale:1}exit 100%{opacity:.25;scale:.88}}
    .tpl-halo .rv,.tpl-halo .k-act,.tpl-halo .k-nd,.tpl-halo .k-pr,.tpl-halo .k-revs figure{animation:hlIn linear both;animation-timeline:view();animation-range:entry calc(var(--i,0) * 5%) entry calc(65% + var(--i,0) * 5%)}
    @keyframes hlIn{from{opacity:0;translate:0 56px}}
    .tpl-halo .hl-line i{animation:hlFill linear both;animation-timeline:view();animation-range:entry 40% cover 50%}
    @keyframes hlFill{from{scale:0 1}}
    .tpl-halo .hl-pct{animation:hlPct linear both;animation-timeline:view();animation-range:entry 0% cover 40%}
    @keyframes hlPct{from{opacity:0;scale:.8;filter:blur(12px)}}
  }
}
`;

const card = (a: TplAnimal, i: number) =>
  `<a class="hl-card rv" href="${a.href}" data-id="${a.id}" style="--i:${i % 4};view-transition-name:${vtName('hl', a.id)}"><span class="ph">${animalArt(a, { decor: true })}${a.isNew ? '<span class="nw">Recién llegado</span>' : ''}</span><span class="row"><b>${a.name}</b><span class="go">Conocer ›</span></span><small>${meta(a)}</small></a>`;

const slide = (a: TplAnimal) =>
  `<a class="hl-slide" href="${a.href}" tabindex="-1"><span class="ph">${animalArt(a, { decor: true })}</span><span><b>${a.name}</b><small>${meta(a)}${a.breed ? ` · ${a.breed}` : ''}</small></span></a>`;

export const halo = premiumDesign({
  id: 'halo',
  catId: 'hl-cat',
  modes: { light: 'Día', dark: 'Noche' },
  fonts: 'family=Geist:wght@400..800',
  css: CSS,
  html({ m, P }) {
    const { ORG, ANIMALS, CAMPAIGN, SHOW } = m;
    const n = ANIMALS.length;
    const lead = leadSource(m);
    const frame =
      lead.kind === 'cover'
        ? leadImage(ORG.cover as string, `Portada de ${ORG.name}`)
        : lead.kind === 'animal' && lead.animal
          ? `<a href="${lead.animal.href}" aria-label="Conocer a ${lead.animal.name}">${animalArt(lead.animal, { lead: true, decor: true })}</a>`
          : `<span class="hl-art">${paw()}</span>`;
    const cap = [
      `<div><span>En adopción</span><b>${n}</b></div>`,
      SHOW.transparencia ? `<div><span>Verificación</span><b>Nivel ${ORG.level}</b></div>` : '',
      CAMPAIGN.active ? `<div><span>Campaña</span><b>${CAMPAIGN.pct}%</b></div>` : '',
    ].join('');
    const rail =
      n >= 4
        ? `<div class="hl-railw"><div class="w"><div class="hl-nb"><button type="button" data-rail="-1" aria-label="Anteriores">${pic.back}</button><button type="button" data-rail="1" aria-label="Siguientes">${pic.arrow}</button></div></div><div class="hl-rail" id="hl-rail" role="region" aria-label="Algunos de los que esperan hogar">${ANIMALS.slice(0, 10).map(slide).join('')}</div></div>`
        : '';
    return `
<header class="hl-top"><div class="w"><a class="hl-id" href="#hl-top"><i>${logoMark(m)}</i><b>${ORG.name}</b></a><nav class="hl-nav" aria-label="Secciones"><a href="#hl-cat">Adopta</a><a href="#hl-camp">Campaña</a><a href="#hl-ldg">Transparencia</a></nav>${P.modeBtn()}<a class="hl-don" href="${ORG.donateHref}">Donar</a></div></header>
${P.tbar()}
<section class="hl-hero" id="hl-top"><div class="hl-halo" aria-hidden="true"></div><div class="w">
  <p class="hl-eb">${[ORG.name, ORG.city].filter(Boolean).join(' · ')}</p>
  <h1 class="hl-h1">Cada historia <span class="hl-g">merece un final feliz.</span></h1>
  <p class="hl-lede">${ORG.lede || availLine(m)}</p>
  <div class="hl-cta"><a class="k-btn" href="#hl-cat" data-magnet>${n ? 'Conocerlos' : 'Cómo ayudar'} ${pic.arrow}</a><a class="gh" href="${ORG.donateHref}">Hacer una donación ${pic.arrow}</a></div>
</div></section>
<div class="hl-stage"><div class="hl-frame">${frame}<div class="hl-cap">${cap}</div></div></div>
${P.acts(P.hd('Cómo participar', 'Tres maneras de cambiar una vida'))}
<section class="k-sec" data-sec="animales" id="hl-cat">
  <div class="w">${P.hd('En adopción', n === 1 ? 'Te está esperando.' : 'Te están esperando.', '', n ? 'Desliza la vitrina o busca en el catálogo completo.' : '')}</div>
  ${rail}
  <div class="w" style="margin-top:clamp(24px,3vw,40px)">${n ? P.catControls('hl-f', 'Busca por nombre o raza') : ''}<div class="hl-grid" id="hl-grid"></div><button type="button" class="k-more" id="hl-more" hidden></button></div>
</section>
${P.campaign(
  () => `<section class="w k-sec" data-sec="campana" id="hl-camp"><div class="hl-camp">
  <p class="k-eb">Campaña activa${CAMPAIGN.category ? ` · ${CAMPAIGN.category}` : ''}</p><h2>${CAMPAIGN.title}</h2>${CAMPAIGN.description ? `<p class="k-sub" style="margin:0">${CAMPAIGN.description}</p>` : ''}
  <p class="hl-pct hl-g" aria-label="${CAMPAIGN.pct}% de la meta">${CAMPAIGN.pct}%</p>
  <div class="hl-line" aria-hidden="true"><i style="--v:${CAMPAIGN.pct / 100}"></i></div>
  <div class="hl-figs"><div><span>Recaudado</span><b>${fmt(CAMPAIGN.raised)}</b></div><div><span>Meta</span><b>${fmt(CAMPAIGN.goal)}</b></div><div><span>Cierra</span><b>${CAMPAIGN.deadline || '—'}</b></div></div>
  <a class="k-btn" href="${CAMPAIGN.href}" data-magnet>Ver campaña y aportar ${pic.arrow}</a>${P.more()}
</div></section>`,
  P.hd('Campaña activa', 'Sin campaña por ahora'),
).replace('data-sec="campana">', 'data-sec="campana" id="hl-camp">')}
<div class="hl-late">${P.needs()}${P.prods()}</div>
${P.help()}
<div class="hl-late">${P.about()}${P.revs()}</div>
<div class="hl-late" id="hl-ldg">${P.ledger()}</div>
${P.contact()}
${P.foot()}`;
  },
  init(app, { env, fx, cat }) {
    fx.fillOnView(app, '.k-bar');
    fx.magnet(app);
    cat({
      id: 'hl-f',
      grid: '#hl-grid',
      more: '#hl-more',
      page: 12,
      render: (L) => L.map(card).join(''),
      transition: scopedTransition,
    });
    revealFallback(app, env, '.rv, .k-act, .k-nd, .k-pr, .k-revs figure');
    const rail = qs(app, '#hl-rail');
    if (!rail) return;
    const btns = qsa<HTMLButtonElement>(app, '[data-rail]');
    const sync = () => {
      const max = rail.scrollWidth - rail.clientWidth - 2;
      btns.forEach((b) => (b.disabled = b.dataset.rail === '-1' ? rail.scrollLeft <= 2 : rail.scrollLeft >= max));
    };
    btns.forEach((b) =>
      b.addEventListener(
        'click',
        () =>
          rail.scrollBy({
            left: Number(b.dataset.rail) * rail.clientWidth * 0.8,
            behavior: fx.reduce ? 'auto' : 'smooth',
          }),
        { signal: fx.signal },
      ),
    );
    rail.addEventListener('scrollend' in window ? 'scrollend' : 'scroll', sync, {
      signal: fx.signal,
      passive: true,
    });
    sync();
  },
});
