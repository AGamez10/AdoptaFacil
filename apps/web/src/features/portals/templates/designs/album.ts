import type { TplAnimal, TplModel } from '../engine/model';
import { deco, pic, premiumDesign, store, stored, type CatFn, type Fx } from '../engine/premium';
import { availLine, campaignArt, countPhrase, fmt, logoMark, qs, qsa } from '../engine/runtime';

/*
 * Álbum (Premium).
 * Claro, "Láminas": el portal es un álbum de láminas. Se abre un sobre con
 * cinco animales al azar, cada lámina se pega en su casilla numerada y el álbum
 * cuenta cuántos de ellos ya conociste (se guarda en este navegador).
 * Oscuro, "Holográfica": cartas coleccionables con foil que refleja la luz al
 * mover el cursor (o al hacer scroll en el celular). La serie de cada carta
 * sale de su etapa de vida.
 */
const CSS = `
.tpl-album{--k-fd:'Bricolage Grotesque',system-ui,sans-serif;--k-fw:800;--k-ls:-.035em;--k-r:22px;font-family:'Figtree',system-ui,sans-serif;font-variation-settings:normal}
.tpl-album[data-mode=light]{--k-bg:#EEF3FA;--k-ink:#131B33;--k-soft:#56607A;--k-line:rgba(19,27,51,.12);--k-card:#FFFFFF;--k-tint:rgba(19,27,51,.06);--k-sh:0 1px 0 rgba(19,27,51,.06),0 10px 30px -18px rgba(19,27,51,.35);--al-y:#FFD23F;--al-r:#E5383B;color-scheme:light;background:radial-gradient(rgba(19,27,51,.07) 1px,transparent 1.4px) 0 0/14px 14px,var(--k-bg)}
.tpl-album[data-mode=dark]{--k-bg:#07070C;--k-ink:#F3F1FF;--k-soft:#A7A3BF;--k-line:rgba(255,255,255,.1);--k-card:#111119;--k-tint:rgba(255,255,255,.06);--k-sh:0 0 0 1px rgba(255,255,255,.08);color-scheme:dark}
.tpl-album .al-top{display:flex;align-items:center;gap:16px;padding-block:16px;position:relative;z-index:4}
.tpl-album .al-logo{display:flex;align-items:center;gap:12px;text-decoration:none;font-family:var(--k-fd);font-weight:800;font-size:19px;letter-spacing:-.02em}
.tpl-album .al-logo i{width:44px;height:44px;border-radius:12px;display:grid;place-items:center;font-style:normal;font-family:'Bungee',sans-serif;font-size:15px;background:var(--k-acc);color:var(--k-acc-ink);transform:rotate(-6deg);box-shadow:0 0 0 3px var(--k-card),0 6px 14px -6px rgba(0,0,0,.4)}
.tpl-album .al-nav{display:flex;gap:4px;margin-left:auto}
.tpl-album .al-nav a{padding:10px 14px;border-radius:999px;text-decoration:none;font-weight:700;font-size:14px;color:var(--k-soft)}
.tpl-album .al-nav a:hover{color:var(--k-ink);background:var(--k-tint)}
@media (max-width:760px){.tpl-album .al-nav{display:none}.tpl-album .al-top .k-mode{margin-left:auto}}
.tpl-album .al-hero{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.05fr);gap:30px;align-items:center;padding-block:clamp(26px,5vw,64px) clamp(40px,6vw,80px)}
.tpl-album .al-ed{display:inline-flex;align-items:center;gap:10px;font-weight:800;font-size:13px;letter-spacing:.08em;text-transform:uppercase;background:var(--al-y);color:#131B33;padding:8px 14px 8px 8px;border-radius:999px;transform:rotate(-2deg)}
.tpl-album .al-ed b{font-family:'Bungee',sans-serif;font-weight:400;background:#131B33;color:var(--al-y);padding:3px 8px;border-radius:999px;letter-spacing:0}
.tpl-album .al-h1{font-family:var(--k-fd);font-weight:800;font-size:clamp(56px,8.6vw,132px);line-height:.86;letter-spacing:-.05em;margin-top:22px;font-variation-settings:'wdth' 82}
.tpl-album .al-h1 em{font-style:normal;display:inline-block;color:var(--k-acc);position:relative}
.tpl-album .al-h1 em::after{content:"";position:absolute;left:-2%;right:-2%;bottom:.04em;height:.16em;background:var(--al-y);z-index:-1;border-radius:4px;transform:rotate(-1.5deg)}
.tpl-album .al-lede{margin-top:22px;font-size:clamp(17px,1.5vw,20px);line-height:1.6;color:var(--k-soft);max-width:30em}
.tpl-album .al-cta{display:flex;flex-wrap:wrap;gap:12px;align-items:center;margin-top:28px}
.tpl-album .al-open{display:inline-flex;align-items:center;gap:12px;min-height:58px;padding:0 28px;border-radius:16px;border:0;cursor:pointer;font-weight:800;font-size:17px;background:#131B33;color:#fff;box-shadow:0 6px 0 var(--k-acc);transition:transform .15s,box-shadow .15s}
.tpl-album .al-open:active{transform:translateY(4px);box-shadow:0 2px 0 var(--k-acc)}
.tpl-album .al-open svg{width:20px}
.tpl-album .al-prog{display:flex;align-items:center;gap:12px;font-size:14px;font-weight:700;color:var(--k-soft)}
.tpl-album .al-ring{--v:0;width:46px;height:46px;border-radius:50%;background:conic-gradient(var(--k-acc) calc(var(--v) * 1%),var(--k-tint) 0);display:grid;place-items:center;transition:--v 1s}
.tpl-album .al-ring::before{content:"";width:34px;height:34px;border-radius:50%;background:var(--k-bg);grid-area:1/1}
.tpl-album .al-ring b{grid-area:1/1;font-family:'Bungee',sans-serif;font-weight:400;font-size:11px;color:var(--k-ink);position:relative}
.tpl-album .al-stage{position:relative;height:clamp(440px,48vw,600px)}
.tpl-album .al-pack{position:absolute;left:50%;bottom:0;width:min(300px,62%);aspect-ratio:3/4.1;translate:-50% 0;z-index:3;border:0;padding:0;cursor:pointer;background:none;transition:translate .7s cubic-bezier(.2,.8,.2,1),rotate .7s}
.tpl-album .al-pack .bd,.tpl-album .al-pack .lid{position:absolute;left:0;right:0;background:linear-gradient(135deg,var(--k-acc),color-mix(in oklab,var(--k-acc) 55%,#131B33));box-shadow:inset 0 0 0 3px rgba(255,255,255,.25)}
.tpl-album .al-pack .bd{top:12%;bottom:0;border-radius:0 0 18px 18px}
.tpl-album .al-pack.torn .bd{clip-path:polygon(0 3%,5% 0,10% 3%,15% 0,20% 3%,25% 0,30% 3%,35% 0,40% 3%,45% 0,50% 3%,55% 0,60% 3%,65% 0,70% 3%,75% 0,80% 3%,85% 0,90% 3%,95% 0,100% 3%,100% 100%,0 100%)}
.tpl-album .al-pack .lid{top:0;height:17%;border-radius:18px 18px 0 0;clip-path:polygon(0 0,100% 0,100% 82%,95% 100%,90% 82%,85% 100%,80% 82%,75% 100%,70% 82%,65% 100%,60% 82%,55% 100%,50% 82%,45% 100%,40% 82%,35% 100%,30% 82%,25% 100%,20% 82%,15% 100%,10% 82%,5% 100%,0 82%);transition:transform .7s cubic-bezier(.3,.7,.2,1),opacity .7s}
.tpl-album .al-pack .sh{position:absolute;inset:12% 0 0;border-radius:0 0 18px 18px;background:linear-gradient(115deg,transparent 30%,rgba(255,255,255,.4) 45%,transparent 60%);background-size:250% 100%;animation:alShine 3.6s ease-in-out infinite;pointer-events:none}
@keyframes alShine{0%,40%{background-position:120% 0}100%{background-position:-60% 0}}
.tpl-album .al-pack .lb{position:absolute;inset:26% 10% 10%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;color:#fff;text-align:center}
.tpl-album .al-pack .lb i{font-style:normal;font-family:'Bungee',sans-serif;font-size:clamp(26px,3vw,40px);line-height:.9}
.tpl-album .al-pack .lb span{font-size:12px;font-weight:800;letter-spacing:.16em;text-transform:uppercase;opacity:.85}
.tpl-album .al-pack .lb b{background:var(--al-y);color:#131B33;font-weight:800;font-size:13px;padding:6px 12px;border-radius:999px;transform:rotate(-4deg)}
.tpl-album .al-pack.torn .lid{transform:translate(30%,-120%) rotate(24deg);opacity:0}
.tpl-album .al-pack.torn{translate:-50% 38%;rotate:-3deg}
.tpl-album .al-fan{position:absolute;inset:0;z-index:2}
.tpl-album .al-fan .al-st{position:absolute;left:50%;top:44%;width:clamp(116px,13vw,172px);transform:translate(-50%,-50%) translate(var(--fx,0),var(--fy,0)) rotate(var(--fr,0deg));transition:transform .9s cubic-bezier(.2,.9,.25,1.15) var(--d,0s),opacity .4s var(--d,0s)}
.tpl-album .al-fan .al-st:nth-child(1){--fx:-58%;--fy:22%;--fr:-14deg}
.tpl-album .al-fan .al-st:nth-child(2){--fx:0%;--fy:8%;--fr:-2deg}
.tpl-album .al-fan .al-st:nth-child(3){--fx:58%;--fy:22%;--fr:12deg}
.tpl-album .al-fan.go .al-st{--d:calc(var(--k) * 90ms)}
.tpl-album .al-fan.go .al-st:nth-child(1){--fx:-150%;--fy:-2%;--fr:-18deg}
.tpl-album .al-fan.go .al-st:nth-child(2){--fx:-75%;--fy:-18%;--fr:-8deg}
.tpl-album .al-fan.go .al-st:nth-child(3){--fx:0%;--fy:-26%;--fr:1deg}
.tpl-album .al-fan.go .al-st:nth-child(4){--fx:75%;--fy:-18%;--fr:9deg}
.tpl-album .al-fan.go .al-st:nth-child(5){--fx:150%;--fy:-2%;--fr:17deg}
.tpl-album .al-fan.deal .al-st{transform:translate(-50%,10%) scale(.5) rotate(0deg);opacity:0;transition:none}
@media (max-width:860px){.tpl-album .al-hero{grid-template-columns:minmax(0,1fr)}.tpl-album .al-stage{height:420px}.tpl-album .al-fan.go .al-st:nth-child(1){--fx:-118%;--fy:6%}.tpl-album .al-fan.go .al-st:nth-child(5){--fx:118%;--fy:6%}.tpl-album .al-fan.go .al-st:nth-child(2){--fx:-60%}.tpl-album .al-fan.go .al-st:nth-child(4){--fx:60%}}
.tpl-album .al-st{display:flex;flex-direction:column;gap:0;padding:7px;border:0;border-radius:14px;background:#fff;color:#131B33;cursor:pointer;text-align:left;box-shadow:0 1px 1px rgba(0,0,0,.08),0 14px 26px -14px rgba(19,27,51,.55);rotate:var(--r);transition:rotate .35s,translate .35s,box-shadow .35s;position:relative;isolation:isolate}
.tpl-album .al-st:hover{rotate:0deg;translate:0 -6px;box-shadow:0 1px 1px rgba(0,0,0,.08),0 26px 36px -18px rgba(19,27,51,.6)}
.tpl-album .al-st::after{content:"";position:absolute;right:0;bottom:0;width:0;height:0;border-radius:0 0 14px 0;background:linear-gradient(135deg,transparent 50%,#dfe5ef 50%,#fff 75%);box-shadow:-3px -3px 6px rgba(0,0,0,.12);transition:width .3s,height .3s}
.tpl-album .al-st:hover::after{width:30px;height:30px}
.tpl-album .al-ph{display:block;aspect-ratio:4/5;border-radius:9px;overflow:hidden}
.tpl-album .al-no{position:absolute;top:0;left:0;translate:-22% -26%;width:40px;height:40px;border-radius:50%;display:grid;place-items:center;font-family:'Bungee',sans-serif;font-size:11px;background:var(--al-y,#FFD23F);color:#131B33;box-shadow:0 0 0 3px #fff;z-index:2}
.tpl-album .al-nm{display:flex;flex-direction:column;padding:8px 4px 3px;min-width:0}
.tpl-album .al-nm b{font-family:'Bricolage Grotesque',sans-serif;font-weight:800;font-size:clamp(15px,1.4vw,19px);letter-spacing:-.02em;line-height:1.1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tpl-album .al-nm small{font-size:12px;color:#56607A;font-weight:600}
.tpl-album .al-new{position:absolute;top:14px;right:-6px;background:var(--al-r,#E5383B);color:#fff;font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;padding:4px 9px;border-radius:6px;rotate:6deg}
.tpl-album .al-book{background:var(--k-card);border-radius:28px;padding:clamp(18px,3vw,36px);box-shadow:var(--k-sh);position:relative}
.tpl-album .al-book::before{content:"";position:absolute;top:24px;bottom:24px;left:50%;width:2px;background:repeating-linear-gradient(var(--k-line) 0 8px,transparent 8px 16px);display:var(--spine,block)}
.tpl-album .al-bh{display:flex;flex-wrap:wrap;gap:12px 20px;justify-content:space-between;align-items:center;margin-bottom:8px}
.tpl-album .al-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:clamp(18px,2.4vw,34px) clamp(14px,2vw,28px);position:relative}
.tpl-album .al-slot{position:relative;border-radius:16px;background:repeating-linear-gradient(-45deg,var(--k-tint) 0 6px,transparent 6px 12px);outline:2px dashed var(--k-line);outline-offset:-2px;padding:0}
.tpl-album .al-slot .al-st{width:100%}
.tpl-album .al-slot .stk{transition:transform .55s cubic-bezier(.3,1.6,.5,1),opacity .3s}
.tpl-album .al-slot.is-pre .stk{transform:scale(1.25) rotate(8deg) translateY(-20px);opacity:0}
.tpl-album .al-slot.is-pre.is-in .stk{transform:none;opacity:1}
@media (max-width:1000px){.tpl-album .al-grid{grid-template-columns:repeat(3,minmax(0,1fr))}.tpl-album .al-book{--spine:none}}
@media (max-width:560px){.tpl-album .al-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
.tpl-album[data-mode=light] .k-more{background:#131B33;color:#fff;box-shadow:0 5px 0 var(--k-acc)}
.tpl-album .al-gold{display:grid;grid-template-columns:minmax(0,.8fr) minmax(0,1.2fr);gap:clamp(24px,5vw,70px);align-items:center;padding:clamp(24px,4vw,56px);border-radius:32px;background:#131B33;color:#fff;position:relative;overflow:hidden}
.tpl-album .al-gold::before{content:"";position:absolute;inset:0;background:radial-gradient(circle,rgba(255,255,255,.08) 1px,transparent 1.5px) 0 0/16px 16px}
.tpl-album .al-gold .al-st{width:min(320px,100%);margin:auto;background:linear-gradient(135deg,#F9E7A6,#D9A93B 35%,#FFF1BF 50%,#C08A21 70%,#F5D77A);padding:10px;rotate:-4deg;position:relative}
.tpl-album .al-gold .al-st .al-nm small{color:#5B4512}
.tpl-album .al-gold-t{position:relative;display:flex;flex-direction:column;gap:16px}
.tpl-album .al-gold-t .k-eb{color:var(--al-y)}
.tpl-album .al-gold-t h2{font-family:var(--k-fd);font-weight:800;font-size:clamp(40px,5.4vw,80px);line-height:.92;letter-spacing:-.045em}
.tpl-album .al-figs{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
.tpl-album .al-figs div{padding:16px;border-radius:16px;background:rgba(255,255,255,.07)}
.tpl-album .al-figs span{font-size:12px;opacity:.7;display:block}
.tpl-album .al-figs b{font-family:'Bungee',sans-serif;font-weight:400;font-size:clamp(17px,1.8vw,24px);font-variant-numeric:tabular-nums}
.tpl-album .al-run{height:22px;border-radius:999px;background:rgba(255,255,255,.1);overflow:hidden;position:relative}
.tpl-album .al-run i{display:block;height:100%;width:var(--p,0%);min-width:22px;border-radius:999px;background:repeating-linear-gradient(-45deg,var(--al-y) 0 10px,#F2B705 10px 20px);transition:width 1.8s cubic-bezier(.2,.8,.2,1)}
.tpl-album .al-gold .k-btn{background:var(--al-y);color:#131B33!important;align-self:flex-start}
@media (max-width:860px){.tpl-album .al-gold{grid-template-columns:minmax(0,1fr)}.tpl-album .al-figs{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}}
.tpl-album[data-mode=light] .k-act{overflow:hidden}
.tpl-album[data-mode=light] .k-act:nth-child(1){background:var(--k-acc);color:var(--k-acc-ink)}
.tpl-album[data-mode=light] .k-act:nth-child(1) p{color:inherit;opacity:.85}
.tpl-album[data-mode=light] .k-act:nth-child(2){background:var(--al-y)}
.tpl-album[data-mode=light] .k-act:nth-child(2) p{color:#3E3A20}
.tpl-album[data-mode=light] .k-act:hover{transform:rotate(-1.5deg) translateY(-6px)}
.tpl-album[data-mode=light] .k-act .k-num{position:absolute;right:-6px;bottom:-26px;font-family:'Bungee',sans-serif;font-size:120px;line-height:1;opacity:.12}
.tpl-album[data-mode=light] .k-help{background:var(--k-acc);background-image:radial-gradient(rgba(255,255,255,.14) 2px,transparent 2.5px);background-size:22px 22px}
.tpl-album[data-mode=light] .k-help .k-btn{box-shadow:0 5px 0 rgba(0,0,0,.25)}
.tpl-album[data-mode=light] .k-revs figure:nth-child(2){rotate:1.2deg}
.tpl-album[data-mode=light] .k-revs figure:nth-child(1){rotate:-1deg}
.tpl-album[data-mode=dark] .al-top{border-bottom:1px solid var(--k-line)}
.tpl-album .hx-hero{position:relative;overflow:hidden;padding-block:clamp(30px,6vw,80px)}
.tpl-album .hx-hero::before{content:"";position:absolute;inset:-20%;background:radial-gradient(40% 50% at 70% 40%,color-mix(in oklab,var(--k-acc) 45%,transparent),transparent 70%),radial-gradient(30% 40% at 20% 80%,rgba(120,80,255,.25),transparent 70%),radial-gradient(25% 35% at 90% 90%,rgba(255,80,180,.18),transparent 70%);filter:blur(10px);pointer-events:none}
.tpl-album .hx-in{position:relative;display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:30px;align-items:center}
.tpl-album .hx-k{display:inline-flex;align-items:center;gap:10px;font-size:12px;font-weight:700;letter-spacing:.24em;text-transform:uppercase;color:var(--k-soft)}
.tpl-album .hx-k i{width:28px;height:2px;background:linear-gradient(90deg,#ff6ec4,#7873f5,#4ade80,#facc15)}
.tpl-album .hx-h1{font-family:var(--k-fd);font-weight:800;font-size:clamp(54px,8vw,124px);line-height:.88;letter-spacing:-.05em;margin-top:20px;font-variation-settings:'wdth' 78}
.tpl-album .hx-h1 em{font-style:normal;background:linear-gradient(100deg,#ff9bd5,#a59bff 25%,#7af0c0 50%,#ffe27a 75%,#ff9bd5);-webkit-background-clip:text;background-clip:text;color:transparent;background-size:200% 100%;animation:hxText 8s linear infinite}
@keyframes hxText{to{background-position:-200% 0}}
.tpl-album .hx-lede{margin-top:22px;font-size:clamp(17px,1.5vw,20px);line-height:1.6;color:var(--k-soft);max-width:30em}
.tpl-album .hx-cta{display:flex;gap:12px;flex-wrap:wrap;margin-top:28px;align-items:center}
.tpl-album .hx-btn{display:inline-flex;align-items:center;gap:10px;min-height:54px;padding:0 26px;border-radius:999px;text-decoration:none;font-weight:800;background:#fff;color:#07070C!important}
.tpl-album .hx-btn svg{width:18px}
.tpl-album .hx-nav{display:flex;gap:8px}
.tpl-album .hx-nav button{width:54px;height:54px;border-radius:50%;border:0;background:var(--k-tint);color:var(--k-ink);cursor:pointer;display:grid;place-items:center;box-shadow:inset 0 0 0 1px var(--k-line)}
.tpl-album .hx-nav svg{width:20px}
.tpl-album .hx-stage{perspective:1100px;display:grid;place-items:center;min-height:clamp(480px,46vw,620px)}
.tpl-album .hx-stage .hc{width:min(360px,80vw)}
.tpl-album .hc{--f1:#ff6ec4;--f2:#7873f5;--f3:#4ade80;--f4:#facc15;--edge:#B9B6D6;display:block;border:0;padding:0;background:none;cursor:pointer;text-align:left;color:#F3F1FF;transform-style:preserve-3d;transform:rotateX(var(--rx,0deg)) rotateY(var(--ry,0deg));transition:transform .5s cubic-bezier(.2,.8,.2,1)}
.tpl-album .hc.live{transition:transform .08s linear}
.tpl-album .hc-in{position:relative;display:flex;flex-direction:column;gap:10px;padding:12px;border-radius:18px;overflow:hidden;background:linear-gradient(160deg,#1C1B29,#0E0E16);box-shadow:inset 0 0 0 2px var(--edge),0 30px 60px -24px rgba(0,0,0,.9),0 0 0 1px rgba(255,255,255,.04)}
.tpl-album .hc-top{display:flex;justify-content:space-between;font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#CFCBE8;position:relative;z-index:2}
.tpl-album .hc-ph{position:relative;display:block;aspect-ratio:1/1;border-radius:10px;overflow:hidden;box-shadow:inset 0 0 0 1px rgba(255,255,255,.2)}
.tpl-album .hc-new{position:absolute;top:8px;right:8px;font-style:normal;font-size:10px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;padding:4px 8px;border-radius:6px;background:#fff;color:#07070C}
.tpl-album .hc-n{font-family:'Bricolage Grotesque',sans-serif;font-weight:800;font-size:clamp(22px,2.2vw,30px);letter-spacing:-.03em;line-height:1;position:relative;z-index:2}
.tpl-album .hc-st{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;font-size:13px;font-weight:700;position:relative;z-index:2}
.tpl-album .hc-st span{padding:7px 8px;border-radius:8px;background:rgba(255,255,255,.06);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tpl-album .hc-st small{display:block;font-size:10px;font-weight:600;color:#9C98B8;letter-spacing:.04em}
.tpl-album .hc-foil{position:absolute;inset:0;pointer-events:none;mix-blend-mode:color-dodge;opacity:calc(.28 + var(--o,0) * .5);background:repeating-linear-gradient(115deg,var(--f1) 0%,var(--f2) 7%,var(--f3) 14%,var(--f4) 21%,var(--f1) 28%),radial-gradient(rgba(255,255,255,.55) 1px,transparent 1.6px) 0 0/7px 7px;background-size:400% 400%,7px 7px;background-position:var(--mx,50%) var(--my,50%),0 0;filter:brightness(.7) contrast(1.6) saturate(1.2);z-index:1}
.tpl-album .hc-glare{position:absolute;inset:0;pointer-events:none;mix-blend-mode:overlay;background:radial-gradient(circle at var(--mx,50%) var(--my,50%),rgba(255,255,255,.75),rgba(255,255,255,.1) 30%,transparent 60%);opacity:calc(.25 + var(--o,0) * .75);z-index:3}
.tpl-album .hc.t-gold{--f1:#FFE7A0;--f2:#E0A93B;--f3:#FFF6D0;--f4:#B57D16;--edge:#E8C46A}
.tpl-album .hc.t-gold .hc-in{background:linear-gradient(160deg,#2A2213,#120E06)}
.tpl-album .hc.t-baby{--f1:#A7E8FF;--f2:#C9B8FF;--f3:#FFFFFF;--f4:#8FD3FF;--edge:#B7DDF2}
.tpl-album .hc.t-young{--f1:#7AF0C0;--f2:#5CC8FF;--f3:#D9FF8A;--f4:#7AF0C0;--edge:#8BE8C7}
.tpl-album .hc:focus-visible{outline-offset:6px}
.tpl-album .hx-dots{display:flex;gap:8px;justify-content:center;margin-top:18px}
.tpl-album .hx-dots i{width:8px;height:8px;border-radius:50%;background:var(--k-line)}
.tpl-album .hx-dots i.on{background:#fff;width:24px;border-radius:8px;transition:width .3s}
@media (max-width:860px){.tpl-album .hx-in{grid-template-columns:minmax(0,1fr)}.tpl-album .hx-stage{min-height:auto;padding-block:10px}}
.tpl-album .hx-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:clamp(14px,2vw,26px);perspective:1200px}
.tpl-album .hx-grid .hc-n{font-size:clamp(18px,1.7vw,24px)}
@media (max-width:1100px){.tpl-album .hx-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}
@media (max-width:700px){.tpl-album .hx-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.tpl-album .hx-grid .hc-st{grid-template-columns:minmax(0,1fr)}.tpl-album .hx-grid .hc-st span:nth-child(n+2){display:none}.tpl-album .hx-grid .hc-in{padding:8px;gap:7px}}
.tpl-album .hx-legend{display:flex;flex-wrap:wrap;gap:8px;margin-top:-6px;margin-bottom:22px}
.tpl-album .hx-legend span{display:inline-flex;align-items:center;gap:8px;font-size:13px;font-weight:700;color:var(--k-soft);padding:7px 12px;border-radius:999px;background:var(--k-tint)}
.tpl-album .hx-legend i{width:14px;height:14px;border-radius:4px}
.tpl-album[data-mode=dark] .k-chip[aria-pressed="true"]{background:#fff;color:#07070C}
.tpl-album[data-mode=dark] .k-more{background:#fff;color:#07070C}
.tpl-album .hx-leg{display:grid;grid-template-columns:minmax(0,.8fr) minmax(0,1.2fr);gap:clamp(24px,5vw,70px);align-items:center;padding:clamp(24px,4vw,56px);border-radius:32px;background:radial-gradient(80% 100% at 20% 30%,rgba(232,196,106,.18),transparent 60%),#0E0D14;box-shadow:inset 0 0 0 1px rgba(232,196,106,.25);perspective:1100px}
.tpl-album .hx-leg .hc{width:min(330px,100%);margin:auto}
.tpl-album .hx-leg-t{display:flex;flex-direction:column;gap:16px}
.tpl-album .hx-leg-t .k-eb{color:#E8C46A}
.tpl-album .hx-leg-t h2{font-family:var(--k-fd);font-weight:800;font-size:clamp(40px,5.4vw,80px);line-height:.92;letter-spacing:-.045em}
.tpl-album .hx-moves{display:flex;flex-direction:column;border-top:1px solid var(--k-line)}
.tpl-album .hx-moves div{display:flex;justify-content:space-between;gap:16px;padding:14px 0;border-bottom:1px solid var(--k-line);font-size:15px;color:var(--k-soft)}
.tpl-album .hx-moves b{color:var(--k-ink);font-family:var(--k-fd);font-size:20px;font-variant-numeric:tabular-nums}
.tpl-album .hx-run{height:12px;border-radius:999px;background:var(--k-tint);overflow:hidden}
.tpl-album .hx-run i{display:block;height:100%;width:var(--p,0%);min-width:12px;border-radius:999px;background:linear-gradient(90deg,#B57D16,#FFE7A0,#E0A93B);transition:width 1.8s cubic-bezier(.2,.8,.2,1)}
.tpl-album .hx-leg .k-btn{background:#E8C46A;color:#1A1405!important;align-self:flex-start}
@media (max-width:860px){.tpl-album .hx-leg{grid-template-columns:minmax(0,1fr)}}
.tpl-album[data-mode=dark] .k-act{background:linear-gradient(160deg,#16151F,#0C0C12);overflow:hidden}
.tpl-album[data-mode=dark] .k-act::before{content:"";position:absolute;inset:0;border-radius:inherit;padding:1.5px;background:linear-gradient(120deg,#ff6ec4,#7873f5,#4ade80,#facc15);-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude;opacity:.5;transition:opacity .4s}
.tpl-album[data-mode=dark] .k-act:hover::before{opacity:1}
.tpl-album[data-mode=dark] .k-act:hover{transform:translateY(-6px)}
.tpl-album[data-mode=dark] .k-help{background:linear-gradient(120deg,#2b1a4a,#0f2c3a 40%,#3a2a0c 80%);color:#fff}
.tpl-album[data-mode=dark] .k-help::before{content:"";position:absolute;inset:0;background:repeating-linear-gradient(115deg,rgba(255,110,196,.25) 0,rgba(120,115,245,.25) 6%,rgba(74,222,128,.22) 12%,rgba(250,204,21,.22) 18%,rgba(255,110,196,.25) 24%);background-size:300% 300%;mix-blend-mode:screen;animation:hxFoil 14s linear infinite}
@keyframes hxFoil{to{background-position:300% 0}}
.tpl-album[data-mode=dark] .k-help .k-btn{background:#fff;color:#07070C!important}
.tpl-album[data-mode=dark] .sh-ph,.tpl-album[data-mode=dark] .k-pr .ph{background:#1A1925}
.tpl-album .al-ph{position:relative}
.tpl-album .al-pack[disabled]{cursor:default}
.tpl-album .al-camp-card{cursor:default}
`;

