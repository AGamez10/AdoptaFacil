import type { TplAnimal, TplModel } from '../engine/model';
import { deco, pic, premiumDesign, type CatFn, type Fx } from '../engine/premium';
import { availLine, countPhrase, fmt, logoMark, qs, qsa, verb } from '../engine/runtime';

/*
 * Linterna (Premium).
 * Claro, "Mañana": amanece en el refugio. La luz entra por una ventana con
 * persianas, flota polvo en el rayo de sol, los animales se asoman al alféizar
 * y cada canil es una puerta que se abre al llegar.
 * Oscuro, "Noche": el refugio a oscuras. Solo se ven los ojos que brillan; la
 * linterna (cursor, dedo o barrido automático) revela a quién pertenecen. En el
 * catálogo la linterna enciende cada ficha.
 */
const CSS = `
.tpl-linterna{--k-fd:'Fraunces',Georgia,serif;--k-fw:500;--k-ls:-.025em;--k-r:22px;font-family:'Outfit',system-ui,sans-serif}
.tpl-linterna[data-mode=light]{--k-bg:#F5F6EE;--k-ink:#1E2A21;--k-soft:#5A675C;--k-line:rgba(30,42,33,.12);--k-card:#FFFFFF;--k-tint:rgba(30,42,33,.055);--k-sh:0 1px 0 rgba(30,42,33,.05),0 18px 40px -26px rgba(64,60,20,.45);--sun:#F4B740;color-scheme:light}
.tpl-linterna[data-mode=dark]{--k-bg:#05070D;--k-ink:#E7EAF3;--k-soft:#8C94A8;--k-line:rgba(255,255,255,.09);--k-card:#0C1019;--k-tint:rgba(255,255,255,.05);--k-sh:0 0 0 1px rgba(255,255,255,.06);--beam:#FFE7AE;color-scheme:dark}
.tpl-linterna .k-h2{font-variation-settings:'opsz' 144}
.tpl-linterna .k-h2 em,.tpl-linterna .ln-h1 em{font-style:italic;font-weight:400}
.tpl-linterna .ln-top{display:flex;align-items:center;gap:16px;padding-block:16px;position:relative;z-index:6}
.tpl-linterna .ln-logo{display:flex;align-items:center;gap:12px;text-decoration:none;font-family:var(--k-fd);font-size:21px;font-weight:600}
.tpl-linterna .ln-logo i{width:42px;height:42px;border-radius:50%;display:grid;place-items:center;background:var(--k-acc);color:var(--k-acc-ink);font-style:normal;font-family:'Outfit',sans-serif;font-weight:700;font-size:14px}
.tpl-linterna .ln-nav{display:flex;gap:4px;margin-left:auto}
.tpl-linterna .ln-nav a{padding:10px 14px;border-radius:999px;text-decoration:none;font-weight:500;font-size:15px;color:var(--k-soft)}
.tpl-linterna .ln-nav a:hover{color:var(--k-ink)}
@media (max-width:760px){.tpl-linterna .ln-nav{display:none}.tpl-linterna .ln-top .k-mode{margin-left:auto}}
.tpl-linterna .ln-sun{position:relative;overflow:hidden;isolation:isolate}
.tpl-linterna .ln-sun::before{content:"";position:absolute;inset:-30% -10% -10% -30%;z-index:-1;background:radial-gradient(60% 55% at 78% 22%,rgba(255,214,120,.55),transparent 70%),linear-gradient(180deg,#FFF6DD,var(--k-bg) 70%)}
.tpl-linterna .ln-blinds{position:absolute;inset:-20% -40% -20% -10%;z-index:0;pointer-events:none;background:repeating-linear-gradient(-28deg,rgba(255,226,150,.0) 0 28px,rgba(255,226,150,.55) 28px 64px);mask-image:linear-gradient(115deg,transparent 18%,#000 45%,#000 70%,transparent 95%);-webkit-mask-image:linear-gradient(115deg,transparent 18%,#000 45%,#000 70%,transparent 95%);animation:lnSway 14s ease-in-out infinite alternate;mix-blend-mode:multiply;opacity:.55}
@keyframes lnSway{from{transform:translateX(-2%) skewX(-2deg)}to{transform:translateX(3%) skewX(2deg)}}
.tpl-linterna .ln-dust{position:absolute;inset:0;width:100%;height:100%;z-index:1;pointer-events:none}
.tpl-linterna .ln-hero{position:relative;z-index:2;display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,.9fr);gap:30px;align-items:end;padding-block:clamp(30px,6vw,80px) 0}
.tpl-linterna .ln-eb{display:inline-flex;align-items:center;gap:10px;font-size:14px;font-weight:600;color:var(--k-soft)}
.tpl-linterna .ln-eb i{width:12px;height:12px;border-radius:50%;background:var(--sun);box-shadow:0 0 0 6px rgba(244,183,64,.22),0 0 30px 6px rgba(244,183,64,.6)}
.tpl-linterna .ln-h1{font-family:var(--k-fd);font-weight:400;font-size:clamp(54px,8vw,128px);line-height:.9;letter-spacing:-.035em;margin-top:18px;font-variation-settings:'opsz' 144}
.tpl-linterna .ln-h1 em{color:var(--k-acc)}
.tpl-linterna .ln-lede{margin-top:22px;font-size:clamp(17px,1.5vw,21px);line-height:1.6;color:var(--k-soft);max-width:30em}
.tpl-linterna .ln-cta{display:flex;flex-wrap:wrap;gap:12px;margin-top:28px;align-items:center}
.tpl-linterna .ln-cta .ghost{display:inline-flex;align-items:center;gap:8px;min-height:54px;padding:0 22px;border-radius:999px;text-decoration:none;font-weight:600;box-shadow:inset 0 0 0 1.5px var(--k-line)}
.tpl-linterna .ln-win{position:relative;aspect-ratio:4/5;max-height:520px;width:100%;justify-self:end;border-radius:200px 200px 10px 10px;background:linear-gradient(180deg,#BFE3F2,#FBEFD2 75%);box-shadow:inset 0 0 0 14px #FFFDF6,inset 0 0 0 16px rgba(30,42,33,.12),0 30px 60px -30px rgba(80,60,10,.5);overflow:hidden}
.tpl-linterna .ln-win::before{content:"";position:absolute;inset:0;background:linear-gradient(90deg,transparent calc(50% - 7px),#FFFDF6 calc(50% - 7px),#FFFDF6 calc(50% + 7px),transparent calc(50% + 7px)),linear-gradient(180deg,transparent 52%,#FFFDF6 52%,#FFFDF6 calc(52% + 14px),transparent calc(52% + 14px))}
.tpl-linterna .ln-win .sunb{position:absolute;width:38%;aspect-ratio:1;border-radius:50%;left:50%;top:18%;translate:-50% 0;background:radial-gradient(circle,#FFF8D6 30%,#FFD36B 60%,rgba(255,200,90,0) 72%);animation:lnRise 3.5s cubic-bezier(.2,.8,.2,1) both}
@keyframes lnRise{from{transform:translateY(60%);opacity:.3}to{transform:none;opacity:1}}
.tpl-linterna .ln-win .hill{position:absolute;left:-10%;right:-10%;bottom:-6%;height:42%;border-radius:50% 50% 0 0;background:#9FBF95}
.tpl-linterna .ln-win .hill.b{bottom:-14%;height:34%;left:20%;background:#7FA675}
.tpl-linterna .ln-sill{position:relative;z-index:3;margin-top:-6px;background:#E9DCC0;border-top:10px solid #F6EEDA;box-shadow:0 18px 30px -18px rgba(80,60,10,.6)}
.tpl-linterna .ln-sill .w{display:flex;gap:clamp(10px,2vw,26px);align-items:flex-end;height:clamp(110px,13vw,170px);overflow:hidden}
.tpl-linterna .ln-peek{flex:1 1 0;min-width:0;max-width:220px;border:0;padding:0;background:none;cursor:pointer;position:relative;height:100%;text-align:left}
.tpl-linterna .ln-peek .ph{position:absolute;left:0;right:0;bottom:-48%;height:150%;border-radius:999px 999px 0 0;overflow:hidden;transition:transform .6s cubic-bezier(.3,1.5,.5,1);animation:lnPeek 2.6s cubic-bezier(.3,1.4,.5,1) both;animation-delay:calc(var(--k) * 180ms + .6s)}
@keyframes lnPeek{from{transform:translateY(60%)}to{transform:none}}
.tpl-linterna .ln-peek:hover .ph,.tpl-linterna .ln-peek:focus-visible .ph{transform:translateY(-16%)}
.tpl-linterna .ln-peek span{position:absolute;left:12px;bottom:10px;z-index:2;background:#FFFDF6;color:#1E2A21;font-weight:600;font-size:13px;padding:5px 10px;border-radius:999px}
.tpl-linterna .ln-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:clamp(16px,2.4vw,30px)}
.tpl-linterna a.ln-k{display:flex;flex-direction:column;gap:12px;border:0;padding:0;background:none;cursor:pointer;text-align:left;color:inherit}
.tpl-linterna .ln-box{position:relative;display:block;aspect-ratio:3/4;border-radius:120px 120px 14px 14px;overflow:hidden;background:#3C3326;box-shadow:inset 0 0 0 8px #F8F3E6,var(--k-sh);perspective:900px}
.tpl-linterna .ln-in{position:absolute;inset:8px;border-radius:112px 112px 8px 8px;overflow:hidden}
.tpl-linterna .ln-door{position:absolute;inset:8px;border-radius:112px 112px 8px 8px;background:var(--dc);transform-origin:0 50%;transition:transform 1.3s cubic-bezier(.5,0,.2,1);box-shadow:inset 0 0 0 1px rgba(0,0,0,.08);transform:rotateY(-104deg)}
.tpl-linterna .ln-door::before,.tpl-linterna .ln-door::after{content:"";position:absolute;left:14%;right:14%;border-radius:80px 80px 6px 6px;box-shadow:inset 0 0 0 2px rgba(0,0,0,.1),inset 0 2px 0 3px rgba(255,255,255,.3)}
.tpl-linterna .ln-door::before{top:10%;height:38%}
.tpl-linterna .ln-door::after{top:54%;height:36%;border-radius:6px}
.tpl-linterna .ln-door .pl{position:absolute;left:50%;top:50%;translate:-50% -50%;z-index:2;background:#FFFDF6;color:#1E2A21;font-size:12px;font-weight:700;letter-spacing:.06em;padding:5px 10px;border-radius:6px;white-space:nowrap;box-shadow:0 2px 4px rgba(0,0,0,.15)}
.tpl-linterna .ln-door .hd{position:absolute;right:12%;top:52%;width:12px;height:12px;border-radius:50%;background:#C9A24A;box-shadow:0 2px 3px rgba(0,0,0,.3)}
.tpl-linterna .ln-k.shut .ln-door{transform:none}
.tpl-linterna a.ln-k:hover .ln-door{transform:rotateY(-112deg)}
.tpl-linterna .ln-cap{display:flex;flex-direction:column;gap:2px;min-width:0}
.tpl-linterna .ln-cap b{font-family:var(--k-fd);font-weight:500;font-size:clamp(20px,1.8vw,26px);letter-spacing:-.02em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tpl-linterna .ln-cap small{font-size:14px;color:var(--k-soft)}
.tpl-linterna .ln-cap em{font-style:normal;color:var(--k-acc);font-weight:600}
@media (max-width:1000px){.tpl-linterna .ln-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}
@media (max-width:620px){.tpl-linterna .ln-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}}
@media (max-width:860px){.tpl-linterna .ln-hero{grid-template-columns:minmax(0,1fr)}.tpl-linterna .ln-win{max-height:300px;aspect-ratio:auto;height:300px;justify-self:stretch}}
.tpl-linterna .ln-dawn{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:clamp(24px,5vw,70px);align-items:center;padding:clamp(24px,4vw,56px);border-radius:32px;background:linear-gradient(180deg,#FFF3D1,#FFFFFF);box-shadow:var(--k-sh)}
.tpl-linterna .ln-arc{position:relative}
.tpl-linterna .ln-arc svg{display:block;width:100%;height:auto;overflow:visible}
.tpl-linterna .ln-arc .lab{position:absolute;left:0;right:0;bottom:0;display:flex;justify-content:space-between;font-size:13px;color:var(--k-soft)}
.tpl-linterna .ln-dawn h2{font-family:var(--k-fd);font-weight:400;font-size:clamp(40px,5vw,72px);line-height:.95;letter-spacing:-.03em}
.tpl-linterna .ln-figs{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin:20px 0}
.tpl-linterna .ln-figs span{display:block;font-size:13px;color:var(--k-soft)}
.tpl-linterna .ln-figs b{font-family:var(--k-fd);font-size:clamp(20px,2vw,28px);font-weight:500;font-variant-numeric:tabular-nums}
@media (max-width:860px){.tpl-linterna .ln-dawn{grid-template-columns:minmax(0,1fr)}.tpl-linterna .ln-figs{grid-template-columns:1fr 1fr}}
.tpl-linterna[data-mode=light] .k-act{background:linear-gradient(180deg,#FFFFFF,#FFFBEF)}
.tpl-linterna[data-mode=light] .k-act:hover{transform:translateY(-6px);box-shadow:0 30px 50px -30px rgba(244,183,64,.9),0 0 0 1px var(--k-line)}
.tpl-linterna[data-mode=light] .k-help{background:linear-gradient(160deg,var(--k-acc),color-mix(in oklab,var(--k-acc) 70%,#F4B740))}
.tpl-linterna[data-mode=light] .k-help::before{content:"";position:absolute;inset:0;background:repeating-linear-gradient(-28deg,transparent 0 30px,rgba(255,255,255,.12) 30px 66px);mask-image:linear-gradient(110deg,transparent 20%,#000 60%);-webkit-mask-image:linear-gradient(110deg,transparent 20%,#000 60%)}
.tpl-linterna .ln-night{position:relative;height:clamp(560px,calc(100vh - var(--bar) - 120px),820px);overflow:hidden;background:radial-gradient(80% 60% at 50% 0%,#0E1526,#05070D 70%);touch-action:pan-y;cursor:none}
.tpl-linterna .ln-yard{position:absolute;inset:0}
.tpl-linterna .ln-t{position:absolute;width:var(--s);border:0;padding:0;background:none;cursor:pointer;color:#fff}
.tpl-linterna .ln-t .ph{display:block;aspect-ratio:1;border-radius:28%;overflow:hidden;filter:saturate(.8)}
.tpl-linterna .ln-t b{position:absolute;left:50%;bottom:-10px;translate:-50% 0;font-family:var(--k-fd);font-style:italic;font-size:15px;white-space:nowrap;background:rgba(5,7,13,.7);padding:3px 10px;border-radius:999px}
.tpl-linterna .ln-dark{position:absolute;inset:0;pointer-events:none;background:#04060B;--x:50%;--y:45%;--r:150px;mask-image:radial-gradient(circle var(--r) at var(--x) var(--y),transparent 0,rgba(0,0,0,.35) 55%,#000 100%);-webkit-mask-image:radial-gradient(circle var(--r) at var(--x) var(--y),transparent 0,rgba(0,0,0,.35) 55%,#000 100%);transition:opacity 1s}
.tpl-linterna .ln-beam{position:absolute;inset:0;pointer-events:none;background:radial-gradient(circle calc(var(--r) * 1.15) at var(--x) var(--y),rgba(255,231,174,.16),transparent 70%);mix-blend-mode:screen}
.tpl-linterna .ln-night.lit .ln-dark{opacity:0}
.tpl-linterna .ln-night.lit{cursor:auto}
.tpl-linterna .ln-eyes{position:absolute;inset:0;pointer-events:none}
.tpl-linterna .ln-e{position:absolute;width:var(--es);height:calc(var(--es) * .62);border-radius:50%;background:radial-gradient(circle,#fff 0 18%,var(--c) 40%,transparent 72%);box-shadow:0 0 14px 3px color-mix(in oklab,var(--c) 70%,transparent);animation:lnBlink var(--bl) infinite;animation-delay:var(--bd);transition:opacity .4s}
.tpl-linterna .ln-e.gone{opacity:0}
.tpl-linterna .ln-night.lit .ln-e{opacity:0}
@keyframes lnBlink{0%,92%,100%{transform:scaleY(1)}95%{transform:scaleY(.08)}}
.tpl-linterna .ln-ntext{position:absolute;left:0;right:0;bottom:0;z-index:4;pointer-events:none;background:linear-gradient(0deg,rgba(5,7,13,.95) 20%,transparent)}
.tpl-linterna .ln-ntext .w{padding-block:60px clamp(26px,4vw,48px);display:flex;flex-wrap:wrap;justify-content:space-between;align-items:flex-end;gap:20px}
.tpl-linterna .ln-ntext .w > *{pointer-events:auto;cursor:auto}
.tpl-linterna .ln-nh{font-family:var(--k-fd);font-weight:300;font-size:clamp(48px,7.4vw,120px);line-height:.9;letter-spacing:-.035em;max-width:9.5em}
.tpl-linterna .ln-nh em{color:var(--beam);font-style:italic}
.tpl-linterna .ln-nl{margin-top:16px;font-size:clamp(16px,1.4vw,19px);line-height:1.6;color:var(--k-soft);max-width:32em}
.tpl-linterna .ln-tools{display:flex;flex-direction:column;gap:10px;align-items:flex-end}
.tpl-linterna .ln-lamp{display:inline-flex;align-items:center;gap:10px;min-height:54px;padding:0 22px;border-radius:999px;border:0;cursor:pointer;background:var(--beam);color:#1A1405;font-weight:700;font-size:15px}
.tpl-linterna .ln-lamp svg{width:18px}
.tpl-linterna .ln-hint{font-size:13px;color:var(--k-soft)}
.tpl-linterna .ln-ng{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:clamp(14px,2vw,26px)}
.tpl-linterna .ln-n{--l:0;display:flex;flex-direction:column;gap:10px;border:0;padding:0;background:none;cursor:pointer;text-align:left;color:inherit}
.tpl-linterna .ln-np{position:relative;display:block;aspect-ratio:1;border-radius:22px;overflow:hidden;background:#000;box-shadow:0 0 0 1px rgba(255,255,255,.06),0 0 calc(var(--l) * 60px) calc(var(--l) * -6px) rgba(255,231,174,.45)}
.tpl-linterna .ln-np .portrait{filter:brightness(calc(.16 + var(--l) * .84)) saturate(calc(.3 + var(--l) * .7));transition:filter .25s}
.tpl-linterna .ln-np i{position:absolute;top:65%;width:7%;height:4.5%;border-radius:50%;background:radial-gradient(circle,#fff 0 15%,var(--eye) 45%,transparent 75%);box-shadow:0 0 10px 2px var(--eye);opacity:calc(1 - var(--l) * 1.6);animation:lnBlink 5s infinite;animation-delay:calc(var(--k, 0) * -.7s)}
.tpl-linterna .ln-np .e1{left:44.5%}.tpl-linterna .ln-np .e2{left:65.5%}
.tpl-linterna .ln-n:hover,.tpl-linterna .ln-n:focus-visible,.tpl-linterna .ln-n.lit{--l:1}
.tpl-linterna .ln-n.lit{transition:--l .5s}
@media (max-width:1000px){.tpl-linterna .ln-ng{grid-template-columns:repeat(3,minmax(0,1fr))}}
@media (max-width:620px){.tpl-linterna .ln-ng{grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}}
.tpl-linterna .ln-moon{display:grid;grid-template-columns:minmax(0,.8fr) minmax(0,1.2fr);gap:clamp(24px,5vw,70px);align-items:center;padding:clamp(24px,4vw,56px);border-radius:32px;background:radial-gradient(60% 80% at 25% 40%,rgba(207,224,255,.10),transparent 70%),#080B14;box-shadow:inset 0 0 0 1px var(--k-line)}
.tpl-linterna .ln-moon > svg{display:block;width:min(300px,100%);margin:auto;filter:drop-shadow(0 0 40px rgba(255,240,200,.25))}
.tpl-linterna .ln-moon h2{font-family:var(--k-fd);font-weight:300;font-size:clamp(40px,5vw,72px);line-height:.95;letter-spacing:-.03em}
.tpl-linterna .ln-moon .k-btn{background:var(--beam);color:#1A1405!important}
@media (max-width:860px){.tpl-linterna .ln-moon{grid-template-columns:minmax(0,1fr)}}
.tpl-linterna[data-mode=dark] .k-act,.tpl-linterna[data-mode=dark] .k-nd,.tpl-linterna[data-mode=dark] .k-pr,.tpl-linterna[data-mode=dark] .k-revs figure{background:radial-gradient(260px circle at var(--x,-300px) var(--y,-300px),rgba(255,231,174,.12),transparent 70%),var(--k-card)}
.tpl-linterna[data-mode=dark] .k-act:hover{transform:translateY(-6px)}
.tpl-linterna[data-mode=dark] .k-help{background:radial-gradient(50% 90% at 50% 0%,rgba(255,231,174,.35),transparent 70%),#0C1019;color:var(--k-ink);box-shadow:inset 0 0 0 1px var(--k-line)}
.tpl-linterna[data-mode=dark] .k-help .k-btn{background:var(--beam);color:#1A1405!important}
.tpl-linterna[data-mode=dark] .k-chip[aria-pressed="true"]{background:var(--beam);color:#1A1405}
.tpl-linterna[data-mode=dark] .k-more{background:var(--beam);color:#1A1405}
`;

