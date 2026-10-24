import type { TplAnimal, TplModel } from '../engine/model';
import { barcode, deco, pic, premiumDesign, type CatFn, type Fx } from '../engine/premium';
import { availLine, campaignArt, fmt, logoMark, qs, qsa } from '../engine/runtime';
import { esc, unesc } from '../engine/safe';

/*
 * Terminal (Premium).
 * Claro, "Pases": señalización de aeropuerto. Cada animal tiene su pase de
 * abordar hacia un hogar, con código de barras, puerta y estado; los pases se
 * imprimen al llegar. La campaña es un vuelo especial.
 * Oscuro, "Tablero": un tablero de salidas de paletas giratorias. Las letras
 * giran hasta su lugar, el tablero cambia de página solo y el catálogo completo
 * es el tablero filtrable.
 */
const CSS = `
.tpl-terminal{--k-fd:'Overpass',system-ui,sans-serif;--k-fw:800;--k-ls:-.03em;--k-r:14px;--mono:'Overpass Mono',ui-monospace,monospace;--sign:#FFC72C;font-family:'Overpass',system-ui,sans-serif}
.tpl-terminal[data-mode=light]{--k-bg:#F2F3F5;--k-ink:#0F1115;--k-soft:#585E69;--k-line:rgba(15,17,21,.12);--k-card:#FFFFFF;--k-tint:rgba(15,17,21,.05);--k-sh:0 0 0 1px rgba(15,17,21,.07),0 10px 24px -18px rgba(15,17,21,.4);color-scheme:light}
.tpl-terminal[data-mode=dark]{--k-bg:#09090A;--k-ink:#F4F4EE;--k-soft:#9A9A92;--k-line:rgba(255,255,255,.09);--k-card:#131315;--k-tint:rgba(255,255,255,.05);--k-sh:0 0 0 1px rgba(255,255,255,.07);color-scheme:dark}
.tpl-terminal .k-eb{font-family:var(--mono);font-weight:600;letter-spacing:.14em}
.tpl-terminal .tm-top{display:flex;align-items:center;gap:16px;padding-block:14px;position:relative;z-index:5}
.tpl-terminal .tm-logo{display:flex;align-items:center;gap:12px;text-decoration:none;font-weight:800;font-size:19px;letter-spacing:-.02em}
.tpl-terminal .tm-logo i{width:42px;height:42px;border-radius:8px;display:grid;place-items:center;font-style:normal;background:var(--sign);color:#0F1115;font-weight:900;font-size:15px}
.tpl-terminal .tm-nav{display:flex;gap:4px;margin-left:auto}
.tpl-terminal .tm-nav a{display:flex;align-items:center;gap:6px;padding:10px 12px;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px;color:var(--k-soft)}
.tpl-terminal .tm-nav a:hover{color:var(--k-ink);background:var(--k-tint)}
.tpl-terminal .tm-nav svg{width:16px}
@media (max-width:760px){.tpl-terminal .tm-nav{display:none}.tpl-terminal .tm-top .k-mode{margin-left:auto}}
.tpl-terminal .k-mode,.tpl-terminal .k-chip,.tpl-terminal .k-q,.tpl-terminal .k-sort select,.tpl-terminal .k-more,.tpl-terminal .k-btn{border-radius:8px}
.tpl-terminal .tm-signs{background:#16181D;color:#fff}
.tpl-terminal .tm-signs .w{display:flex;gap:4px;overflow-x:auto;scrollbar-width:none;padding-block:10px}
.tpl-terminal .tm-signs .w::-webkit-scrollbar{display:none}
.tpl-terminal .tm-sg{flex:none;display:inline-flex;align-items:center;gap:12px;padding:10px 16px 10px 10px;border-radius:6px;text-decoration:none;font-weight:800;font-size:15px;white-space:nowrap}
.tpl-terminal .tm-sg i{width:30px;height:30px;border-radius:4px;display:grid;place-items:center;background:#fff;color:#16181D}
.tpl-terminal .tm-sg i svg{width:18px}
.tpl-terminal .tm-sg.y{background:var(--sign);color:#16181D}
.tpl-terminal .tm-sg.y i{background:#16181D;color:var(--sign)}
.tpl-terminal .tm-sg span{font-weight:500;opacity:.75;font-size:13px}
.tpl-terminal .tm-hero{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:clamp(24px,4vw,60px);align-items:center;padding-block:clamp(36px,6vw,90px)}
.tpl-terminal .tm-h1{font-weight:900;font-size:clamp(54px,8vw,128px);line-height:.86;letter-spacing:-.055em}
.tpl-terminal .tm-h1 em{font-style:normal;display:inline-block;background:var(--sign);padding:0 .14em;border-radius:.08em;margin-top:.06em}
.tpl-terminal .tm-lede{margin-top:22px;font-size:clamp(17px,1.5vw,20px);line-height:1.6;color:var(--k-soft);max-width:30em}
.tpl-terminal .tm-cta{display:flex;flex-wrap:wrap;gap:12px;margin-top:28px}
.tpl-terminal .tm-cta .k-btn{background:#16181D;color:#fff!important}
.tpl-terminal .tm-cta .k-btn i{display:grid;place-items:center;width:26px;height:26px;border-radius:4px;background:var(--sign);color:#16181D;font-style:normal}
.tpl-terminal .tm-hp{position:relative;perspective:1200px}
.tpl-terminal .tm-hp .ps{animation:tmPrint 1.4s cubic-bezier(.2,.8,.2,1) both;transform:rotate(-3deg)}
@keyframes tmPrint{from{clip-path:inset(0 0 100% 0);transform:translateY(-30px) rotate(-3deg)}to{clip-path:inset(0 0 0 0);transform:rotate(-3deg)}}
.tpl-terminal .tm-hp .ps + .ps{position:absolute;inset:auto 0 -22px 30px;z-index:-1;transform:rotate(3deg);opacity:.6;animation:none}
.tpl-terminal .ps{display:grid;grid-template-columns:minmax(0,1fr) 108px;border:0;padding:0;cursor:pointer;text-align:left;color:#0F1115;background:none;width:100%;filter:drop-shadow(0 16px 24px rgba(15,17,21,.18))}
.tpl-terminal .ps-m,.tpl-terminal .ps-s{background:#fff;position:relative}
.tpl-terminal .ps-m{border-radius:14px 0 0 14px;padding:16px 18px 18px;display:flex;flex-direction:column;gap:14px;min-width:0;-webkit-mask:radial-gradient(circle at 100% 0,transparent 9px,#000 9.5px) top right/100% 51% no-repeat,radial-gradient(circle at 100% 100%,transparent 9px,#000 9.5px) bottom right/100% 51% no-repeat;mask:radial-gradient(circle at 100% 0,transparent 9px,#000 9.5px) top right/100% 51% no-repeat,radial-gradient(circle at 100% 100%,transparent 9px,#000 9.5px) bottom right/100% 51% no-repeat}
.tpl-terminal .ps-s{border-radius:0 14px 14px 0;border-left:2px dashed rgba(15,17,21,.18);padding:16px 12px;display:flex;flex-direction:column;justify-content:flex-end;gap:2px;transition:transform .5s cubic-bezier(.3,1.4,.5,1);-webkit-mask:radial-gradient(circle at 0 0,transparent 9px,#000 9.5px) top left/100% 51% no-repeat,radial-gradient(circle at 0 100%,transparent 9px,#000 9.5px) bottom left/100% 51% no-repeat;mask:radial-gradient(circle at 0 0,transparent 9px,#000 9.5px) top left/100% 51% no-repeat,radial-gradient(circle at 0 100%,transparent 9px,#000 9.5px) bottom left/100% 51% no-repeat}
.tpl-terminal .ps:hover .ps-s,.tpl-terminal .ps:focus-visible .ps-s{transform:translate(10px,6px) rotate(5deg)}
.tpl-terminal .ps-top{display:flex;justify-content:space-between;align-items:center;font-family:var(--mono);font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#585E69;padding-bottom:10px;border-bottom:2px solid #0F1115}
.tpl-terminal .ps-top b{font-family:'Overpass',sans-serif;font-weight:900;font-size:14px;letter-spacing:-.01em;text-transform:none;color:#0F1115}
.tpl-terminal .ps-b{display:flex;gap:14px;align-items:center;min-width:0}
.tpl-terminal .ps-ph{flex:none;width:clamp(64px,7vw,92px);aspect-ratio:1;border-radius:8px;overflow:hidden}
.tpl-terminal .ps-f{display:flex;flex-direction:column;min-width:0;gap:2px}
.tpl-terminal .ps small{display:block;font-family:var(--mono);font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:#6A707B;font-weight:500}
.tpl-terminal .ps-n{font-weight:900;font-size:clamp(24px,2.4vw,34px);line-height:1;letter-spacing:-.04em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tpl-terminal .ps-route{display:flex;align-items:flex-end;gap:10px;font-family:var(--mono);font-weight:700;font-size:15px;margin-top:6px}
.tpl-terminal .ps-route svg{width:40px;margin-bottom:4px;flex:none}
.tpl-terminal .ps-g{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;font-weight:700;font-size:14px}
.tpl-terminal .ps-g > span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tpl-terminal .ps-g em{font-style:normal;padding:2px 6px;border-radius:4px;background:#E8F5EC;color:#14632F}
.tpl-terminal .ps.new .ps-g em{background:var(--sign);color:#16181D}
.tpl-terminal .ps.pri .ps-g em{background:#FFE3D6;color:#9A3412}
.tpl-terminal .ps-bc{display:block;height:46px;margin-bottom:auto;color:#0F1115}
.tpl-terminal .ps-bc svg{display:block;width:100%;height:100%}
.tpl-terminal .ps-s b{font-weight:900;font-size:32px;line-height:1;letter-spacing:-.04em}
.tpl-terminal .tm-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:clamp(16px,2.4vw,28px)}
.tpl-terminal .tm-grid .ps.is-pre{opacity:1;transform:none;clip-path:inset(0 0 100% 0);transition:clip-path 1.1s cubic-bezier(.2,.8,.2,1)}
.tpl-terminal .tm-grid .ps.is-pre.is-in{clip-path:inset(0 0 -40px 0)}
@media (max-width:1000px){.tpl-terminal .tm-grid{grid-template-columns:minmax(0,1fr)}}
@media (max-width:860px){.tpl-terminal .tm-hero{grid-template-columns:minmax(0,1fr)}}
@media (max-width:520px){.tpl-terminal .ps{grid-template-columns:minmax(0,1fr) 78px}.tpl-terminal .ps-g{grid-template-columns:repeat(2,minmax(0,1fr))}.tpl-terminal .ps-s b{font-size:24px}.tpl-terminal .ps-bc{height:36px}}
.tpl-terminal .tm-flight{padding:clamp(24px,4vw,56px);border-radius:18px;background:#16181D;color:#fff;display:flex;flex-direction:column;gap:22px}
.tpl-terminal .tm-flight .k-eb{color:var(--sign)}
.tpl-terminal .tm-flight h2{font-weight:900;font-size:clamp(40px,5.6vw,84px);line-height:.9;letter-spacing:-.05em}
.tpl-terminal .tm-route{position:relative;display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:16px;align-items:center;font-family:var(--mono)}
.tpl-terminal .tm-route b{display:block;font-family:'Overpass',sans-serif;font-weight:900;font-size:clamp(28px,4vw,52px);letter-spacing:-.04em;line-height:1}
.tpl-terminal .tm-route small{font-size:11px;letter-spacing:.1em;text-transform:uppercase;opacity:.65}
.tpl-terminal .tm-track{position:relative;height:40px}
.tpl-terminal .tm-track::before{content:"";position:absolute;left:0;right:0;top:50%;border-top:2px dashed rgba(255,255,255,.3)}
.tpl-terminal .tm-track i{position:absolute;left:0;top:50%;height:2px;width:var(--p,0%);background:var(--sign);transition:width 2.2s cubic-bezier(.2,.8,.2,1)}
.tpl-terminal .tm-track svg{position:absolute;top:50%;left:var(--p,0%);width:34px;translate:-50% -50%;color:var(--sign);transition:left 2.2s cubic-bezier(.2,.8,.2,1)}
.tpl-terminal .tm-figs{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:2px;border-radius:10px;overflow:hidden}
.tpl-terminal .tm-figs div{background:rgba(255,255,255,.06);padding:14px 16px}
.tpl-terminal .tm-figs span{display:block;font-family:var(--mono);font-size:11px;letter-spacing:.1em;text-transform:uppercase;opacity:.65}
.tpl-terminal .tm-figs b{font-weight:800;font-size:clamp(18px,2vw,26px);font-variant-numeric:tabular-nums}
.tpl-terminal .tm-flight .k-btn{background:var(--sign);color:#16181D!important;align-self:flex-start}
@media (max-width:700px){.tpl-terminal .tm-figs{grid-template-columns:1fr 1fr}}
.tpl-terminal[data-mode=light] .k-act{border-radius:10px}
.tpl-terminal[data-mode=light] .k-act .k-go{border-radius:6px;background:var(--sign);color:#16181D}
.tpl-terminal[data-mode=light] .k-act:hover{transform:translateY(-6px)}
.tpl-terminal[data-mode=light] .k-help{border-radius:14px;background:var(--sign);color:#16181D}
.tpl-terminal[data-mode=light] .k-help .k-btn{background:#16181D;color:#fff!important;border-radius:8px}
.tpl-terminal[data-mode=light] .k-chip[aria-pressed="true"]{background:#16181D;color:var(--sign)}
.tpl-terminal .tb-wrap{padding-block:clamp(24px,4vw,56px) clamp(40px,6vw,80px);background:radial-gradient(70% 60% at 50% 0%,rgba(255,199,44,.07),transparent 70%)}
.tpl-terminal .tb-title{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:flex-end;gap:16px 30px;margin-bottom:26px}
.tpl-terminal .tb-h1{font-weight:900;font-size:clamp(50px,7.6vw,120px);line-height:.86;letter-spacing:-.055em}
.tpl-terminal .tb-h1 em{font-style:normal;color:var(--sign)}
.tpl-terminal .tb-lede{font-size:clamp(16px,1.4vw,19px);line-height:1.6;color:var(--k-soft);max-width:28em}
.tpl-terminal .tb{border-radius:14px;background:#0F0F11;padding:clamp(10px,1.6vw,20px);box-shadow:inset 0 0 0 1px rgba(255,255,255,.06),0 40px 80px -40px #000;overflow:hidden}
.tpl-terminal .tb-bar{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:4px 4px 14px;font-family:var(--mono);font-size:clamp(12px,1.2vw,15px);letter-spacing:.12em;text-transform:uppercase}
.tpl-terminal .tb-bar b{display:flex;align-items:center;gap:10px;color:var(--sign)}
.tpl-terminal .tb-bar b svg{width:20px}
.tpl-terminal .tb-bar .clk{display:flex;align-items:center;gap:12px}
.tpl-terminal .tb-h{display:flex;gap:var(--gap);padding:0 6px 8px;font-family:var(--mono);font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--k-soft)}
.tpl-terminal .tb-h span{width:calc(var(--n) * var(--cw) + (var(--n) - 1) * 2px);flex:none}
.tpl-terminal .tb{--cw:clamp(14px,1.55vw,24px);--gap:clamp(8px,1vw,16px)}
.tpl-terminal .tb-rows{display:flex;flex-direction:column;gap:5px}
.tpl-terminal .tb-r{display:flex;gap:var(--gap);align-items:center;border:0;background:none;padding:4px 6px;border-radius:6px;cursor:pointer;color:inherit;text-align:left;width:100%;transition:background .2s}
.tpl-terminal .tb-r:hover,.tpl-terminal .tb-r:focus-visible{background:rgba(255,199,44,.08)}
.tpl-terminal .fp{display:flex;gap:2px;flex:none}
.tpl-terminal .fp i{position:relative;display:grid;place-items:center;width:var(--cw);height:calc(var(--cw) * 1.45);border-radius:3px;background:linear-gradient(180deg,#232327 0 49%,#1A1A1D 51%);font-style:normal;font-family:var(--mono);font-weight:700;font-size:calc(var(--cw) * .82);color:#F2F2EA;box-shadow:inset 0 1px 0 rgba(255,255,255,.05),0 1px 0 rgba(0,0,0,.6)}
.tpl-terminal .fp i::after{content:"";position:absolute;left:0;right:0;top:50%;height:1px;background:rgba(0,0,0,.65)}
.tpl-terminal .fp i::before{content:attr(data-v)}
.tpl-terminal .fp i.f{animation:tbFlip .09s linear}
@keyframes tbFlip{from{transform:rotateX(70deg);filter:brightness(1.6)}to{transform:none}}
.tpl-terminal .tb-r.new .c-e i{color:var(--sign)}
.tpl-terminal .tb-r.ok .c-e i{color:#7EE2A8}
.tpl-terminal .tb-r.pri .c-e i{color:#FF9F6E}
.tpl-terminal .tb-r .c-n i{color:#fff}
.tpl-terminal .tb-foot{display:flex;flex-wrap:wrap;justify-content:space-between;gap:10px;padding:14px 6px 2px;font-family:var(--mono);font-size:12px;color:var(--k-soft);letter-spacing:.06em}
.tpl-terminal .tb-pg{display:flex;gap:6px}
.tpl-terminal .tb-pg i{width:22px;height:4px;border-radius:2px;background:rgba(255,255,255,.12)}
.tpl-terminal .tb-pg i.on{background:var(--sign)}
@media (max-width:700px){.tpl-terminal .tb{--cw:clamp(12px,3.9vw,20px);--gap:8px;padding:10px 8px}.tpl-terminal .tb-r{padding:4px 2px}.tpl-terminal .tb-h{padding:0 2px 8px}}
.tpl-terminal[data-mode=dark] .k-chip[aria-pressed="true"],.tpl-terminal[data-mode=dark] .k-more{background:var(--sign);color:#16181D}
.tpl-terminal .tb-camp{display:flex;flex-direction:column;gap:20px}
.tpl-terminal .tb-camp .tb-r{cursor:default}
.tpl-terminal .tb-camp .k-btn{background:var(--sign);color:#16181D!important;align-self:flex-start}
.tpl-terminal .tb-camp .tb-r:hover{background:none}
.tpl-terminal[data-mode=dark] .k-act{border-radius:10px;background:#111113}
.tpl-terminal[data-mode=dark] .k-act .k-go{border-radius:6px;background:var(--sign);color:#16181D}
.tpl-terminal[data-mode=dark] .k-act:hover{transform:translateY(-6px);box-shadow:0 0 0 1px var(--sign)}
.tpl-terminal[data-mode=dark] .k-help{border-radius:14px;background:#111113;color:var(--k-ink);box-shadow:inset 0 0 0 1px var(--k-line)}
.tpl-terminal[data-mode=dark] .k-help h2{color:var(--sign)}
.tpl-terminal[data-mode=dark] .k-help .k-btn{background:var(--sign);color:#16181D!important}
.tpl-terminal .tm-hp-e{position:relative;aspect-ratio:4/3;border-radius:22px;overflow:hidden}
`;

