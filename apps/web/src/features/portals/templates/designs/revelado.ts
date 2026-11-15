import type { TplAnimal, TplModel } from '../engine/model';
import { deco, pic, premiumDesign, store, stored, type CatFn, type Fx } from '../engine/premium';
import { availLine, campaignArt, fmt, logoMark, qs, qsa } from '../engine/runtime';

/*
 * Revelado (Premium).
 * Claro, "Mesa de luz": los animales son negativos sobre una mesa de luz. Una
 * lupa muestra el positivo, cada tira tiene su código de borde y se marca con
 * lápiz rojo a quien se quiere conocer (se guarda en este navegador).
 * Oscuro, "Cuarto oscuro": luz roja de seguridad, una copia que se revela en la
 * cubeta y el catálogo colgado en cuerdas con pinzas. Un interruptor enciende
 * la luz blanca y devuelve el color.
 */
const STYLES = `
.tpl-revelado{--k-fd:'Newsreader',Georgia,serif;--k-fw:400;--k-ls:-.025em;--k-r:6px;--mono:'IBM Plex Mono',ui-monospace,monospace;font-family:'IBM Plex Sans',system-ui,sans-serif}
.tpl-revelado[data-mode=light]{--k-bg:#F1F4F8;--k-ink:#121418;--k-soft:#585E6C;--k-line:rgba(18,20,24,.12);--k-card:#FFFFFF;--k-tint:rgba(18,20,24,.05);--k-sh:0 0 0 1px rgba(18,20,24,.08),0 12px 30px -20px rgba(18,20,24,.4);--pen:#D7263D;--base:#C2702E;color-scheme:light}
.tpl-revelado[data-mode=dark]{--k-bg:#0D0303;--k-ink:#FFDCD5;--k-soft:#C98F86;--k-line:rgba(255,90,70,.16);--k-card:#170605;--k-tint:rgba(255,80,60,.07);--k-sh:0 0 0 1px rgba(255,90,70,.14);--safe:#FF3B2F;--k-acc:#FF5A47;--k-acc-ink:#1A0202;color-scheme:dark}
.tpl-revelado .k-h2 em,.tpl-revelado .rv-h1 em{font-style:italic}
.tpl-revelado .k-eb,.tpl-revelado .k-cnt,.tpl-revelado .k-chip,.tpl-revelado .k-nd .k,.tpl-revelado .k-pr .k,.tpl-revelado .k-lsum span{font-family:var(--mono);letter-spacing:.06em}
.tpl-revelado .k-eb{font-size:12px;font-weight:500}
.tpl-revelado .rv-top{display:flex;align-items:center;gap:16px;padding-block:16px;position:relative;z-index:5}
.tpl-revelado .rv-logo{display:flex;align-items:center;gap:12px;text-decoration:none;font-family:var(--k-fd);font-size:22px}
.tpl-revelado .rv-logo i{width:40px;height:40px;border-radius:50%;display:grid;place-items:center;font-style:normal;font-family:var(--mono);font-size:13px;font-weight:600;background:var(--k-ink);color:var(--k-bg);box-shadow:0 0 0 4px var(--k-bg),0 0 0 5px var(--k-ink)}
.tpl-revelado .rv-nav{display:flex;gap:2px;margin-left:auto;font-family:var(--mono);font-size:13px}
.tpl-revelado .rv-nav a{padding:10px 12px;text-decoration:none;color:var(--k-soft);text-transform:uppercase;letter-spacing:.08em}
.tpl-revelado .rv-nav a:hover{color:var(--k-ink)}
@media (max-width:760px){.tpl-revelado .rv-nav{display:none}.tpl-revelado .rv-top .k-mode{margin-left:auto}}
.tpl-revelado .k-mode{border-radius:6px;font-family:var(--mono);font-weight:500;font-size:13px;text-transform:uppercase;letter-spacing:.06em}
.tpl-revelado .rv-table{position:relative;background:radial-gradient(70% 90% at 50% 30%,#FFFFFF,#E9EEF5 80%);border-block:1px solid var(--k-line);overflow:hidden}
.tpl-revelado .rv-table::before{content:"";position:absolute;inset:0;background:linear-gradient(rgba(18,20,24,.05) 1px,transparent 1px) 0 0/40px 40px,linear-gradient(90deg,rgba(18,20,24,.05) 1px,transparent 1px) 0 0/40px 40px;pointer-events:none}
.tpl-revelado .rv-hero{position:relative;display:grid;grid-template-columns:minmax(0,.85fr) minmax(0,1.15fr);gap:30px;align-items:center;padding-block:clamp(30px,5vw,70px)}
.tpl-revelado .rv-h1{font-family:var(--k-fd);font-weight:300;font-size:clamp(54px,7.6vw,120px);line-height:.92;letter-spacing:-.035em;margin-top:16px}
.tpl-revelado .rv-h1 em{color:var(--pen)}
.tpl-revelado .rv-lede{margin-top:20px;font-size:clamp(16px,1.4vw,19px);line-height:1.65;color:var(--k-soft);max-width:30em}
.tpl-revelado .rv-cta{display:flex;flex-wrap:wrap;gap:12px;align-items:center;margin-top:26px}
.tpl-revelado .rv-cta .k-btn{border-radius:6px}
.tpl-revelado .rv-mcount{font-family:var(--mono);font-size:13px;color:var(--k-soft);display:flex;align-items:center;gap:8px}
.tpl-revelado .rv-mcount b{color:var(--pen);font-size:18px}
.tpl-revelado .rv-sheet{position:relative;rotate:-1.6deg;cursor:none;touch-action:pan-y}
.tpl-revelado .rv-sheet .rv-strip{box-shadow:0 18px 30px -18px rgba(80,40,10,.5)}
.tpl-revelado .rv-sheet .rv-strip + .rv-strip{margin-top:10px}
.tpl-revelado .rv-sheet .rv-strip:nth-child(2){translate:14px 0;rotate:.6deg}
.tpl-revelado .rv-sheet .rv-strip:nth-child(3){translate:-8px 0;rotate:-.4deg}
.tpl-revelado .rv-strip{position:relative;padding:22px 12px;background:linear-gradient(180deg,rgba(255,255,255,.18),transparent 30%),var(--base);border-radius:3px}
.tpl-revelado .rv-strip::before,.tpl-revelado .rv-strip::after{content:"";position:absolute;left:8px;right:8px;height:9px;background:radial-gradient(circle at 50% 50%,#F6F8FB 0 0,transparent 0),repeating-linear-gradient(90deg,#F4F7FB 0 9px,transparent 9px 20px);border-radius:2px;opacity:.95}
.tpl-revelado .rv-strip::before{top:6px}.tpl-revelado .rv-strip::after{bottom:6px}
.tpl-revelado .rv-edge{position:absolute;left:14px;bottom:-1px;font-family:var(--mono);font-size:9px;letter-spacing:.12em;color:#FFD6A8;opacity:.9;white-space:nowrap;overflow:hidden;right:14px;translate:0 -17px}
.tpl-revelado .rv-frs{display:grid;grid-template-columns:repeat(var(--n),minmax(0,1fr));gap:8px}
.tpl-revelado .rv-fr{position:relative;display:flex;flex-direction:column;min-width:0}
.tpl-revelado .rv-neg{position:relative;display:block;aspect-ratio:1;border:0;padding:0;cursor:pointer;background:#1a120b;border-radius:2px;overflow:visible}
.tpl-revelado .rv-neg .pos{display:block;width:100%;height:100%;overflow:hidden;filter:invert(1) sepia(.35) saturate(1.3) hue-rotate(-12deg) contrast(.9);transition:filter .5s}
.tpl-revelado .rv-neg:hover .pos,.tpl-revelado .rv-neg:focus-visible .pos{filter:none}
.tpl-revelado .rv-neg::after{content:"";position:absolute;inset:0;background:#E3893A;mix-blend-mode:multiply;opacity:.6;transition:opacity .5s;pointer-events:none;border-radius:2px}
.tpl-revelado .rv-neg:hover::after,.tpl-revelado .rv-neg:focus-visible::after{opacity:0}
.tpl-revelado .rv-loupe .rv-neg::after{display:none}
.tpl-revelado .rv-ring{position:absolute;inset:-12%;width:124%;height:124%;pointer-events:none;overflow:visible}
.tpl-revelado .rv-ring path{fill:none;stroke:var(--pen);stroke-width:3.4;stroke-linecap:round;stroke-dasharray:1;stroke-dashoffset:1;transition:stroke-dashoffset .7s cubic-bezier(.6,0,.3,1)}
.tpl-revelado .rv-fr.marked .rv-ring path{stroke-dashoffset:0}
.tpl-revelado .rv-cap{display:none}
.tpl-revelado .rv-mk{display:none}
.tpl-revelado .rv-sheet .rv-frs{gap:6px}
.tpl-revelado .rv-loupe{position:absolute;width:clamp(150px,16vw,210px);aspect-ratio:1;border-radius:50%;pointer-events:none;z-index:5;left:0;top:0;translate:-50% -50%;overflow:hidden;box-shadow:0 0 0 8px #1B1D22,0 0 0 10px #4A4F5A,0 30px 50px -10px rgba(0,0,0,.5),inset 0 0 30px rgba(0,0,0,.35);background:#fff;opacity:0;transition:opacity .3s}
.tpl-revelado .rv-loupe.on{opacity:1}
.tpl-revelado .rv-loupe .lz{position:absolute;left:0;top:0;transform-origin:0 0}
.tpl-revelado .rv-loupe .lz .pos{filter:none!important}
.tpl-revelado .rv-loupe .lz .rv-ring{display:none}
.tpl-revelado .rv-loupe::after{content:"";position:absolute;inset:0;border-radius:50%;background:radial-gradient(circle at 30% 25%,rgba(255,255,255,.55),transparent 35%)}
@media (max-width:900px){.tpl-revelado .rv-hero{grid-template-columns:minmax(0,1fr)}.tpl-revelado .rv-sheet{rotate:-1deg}}
.tpl-revelado .rv-cat .rv-strip{padding:24px 14px 26px}
.tpl-revelado .rv-cat .rv-strip + .rv-strip{margin-top:26px}
.tpl-revelado .rv-cat .rv-frs{gap:12px}
.tpl-revelado .rv-cat .rv-cap{display:flex;flex-direction:column;gap:2px;margin-top:10px;font-family:var(--mono);font-size:11px;color:#FFE2C2;min-width:0}
.tpl-revelado .rv-cat .rv-cap b{font-weight:600;font-size:12px;letter-spacing:.04em;text-transform:uppercase;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tpl-revelado .rv-cat .rv-cap span{opacity:.8;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tpl-revelado .rv-cat .rv-mk{display:inline-flex;align-self:flex-start;margin-top:8px;border:0;cursor:pointer;background:rgba(255,255,255,.18);color:#fff;font-family:var(--mono);font-size:11px;letter-spacing:.06em;text-transform:uppercase;padding:6px 9px;border-radius:3px;min-height:30px}
.tpl-revelado .rv-cat .rv-mk[aria-pressed="true"]{background:var(--pen)}
.tpl-revelado .rv-cat .rv-edge{translate:0 -19px}
.tpl-revelado[data-mode=light] .k-chip{border-radius:6px}
.tpl-revelado[data-mode=light] .k-q,.tpl-revelado .k-sort select{border-radius:6px}
.tpl-revelado .k-more{border-radius:6px;font-family:var(--mono);font-weight:500;text-transform:uppercase;letter-spacing:.06em;font-size:13px}
.tpl-revelado .rv-test{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:clamp(24px,5vw,70px);align-items:center}
.tpl-revelado .rv-tstrip{position:relative;display:grid;grid-template-columns:repeat(10,minmax(0,1fr));aspect-ratio:10/7;background:#fff;padding:12px;box-shadow:var(--k-sh);rotate:1.2deg}
.tpl-revelado .rv-tstrip .im{position:absolute;inset:12px;overflow:hidden}
.tpl-revelado .rv-tstrip .st{position:relative;border-right:1px dashed rgba(255,255,255,.6);display:flex;align-items:flex-end;justify-content:center;padding-bottom:8px;font-family:var(--mono);font-size:10px;color:#fff;text-shadow:0 1px 2px rgba(0,0,0,.6)}
.tpl-revelado .rv-tstrip .st::before{content:"";position:absolute;inset:0;background:#fff;opacity:var(--o);transition:opacity 1.2s ease calc(var(--i) * 120ms)}
.tpl-revelado .rv-tstrip.cold .st::before{opacity:1}
.tpl-revelado .rv-tstrip .st span{position:relative}
.tpl-revelado .rv-tstrip .st.hit{box-shadow:inset 0 0 0 3px var(--pen)}
.tpl-revelado .rv-test h2{font-family:var(--k-fd);font-weight:300;font-size:clamp(40px,5vw,76px);line-height:.95;letter-spacing:-.03em}
.tpl-revelado .rv-figs{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));border-block:1px solid var(--k-line);margin:22px 0}
.tpl-revelado .rv-figs div{padding:14px 12px 14px 0}
.tpl-revelado .rv-figs span{display:block;font-family:var(--mono);font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--k-soft)}
.tpl-revelado .rv-figs b{font-family:var(--k-fd);font-size:clamp(20px,2vw,28px);font-weight:400;font-variant-numeric:tabular-nums}
.tpl-revelado .rv-test .k-btn{border-radius:6px}
@media (max-width:860px){.tpl-revelado .rv-test{grid-template-columns:minmax(0,1fr)}}
.tpl-revelado[data-mode=light] .k-act{border-radius:4px;background:#fff}
.tpl-revelado[data-mode=light] .k-act:hover{transform:rotate(-1deg) translateY(-4px)}
.tpl-revelado[data-mode=light] .k-help{border-radius:6px;background:var(--base);color:#FFF4E8;background-image:repeating-linear-gradient(90deg,rgba(255,255,255,.75) 0 10px,transparent 10px 22px),repeating-linear-gradient(90deg,rgba(255,255,255,.75) 0 10px,transparent 10px 22px);background-size:100% 10px,100% 10px;background-position:0 10px,0 calc(100% - 10px);background-repeat:no-repeat}
.tpl-revelado[data-mode=light] .k-help .k-btn{background:#FFF4E8;color:#5A2B08!important;border-radius:6px}
.tpl-revelado[data-mode=light] .k-revs figure{border-radius:2px;padding:22px 22px 30px;rotate:var(--r,0deg)}
.tpl-revelado[data-mode=light] .k-revs figure:nth-child(1){--r:-1.4deg}.tpl-revelado[data-mode=light] .k-revs figure:nth-child(3){--r:1.2deg}
.tpl-revelado[data-mode=dark] .portrait{filter:grayscale(1) sepia(1) saturate(4.5) hue-rotate(-42deg) brightness(.82) contrast(1.15);transition:filter .8s}
.tpl-revelado[data-mode=dark].white .portrait,.tpl-revelado[data-mode=dark] .rv-pr:hover .portrait,.tpl-revelado[data-mode=dark] .rv-pr:focus-visible .portrait{filter:none}
.tpl-revelado .rv-dark{position:relative;overflow:hidden;isolation:isolate}
.tpl-revelado .rv-dark::before{content:"";position:absolute;left:50%;top:-30%;width:120%;height:90%;translate:-50% 0;z-index:-1;background:radial-gradient(closest-side,rgba(255,40,25,.35),rgba(255,40,25,.08) 60%,transparent);animation:rvHum 5s ease-in-out infinite}
@keyframes rvHum{50%{opacity:.82}}
.tpl-revelado[data-mode=dark].white .rv-dark::before{background:radial-gradient(closest-side,rgba(255,250,240,.22),transparent)}
.tpl-revelado .rv-lamp{display:inline-flex;align-items:center;gap:10px;font-family:var(--mono);font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:var(--k-soft)}
.tpl-revelado .rv-lamp i{width:12px;height:12px;border-radius:50%;background:var(--safe);box-shadow:0 0 18px 4px rgba(255,59,47,.7);animation:rvHum 2.4s infinite}
.tpl-revelado .rv-dhero{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:30px;align-items:center;padding-block:clamp(30px,5vw,70px)}
.tpl-revelado .rv-dh1{font-family:var(--k-fd);font-weight:300;font-size:clamp(52px,7.4vw,118px);line-height:.92;letter-spacing:-.035em;margin-top:16px}
.tpl-revelado .rv-dh1 em{color:var(--safe);text-shadow:0 0 40px rgba(255,59,47,.45)}
.tpl-revelado .rv-white{display:inline-flex;align-items:center;gap:10px;min-height:54px;padding:0 22px;border-radius:6px;border:0;cursor:pointer;background:var(--k-tint);color:var(--k-ink);font-weight:600;box-shadow:inset 0 0 0 1px var(--k-line)}
.tpl-revelado .rv-white svg{width:18px}
.tpl-revelado .rv-white[aria-pressed="true"]{background:#FFF6EE;color:#1A0202}
.tpl-revelado .rv-tray{position:relative;aspect-ratio:5/4;border-radius:22px;background:linear-gradient(180deg,#2A0B08,#140302);box-shadow:inset 0 0 0 10px #220806,inset 0 0 0 12px rgba(255,90,70,.15),0 40px 60px -30px #000;padding:clamp(26px,5%,44px);perspective:800px}
.tpl-revelado .rv-liq{position:absolute;inset:12px;border-radius:12px;background:linear-gradient(115deg,transparent 20%,rgba(255,120,100,.10) 35%,transparent 50%),rgba(255,59,47,.06);background-size:300% 100%;animation:rvLiq 7s ease-in-out infinite;pointer-events:none;z-index:2}
@keyframes rvLiq{50%{background-position:100% 0}}
.tpl-revelado .rv-paper{position:relative;height:100%;background:#F8F1EC;padding:5%;transform:rotateX(18deg) rotate(-3deg);box-shadow:0 20px 30px -10px rgba(0,0,0,.6)}
.tpl-revelado .rv-paper .img{display:block;height:100%;overflow:hidden;opacity:var(--dev,1);filter:blur(calc((1 - var(--dev,1)) * 6px));transition:opacity .2s linear}
.tpl-revelado .rv-paper .nm{position:absolute;left:5%;right:5%;bottom:1.2%;font-family:var(--mono);font-size:11px;color:#6A2A20;display:flex;justify-content:space-between}
.tpl-revelado .rv-steps{display:flex;gap:6px;margin-top:16px;flex-wrap:wrap}
.tpl-revelado .rv-steps span{font-family:var(--mono);font-size:11px;letter-spacing:.08em;text-transform:uppercase;padding:7px 10px;border-radius:4px;background:var(--k-tint);color:var(--k-soft)}
.tpl-revelado .rv-steps span.on{background:var(--safe);color:#1A0202}
.tpl-revelado .rv-timer{font-family:var(--mono);font-size:clamp(28px,3vw,40px);color:var(--k-ink);margin-top:14px;font-variant-numeric:tabular-nums}
@media (max-width:860px){.tpl-revelado .rv-dhero{grid-template-columns:minmax(0,1fr)}}
.tpl-revelado .rv-lines{display:flex;flex-direction:column;gap:clamp(30px,5vw,60px)}
.tpl-revelado .rv-line{position:relative;padding-top:6px}
.tpl-revelado .rv-rope{position:absolute;left:-2%;right:-2%;top:0;height:var(--sag);border-bottom:2px solid rgba(255,190,170,.45);border-radius:0 0 50% 50%/0 0 100% 100%;pointer-events:none}
.tpl-revelado .rv-row{display:grid;grid-template-columns:repeat(var(--n),minmax(0,1fr));gap:clamp(12px,2vw,28px);align-items:start}
.tpl-revelado .rv-pr{position:relative;display:block;border:0;padding:0;background:none;cursor:pointer;text-align:left;color:inherit;margin-top:var(--y);transform-origin:50% 0;animation:rvSway 6s ease-in-out infinite;animation-delay:calc(var(--ph) * -1)}
@keyframes rvSway{0%,100%{rotate:-1.6deg}50%{rotate:1.6deg}}
.tpl-revelado .rv-pr:hover{animation-play-state:paused}
.tpl-revelado .rv-pr .clip{position:absolute;left:50%;top:-14px;translate:-50% 0;width:16px;height:30px;border-radius:3px;background:linear-gradient(90deg,#7A4A2A,#A06A3E 50%,#6A3E22);box-shadow:0 2px 4px rgba(0,0,0,.5);z-index:2}
.tpl-revelado .rv-pr .pp{display:flex;flex-direction:column;gap:6px;padding:8px 8px 12px;background:#F4ECE6;color:#3A1410;box-shadow:0 20px 30px -16px #000}
.tpl-revelado .rv-pr .img{display:block;aspect-ratio:4/5;overflow:hidden;opacity:0;transition:opacity 2.4s ease}
.tpl-revelado .rv-pr.dev .img{opacity:1}
.tpl-revelado .rv-pr .nm{font-family:var(--k-fd);font-size:clamp(18px,1.6vw,22px);line-height:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tpl-revelado .rv-pr .dt{font-family:var(--mono);font-size:11px;opacity:.75}
.tpl-revelado[data-mode=dark] .rv-pr .pp{filter:sepia(.4) hue-rotate(-20deg) saturate(1.4) brightness(.9)}
.tpl-revelado[data-mode=dark].white .rv-pr .pp,.tpl-revelado .rv-pr:hover .pp{filter:none}
.tpl-revelado[data-mode=dark] .k-chip[aria-pressed="true"],.tpl-revelado[data-mode=dark] .k-more{background:var(--safe);color:#1A0202}
.tpl-revelado[data-mode=dark] .k-chip{border-radius:6px}
.tpl-revelado[data-mode=dark] .k-q{border-radius:6px}
.tpl-revelado .rv-dev{display:grid;grid-template-columns:minmax(0,.9fr) minmax(0,1.1fr);gap:clamp(24px,5vw,70px);align-items:center;padding:clamp(24px,4vw,56px);border-radius:8px;background:radial-gradient(70% 90% at 30% 20%,rgba(255,59,47,.14),transparent 70%),#130404;box-shadow:inset 0 0 0 1px var(--k-line)}
.tpl-revelado .rv-dev h2{font-family:var(--k-fd);font-weight:300;font-size:clamp(40px,5vw,76px);line-height:.95;letter-spacing:-.03em}
.tpl-revelado .rv-gauge{position:relative;height:14px;background:var(--k-tint);border-radius:2px;overflow:hidden}
.tpl-revelado .rv-gauge i{position:absolute;inset:0 auto 0 0;width:var(--p,0%);min-width:8px;background:linear-gradient(90deg,#7A0F08,var(--safe));box-shadow:0 0 20px rgba(255,59,47,.6);transition:width 2s cubic-bezier(.2,.8,.2,1)}
.tpl-revelado .rv-dev .k-btn{border-radius:6px;background:var(--safe);color:#1A0202!important}
.tpl-revelado .rv-dev .rv-pr{max-width:300px;margin-inline:auto;animation-duration:8s}
@media (max-width:860px){.tpl-revelado .rv-dev{grid-template-columns:minmax(0,1fr)}}
.tpl-revelado[data-mode=dark] .k-act,.tpl-revelado[data-mode=dark] .k-nd,.tpl-revelado[data-mode=dark] .k-pr,.tpl-revelado[data-mode=dark] .k-revs figure,.tpl-revelado[data-mode=dark] .k-ledger,.tpl-revelado[data-mode=dark] .k-contact{border-radius:8px}
.tpl-revelado[data-mode=dark] .k-act:hover{transform:translateY(-6px);box-shadow:0 0 0 1px var(--safe),0 0 50px -10px rgba(255,59,47,.5)}
.tpl-revelado[data-mode=dark] .k-help{border-radius:8px;background:radial-gradient(60% 100% at 50% 0%,rgba(255,59,47,.5),transparent 70%),#170404;color:var(--k-ink);box-shadow:inset 0 0 0 1px var(--k-line)}
.tpl-revelado[data-mode=dark] .k-help .k-btn{background:var(--safe);color:#1A0202!important;border-radius:6px}
.tpl-revelado[data-mode=dark] .k-btn{border-radius:6px}
.tpl-revelado .rv-edge{text-transform:uppercase}
.tpl-revelado .rv-pr .img{position:relative}
.tpl-revelado .rv-camp-pr{cursor:default}
`;

