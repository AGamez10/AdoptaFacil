import type { TplAnimal } from '../engine/model';
import { deco, pic, premiumDesign, type CatFn, type Fx } from '../engine/premium';
import { availLine, fmt, logoMark, qs, qsa } from '../engine/runtime';

/*
 * Velitas (Premium).
 * Claro, "Papel": cerros en papel recortado por capas que se mueven con el
 * scroll, banderines que se mecen y fichas que se despliegan como papel
 * doblado. La campaña es una cadeneta de papel.
 * Oscuro, "Velitas": noche de velitas. Faroles que suben y una velita
 * encendida por cada animal que espera hogar (se toca para abrir su ficha). La
 * campaña son 15 velitas que se encienden con el avance real.
 */
const CSS = `
.tpl-velitas{--k-fd:'Young Serif',Georgia,serif;--k-fw:400;--k-ls:-.02em;--k-r:18px;font-family:'Nunito Sans',system-ui,sans-serif}
.tpl-velitas[data-mode=light]{--k-bg:#F3F7F4;--k-ink:#1D2B2A;--k-soft:#586866;--k-line:rgba(29,43,42,.12);--k-card:#FFFFFF;--k-tint:rgba(29,43,42,.05);--k-sh:0 1px 0 rgba(29,43,42,.06),0 2px 0 rgba(29,43,42,.04),0 16px 30px -22px rgba(29,43,42,.5);color-scheme:light}
.tpl-velitas[data-mode=dark]{--k-bg:#0B0A14;--k-ink:#FFF0D9;--k-soft:#B9AB93;--k-line:rgba(255,214,150,.12);--k-card:#14121F;--k-tint:rgba(255,214,150,.06);--k-sh:0 0 0 1px rgba(255,214,150,.08);--fire:#FFB547;color-scheme:dark}
.tpl-velitas .vl-top{display:flex;align-items:center;gap:16px;padding-block:16px;position:relative;z-index:5}
.tpl-velitas .vl-logo{display:flex;align-items:center;gap:12px;text-decoration:none;font-family:var(--k-fd);font-size:21px}
.tpl-velitas .vl-logo i{width:42px;height:42px;display:grid;place-items:center;font-style:normal;font-family:'Nunito Sans',sans-serif;font-weight:800;font-size:14px;background:var(--k-acc);color:var(--k-acc-ink);border-radius:10px;rotate:-4deg;box-shadow:3px 3px 0 rgba(0,0,0,.15)}
.tpl-velitas .vl-nav{display:flex;gap:4px;margin-left:auto}
.tpl-velitas .vl-nav a{padding:10px 14px;border-radius:999px;text-decoration:none;font-weight:700;font-size:15px;color:var(--k-soft)}
.tpl-velitas .vl-nav a:hover{color:var(--k-ink)}
@media (max-width:760px){.tpl-velitas .vl-nav{display:none}.tpl-velitas .vl-top .k-mode{margin-left:auto}}
.tpl-velitas .vl-hills{position:absolute;left:0;right:0;bottom:0;width:100%;height:62%;display:block}
.tpl-velitas .vl-hills .ly{will-change:transform}
.tpl-velitas .vl-sky{position:relative;overflow:hidden;background:linear-gradient(180deg,#D9EEEE,#F3F7F4 70%);min-height:clamp(600px,88vh,860px);display:flex;flex-direction:column}
.tpl-velitas .vl-sky .vl-hills path{filter:drop-shadow(0 -6px 8px rgba(29,43,42,.14))}
.tpl-velitas .vl-flags{position:relative;display:block;width:100%;height:clamp(54px,7vw,100px);z-index:3;pointer-events:none;margin-bottom:-24px}
.tpl-velitas .vl-flags .fl{animation:vlFlag 3.2s ease-in-out infinite;animation-delay:var(--d);filter:drop-shadow(0 3px 2px rgba(0,0,0,.15))}
@keyframes vlFlag{0%,100%{transform:rotate(-5deg)}50%{transform:rotate(5deg)}}
.tpl-velitas .vl-hero{position:relative;z-index:4;padding-block:clamp(20px,4vw,60px) 0;text-align:center;display:flex;flex-direction:column;align-items:center}
.tpl-velitas .vl-k{display:inline-flex;gap:8px;align-items:center;font-weight:800;font-size:13px;letter-spacing:.14em;text-transform:uppercase;color:var(--k-soft);background:#fff;padding:8px 14px;border-radius:999px;box-shadow:var(--k-sh)}
.tpl-velitas .vl-h1{font-family:var(--k-fd);font-weight:400;font-size:clamp(52px,8vw,124px);line-height:.92;letter-spacing:-.03em;margin-top:22px;max-width:11em}
.tpl-velitas .vl-h1 em{font-style:normal;color:var(--k-acc);display:inline-block;rotate:-2deg;background:#fff;padding:0 .18em .06em;box-shadow:4px 5px 0 rgba(29,43,42,.12);border-radius:6px}
.tpl-velitas .vl-lede{margin-top:24px;font-size:clamp(17px,1.5vw,20px);line-height:1.6;color:var(--k-soft);max-width:34em}
.tpl-velitas .vl-cta{display:flex;flex-wrap:wrap;gap:12px;justify-content:center;margin-top:28px}
.tpl-velitas .vl-cta .k-btn{box-shadow:4px 5px 0 rgba(29,43,42,.2)}
.tpl-velitas .vl-cta .ghost{display:inline-flex;align-items:center;min-height:54px;padding:0 24px;border-radius:999px;background:#fff;text-decoration:none;font-weight:700;box-shadow:var(--k-sh)}
.tpl-velitas .vl-sky .vl-hills{height:46%}
.tpl-velitas .vl-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:clamp(18px,2.6vw,34px);perspective:1400px}
.tpl-velitas .vl-p{display:block;border:0;padding:0;background:none;cursor:pointer;text-align:left;color:inherit;position:relative;rotate:var(--r)}
.tpl-velitas .vl-p::before{content:"";position:absolute;inset:0;background:var(--t);border-radius:16px;transform:translate(8px,9px) rotate(2deg);box-shadow:0 10px 20px -14px rgba(0,0,0,.4)}
.tpl-velitas .vl-pf{position:relative;display:flex;flex-direction:column;background:#fff;border-radius:16px;padding:10px;box-shadow:0 1px 0 rgba(0,0,0,.05),0 14px 24px -18px rgba(29,43,42,.6);transform-origin:50% 0;transition:transform .9s cubic-bezier(.3,1.4,.5,1),opacity .4s}
.tpl-velitas .vl-pf::after{content:"";position:absolute;right:0;top:0;width:28px;height:28px;border-radius:0 16px 0 8px;background:linear-gradient(225deg,var(--k-bg) 50%,#E8EEEA 50%);box-shadow:-2px 2px 3px rgba(0,0,0,.08)}
.tpl-velitas .vl-p.fold .vl-pf{transform:rotateX(-88deg);opacity:.2}
.tpl-velitas .vl-p:hover .vl-pf{transform:translateY(-6px) rotate(calc(var(--r) * -1))}
.tpl-velitas .vl-pf .ph{display:block;aspect-ratio:1;border-radius:10px;overflow:hidden}
.tpl-velitas .vl-pf .cap{display:flex;flex-direction:column;gap:2px;padding:12px 4px 4px;min-width:0}
.tpl-velitas .vl-pf b{font-family:var(--k-fd);font-weight:400;font-size:clamp(20px,1.8vw,25px);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tpl-velitas .vl-pf small{font-size:14px;color:var(--k-soft)}
@media (max-width:1000px){.tpl-velitas .vl-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}
@media (max-width:620px){.tpl-velitas .vl-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}}
.tpl-velitas .vl-chainbox{padding:clamp(24px,4vw,56px);border-radius:28px;background:#fff;box-shadow:var(--k-sh);display:flex;flex-direction:column;gap:22px}
.tpl-velitas .vl-chainbox h2{font-family:var(--k-fd);font-weight:400;font-size:clamp(38px,5vw,72px);line-height:.98;letter-spacing:-.025em}
.tpl-velitas .vl-chain{display:flex;flex-wrap:wrap;gap:0;padding:10px 0}
.tpl-velitas .vl-chain i{width:clamp(38px,6vw,74px);height:clamp(24px,3.6vw,44px);border-radius:999px;margin-right:calc(clamp(38px,6vw,74px) * -.32);border:clamp(5px,.7vw,9px) solid var(--k-line);background:transparent;position:relative;transition:border-color .5s calc(var(--i) * 70ms)}
.tpl-velitas .vl-chain i:nth-child(odd){translate:0 6px;rotate:-6deg}
.tpl-velitas .vl-chain i:nth-child(even){rotate:6deg}
.tpl-velitas .vl-chain.on i.f{border-color:var(--c)}
.tpl-velitas .vl-cfig{display:flex;flex-wrap:wrap;gap:12px 30px}
.tpl-velitas .vl-cfig span{display:block;font-size:13px;color:var(--k-soft)}
.tpl-velitas .vl-cfig b{font-family:var(--k-fd);font-weight:400;font-size:clamp(22px,2.2vw,30px);font-variant-numeric:tabular-nums}
.tpl-velitas .vl-chainbox .k-btn{align-self:flex-start;box-shadow:4px 5px 0 rgba(29,43,42,.2)}
.tpl-velitas[data-mode=light] .k-act{box-shadow:6px 7px 0 var(--t,#D7E8D3),var(--k-sh)}
.tpl-velitas[data-mode=light] .k-act:nth-child(1){--t:#F6D9C4}.tpl-velitas[data-mode=light] .k-act:nth-child(3){--t:#D5E2F2}
.tpl-velitas[data-mode=light] .k-act:hover{transform:translate(-3px,-4px)}
.tpl-velitas[data-mode=light] .k-help{box-shadow:10px 12px 0 color-mix(in oklab,var(--k-acc) 35%,#fff)}
.tpl-velitas[data-mode=light] .k-help::before{content:"";position:absolute;left:0;right:0;top:0;height:40px;background:radial-gradient(circle at 20px -6px,var(--k-bg) 22px,transparent 23px) 0 0/40px 40px repeat-x}
.tpl-velitas[data-mode=light] .k-nd,.tpl-velitas[data-mode=light] .k-pr,.tpl-velitas[data-mode=light] .k-revs figure{box-shadow:5px 6px 0 rgba(29,43,42,.06),var(--k-sh)}
.tpl-velitas .vl-night{position:relative;overflow:hidden;background:radial-gradient(90% 70% at 50% 0%,#1B1838,#0B0A14 75%);display:flex;flex-direction:column}
.tpl-velitas .vl-night .vl-hills{height:44%}
.tpl-velitas .vl-sky2{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}
.tpl-velitas .vl-nhero{position:relative;z-index:3;text-align:center;display:flex;flex-direction:column;align-items:center;padding-block:clamp(40px,7vw,96px) clamp(200px,24vw,320px)}
.tpl-velitas .vl-nk{font-weight:800;font-size:13px;letter-spacing:.2em;text-transform:uppercase;color:var(--fire)}
.tpl-velitas .vl-nh{font-family:var(--k-fd);font-weight:400;font-size:clamp(52px,8vw,128px);line-height:.92;letter-spacing:-.03em;margin-top:20px;max-width:10em}
.tpl-velitas .vl-nh em{font-style:normal;color:var(--fire);text-shadow:0 0 30px rgba(255,181,71,.55)}
.tpl-velitas .vl-nl{margin-top:22px;font-size:clamp(17px,1.5vw,20px);line-height:1.6;color:var(--k-soft);max-width:34em}
.tpl-velitas .vl-row{position:relative;z-index:4;background:linear-gradient(180deg,transparent,#0A0915 30%);padding-block:30px clamp(26px,4vw,44px)}
.tpl-velitas .vl-row .w{display:flex;flex-direction:column;gap:14px}
.tpl-velitas .vl-cands{display:flex;flex-wrap:wrap;gap:6px 4px;justify-content:center}
.tpl-velitas .vl-cb{border:0;padding:0;background:none;cursor:pointer;display:grid;place-items:end center;width:clamp(22px,2.2vw,30px);height:clamp(46px,4.4vw,60px);position:relative}
.tpl-velitas .vl-cb .tt{position:absolute;bottom:calc(100% + 6px);left:50%;translate:-50% 4px;background:#FFF0D9;color:#1A1405;font-weight:700;font-size:12px;padding:4px 8px;border-radius:6px;white-space:nowrap;opacity:0;pointer-events:none;transition:opacity .2s,translate .2s;z-index:3}
.tpl-velitas .vl-cb:hover .tt,.tpl-velitas .vl-cb:focus-visible .tt{opacity:1;translate:-50% 0}
.tpl-velitas .vl-cb:hover .vl-c{--g:1.6}
.tpl-velitas .vl-rowcap{display:flex;flex-wrap:wrap;justify-content:space-between;gap:8px 20px;font-size:14px;color:var(--k-soft)}
.tpl-velitas .vl-rowcap b{color:var(--fire)}
.tpl-velitas .vl-c{--g:1;position:relative;display:block;width:calc(14px * var(--h));height:calc(40px * var(--h))}
.tpl-velitas .vl-c .bd{position:absolute;left:0;right:0;bottom:0;height:72%;border-radius:3px 3px 2px 2px;background:linear-gradient(90deg,#EADBC0,#FFF6E4 45%,#D9C7A6);box-shadow:inset 0 3px 0 rgba(255,255,255,.5)}
.tpl-velitas .vl-c .wk{position:absolute;left:50%;bottom:72%;width:1.5px;height:9%;background:#2A1E10;translate:-50% 0}
.tpl-velitas .vl-c .fl{position:absolute;left:50%;bottom:78%;width:62%;height:36%;translate:-50% 0;border-radius:50% 50% 50% 50%/62% 62% 38% 38%;background:radial-gradient(ellipse at 50% 72%,#FFFFFF 0 18%,#FFE08A 35%,#FFB547 62%,rgba(255,120,40,0) 75%);transform-origin:50% 90%;animation:vlFlick 1.6s ease-in-out infinite;animation-delay:calc(var(--k, 0) * -.13s);filter:drop-shadow(0 0 calc(6px * var(--g)) rgba(255,181,71,.9))}
.tpl-velitas .vl-c::after{content:"";position:absolute;left:50%;bottom:70%;width:calc(70px * var(--h) * var(--g));height:calc(70px * var(--h) * var(--g));translate:-50% 50%;border-radius:50%;background:radial-gradient(circle,rgba(255,181,71,.28),transparent 65%);pointer-events:none;transition:width .3s,height .3s}
.tpl-velitas .vl-c.off .fl{display:none}
.tpl-velitas .vl-c.off::after{display:none}
.tpl-velitas .vl-c.off .bd{filter:brightness(.55)}
@keyframes vlFlick{0%,100%{transform:scale(1,1) rotate(-2deg)}25%{transform:scale(.92,1.08) rotate(2deg)}50%{transform:scale(1.04,.94) rotate(-1deg)}75%{transform:scale(.96,1.05) rotate(3deg)}}
.tpl-velitas .vl-ng{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:clamp(16px,2.4vw,30px)}
.tpl-velitas .vl-n{position:relative;display:flex;flex-direction:column;gap:10px;border:0;padding:12px;border-radius:20px;cursor:pointer;text-align:left;color:inherit;background:radial-gradient(120% 70% at 50% 0%,rgba(255,181,71,.16),transparent 60%),var(--k-card);box-shadow:var(--k-sh);transition:transform .4s,box-shadow .4s}
.tpl-velitas .vl-n:hover{transform:translateY(-6px);box-shadow:0 0 0 1px rgba(255,181,71,.35),0 30px 60px -30px rgba(255,150,40,.55)}
.tpl-velitas .vl-n .vl-c{position:absolute;left:22px;top:-26px;z-index:2}
.tpl-velitas .vl-n .ph{display:block;aspect-ratio:1;border-radius:12px;overflow:hidden;filter:sepia(.25) saturate(1.1) brightness(.92)}
.tpl-velitas .vl-n .cap{display:flex;flex-direction:column;gap:2px;padding:0 4px 4px;min-width:0}
.tpl-velitas .vl-n b{font-family:var(--k-fd);font-weight:400;font-size:clamp(20px,1.8vw,25px);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tpl-velitas .vl-n small{font-size:14px;color:var(--k-soft)}
.tpl-velitas .vl-n.unlit .vl-c .fl,.tpl-velitas .vl-n.unlit .vl-c::after{opacity:0}
.tpl-velitas .vl-n .vl-c .fl,.tpl-velitas .vl-n .vl-c::after{transition:opacity .6s}
.tpl-velitas .vl-ng{padding-top:20px}
@media (max-width:1000px){.tpl-velitas .vl-ng{grid-template-columns:repeat(3,minmax(0,1fr))}}
@media (max-width:620px){.tpl-velitas .vl-ng{grid-template-columns:repeat(2,minmax(0,1fr));gap:12px 12px;row-gap:34px}}
.tpl-velitas .vl-shrine{padding:clamp(24px,4vw,56px);border-radius:28px;background:radial-gradient(60% 80% at 50% 100%,rgba(255,181,71,.18),transparent 70%),#100E1A;box-shadow:inset 0 0 0 1px var(--k-line);display:flex;flex-direction:column;gap:22px}
.tpl-velitas .vl-shrine h2{font-family:var(--k-fd);font-weight:400;font-size:clamp(38px,5vw,72px);line-height:.98;letter-spacing:-.025em}
.tpl-velitas .vl-15{display:flex;flex-wrap:wrap;gap:clamp(10px,2vw,22px);align-items:flex-end;padding:30px 0 6px}
.tpl-velitas .vl-15 .vl-c{--h:1.4}
.tpl-velitas .vl-shrine .k-btn{align-self:flex-start;background:var(--fire);color:#1A1405!important}
.tpl-velitas[data-mode=dark] .k-act{background:radial-gradient(100% 80% at 0% 0%,rgba(255,181,71,.12),transparent 60%),var(--k-card)}
.tpl-velitas[data-mode=dark] .k-act:hover{transform:translateY(-6px);box-shadow:0 0 0 1px rgba(255,181,71,.35)}
.tpl-velitas[data-mode=dark] .k-help{background:radial-gradient(70% 120% at 50% 110%,rgba(255,150,40,.55),transparent 70%),#15121F;color:var(--k-ink);box-shadow:inset 0 0 0 1px var(--k-line)}
.tpl-velitas[data-mode=dark] .k-help .k-btn{background:var(--fire);color:#1A1405!important}
.tpl-velitas[data-mode=dark] .k-chip[aria-pressed="true"],.tpl-velitas[data-mode=dark] .k-more{background:var(--fire);color:#1A1405}
.tpl-velitas[data-mode=dark] .k-revs .st{color:var(--fire)}
`;

