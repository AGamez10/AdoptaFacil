import { ledgerBlock } from '../engine/ledger';
import { COPY, EMPTY, type TplAnimal } from '../engine/model';
import {
  availLine,
  campaignArt,
  countPhrase,
  fmt,
  ic,
  logoMark,
  mapEmbed,
  mapLink,
  portrait,
  productArt,
  qs,
  qsa,
  sinceLabel,
  socialLink,
  stars,
} from '../engine/runtime';
import { unesc } from '../engine/safe';
import type { TemplateDesign } from '../engine/types';

const CSS = `
.tpl-constelacion{--bg:#05070F;--ink:#EEF0F7;--soft:#8D93A8;--star:#FFDDB0;--line:rgba(238,240,247,.12);--card:rgba(255,255,255,.035);font-family:'Geist',system-ui,sans-serif;color:var(--ink);background:var(--bg);overflow-x:clip}
.tpl-constelacion:has(#app.tpl-constelacion){background:#05070F}
.tpl-constelacion a{color:inherit}
.tpl-constelacion .o-serif{font-family:'Instrument Serif',Georgia,serif;font-weight:400}
.tpl-constelacion .o-eb{font-family:'Geist Mono',monospace;font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:var(--soft)}
.tpl-constelacion .o-h2{font-family:'Instrument Serif',Georgia,serif;font-weight:400;font-size:clamp(44px,6vw,92px);line-height:.95;letter-spacing:-.02em}
.tpl-constelacion .o-h2 em{font-style:italic;color:var(--star)}
.tpl-constelacion .o-sec{padding-block:clamp(80px,11vw,150px)}
.tpl-constelacion .o-sub{margin-top:18px;color:var(--soft);font-size:18px;line-height:1.6;max-width:34em}
.tpl-constelacion .o-btn{display:inline-flex;align-items:center;gap:12px;min-height:54px;padding:0 26px;border-radius:999px;background:var(--ink);color:#05070F!important;text-decoration:none;font-weight:600;font-size:15px;border:0;cursor:pointer;transition:box-shadow .4s}
.tpl-constelacion .o-btn:hover{box-shadow:0 0 0 6px rgba(238,240,247,.12),0 0 60px rgba(255,221,176,.35)}
.tpl-constelacion .o-btn svg{width:16px}
.tpl-constelacion .o-btn.ghost{background:transparent;color:var(--ink)!important;box-shadow:inset 0 0 0 1px var(--line)}
.tpl-constelacion .o-lnk{display:inline-flex;align-items:center;gap:8px;background:none;border:0;padding:0;color:var(--star);font:inherit;font-size:15px;text-decoration:none;cursor:pointer}
.tpl-constelacion .o-lnk svg{width:15px}
.tpl-constelacion .o-empty{margin-top:30px;padding:32px;border-radius:24px;border:1px dashed var(--line);color:var(--soft);font-size:17px;line-height:1.6;max-width:46em}
.tpl-constelacion .o-nav{position:absolute;left:0;right:0;top:0;z-index:5;display:flex;align-items:center;gap:26px;padding:22px max(16px,4vw)}
.tpl-constelacion .o-nav .nm{display:flex;align-items:center;gap:10px;font-weight:600;text-decoration:none;margin-right:auto}
.tpl-constelacion .o-nav .nm i{width:30px;height:30px;border-radius:50%;display:grid;place-items:center;background:radial-gradient(circle at 35% 30%,#fff,var(--star) 45%,var(--brand));color:#05070F}
.tpl-constelacion .o-nav .nm i svg{width:15px}
.tpl-constelacion .o-nav a.l,.tpl-constelacion .o-nav button.l{font-size:14px;color:var(--soft);text-decoration:none;background:none;border:0;cursor:pointer;padding:0}
.tpl-constelacion .o-nav a.l:hover,.tpl-constelacion .o-nav button.l:hover{color:var(--ink)}
@media (max-width:820px){.tpl-constelacion .o-nav .l{display:none}}
.tpl-constelacion .o-hero{position:relative;height:calc(100svh - var(--bar));min-height:640px;overflow:hidden;background:radial-gradient(80% 70% at 70% 45%,color-mix(in srgb,var(--brand) 22%,transparent),transparent 70%),#05070F}
.tpl-constelacion .o-cv{position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:pan-y;cursor:grab}
.tpl-constelacion .o-cv:active{cursor:grabbing}
.tpl-constelacion .o-copy{position:absolute;left:max(16px,6vw);bottom:clamp(110px,16vh,170px);z-index:3;max-width:min(560px,90vw);pointer-events:none}
.tpl-constelacion .o-copy > *{pointer-events:auto}
.tpl-constelacion .o-copy h1{font-family:'Instrument Serif',Georgia,serif;font-weight:400;font-size:clamp(52px,7.4vw,124px);line-height:.9;letter-spacing:-.025em;margin-top:18px}
.tpl-constelacion .o-copy h1 em{font-style:italic;color:var(--star)}
.tpl-constelacion .o-copy p.l{margin-top:22px;font-size:18px;line-height:1.55;color:#B9BED0;max-width:26em}
.tpl-constelacion .o-kpi{position:absolute;right:max(16px,5vw);top:96px;z-index:3;text-align:right}
.tpl-constelacion .o-kpi b{display:block;font-family:'Instrument Serif',serif;font-weight:400;font-size:clamp(64px,8vw,120px);line-height:.85}
.tpl-constelacion .o-kpi span{font-family:'Geist Mono',monospace;font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:var(--soft)}
.tpl-constelacion .o-chips{position:absolute;left:0;right:0;bottom:34px;z-index:3;display:flex;justify-content:center;flex-wrap:wrap;gap:8px;padding-inline:16px}
.tpl-constelacion .o-chips button{min-height:42px;padding:0 16px;border-radius:999px;border:0;background:rgba(255,255,255,.06);box-shadow:inset 0 0 0 1px var(--line);backdrop-filter:blur(10px);color:var(--ink);font-size:14px;cursor:pointer;transition:background .3s,box-shadow .3s}
.tpl-constelacion .o-chips button b{color:var(--soft);font-weight:500;margin-left:6px}
.tpl-constelacion .o-chips button[aria-pressed="true"]{background:var(--ink);color:#05070F}
.tpl-constelacion .o-chips button[aria-pressed="true"] b{color:#05070F;opacity:.6}
.tpl-constelacion .o-hint{position:absolute;right:max(16px,5vw);bottom:96px;z-index:3;font-family:'Geist Mono',monospace;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--soft);display:flex;align-items:center;gap:10px}
.tpl-constelacion .o-hint b{color:var(--ink);font-weight:500}
.tpl-constelacion .o-hero::after{content:"";position:absolute;inset:auto 0 0;height:60%;background:linear-gradient(0deg,#05070F 18%,transparent);pointer-events:none;z-index:2}
@media (min-width:821px){.tpl-constelacion .o-hero::after{width:55%;height:100%;inset:0 auto 0 0;background:linear-gradient(90deg,rgba(5,7,15,.85),transparent)}}
.tpl-constelacion .o-hint i{width:28px;height:28px;border-radius:50%;box-shadow:inset 0 0 0 1px var(--line);display:grid;place-items:center;animation:oSpin 6s linear infinite}
.tpl-constelacion .o-hint i::after{content:"";width:5px;height:5px;border-radius:50%;background:var(--star);transform:translateX(11px)}
@keyframes oSpin{to{transform:rotate(360deg)}}
.tpl-constelacion .o-tip{position:absolute;z-index:4;pointer-events:none;transform:translate(-50%,calc(-100% - 22px));padding:10px 14px;border-radius:14px;background:rgba(10,12,22,.82);backdrop-filter:blur(12px);box-shadow:inset 0 0 0 1px var(--line);white-space:nowrap;opacity:0;transition:opacity .2s}
.tpl-constelacion .o-tip.on{opacity:1}
.tpl-constelacion .o-tip b{display:block;font-family:'Instrument Serif',serif;font-weight:400;font-size:24px;line-height:1}
.tpl-constelacion .o-tip span{font-size:12px;color:var(--soft)}
.tpl-constelacion .o-fb{position:absolute;inset:0;display:none;place-items:center}
.tpl-constelacion .o-hero.no-gl .o-fb{display:grid}
.tpl-constelacion .o-hero.no-gl .o-cv{display:none}
.tpl-constelacion .o-fb .ring{position:relative;width:min(560px,80vw);aspect-ratio:1/1;border-radius:50%;box-shadow:inset 0 0 0 1px var(--line)}
.tpl-constelacion .o-fb .ring span{position:absolute;width:54px;height:54px;border-radius:50%;overflow:hidden;left:50%;top:50%;margin:-27px;box-shadow:0 0 0 2px rgba(255,221,176,.5)}
@media (max-width:820px){.tpl-constelacion .o-copy{bottom:150px}.tpl-constelacion .o-copy h1{font-size:clamp(44px,11.5vw,62px)}.tpl-constelacion .o-copy p.l{font-size:16px}.tpl-constelacion .o-hint{right:auto;left:16px;bottom:116px}.tpl-constelacion .o-hint i{display:none}.tpl-constelacion .o-chips{bottom:18px;justify-content:flex-start;flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none}.tpl-constelacion .o-chips button{flex:none}}
.tpl-constelacion .o-tb{border-block:1px solid var(--line);background:rgba(255,255,255,.02)}
.tpl-constelacion .o-tb .w{display:flex;flex-wrap:wrap;align-items:center;gap:10px 26px;padding-block:16px;font-size:14px;color:var(--soft)}
.tpl-constelacion .o-tb svg{width:18px;color:var(--star)}
.tpl-constelacion .o-tb b{color:var(--ink);font-weight:500}
.tpl-constelacion .o-tb .lv{display:inline-flex;gap:5px}
.tpl-constelacion .o-tb .lv i{width:9px;height:9px;border-radius:50%;box-shadow:inset 0 0 0 1px var(--soft)}
.tpl-constelacion .o-tb .lv i.on{background:var(--star);box-shadow:0 0 12px var(--star)}
.tpl-constelacion .o-tb .ac{margin-left:auto}
.tpl-constelacion .o-acts{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;margin-top:40px}
.tpl-constelacion .o-act{position:relative;overflow:hidden;border-radius:28px;padding:34px;min-height:260px;display:flex;flex-direction:column;justify-content:flex-end;gap:8px;text-decoration:none;background:var(--card);box-shadow:inset 0 0 0 1px var(--line);isolation:isolate;transition:transform .6s cubic-bezier(.2,.8,.2,1)}
.tpl-constelacion .o-act:hover{transform:translateY(-6px)}
.tpl-constelacion .o-act::before{content:"";position:absolute;width:300px;height:300px;right:-90px;top:-110px;border-radius:50%;z-index:-1;border:1px solid var(--line);box-shadow:0 0 0 40px rgba(255,255,255,.015),0 0 0 80px rgba(255,255,255,.012)}
.tpl-constelacion .o-act::after{content:"";position:absolute;width:14px;height:14px;border-radius:50%;right:126px;top:22px;background:var(--star);box-shadow:0 0 24px var(--star);z-index:-1;transition:transform .8s cubic-bezier(.2,.8,.2,1)}
.tpl-constelacion .o-act:hover::after{transform:translate(60px,60px)}
.tpl-constelacion .o-act:nth-child(1){background:linear-gradient(160deg,color-mix(in srgb,var(--brand) 55%,transparent),rgba(255,255,255,.03) 70%)}
.tpl-constelacion .o-act b{font-family:'Instrument Serif',serif;font-weight:400;font-size:clamp(44px,4.4vw,66px);line-height:1}
.tpl-constelacion .o-act p{color:#B9BED0;line-height:1.5}
.tpl-constelacion .o-act .go{position:absolute;left:34px;top:30px;font-family:'Geist Mono',monospace;font-size:12px;color:var(--soft);letter-spacing:.14em}
.tpl-constelacion .o-note{margin-top:18px;color:var(--soft);font-size:14px}
@media (max-width:860px){.tpl-constelacion .o-acts{grid-template-columns:minmax(0,1fr)}.tpl-constelacion .o-act{min-height:190px}}
.tpl-constelacion .o-cat .hd{display:flex;justify-content:space-between;align-items:flex-end;gap:20px;flex-wrap:wrap}
.tpl-constelacion .o-cat .f{display:flex;flex-wrap:wrap;gap:8px;margin-top:30px}
.tpl-constelacion .o-cat .f button{min-height:40px;padding:0 16px;border-radius:999px;border:0;background:transparent;box-shadow:inset 0 0 0 1px var(--line);color:var(--ink);cursor:pointer;font-size:14px}
.tpl-constelacion .o-cat .f button[aria-pressed="true"]{background:var(--ink);color:#05070F}
.tpl-constelacion .o-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:28px 18px;margin-top:40px}
.tpl-constelacion .o-a{display:flex;flex-direction:column;align-items:center;gap:10px;background:none;border:0;padding:0;color:var(--ink);cursor:pointer;text-align:center}
.tpl-constelacion .o-a .ph{width:100%;aspect-ratio:1/1;border-radius:50%;overflow:hidden;box-shadow:0 0 0 1px var(--line);transition:box-shadow .5s,transform .6s cubic-bezier(.2,.8,.2,1)}
.tpl-constelacion .o-a:hover .ph{transform:scale(1.04);box-shadow:0 0 0 2px var(--star),0 0 40px rgba(255,221,176,.35)}
.tpl-constelacion .o-a b{font-family:'Instrument Serif',serif;font-weight:400;font-size:24px;line-height:1}
.tpl-constelacion .o-a span{font-size:13px;color:var(--soft)}
.tpl-constelacion .o-a .nw{font-family:'Geist Mono',monospace;font-size:10px;letter-spacing:.14em;color:var(--star)}
.tpl-constelacion .o-more{display:flex;justify-content:center;margin-top:44px}
.tpl-constelacion .o-camp{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.05fr);gap:clamp(30px,5vw,80px);align-items:center}
.tpl-constelacion .o-orb{position:relative;width:min(520px,100%);aspect-ratio:1/1;margin-inline:auto}
.tpl-constelacion .o-orb .ph{position:absolute;inset:16%;border-radius:50%;overflow:hidden;box-shadow:0 0 120px color-mix(in srgb,var(--brand) 60%,transparent)}
.tpl-constelacion .o-orb svg.rg{position:absolute;inset:0;width:100%;height:100%;transform:rotate(-90deg);overflow:visible}
.tpl-constelacion .o-orb .pc{position:absolute;right:2%;bottom:6%;padding:12px 16px;border-radius:18px;background:rgba(10,12,22,.8);backdrop-filter:blur(10px);box-shadow:inset 0 0 0 1px var(--line)}
.tpl-constelacion .o-orb .pc b{font-family:'Instrument Serif',serif;font-weight:400;font-size:40px;line-height:1}
.tpl-constelacion .o-orb .pc span{display:block;font-size:12px;color:var(--soft)}
.tpl-constelacion .o-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:0;margin:34px 0;border-block:1px solid var(--line)}
.tpl-constelacion .o-stats div{padding:20px 0}
.tpl-constelacion .o-stats div + div{padding-left:22px;border-left:1px solid var(--line)}
.tpl-constelacion .o-stats b{display:block;font-family:'Instrument Serif',serif;font-weight:400;font-size:clamp(28px,3vw,42px)}
.tpl-constelacion .o-stats span{font-size:13px;color:var(--soft)}
@media (max-width:900px){.tpl-constelacion .o-camp{grid-template-columns:minmax(0,1fr)}}
.tpl-constelacion .o-needs{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:20px;margin-top:50px}
.tpl-constelacion .o-pl{display:flex;flex-direction:column;align-items:center;text-align:center;gap:8px}
.tpl-constelacion .o-pl .sp{position:relative;width:min(190px,100%);aspect-ratio:1/1;border-radius:50%;overflow:hidden;background:radial-gradient(circle at 32% 28%,rgba(255,255,255,.16),rgba(255,255,255,.02) 60%);box-shadow:inset 0 0 0 1px var(--line),inset -20px -30px 60px rgba(0,0,0,.5);margin-bottom:12px}
.tpl-constelacion .o-pl .lq{position:absolute;left:0;right:0;bottom:0;height:0;background:linear-gradient(180deg,color-mix(in srgb,var(--brand) 60%,#fff),var(--brand) 12%,color-mix(in srgb,var(--brand) 70%,#000));box-shadow:0 -1px 0 rgba(255,255,255,.5);transition:height 2s cubic-bezier(.2,.8,.2,1)}
.tpl-constelacion .o-pl .sp em{position:absolute;inset:0;display:grid;place-items:center;font-style:normal;font-family:'Instrument Serif',serif;font-size:44px;z-index:1;text-shadow:0 2px 20px rgba(0,0,0,.5)}
.tpl-constelacion .o-pl .k{font-family:'Geist Mono',monospace;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--star)}
.tpl-constelacion .o-pl b{font-size:19px;font-weight:500}
.tpl-constelacion .o-pl p{font-size:14px;color:var(--soft)}
@media (max-width:900px){.tpl-constelacion .o-needs{grid-template-columns:repeat(2,minmax(0,1fr))}}
.tpl-constelacion .o-prods{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px;margin-top:44px}
.tpl-constelacion .o-pr{--mx:50%;--my:30%;position:relative;border-radius:26px;padding:22px;text-decoration:none;display:flex;flex-direction:column;gap:4px;background:radial-gradient(240px circle at var(--mx) var(--my),rgba(255,221,176,.12),transparent 70%),var(--card);box-shadow:inset 0 0 0 1px var(--line);transition:transform .5s cubic-bezier(.2,.8,.2,1)}
.tpl-constelacion .o-pr:hover{transform:translateY(-6px)}
.tpl-constelacion .o-pr .ph{aspect-ratio:1/1;margin-bottom:12px}
.tpl-constelacion .o-pr .ph svg{width:100%;height:100%}
.tpl-constelacion .o-pr .k{font-family:'Geist Mono',monospace;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--soft)}
.tpl-constelacion .o-pr b{font-family:'Instrument Serif',serif;font-weight:400;font-size:26px;line-height:1.05}
.tpl-constelacion .o-pr .pz{color:var(--soft)}
.tpl-constelacion .o-pr .by{margin-top:12px;align-self:flex-start;font-size:13px;font-weight:600;background:var(--ink);color:#05070F;padding:8px 16px;border-radius:999px}
@media (max-width:1000px){.tpl-constelacion .o-prods{grid-template-columns:repeat(2,minmax(0,1fr))}}
.tpl-constelacion .o-help{position:relative;text-align:center;overflow:hidden;padding-block:clamp(120px,16vw,220px)}
.tpl-constelacion .o-help .sys{opacity:.6;position:absolute;left:50%;top:50%;width:min(1100px,150vw);aspect-ratio:1/1;transform:translate(-50%,-50%);pointer-events:none}
.tpl-constelacion .o-help .sys i{position:absolute;inset:var(--in);border-radius:50%;border:1px solid var(--line);animation:oSpin var(--t) linear infinite}
.tpl-constelacion .o-help .sys i span{position:absolute;left:50%;top:-24px;width:48px;height:48px;margin-left:-24px;border-radius:50%;overflow:hidden;box-shadow:0 0 0 2px rgba(255,221,176,.4),0 0 30px rgba(255,221,176,.25);animation:oSpin var(--t) linear infinite reverse}
.tpl-constelacion .o-help .w{position:relative}
.tpl-constelacion .o-help h2{font-family:'Instrument Serif',serif;font-weight:400;font-size:clamp(50px,7.6vw,124px);line-height:.92;letter-spacing:-.02em;max-width:11em;margin-inline:auto}
.tpl-constelacion .o-help h2 em{color:var(--star)}
.tpl-constelacion .o-help p{margin:26px auto 36px;color:#B9BED0;font-size:19px;line-height:1.6;max-width:30em}
.tpl-constelacion .o-about{display:grid;grid-template-columns:minmax(0,.8fr) minmax(0,1.2fr);gap:50px;border-top:1px solid var(--line);padding-top:60px}
.tpl-constelacion .o-about .tx{font-family:'Instrument Serif',serif;font-size:clamp(24px,2.5vw,36px);line-height:1.3}
.tpl-constelacion .o-bdg{display:flex;flex-wrap:wrap;gap:8px;margin-top:26px}
.tpl-constelacion .o-bdg span{display:inline-flex;align-items:center;gap:8px;border-radius:999px;padding:9px 15px;font-size:14px;color:var(--soft);box-shadow:inset 0 0 0 1px var(--line)}
.tpl-constelacion .o-bdg span.ok{color:var(--ink)}
.tpl-constelacion .o-bdg span.ok svg{color:var(--star)}
.tpl-constelacion .o-bdg svg{width:15px}
@media (max-width:860px){.tpl-constelacion .o-about{grid-template-columns:minmax(0,1fr);gap:18px}}
.tpl-constelacion .o-hd{display:flex;justify-content:space-between;align-items:flex-end;gap:16px 30px;flex-wrap:wrap}
.tpl-constelacion .o-revs{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;margin-top:44px}
.tpl-constelacion .o-revs figure{margin:0;border-radius:26px;padding:30px;background:var(--card);box-shadow:inset 0 0 0 1px var(--line);display:flex;flex-direction:column;gap:16px}
.tpl-constelacion .o-revs .st{color:var(--star);letter-spacing:3px}
.tpl-constelacion .o-revs blockquote{margin:0;font-family:'Instrument Serif',serif;font-size:25px;line-height:1.25}
.tpl-constelacion .o-revs figcaption{font-size:13px;color:var(--soft);margin-top:auto}
@media (max-width:860px){.tpl-constelacion .o-revs{grid-template-columns:minmax(0,1fr)}}
.tpl-constelacion .o-ledger{margin-top:40px;border-radius:28px;overflow:hidden;background:var(--card);box-shadow:inset 0 0 0 1px var(--line)}
.tpl-constelacion .o-lsum{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));border-bottom:1px solid var(--line)}
.tpl-constelacion .o-lsum div{padding:26px 30px}
.tpl-constelacion .o-lsum div + div{border-left:1px solid var(--line)}
.tpl-constelacion .o-lsum span{font-family:'Geist Mono',monospace;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--soft)}
.tpl-constelacion .o-lsum b{display:block;margin-top:6px;font-family:'Instrument Serif',serif;font-weight:400;font-size:clamp(30px,3.4vw,50px)}
.tpl-constelacion .o-lsum div:last-child b{color:var(--star)}
.tpl-constelacion .o-tw{overflow-x:auto}
.tpl-constelacion .o-ledger table{width:100%;border-collapse:collapse;font-size:15px}
.tpl-constelacion .o-ledger th,.tpl-constelacion .o-ledger td{text-align:left;padding:17px 30px;border-bottom:1px solid var(--line)}
.tpl-constelacion .o-ledger td:first-child{white-space:nowrap}
.tpl-constelacion .o-ledger tr:last-child td{border-bottom:0}
.tpl-constelacion .o-ledger th{font-family:'Geist Mono',monospace;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--soft);font-weight:400}
.tpl-constelacion .o-ledger .num{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
.tpl-constelacion .o-ledger .lk{font-size:12px;padding:4px 10px;border-radius:999px;box-shadow:inset 0 0 0 1px var(--line)}
.tpl-constelacion .o-ledger .lk.in{color:var(--star)}
@media (max-width:700px){.tpl-constelacion .o-lsum{grid-template-columns:minmax(0,1fr)}.tpl-constelacion .o-lsum div + div{border-left:0;border-top:1px solid var(--line)}.tpl-constelacion .o-ledger table{min-width:600px}}
.tpl-constelacion .o-contact{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.3fr);border-radius:28px;overflow:hidden;background:var(--card);box-shadow:inset 0 0 0 1px var(--line)}
.tpl-constelacion .o-contact .info{padding:clamp(26px,4vw,52px)}
.tpl-constelacion .o-contact dl{margin:24px 0;display:grid;gap:4px}
.tpl-constelacion .o-contact dt{font-family:'Geist Mono',monospace;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--soft);margin-top:14px}
.tpl-constelacion .o-contact dd{margin:0;font-size:18px}
.tpl-constelacion .o-contact .map{min-height:380px}
@media (max-width:860px){.tpl-constelacion .o-contact{grid-template-columns:minmax(0,1fr)}.tpl-constelacion .o-contact .map{min-height:230px}}
.tpl-constelacion .o-ftr{padding-block:70px 50px;border-top:1px solid var(--line);margin-top:40px}
.tpl-constelacion .o-ftr .big{font-family:'Instrument Serif',serif;font-size:clamp(48px,9vw,150px);line-height:.9;letter-spacing:-.03em}
.tpl-constelacion .o-ftr .big em{color:var(--star)}
.tpl-constelacion .o-soc{display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap;margin-top:40px;padding-block:24px;border-block:1px solid var(--line)}
.tpl-constelacion .o-soc p{color:var(--soft);font-size:14px}
.tpl-constelacion .o-soc div{display:flex;gap:8px}
.tpl-constelacion .o-soc a{width:44px;height:44px;border-radius:50%;display:grid;place-items:center;box-shadow:inset 0 0 0 1px var(--line);transition:box-shadow .3s,color .3s}
.tpl-constelacion .o-soc a:hover{color:var(--star);box-shadow:inset 0 0 0 1px var(--star),0 0 20px rgba(255,221,176,.3)}
.tpl-constelacion .o-soc svg{width:18px}
.tpl-constelacion .o-fine{display:flex;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-top:24px;font-size:13px;color:var(--soft)}
.tpl-constelacion dialog.sheet,.tpl-constelacion .ldg{border:0;padding:0;background:transparent;width:min(980px,calc(100vw - 24px));max-width:none;color:var(--ink)}
.tpl-constelacion dialog.sheet::backdrop,.tpl-constelacion .ldg::backdrop{background:rgba(3,4,10,.7);backdrop-filter:blur(16px)}
.tpl-constelacion .sh-in{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);background:#0B0E1A;border-radius:32px;overflow:hidden;position:relative;box-shadow:inset 0 0 0 1px var(--line),0 40px 120px rgba(0,0,0,.6);animation:oPop .6s cubic-bezier(.2,.8,.2,1)}
@keyframes oPop{from{opacity:0;transform:scale(.94)}}
.tpl-constelacion .sh-ph{aspect-ratio:4/5;-webkit-mask:radial-gradient(circle at 50% 50%,#000 60%,transparent 72%);mask:radial-gradient(circle at 50% 50%,#000 60%,transparent 72%)}
.tpl-constelacion .sh-bd{padding:44px;display:flex;flex-direction:column;gap:14px}
.tpl-constelacion .sh-k{font-family:'Geist Mono',monospace;font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:var(--star)}
.tpl-constelacion .sh-n{font-family:'Instrument Serif',serif;font-weight:400;font-size:72px;line-height:.9}
.tpl-constelacion .sh-dl{display:grid;grid-template-columns:1fr 1fr;margin:8px 0 0;border-top:1px solid var(--line)}
.tpl-constelacion .sh-dl div{padding:12px 0;border-bottom:1px solid var(--line)}
.tpl-constelacion .sh-dl dt{font-size:12px;color:var(--soft)}
.tpl-constelacion .sh-dl dd{margin:2px 0 0;font-size:16px}
.tpl-constelacion .sh-act{display:flex;gap:10px;margin-top:auto;flex-wrap:wrap}
.tpl-constelacion .sh-b1,.tpl-constelacion .sh-b2{min-height:50px;padding:0 24px;display:inline-flex;align-items:center;border-radius:999px;text-decoration:none;font-weight:600}
.tpl-constelacion .sh-b1{background:var(--ink);color:#05070F!important}
.tpl-constelacion .sh-b2{box-shadow:inset 0 0 0 1px var(--line)}
.tpl-constelacion .sh-x,.tpl-constelacion .ldg-x{position:absolute;top:16px;right:16px;width:42px;height:42px;border-radius:50%;border:0;background:rgba(255,255,255,.08);color:var(--ink);cursor:pointer;display:grid;place-items:center;z-index:2}
.tpl-constelacion .sh-x svg,.tpl-constelacion .ldg-x svg{width:16px}
@media (max-width:720px){.tpl-constelacion .sh-in{grid-template-columns:minmax(0,1fr);max-height:calc(100vh - 24px);overflow:auto}.tpl-constelacion .sh-ph{aspect-ratio:1/1}.tpl-constelacion .sh-bd{padding:24px}.tpl-constelacion .sh-n{font-size:54px}}
.tpl-constelacion .ldg-in{background:#0B0E1A;border-radius:32px;padding:44px;position:relative;max-height:calc(100vh - 24px);overflow:auto;box-shadow:inset 0 0 0 1px var(--line)}
.tpl-constelacion .ldg-k{font-family:'Geist Mono',monospace;font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:var(--star)}
.tpl-constelacion .ldg-t{font-family:'Instrument Serif',serif;font-weight:400;font-size:54px}
.tpl-constelacion .ldg-d{color:var(--soft)}
.tpl-constelacion .ldg-sum{display:flex;gap:34px;flex-wrap:wrap;margin-top:22px}
.tpl-constelacion .ldg-sum span{display:block;font-size:12px;color:var(--soft)}
.tpl-constelacion .ldg-sum b{font-family:'Instrument Serif',serif;font-weight:400;font-size:34px}
.tpl-constelacion .ldg-tw{overflow-x:auto;margin-top:22px}
.tpl-constelacion .ldg table{width:100%;border-collapse:collapse;font-size:14px}
.tpl-constelacion .ldg th,.tpl-constelacion .ldg td{text-align:left;padding:12px 10px;border-bottom:1px solid var(--line)}
.tpl-constelacion .ldg th{font-size:11px;color:var(--soft);font-weight:400;text-transform:uppercase;letter-spacing:.12em}
.tpl-constelacion .ldg .num{text-align:right;white-space:nowrap}
.tpl-constelacion .ldg .lk{font-size:12px;padding:3px 9px;border-radius:999px;box-shadow:inset 0 0 0 1px var(--line)}
.tpl-constelacion a.o-a{text-decoration:none}
.tpl-constelacion .o-contact.nomap{grid-template-columns:minmax(0,1fr)}
.tpl-constelacion .o-contact .map{position:relative}
.tpl-constelacion .o-contact .map iframe{position:absolute;inset:0}
.tpl-constelacion .o-nav .nm .tpl-logo-img{width:100%;height:100%;object-fit:cover;border-radius:inherit}
`;