const num = (a: TplAnimal) => String(a.i + 1).padStart(3, '0');
const SERIES: Record<string, [string, string]> = {
  Cachorro: ['Primeros pasos', 't-baby'],
  Gatito: ['Primeros pasos', 't-baby'],
  Joven: ['Serie joven', 't-young'],
  Adulto: ['Serie adulta', 't-adult'],
  Senior: ['Serie sabios', 't-gold'],
};
const series = (a: TplAnimal) => SERIES[a.stage] ?? ['Serie adulta', 't-adult'];
const ROT = [-2.2, 1.6, -0.8, 2.4, -1.4];

const sticker = (a: TplAnimal, i: number, cls = '') =>
  `<a class="al-st ${cls}" href="${a.href}" data-id="${a.id}" style="--r:${ROT[i % 5]}deg"><span class="al-no">${num(a)}</span><span class="al-ph">${deco(a, { dx: 6, dy: 14, s: 1.08 })}</span><span class="al-nm"><b>${a.name}</b><small>${a.spLabel}${a.age ? ` · ${a.age}` : ''}</small></span>${a.isNew ? '<span class="al-new">Nueva</span>' : ''}</a>`;

const holoFrame = (
  cls: string,
  top: [string, string],
  ph: string,
  name: string,
  stats: Array<[string, string]>,
  href?: string,
) => {
  const inner = `<span class="hc-in"><span class="hc-top"><span>${top[0]}</span><span>${top[1]}</span></span><span class="hc-ph">${ph}</span><span class="hc-n">${name}</span><span class="hc-st">${stats.map(([k, v]) => `<span><small>${k}</small>${v || '—'}</span>`).join('')}</span><span class="hc-foil"></span><span class="hc-glare"></span></span>`;
  return href
    ? `<a class="hc ${cls}" href="${href}">${inner}</a>`
    : `<div class="hc ${cls}">${inner}</div>`;
};