const eyeGlow = (a: TplAnimal) => (a.sp === 'gato' ? a.eye : '#CFEF7A');
const DOOR = ['#B9CDB4', '#BFD3E3', '#EBD7A5', '#DDBBA6', '#C9C3DE'];
const sub = (a: TplAnimal) => `${a.spLabel}${a.age ? ` · ${a.age}` : ''}`;

const door = (a: TplAnimal, i: number) =>
  `<a class="ln-k" href="${a.href}" data-id="${a.id}"><span class="ln-box"><span class="ln-in">${deco(a, { dx: 4, dy: 16, s: 1.12, bg: '#F2E3C2' })}</span><span class="ln-door" style="--dc:${DOOR[i % 5]}"><span class="pl">Canil ${String(a.i + 1).padStart(2, '0')}</span><span class="hd"></span></span></span><span class="ln-cap"><b>${a.name}</b><small>${sub(a)}${a.isNew ? ' · <em>Llegó hace poco</em>' : ''}</small></span></a>`;

const nightCard = (a: TplAnimal) =>
  `<a class="ln-n" href="${a.href}" data-id="${a.id}" style="--eye:${eyeGlow(a)}"><span class="ln-np">${deco(a, { dx: 6, dy: 14, s: 1.08 })}<i class="e1"></i><i class="e2"></i></span><span class="ln-cap"><b>${a.name}</b><small>${sub(a)}</small></span></a>`;

