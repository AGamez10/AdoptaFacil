import type { TplAnimal } from '../engine/model';
import { animalArt, leadSource, meta, revealFallback } from '../engine/modern';
import { pic, premiumDesign, scopedTransition, vtName } from '../engine/premium';
import { availLine, fmt, logoMark, paw, qs } from '../engine/runtime';

/*
 * Prisma (de pago, serie moderna).
 * Vidrio y luz de colores: la portada es un abanico de fichas de cristal que se
 * despliega al cargar y se inclina siguiendo el cursor; cada ficha del catálogo
 * tiene un brillo holográfico que sigue al puntero y el catálogo se reacomoda
 * con transiciones de vista. Claro, "Cristal": vidrio esmerilado sobre un
 * degradado iridiscente. Oscuro, "Neón": negro profundo con bordes de luz.
 * El vidrio (backdrop-filter) solo se usa en piezas grandes y pocas, para no
 * cargar el scroll; los brillos son gradientes que pinta la GPU.
 */
const CSS = `
.tpl-prisma{--k-fd:'Sora',system-ui,sans-serif;--k-fw:700;--k-ls:-.04em;--k-r:26px;font-family:'Sora',system-ui,sans-serif;--c1:var(--brand);--c2:color-mix(in oklab,var(--brand) 30%,#8B5CF6);--c3:color-mix(in oklab,var(--brand) 25%,#F472B6);--c4:color-mix(in oklab,var(--brand) 25%,#38BDF8)}
.tpl-prisma[data-mode=light]{--k-bg:#F6F5FB;--k-ink:#17142A;--k-soft:#5F5A78;--k-line:rgba(23,20,42,.1);--k-card:rgba(255,255,255,.78);--k-tint:rgba(23,20,42,.05);--k-sh:0 0 0 1px rgba(255,255,255,.7),0 1px 0 rgba(23,20,42,.04),0 24px 48px -30px rgba(52,30,120,.35);--edge:rgba(255,255,255,.9);--glass:rgba(255,255,255,.55);color-scheme:light}
.tpl-prisma[data-mode=dark]{--k-bg:#07060D;--k-ink:#F3F1FF;--k-soft:#A7A2C4;--k-line:rgba(190,180,255,.14);--k-card:rgba(22,19,40,.82);--k-tint:rgba(190,180,255,.08);--k-sh:0 0 0 1px rgba(190,180,255,.14),0 30px 60px -30px rgba(0,0,0,.8);--edge:rgba(190,180,255,.28);--glass:rgba(20,17,36,.55);color-scheme:dark}
.tpl-prisma .rv{--i:0}
.tpl-prisma .pr-bg{position:absolute;inset:0 0 auto;height:min(1100px,140vh);overflow:hidden;pointer-events:none;z-index:0}
.tpl-prisma .pr-bg i{position:absolute;border-radius:50%;will-change:transform;animation:prFloat 24s ease-in-out infinite alternate}
.tpl-prisma .pr-bg i:nth-child(1){width:70vmax;height:70vmax;left:-25vmax;top:-30vmax;background:radial-gradient(closest-side,color-mix(in oklab,var(--c2) 45%,transparent),transparent)}
.tpl-prisma .pr-bg i:nth-child(2){width:60vmax;height:60vmax;right:-22vmax;top:-18vmax;background:radial-gradient(closest-side,color-mix(in oklab,var(--c4) 45%,transparent),transparent);animation-duration:30s;animation-delay:-10s}
.tpl-prisma .pr-bg i:nth-child(3){width:46vmax;height:46vmax;left:28%;top:26%;background:radial-gradient(closest-side,color-mix(in oklab,var(--c3) 40%,transparent),transparent);animation-duration:36s;animation-delay:-18s}
.tpl-prisma[data-mode=dark] .pr-bg i{opacity:.55}
@keyframes prFloat{to{transform:translate3d(5vmax,6vmax,0) rotate(30deg) scale(1.1)}}
.tpl-prisma .pr-top,.tpl-prisma .k-tb,.tpl-prisma .pr-hero{position:relative;z-index:2}
.tpl-prisma .pr-top{position:sticky;top:0;z-index:40;padding-block:10px}
.tpl-prisma .pr-bar{display:flex;align-items:center;gap:10px;padding:8px 8px 8px 12px;border-radius:22px;background:color-mix(in srgb,var(--k-bg) 82%,transparent);box-shadow:inset 0 0 0 1px var(--edge),0 16px 40px -24px rgba(40,20,100,.4)}
@supports ((-webkit-backdrop-filter:blur(1px)) or (backdrop-filter:blur(1px))){.tpl-prisma .pr-bar{background:var(--glass);-webkit-backdrop-filter:blur(22px) saturate(1.8);backdrop-filter:blur(22px) saturate(1.8)}}
.tpl-prisma .pr-id{display:flex;align-items:center;gap:10px;text-decoration:none;min-width:0}
.tpl-prisma .pr-id i{width:36px;height:36px;border-radius:12px;display:grid;place-items:center;font-style:normal;font-weight:700;font-size:13px;background:linear-gradient(135deg,var(--c1),var(--c2));color:#fff;flex:none;overflow:hidden}
.tpl-prisma .pr-id b{font-weight:600;font-size:15px;letter-spacing:-.02em;line-height:1.15}
.tpl-prisma .pr-nav{display:flex;gap:2px;margin-left:auto}
.tpl-prisma .pr-nav a{padding:9px 13px;border-radius:14px;text-decoration:none;font-size:14px;color:var(--k-soft)}
.tpl-prisma .pr-nav a:hover{color:var(--k-ink);background:var(--k-tint)}
.tpl-prisma .pr-top .k-mode{height:42px;font-size:13px;background:var(--k-tint)}
.tpl-prisma .pr-don{display:inline-flex;align-items:center;min-height:42px;padding:0 16px;border-radius:14px;background:linear-gradient(135deg,var(--c1),var(--c2));color:#fff!important;text-decoration:none;font-weight:600;font-size:14px;flex:none}
@media (max-width:860px){.tpl-prisma .pr-nav{display:none}.tpl-prisma .pr-top .k-mode{margin-left:auto}.tpl-prisma .pr-top .k-mode span{display:none}.tpl-prisma .pr-top .k-mode{padding:0 11px}}
.tpl-prisma .k-tb{background:transparent}

.tpl-prisma .pr-hero{padding-block:clamp(36px,7vw,110px) clamp(48px,7vw,110px)}
.tpl-prisma .pr-hin{display:grid;grid-template-columns:minmax(0,1.05fr) minmax(0,.95fr);gap:clamp(30px,5vw,80px);align-items:center}
.tpl-prisma .pr-copy{display:flex;flex-direction:column;gap:22px;align-items:flex-start}
.tpl-prisma .pr-pill{display:inline-flex;align-items:center;gap:8px;padding:7px 14px 7px 7px;border-radius:999px;background:var(--k-card);box-shadow:inset 0 0 0 1px var(--edge);font-size:13px;font-weight:600;color:var(--k-soft)}
.tpl-prisma .pr-pill span{width:22px;height:22px;border-radius:50%;display:grid;place-items:center;background:conic-gradient(from 200deg,var(--c1),var(--c2),var(--c3),var(--c4),var(--c1));color:#fff}
.tpl-prisma .pr-pill span svg{width:12px}
.tpl-prisma .pr-h1{font-weight:700;font-size:clamp(44px,7vw,100px);line-height:.98;letter-spacing:-.055em}
.tpl-prisma .pr-h1 em{font-style:normal;background:linear-gradient(100deg,var(--c1) 0%,var(--c2) 35%,var(--c3) 65%,var(--c4) 100%);-webkit-background-clip:text;background-clip:text;color:transparent}
.tpl-prisma .pr-lede{font-size:clamp(17px,1.5vw,20px);line-height:1.6;color:var(--k-soft);max-width:32em}
.tpl-prisma .pr-cta{display:flex;flex-wrap:wrap;gap:10px}
.tpl-prisma .pr-btn{display:inline-flex;align-items:center;gap:10px;min-height:54px;padding:0 24px;border-radius:18px;background:linear-gradient(135deg,var(--c1),var(--c2));color:#fff!important;text-decoration:none;font-weight:600;font-size:15px;box-shadow:0 18px 36px -18px color-mix(in oklab,var(--c2) 80%,transparent)}
.tpl-prisma .pr-btn svg{width:17px}
.tpl-prisma .pr-btn.gh{background:var(--k-card);color:var(--k-ink)!important;box-shadow:inset 0 0 0 1px var(--edge)}
.tpl-prisma .pr-chips{display:flex;flex-wrap:wrap;gap:8px}
.tpl-prisma .pr-chips span{padding:8px 14px;border-radius:14px;background:var(--k-card);box-shadow:inset 0 0 0 1px var(--edge);font-size:14px;color:var(--k-soft)}
.tpl-prisma .pr-chips b{color:var(--k-ink);font-variant-numeric:tabular-nums}

.tpl-prisma .pr-fan{--rx:0deg;--ry:0deg;position:relative;aspect-ratio:1/1.05;perspective:1200px;display:grid;place-items:center}
.tpl-prisma .pr-stack{position:relative;width:min(70%,360px);aspect-ratio:3/4;transform-style:preserve-3d;rotate:x var(--rx);transition:rotate .5s cubic-bezier(.2,.8,.2,1)}
.tpl-prisma .pr-stack{transform:rotateY(var(--ry))}
.tpl-prisma .pr-fc{position:absolute;inset:0;display:block;border-radius:28px;overflow:hidden;background:var(--k-card);box-shadow:inset 0 0 0 1px var(--edge),0 40px 70px -30px rgba(40,20,100,.55);text-decoration:none;color:#fff;transition:translate .8s cubic-bezier(.2,.8,.2,1),rotate .8s cubic-bezier(.2,.8,.2,1)}
.tpl-prisma .pr-fc .portrait{position:absolute;inset:0}
.tpl-prisma .pr-fc::after{content:"";position:absolute;inset:0;background:linear-gradient(115deg,transparent 30%,rgba(255,255,255,.35) 45%,color-mix(in oklab,var(--c3) 30%,transparent) 52%,transparent 62%);mix-blend-mode:screen;pointer-events:none}
.tpl-prisma .pr-fc .cap{position:absolute;left:12px;right:12px;bottom:12px;padding:12px 14px;border-radius:18px;background:rgba(18,14,36,.55);display:flex;flex-direction:column;gap:2px;z-index:1}
.tpl-prisma .pr-fc .cap b{font-size:20px;font-weight:700;letter-spacing:-.03em}
.tpl-prisma .pr-fc .cap small{font-size:13px;opacity:.85}
.tpl-prisma .pr-fc:nth-child(1){translate:-34% 6%;rotate:-12deg;z-index:1}
.tpl-prisma .pr-fc:nth-child(2){translate:34% 6%;rotate:12deg;z-index:2}
.tpl-prisma .pr-fc:nth-child(3){translate:0 -2%;rotate:0deg;z-index:3}
.tpl-prisma .pr-fc:only-child{translate:0 0;rotate:-3deg}
.tpl-prisma .pr-fan:hover .pr-fc:nth-child(1){translate:-44% 8%;rotate:-16deg}
.tpl-prisma .pr-fan:hover .pr-fc:nth-child(2){translate:44% 8%;rotate:16deg}
.tpl-prisma .pr-art{position:absolute;inset:0;display:grid;place-items:center;background:conic-gradient(from 210deg,var(--c1),var(--c2),var(--c3),var(--c4),var(--c1))}
.tpl-prisma .pr-art svg{width:40%;opacity:.4;color:#fff}
@media (max-width:900px){.tpl-prisma .pr-hin{grid-template-columns:minmax(0,1fr)}.tpl-prisma .pr-fan{aspect-ratio:1.2/1;max-width:560px;width:100%;justify-self:center}.tpl-prisma .pr-stack{width:min(54%,300px)}}

.tpl-prisma .k-act,.tpl-prisma .k-nd,.tpl-prisma .k-pr,.tpl-prisma .k-revs figure,.tpl-prisma .k-contact,.tpl-prisma .k-empty{box-shadow:var(--k-sh);background:var(--k-card)}
.tpl-prisma .k-act:first-child{background:linear-gradient(135deg,var(--c1),var(--c2));color:#fff}
.tpl-prisma .k-help{background:conic-gradient(from 200deg at 50% 120%,var(--c1),var(--c2),var(--c3),var(--c4),var(--c1));color:#fff}
.tpl-prisma .k-help .k-btn{background:#fff;color:#17142A!important}
.tpl-prisma .k-btn{border-radius:18px;background:linear-gradient(135deg,var(--c1),var(--c2));color:#fff!important}
.tpl-prisma .k-chip,.tpl-prisma .k-q,.tpl-prisma .k-sort select{border-radius:16px;background:var(--k-card)}
.tpl-prisma .k-chip[aria-pressed="true"]{background:linear-gradient(135deg,var(--c1),var(--c2));color:#fff}
.tpl-prisma .k-more{border-radius:18px}
.tpl-prisma[data-mode=dark] .k-eb{color:color-mix(in oklab,var(--c4) 70%,#fff)}

.tpl-prisma .pr-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,230px),1fr));gap:clamp(14px,1.8vw,24px)}
.tpl-prisma .pr-card{--mx:50%;--my:30%;container-type:inline-size;position:relative;display:flex;flex-direction:column;border-radius:var(--k-r);background:var(--k-card);box-shadow:var(--k-sh);text-decoration:none;color:inherit;overflow:hidden;transition:translate .45s cubic-bezier(.2,.8,.2,1),box-shadow .45s}
.tpl-prisma .pr-card:hover{translate:0 -6px}
.tpl-prisma .pr-card::before{content:"";position:absolute;inset:0;border-radius:inherit;padding:1.5px;background:conic-gradient(from 180deg at var(--mx) var(--my),var(--c1),var(--c2),var(--c3),var(--c4),var(--c1));-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask:linear-gradient(#000 0 0) content-box exclude,linear-gradient(#000 0 0);opacity:0;transition:opacity .35s;pointer-events:none;z-index:2}
.tpl-prisma .pr-card:hover::before,.tpl-prisma .pr-card:focus-visible::before{opacity:1}
.tpl-prisma .pr-card .ph{position:relative;aspect-ratio:1/1;overflow:hidden;margin:8px 8px 0;border-radius:calc(var(--k-r) - 8px);background:var(--k-tint)}
.tpl-prisma .pr-card .ph .portrait{position:absolute;inset:0}
.tpl-prisma .pr-card .ph::after{content:"";position:absolute;inset:0;background:radial-gradient(40% 40% at var(--mx) var(--my),rgba(255,255,255,.45),transparent 70%);mix-blend-mode:soft-light;opacity:0;transition:opacity .35s}
.tpl-prisma .pr-card:hover .ph::after{opacity:1}
.tpl-prisma .pr-card .nw{position:absolute;top:10px;left:10px;z-index:1;padding:5px 10px;border-radius:10px;background:linear-gradient(135deg,var(--c1),var(--c2));color:#fff;font-size:12px;font-weight:600}
.tpl-prisma .pr-card .cap{display:flex;flex-direction:column;gap:3px;padding:14px 16px 16px}
.tpl-prisma .pr-card b{font-size:20px;font-weight:700;letter-spacing:-.035em;overflow-wrap:anywhere}
.tpl-prisma .pr-card small{font-size:14px;color:var(--k-soft)}
.tpl-prisma .pr-card .tg{display:none;gap:6px;flex-wrap:wrap;margin-top:8px}
.tpl-prisma .pr-card .tg i{font-style:normal;font-size:12px;padding:4px 9px;border-radius:9px;background:var(--k-tint);color:var(--k-soft)}
@container (min-width:250px){.tpl-prisma .pr-card .tg{display:flex}}

.tpl-prisma .pr-camp{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(0,.85fr);gap:clamp(20px,4vw,60px);align-items:center;padding:clamp(24px,4.4vw,64px);border-radius:36px;background:var(--k-card);box-shadow:var(--k-sh);position:relative;overflow:hidden}
.tpl-prisma .pr-camp h2{font-weight:700;font-size:clamp(32px,4.4vw,62px);line-height:1;letter-spacing:-.05em;margin-top:10px}
.tpl-prisma .pr-camp .tx{display:flex;flex-direction:column;gap:16px;align-items:flex-start}
.tpl-prisma .pr-figs{display:grid;grid-template-columns:repeat(3,auto);gap:8px 28px}
.tpl-prisma .pr-figs span{display:block;font-size:13px;color:var(--k-soft)}
.tpl-prisma .pr-figs b{font-size:clamp(18px,1.8vw,24px);font-weight:700;letter-spacing:-.03em;font-variant-numeric:tabular-nums}
@property --prp{syntax:'<number>';inherits:true;initial-value:0}
.tpl-prisma .pr-gauge{--prp:var(--pct);position:relative;justify-self:center;width:min(100%,300px);aspect-ratio:1;border-radius:50%;background:conic-gradient(from -90deg,var(--c1),var(--c2) calc(var(--prp) * .5%),var(--c3) calc(var(--prp) * 1%),var(--k-tint) 0);display:grid;place-items:center;-webkit-mask:radial-gradient(closest-side,transparent 78%,#000 79%);mask:radial-gradient(closest-side,transparent 78%,#000 79%)}
.tpl-prisma .pr-gw{position:relative;justify-self:center;display:grid;place-items:center;width:min(100%,300px)}
.tpl-prisma .pr-gw>div{position:absolute;text-align:center}
.tpl-prisma .pr-gw b{display:block;font-weight:700;font-size:clamp(44px,5vw,70px);letter-spacing:-.06em;line-height:1}
.tpl-prisma .pr-gw span{font-size:14px;color:var(--k-soft)}
@media (max-width:860px){.tpl-prisma .pr-camp{grid-template-columns:minmax(0,1fr)}.tpl-prisma .pr-gw{grid-row:1;width:min(64%,240px)}.tpl-prisma .pr-figs{grid-template-columns:repeat(2,auto)}}
.tpl-prisma .pr-late{content-visibility:auto;contain-intrinsic-size:auto 760px}

@media (prefers-reduced-motion:no-preference){
  .tpl-prisma .pr-fc{animation:prDeal .9s cubic-bezier(.2,.8,.2,1) both}
  .tpl-prisma .pr-fc:nth-child(2){animation-delay:.08s}.tpl-prisma .pr-fc:nth-child(3){animation-delay:.16s}
  @keyframes prDeal{from{translate:0 12%;rotate:0deg;opacity:0}}
  @supports ((animation-timeline:view()) and (animation-range:entry)){
    .tpl-prisma .rv,.tpl-prisma .k-act,.tpl-prisma .k-nd,.tpl-prisma .k-pr,.tpl-prisma .k-revs figure{animation:prIn linear both;animation-timeline:view();animation-range:entry calc(var(--i,0) * 5%) entry calc(65% + var(--i,0) * 5%)}
    @keyframes prIn{from{opacity:0;translate:0 40px;rotate:x 18deg}}
    .tpl-prisma .pr-gauge{animation:prGauge linear both;animation-timeline:view();animation-range:entry 10% cover 45%}
    @keyframes prGauge{from{--prp:0}}
  }
}
`;