const holo = (a: TplAnimal, cls = '') => {
  const [s, t] = series(a);
  return holoFrame(
    `${t} ${cls}`,
    [`Nº ${num(a)}`, s],
    `${deco(a, { dx: 6, dy: 14, s: 1.08 })}${a.isNew ? '<i class="hc-new">Nuevo</i>' : ''}`,
    a.name,
    [
      ['Edad', a.age],
      ['Tamaño', a.sizeLabel],
      ['Refugio', a.days ? `${a.days} días` : ''],
    ],
    a.href,
  );
};

const days = (n: number) => `${n} ${n === 1 ? 'día' : 'días'}`;

/** Lámina especial de la campaña: su arte es la portada de la organización (nunca un animal). */
const campSticker = (m: TplModel) =>
  `<div class="al-st al-camp-card" style="--r:-2deg"><span class="al-no">★</span><span class="al-ph">${campaignArt(m)}</span><span class="al-nm"><b>${m.CAMPAIGN.title}</b><small>Lámina especial</small></span></div>`;

const seenKey = (m: TplModel) => `af-album-seen:${m.slug}`;

export const album = premiumDesign({
  id: 'album',
  catId: 'al-cat',
  modes: { light: 'Láminas', dark: 'Holográfica' },
  fonts:
    'family=Bricolage+Grotesque:opsz,wdth,wght@12..96,75..100,400..800&family=Bungee&family=Figtree:wght@400;500;600;700;800',
  css: CSS,
  html({ m, P, mode }) {
    const { ORG, ANIMALS, CAMPAIGN } = m;
    const n = ANIMALS.length;
    const year = new Date().getFullYear();
    const top = `<header class="w al-top"><a class="al-logo" href="#al-cat"><i>${logoMark(m)}</i>${ORG.short}</a><nav class="al-nav" aria-label="Secciones"><a href="#al-cat">Animales</a><a href="#al-camp">Campaña</a><a href="#al-ldg">Transparencia</a></nav>${P.modeBtn()}</header>`;
    const feat = ANIMALS.slice(0, 4);
    const tail = `${P.needs()}${P.prods(P.hd('Tienda solidaria', 'Productos'), mode === 'dark' ? '#1A1925' : undefined)}${P.help()}${P.about()}${P.revs()}<div id="al-ldg">${P.ledger()}</div>${P.contact()}${P.foot()}`;
    const acts = P.acts(
      P.hd('Cómo participar', mode === 'dark' ? 'Elige tu jugada' : 'Tres maneras de ayudar'),
      (t, d, i, h) =>
        `<a class="k-act" href="${h}"><b>${t}</b><p>${d}</p><span class="k-go">${pic.arrow}</span>${mode === 'light' ? `<span class="k-num" aria-hidden="true">0${i + 1}</span>` : ''}</a>`,
    );
    const lede = ORG.lede || availLine(m);
    const facts = (cls: string) =>
      `<div class="${cls}"><div><span>Recaudado</span><b id="al-raised">${fmt(CAMPAIGN.raised)}</b></div><div><span>Meta</span><b>${fmt(CAMPAIGN.goal)}</b></div>`;
    if (mode === 'light') {
      const title =
        n > 1
          ? `Conócelos <em>a los ${m.COUNTS.total}</em>`
          : n === 1
            ? `Conoce <em>a ${ANIMALS[0].name}</em>`
            : `Pronto, <em>nuevas láminas</em>`;
      const k = Math.min(5, n);
      return `${top}${P.tbar()}
      <section class="w al-hero"><div><span class="al-ed"><b>${year}</b>Álbum${ORG.city ? ` · ${ORG.city}` : ''}</span>
        <h1 class="al-h1">${title}</h1>
        <p class="al-lede">${lede}${n ? ` Abre un sobre, conócelos uno por uno y llévate a uno para siempre.` : ''}</p>
        ${n ? `<div class="al-cta"><button type="button" class="al-open" id="al-open">${pic.paw}<span>Abrir un sobre</span></button><div class="al-prog"><span class="al-ring" id="al-ring"><b id="al-ringn">0</b></span><span>Conociste <b id="al-seen">0</b> de ${n}</span></div></div>` : ''}</div>
        <div class="al-stage"><div class="al-fan" id="al-fan">${feat
          .slice(0, 3)
          .map((a, i) => sticker(a, i))
          .join('')}</div>
          <button type="button" class="al-pack" id="al-pack" ${n ? `aria-label="Abrir un sobre con ${k} ${k === 1 ? 'lámina' : 'láminas'}"` : 'disabled aria-label="Sobre de láminas: muy pronto"'}><span class="lid"></span><span class="bd"></span><span class="sh"></span><span class="lb"><span>${n ? `Sobre de ${k} ${k === 1 ? 'lámina' : 'láminas'}` : 'Próxima edición'}</span><i>${ORG.initials}<br>${year}</i><b>${n ? '¡Tócalo!' : 'Muy pronto'}</b></span></button></div>
      </section>
      ${acts}
      <section class="w k-sec" data-sec="animales" id="al-cat"><div class="al-book">
        <div class="al-bh"><div><p class="k-eb">Páginas del álbum</p><h2 class="k-h2">Mascotas en adopción</h2></div>${n ? `<div class="al-prog"><span class="al-ring" id="al-ring2"><b id="al-ringn2">0</b></span><span>Llevas <b id="al-seen2">0</b> de ${n} láminas vistas</span></div>` : ''}</div>
        ${P.catControls('al-f')}<div class="al-grid" id="al-grid"></div><button type="button" class="k-more" id="al-more" hidden></button></div></section>
      ${P.campaign(
        () =>
          `<section class="w k-sec" data-sec="campana" id="al-camp"><div class="al-gold">${campSticker(m)}<div class="al-gold-t"><p class="k-eb">Lámina especial · Campaña activa</p><h2>${CAMPAIGN.title}</h2>${CAMPAIGN.description ? `<p style="opacity:.85;line-height:1.55">${CAMPAIGN.description}</p>` : ''}<div class="al-run" data-w="${Math.max(2, CAMPAIGN.pct)}"><i></i></div>${facts('al-figs')}<div><span>Cierra</span><b>${CAMPAIGN.deadlineShort || '—'}</b></div></div><p style="opacity:.75">Van ${CAMPAIGN.pct}% de la meta · faltan ${days(CAMPAIGN.daysLeft)}${CAMPAIGN.category ? ` · ${CAMPAIGN.category}` : ''}</p><a class="k-btn" href="${CAMPAIGN.href}" data-magnet>Ver campaña y aportar ${pic.arrow}</a>${P.more()}</div></div></section>`,
        P.hd('Lámina especial', 'Sin campaña por ahora'),
      )}
      ${tail}`;
    }
    const stage = feat.length
      ? holo(feat[0], 'big')
      : holoFrame('t-gold big', ['Edición', `${year}`], campaignArt(m), 'Muy pronto', [
          ['Cartas', '0'],
          ['Serie', 'Nueva'],
          ['Refugio', ORG.short],
        ]);
    return `${top}${P.tbar()}
      <section class="hx-hero"><div class="w hx-in"><div><span class="hx-k"><i></i>Edición holográfica ${year}</span>
        <h1 class="hx-h1">${n > 1 ? 'Cada uno <em>brilla distinto</em>' : n === 1 ? `${ANIMALS[0].name} <em>brilla</em>` : 'Pronto <em>brillarán aquí</em>'}</h1>
        <p class="hx-lede">${lede}${n ? ' Mueve la carta y mira cómo cambia su luz. Cuando adoptas, esa luz se queda en tu casa.' : ''}</p>
        <div class="hx-cta"><a class="hx-btn" href="#al-cat">Ver la colección ${pic.arrow}</a>${feat.length > 1 ? `<div class="hx-nav"><button type="button" id="hx-prev" aria-label="Carta anterior">${pic.back}</button><button type="button" id="hx-next" aria-label="Carta siguiente">${pic.arrow}</button></div>` : ''}</div></div>
        <div><div class="hx-stage" id="hx-stage">${stage}</div>${feat.length > 1 ? `<div class="hx-dots" id="hx-dots">${feat.map((_, i) => `<i class="${i ? '' : 'on'}"></i>`).join('')}</div>` : ''}</div></div></section>
      ${acts}
      <section class="w k-sec" data-sec="animales" id="al-cat">${P.hd('La colección', 'Mascotas en adopción', '', n ? `${countPhrase(m)}. La serie de cada carta depende de su etapa de vida. Toca una carta para ver su ficha.` : '')}
        ${n ? `<div class="hx-legend"><span><i style="background:linear-gradient(135deg,#A7E8FF,#C9B8FF)"></i>Primeros pasos</span><span><i style="background:linear-gradient(135deg,#7AF0C0,#5CC8FF)"></i>Serie joven</span><span><i style="background:linear-gradient(135deg,#ff6ec4,#7873f5,#4ade80)"></i>Serie adulta</span><span><i style="background:linear-gradient(135deg,#FFE7A0,#B57D16)"></i>Serie sabios</span></div>` : ''}
        ${P.catControls('al-f')}<div class="hx-grid" id="al-grid"></div><button type="button" class="k-more" id="al-more" hidden></button></section>
      ${P.campaign(
        () =>
          `<section class="w k-sec" data-sec="campana" id="al-camp"><div class="hx-leg"><div>${holoFrame(
            't-gold leg',
            ['Campaña activa', 'Legendaria'],
            campaignArt(m),
            CAMPAIGN.title,
            [
              ['Avance', `${CAMPAIGN.pct}%`],
              ['Meta', fmt(CAMPAIGN.goal)],
              ['Cierra', CAMPAIGN.deadlineShort],
            ],
          )}</div><div class="hx-leg-t"><p class="k-eb">Carta legendaria · Campaña activa</p><h2>${CAMPAIGN.title}</h2>${CAMPAIGN.description ? `<p style="color:var(--k-soft);line-height:1.55">${CAMPAIGN.description}</p>` : ''}<div class="hx-run" data-w="${Math.max(2, CAMPAIGN.pct)}"><i></i></div><div class="hx-moves"><div><span>Recaudado</span><b id="al-raised">${fmt(CAMPAIGN.raised)}</b></div><div><span>Meta</span><b>${fmt(CAMPAIGN.goal)}</b></div><div><span>Avance</span><b>${CAMPAIGN.pct}%</b></div><div><span>Cierra</span><b>${CAMPAIGN.deadline ? `${CAMPAIGN.deadline} · ` : ''}faltan ${days(CAMPAIGN.daysLeft)}</b></div></div><a class="k-btn" href="${CAMPAIGN.href}" data-magnet>Ver campaña y aportar ${pic.arrow}</a>${P.more()}</div></div></section>`,
        P.hd('Carta legendaria', 'Sin campaña por ahora'),
      )}
      ${tail}`;
  },
  init(app, { m, mode, fx, cat }) {
    const { signal } = fx;
    const { ANIMALS, CAMPAIGN } = m;
    fx.fillOnView(app, '.k-bar,.al-run,.hx-run');
    fx.countUp(qs(app, '#al-raised'), CAMPAIGN.raised, fmt);
    fx.magnet(app);
    fx.reveal(app, '.k-act,.k-nd,.k-pr,.k-revs figure', { stagger: 80 });
    if (mode === 'light') initLaminas(app, m, fx, cat);
    else initHolo(app, ANIMALS, fx, cat, signal);
  },
});