function hills(dark: boolean) {
  const c = dark
    ? ['#1F1B36', '#18152C', '#110F21', '#0A0915']
    : [
        'color-mix(in oklab,var(--brand) 18%,#EEF4EE)',
        'color-mix(in oklab,var(--brand) 38%,#E3ECE3)',
        'color-mix(in oklab,var(--brand) 62%,#D9E4D9)',
        'color-mix(in oklab,var(--brand) 88%,#000)',
      ];
  return `<svg class="vl-hills" viewBox="0 0 1440 420" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
      <g class="ly" data-sp=".3"><path fill="${c[0]}" d="M0 260C140 200 260 150 380 170 500 190 560 120 700 110 820 100 900 170 1040 150 1180 130 1300 190 1440 170V420H0Z"/></g>
      <g class="ly" data-sp=".2"><path fill="${c[1]}" d="M0 300C120 260 220 230 330 245 470 265 520 190 640 200 760 210 800 140 900 120L930 112C1000 130 1080 220 1200 230 1310 240 1380 210 1440 220V420H0Z"/><g fill="${dark ? '#2A2546' : '#FFFFFF'}" transform="translate(902 92)"><rect x="4" y="8" width="18" height="12"/><path d="M2 9L13 0 24 9Z"/><rect x="18" y="-4" width="6" height="24"/><path d="M17-4L21-12 25-4Z"/>${dark ? '<rect x="11" y="12" width="4" height="5" fill="#FFB547"/>' : ''}</g></g>
      <g class="ly" data-sp=".12"><path fill="${c[2]}" d="M0 340C160 310 300 300 420 320 560 343 700 290 840 300 980 310 1100 350 1260 330 1350 320 1400 310 1440 315V420H0Z"/></g>
      <g class="ly" data-sp=".05"><path fill="${c[3]}" d="M0 380C200 360 360 370 520 385 700 400 860 360 1040 370 1220 380 1340 395 1440 390V420H0Z"/></g></svg>`;
}