const FL = ' ABCDEFGHIJKLMNÑOPQRSTUVWXYZ0123456789·:%$.';
const when = (d: number) => (d === 0 ? 'HOY' : d < 30 ? `${d} D` : `${Math.round(d / 30)} M`);
const state = (a: TplAnimal, narrow = false): [string, string] =>
  a.isNew
    ? ['NUEVO', 'new']
    : a.days > 90
      ? [narrow ? 'ESPERA' : 'PRIORIDAD', 'pri']
      : [narrow ? 'LISTO' : 'DISPONIBLE', 'ok'];
const gate = (a: TplAnimal) => String(a.i + 1).padStart(3, '0');
const SPECIES = { perro: 'PERRO', gato: 'GATO', otro: 'OTRO' } as const;

/** Celdas de paletas. Recibe texto ya escapado: se trabaja letra a letra sobre el texto plano. */
const cells = (txt: string, n: number, cls = '') => {
  const t = [...unesc(String(txt)).toUpperCase()].slice(0, n);
  while (t.length < n) t.push(' ');
  return `<span class="fp ${cls}" aria-hidden="true">${t.map((c) => `<i data-c="${c === ' ' ? '' : esc(c)}"></i>`).join('')}</span>`;
};

const row = (a: TplAnimal, narrow: boolean) => {
  const [s, k] = state(a, narrow);
  return `<a class="tb-r ${k}" href="${a.href}" data-id="${a.id}" aria-label="${a.name}, ${a.spLabel.toLowerCase()}${a.age ? ` de ${a.age}` : ''}. ${s.toLowerCase()}. Puerta ${gate(a)}">${narrow ? '' : cells(when(a.days), 4, 'c-t')}${cells(a.name, narrow ? 8 : 12, 'c-n')}${narrow ? '' : cells(SPECIES[a.sp], 5, 'c-s')}${narrow ? '' : cells('TU HOGAR', 8, 'c-d')}${cells(gate(a), 3, 'c-g')}${cells(s, narrow ? 6 : 10, 'c-e')}</a>`;
};