function initLaminas(app: HTMLElement, m: TplModel, fx: Fx, cat: CatFn) {
  const { signal } = fx;
  const { ANIMALS } = m;
  const ids = new Set(ANIMALS.map((a) => a.id));
  const seen = stored(seenKey(m));
  const upd = () => {
    const n = [...seen].filter((id) => ids.has(id)).length;
    const v = Math.round((n / Math.max(1, ANIMALS.length)) * 100);
    (['', '2'] as const).forEach((k) => {
      const r = qs(app, '#al-ring' + k);
      if (!r) return;
      r.style.setProperty('--v', String(v));
      qs(app, '#al-ringn' + k)!.textContent = v + '%';
      qs(app, k ? '#al-seen2' : '#al-seen')!.textContent = String(n);
    });
  };
  const see = (list: string[]) => {
    list.forEach((id) => seen.add(id));
    store(seenKey(m), seen);
    upd();
  };
  let io: IntersectionObserver | null = null;
  if (typeof IntersectionObserver === 'function') {
    io = new IntersectionObserver(
      (es) => {
        const list = es
          .filter((e) => e.isIntersecting)
          .map((e) => (e.target as HTMLElement).dataset.id ?? '');
        if (!list.length) return;
        see(list);
        es.forEach((e) => e.isIntersecting && io?.unobserve(e.target));
      },
      { threshold: 0.6 },
    );
    signal.addEventListener('abort', () => io?.disconnect());
  }
  cat({
    id: 'al-f',
    grid: '#al-grid',
    more: '#al-more',
    page: 15,
    moreLabel: 'Pasar página:',
    render: (L) => L.map((a, i) => `<div class="al-slot">${sticker(a, i, 'stk')}</div>`).join(''),
    after: (host) => {
      qsa(host, '.al-st').forEach((s) => io?.observe(s));
      fx.reveal(host, '.al-slot:not(.is-in)', { stagger: 60, mod: 5, t: 0.2 });
    },
  });
  const fan = qs(app, '#al-fan');
  const pack = qs(app, '#al-pack');
  const open = qs(app, '#al-open');
  const deal = () => {
    if (!ANIMALS.length || !fan || !pack) return;
    const pool = [...ANIMALS].sort(() => Math.random() - 0.5).slice(0, Math.min(5, ANIMALS.length));
    fan.classList.remove('go');
    fan.classList.add('deal');
    fan.innerHTML = pool
      .map((a, i) => sticker(a, i).replace('style="', `style="--k:${i};`))
      .join('');
    pack.classList.remove('torn');
    void fan.offsetWidth;
    pack.classList.add('torn');
    requestAnimationFrame(() => {
      fan.classList.remove('deal');
      fan.classList.add('go');
    });
    const lb = open?.querySelector('span');
    if (lb) lb.textContent = 'Abrir otro sobre';
    see(pool.map((a) => a.id));
  };
  pack?.addEventListener('click', deal, { signal });
  open?.addEventListener('click', deal, { signal });
  upd();
}