const RING = `<svg class="rv-ring" viewBox="0 0 100 100" aria-hidden="true"><path d="M50 6 C78 4 96 24 94 52 C92 80 70 96 46 94 C20 92 4 72 6 46 C8 22 28 6 56 8" pathLength="1"/></svg>`;
const sub = (a: TplAnimal) => `${a.spLabel}${a.age ? ` · ${a.age}` : ''}`;
const marksKey = (m: TplModel) => `af-rvl-marks:${m.slug}`;

function makeParts(m: TplModel, marks: Set<string>) {
  const frame = (a: TplAnimal) => {
    const on = marks.has(a.id);
    return `<div class="rv-fr${on ? ' marked' : ''}" data-fid="${a.id}"><a class="rv-neg" href="${a.href}" data-id="${a.id}" aria-label="Ver la ficha de ${a.name}"><span class="pos">${deco(a, { dx: 6, dy: 14, s: 1.08 })}</span>${RING}</a><span class="rv-cap"><b>${String(a.i + 1).padStart(2, '0')} ${a.name}</b><span>${sub(a)}</span></span><button type="button" class="rv-mk" data-mark="${a.id}" aria-pressed="${on}">${on ? 'Marcado' : 'Marcar'}</button></div>`;
  };
  const strip = (L: TplAnimal[], k: number, n: number) =>
    `<div class="rv-strip"><span class="rv-edge">AF 400 ▸ ${k * n + 1}&nbsp;&nbsp;${k * n + 1}A&nbsp;&nbsp;&nbsp;${m.ORG.short}&nbsp;&nbsp;&nbsp;▸ ${k * n + 2}</span><div class="rv-frs" style="--n:${n}">${L.map(frame).join('')}</div></div>`;
  return { strip };
}