const head = (narrow: boolean) =>
  `<div class="tb-h" aria-hidden="true">${narrow ? '' : '<span style="--n:4">Llegó</span>'}<span style="--n:${narrow ? 8 : 12}">Pasajero</span>${narrow ? '' : '<span style="--n:5">Especie</span><span style="--n:8">Destino</span>'}<span style="--n:3">Pta</span><span style="--n:${narrow ? 6 : 10}">Estado</span></div>`;

function makePass(m: TplModel) {
  const from = m.ORG.city ? esc(unesc(m.ORG.city).slice(0, 3).toUpperCase()) : 'AF';
  return (a: TplAnimal, extra = '') => {
    const [s, k] = state(a);
    return `<a class="ps ${k}" href="${a.href}" data-id="${a.id}"${extra}><span class="ps-m"><span class="ps-top"><b>AdoptaFácil</b><span>Pase de abordar</span></span><span class="ps-b"><span class="ps-ph">${deco(a, { dx: 6, dy: 14, s: 1.08 })}</span><span class="ps-f"><small>Pasajero</small><b class="ps-n">${a.name}</b><span class="ps-route"><span><small>Desde</small>${from}</span><svg viewBox="0 0 40 12" aria-hidden="true"><path d="M0 6h34M30 2l6 4-6 4" fill="none" stroke="currentColor" stroke-width="1.6"/></svg><span><small>Hacia</small>HOGAR</span></span></span></span>
    <span class="ps-g"><span><small>Vuelo</small>AF-${gate(a)}</span><span><small>Edad</small>${a.age || '—'}</span><span><small>Tamaño</small>${a.sizeLabel || '—'}</span><span><small>Estado</small><em>${s.toLowerCase()}</em></span></span></span>
    <span class="ps-s"><span class="ps-bc">${barcode(a.id, 120, 30)}</span><small>Puerta</small><b>${gate(a)}</b></span></a>`;
  };
}