function moon(f: number, r = 90) {
  const c = r + 10;
  const rx = Math.abs(1 - 2 * f) * r;
  const sw = f < 0.5 ? 0 : 1;
  return `<svg viewBox="0 0 ${c * 2} ${c * 2}" role="img" aria-label="Luna al ${Math.round(f * 100)}%: avance de la campaña"><defs><radialGradient id="lnm" cx="40%" cy="35%"><stop offset="0" stop-color="#FFF9E6"/><stop offset="1" stop-color="#E9DFC0"/></radialGradient></defs><circle cx="${c}" cy="${c}" r="${r}" fill="#141A28"/><path d="M${c} ${c - r} A${r} ${r} 0 0 1 ${c} ${c + r} A${rx} ${r} 0 0 ${sw} ${c} ${c - r}Z" fill="url(#lnm)"/><circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="rgba(255,255,255,.12)"/></svg>`;
}

const days = (n: number) => `${n} ${n === 1 ? 'día' : 'días'}`;

export const linterna = premiumDesign({
  id: 'linterna',
  catId: 'ln-cat',
  modes: { light: 'Mañana', dark: 'Noche' },
  fonts:
    'family=Fraunces:ital,opsz,wght@0,9..144,400..800;1,9..144,400..700&family=Outfit:wght@400;500;600;700',
  css: CSS,
  html({ m, P, mode }) {
    const { ORG, ANIMALS, CAMPAIGN } = m;
    const n = ANIMALS.length;
    const nNew = m.COUNTS.nuevos;
    const top = `<header class="w ln-top"><a class="ln-logo" href="#ln-cat"><i>${logoMark(m)}</i>${ORG.name}</a><nav class="ln-nav" aria-label="Secciones"><a href="#ln-cat">Animales</a><a href="#ln-camp">Campaña</a><a href="#ln-ldg">Cuentas claras</a></nav>${P.modeBtn()}</header>`;
    const tail = `${P.needs()}${P.prods(P.hd('Tienda solidaria', 'Productos'), mode === 'dark' ? '#121827' : '#FFF7E3')}${P.help()}${P.about()}${P.revs()}<div id="ln-ldg">${P.ledger()}</div>${P.contact()}${P.foot()}`;
    const eb = `Campaña activa${CAMPAIGN.category ? ` · ${CAMPAIGN.category}` : ''}`;
    const figs = `<div class="ln-figs"><div><span>Recaudado</span><b id="ln-raised">${fmt(CAMPAIGN.raised)}</b></div><div><span>Meta</span><b>${fmt(CAMPAIGN.goal)}</b></div><div><span>Cierra</span><b>${CAMPAIGN.deadlineShort || '—'}</b></div></div>`;
    const btn = `<a class="k-btn" href="${CAMPAIGN.href}" data-magnet>Ver campaña y aportar ${pic.arrow}</a>${P.more()}`;
    const camp = P.campaign(() =>
      mode === 'light'
        ? `<section class="w k-sec" data-sec="campana" id="ln-camp"><div class="ln-dawn"><div class="ln-arc"><svg viewBox="0 0 400 220" role="img" aria-label="Avance de la campaña: ${CAMPAIGN.pct}%"><path d="M30 200 A170 170 0 0 1 370 200" fill="none" stroke="rgba(30,42,33,.12)" stroke-width="3" stroke-dasharray="4 8"/><path id="ln-arcp" d="M30 200 A170 170 0 0 1 370 200" fill="none" stroke="#F4B740" stroke-width="5" stroke-linecap="round" pathLength="100" stroke-dasharray="0 100"/><circle id="ln-sunp" cx="30" cy="200" r="22" fill="#FFD36B"/><circle id="ln-sunh" cx="30" cy="200" r="40" fill="rgba(255,211,107,.3)"/><line x1="0" y1="200" x2="400" y2="200" stroke="rgba(30,42,33,.25)" stroke-width="2"/></svg><div class="lab"><span>Hoy</span><span>Meta</span></div></div>
        <div><p class="k-eb">${eb}</p><h2>${CAMPAIGN.title}</h2>${figs}<p class="k-sub" style="margin:0 0 22px">${CAMPAIGN.description ? `${CAMPAIGN.description} ` : ''}El sol sube con cada aporte. Va en ${CAMPAIGN.pct}% y faltan ${days(CAMPAIGN.daysLeft)}.</p>${btn}</div></div></section>`
        : `<section class="w k-sec" data-sec="campana" id="ln-camp"><div class="ln-moon">${moon(Math.max(0.04, CAMPAIGN.pct / 100))}<div><p class="k-eb" style="color:var(--beam)">${eb}</p><h2>${CAMPAIGN.title}</h2>${figs}<p class="k-sub" style="margin:0 0 22px">${CAMPAIGN.description ? `${CAMPAIGN.description} ` : ''}La luna crece con cada aporte. Va en ${CAMPAIGN.pct}% y faltan ${days(CAMPAIGN.daysLeft)}.</p>${btn}</div></div></section>`,
    );
    const lede = ORG.lede || availLine(m);
    if (mode === 'light') {
      const h1 =
        n > 1
          ? `Hoy amanecieron <em>${m.COUNTS.total}</em> esperando hogar`
          : n === 1
            ? `Hoy amaneció <em>${ANIMALS[0].name}</em> esperando hogar`
            : `Hoy el refugio <em>abre sus puertas</em>`;
      return `<div class="ln-sun"><div class="ln-blinds"></div><canvas class="ln-dust" id="ln-dust" aria-hidden="true"></canvas>${top}${P.tbar()}
        <section class="w ln-hero"><div style="padding-bottom:clamp(30px,5vw,70px)"><span class="ln-eb"><i></i>Buenos días${ORG.city ? ` desde ${ORG.city}` : ''}</span>
          <h1 class="ln-h1">${h1}</h1>
          <p class="ln-lede">${lede}${nNew ? ` ${nNew === 1 ? 'Uno llegó' : `${nNew} llegaron`} hace poco.` : ''}${n ? ' Pasa por los caniles, abre cada puerta y conoce a quien podría despertar contigo mañana.' : ''}</p>
          <div class="ln-cta"><a class="k-btn" href="#ln-cat" data-magnet>Recorrer los caniles ${pic.arrow}</a><a class="ghost" href="#ln-camp">Ver la campaña</a></div></div>
          <div class="ln-win" aria-hidden="true"><span class="sunb"></span><span class="hill"></span><span class="hill b"></span></div></section>
        <div class="ln-sill"><div class="w">${ANIMALS.slice(0, 5)
          .map(
            (a, k) =>
              `<a class="ln-peek" href="${a.href}" data-id="${a.id}" style="--k:${k}"><span class="ph">${deco(a, { dx: 6, dy: 10, s: 1.1 })}</span><span>${a.name}</span></a>`,
          )
          .join('')}</div></div></div>
        ${P.acts(P.hd('Cómo participar', 'Empieza el día <em>ayudando</em>'))}
        <section class="w k-sec" data-sec="animales" id="ln-cat">${P.hd('Recorrido de la mañana', 'Mascotas en adopción', '', n ? 'Cada puerta se abre cuando llegas. Toca a cualquiera para conocerlo.' : '')}${P.catControls('ln-f')}<div class="ln-grid" id="ln-grid"></div><button type="button" class="k-more" id="ln-more" hidden></button></section>
        ${camp}${tail}`;
    }
    return `${top}${P.tbar()}
      <section class="ln-night" id="ln-night" aria-label="El refugio de noche"><div class="ln-yard" id="ln-yard"></div><div class="ln-beam"></div><div class="ln-dark"></div><div class="ln-eyes" id="ln-eyes" aria-hidden="true"></div>
        <div class="ln-ntext"><div class="w"><div><h1 class="ln-nh">De noche también <em>esperan</em></h1><p class="ln-nl">${n ? `${countPhrase(m)} ${verb(m, 'duerme', 'duermen')} hoy en ${ORG.short}. Pasa la linterna por la oscuridad para ver de quién son esos ojos.` : lede}</p></div>
          <div class="ln-tools"><button type="button" class="ln-lamp" id="ln-lamp" aria-pressed="false">${pic.sun}<span>Encender la luz</span></button><span class="ln-hint" data-hint>Mueve el cursor para alumbrar</span></div></div></div></section>
      ${P.acts(P.hd('Cómo participar', 'Una luz para <em>cada uno</em>'))}
      <section class="w k-sec" data-sec="animales" id="ln-cat">${P.hd('Ronda nocturna', 'Mascotas en adopción', '', n ? '<span data-hint2>Pasa la linterna sobre cada ficha para verlos. Toca para abrir su ficha.</span>' : '')}${P.catControls('ln-f')}<div class="ln-ng" id="ln-grid"></div><button type="button" class="k-more" id="ln-more" hidden></button></section>
      ${camp}${tail}`;
  },
  init(app, { m, mode, fx, cat }) {
    fx.fillOnView(app, '.k-bar');
    fx.countUp(qs(app, '#ln-raised'), m.CAMPAIGN.raised, fmt);
    fx.magnet(app);
    fx.reveal(app, '.k-act,.k-nd,.k-pr,.k-revs figure', { stagger: 80 });
    if (mode === 'light') initMorning(app, m, fx, cat);
    else initNight(app, m, fx, cat);
  },
});