const print = (a: TplAnimal, i: number, y = 0) =>
  `<a class="rv-pr" href="${a.href}" data-id="${a.id}" style="--y:${y}px;--ph:${(i * 0.7) % 6}s"><span class="clip" aria-hidden="true"></span><span class="pp"><span class="img">${deco(a, { dx: 6, dy: 14, s: 1.08 })}</span><span class="nm">${a.name}</span><span class="dt">${sub(a)}</span></span></a>`;

const days = (n: number) => `${n} ${n === 1 ? 'día' : 'días'}`;

export const revelado = premiumDesign({
  id: 'revelado',
  catId: 'rv-cat',
  modes: { light: 'Mesa de luz', dark: 'Cuarto oscuro' },
  fonts:
    'family=Newsreader:ital,opsz,wght@0,6..72,400..700;1,6..72,400..600&family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600;700',
  css: STYLES,
  html({ m, P, mode }) {
    const { ORG, ANIMALS, CAMPAIGN } = m;
    const n = ANIMALS.length;
    const top = `<header class="w rv-top"><a class="rv-logo" href="#rv-cat"><i>${logoMark(m)}</i>${ORG.name}</a><nav class="rv-nav" aria-label="Secciones"><a href="#rv-cat">Animales</a><a href="#rv-camp">Campaña</a><a href="#rv-ldg">Libro</a></nav>${P.modeBtn()}</header>`;
    const tail = (bg: string) =>
      `${P.needs()}${P.prods(P.hd('Tienda solidaria', 'Productos'), bg)}${P.help()}${P.about()}${P.revs()}<div id="rv-ldg">${P.ledger()}</div>${P.contact()}${P.foot()}`;
    const figs = `<div class="rv-figs"><div><span>Recaudado</span><b id="rv-raised">${fmt(CAMPAIGN.raised)}</b></div><div><span>Meta</span><b>${fmt(CAMPAIGN.goal)}</b></div><div><span>Cierra</span><b>${CAMPAIGN.deadlineShort || '—'}</b></div></div>`;
    const btn = `<a class="k-btn" href="${CAMPAIGN.href}" data-magnet>Ver campaña y aportar ${pic.arrow}</a>${P.more()}`;
    const desc = CAMPAIGN.description
      ? `<p class="k-sub" style="margin:0 0 14px">${CAMPAIGN.description}</p>`
      : '';
    const lede = ORG.lede || availLine(m);
    if (mode === 'light') {
      const { strip } = makeParts(m, stored(marksKey(m)));
      const steps = 10;
      const hit = Math.min(steps - 1, Math.floor(CAMPAIGN.pct / 10));
      const sheet = n
        ? `<div class="rv-sheet" id="rv-sheet">${[0, 1, 2]
            .map((k) => {
              const L = ANIMALS.slice(k * 6, k * 6 + 6);
              return L.length ? strip(L, k, 6) : '';
            })
            .join(
              '',
            )}<div class="rv-loupe" id="rv-loupe" aria-hidden="true"><div class="lz" id="rv-lz"></div></div></div>`
        : `<div class="rv-sheet"><div class="rv-strip"><span class="rv-edge">AF 400 ▸ ${ORG.short} ▸ Próximamente</span></div></div>`;
      return `<div class="rv-table">${top}${P.tbar()}<section class="w rv-hero"><div><p class="k-eb">Hoja de contactos${ORG.city ? ` · ${ORG.city}` : ''} · ${new Date().getFullYear()}</p>
        <h1 class="rv-h1">Míralos <em>de cerca</em></h1>
        <p class="rv-lede">${lede}${n ? ' Pasa la lupa por los negativos para verlos en positivo y marca con lápiz rojo a quienes quieras conocer.' : ''}</p>
        <div class="rv-cta"><a class="k-btn" href="#rv-cat" data-magnet>Ver todos los negativos ${pic.arrow}</a>${n ? `<span class="rv-mcount">Marcados <b id="rv-mn">0</b></span>` : ''}</div></div>
        ${sheet}</section></div>
        ${P.acts(P.hd('Cómo participar', 'Tres formas de <em>ayudar</em>'))}
        <section class="w k-sec rv-cat" data-sec="animales" id="rv-cat">${P.hd('Archivo completo', 'Mascotas en adopción', '', n ? 'Pasa el cursor por un negativo para verlo en positivo. Marca a los que te gusten y quedarán señalados.' : '')}${P.catControls('rv-f')}<div id="rv-grid"></div><button type="button" class="k-more" id="rv-more" hidden></button></section>
        ${P.campaign(
          () => `<section class="w k-sec" data-sec="campana" id="rv-camp"><div class="rv-test"><div class="rv-tstrip cold" id="rv-ts"><span class="im">${campaignArt(m)}</span>${Array.from({ length: steps }, (_, i) => `<span class="st${i === hit ? ' hit' : ''}" style="--o:${i <= hit ? 0 : 0.86 - i * 0.02};--i:${i}"><span>${(i + 1) * 10}%</span></span>`).join('')}</div>
          <div><p class="k-eb">Tira de prueba · Campaña activa</p><h2>${CAMPAIGN.title}</h2>${desc}${figs}<p class="k-sub" style="margin:0 0 22px">Cada franja es un 10% de la meta. Va en ${CAMPAIGN.pct}% y faltan ${days(CAMPAIGN.daysLeft)} para cerrar.</p>${btn}</div></div></section>`,
        )}
        ${tail('#F5F7FA')}`;
    }
    const a0 = ANIMALS[0];
    return `<div class="rv-dark">${top}${P.tbar()}<section class="w rv-dhero"><div><span class="rv-lamp"><i></i>Luz de seguridad encendida</span>
        <h1 class="rv-dh1">En la oscuridad se revela <em>lo mejor</em></h1>
        <p class="rv-lede">${lede}${n ? ' Cada copia que sale de la cubeta es alguien que espera familia; aquí los vas viendo aparecer.' : ''}</p>
        <div class="rv-cta"><a class="k-btn" href="#rv-cat" data-magnet>Ver las copias ${pic.arrow}</a><button type="button" class="rv-white" id="rv-white" aria-pressed="false">${pic.sun}<span>Encender luz blanca</span></button></div></div>
        <div><div class="rv-tray"><div class="rv-paper" id="rv-paper"><span class="img">${a0 ? deco(a0, { dx: 6, dy: 14, s: 1.08 }) : ''}</span><span class="nm"><span id="rv-pn">${a0 ? a0.name : 'Muy pronto'}</span><span>AF 400</span></span></div><span class="rv-liq"></span></div>
          <div class="rv-steps" id="rv-steps"><span class="on">Revelador</span><span>Paro</span><span>Fijador</span><span>Lavado</span></div><p class="rv-timer" id="rv-timer" aria-live="off">00:00</p></div></section></div>
      ${P.acts(P.hd('Cómo participar', 'Tres formas de <em>ayudar</em>'))}
      <section class="w k-sec" data-sec="animales" id="rv-cat">${P.hd('Secando en la cuerda', 'Mascotas en adopción', '', n ? 'Las copias se revelan al llegar a ellas. Pasa el cursor o enciende la luz blanca para ver su color real.' : '')}${P.catControls('rv-f')}<div class="rv-lines" id="rv-grid"></div><button type="button" class="k-more" id="rv-more" hidden></button></section>
      ${P.campaign(
        () =>
          `<section class="w k-sec" data-sec="campana" id="rv-camp"><div class="rv-dev"><div><div class="rv-pr dev rv-camp-pr" style="--y:0px;--ph:0s"><span class="clip" aria-hidden="true"></span><span class="pp"><span class="img">${campaignArt(m)}</span><span class="nm">${CAMPAIGN.title}</span><span class="dt">Campaña activa</span></span></div></div><div><p class="k-eb">En revelado · Campaña activa</p><h2>${CAMPAIGN.title}</h2>${desc}${figs}<div class="rv-gauge k-bar" data-w="${Math.max(2, CAMPAIGN.pct)}"><i></i></div><p class="k-sub" style="margin:14px 0 22px">Va en ${CAMPAIGN.pct}% · faltan ${days(CAMPAIGN.daysLeft)}.</p>${btn}</div></div></section>`,
      )}
      ${tail('#1E0907')}`;
  },
  init(app, { m, mode, fx, cat }) {
    fx.fillOnView(app, '.k-bar');
    fx.countUp(qs(app, '#rv-raised'), m.CAMPAIGN.raised, fmt);
    fx.magnet(app);
    fx.reveal(app, '.k-act,.k-nd,.k-pr,.k-revs figure', { stagger: 80 });
    if (mode === 'light') initTable(app, m, fx, cat);
    else initDarkroom(app, m, fx, cat);
  },
});