function flags() {
  const C = ['var(--brand)', '#F2A541', '#E4572E', '#4C9F70', '#3E6EA8', '#F7D046'];
  const n = 22;
  let o = '';
  for (let i = 0; i < n; i++) {
    const x = ((i + 0.5) / n) * 1440;
    const y = 18 + 46 * (1 - Math.pow((2 * (i + 0.5)) / n - 1, 2));
    o += `<path class="fl" style="--d:${(i % 5) * -0.6}s;transform-origin:${x.toFixed(0)}px ${y.toFixed(0)}px" d="M${(x - 22).toFixed(0)} ${y.toFixed(0)}L${(x + 22).toFixed(0)} ${y.toFixed(0)}L${x.toFixed(0)} ${(y + 52).toFixed(0)}Z" fill="${C[i % C.length]}"/>`;
  }
  return `<svg class="vl-flags" viewBox="0 0 1440 120" preserveAspectRatio="none" aria-hidden="true"><path d="M0 14Q720 106 1440 14" fill="none" stroke="rgba(29,43,42,.35)" stroke-width="1.5"/>${o}</svg>`;
}

const TINT = ['#F6D9C4', '#D7E8D3', '#D5E2F2', '#F4E5B5', '#EBD3E4'];
const ROT = [-1.4, 1, -0.6, 1.6];
const sub = (a: TplAnimal) => `${a.spLabel}${a.age ? ` · ${a.age}` : ''}`;

