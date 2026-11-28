import { EMPTY, type TplAnimal, type TplModel } from '../engine/model';
import { animalArt, meta, revealFallback } from '../engine/modern';
import { pic, premiumDesign, scopedTransition, vtName } from '../engine/premium';
import { availLine, fmt, logoMark, qs } from '../engine/runtime';
import { unesc } from '../engine/safe';
import type { ThreeModule } from '../engine/types';
import { sleighTeam } from './navidad-art';

/*
 * Bola de nieve (de pago y de temporada; ver `PORTAL_TEMPLATE_SEASONS`).
 * La portada es una bola de nieve en 3D (Three.js) con un pueblito, un árbol
 * con luces y nieve que cae de verdad: se gira arrastrando y, al agitarla, la
 * nieve se arremolina y "te presenta" a un animal al azar para conocerlo.
 * Papá Noel cruza el cielo en su trineo. Los animales están detrás de las
 * puertas de un calendario de adviento que se abren al llegar a ellas, y la
 * campaña es una guirnalda: cada parte de la meta enciende una luz.
 * Sin WebGL, o con movimiento reducido, la bola se dibuja en CSS y queda quieta.
 * Claro, "Escarcha": hielo y plata. Oscuro, "Medianoche": azul profundo y oro.
 */
const CSS = `
.tpl-nieve{--k-fd:'Playfair Display',Georgia,serif;--k-fw:800;--k-ls:-.02em;--k-r:22px;font-family:'Nunito Sans',system-ui,sans-serif;--red:#C8102E;--gold:#E8B84A}
.tpl-nieve[data-mode=light]{--k-bg:#F2F6FC;--k-ink:#0E1E3A;--k-soft:#46587A;--k-line:rgba(14,30,58,.12);--k-card:rgba(255,255,255,.82);--k-tint:#E3EBF7;--k-acc:#C8102E;--k-acc-ink:#FFFFFF;--k-sh:0 0 0 1px rgba(14,30,58,.06),0 24px 50px -30px rgba(30,60,120,.45);--sky1:#BFD3F2;--sky2:#E9F0FB;--hl:#1E4FD8;color-scheme:light}
.tpl-nieve[data-mode=dark]{--k-bg:#060C1E;--k-ink:#EEF3FF;--k-soft:#A9B6D3;--k-line:rgba(238,243,255,.14);--k-card:rgba(20,32,64,.72);--k-tint:rgba(238,243,255,.07);--k-acc:#FFD166;--k-acc-ink:#1A1208;--k-sh:0 0 0 1px rgba(255,209,102,.16);--sky1:#050A1C;--sky2:#14275A;--hl:#FFD166;color-scheme:dark}
.tpl-nieve .k-eb{color:var(--hl)}
.tpl-nieve .rv{--i:0}
@keyframes nbTw{50%{opacity:.25}}

.tpl-nieve .nb-top{position:sticky;top:0;z-index:40;background:color-mix(in srgb,var(--k-bg) 88%,transparent);box-shadow:0 1px 0 var(--k-line)}
@supports ((-webkit-backdrop-filter:blur(1px)) or (backdrop-filter:blur(1px))){.tpl-nieve .nb-top{background:color-mix(in srgb,var(--k-bg) 70%,transparent);-webkit-backdrop-filter:blur(16px) saturate(1.4);backdrop-filter:blur(16px) saturate(1.4)}}
.tpl-nieve .nb-top .w{display:flex;align-items:center;gap:12px;min-height:62px}
.tpl-nieve .nb-id{display:flex;align-items:center;gap:10px;text-decoration:none;min-width:0}
.tpl-nieve .nb-id i{width:36px;height:36px;border-radius:50%;display:grid;place-items:center;font-style:normal;font-weight:800;font-size:12px;background:linear-gradient(135deg,#1E4FD8,#7FB2FF);color:#fff;flex:none;overflow:hidden;box-shadow:0 0 0 2px #fff,0 0 0 4px var(--gold)}
.tpl-nieve .nb-id b{font-family:var(--k-fd);font-weight:800;font-size:17px;line-height:1.15;overflow-wrap:anywhere}
.tpl-nieve .nb-nav{display:flex;gap:2px;margin-left:auto}
.tpl-nieve .nb-nav a{padding:8px 12px;text-decoration:none;font-size:15px;color:var(--k-soft);border-radius:999px}
.tpl-nieve .nb-nav a:hover{color:var(--k-ink);background:var(--k-tint)}
.tpl-nieve .nb-top .k-mode{height:40px;font-size:13px}
.tpl-nieve .nb-don{display:inline-flex;align-items:center;min-height:42px;padding:0 18px;border-radius:999px;background:var(--k-acc);color:var(--k-acc-ink)!important;text-decoration:none;font-weight:800;font-size:15px;flex:none}
@media (max-width:860px){.tpl-nieve .nb-nav{display:none}.tpl-nieve .nb-top .k-mode{margin-left:auto;padding:0 11px}.tpl-nieve .nb-top .k-mode span{display:none}}

/* Portada. */
.tpl-nieve .nb-hero{position:relative;overflow:hidden;isolation:isolate;--slw:clamp(200px,26vw,400px);--lane:calc(var(--slw) * .225 + 28px);background:radial-gradient(120% 80% at 70% 0%,var(--sky2),var(--sky1) 70%);padding-block:calc(var(--lane) + clamp(12px,2.4vw,36px)) clamp(56px,7vw,96px)}
.tpl-nieve[data-mode=light] .nb-hero{background:radial-gradient(120% 90% at 70% 10%,#FFFFFF,#D7E4F7 55%,#B4CBEE)}
.tpl-nieve .nb-stars{position:absolute;inset:0;z-index:-1;pointer-events:none;background-image:radial-gradient(1.5px 1.5px at 20px 30px,#fff 50%,transparent 51%),radial-gradient(1px 1px at 120px 80px,#fff 50%,transparent 51%),radial-gradient(2px 2px at 200px 150px,#fff 50%,transparent 51%),radial-gradient(1px 1px at 300px 40px,#fff 50%,transparent 51%);background-size:340px 220px;opacity:.7}
.tpl-nieve[data-mode=light] .nb-stars{opacity:0}
.tpl-nieve .nb-sky{position:absolute;left:0;right:0;top:clamp(6px,1vw,14px);height:var(--lane);z-index:2;pointer-events:none;overflow:hidden}
.tpl-nieve .nb-sky svg{position:absolute;top:12px;left:58%;width:var(--slw);height:auto;overflow:visible;translate:-50% 0}
.tpl-nieve .nb-hero .w{position:relative;z-index:1;display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:clamp(24px,4vw,64px);align-items:center}
@media (max-width:860px){.tpl-nieve .nb-hero .w{grid-template-columns:minmax(0,1fr)}}
.tpl-nieve .nb-eb{display:inline-flex;align-items:center;gap:8px;padding:8px 14px;border-radius:999px;background:var(--k-card);box-shadow:var(--k-sh);font-weight:700;font-size:14px}
.tpl-nieve .nb-eb svg{width:16px;color:var(--red)}
.tpl-nieve[data-mode=dark] .nb-eb svg{color:var(--gold)}
.tpl-nieve .nb-h1{font-family:var(--k-fd);font-weight:900;font-size:clamp(44px,5.4vw,84px);line-height:.98;letter-spacing:-.02em;margin-top:18px}
.tpl-nieve .nb-h1 em{display:block;font-style:italic;background:linear-gradient(100deg,var(--red),#FF6B7D 40%,var(--gold) 80%);-webkit-background-clip:text;background-clip:text;color:transparent}
.tpl-nieve[data-mode=dark] .nb-h1 em{background:linear-gradient(100deg,#FFD166,#FFF1C7 45%,#FF8A9A 90%);-webkit-background-clip:text;background-clip:text}
.tpl-nieve .nb-lede{font-size:clamp(18px,1.6vw,21px);line-height:1.55;color:var(--k-soft);max-width:30em;margin-top:18px}
.tpl-nieve .nb-cta{display:flex;flex-wrap:wrap;gap:12px;margin-top:26px}
.tpl-nieve .nb-cta .gh{display:inline-flex;align-items:center;gap:8px;min-height:54px;padding:0 22px;border-radius:999px;text-decoration:none;font-weight:800;color:var(--k-ink);box-shadow:inset 0 0 0 2px var(--k-line);background:var(--k-card)}
.tpl-nieve .nb-cta svg{width:18px}
.tpl-nieve .nb-facts{display:flex;flex-wrap:wrap;gap:10px 28px;margin-top:28px;color:var(--k-soft);font-size:14px}
.tpl-nieve .nb-facts b{display:block;font-family:var(--k-fd);font-size:clamp(28px,3vw,40px);line-height:1;color:var(--k-ink);font-variant-numeric:tabular-nums}

/* La bola de nieve. */
.tpl-nieve .nb-globe{position:relative;justify-self:center;width:min(100%,540px);display:flex;flex-direction:column;align-items:center;gap:14px}
.tpl-nieve .nb-stage{position:relative;width:100%;aspect-ratio:1;touch-action:pan-y;cursor:grab}
.tpl-nieve .nb-stage:active{cursor:grabbing}
.tpl-nieve .nb-stage.gl::before{content:"";position:absolute;left:15%;top:10.6%;width:70%;aspect-ratio:1;border-radius:50%;background:radial-gradient(circle at 50% 35%,#24498F,#0B1C44 72%);box-shadow:0 0 80px rgba(120,170,255,.35)}
.tpl-nieve .nb-stage canvas{position:absolute;inset:0;width:100%;height:100%;display:block}
.tpl-nieve .nb-css{position:absolute;inset:0}
.tpl-nieve .nb-stage.gl .nb-css{display:none}
.tpl-nieve .nb-ball{position:absolute;left:9%;right:9%;top:2%;aspect-ratio:1;border-radius:50%;overflow:hidden;background:radial-gradient(circle at 50% 30%,#1D3E7A,#0B1C44 70%);box-shadow:inset 0 0 0 2px rgba(255,255,255,.5),inset -20px -30px 60px rgba(255,255,255,.12),0 30px 60px -20px rgba(0,0,0,.45)}
.tpl-nieve .nb-ball svg{position:absolute;left:0;bottom:0;width:100%}
.tpl-nieve .nb-ball::before{content:"";position:absolute;inset:0;border-radius:50%;background-image:radial-gradient(2px 2px at 30px 40px,#fff 50%,transparent 51%),radial-gradient(3px 3px at 90px 120px,#fff 50%,transparent 51%),radial-gradient(2px 2px at 160px 70px,#fff 50%,transparent 51%);background-size:200px 180px;z-index:1}
.tpl-nieve .nb-ball::after{content:"";position:absolute;inset:0;border-radius:50%;background:radial-gradient(circle at 30% 22%,rgba(255,255,255,.6),rgba(255,255,255,0) 26%);z-index:2}
.tpl-nieve .nb-base{position:absolute;left:18%;right:18%;bottom:2%;height:17%;border-radius:12px 12px 40% 40%/12px 12px 60% 60%;background:linear-gradient(180deg,#A3182B,#6E0E1C);box-shadow:inset 0 6px 0 #E8B84A,0 20px 30px -14px rgba(0,0,0,.5)}
.tpl-nieve .nb-shake{display:inline-flex;align-items:center;gap:10px;min-height:52px;padding:0 22px;border-radius:999px;border:0;cursor:pointer;font:inherit;font-weight:800;background:var(--k-card);color:var(--k-ink);box-shadow:var(--k-sh),inset 0 0 0 2px var(--gold)}
.tpl-nieve .nb-shake svg{width:20px;color:var(--red)}
.tpl-nieve[data-mode=dark] .nb-shake svg{color:var(--gold)}
.tpl-nieve .nb-hint{font-size:13px;color:var(--k-soft);text-align:center}
.tpl-nieve .nb-pick{display:flex;align-items:center;gap:14px;width:100%;max-width:420px;padding:12px;border-radius:20px;background:var(--k-card);box-shadow:var(--k-sh);text-decoration:none;color:inherit}
.tpl-nieve .nb-pick[hidden]{display:none}
.tpl-nieve .nb-pick .ph{position:relative;flex:none;width:72px;height:72px;border-radius:16px;overflow:hidden;background:var(--k-tint)}
.tpl-nieve .nb-pick .ph .portrait{position:absolute;inset:0}
.tpl-nieve .nb-pick span{display:grid;gap:2px;min-width:0}
.tpl-nieve .nb-pick small{color:var(--k-soft);font-size:13px}
.tpl-nieve .nb-pick b{font-family:var(--k-fd);font-size:22px;line-height:1.1}
.tpl-nieve .nb-pick em{font-style:normal;font-weight:800;color:var(--red);font-size:14px}
.tpl-nieve[data-mode=dark] .nb-pick em{color:var(--gold)}

/* Calendario de adviento: cada animal detrás de una puerta numerada. */
.tpl-nieve .nb-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,220px),1fr));gap:clamp(16px,2vw,26px)}
.tpl-nieve .nb-card{display:flex;flex-direction:column;gap:10px;padding:10px 10px 16px;border-radius:var(--k-r);background:var(--k-card);box-shadow:var(--k-sh);text-decoration:none;color:inherit}
.tpl-nieve .nb-card .ph{position:relative;aspect-ratio:1;border-radius:16px;overflow:hidden;background:var(--k-tint);perspective:900px}
.tpl-nieve .nb-card .ph .portrait{position:absolute;inset:0}
.tpl-nieve .nb-door{position:absolute;inset:0;z-index:2;display:grid;place-items:center;transform-origin:0 50%;backface-visibility:hidden;border-radius:16px;background:repeating-linear-gradient(135deg,#C8102E 0 18px,#B00D27 18px 36px);box-shadow:inset 0 0 0 6px #E8B84A,inset 0 0 0 9px rgba(255,255,255,.5);color:#FFF6E0;transition:transform 1.1s cubic-bezier(.2,.8,.2,1),opacity .3s 1s}
.tpl-nieve .nb-card:nth-child(3n+2) .nb-door{background:repeating-linear-gradient(135deg,#1F6B45 0 18px,#185A3A 18px 36px)}
.tpl-nieve .nb-card:nth-child(3n) .nb-door{background:repeating-linear-gradient(135deg,#1E4FD8 0 18px,#1842B8 18px 36px)}
.tpl-nieve .nb-door b{font-family:var(--k-fd);font-size:clamp(48px,6vw,76px);font-weight:900;line-height:1;text-shadow:0 4px 0 rgba(0,0,0,.2)}
.tpl-nieve .nb-door i{position:absolute;right:16px;top:50%;width:10px;height:10px;border-radius:50%;background:#E8B84A}
.tpl-nieve .nb-card.open .nb-door,.tpl-nieve .nb-card:hover .nb-door,.tpl-nieve .nb-card:focus-visible .nb-door{transform:rotateY(-108deg);opacity:0}
.tpl-nieve .nb-card .nw{position:absolute;top:10px;right:10px;z-index:1;padding:5px 10px;border-radius:999px;background:#fff;color:#0E1E3A;font-size:12px;font-weight:800}
.tpl-nieve .nb-card b.nm{font-family:var(--k-fd);font-size:23px;line-height:1.05;padding:0 4px;overflow-wrap:anywhere}
.tpl-nieve .nb-card small{font-size:14px;color:var(--k-soft);padding:0 4px;margin-top:-4px}
.tpl-nieve .nb-card .go{display:flex;justify-content:space-between;align-items:center;padding:0 4px;font-weight:800;font-size:14px;color:var(--red)}
.tpl-nieve[data-mode=dark] .nb-card .go{color:var(--gold)}
.tpl-nieve .nb-card .go svg{width:16px}
@media (max-width:560px){.tpl-nieve .nb-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.tpl-nieve .nb-card b.nm{font-size:19px}.tpl-nieve .nb-card{padding:8px 8px 12px}}
@media (prefers-reduced-motion:reduce){.tpl-nieve .nb-door{display:none}}

/* Campaña: una guirnalda que se enciende con cada aporte. */
.tpl-nieve .nb-camp{position:relative;display:grid;gap:18px;justify-items:center;text-align:center;padding:clamp(28px,5vw,64px) clamp(16px,4vw,56px);border-radius:clamp(24px,3vw,40px);background:radial-gradient(90% 120% at 50% 0%,#14275A,#060C1E);color:#EEF3FF;overflow:hidden}
.tpl-nieve .nb-camp .k-eb{color:#FFD166}
.tpl-nieve .nb-camp h2{font-family:var(--k-fd);font-weight:900;font-size:clamp(32px,4.6vw,64px);line-height:1;max-width:14em}
.tpl-nieve .nb-camp .k-sub{color:#C9D3EA;margin:0 auto}
.tpl-nieve .nb-wire{width:100%;max-width:900px;overflow:visible}
.tpl-nieve .nb-wire .bulb{fill:#3A4666}
.tpl-nieve .nb-wire .bulb.on{fill:var(--c)}
.tpl-nieve .nb-wire .glow{opacity:0}
.tpl-nieve .nb-wire .glow.on{opacity:.45;fill:var(--c)}
.tpl-nieve .nb-pct{font-family:var(--k-fd);font-weight:900;font-size:clamp(64px,10vw,140px);line-height:.9;color:#FFD166;font-variant-numeric:tabular-nums}
.tpl-nieve .nb-figs{display:flex;flex-wrap:wrap;justify-content:center;gap:10px 34px}
.tpl-nieve .nb-figs span{display:block;font-size:13px;color:#A9B6D3}
.tpl-nieve .nb-figs b{font-size:clamp(18px,1.8vw,24px);font-weight:800;font-variant-numeric:tabular-nums}
.tpl-nieve .nb-camp .k-btn{background:#FFD166;color:#1A1208!important}
.tpl-nieve .nb-camp .tpl-more{width:min(100%,640px);text-align:left}

.tpl-nieve .k-act{background:var(--k-card)}
.tpl-nieve .k-help{background:radial-gradient(80% 120% at 100% 0%,#1E4FD8,transparent 60%),linear-gradient(135deg,#8E0D22,#C8102E);color:#FFF8F0}
.tpl-nieve .k-help h2{font-family:var(--k-fd)}
.tpl-nieve .k-help .k-btn{background:#FFF8F0;color:#8E0D22!important}
.tpl-nieve .nb-late{content-visibility:auto;contain-intrinsic-size:auto 760px}
.tpl-nieve .nb-float{display:none}
@media (max-width:700px){
  .tpl-nieve .nb-float{position:fixed;left:16px;right:16px;bottom:max(14px,env(safe-area-inset-bottom));z-index:45;display:flex;justify-content:center;align-items:center;gap:8px;min-height:52px;border-radius:999px;background:var(--k-acc);color:var(--k-acc-ink)!important;font-weight:800;text-decoration:none;box-shadow:0 14px 30px -10px rgba(0,0,0,.45)}
  .tpl-nieve .nb-float svg{width:18px}
  /* El botón "Ayuda" y el aviso de cookies suben por encima del botón de donar. */
  html:has(.nb-float){--af-bottom-bar:66px}
  .tpl-nieve .k-foot{padding-bottom:84px}
}

@media (prefers-reduced-motion:no-preference){
  .tpl-nieve .nb-sky svg{animation:nbFly 20s linear infinite}
  @keyframes nbFly{0%{left:0;translate:-100% 6px}82%,100%{left:100%;translate:0 -2px}}
  .tpl-nieve .nb-sky .lg{transform-box:fill-box;transform-origin:50% 0;animation:nbLeg .45s ease-in-out infinite alternate}
  .tpl-nieve .nb-sky .lg-b{animation-delay:-.22s}
  @keyframes nbLeg{from{rotate:-10deg}to{rotate:12deg}}
  .tpl-nieve .nb-sky .sl-trail circle{animation:nbTw 1s ease-in-out infinite;animation-delay:calc(var(--d,0s) * -1)}
  .tpl-nieve .nb-ball::before{animation:nbSnow 9s linear infinite}
  @keyframes nbSnow{to{background-position:0 180px}}
  .tpl-nieve .nb-wire .bulb.on,.tpl-nieve .nb-wire .glow.on{animation:nbTw 2.2s ease-in-out infinite;animation-delay:calc(var(--d,0s) * -1)}
  @supports ((animation-timeline:view()) and (animation-range:entry)){
    .tpl-nieve .rv,.tpl-nieve .k-act,.tpl-nieve .k-nd,.tpl-nieve .k-pr,.tpl-nieve .k-revs figure{animation:nbIn linear both;animation-timeline:view();animation-range:entry calc(var(--i,0) * 5%) entry calc(65% + var(--i,0) * 5%)}
    @keyframes nbIn{from{opacity:0;translate:0 48px}}
  }
}
.tpl-nieve{--lg-hi:linear-gradient(135deg,#8E0D22,#C8102E)}
/* Sobre el rojo, el saldo siempre en crema (en modo oscuro el acento es oro con tinta oscura). */
.tpl-nieve .af-led{--lg-acc-ink:#FFF8F0}
`;