function initTable(app: HTMLElement, m: TplModel, fx: Fx, cat: CatFn) {
  const { signal } = fx;
  const marks = stored(marksKey(m));
  const ids = new Set(m.ANIMALS.map((a) => a.id));
  const { strip } = makeParts(m, marks);
  const count = () => {
    const el = qs(app, '#rv-mn');
    if (el) el.textContent = String([...marks].filter((id) => ids.has(id)).length);
  };
  count();
  const perStrip = () => (innerWidth < 640 ? 3 : 6);
  cat({
    id: 'rv-f',
    grid: '#rv-grid',
    more: '#rv-more',
    page: 18,
    render: (L) => {
      const n = perStrip();
      const out: string[] = [];
      for (let k = 0; k * n < L.length; k++) out.push(strip(L.slice(k * n, k * n + n), k, n));
      return out.join('');
    },
  });
  app.addEventListener(
    'click',
    (e) => {
      const b = (e.target as Element).closest<HTMLElement>('[data-mark]');
      if (!b) return;
      e.stopPropagation();
      const id = b.dataset.mark ?? '';
      const on = !marks.has(id);
      if (on) marks.add(id);
      else marks.delete(id);
      store(marksKey(m), marks);
      qsa(app, `[data-fid="${CSS.escape(id)}"]`).forEach((f) => f.classList.toggle('marked', on));
      qsa(app, `[data-mark="${CSS.escape(id)}"]`).forEach((x) => {
        x.setAttribute('aria-pressed', String(on));
        x.textContent = on ? 'Marcado' : 'Marcar';
      });
      count();
    },
    { signal },
  );
  const ts = qs(app, '#rv-ts');
  if (ts) {
    if (typeof IntersectionObserver !== 'function') ts.classList.remove('cold');
    else
      fx.observe(
        [ts],
        (e, o) => {
          if (!e.isIntersecting) return;
          o.disconnect();
          ts.classList.remove('cold');
        },
        { threshold: 0.5 },
      );
  }
  // Lupa: una copia en positivo de la hoja, ampliada y desplazada bajo el cursor
  const sheet = qs(app, '#rv-sheet');
  const lp = qs(app, '#rv-loupe');
  const lz = qs(app, '#rv-lz');
  if (!sheet || !lp || !lz) return;
  const Z = 2.2;
  let tx = 0;
  let ty = 0;
  let x = 0;
  let y = 0;
  let last = -1e9;
  const build = () => {
    const c = sheet.cloneNode(true) as HTMLElement;
    qs(c, '#rv-loupe')?.remove();
    c.removeAttribute('id');
    c.setAttribute('inert', '');
    c.style.cssText = `width:${sheet.offsetWidth}px;rotate:0deg;margin:0`;
    qsa(c, '[data-id]').forEach((el) => el.removeAttribute('data-id'));
    qsa(c, 'a,button').forEach((el) => el.setAttribute('tabindex', '-1'));
    lz.innerHTML = '';
    lz.appendChild(c);
    lz.style.transform = `scale(${Z})`;
  };
  build();
  if (typeof ResizeObserver === 'function') {
    const ro = new ResizeObserver(build);
    ro.observe(sheet);
    signal.addEventListener('abort', () => ro.disconnect());
  }
  const place = () => {
    lp.style.left = x + 'px';
    lp.style.top = y + 'px';
    const R = lp.offsetWidth / 2;
    lz.style.left = R - x * Z + 'px';
    lz.style.top = R - y * Z + 'px';
  };
  sheet.addEventListener(
    'pointermove',
    (e) => {
      const r = sheet.getBoundingClientRect();
      tx = e.clientX - r.left;
      ty = e.clientY - r.top;
      last = performance.now();
      lp.classList.add('on');
      if (fx.reduce) {
        x = tx;
        y = ty;
        place();
      }
    },
    { signal },
  );
  sheet.addEventListener('pointerleave', () => (last = performance.now() - 1500), { signal });
  if (!fx.reduce) {
    lp.classList.add('on');
    fx.onFrame((t) => {
      if (performance.now() - last > 1800) {
        const s = t / 1000;
        tx = sheet.offsetWidth * (0.5 + 0.4 * Math.sin(s * 0.4));
        ty = sheet.offsetHeight * (0.5 + 0.36 * Math.sin(s * 0.63));
      }
      x += (tx - x) * 0.14;
      y += (ty - y) * 0.14;
      place();
    }, sheet);
  }
}