const paper = (a: TplAnimal, i: number) =>
  `<a class="vl-p" href="${a.href}" data-id="${a.id}" style="--t:${TINT[i % 5]};--r:${ROT[i % 4]}deg"><span class="vl-pf"><span class="ph">${deco(a, { dx: 6, dy: 14, s: 1.08 })}</span><span class="cap"><b>${a.name}</b><small>${sub(a)}${a.isNew ? ' · Recién llegado' : ''}</small></span></span></a>`;
const candle = (h = 1, lit = true, style = '') =>
  `<span class="vl-c${lit ? '' : ' off'}" style="--h:${h}${style}"><span class="fl"></span><span class="wk"></span><span class="bd"></span></span>`;
const nightCard = (a: TplAnimal, i: number) =>
  `<a class="vl-n" href="${a.href}" data-id="${a.id}" style="--k:${i % 12}">${candle(0.9)}<span class="ph">${deco(a, { dx: 6, dy: 14, s: 1.08 })}</span><span class="cap"><b>${a.name}</b><small>${sub(a)}</small></span></a>`;

const days = (n: number) => `${n} ${n === 1 ? 'día' : 'días'}`;

export const velitas = premiumDesign({
  id: 'velitas',
  catId: 'vl-cat',
  modes: { light: 'Papel', dark: 'Velitas' },
  fonts: 'family=Young+Serif&family=Nunito+Sans:opsz,wght@6..12,400..800',
  css: CSS,
  html({ m, P, mode }) {
    const { ORG, ANIMALS, CAMPAIGN } = m;
    const n = ANIMALS.length;
    const top = `<header class="w vl-top"><a class="vl-logo" href="#vl-cat"><i>${logoMark(m)}</i>${ORG.name}</a><nav class="vl-nav" aria-label="Secciones"><a href="#vl-cat">Animales</a><a href="#vl-camp">Campaña</a><a href="#vl-ldg">Transparencia</a></nav>${P.modeBtn()}</header>`;
    const tail = (bg: string) =>
      `${P.needs()}${P.prods(P.hd('Tienda solidaria', 'Productos'), bg)}${P.help()}${P.about()}${P.revs()}<div id="vl-ldg">${P.ledger()}</div>${P.contact()}${P.foot()}`;
    const LINKS = 15;
    const per = CAMPAIGN.goal / LINKS;
    const got = Math.min(
      LINKS,
      Math.max(CAMPAIGN.raised > 0 ? 1 : 0, Math.floor(CAMPAIGN.raised / Math.max(1, per))),
    );
    const eb = CAMPAIGN.category ? ` · ${CAMPAIGN.category}` : '';
    const figs = `<div class="vl-cfig"><div><span>Recaudado</span><b id="vl-raised">${fmt(CAMPAIGN.raised)}</b></div><div><span>Meta</span><b>${fmt(CAMPAIGN.goal)}</b></div><div><span>Cierra</span><b>${CAMPAIGN.deadlineShort || '—'}</b></div><div><span>Avance</span><b>${CAMPAIGN.pct}%</b></div></div>`;
    const desc = CAMPAIGN.description
      ? `<p class="k-sub" style="margin:0 0 18px">${CAMPAIGN.description}</p>`
      : '';
    const lede = ORG.lede || availLine(m);
    if (mode === 'light') {
      const CC = ['var(--brand)', '#F2A541', '#E4572E', '#4C9F70', '#3E6EA8'];
      return `<div class="vl-sky">${top}${P.tbar()}${flags()}<section class="w vl-hero"><span class="vl-k">${pic.paw.replace('<svg', '<svg style="width:15px"')}${ORG.short}${ORG.city ? ` · ${ORG.city}` : ''}</span>
        <h1 class="vl-h1">Un hogar se arma <em>pieza a pieza</em></h1>
        <p class="vl-lede">${lede}${n ? ' Cada hogar se arma con muchas manos, y la pieza que falta puede ser la tuya.' : ''}</p>
        <div class="vl-cta"><a class="k-btn" href="#vl-cat" data-magnet>Conocerlos ${pic.arrow}</a><a class="ghost" href="#vl-camp">Ver la campaña</a></div></section>${hills(false)}</div>
        ${P.acts(P.hd('Cómo participar', 'Pon tu pieza'))}
        <section class="w k-sec" data-sec="animales" id="vl-cat">${P.hd('Recortados a mano', 'Mascotas en adopción', '', n ? 'Las fichas se despliegan al llegar. Toca a cualquiera para conocer su historia.' : '')}${P.catControls('vl-f')}<div class="vl-grid" id="vl-grid"></div><button type="button" class="k-more" id="vl-more" hidden></button></section>
        ${P.campaign(
          () => `<section class="w k-sec" data-sec="campana" id="vl-camp"><div class="vl-chainbox"><p class="k-eb">Cadeneta de la campaña${eb}</p><h2>${CAMPAIGN.title}</h2>${desc}
          <div class="vl-chain" id="vl-chain" role="img" aria-label="${got} de ${LINKS} eslabones completos">${Array.from({ length: LINKS }, (_, i) => `<i class="${i < got ? 'f' : ''}" style="--i:${i};--c:${CC[i % 5]}"></i>`).join('')}</div>
          ${figs}
          <p class="k-sub" style="margin:0">Cada eslabón es ${fmt(per)}. Faltan ${days(CAMPAIGN.daysLeft)} para cerrar la cadeneta.</p><a class="k-btn" href="${CAMPAIGN.href}" data-magnet>Ver campaña y aportar ${pic.arrow}</a>${P.more()}</div></section>`,
        )}
        ${tail('#F7FAF8')}`;
    }
    const label = (a: TplAnimal) =>
      `${a.name}, ${a.spLabel.toLowerCase()}${a.age ? ` de ${a.age}` : ''}`;
    return `<div class="vl-night"><canvas class="vl-sky2" id="vl-sky" aria-hidden="true"></canvas>${top}${P.tbar()}<section class="w vl-nhero"><span class="vl-nk">Noche de velitas${ORG.city ? ` en ${ORG.city}` : ''}</span>
        <h1 class="vl-nh">Una velita <em>por cada uno</em></h1>
        <p class="vl-nl">${n ? `Como en la noche de velitas, aquí arde una luz por cada animal que espera hogar en ${ORG.short}: hoy son ${n}. Cada adopción se lleva una vela a una casa nueva.` : lede}</p></section>
        ${hills(true)}
        ${
          n
            ? `<div class="vl-row"><div class="w"><div class="vl-cands" id="vl-cands" role="group" aria-label="Una vela por cada animal">${ANIMALS.map(
                (a, i) => {
                  const h = (0.62 + ((i * 37) % 10) / 40).toFixed(2);
                  // Mismos enlaces que el catálogo: fuera del orden de tabulación para no duplicarlos.
                  return `<a class="vl-cb" href="${a.href}" data-id="${a.id}" tabindex="-1" aria-label="${label(a)}"><span class="tt">${a.name}</span>${candle(Number(h), true, `;--k:${i % 13}`)}</a>`;
                },
              ).join('')}</div>
        <p class="vl-rowcap"><span><b>${n}</b> velitas encendidas, una por cada animal en adopción</span><span>Toca una vela para saber de quién es</span></p></div></div>`
            : ''
        }</div>
      ${P.acts(P.hd('Cómo participar', 'Enciende una luz'))}
      <section class="w k-sec" data-sec="animales" id="vl-cat">${P.hd('Quiénes esperan', 'Mascotas en adopción', '', n ? 'Cada ficha enciende su vela al llegar. Toca a cualquiera para conocerlo.' : '')}${P.catControls('vl-f')}<div class="vl-ng" id="vl-grid"></div><button type="button" class="k-more" id="vl-more" hidden></button></section>
      ${P.campaign(
        () => `<section class="w k-sec" data-sec="campana" id="vl-camp"><div class="vl-shrine"><p class="k-eb" style="color:var(--fire)">Campaña activa${eb}</p><h2>${CAMPAIGN.title}</h2>${desc}
        <div class="vl-15" role="img" aria-label="${got} de ${LINKS} velas encendidas">${Array.from({ length: LINKS }, (_, i) => candle(1.4, i < got, `;--k:${i}`)).join('')}</div>
        ${figs}
        <p class="k-sub" style="margin:0">Cada vela es ${fmt(per)}. Faltan ${days(CAMPAIGN.daysLeft)} para que cierre.</p><a class="k-btn" href="${CAMPAIGN.href}" data-magnet>Ver campaña y encender una vela ${pic.arrow}</a>${P.more()}</div></section>`,
      )}
      ${tail('#1A1726')}`;
  },
  init(app, { m, mode, fx, cat }) {
    fx.fillOnView(app, '.k-bar');
    fx.countUp(qs(app, '#vl-raised'), m.CAMPAIGN.raised, fmt);
    fx.magnet(app);
    fx.reveal(app, '.k-act,.k-nd,.k-pr,.k-revs figure', { stagger: 80 });
    // Capas de los cerros con parallax
    const hl = qs(app, '.vl-hills');
    const lys = hl ? qsa<SVGGElement>(hl, '.ly') : [];
    if (hl && !fx.reduce)
      fx.onFrame(() => {
        lys.forEach((g) =>
          g.setAttribute(
            'transform',
            `translate(0 ${(scrollY * Number(g.dataset.sp) * (mode === 'light' ? 1 : 0.6)).toFixed(1)})`,
          ),
        );
      }, hl);
    if (mode === 'light') initPaper(app, fx, cat);
    else initNight(app, fx, cat);
  },
});