const card = (a: TplAnimal, i: number) =>
  `<a class="pr-card rv" href="${a.href}" data-id="${a.id}" style="--i:${i % 4};view-transition-name:${vtName('pr', a.id)}"><span class="ph">${animalArt(a, { decor: true })}${a.isNew ? '<span class="nw">Nuevo</span>' : ''}</span><span class="cap"><b>${a.name}</b><small>${meta(a)}</small><span class="tg"><i>${a.sizeLabel}</i>${a.sex ? `<i>${a.sex}</i>` : ''}${a.breed ? `<i>${a.breed}</i>` : ''}</span></span></a>`;

export const prisma = premiumDesign({
  id: 'prisma',
  catId: 'pr-cat',
  modes: { light: 'Cristal', dark: 'Neón' },
  fonts: 'family=Sora:wght@400..700',
  css: CSS,
  html({ m, P }) {
    const { ORG, ANIMALS, CAMPAIGN, SHOW } = m;
    const n = ANIMALS.length;
    const lead = leadSource(m);
    const first = lead.animal ?? ANIMALS[0];
    const others = ANIMALS.filter((a) => a !== first).slice(0, 2);
    const fc = (a: TplAnimal, isLead: boolean) =>
      `<a class="pr-fc" href="${a.href}" tabindex="-1">${animalArt(a, { lead: isLead, decor: true })}<span class="cap"><b>${a.name}</b><small>${meta(a)}</small></span></a>`;
    // El abanico: las dos de atrás primero y al frente la principal (candidata a LCP).
    const fan = first
      ? [...others.map((a) => fc(a, false)), fc(first, true)].join('')
      : `<span class="pr-fc"><span class="pr-art">${paw()}</span></span>`;
    const chips = [
      `<span><b>${n}</b> en adopción</span>`,
      SHOW.transparencia ? `<span>Verificación <b>nivel ${ORG.level}</b></span>` : '',
      CAMPAIGN.active ? `<span>Campaña al <b>${CAMPAIGN.pct}%</b></span>` : '',
    ].join('');
    return `
<div class="pr-bg" aria-hidden="true"><i></i><i></i><i></i></div>
<header class="pr-top"><div class="w"><div class="pr-bar"><a class="pr-id" href="#pr-top"><i>${logoMark(m)}</i><b>${ORG.name}</b></a><nav class="pr-nav" aria-label="Secciones"><a href="#pr-cat">Adopta</a><a href="#pr-camp">Campaña</a><a href="#pr-ldg">Transparencia</a></nav>${P.modeBtn()}<a class="pr-don" href="${ORG.donateHref}">Donar</a></div></div></header>
${P.tbar()}
<section class="pr-hero" id="pr-top"><div class="w pr-hin">
  <div class="pr-copy">
    <span class="pr-pill"><span>${paw()}</span>${[ORG.name, ORG.city].filter(Boolean).join(' · ')}</span>
    <h1 class="pr-h1">Mira a través y <em>encuentra a tu compañero</em></h1>
    <p class="pr-lede">${ORG.lede || availLine(m)}</p>
    <div class="pr-cta"><a class="pr-btn" href="#pr-cat" data-magnet>${n ? 'Ver el catálogo' : 'Cómo ayudar'} ${pic.arrow}</a><a class="pr-btn gh" href="${ORG.donateHref}">Donar</a></div>
    <div class="pr-chips">${chips}</div>
  </div>
  <div class="pr-fan" id="pr-fan"><div class="pr-stack">${fan}</div></div>
</div></section>
${P.acts(P.hd('Cómo participar', 'Elige tu forma de ayudar'))}
<section class="w k-sec" data-sec="animales" id="pr-cat">${P.hd('En adopción', n === 1 ? 'Quién espera' : 'Quiénes esperan', '', n ? 'Pasa el cursor sobre una ficha y elige con calma.' : '')}${n ? P.catControls('pr-f', 'Busca por nombre o raza') : ''}<div class="pr-grid" id="pr-grid"></div><button type="button" class="k-more" id="pr-more" hidden></button></section>
${P.campaign(
  () => `<section class="w k-sec" data-sec="campana" id="pr-camp"><div class="pr-camp rv">
  <div class="tx"><p class="k-eb">Campaña activa${CAMPAIGN.category ? ` · ${CAMPAIGN.category}` : ''}</p><h2>${CAMPAIGN.title}</h2>${CAMPAIGN.description ? `<p class="k-sub" style="margin:0">${CAMPAIGN.description}</p>` : ''}
  <div class="pr-figs"><div><span>Recaudado</span><b>${fmt(CAMPAIGN.raised)}</b></div><div><span>Meta</span><b>${fmt(CAMPAIGN.goal)}</b></div><div><span>Cierra</span><b>${CAMPAIGN.deadline || '—'}</b></div></div>
  <a class="k-btn" href="${CAMPAIGN.href}" data-magnet>Ver campaña y aportar ${pic.arrow}</a>${P.more()}</div>
  <div class="pr-gw" role="img" aria-label="${CAMPAIGN.pct}% de la meta"><div class="pr-gauge" style="--pct:${CAMPAIGN.pct}"></div><div><b>${CAMPAIGN.pct}%</b><span>de la meta</span></div></div>
</div></section>`,
  P.hd('Campaña activa', 'Sin campaña por ahora'),
).replace('data-sec="campana">', 'data-sec="campana" id="pr-camp">')}
<div class="pr-late">${P.needs()}${P.prods()}</div>
${P.help()}
<div class="pr-late">${P.about()}${P.revs()}</div>
<div class="pr-late" id="pr-ldg">${P.ledger()}</div>
${P.contact()}
${P.foot()}`;
  },
  init(app, { env, fx, cat }) {
    fx.fillOnView(app, '.k-bar');
    fx.magnet(app);
    cat({
      id: 'pr-f',
      grid: '#pr-grid',
      more: '#pr-more',
      page: 12,
      render: (L) => L.map(card).join(''),
      transition: scopedTransition,
    });
    revealFallback(app, env, '.rv, .k-act, .k-nd, .k-pr, .k-revs figure');
    if (fx.reduce || !fx.hover) return;
    // Inclinación del abanico y brillo de las fichas: solo con puntero fino,
    // una escritura de variables CSS por cuadro como máximo.
    const fan = qs(app, '#pr-fan');
    let raf = 0;
    let last: PointerEvent | null = null;
    const apply = () => {
      raf = 0;
      const e = last;
      if (!e) return;
      if (fan && fan.contains(e.target as Node)) {
        const r = fan.getBoundingClientRect();
        fan.style.setProperty('--rx', `${(((e.clientY - r.top) / r.height - 0.5) * -10).toFixed(2)}deg`);
        fan.style.setProperty('--ry', `${(((e.clientX - r.left) / r.width - 0.5) * 14).toFixed(2)}deg`);
      }
      const c = (e.target as Element | null)?.closest<HTMLElement>('.pr-card');
      if (c) {
        const r = c.getBoundingClientRect();
        c.style.setProperty('--mx', `${(((e.clientX - r.left) / r.width) * 100).toFixed(1)}%`);
        c.style.setProperty('--my', `${(((e.clientY - r.top) / r.height) * 100).toFixed(1)}%`);
      }
    };
    app.addEventListener(
      'pointermove',
      (e) => {
        last = e;
        if (!raf) raf = requestAnimationFrame(apply);
      },
      { signal: fx.signal, passive: true },
    );
    fan?.addEventListener(
      'pointerleave',
      () => {
        fan.style.setProperty('--rx', '0deg');
        fan.style.setProperty('--ry', '0deg');
      },
      { signal: fx.signal },
    );
    fx.signal.addEventListener('abort', () => cancelAnimationFrame(raf));
  },
});