/* Cuarto oscuro */
function initDarkroom(app: HTMLElement, m: TplModel, fx: Fx, cat: CatFn) {
  const { signal } = fx;
  const { ANIMALS } = m;
  const wbtn = qs(app, '#rv-white')!;
  wbtn.addEventListener(
    'click',
    () => {
      const on = app.classList.toggle('white');
      wbtn.setAttribute('aria-pressed', String(on));
      qs(wbtn, 'span')!.textContent = on ? 'Volver a la luz roja' : 'Encender luz blanca';
    },
    { signal },
  );
  // La luz blanca es de este modo: se apaga al salir de él.
  signal.addEventListener('abort', () => app.classList.remove('white'));
  const paper = qs(app, '#rv-paper')!;
  const steps = qsa(app, '#rv-steps span');
  const timer = qs(app, '#rv-timer')!;
  const pn = qs(app, '#rv-pn')!;
  let k = 0;
  const CYCLE = 9;
  const setImg = (a: TplAnimal) => {
    qs(paper, '.img')!.innerHTML = deco(a, { dx: 6, dy: 14, s: 1.08 });
    pn.innerHTML = a.name;
  };
  if (fx.reduce || !ANIMALS.length) {
    paper.style.setProperty('--dev', '1');
    timer.textContent = '01:00';
  } else {
    let start = performance.now();
    fx.onFrame((t) => {
      const e = (t - start) / 1000;
      if (e > CYCLE) {
        start = t;
        k = (k + 1) % Math.min(ANIMALS.length, 12);
        setImg(ANIMALS[k]);
        return;
      }
      const dev = Math.min(1, Math.max(0, (e - 0.4) / 4.2));
      paper.style.setProperty('--dev', (1 - Math.pow(1 - dev, 2)).toFixed(3));
      const st = e < 4.8 ? 0 : e < 6 ? 1 : e < 7.6 ? 2 : 3;
      steps.forEach((s, i) => s.classList.toggle('on', i === st));
      timer.textContent = `00:${String(Math.floor(e * 7)).padStart(2, '0')}`;
    }, paper);
  }
  let io: IntersectionObserver | null = null;
  if (typeof IntersectionObserver === 'function') {
    io = new IntersectionObserver(
      (es) =>
        es.forEach((e) => {
          if (!e.isIntersecting) return;
          e.target.classList.add('dev');
          io?.unobserve(e.target);
        }),
      { threshold: 0.3 },
    );
    signal.addEventListener('abort', () => io?.disconnect());
  }
  const perLine = () => (innerWidth < 640 ? 2 : innerWidth < 1000 ? 3 : 5);
  cat({
    id: 'rv-f',
    grid: '#rv-grid',
    more: '#rv-more',
    page: 15,
    render: (L) => {
      const n = perLine();
      const sag = 34;
      const out: string[] = [];
      for (let j = 0; j * n < L.length; j++) {
        const row = L.slice(j * n, j * n + n);
        const y = (i: number) => Math.round(sag * (1 - Math.pow(2 * ((i + 0.5) / n) - 1, 2)));
        out.push(
          `<div class="rv-line" style="--sag:${sag + 14}px"><span class="rv-rope"></span><div class="rv-row" style="--n:${n}">${row.map((a, i) => print(a, i + j, y(i))).join('')}</div></div>`,
        );
      }
      return out.join('');
    },
    after: (host) =>
      qsa(host, '.rv-pr:not(.dev)').forEach((el) =>
        fx.reduce || !io ? el.classList.add('dev') : io.observe(el),
      ),
  });
}