/** Une un IntersectionObserver de "aparece una vez" a la vida del modo. */
function onceObserver(fx: Fx, threshold: number, show: (el: HTMLElement) => void) {
  if (typeof IntersectionObserver !== 'function') return null;
  const io = new IntersectionObserver(
    (es) =>
      es.forEach((e) => {
        if (!e.isIntersecting) return;
        show(e.target as HTMLElement);
        io.unobserve(e.target);
      }),
    { threshold },
  );
  fx.signal.addEventListener('abort', () => io.disconnect());
  return io;
}

function initPaper(app: HTMLElement, fx: Fx, cat: CatFn) {
  const ch = qs(app, '#vl-chain');
  if (ch) {
    const o = onceObserver(fx, 0.5, () => ch.classList.add('on'));
    if (o) o.observe(ch);
    else ch.classList.add('on');
  }
  const io = onceObserver(fx, 0.3, (el) =>
    window.setTimeout(() => el.classList.remove('fold'), (Number(el.dataset.k) || 0) * 90),
  );
  const done = new Set<string>();
  cat({
    id: 'vl-f',
    grid: '#vl-grid',
    more: '#vl-more',
    page: 12,
    render: (L) => L.map(paper).join(''),
    after: (host) => {
      if (fx.reduce || !io) return;
      let j = 0;
      qsa(host, '.vl-p').forEach((el) => {
        const id = el.dataset.id ?? '';
        if (done.has(id)) return;
        done.add(id);
        el.dataset.k = String(j++ % 4);
        el.classList.add('fold');
        io.observe(el);
      });
    },
  });
}