const FILTERS: Array<[string, string, (a: TplAnimal) => boolean]> = [
  ['todos', 'Todos', () => true],
  ['perro', 'Perros', (a) => a.sp === 'perro'],
  ['gato', 'Gatos', (a) => a.sp === 'gato'],
  ['otro', 'Otros', (a) => a.sp === 'otro'],
  ['nuevos', 'Nuevos', (a) => a.isNew],
  ['senior', 'Seniors', (a) => a.stage === 'Senior'],
];
const filterOf = (k: string) => FILTERS.find(([key]) => key === k)?.[2] ?? (() => true);

export const constelacion: TemplateDesign = {
  id: 'constelacion',
  webgl: true,
  fonts:
    'family=Geist:wght@300;400;500;600;700;800&family=Instrument+Serif:ital@0;1&family=Geist+Mono:wght@400;500',
  css: CSS,
  html(m, KIT) {
    const { ORG, CAMPAIGN, ANIMALS, SHOW, BADGES, NEEDS, PRODUCTS, REVIEWS } = m;
    const n = m.COUNTS.total;
    const F = FILTERS.map(([k, label, f]) => [k, label, ANIMALS.filter(f).length] as const).filter(
      ([k, , c]) => k === 'todos' || c > 0,
    );
    const sys = ANIMALS.slice(0, 6);
    const t = KIT.transparencyParts();
    const map = mapEmbed(m);
    const eb = [ORG.type, ORG.city, ...BADGES.map((b) => b.t)].filter(Boolean).join(' · ');
    return `
<section class="o-hero${n ? '' : ' no-gl'}" id="o-hero" data-sec="animales" aria-label="Constelación de animales en adopción">
  ${n ? '<canvas class="o-cv" id="o-cv" aria-hidden="true"></canvas>' : ''}
  <div class="o-fb" aria-hidden="true"><div class="ring">${ANIMALS.slice(0, 18)
    .map((a, i) => {
      const ang = (i / Math.min(18, ANIMALS.length)) * Math.PI * 2;
      return `<span style="transform:translate(${(Math.cos(ang) * 46).toFixed(1)}vmin,${(Math.sin(ang) * 26).toFixed(1)}vmin)">${portrait(a, { decor: true })}</span>`;
    })
    .join('')}</div></div>
  <nav class="o-nav" aria-label="Principal"><a class="nm" href="#o-hero"><i>${ORG.logo ? logoMark(m) : ic.paw}</i>${ORG.short}</a><a class="l" href="#o-cat">Catálogo</a><a class="l" href="#o-camp">Campaña</a><a class="l" href="#o-help">Cómo ayudar</a><button type="button" class="l" data-ledger>Transparencia</button><a class="o-btn" href="${ORG.donateHref}" style="min-height:42px;padding:0 18px">Donar</a></nav>
  <div class="o-copy">${eb ? `<p class="o-eb">${eb}</p>` : ''}
    <h1>Cada luz es alguien <em>esperando</em> volver a casa.</h1>
    <p class="l">${n ? `Gira la constelación, toca una luz y conoce su historia. Son ${countPhrase(m).replace(/^(\d+)/, 'los $1')} de ${ORG.name}.` : ORG.lede || availLine(m)}</p></div>
  <div class="o-tip" id="o-tip" role="status"></div>
  ${
    n
      ? `<p class="o-hint"><i></i><span><b id="o-n">${n}</b> en adopción · arrastra para girar</span></p>
  ${F.length > 1 ? `<div class="o-chips" role="group" aria-label="Filtrar la constelación">${F.map(([k, label, c], i) => `<button type="button" data-f="${k}" aria-pressed="${i === 0}">${label}<b>${c}</b></button>`).join('')}</div>` : ''}`
      : ''
  }
</section>
${SHOW.transparencia ? `<div class="o-tb" data-sec="transparencia" role="group" aria-label="Transparencia"><div class="w">${ic.shield}<b>${t.level}</b><span>${t.formalization}</span><span>${t.accountability}</span><span class="ac">${t.note}</span></div></div>` : ''}
<section class="w o-sec" data-sec="acciones"><p class="o-eb">Tres trayectorias</p><h2 class="o-h2" style="margin-top:16px">¿Cómo quieres <em>entrar</em> en su órbita?</h2>
  <div class="o-acts">${[
    ['Adoptar', 'Dale un hogar para siempre a uno de ellos.', '#o-cat'],
    ['Apadrinar', 'Acompaña sus cuidados sin llevarlo a casa.', '#o-cat'],
    ['Donar', 'Apoya el trabajo de la organización.', ORG.donateHref],
  ]
    .map(
      (a, i) =>
        `<a class="o-act" href="${a[2]}"><span class="go">0${i + 1}</span><b>${a[0]}</b><p>${a[1]}</p></a>`,
    )
    .join('')}</div>
  <p class="o-note">${COPY.adoptNote}</p></section>
<section class="w o-sec o-cat" id="o-cat" data-sec="animales" style="padding-top:0"><div class="hd"><div><p class="o-eb">La constelación, en lista</p><h2 class="o-h2" style="margin-top:16px">Todos, <em>uno por uno</em></h2></div>${n ? '<p class="o-sub" style="max-width:24em">Los mismos filtros que la constelación, para quien prefiere recorrerlos con calma.</p>' : ''}</div>
  ${
    n
      ? `${F.length > 1 ? `<div class="f" role="group" aria-label="Filtrar catálogo">${F.map(([k, label, c], i) => `<button type="button" data-f="${k}" aria-pressed="${i === 0}">${label} · ${c}</button>`).join('')}</div>` : ''}
  <div class="o-grid" id="o-grid"></div><div class="o-more"><button type="button" class="o-btn ghost" id="o-more"></button></div>`
      : `<p class="o-empty">${EMPTY.animales}</p>`
  }
</section>
${
  CAMPAIGN.active
    ? `<section class="w o-sec" id="o-camp" data-sec="campana" style="padding-top:0"><div class="o-camp">
  <div class="o-orb"><div class="ph">${campaignArt(m)}</div>
    <svg class="rg" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="48" fill="none" stroke="rgba(238,240,247,.12)" stroke-width=".4"/><circle id="o-arc" cx="50" cy="50" r="48" fill="none" stroke="#FFDDB0" stroke-width="1" stroke-linecap="round" pathLength="100" stroke-dasharray="0 100"/><circle id="o-sat" cx="98" cy="50" r="2" fill="#FFDDB0"/></svg>
    <div class="pc"><b>${CAMPAIGN.pct}%</b><span>de la meta</span></div></div>
  <div><p class="o-eb">Campaña activa${CAMPAIGN.category ? ` · ${CAMPAIGN.category}` : ''}</p><h2 class="o-h2" style="margin-top:16px">${CAMPAIGN.title}</h2>
    ${CAMPAIGN.description ? `<p class="o-sub">${CAMPAIGN.description}</p>` : ''}
    <p class="o-sub">${COPY.adoptNote}</p>
    <div class="o-stats"><div><b id="o-raised">${fmt(CAMPAIGN.raised)}</b><span>recaudado</span></div><div><b>${fmt(CAMPAIGN.goal)}</b><span>meta</span></div><div><b>${CAMPAIGN.daysLeft}</b><span>${CAMPAIGN.daysLeft === 1 ? 'día' : 'días'} · cierra ${CAMPAIGN.deadline}</span></div></div>
    <div style="display:flex;gap:10px;flex-wrap:wrap"><a class="o-btn" href="${CAMPAIGN.href}" data-magnet>Ver campaña y aportar ${ic.arrow}</a></div>${KIT.moreCampaigns()}</div>
</div></section>`
    : `<section class="w o-sec" id="o-camp" data-sec="campana" style="padding-top:0"><p class="o-eb">Campaña activa</p><h2 class="o-h2" style="margin-top:16px">Sin <em>misión</em> en curso</h2><p class="o-empty">${EMPTY.campana}</p></section>`
}
<section class="w o-sec" data-sec="necesidades" style="padding-top:0"><p class="o-eb">Banco de recursos</p><h2 class="o-h2" style="margin-top:16px">Lo que <em>necesitamos</em></h2>
  ${NEEDS.length ? `<div class="o-needs">${NEEDS.map((nd) => `<div class="o-pl"><div class="sp"><i class="lq" data-h="${nd.pct}"></i><em>${nd.pct}%</em></div>${nd.category ? `<span class="k">${nd.category}</span>` : ''}<b>${nd.title}</b><p>${nd.got} de ${nd.need} ${nd.unit}</p><a class="o-lnk" href="${nd.href}">Ver y donar ${ic.arrow}</a></div>`).join('')}</div>` : `<p class="o-empty">${EMPTY.necesidades}</p>`}
</section>
<section class="w o-sec" data-sec="productos" style="padding-top:0"><p class="o-eb">Tienda solidaria</p><h2 class="o-h2" style="margin-top:16px">Productos que <em>ayudan</em></h2>
  ${PRODUCTS.length ? `<div class="o-prods">${PRODUCTS.map((p) => `<a class="o-pr" href="${p.href}"><div class="ph">${productArt(p, 'transparent')}</div>${p.category ? `<span class="k">${p.category}</span>` : ''}<b>${p.name}</b><span class="pz">${fmt(p.price)}</span><span class="by">Ver</span></a>`).join('')}</div>` : `<p class="o-empty">${EMPTY.productos}</p>`}
</section>
<section class="o-help" id="o-help" data-sec="ayuda">${sys.length ? `<div class="sys" aria-hidden="true">${sys.map((a, i) => `<i style="--in:${8 + i * 7}%;--t:${40 + i * 14}s;transform:rotate(${i * 67}deg)"><span>${portrait(a, { decor: true })}</span></i>`).join('')}</div>` : ''}
  <div class="w" id="portal-help-cta"><p class="o-eb">Cómo ayudar</p><h2 style="margin-top:18px">${COPY.helpTitle.replace('grandes cambios', '<em>grandes cambios</em>')}</h2><p>${COPY.helpText}</p><a class="o-btn" href="${ORG.donateHref}" data-magnet>${COPY.helpCta} ${ic.arrow}</a></div></section>
${SHOW.nosotros ? `<section class="w o-sec" data-sec="nosotros" style="padding-top:0"><div class="o-about"><div><p class="o-eb">Quiénes somos</p><h2 class="o-h2" style="margin-top:16px">Sobre <em>nosotros</em></h2></div><div><p class="tx">${ORG.about}</p>${BADGES.length ? `<div class="o-bdg">${BADGES.map((b) => `<span class="${b.ok ? 'ok' : ''}">${b.ok ? ic.check : ic.clock}${b.t}</span>`).join('')}</div>` : ''}</div></div></section>` : ''}
<section class="w o-sec" data-sec="resenas" style="padding-top:0"><div class="o-hd"><div><p class="o-eb">Opiniones</p><h2 class="o-h2" style="margin-top:16px">Reseñas</h2></div><button type="button" class="o-lnk" data-review>Registrar reseña ${ic.arrow}</button></div>
  ${REVIEWS.length ? `<div class="o-revs">${REVIEWS.map((r) => `<figure><span class="st" aria-label="${r.rating} de 5">${stars(r.rating)}</span>${r.text ? `<blockquote>“${r.text}”</blockquote>` : ''}<figcaption>${r.name}${r.date ? ` · ${r.date}` : ''}</figcaption></figure>`).join('')}</div>` : `<p class="o-empty">${EMPTY.resenas}</p>`}
</section>
<section class="w o-sec" data-sec="libro" style="padding-top:0"><div class="o-hd"><div><p class="o-eb">Transparencia</p><h2 class="o-h2" style="margin-top:16px">Libro <em>público</em></h2><p class="o-sub">${COPY.ledgerText}</p></div><button type="button" class="o-lnk" data-ledger>Ver libro completo ${ic.arrow}</button></div>
  ${ledgerBlock(m, 'o-empty')}
</section>
${SHOW.contacto ? `<section class="w o-sec" data-sec="contacto" style="padding-top:0"><div class="o-contact${map ? '' : ' nomap'}"><div class="info"><p class="o-eb">Visítanos</p><h2 class="o-h2" style="margin-top:16px;font-size:clamp(40px,4.4vw,64px)">Información de contacto</h2>${KIT.contactRows()}${mapLink(m, 'o-lnk')}</div>${map ? `<div class="map">${map}</div>` : ''}</div></section>` : ''}
<footer class="w o-ftr"><p class="big">${ORG.short}<em>.</em></p>
  ${SHOW.redes ? `<div class="o-soc" data-sec="redes"><p>${COPY.socialsText}</p><div>${m.SOCIALS.map((x) => socialLink(x, ic[x.key])).join('')}</div></div>` : ''}
  <div class="o-fine"><span>${ORG.name}${ORG.place ? ` · ${ORG.place}` : ''}</span><span>Hecho con AdoptaFácil</span></div></footer>`;
  },
  init(app, env) {
    const { m, motion, catalog, THREE } = env;
    const { signal } = motion;
    const A = m.ANIMALS;
    const hero = qs(app, '#o-hero');
    const cv = qs<HTMLCanvasElement>(app, '#o-cv');
    const tip = qs(app, '#o-tip');
    let fk = 'todos';
    let setGL = () => {};

    // Constelación: un solo draw call con todos los retratos en un atlas
    let ok = false;
    if (THREE && hero && cv && tip && A.length) {
      try {
        const r = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true });
        ok = true;
        const N = A.length;
        const C = Math.ceil(Math.sqrt(N));
        const CELL = 128;
        const atlas = document.createElement('canvas');
        atlas.width = atlas.height = C * CELL;
        const ctx = atlas.getContext('2d');
        const tex = new THREE.CanvasTexture(atlas);
        let dirty = 0;
        // Foto real si el servidor permite leerla (CORS); si no, la ilustración.
        A.forEach((a, i) => {
          const draw = (img: HTMLImageElement) => {
            if (!ctx || signal.aborted) return;
            const x = (i % C) * CELL;
            const y = Math.floor(i / C) * CELL;
            const sc = Math.max(
              CELL / (img.naturalWidth || CELL),
              CELL / (img.naturalHeight || CELL),
            );
            const w = (img.naturalWidth || CELL) * sc;
            const h = (img.naturalHeight || CELL) * sc;
            ctx.save();
            ctx.beginPath();
            ctx.rect(x, y, CELL, CELL);
            ctx.clip();
            ctx.drawImage(img, x + (CELL - w) / 2, y + (CELL - h) / 2, w, h);
            ctx.restore();
            dirty = 1;
          };
          const illustrate = () => {
            const svg = portrait(a, {
              decor: true,
              illustration: true,
              dx: 6,
              dy: 14,
              s: 1.1,
            }).replace(
              '<svg ',
              `<svg xmlns="http://www.w3.org/2000/svg" width="${CELL}" height="${CELL}" `,
            );
            const img = new Image();
            img.onload = () => draw(img);
            img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
          };
          if (!a.photo) return illustrate();
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.referrerPolicy = 'no-referrer';
          img.onload = () => draw(img);
          img.onerror = illustrate;
          img.src = unesc(a.photo);
        });
        r.setPixelRatio(Math.min(devicePixelRatio, 2));
        const scene = new THREE.Scene();
        const cam = new THREE.PerspectiveCamera(38, 1, 0.1, 200);
        const group = new THREE.Group();
        scene.add(group);
        const mob = () => innerWidth < 820;
        const R = () => (mob() ? 1.8 : 3.05);
        // Posiciones en esfera de Fibonacci
        const sph = (k: number, cnt: number, rad: number): [number, number, number] => {
          const y = 1 - ((k + 0.5) / cnt) * 2;
          const rr = Math.sqrt(1 - y * y);
          const th = k * 2.399963;
          return [Math.cos(th) * rr * rad, y * rad, Math.sin(th) * rr * rad];
        };
        const pg = new THREE.PlaneGeometry(1, 1);
        const g = new THREE.InstancedBufferGeometry();
        g.index = pg.index;
        g.setAttribute('position', pg.attributes.position);
        g.setAttribute('uv', pg.attributes.uv);
        g.instanceCount = N;
        const P = new Float32Array(N * 3);
        const T = new Float32Array(N * 3);
        const S = new Float32Array(N);
        const ST = new Float32Array(N);
        const ON = new Float32Array(N);
        const HI = new Float32Array(N);
        const IDX = new Float32Array(N);
        A.forEach((_, i) => {
          IDX[i] = i;
          ON[i] = 1;
          P.set(sph(i, N, R() * 2.4), i * 3);
        });
        const aP = new THREE.InstancedBufferAttribute(P, 3);
        const aS = new THREE.InstancedBufferAttribute(S, 1);
        const aO = new THREE.InstancedBufferAttribute(ON, 1);
        const aH = new THREE.InstancedBufferAttribute(HI, 1);
        g.setAttribute('aPos', aP);
        g.setAttribute('aScale', aS);
        g.setAttribute('aOn', aO);
        g.setAttribute('aHi', aH);
        g.setAttribute('aIdx', new THREE.InstancedBufferAttribute(IDX, 1));
        const U = {
          uTex: { value: tex },
          uC: { value: C },
          uSize: { value: 0.78 },
          uRim: { value: new THREE.Color('#FFDDB0') },
          uBrand: { value: new THREE.Color(env.brand()) },
        };
        const mat = new THREE.ShaderMaterial({
          uniforms: U,
          transparent: true,
          depthWrite: true,
          vertexShader: `attribute vec3 aPos;attribute float aScale,aOn,aHi,aIdx;uniform float uSize;varying vec2 vUv;varying float vOn,vHi,vIdx,vDepth;
          void main(){vec4 mv=modelViewMatrix*vec4(aPos,1.);float s=uSize*aScale*(1.+aHi*.45);mv.xy+=position.xy*s;gl_Position=projectionMatrix*mv;
          vUv=uv;vOn=aOn;vHi=aHi;vIdx=aIdx;vDepth=smoothstep(-17.,-7.,mv.z);}`,
          fragmentShader: `uniform sampler2D uTex;uniform float uC;uniform vec3 uRim,uBrand;varying vec2 vUv;varying float vOn,vHi,vIdx,vDepth;
          void main(){vec2 c=vUv-.5;float r=length(c);if(r>.5)discard;
          vec2 cell=vec2(mod(vIdx,uC),floor(vIdx/uC));vec2 uv=vec2((cell.x+vUv.x)/uC,1.-(cell.y+1.-vUv.y)/uC);
          vec3 col=texture2D(uTex,uv).rgb;float g=dot(col,vec3(.3,.59,.11));col=mix(vec3(g)*.35,col,vOn);
          float rim=smoothstep(.40,.47,r);col=mix(col,mix(uRim,uBrand,vHi),rim*(.55+.45*vHi));
          col*=mix(.28,1.,vDepth);float a=smoothstep(.5,.47,r)*mix(.22,1.,vOn);
          gl_FragColor=vec4(col,a);}`,
        });
        const mesh = new THREE.Mesh(g, mat);
        mesh.frustumCulled = false;
        group.add(mesh);
        // Estrellas y anillos de fondo
        const sg = new THREE.BufferGeometry();
        const spos = new Float32Array(1800 * 3);
        for (let i = 0; i < 1800; i++) spos.set(sph(i, 1800, 30 + ((i * 7919) % 40)), i * 3);
        sg.setAttribute('position', new THREE.BufferAttribute(spos, 3));
        const stars = new THREE.Points(
          sg,
          new THREE.PointsMaterial({
            color: 0xbfc6e0,
            size: 0.07,
            transparent: true,
            opacity: 0.7,
            depthWrite: false,
          }),
        );
        scene.add(stars);
        const rings = (
          [
            [1.35, 0.4, 0.2],
            [1.7, -0.3, 0.9],
            [2.1, 0.9, -0.4],
          ] as const
        ).map(([k, rx, rz]) => {
          const pts = [];
          for (let i = 0; i <= 128; i++) {
            const th = (i / 128) * Math.PI * 2;
            pts.push(new THREE.Vector3(Math.cos(th), 0, Math.sin(th)));
          }
          const l = new THREE.LineLoop(
            new THREE.BufferGeometry().setFromPoints(pts),
            new THREE.LineBasicMaterial({ color: 0xffddb0, transparent: true, opacity: 0.16 }),
          );
          l.userData.k = k;
          l.rotation.set(rx, 0, rz);
          group.add(l);
          return l;
        });
        const layout = () => {
          const f = filterOf(fk);
          const L = A.map((a, i) => [i, f(a)] as const);
          const on = L.filter((x) => x[1]);
          const off = L.filter((x) => !x[1]);
          const rad = R();
          on.forEach(([i], k) => {
            T.set(sph(k, on.length, rad * (on.length < 30 ? 0.78 : 1)), i * 3);
            ST[i] = on.length < 30 ? 1.25 : 1;
            ON[i] = 1;
          });
          off.forEach(([i], k) => {
            T.set(sph(k, Math.max(off.length, 1), rad * 0.36), i * 3);
            ST[i] = 0.42;
            ON[i] = 0;
          });
          aO.needsUpdate = true;
          rings.forEach((l) => l.scale.setScalar(rad * Number(l.userData.k)));
        };
        const size = () => {
          const w = hero.clientWidth;
          const h = hero.clientHeight;
          r.setSize(w, h, false);
          cam.aspect = w / Math.max(1, h);
          cam.position.set(0, 0, 13);
          cam.updateProjectionMatrix();
          group.position.set(mob() ? 0 : 2.9, mob() ? 2.2 : 0.15, 0);
          U.uSize.value = mob() ? 0.44 : 0.66;
          layout();
        };
        size();
        addEventListener('resize', size, { signal });
        setGL = layout;
        // Giro con inercia
        let rx = 0.25;
        let ry = 0;
        let vx = 0;
        let vy = 0.0016;
        let drag: [number, number] | null = null;
        let moved = 0;
        let hov = -1;
        let mx = -1e4;
        let my = -1e4;
        cv.addEventListener(
          'pointerdown',
          (e) => {
            drag = [e.clientX, e.clientY];
            moved = 0;
            cv.setPointerCapture(e.pointerId);
          },
          { signal },
        );
        cv.addEventListener(
          'pointermove',
          (e) => {
            const b = cv.getBoundingClientRect();
            mx = e.clientX - b.left;
            my = e.clientY - b.top;
            if (!drag) return;
            const dx = e.clientX - drag[0];
            const dy = e.clientY - drag[1];
            moved += Math.abs(dx) + Math.abs(dy);
            vy = dx * 0.0045;
            vx = dy * 0.003;
            ry += vy;
            rx += vx;
            drag = [e.clientX, e.clientY];
          },
          { signal },
        );
        cv.addEventListener(
          'pointerup',
          () => {
            drag = null;
            if (moved < 6 && hov >= 0) env.go(unesc(A[hov].href));
          },
          { signal },
        );
        cv.addEventListener('pointerleave', () => (mx = my = -1e4), { signal });
        const v = new THREE.Vector3();
        const mvp = new THREE.Matrix4();
        let inView = true;
        motion.observe([hero], (en) => {
          inView = en.isIntersecting;
        });
        const t0 = performance.now();
        motion.onFrame((tm) => {
          if (!inView) return;
          if (dirty) {
            tex.needsUpdate = true;
            dirty = 0;
          }
          const intro = motion.reduce ? 1 : Math.min(1, (tm - t0) / 2200);
          const e = 1 - Math.pow(1 - intro, 3);
          if (!drag) {
            vy += ((motion.reduce ? 0 : 0.0016) - vy) * 0.03;
            vx *= 0.94;
            ry += vy;
            rx += vx;
          }
          rx = Math.max(-0.9, Math.min(0.9, rx));
          group.rotation.set(rx, ry + (1 - e) * 2.2, 0);
          const sc = Math.min(1, scrollY / Math.max(1, hero.offsetHeight));
          group.scale.setScalar(1 + sc * 0.35);
          stars.rotation.y = tm * 0.00001 + sc * 0.3;
          rings.forEach((l, k) => (l.rotation.y = tm * 0.00008 * (k + 1)));
          for (let i = 0; i < N; i++) {
            for (let j = 0; j < 3; j++) P[i * 3 + j] += (T[i * 3 + j] - P[i * 3 + j]) * 0.07;
            S[i] += (ST[i] * e - S[i]) * 0.1;
            HI[i] += ((i === hov ? 1 : 0) - HI[i]) * 0.2;
          }
          aP.needsUpdate = aS.needsUpdate = aH.needsUpdate = true;
          // Selección: el más cercano al cursor que mira hacia la cámara
          group.updateMatrixWorld();
          mvp
            .multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse)
            .multiply(mesh.matrixWorld);
          let best = -1;
          let bd = 1e9;
          const w = cv.clientWidth;
          const h = cv.clientHeight;
          for (let i = 0; i < N; i++) {
            if (!ON[i]) continue;
            v.set(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]).applyMatrix4(mvp);
            if (v.z > 0.995) continue;
            const sx = ((v.x + 1) / 2) * w;
            const sy = ((1 - v.y) / 2) * h;
            const d = Math.hypot(sx - mx, sy - my);
            if (d < 34 && d < bd) {
              bd = d;
              best = i;
            }
          }
          if (best !== hov) {
            hov = best;
            if (hov >= 0) {
              const a = A[hov];
              tip.innerHTML = `<b>${a.name}</b><span>${a.spLabel} · ${a.age}${a.days ? ` · ${sinceLabel(a).toLowerCase()}` : ''}</span>`;
            }
            tip.classList.toggle('on', hov >= 0);
            cv.style.cursor = hov >= 0 ? 'pointer' : '';
          }
          if (hov >= 0) {
            v.set(P[hov * 3], P[hov * 3 + 1], P[hov * 3 + 2]).applyMatrix4(mvp);
            tip.style.left = ((v.x + 1) / 2) * w + 'px';
            tip.style.top = ((1 - v.y) / 2) * h + 'px';
          }
          r.render(scene, cam);
        });
        signal.addEventListener('abort', () => {
          tex.dispose();
          mat.dispose();
          g.dispose();
          sg.dispose();
          r.dispose();
        });
      } catch {
        ok = false;
      }
    }
    if (!ok) hero?.classList.add('no-gl');

    // Catálogo en lista, sincronizado con la constelación
    const grid = qs(app, '#o-grid');
    const more = qs<HTMLButtonElement>(app, '#o-more');
    const nEl = qs(app, '#o-n');
    let shown = 18;
    const paint = () => {
      if (!grid) return;
      const L = catalog.query({ sort: 'recientes' }).filter(filterOf(fk));
      const k = Math.min(shown, L.length);
      grid.innerHTML = L.slice(0, k)
        .map(
          (a) =>
            `<a class="o-a" href="${a.href}"><div class="ph">${portrait(a, { decor: true, dx: 6, dy: 14, s: 1.1 })}</div>${a.isNew ? '<span class="nw">NUEVO</span>' : ''}<b>${a.name}</b><span>${a.spLabel} · ${a.age}</span></a>`,
        )
        .join('');
      if (more) {
        more.hidden = k >= L.length;
        more.textContent = `Ver ${Math.min(18, L.length - k)} más de ${L.length}`;
      }
      if (nEl) nEl.textContent = String(L.length);
    };
    const setF = (k: string) => {
      fk = k;
      shown = 18;
      qsa(app, '[data-f]').forEach((b) =>
        b.setAttribute('aria-pressed', String(b.dataset.f === k)),
      );
      setGL();
      paint();
    };
    qsa(app, '.o-chips,.o-cat .f').forEach((box) =>
      box.addEventListener(
        'click',
        (e) => {
          const b = (e.target as Element).closest<HTMLElement>('[data-f]');
          if (b?.dataset.f) setF(b.dataset.f);
        },
        { signal },
      ),
    );
    more?.addEventListener(
      'click',
      () => {
        shown += 18;
        paint();
      },
      { signal },
    );
    paint();

    // Anillo de campaña, planetas que se llenan y brillo de productos
    const arc = qs(app, '#o-arc');
    const sat = qs(app, '#o-sat');
    const fillArc = () => {
      if (!arc) return;
      const p = Math.max(1.5, m.CAMPAIGN.pct);
      arc.style.transition = 'stroke-dasharray 2.4s cubic-bezier(.2,.8,.2,1)';
      arc.setAttribute('stroke-dasharray', `${p} 100`);
      if (!sat) return;
      const st = performance.now();
      const step = (nw: number) => {
        if (signal.aborted) return;
        const k = motion.reduce ? 1 : Math.min(1, (nw - st) / 2400);
        const e = 1 - Math.pow(1 - k, 3);
        const ang = ((e * p) / 100) * Math.PI * 2;
        sat.setAttribute('cx', String(50 + Math.cos(ang) * 48));
        sat.setAttribute('cy', String(50 + Math.sin(ang) * 48));
        if (k < 1) requestAnimationFrame(step);
      };
      step(st);
    };
    const els = [...(arc ? [arc] : []), ...qsa(app, '.o-pl .lq')];
    const enter = (el: HTMLElement) =>
      el === arc ? fillArc() : (el.style.height = el.dataset.h + '%');
    if (typeof IntersectionObserver !== 'function') els.forEach(enter);
    motion.observe(
      els,
      (en, io) => {
        if (!en.isIntersecting) return;
        io.unobserve(en.target);
        enter(en.target as HTMLElement);
      },
      { threshold: 0.4 },
    );
    qsa(app, '.o-pr').forEach((c) =>
      c.addEventListener(
        'pointermove',
        (e) => {
          const b = c.getBoundingClientRect();
          c.style.setProperty('--mx', e.clientX - b.left + 'px');
          c.style.setProperty('--my', e.clientY - b.top + 'px');
        },
        { signal },
      ),
    );
    if (m.CAMPAIGN.active) motion.countUp(qs(app, '#o-raised'), m.CAMPAIGN.raised, fmt);
    motion.reveal(app, '.o-act,.o-pl,.o-pr,.o-revs figure', { stagger: 90 });
    motion.magnet(app);
  },
};