/** Puertas ya abiertas (no se vuelven a cerrar al filtrar o paginar). */
const opened = new Set<string>();

function initMorning(app: HTMLElement, m: TplModel, fx: Fx, cat: CatFn) {
  const { signal } = fx;
  let io: IntersectionObserver | null = null;
  if (typeof IntersectionObserver === 'function') {
    io = new IntersectionObserver(
      (es) =>
        es.forEach((e) => {
          if (!e.isIntersecting) return;
          const el = e.target as HTMLElement;
          opened.add(el.dataset.id ?? '');
          window.setTimeout(() => el.classList.remove('shut'), (Number(el.dataset.k) || 0) * 110);
          io?.unobserve(el);
        }),
      { threshold: 0.45 },
    );
    signal.addEventListener('abort', () => io?.disconnect());
  }
  cat({
    id: 'ln-f',
    grid: '#ln-grid',
    more: '#ln-more',
    page: 12,
    render: (L) => L.map((a, i) => door(a, i)).join(''),
    after: (host) => {
      if (fx.reduce || !io) return;
      let j = 0;
      qsa(host, 'a.ln-k').forEach((el) => {
        if (opened.has(el.dataset.id ?? '')) return;
        el.dataset.k = String(j++ % 4);
        el.classList.add('shut');
        io?.observe(el);
      });
    },
  });
  // Sol de la campaña sobre el arco
  const arc = qs<SVGPathElement>(app, '#ln-arcp');
  const svg = arc?.closest('svg');
  if (arc && svg) {
    const go = () => {
      if (typeof arc.getTotalLength !== 'function') return;
      const p = Math.max(3, m.CAMPAIGN.pct);
      const L = arc.getTotalLength();
      const pt = arc.getPointAtLength((L * p) / 100);
      arc.style.transition = fx.reduce ? 'none' : 'stroke-dasharray 2s cubic-bezier(.2,.8,.2,1)';
      arc.setAttribute('stroke-dasharray', `${p} 100`);
      ['#ln-sunp', '#ln-sunh'].forEach((s) => {
        const c = qs<SVGCircleElement>(app, s);
        if (!c) return;
        c.style.transition = fx.reduce
          ? 'none'
          : 'cx 2s cubic-bezier(.2,.8,.2,1),cy 2s cubic-bezier(.2,.8,.2,1)';
        c.setAttribute('cx', pt.x.toFixed(1));
        c.setAttribute('cy', pt.y.toFixed(1));
      });
    };
    if (typeof IntersectionObserver !== 'function') go();
    else
      fx.observe(
        [svg],
        (e, o) => {
          if (!e.isIntersecting) return;
          o.disconnect();
          go();
        },
        { threshold: 0.5 },
      );
  }
  // Polvo en el rayo de sol
  const cv = qs<HTMLCanvasElement>(app, '#ln-dust');
  if (!cv || fx.reduce) return;
  const S = fx.canvas2d(cv);
  if (!S) return;
  const P = Array.from({ length: fx.low ? 26 : 60 }, () => ({
    x: Math.random(),
    y: Math.random(),
    r: 0.6 + Math.random() * 1.8,
    v: 0.2 + Math.random() * 0.6,
    ph: Math.random() * 6.28,
  }));
  fx.onFrame((t) => {
    const g = S.g;
    const s = t / 1000;
    g.clearRect(0, 0, S.w, S.h);
    for (const p of P) {
      p.y -= p.v * 0.0004;
      p.x += Math.sin(s * 0.4 + p.ph) * 0.00025;
      if (p.y < -0.05) {
        p.y = 1.05;
        p.x = Math.random();
      }
      const X = p.x * S.w;
      const Y = p.y * S.h;
      const band = Math.max(0, 1 - Math.abs(X / S.w - 0.55 - (Y / S.h - 0.3) * 0.5) * 2.2);
      if (band <= 0) continue;
      g.globalAlpha = band * (0.35 + 0.35 * Math.sin(s * 1.3 + p.ph));
      g.fillStyle = '#FFF4D2';
      g.beginPath();
      g.arc(X, Y, p.r, 0, 6.283);
      g.fill();
    }
    g.globalAlpha = 1;
  }, cv);
}