const STAR = `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2l2.9 6.6 7.1.6-5.4 4.7 1.6 7L12 17.3 5.8 21l1.6-7L2 9.2l7.1-.6z"/></svg>`;
const GIFT = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7M7.5 8a2.5 2.5 0 0 1 0-5C10 3 12 8 12 8s2-5 4.5-5a2.5 2.5 0 0 1 0 5"/></svg>`;
const FLAKE = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 2v20M3.3 7l17.4 10M3.3 17L20.7 7M9 4l3 3 3-3M9 20l3-3 3 3M4 10.5l4 .5-1.5 3.5M20 13.5l-4-.5 1.5-3.5M4 13.5l4-.5-1.5-3.5M20 10.5l-4 .5 1.5 3.5"/></svg>`;

/** Pueblito plano dentro de la bola dibujada en CSS (sin WebGL). */
const GLOBE_SVG = `<svg viewBox="0 0 200 120" aria-hidden="true" focusable="false"><path d="M0 80 Q100 60 200 80 V120 H0z" fill="#F4F8FD"/><path d="M100 20 L122 62 L112 62 L130 92 L70 92 L88 62 L78 62z" fill="#1E6B41"/><path d="M100 12 l3 7 h7 l-6 4 2 7 -6 -4 -6 4 2 -7 -6 -4 h7z" fill="#FFD24D"/><circle cx="94" cy="56" r="2.5" fill="#FF4D4D"/><circle cx="108" cy="72" r="2.5" fill="#6FB7FF"/><circle cx="96" cy="82" r="2.5" fill="#FFD24D"/><rect x="38" y="70" width="30" height="20" fill="#B5483E"/><path d="M34 72 L53 56 L72 72z" fill="#fff"/><rect x="44" y="76" width="7" height="6" fill="#FFD66B"/><rect x="56" y="76" width="7" height="6" fill="#FFD66B"/><circle cx="150" cy="84" r="9" fill="#fff"/><circle cx="150" cy="70" r="6.5" fill="#fff"/><path d="M150 70 l6 1.5 -6 1z" fill="#F08A24"/></svg>`;