const PLANE = `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z" transform="rotate(90 12 12)"/></svg>`;
const days = (n: number) => `${n} ${n === 1 ? 'día' : 'días'}`;

export const terminal = premiumDesign({
  id: 'terminal',
  catId: 'tm-cat',
  modes: { light: 'Pases', dark: 'Tablero' },
  fonts: 'family=Overpass:wght@400;500;600;700;800;900&family=Overpass+Mono:wght@400;600;700',
  css: CSS,
  html({ m, P, mode }) {
    const { ORG, ANIMALS, CAMPAIGN, SHOW } = m;
    const n = ANIMALS.length;
    const nav = `<nav class="tm-nav" aria-label="Secciones"><a href="#tm-cat">${pic.arrow}Animales</a><a href="#tm-camp">${pic.arrow}Campaña</a><a href="#tm-ldg">${pic.arrow}Libro público</a></nav>`;
    const top = `<header class="w tm-top"><a class="tm-logo" href="#tm-cat"><i>${logoMark(m)}</i>${ORG.name}</a>${nav}${P.modeBtn()}</header>`;
    const tail = (bg: string) =>
      `${P.needs()}${P.prods(P.hd('Tienda solidaria', 'Productos'), bg)}${P.help()}${P.about()}${P.revs()}<div id="tm-ldg">${P.ledger()}</div>${P.contact()}${P.foot()}`;
    const desc = CAMPAIGN.description
      ? `<p class="k-sub" style="margin:0 0 18px">${CAMPAIGN.description}</p>`
      : '';
    const btn = `<a class="k-btn" href="${CAMPAIGN.href}" data-magnet>Ver campaña y aportar ${pic.arrow}</a>${P.more()}`;
    const lede = ORG.lede || availLine(m);
    if (mode === 'light') {
      const pass = makePass(m);
      const f = ANIMALS[1] || ANIMALS[0];
      const g = ANIMALS[0];
      const hp = f
        ? `${pass(f)}${g && g !== f ? pass(g, ' aria-hidden="true" tabindex="-1"') : ''}`
        : `<div class="tm-hp-e">${campaignArt(m)}</div>`;
      return `${top}<div class="tm-signs"><div class="w"><a class="tm-sg y" href="#tm-cat"><i>${pic.arrow}</i>Adopciones <span>${n ? `Puertas 001 a ${String(n).padStart(3, '0')}` : 'Muy pronto'}</span></a><a class="tm-sg" href="#tm-camp"><i>${pic.heart}</i>Campaña <span>Vuelo especial</span></a><a class="tm-sg" href="#tm-ldg"><i>${pic.book}</i>Libro público</a>${SHOW.contacto ? `<a class="tm-sg" href="#k-contact"><i>${pic.pin}</i>${ORG.city || 'Contacto'}</a>` : ''}</div></div>${P.tbar()}
        <section class="w tm-hero"><div><p class="k-eb">Terminal ${ORG.short} · Llegadas y salidas</p><h1 class="tm-h1">Próximo destino: <em>tu casa</em></h1>
          <p class="tm-lede">${lede}${n ? ' Revisa la puerta, conoce a cada pasajero y embarca con quien te robe el corazón.' : ''}</p>
          <div class="tm-cta"><a class="k-btn" href="#tm-cat" data-magnet><i>${pic.arrow}</i>Ver los pases</a></div></div>
          <div class="tm-hp">${hp}</div></section>
        ${P.acts(P.hd('Cómo participar', 'Elige tu puerta'))}
        <section class="w k-sec" data-sec="animales" id="tm-cat">${P.hd('Pases de abordar', 'Mascotas en adopción', '', n ? 'Los pases se imprimen al llegar. Toca un pase para ver la ficha completa.' : '')}${P.catControls('tm-f')}<div class="tm-grid" id="tm-grid"></div><button type="button" class="k-more" id="tm-more" hidden></button></section>
        ${P.campaign(
          () => `<section class="w k-sec" data-sec="campana" id="tm-camp"><div class="tm-flight"><p class="k-eb">Vuelo especial${CAMPAIGN.category ? ` · ${CAMPAIGN.category}` : ''}</p><h2>${CAMPAIGN.title}</h2>${desc}
          <div class="tm-route"><div><small>Hoy</small><b>${fmt(CAMPAIGN.raised).replace('$', '$ ')}</b></div><div class="tm-track k-bar" data-w="${Math.max(3, CAMPAIGN.pct)}"><i></i>${PLANE}</div><div style="text-align:right"><small>Meta</small><b>${fmt(CAMPAIGN.goal).replace('$', '$ ')}</b></div></div>
          <div class="tm-figs"><div><span>Recaudado</span><b id="tm-raised">${fmt(CAMPAIGN.raised)}</b></div><div><span>Recorrido</span><b>${CAMPAIGN.pct}%</b></div><div><span>Cierra</span><b>${CAMPAIGN.deadlineShort || '—'}</b></div><div><span>Faltan</span><b>${days(CAMPAIGN.daysLeft)}</b></div></div>${btn}</div></section>`,
        )}
        ${tail('#F4F5F7')}`;
    }
    const board = [
      ['META', fmt(CAMPAIGN.goal)],
      ['RECAUDADO', fmt(CAMPAIGN.raised)],
      ['AVANCE', CAMPAIGN.pct + '%'],
      ['CIERRA', CAMPAIGN.deadlineShort || '—'],
      ['FALTAN', `${CAMPAIGN.daysLeft} ${CAMPAIGN.daysLeft === 1 ? 'DÍA' : 'DÍAS'}`],
    ];
    return `${top}${P.tbar()}
      <section class="tb-wrap"><div class="w"><div class="tb-title"><h1 class="tb-h1">Salidas <em>hacia un hogar</em></h1><p class="tb-lede">${lede}${n ? ' El tablero gira solo; toca cualquier fila para conocer al pasajero.' : ''}</p></div>
        <div class="tb" id="tb-hero"><div class="tb-bar"><b>${PLANE}Salidas</b><span class="clk"><span>${ORG.city || ORG.short}</span>${cells('00:00', 5, 'c-clk')}</span></div><div id="tb-hh"></div><div class="tb-rows" id="tb-hr"></div><div class="tb-foot"><span id="tb-hp">${n ? 'Página 1' : 'Sin salidas programadas por ahora'}</span><span class="tb-pg" id="tb-dots"></span></div></div></div></section>
      ${P.acts(P.hd('Cómo participar', 'Elige tu puerta'))}
      <section class="w k-sec" data-sec="animales" id="tm-cat">${P.hd('Tablero completo', 'Mascotas en adopción', '', n ? 'Busca por nombre o filtra por especie. Las letras giran hasta mostrar a cada pasajero.' : '')}${P.catControls('tm-f')}<div class="tb" style="margin-top:4px"><div id="tb-ch"></div><div class="tb-rows" id="tm-grid"></div></div><button type="button" class="k-more" id="tm-more" hidden></button></section>
      ${P.campaign(
        () => `<section class="w k-sec" data-sec="campana" id="tm-camp"><div class="tb-camp"><div><p class="k-eb" style="color:var(--sign)">Vuelo especial · Campaña activa</p><h2 class="k-h2">${CAMPAIGN.title}</h2>${desc}</div>
        <div class="tb" id="tb-camp"><div class="tb-rows">${board.map(([k, v]) => `<div class="tb-r ok" role="presentation">${cells(k, 9, 'c-n')}${cells(v, 11, 'c-e')}</div>`).join('')}</div></div>
        <p class="sr">Meta ${fmt(CAMPAIGN.goal)}, recaudado ${fmt(CAMPAIGN.raised)}, avance ${CAMPAIGN.pct}%${CAMPAIGN.deadline ? `, cierra el ${CAMPAIGN.deadline}` : ''}.</p><div class="k-bar" data-w="${Math.max(2, CAMPAIGN.pct)}" style="height:10px"><i style="background:var(--sign)"></i></div>${btn}</div></section>`,
      )}
      ${tail('#18181B')}`;
  },
  init(app, { m, mode, fx, cat }) {
    fx.fillOnView(app, '.k-bar');
    fx.countUp(qs(app, '#tm-raised'), m.CAMPAIGN.raised, fmt);
    fx.magnet(app);
    fx.reveal(app, '.k-act,.k-nd,.k-pr,.k-revs figure', { stagger: 80 });
    const c = qs(app, '[data-sec="contacto"]');
    if (c) c.id = 'k-contact';
    if (mode === 'light') {
      const pass = makePass(m);
      cat({
        id: 'tm-f',
        grid: '#tm-grid',
        more: '#tm-more',
        page: 12,
        render: (L) => L.map((a) => pass(a)).join(''),
        after: (host) => fx.reveal(host, '.ps:not(.is-in)', { stagger: 90, mod: 2 }),
      });
      return;
    }
    initBoard(app, m, fx, cat);
  },
});