/* Noche: patio con retratos escondidos, ojos que parpadean y linterna */
function initNight(app: HTMLElement, m: TplModel, fx: Fx, cat: CatFn) {
  const { signal } = fx;
  const { ANIMALS } = m;
  const night = qs(app, '#ln-night')!;
  const yard = qs(app, '#ln-yard')!;
  const eyes = qs(app, '#ln-eyes')!;
  const dark = qs(night, '.ln-dark')!;
  const beam = qs(night, '.ln-beam')!;
  if (!fx.hover) {
    const h = qs(app, '[data-hint]');
    if (h) h.textContent = 'Toca la oscuridad para alumbrar';
    const h2 = qs(app, '[data-hint2]');
    if (h2) h2.textContent = 'Cada ficha se enciende al pasar por el centro de la pantalla.';
  }
  const lit = new WeakMap<Element, boolean>();
  const layout = () => {
    const W = night.clientWidth;
    const H = night.clientHeight;
    const cols = W < 700 ? 3 : W < 1100 ? 5 : 7;
    const rows = W < 700 ? 4 : 3;
    const s = Math.min(W / cols, (H * 0.78) / rows) * 0.62;
    let k = 0;
    let rnd = 11;
    const r = () => (rnd = (rnd * 16807) % 2147483647) / 2147483647;
    const pool = ANIMALS.slice(0, cols * rows);
    const tiles: string[] = [];
    const dots: string[] = [];
    for (let y = 0; y < rows; y++)
      for (let x = 0; x < cols; x++) {
        const a = pool[k++];
        if (!a) break;
        const cx = ((x + 0.5) * W) / cols + (r() - 0.5) * (W / cols - s) * 0.7;
        const cy = ((y + 0.5) * (H * 0.8)) / rows + (r() - 0.5) * ((H * 0.8) / rows - s) * 0.6;
        tiles.push(
          `<a class="ln-t" href="${a.href}" data-id="${a.id}" style="--s:${s.toFixed(0)}px;left:${(cx - s / 2).toFixed(0)}px;top:${(cy - s / 2).toFixed(0)}px"><span class="ph">${deco(a, { dx: 6, dy: 14, s: 1.08 })}</span><b>${a.name}</b></a>`,
        );
        const ex = a.sp === 'gato' ? [0.481, 0.719] : [0.492, 0.708];
        const ey = a.sp === 'gato' ? 0.68 : 0.648;
        const es = s * 0.075;
        ex.forEach((e) =>
          dots.push(
            `<i class="ln-e" data-t="${tiles.length - 1}" style="--c:${eyeGlow(a)};--es:${es.toFixed(1)}px;left:${(cx - s / 2 + e * s - es / 2).toFixed(1)}px;top:${(cy - s / 2 + ey * s - es * 0.31).toFixed(1)}px;--bl:${(3 + r() * 5).toFixed(1)}s;--bd:${(-r() * 6).toFixed(1)}s"></i>`,
          ),
        );
      }
    // Ojos sueltos en el fondo: los que no caben en el patio
    const extra = Math.max(0, Math.min(ANIMALS.length - pool.length, fx.low ? 10 : 26));
    for (let i = 0; i < extra; i++) {
      const a = ANIMALS[pool.length + i];
      const x = r() * W;
      const y = H * (0.05 + r() * 0.6);
      const es = 6 + r() * 5;
      const eye = (left: number) =>
        `<i class="ln-e far" style="--c:${eyeGlow(a)};--es:${es.toFixed(1)}px;left:${left.toFixed(0)}px;top:${y.toFixed(0)}px;--bl:${(3 + r() * 5).toFixed(1)}s;--bd:${(-r() * 6).toFixed(1)}s;opacity:.6"></i>`;
      dots.push(eye(x) + eye(x + es * 2.4));
    }
    yard.innerHTML = tiles.join('');
    eyes.innerHTML = dots.join('');
    return { W, H };
  };
  let dim = layout();
  if (typeof ResizeObserver === 'function') {
    const ro = new ResizeObserver(() => (dim = layout()));
    ro.observe(night);
    signal.addEventListener('abort', () => ro.disconnect());
  }
  let tx = dim.W * 0.5;
  let ty = dim.H * 0.4;
  let x = tx;
  let y = ty;
  let last = -1e9;
  const R = () => Math.max(120, Math.min(220, dim.W * 0.14));
  const set = () => {
    [dark, beam].forEach((el) => {
      el.style.setProperty('--x', x.toFixed(0) + 'px');
      el.style.setProperty('--y', y.toFixed(0) + 'px');
      el.style.setProperty('--r', R().toFixed(0) + 'px');
    });
    const rr = R() * 0.75;
    qsa(yard, '.ln-t').forEach((t, i) => {
      const cx = t.offsetLeft + t.offsetWidth / 2;
      const cy = t.offsetTop + t.offsetWidth / 2;
      const on = Math.hypot(cx - x, cy - y) < rr;
      if (lit.get(t) === on) return;
      lit.set(t, on);
      qsa(eyes, `[data-t="${i}"]`).forEach((e) => e.classList.toggle('gone', on));
    });
  };
  const aim = (e: PointerEvent, hold: number) => {
    const r = night.getBoundingClientRect();
    tx = e.clientX - r.left;
    ty = e.clientY - r.top;
    last = performance.now() + hold;
  };
  night.addEventListener('pointermove', (e) => aim(e, 0), { signal });
  night.addEventListener('pointerdown', (e) => aim(e, 2500), { signal });
  const lamp = qs(app, '#ln-lamp')!;
  lamp.addEventListener(
    'click',
    (e) => {
      e.stopPropagation();
      const on = night.classList.toggle('lit');
      lamp.setAttribute('aria-pressed', String(on));
      qs(lamp, 'span')!.textContent = on ? 'Apagar la luz' : 'Encender la luz';
    },
    { signal },
  );
  if (fx.reduce) {
    x = dim.W * 0.5;
    y = dim.H * 0.35;
    set();
    night.addEventListener(
      'pointermove',
      () => {
        x = tx;
        y = ty;
        set();
      },
      { signal },
    );
  } else
    fx.onFrame((t) => {
      if (performance.now() - last > 2200) {
        const s = t / 1000;
        tx = dim.W * (0.5 + 0.38 * Math.sin(s * 0.37));
        ty = dim.H * (0.38 + 0.22 * Math.sin(s * 0.53 + 1));
      }
      x += (tx - x) * 0.12;
      y += (ty - y) * 0.12;
      set();
    }, night);
  // Catálogo con linterna
  const grid = qs(app, '#ln-grid')!;
  let cio: IntersectionObserver | null = null;
  if (!fx.hover && typeof IntersectionObserver === 'function') {
    cio = new IntersectionObserver(
      (es) => es.forEach((e) => e.target.classList.toggle('lit', e.isIntersecting)),
      { rootMargin: '-35% 0px -35% 0px' },
    );
    signal.addEventListener('abort', () => cio?.disconnect());
  }
  cat({
    id: 'ln-f',
    grid: '#ln-grid',
    more: '#ln-more',
    page: 12,
    render: (L) => L.map(nightCard).join(''),
    after: (host) => {
      if (cio) qsa(host, '.ln-n').forEach((el) => cio?.observe(el));
      else if (!fx.hover) qsa(host, '.ln-n').forEach((el) => el.classList.add('lit'));
    },
  });
  if (fx.hover) {
    grid.addEventListener(
      'pointermove',
      (e) =>
        qsa(grid, '.ln-n').forEach((c) => {
          const r = c.getBoundingClientRect();
          const d = Math.hypot(
            e.clientX - (r.left + r.width / 2),
            e.clientY - (r.top + r.width / 2),
          );
          c.style.setProperty('--l', Math.max(0, Math.min(1, 1.35 - d / 260)).toFixed(2));
        }),
      { signal },
    );
    grid.addEventListener(
      'pointerleave',
      () => qsa(grid, '.ln-n').forEach((c) => c.style.removeProperty('--l')),
      { signal },
    );
  }
  app.addEventListener(
    'pointermove',
    (e) => {
      const c = (e.target as Element).closest<HTMLElement>('.k-act,.k-nd,.k-pr,.k-revs figure');
      if (!c) return;
      const r = c.getBoundingClientRect();
      c.style.setProperty('--x', e.clientX - r.left + 'px');
      c.style.setProperty('--y', e.clientY - r.top + 'px');
    },
    { signal },
  );
}