function initNight(app: HTMLElement, fx: Fx, cat: CatFn) {
  const lit = new Set<string>();
  const io = onceObserver(fx, 0.4, (el) => {
    lit.add(el.dataset.id ?? '');
    window.setTimeout(() => el.classList.remove('unlit'), (Number(el.dataset.k) || 0) * 120);
  });
  cat({
    id: 'vl-f',
    grid: '#vl-grid',
    more: '#vl-more',
    page: 12,
    render: (L) => L.map(nightCard).join(''),
    after: (host) => {
      if (fx.reduce || !io) return;
      let j = 0;
      qsa(host, '.vl-n').forEach((el) => {
        if (lit.has(el.dataset.id ?? '')) return;
        el.dataset.k = String(j++ % 4);
        el.classList.add('unlit');
        io.observe(el);
      });
    },
  });
  // Faroles de papel que suben
  const cv = qs<HTMLCanvasElement>(app, '#vl-sky');
  if (!cv) return;
  const S = fx.canvas2d(cv);
  if (!S) return;
  const rnd = () => Math.random();
  type Lantern = { x: number; y: number; z: number; sp: number; ph: number };
  const mk = (y?: number): Lantern => ({
    x: rnd(),
    y: y ?? 1 + rnd() * 0.2,
    z: 0.35 + rnd() * 0.65,
    sp: 0.00012 + rnd() * 0.00018,
    ph: rnd() * 6.28,
  });
  const L = Array.from({ length: fx.low ? 10 : 22 }, () => mk(rnd())).sort((a, b) => a.z - b.z);
  const stars = Array.from({ length: fx.low ? 50 : 120 }, () => [
    rnd(),
    rnd() * 0.6,
    rnd() * 1.2 + 0.2,
    rnd() * 6.28,
  ]);
  const draw = (t: number) => {
    const g = S.g;
    const s = t / 1000;
    g.clearRect(0, 0, S.w, S.h);
    for (const [x, y, r, p] of stars) {
      g.globalAlpha = 0.25 + 0.35 * Math.sin(s * 1.2 + p);
      g.fillStyle = '#FFF4DE';
      g.beginPath();
      g.arc(x * S.w, y * S.h, r, 0, 6.283);
      g.fill();
    }
    for (const f of L) {
      if (!fx.reduce) {
        f.y -= f.sp * (1 + f.z);
        f.x += Math.sin(s * 0.3 + f.ph) * 0.00012;
        if (f.y < -0.12) Object.assign(f, mk(), { z: f.z });
      }
      const X = f.x * S.w;
      const Y = f.y * S.h;
      const w = 16 + f.z * 20;
      const h = w * 1.25;
      const fl = 0.85 + 0.15 * Math.sin(s * 9 + f.ph * 3);
      g.globalAlpha = 0.9 * f.z;
      const gr = g.createRadialGradient(X, Y, 0, X, Y, w * 2.2);
      gr.addColorStop(0, `rgba(255,170,60,${0.35 * fl})`);
      gr.addColorStop(1, 'rgba(255,170,60,0)');
      g.fillStyle = gr;
      g.fillRect(X - w * 2.2, Y - w * 2.2, w * 4.4, w * 4.4);
      const bg = g.createLinearGradient(X, Y - h / 2, X, Y + h / 2);
      bg.addColorStop(0, '#FFCF7A');
      bg.addColorStop(1, `rgba(255,${(120 + 40 * fl) | 0},40,1)`);
      g.fillStyle = bg;
      g.beginPath();
      g.moveTo(X - w * 0.42, Y - h / 2);
      g.lineTo(X + w * 0.42, Y - h / 2);
      g.quadraticCurveTo(X + w * 0.62, Y, X + w * 0.36, Y + h / 2);
      g.lineTo(X - w * 0.36, Y + h / 2);
      g.quadraticCurveTo(X - w * 0.62, Y, X - w * 0.42, Y - h / 2);
      g.fill();
      g.globalAlpha = 0.55 * f.z;
      g.fillStyle = '#FFF6DA';
      g.beginPath();
      g.ellipse(X, Y + h * 0.35, w * 0.14, w * 0.2, 0, 0, 6.283);
      g.fill();
    }
    g.globalAlpha = 1;
  };
  if (fx.reduce) draw(0);
  else fx.onFrame(draw, cv);
}