/* Holográfica: inclinación con el cursor, vaivén solo cuando nadie la toca, y foil ligado al scroll en pantallas táctiles */
function initHolo(app: HTMLElement, ANIMALS: TplAnimal[], fx: Fx, cat: CatFn, signal: AbortSignal) {
  const tilt = (c: HTMLElement, e: PointerEvent) => {
    const r = c.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    c.style.setProperty('--ry', ((x - 0.5) * 26).toFixed(2) + 'deg');
    c.style.setProperty('--rx', ((0.5 - y) * 22).toFixed(2) + 'deg');
    c.style.setProperty('--mx', (x * 100).toFixed(1) + '%');
    c.style.setProperty('--my', (y * 100).toFixed(1) + '%');
    c.style.setProperty('--o', '1');
  };
  const rest = (c: HTMLElement) => {
    c.classList.remove('live');
    ['--rx', '--ry', '--mx', '--my', '--o'].forEach((p) => c.style.removeProperty(p));
  };
  const stage = qs(app, '#hx-stage')!;
  const feat = ANIMALS.slice(0, 4);
  let fi = 0;
  let touched = 0;
  const show = (d: number) => {
    if (!feat.length) return;
    fi = (fi + d + feat.length) % feat.length;
    stage.innerHTML = holo(feat[fi], 'big');
    qsa(app, '#hx-dots i').forEach((x, i) => x.classList.toggle('on', i === fi));
  };
  qs(app, '#hx-prev')?.addEventListener('click', () => show(-1), { signal });
  qs(app, '#hx-next')?.addEventListener('click', () => show(1), { signal });
  const card = () => qs(stage, '.hc');
  if (fx.hover && !fx.reduce) {
    stage.addEventListener(
      'pointermove',
      (e) => {
        const c = card();
        if (!c) return;
        c.classList.add('live');
        tilt(c, e);
        touched = performance.now();
      },
      { signal },
    );
    stage.addEventListener('pointerleave', () => card() && rest(card()!), { signal });
  }
  if (!fx.reduce)
    fx.onFrame((t) => {
      if (performance.now() - touched < 1600) return;
      const c = card();
      if (!c) return;
      const s = t / 1000;
      c.style.setProperty('--ry', (Math.sin(s * 0.7) * 12).toFixed(2) + 'deg');
      c.style.setProperty('--rx', (Math.cos(s * 0.5) * 6).toFixed(2) + 'deg');
      c.style.setProperty('--mx', (50 + Math.sin(s * 0.7) * 45).toFixed(1) + '%');
      c.style.setProperty('--my', (50 + Math.cos(s * 0.5) * 30).toFixed(1) + '%');
      c.style.setProperty('--o', (0.5 + Math.sin(s * 1.4) * 0.3).toFixed(2));
    }, stage);
  const grid = qs(app, '#al-grid')!;
  cat({
    id: 'al-f',
    grid: '#al-grid',
    more: '#al-more',
    page: 12,
    render: (L) => L.map((a) => holo(a)).join(''),
    after: (host) => fx.reveal(host, '.hc:not(.is-in)', { stagger: 70, mod: 4 }),
  });
  if (fx.hover && !fx.reduce) {
    let cur: HTMLElement | null = null;
    grid.addEventListener(
      'pointermove',
      (e) => {
        const c = (e.target as Element).closest<HTMLElement>('.hc');
        if (cur && cur !== c) rest(cur);
        cur = c;
        if (c) {
          c.classList.add('live');
          tilt(c, e);
        }
      },
      { signal },
    );
    grid.addEventListener(
      'pointerleave',
      () => {
        if (cur) rest(cur);
        cur = null;
      },
      { signal },
    );
    const leg = qs(app, '.hx-leg');
    const lc = leg && qs(leg, '.hc');
    if (leg && lc) {
      leg.addEventListener(
        'pointermove',
        (e) => {
          lc.classList.add('live');
          tilt(lc, e);
        },
        { signal },
      );
      leg.addEventListener('pointerleave', () => rest(lc), { signal });
    }
  } else if (!fx.reduce) {
    fx.onFrame(() => {
      const y = scrollY / 6;
      grid.style.setProperty('--mx', (50 + Math.sin(y / 40) * 50).toFixed(1) + '%');
      grid.style.setProperty('--my', (50 + Math.cos(y / 55) * 40).toFixed(1) + '%');
      grid.style.setProperty('--o', '.6');
    }, grid);
  }
}