/* Paletas giratorias: cada celda gira por letras al azar antes de quedarse en la suya */
function initBoard(app: HTMLElement, m: TplModel, fx: Fx, cat: CatFn) {
  const { signal } = fx;
  const { ANIMALS } = m;
  type Spin = { t: string; n: number; at: number };
  const live = new Map<HTMLElement, Spin>();
  const spin = (el: HTMLElement, n: number, at: number) =>
    live.set(el, { t: el.dataset.c || ' ', n, at });
  const flip = (root: Element | null, base = 0) => {
    if (!root) return;
    const rows = root.matches('.tb-r,.tb-bar') ? [root] : qsa(root, '.tb-r,.tb-bar');
    rows.forEach((r, ri) =>
      qsa(r, '.fp i').forEach((el, ci) => {
        if (fx.reduce) {
          el.dataset.v = el.dataset.c || ' ';
          return;
        }
        spin(el, 2 + ((ri * 7 + ci * 3) % 7), performance.now() + base + ri * 70 + ci * 22);
      }),
    );
  };
  if (!fx.reduce)
    fx.onFrame((now) => {
      if (!live.size) return;
      for (const [el, s] of live) {
        if (now < s.at) continue;
        if (s.n-- > 0) {
          el.dataset.v = FL[(Math.random() * FL.length) | 0];
          s.at = now + 55;
          el.classList.remove('f');
          void el.offsetWidth;
          el.classList.add('f');
        } else {
          el.dataset.v = s.t;
          live.delete(el);
        }
      }
    });
  const narrow = () => innerWidth < 700;
  // Tablero del inicio: páginas de 8 que cambian solas
  const hr = qs(app, '#tb-hr')!;
  const hh = qs(app, '#tb-hh')!;
  const dots = qs(app, '#tb-dots')!;
  const hp = qs(app, '#tb-hp')!;
  const PG = 8;
  const pages = Math.max(1, Math.min(6, Math.ceil(ANIMALS.length / PG)));
  let pg = 0;
  dots.innerHTML = ANIMALS.length
    ? Array.from({ length: pages }, (_, i) => `<i class="${i ? '' : 'on'}"></i>`).join('')
    : '';
  const page = () => {
    if (!ANIMALS.length) return;
    const L = ANIMALS.slice(pg * PG, pg * PG + PG);
    hh.innerHTML = head(narrow());
    hr.innerHTML = L.map((a) => row(a, narrow())).join('');
    hp.textContent = `Página ${pg + 1} de ${pages} · ${ANIMALS.length} ${ANIMALS.length === 1 ? 'pasajero' : 'pasajeros'}`;
    qsa(dots, 'i').forEach((d, i) => d.classList.toggle('on', i === pg));
    flip(hr);
  };
  page();
  const clk = qs(app, '.c-clk');
  const tick = () => {
    if (!clk) return;
    const d = new Date();
    const s = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    qsa(clk, 'i').forEach((el, i) => (el.dataset.c = s[i]));
    flip(qs(app, '#tb-hero .tb-bar'));
  };
  tick();
  const ti = window.setInterval(tick, 30000);
  signal.addEventListener('abort', () => clearInterval(ti));
  if (!fx.reduce && pages > 1) {
    const pi = window.setInterval(() => {
      if (document.hidden) return;
      const r = hr.getBoundingClientRect();
      if (r.bottom < 0 || r.top > innerHeight) return;
      pg = (pg + 1) % pages;
      page();
    }, 9000);
    signal.addEventListener('abort', () => clearInterval(pi));
  }
  // Tablero completo con filtros
  const ch = qs(app, '#tb-ch')!;
  ch.innerHTML = ANIMALS.length ? head(narrow()) : '';
  let prev = 0;
  cat({
    id: 'tm-f',
    grid: '#tm-grid',
    more: '#tm-more',
    page: 12,
    render: (L) => L.map((a) => row(a, narrow())).join(''),
    after: (host, L) => {
      const rows = qsa(host, '.tb-r');
      const fresh = L.length > prev && prev ? rows.slice(prev) : rows;
      prev = L.length;
      if (fx.reduce) return flip(host);
      fresh.forEach((r) => qsa(r, '.fp i').forEach((el) => (el.dataset.v = '')));
      rows
        .slice(0, rows.length - fresh.length)
        .forEach((r) => qsa(r, '.fp i').forEach((el) => (el.dataset.v = el.dataset.c || ' ')));
      fresh.forEach((r, ri) =>
        qsa(r, '.fp i').forEach((el, ci) =>
          spin(el, 2 + ((ri * 7 + ci * 3) % 6), performance.now() + ri * 60 + ci * 18),
        ),
      );
    },
  });
  const camp = qs(app, '#tb-camp');
  if (camp) {
    if (typeof IntersectionObserver !== 'function') flip(camp);
    else
      fx.observe(
        [camp],
        (e, o) => {
          if (!e.isIntersecting) return;
          o.disconnect();
          flip(camp);
        },
        { threshold: 0.4 },
      );
  }
  let nw = narrow();
  addEventListener(
    'resize',
    () => {
      if (narrow() === nw) return;
      nw = narrow();
      if (ANIMALS.length) ch.innerHTML = head(nw);
      page();
    },
    { signal },
  );
}