function daysToNochebuena(now = new Date()): number {
  const co = new Date(now.getTime() - 5 * 3600_000);
  const y = co.getUTCMonth() === 0 ? co.getUTCFullYear() - 1 : co.getUTCFullYear();
  const eve = Date.UTC(y, 11, 24);
  const today = Date.UTC(co.getUTCFullYear(), co.getUTCMonth(), co.getUTCDate());
  return Math.max(0, Math.round((eve - today) / 86_400_000));
}

const card = (a: TplAnimal, i: number) =>
  `<a class="nb-card rv" href="${a.href}" data-id="${a.id}" style="--i:${i % 4};view-transition-name:${vtName('nb', a.id)}"><span class="ph">${animalArt(a, { decor: true })}${a.isNew ? '<span class="nw">Recién llegado</span>' : ''}<span class="nb-door" aria-hidden="true"><b>${(i % 24) + 1}</b><i></i></span></span><b class="nm">${a.name}</b><small>${meta(a)}</small><span class="go">Ábrele tu puerta ${pic.arrow}</span></a>`;

/** Guirnalda de 20 luces: se encienden tantas como el avance de la meta. */
function garland(pct: number): string {
  const n = 20;
  const lit = Math.round((Math.max(0, Math.min(100, pct)) / 100) * n);
  const colors = ['#FF4D4D', '#FFD24D', '#7CF0A0', '#6FB7FF', '#FF8AD8'];
  const bulbs = Array.from({ length: n }, (_, i) => {
    const x = 20 + i * (860 / (n - 1));
    const y = 18 + Math.sin((i / (n - 1)) * Math.PI * 3) * 10 + 14;
    const on = i < lit ? ' on' : '';
    const st = `style="--c:${colors[i % colors.length]};--d:${((i * 0.37) % 2.2).toFixed(2)}s"`;
    return `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)})"><circle class="glow${on}" r="16" ${st}/><rect x="-4" y="-8" width="8" height="7" rx="1.5" fill="#8A93A8"/><path class="bulb${on}" ${st} d="M0 -2 C8 2 8 16 0 22 C-8 16 -8 2 0 -2z"/></g>`;
  }).join('');
  const wire = Array.from({ length: 61 }, (_, i) => {
    const x = 20 + (i / 60) * 860;
    const y = 18 + Math.sin((i / 60) * Math.PI * 3) * 10 + 6;
    return `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(' ');
  return `<svg class="nb-wire" viewBox="0 0 900 70" aria-hidden="true" focusable="false"><path d="${wire}" stroke="#56617D" stroke-width="2" fill="none"/>${bulbs}</svg>`;
}

/* ------------------------------------------------------------ bola de nieve 3D */

function roundDot(T: ThreeModule) {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d');
  if (g) {
    const r = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    r.addColorStop(0, 'rgba(255,255,255,1)');
    r.addColorStop(0.5, 'rgba(255,255,255,.9)');
    r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r;
    g.fillRect(0, 0, 32, 32);
  }
  return new T.CanvasTexture(c);
}

interface Globe {
  shake: (power: number) => void;
}

function mountGlobe(
  T: ThreeModule,
  stage: HTMLElement,
  signal: AbortSignal,
  onFrame: (fn: (t: number) => void, el?: Element | null) => void,
  low: boolean,
): Globe | null {
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  let renderer: InstanceType<ThreeModule['WebGLRenderer']>;
  try {
    renderer = new T.WebGLRenderer({ canvas, antialias: !low, alpha: true });
  } catch {
    return null;
  }
  stage.append(canvas);
  stage.classList.add('gl');
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, low ? 1.5 : 2));
  const scene = new T.Scene();
  const cam = new T.PerspectiveCamera(34, 1, 0.1, 50);
  cam.position.set(0, 0.35, 6.2);
  cam.lookAt(0, -0.1, 0);

  scene.add(new T.HemisphereLight(0xdde8ff, 0x223355, 1.1));
  const key = new T.DirectionalLight(0xffffff, 1.4);
  key.position.set(3, 4, 5);
  scene.add(key);
  const warm = new T.PointLight(0xffc070, 2.2, 4);
  warm.position.set(0.2, 0.2, 0.8);
  scene.add(warm);

  const world = new T.Group();
  scene.add(world);
  const R = 1.35;

  // Base lacada con aro dorado.
  const base = new T.Mesh(
    new T.CylinderGeometry(1.1, 1.16, 0.36, 48),
    new T.MeshStandardMaterial({ color: 0x8e0d22, roughness: 0.35, metalness: 0.2 }),
  );
  base.position.y = -R + 0.03;
  scene.add(base);
  const ring = new T.Mesh(
    new T.TorusGeometry(1.06, 0.05, 12, 64),
    new T.MeshStandardMaterial({ color: 0xe8b84a, roughness: 0.25, metalness: 0.9 }),
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = -R + 0.18;
  scene.add(ring);

  // Suelo nevado.
  const groundY = -0.82;
  const ground = new T.Mesh(
    new T.CylinderGeometry(Math.sqrt(R * R - groundY * groundY) - 0.02, 1.0, 0.18, 48),
    new T.MeshStandardMaterial({ color: 0xf4f8fd, roughness: 0.9 }),
  );
  ground.position.y = groundY - 0.09;
  world.add(ground);

  // Árbol con luces y estrella.
  const tree = new T.Group();
  const green = new T.MeshStandardMaterial({ color: 0x1e6b41, roughness: 0.7 });
  [
    [0.55, 0.62, -0.42],
    [0.44, 0.52, -0.08],
    [0.32, 0.44, 0.22],
  ].forEach(([r, h, y]) => {
    const cone = new T.Mesh(new T.ConeGeometry(r, h, 24), green);
    cone.position.y = y;
    tree.add(cone);
  });
  const trunk = new T.Mesh(
    new T.CylinderGeometry(0.07, 0.08, 0.2, 12),
    new T.MeshStandardMaterial({ color: 0x6b3e1f }),
  );
  trunk.position.y = -0.78;
  tree.add(trunk);
  const star = new T.Mesh(
    new T.OctahedronGeometry(0.11),
    new T.MeshStandardMaterial({ color: 0xffd24d, emissive: 0xffb300, emissiveIntensity: 1.2 }),
  );
  star.position.y = 0.52;
  tree.add(star);
  const bulbs: Array<InstanceType<ThreeModule['MeshStandardMaterial']>> = [];
  const palette = [0xff4d4d, 0xffd24d, 0x6fb7ff, 0xff8ad8, 0x7cf0a0];
  for (let i = 0; i < 22; i++) {
    const t = i / 22;
    const y = -0.62 + t * 1.0;
    const rr = 0.5 * (1 - t * 0.78) + 0.02;
    const a = i * 2.4;
    const mat = new T.MeshStandardMaterial({
      color: palette[i % palette.length],
      emissive: palette[i % palette.length],
      emissiveIntensity: 1,
    });
    bulbs.push(mat);
    const b = new T.Mesh(new T.SphereGeometry(0.03, 8, 8), mat);
    b.position.set(Math.cos(a) * rr, y, Math.sin(a) * rr);
    tree.add(b);
  }
  tree.position.set(-0.15, 0.05, -0.15);
  world.add(tree);

  // Casita con ventanas encendidas.
  const house = new T.Group();
  const walls = new T.Mesh(
    new T.BoxGeometry(0.42, 0.3, 0.34),
    new T.MeshStandardMaterial({ color: 0xb5483e, roughness: 0.8 }),
  );
  house.add(walls);
  const roof = new T.Mesh(
    new T.ConeGeometry(0.36, 0.24, 4),
    new T.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }),
  );
  roof.rotation.y = Math.PI / 4;
  roof.position.y = 0.27;
  house.add(roof);
  const lit = new T.MeshStandardMaterial({
    color: 0xffd66b,
    emissive: 0xffb347,
    emissiveIntensity: 1.3,
  });
  [-0.1, 0.1].forEach((x) => {
    const w = new T.Mesh(new T.PlaneGeometry(0.08, 0.08), lit);
    w.position.set(x, 0, 0.171);
    house.add(w);
  });
  house.position.set(0.62, -0.66, 0.25);
  house.rotation.y = -0.5;
  world.add(house);

  // Muñeco de nieve.
  const white = new T.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 });
  const sm = new T.Group();
  const s1 = new T.Mesh(new T.SphereGeometry(0.15, 20, 16), white);
  const s2 = new T.Mesh(new T.SphereGeometry(0.1, 20, 16), white);
  s2.position.y = 0.2;
  const nose = new T.Mesh(
    new T.ConeGeometry(0.025, 0.1, 8),
    new T.MeshStandardMaterial({ color: 0xf08a24 }),
  );
  nose.rotation.x = Math.PI / 2;
  nose.position.set(0, 0.21, 0.12);
  const hat = new T.Mesh(
    new T.CylinderGeometry(0.06, 0.06, 0.1, 16),
    new T.MeshStandardMaterial({ color: 0x20262e }),
  );
  hat.position.y = 0.33;
  const scarf = new T.Mesh(
    new T.TorusGeometry(0.085, 0.022, 8, 20),
    new T.MeshStandardMaterial({ color: 0xc8102e }),
  );
  scarf.rotation.x = Math.PI / 2;
  scarf.position.y = 0.12;
  sm.add(s1, s2, nose, hat, scarf);
  sm.position.set(-0.68, -0.68, 0.38);
  world.add(sm);

  // Regalos.
  [
    [0x2e7dd7, 0.28, -0.74, 0.55],
    [0xc8102e, 0.1, -0.74, 0.62],
  ].forEach(([c, x, y, z]) => {
    const box = new T.Mesh(
      new T.BoxGeometry(0.14, 0.14, 0.14),
      new T.MeshStandardMaterial({ color: c, roughness: 0.5 }),
    );
    box.position.set(x, y, z);
    box.rotation.y = x * 3;
    world.add(box);
  });

  // Nieve: partículas dentro de la esfera.
  const N = low ? 420 : 800;
  const pos = new Float32Array(N * 3);
  const vel = new Float32Array(N * 3);
  const spawn = (i: number, anywhere: boolean) => {
    for (;;) {
      const x = (Math.random() * 2 - 1) * R * 0.95;
      const y = anywhere ? groundY + Math.random() * (R - groundY) : R * 0.6 + Math.random() * 0.3;
      const z = (Math.random() * 2 - 1) * R * 0.95;
      if (x * x + y * y + z * z < (R - 0.08) * (R - 0.08)) {
        pos[i * 3] = x;
        pos[i * 3 + 1] = y;
        pos[i * 3 + 2] = z;
        vel[i * 3] = vel[i * 3 + 2] = 0;
        vel[i * 3 + 1] = -0.002 - Math.random() * 0.003;
        return;
      }
    }
  };
  for (let i = 0; i < N; i++) spawn(i, true);
  const geo = new T.BufferGeometry();
  geo.setAttribute('position', new T.BufferAttribute(pos, 3));
  const flakes = new T.Points(
    geo,
    new T.PointsMaterial({
      size: 0.045,
      map: roundDot(T),
      transparent: true,
      depthWrite: false,
      color: 0xffffff,
    }),
  );
  world.add(flakes);

  // Vidrio: brillo de borde (fresnel) y un reflejo.
  const glass = new T.Mesh(
    new T.SphereGeometry(R, 64, 48),
    new T.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {},
      vertexShader:
        'varying vec3 n;varying vec3 v;void main(){vec4 p=modelViewMatrix*vec4(position,1.);n=normalize(normalMatrix*normal);v=normalize(-p.xyz);gl_Position=projectionMatrix*p;}',
      fragmentShader:
        'varying vec3 n;varying vec3 v;void main(){float f=pow(1.-max(dot(n,v),0.),2.6);float hl=smoothstep(.93,.99,dot(n,normalize(vec3(-.45,.6,.65))));gl_FragColor=vec4(vec3(.85,.92,1.),f*.75+hl*.8+.03);}',
    }),
  );
  scene.add(glass);

  const fit = () => {
    const r = stage.getBoundingClientRect();
    renderer.setSize(Math.max(1, r.width), Math.max(1, r.height), false);
    cam.aspect = r.width / Math.max(1, r.height);
    cam.updateProjectionMatrix();
  };
  fit();
  if (typeof ResizeObserver === 'function') {
    const ro = new ResizeObserver(fit);
    ro.observe(stage);
    signal.addEventListener('abort', () => ro.disconnect());
  }

  // Arrastrar gira la bola; arrastrar rápido la agita.
  let rotY = 0.4;
  let spin = 0.0025;
  let energy = 0;
  let drag: { x: number; t: number } | null = null;
  stage.addEventListener(
    'pointerdown',
    (e) => {
      drag = { x: e.clientX, t: performance.now() };
    },
    { signal },
  );
  addEventListener(
    'pointermove',
    (e) => {
      if (!drag) return;
      const dx = e.clientX - drag.x;
      const dt = Math.max(1, performance.now() - drag.t);
      rotY += dx * 0.01;
      spin = dx * 0.0008;
      energy = Math.min(1.6, energy + Math.abs(dx / dt) * 0.25);
      drag = { x: e.clientX, t: performance.now() };
    },
    { signal, passive: true },
  );
  addEventListener('pointerup', () => (drag = null), { signal });

  onFrame((t) => {
    if (!drag) {
      spin += (0.0025 - spin) * 0.02;
      rotY += spin;
    }
    world.rotation.y = rotY;
    world.rotation.z = Math.sin(t / 900) * energy * 0.04;
    energy *= 0.985;
    for (let i = 0; i < N; i++) {
      const k = i * 3;
      const x = pos[k] as number;
      const z = pos[k + 2] as number;
      // Remolino alrededor del eje cuando se agita.
      vel[k] =
        (vel[k] as number) * 0.96 + -z * 0.004 * energy + (Math.random() - 0.5) * 0.004 * energy;
      vel[k + 2] =
        (vel[k + 2] as number) * 0.96 + x * 0.004 * energy + (Math.random() - 0.5) * 0.004 * energy;
      vel[k + 1] =
        (vel[k + 1] as number) * 0.96 + (Math.random() - 0.45) * 0.006 * energy - 0.00012;
      pos[k] = x + (vel[k] as number);
      pos[k + 1] = (pos[k + 1] as number) + (vel[k + 1] as number) - 0.0018;
      pos[k + 2] = z + (vel[k + 2] as number);
      const nx = pos[k] as number;
      const ny = pos[k + 1] as number;
      const nz = pos[k + 2] as number;
      const d = nx * nx + ny * ny + nz * nz;
      if (ny < groundY || d > (R - 0.06) * (R - 0.06)) {
        if (energy > 0.2) spawn(i, true);
        else spawn(i, false);
      }
    }
    geo.attributes.position!.needsUpdate = true;
    star.rotation.y = t / 700;
    bulbs.forEach(
      (b, i) => (b.emissiveIntensity = 0.6 + 0.6 * Math.max(0, Math.sin(t / 380 + i * 1.7))),
    );
    renderer.render(scene, cam);
  }, stage);

  signal.addEventListener('abort', () => {
    renderer.dispose();
    geo.dispose();
    canvas.remove();
  });
  return {
    shake: (p) => {
      energy = Math.min(1.8, energy + p);
      spin = 0.06;
    },
  };
}

function heroFacts(m: TplModel): string {
  const d = daysToNochebuena();
  const n = m.ANIMALS.length;
  return `<div class="nb-facts">${d ? `<div><b>${d}</b>${d === 1 ? 'día' : 'días'} para Nochebuena</div>` : `<div><b>¡Feliz Navidad!</b>Gracias por estar aquí</div>`}<div><b>${n}</b>${n === 1 ? 'espera' : 'esperan'} un hogar</div>${m.CAMPAIGN.active ? `<div><b>${m.CAMPAIGN.pct}%</b>de la campaña</div>` : ''}</div>`;
}

export const nieve = {
  ...premiumDesign({
    id: 'nieve',
    catId: 'nb-cat',
    modes: { light: 'Escarcha', dark: 'Medianoche' },
    fonts:
      'family=Playfair+Display:ital,wght@0,700..900;1,700..900&family=Nunito+Sans:wght@400..800',
    css: CSS,
    html({ m, P }) {
      const { ORG, ANIMALS, CAMPAIGN } = m;
      const n = ANIMALS.length;
      const missing = Math.max(0, CAMPAIGN.goal - CAMPAIGN.raised);
      const gifts = (t: string, d: string, i: number, href: string) =>
        `<a class="k-act" href="${href}"><b>${['Regala un hogar', 'Regala cuidados', 'Regala esperanza'][i] ?? t}</b><p>${d}</p><span class="k-go">${pic.arrow}</span></a>`;
      return `
<header class="nb-top"><div class="w"><a class="nb-id" href="#nb-top"><i>${logoMark(m)}</i><b>${ORG.name}</b></a><nav class="nb-nav" aria-label="Secciones"><a href="#nb-cat">Adopta</a><a href="#nb-camp">Campaña</a><a href="#nb-ldg">Transparencia</a></nav>${P.modeBtn()}<a class="nb-don" href="${ORG.donateHref}">Donar</a></div></header>
${P.tbar()}
<section class="nb-hero" id="nb-top"><div class="nb-stars" aria-hidden="true"></div><div class="nb-sky" aria-hidden="true"><svg viewBox="-160 -84 520 116" focusable="false">${sleighTeam()}</svg></div><div class="w">
  <div>
    <p class="nb-eb">${STAR}La Navidad de ${ORG.name}</p>
    <h1 class="nb-h1">Agita la magia. <em>Cambia una vida.</em></h1>
    <p class="nb-lede">${ORG.lede || availLine(m)}</p>
    <div class="nb-cta"><a class="k-btn" href="${ORG.donateHref}" data-magnet>${GIFT} Donar esta Navidad</a><a class="gh" href="#nb-cat">${n ? 'Abrir el calendario' : 'Cómo ayudar'} ${pic.arrow}</a></div>
    ${heroFacts(m)}
  </div>
  <div class="nb-globe">
    <div class="nb-stage" id="nb-stage"><div class="nb-css" aria-hidden="true"><div class="nb-ball">${GLOBE_SVG}</div><div class="nb-base"></div></div></div>
    ${n ? `<button type="button" class="nb-shake" id="nb-shake">${FLAKE} Agita la bola y conoce a alguien</button><p class="nb-hint">También puedes girarla arrastrando.</p><a class="nb-pick" id="nb-pick" href="#nb-cat" hidden aria-live="polite"></a>` : ''}
  </div>
</div></section>
${P.acts(P.hd('Cómo participar', 'Tres regalos que cambian una Navidad'), gifts)}
<section class="k-sec" data-sec="animales" id="nb-cat">
  <div class="w">${P.hd('Calendario de adviento', n === 1 ? 'Detrás de esta puerta te espera alguien.' : 'Detrás de cada puerta te espera alguien.', '', n ? 'Las puertas se abren al llegar a ellas. Busca por nombre o raza.' : '')}
  ${n ? P.catControls('nb-f', 'Busca por nombre o raza') : ''}<div class="nb-grid" id="nb-grid">${n ? '' : `<p class="k-empty">${EMPTY.animales}</p>`}</div><button type="button" class="k-more" id="nb-more" hidden></button></div>
</section>
${P.campaign(
  () => `<section class="w k-sec" data-sec="campana" id="nb-camp"><div class="nb-camp">
  <p class="k-eb">Campaña de Navidad${CAMPAIGN.category ? ` · ${CAMPAIGN.category}` : ''}</p><h2>${CAMPAIGN.title}</h2>${CAMPAIGN.description ? `<p class="k-sub">${CAMPAIGN.description}</p>` : ''}
  ${garland(CAMPAIGN.pct)}
  <p class="nb-pct" aria-label="${CAMPAIGN.pct}% de la meta">${CAMPAIGN.pct}%</p>
  <p class="k-sub" style="margin:0">${missing > 0 ? `Cada aporte enciende una luz. Faltan ${fmt(missing)} para que brille toda la guirnalda.` : '¡La guirnalda está encendida! Gracias.'}</p>
  <div class="nb-figs"><div><span>Recaudado</span><b>${fmt(CAMPAIGN.raised)}</b></div><div><span>Meta</span><b>${fmt(CAMPAIGN.goal)}</b></div><div><span>Cierra</span><b>${CAMPAIGN.deadline || '—'}</b></div></div>
  <a class="k-btn" href="${CAMPAIGN.href}" data-magnet>${GIFT} Encender una luz</a>${P.more()}
</div></section>`,
  P.hd('Campaña activa', 'Sin campaña por ahora'),
).replace('data-sec="campana">', 'data-sec="campana" id="nb-camp">')}
<div class="nb-late">${P.needs(P.hd('Lista de regalos', 'Lo que necesitan hoy'))}${P.prods(P.hd('Tienda solidaria', 'Regalos con causa'))}</div>
${P.help()}
<div class="nb-late">${P.about()}${P.revs()}</div>
<div class="nb-late" id="nb-ldg">${P.ledger()}</div>
${P.contact()}
${P.foot()}
<a class="nb-float" href="${ORG.donateHref}">${GIFT} Donar esta Navidad</a>`;
    },
    init(app, { env, fx, cat }) {
      fx.magnet(app);
      cat({
        id: 'nb-f',
        grid: '#nb-grid',
        more: '#nb-more',
        page: 12,
        render: (L) => L.map(card).join(''),
        transition: scopedTransition,
      });
      revealFallback(app, env, '.rv, .k-act, .k-nd, .k-pr, .k-revs figure');

      // Puertas del calendario: se abren solas al llegar a ellas.
      const openDoors = () =>
        fx.observe(
          [...app.querySelectorAll<HTMLElement>('.nb-card:not(.open)')],
          (en, io) => {
            if (!en.isIntersecting) return;
            const el = en.target as HTMLElement;
            setTimeout(() => el.classList.add('open'), 350);
            io.unobserve(el);
          },
          { threshold: 0.55 },
        );
      openDoors();
      const grid = qs(app, '#nb-grid');
      if (grid && typeof MutationObserver === 'function') {
        const mo = new MutationObserver(openDoors);
        mo.observe(grid, { childList: true });
        fx.signal.addEventListener('abort', () => mo.disconnect());
      }

      // Bola de nieve 3D (si hay WebGL y el visitante no pidió menos movimiento).
      const stage = qs(app, '#nb-stage');
      const globe =
        stage && env.THREE && !fx.reduce
          ? mountGlobe(env.THREE, stage, fx.signal, fx.onFrame, fx.low)
          : null;

      // Agitar: arremolina la nieve y presenta a un animal al azar.
      const btn = qs(app, '#nb-shake');
      const pick = qs<HTMLAnchorElement>(app, '#nb-pick');
      const A = env.m.ANIMALS;
      let last = -1;
      btn?.addEventListener(
        'click',
        () => {
          globe?.shake(1.4);
          if (!pick || !A.length) return;
          let i = Math.floor(Math.random() * A.length);
          if (A.length > 1 && i === last) i = (i + 1) % A.length;
          last = i;
          const a = A[i] as TplAnimal;
          setTimeout(
            () => {
              pick.href = unesc(a.href);
              pick.innerHTML = `<span class="ph">${animalArt(a, { decor: true })}</span><span><small>La bola de nieve te presenta a</small><b>${a.name}</b><em>Conocerl${a.spLabel.endsWith('a') ? 'a' : 'o'} ›</em></span>`;
              pick.hidden = false;
              pick.scrollIntoView({ block: 'nearest', behavior: fx.reduce ? 'auto' : 'smooth' });
            },
            globe ? 900 : 0,
          );
        },
        { signal: fx.signal },
      );
    },
  }),
  webgl: true,
};
