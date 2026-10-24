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
  norm,
  portrait,
  productArt,
  qs,
  qsa,
  sinceLabel,
  socialLink,
  stars,
} from '../engine/runtime';
import { esc, unesc } from '../engine/safe';
import type { TemplateDesign } from '../engine/types';

const CSS = `
.tpl-match{--bg:#FFF4EC;--card:#FFFFFF;--ink:#2B1A12;--soft:#86695A;--line:#F1DDD0;--like:#E2466B;--pass:#2B1A12;font-family:'Rethink Sans',system-ui,sans-serif;color:var(--ink);background:var(--bg);overflow-x:clip}
.tpl-match a{color:inherit}
.tpl-match .x-top{display:flex;align-items:center;justify-content:space-between;gap:16px;padding-block:18px}
.tpl-match .x-logo{display:flex;align-items:center;gap:10px;font-weight:800;font-size:19px;text-decoration:none;letter-spacing:-.01em}
.tpl-match .x-logo i{width:40px;height:40px;border-radius:14px;background:var(--brand);color:var(--brand-ink);display:grid;place-items:center;transform:rotate(-8deg)}
.tpl-match .x-logo svg{width:22px}
.tpl-match .x-fav{white-space:nowrap;display:inline-flex;align-items:center;gap:10px;min-height:46px;padding:0 8px 0 16px;border-radius:999px;background:var(--card);box-shadow:0 0 0 1px var(--line);font-weight:700;border:0;cursor:pointer}
.tpl-match .x-fav svg{width:18px;color:var(--like)}
.tpl-match .x-fav b{min-width:30px;height:30px;border-radius:999px;background:var(--like);color:#fff;display:grid;place-items:center;font-size:14px;padding:0 8px;transition:transform .3s cubic-bezier(.3,1.6,.5,1)}
.tpl-match .x-fav b.bump{transform:scale(1.35)}
.tpl-match .x-hero{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:48px;align-items:center;padding-block:10px 80px}
.tpl-match .x-h1{font-weight:800;font-size:clamp(48px,6.4vw,100px);line-height:.9;letter-spacing:-.045em}
.tpl-match .x-h1 span{display:block}
.tpl-match .x-h1 .l{color:var(--like)}
.tpl-match .x-sub{margin-top:22px;font-size:19px;line-height:1.55;color:var(--soft);max-width:26em}
.tpl-match .x-meta{display:flex;flex-wrap:wrap;gap:10px;margin-top:26px}
.tpl-match .x-meta span{display:inline-flex;align-items:center;gap:8px;padding:10px 14px;border-radius:999px;background:var(--card);box-shadow:0 0 0 1px var(--line);font-weight:600;font-size:14px}
.tpl-match .x-meta svg{width:15px;color:var(--brand)}
.tpl-match .x-how{display:flex;gap:18px;margin-top:30px;color:var(--soft);font-size:14px;font-weight:600;flex-wrap:wrap}
.tpl-match .x-how kbd{font-family:inherit;display:inline-grid;place-items:center;min-width:30px;height:30px;border-radius:9px;background:var(--card);box-shadow:0 2px 0 var(--line),0 0 0 1px var(--line);color:var(--ink);margin-right:6px;font-weight:700}
.tpl-match .x-play{display:flex;flex-direction:column;align-items:center;gap:18px}
.tpl-match .x-filters{display:flex;gap:6px;flex-wrap:wrap;justify-content:center}
.tpl-match .x-filters button{border:0;min-height:40px;padding:0 16px;border-radius:999px;background:transparent;box-shadow:inset 0 0 0 1.5px var(--line);font-weight:700;font-size:14px;cursor:pointer;color:var(--soft)}
.tpl-match .x-filters button[aria-pressed="true"]{background:var(--ink);color:var(--bg);box-shadow:none}
.tpl-match .x-deck{position:relative;width:min(400px,86vw);aspect-ratio:3/4.1;touch-action:pan-y}
.tpl-match .x-card{position:absolute;inset:0;border-radius:32px;overflow:hidden;background:var(--card);box-shadow:0 40px 70px -40px rgba(80,30,10,.55),0 0 0 1px rgba(0,0,0,.04);transform-origin:50% 110%;transition:transform .5s cubic-bezier(.2,.8,.2,1),opacity .4s;user-select:none;will-change:transform}
.tpl-match .x-card.top{cursor:grab}
.tpl-match .x-card.drag{transition:none;cursor:grabbing}
.tpl-match .x-card .ph{position:absolute;inset:0}
.tpl-match .x-card .gr{position:absolute;inset:auto 0 0;height:58%;background:linear-gradient(0deg,rgba(20,10,5,.92),rgba(20,10,5,.5) 50%,transparent)}
.tpl-match .x-card .tx{position:absolute;left:24px;right:24px;bottom:22px;color:#fff}
.tpl-match .x-card .tx h3{font-size:44px;font-weight:800;letter-spacing:-.03em;line-height:1}
.tpl-match .x-card .tx h3 small{font-size:22px;font-weight:600;opacity:.85;margin-left:8px;letter-spacing:0}
.tpl-match .x-card .tx p{margin-top:6px;font-size:15px;opacity:.88}
.tpl-match .x-card .tags{display:flex;flex-wrap:wrap;gap:6px;margin-top:12px}
.tpl-match .x-card .tags span{font-size:12px;font-weight:700;padding:6px 10px;border-radius:999px;background:rgba(255,255,255,.18);backdrop-filter:blur(6px)}
.tpl-match .x-card .new{position:absolute;top:18px;left:18px;font-size:12px;font-weight:800;background:#fff;padding:6px 12px;border-radius:999px;letter-spacing:.04em}
.tpl-match .x-stamp{position:absolute;top:34px;font-size:30px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;padding:6px 14px;border-radius:12px;border:4px solid;opacity:0;pointer-events:none}
.tpl-match .x-stamp.yes{left:24px;color:#3BD48A;transform:rotate(-14deg)}
.tpl-match .x-stamp.no{right:24px;color:#fff;transform:rotate(14deg)}
.tpl-match .x-end{position:absolute;inset:0;border-radius:32px;border:2px dashed var(--line);display:grid;place-items:center;text-align:center;padding:30px;color:var(--soft)}
.tpl-match .x-end b{display:block;color:var(--ink);font-size:24px;margin-bottom:8px}
.tpl-match .x-ctrl{display:flex;align-items:center;gap:16px;margin-top:22px}
.tpl-match .x-ctrl button{border:0;border-radius:50%;display:grid;place-items:center;cursor:pointer;background:var(--card);box-shadow:0 14px 30px -14px rgba(80,30,10,.5),0 0 0 1px var(--line);transition:transform .25s cubic-bezier(.3,1.6,.5,1)}
.tpl-match .x-ctrl button:hover{transform:scale(1.08)}
.tpl-match .x-ctrl button:active{transform:scale(.94)}
.tpl-match .x-ctrl .no{width:64px;height:64px}
.tpl-match .x-ctrl .no svg{width:26px}
.tpl-match .x-ctrl .yes{width:80px;height:80px;background:var(--like);color:#fff;box-shadow:0 20px 40px -16px var(--like)}
.tpl-match .x-ctrl .yes svg{width:34px}
.tpl-match .x-ctrl .undo{width:48px;height:48px;color:var(--soft)}
.tpl-match .x-ctrl .undo svg{width:20px}
.tpl-match .x-ctrl .info{width:48px;height:48px;font-weight:800;font-size:18px;color:var(--soft)}
.tpl-match .x-progress{font-size:14px;font-weight:600;color:var(--soft)}
.tpl-match .x-progress b{color:var(--ink);font-variant-numeric:tabular-nums}
@media (max-width:960px){.tpl-match .x-hero{grid-template-columns:minmax(0,1fr);gap:24px}.tpl-match .x-how,.tpl-match .x-hero .x-meta{display:none}.tpl-match .x-h1{font-size:50px}.tpl-match .x-sub{font-size:16px;margin-top:14px}.tpl-match .x-filters{flex-wrap:nowrap;overflow-x:auto;justify-content:flex-start;scrollbar-width:none;max-width:100%;padding:2px}.tpl-match .x-filters button{flex:none}}
@media (max-width:420px){.tpl-match .x-fav .t{display:none}.tpl-match .x-fav{padding-left:14px}}

.tpl-match .x-tray{position:fixed;left:50%;bottom:18px;z-index:40;transform:translate(-50%,140%);transition:transform .5s cubic-bezier(.2,.9,.3,1.1);display:flex;align-items:center;gap:12px;padding:8px 8px 8px 16px;border-radius:999px;background:var(--ink);color:var(--bg);box-shadow:0 24px 50px -20px rgba(0,0,0,.6);max-width:calc(100vw - 24px)}
.tpl-match .x-tray.on{transform:translate(-50%,0)}
.tpl-match .x-tray .av{display:flex;margin-right:4px}
.tpl-match .x-tray .av span{width:38px;height:38px;border-radius:50%;overflow:hidden;box-shadow:0 0 0 2px var(--ink);margin-left:-10px}
.tpl-match .x-tray .av span:first-child{margin-left:0}
.tpl-match .x-tray .lbl{font-weight:700;font-size:14px;white-space:nowrap}
.tpl-match .x-tray button{border:0;min-height:44px;padding:0 18px;border-radius:999px;background:var(--like);color:#fff;font-weight:800;cursor:pointer;white-space:nowrap}

.tpl-match .x-sec{padding-block:90px}
.tpl-match .x-h2{font-weight:800;font-size:clamp(36px,4.6vw,68px);letter-spacing:-.04em;line-height:.95}
.tpl-match .x-dir{display:grid;grid-template-columns:56px minmax(0,1fr);gap:24px;margin-top:36px}
.tpl-match .x-az{position:sticky;top:calc(var(--bar) + 16px);align-self:start;display:flex;flex-direction:column;gap:2px}
.tpl-match .x-az a{display:grid;place-items:center;height:30px;border-radius:9px;font-weight:800;font-size:13px;text-decoration:none;color:var(--soft)}
.tpl-match .x-az a:hover{background:var(--card);color:var(--ink)}
.tpl-match .x-az a.dim{opacity:.25;pointer-events:none}
.tpl-match .x-tools{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:12px}
.tpl-match .x-tools label{flex:1 1 240px;display:flex;align-items:center;gap:8px;height:48px;padding:0 16px;border-radius:16px;background:var(--card);box-shadow:0 0 0 1px var(--line)}
.tpl-match .x-tools svg{width:18px;color:var(--soft)}
.tpl-match .x-tools input{border:0;outline:0;background:transparent;width:100%;font-size:15px}
.tpl-match .x-tools .c{font-weight:700;color:var(--soft);font-size:14px;padding:0 6px}
.tpl-match .x-grp h3{position:sticky;top:var(--bar);z-index:2;background:var(--bg);font-size:28px;font-weight:800;padding:14px 0 8px;letter-spacing:-.02em;scroll-margin-top:var(--bar)}
.tpl-match .x-rows{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
.tpl-match .x-row{display:grid;grid-template-columns:56px minmax(0,1fr) auto;gap:14px;align-items:center;padding:8px 8px 8px 8px;border-radius:20px;background:var(--card);box-shadow:0 0 0 1px var(--line);transition:transform .25s,box-shadow .25s}
.tpl-match .x-row:hover{transform:translateY(-2px);box-shadow:0 0 0 1px var(--line),0 16px 30px -22px rgba(80,30,10,.5)}
.tpl-match .x-row .a{width:56px;height:56px;border-radius:16px;overflow:hidden;border:0;padding:0;cursor:pointer}
.tpl-match .x-row .t{border:0;background:transparent;padding:0;text-align:left;cursor:pointer;min-width:0}
.tpl-match .x-row .t b{display:block;font-size:17px;font-weight:800}
.tpl-match .x-row .t span{display:block;font-size:13px;color:var(--soft);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tpl-match .x-row .h{width:44px;height:44px;border-radius:50%;border:0;background:var(--bg);color:#D9C3B6;cursor:pointer;display:grid;place-items:center}
.tpl-match .x-row .h svg{width:20px}
.tpl-match .x-row .h[aria-pressed="true"]{color:var(--like);background:#FDE3EA}
@media (max-width:900px){.tpl-match .x-rows{grid-template-columns:minmax(0,1fr)}.tpl-match .x-dir{grid-template-columns:34px minmax(0,1fr);gap:10px}.tpl-match .x-az a{height:22px;font-size:11px}}

.tpl-match .x-cause{display:grid;grid-template-columns:minmax(0,.9fr) minmax(0,1.1fr);gap:0;border-radius:40px;overflow:hidden;background:var(--card);box-shadow:0 0 0 1px var(--line)}
.tpl-match .x-cause .ph{min-height:380px}
.tpl-match .x-cause .bd{padding:clamp(26px,4vw,56px);display:flex;flex-direction:column;gap:16px;justify-content:center}
.tpl-match .x-meter{height:16px;border-radius:99px;background:var(--bg);overflow:hidden;position:relative}
.tpl-match .x-meter i{position:absolute;inset:0 auto 0 0;width:0;border-radius:99px;background:linear-gradient(90deg,var(--like),#FF8A5B);transition:width 1.8s cubic-bezier(.2,.8,.2,1)}
.tpl-match .x-nums{display:flex;gap:28px;flex-wrap:wrap}
.tpl-match .x-nums b{display:block;font-size:28px;font-weight:800;letter-spacing:-.02em}
.tpl-match .x-nums span{font-size:13px;color:var(--soft);font-weight:600}
.tpl-match .x-btn{display:inline-flex;align-items:center;gap:10px;min-height:54px;padding:0 26px;border-radius:999px;background:var(--ink);color:var(--bg)!important;text-decoration:none;font-weight:800;align-self:flex-start}
.tpl-match .x-btn svg{width:18px}
@media (max-width:860px){.tpl-match .x-cause{grid-template-columns:minmax(0,1fr)}.tpl-match .x-cause .ph{min-height:260px}}
.tpl-match .x-ftr{padding-block:40px 110px;display:flex;justify-content:space-between;gap:18px;flex-wrap:wrap;color:var(--soft);font-size:14px;border-top:1px solid var(--line)}

.tpl-match .x-tbar{display:flex;flex-wrap:wrap;align-items:center;gap:8px 20px;padding:10px 18px;border-radius:999px;background:var(--card);box-shadow:0 0 0 1px var(--line);font-size:14px;color:var(--soft)}
.tpl-match .x-tbar > svg{width:20px;color:var(--brand)}
.tpl-match .x-tbar b{color:var(--ink)}
.tpl-match .x-tbar .pips{display:flex;gap:3px}
.tpl-match .x-tbar .pips i{width:16px;color:var(--line)}
.tpl-match .x-tbar .pips i.on{color:var(--like)}
.tpl-match .x-tbar .ac{margin-left:auto}
@media (max-width:760px){.tpl-match .x-tbar{border-radius:22px}.tpl-match .x-tbar .ac{margin-left:0}}
.tpl-match .x-acts{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-top:24px}
.tpl-match .x-acts .x-btn{margin:0;align-self:auto}
.tpl-match .x-acts p{width:100%;font-size:13px;color:var(--soft)}
.tpl-match .x-meta span.off svg{color:var(--soft)}
.tpl-match .x-eb{font-weight:800;color:var(--like);font-size:15px;margin-bottom:10px}
.tpl-match .x-hd{display:flex;justify-content:space-between;align-items:flex-end;gap:16px 30px;flex-wrap:wrap;margin-bottom:30px}
.tpl-match .x-pill{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:44px;padding:0 18px;border-radius:999px;background:var(--card);box-shadow:inset 0 0 0 1.5px var(--ink);color:var(--ink)!important;text-decoration:none;font-weight:800;font-size:14px;border:0;cursor:pointer}
.tpl-match .x-pill.big{min-height:54px;padding:0 24px;font-size:15px}
.tpl-match .x-empty{padding:34px;border-radius:28px;border:2px dashed var(--line);color:var(--soft);font-size:17px;line-height:1.6}
.tpl-match .x-needs{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
.tpl-match .x-need{display:grid;grid-template-columns:84px minmax(0,1fr) auto;gap:18px;align-items:center;padding:16px 18px;border-radius:28px;background:var(--card);box-shadow:0 0 0 1px var(--line)}
.tpl-match .x-need .ring{width:84px;height:84px;border-radius:50%;background:conic-gradient(var(--like) calc(var(--p) * 1%),var(--bg) 0);display:grid;place-items:center;position:relative}
.tpl-match .x-need .ring::before{content:"";position:absolute;inset:9px;border-radius:50%;background:var(--card)}
.tpl-match .x-need .ring b{position:relative;font-size:18px;font-weight:800}
.tpl-match .x-need .cat{font-size:12px;font-weight:800;color:var(--soft);text-transform:uppercase;letter-spacing:.08em}
.tpl-match .x-need > div > b{display:block;font-size:19px;font-weight:800;margin-top:2px}
.tpl-match .x-need p{font-size:14px;color:var(--soft);margin-top:2px}
@media (max-width:820px){.tpl-match .x-needs{grid-template-columns:minmax(0,1fr)}.tpl-match .x-need{grid-template-columns:64px minmax(0,1fr)}.tpl-match .x-need .ring{width:64px;height:64px}.tpl-match .x-need .x-pill{grid-column:1/-1}}
.tpl-match .x-prods{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:18px}
.tpl-match .x-prod{border-radius:32px;padding:18px 18px 20px;text-decoration:none;display:flex;flex-direction:column;gap:2px;transform:rotate(var(--r));transition:transform .4s cubic-bezier(.3,1.6,.5,1)}
.tpl-match .x-prod:hover{transform:rotate(0) translateY(-8px) scale(1.03)}
.tpl-match .x-prod .ph{aspect-ratio:1/1;margin-bottom:8px}
.tpl-match .x-prod b{font-size:19px;font-weight:800}
.tpl-match .x-prod span{font-size:13px;color:var(--soft);font-weight:600}
.tpl-match .x-prod em{font-style:normal;font-weight:800;font-size:16px;margin-top:6px}
@media (max-width:900px){.tpl-match .x-prods{grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}}
.tpl-match .x-help{position:relative;overflow:hidden;border-radius:44px;background:var(--like);color:#fff;text-align:center;padding:clamp(48px,8vw,110px) 20px}
.tpl-match .x-help .x-h2{color:#fff;position:relative}
.tpl-match .x-help p{position:relative;margin:16px auto 0;max-width:30em;font-size:18px;line-height:1.55;opacity:.92}
.tpl-match .x-btn.light{background:#fff;color:var(--like)!important;position:relative;margin-top:28px}
.tpl-match .x-btn.light svg{width:18px}
.tpl-match .x-help .hearts i{position:absolute;bottom:-40px;left:var(--x);width:calc(40px * var(--s));color:rgba(255,255,255,.22);animation:xFloat 7s linear infinite;animation-delay:var(--d)}
@keyframes xFloat{to{transform:translateY(-560px) rotate(25deg);opacity:0}}
.tpl-match .x-about{display:grid;grid-template-columns:minmax(0,.8fr) minmax(0,1.2fr);gap:40px;padding:clamp(26px,4vw,52px);border-radius:40px;background:var(--card);box-shadow:0 0 0 1px var(--line)}
@media (max-width:860px){.tpl-match .x-about{grid-template-columns:minmax(0,1fr);gap:16px}}
.tpl-match .x-revs{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px}
.tpl-match .x-rev{margin:0;padding:26px;border-radius:30px;background:var(--card);box-shadow:0 20px 40px -30px rgba(80,30,10,.5),0 0 0 1px var(--line);transform:rotate(var(--r));display:flex;flex-direction:column;gap:14px}
.tpl-match .x-rev .st{color:var(--like);letter-spacing:2px}
.tpl-match .x-rev blockquote{margin:0;font-size:18px;line-height:1.5;font-weight:500}
.tpl-match .x-rev figcaption{display:flex;align-items:center;gap:10px;font-weight:800;margin-top:auto}
.tpl-match .x-rev figcaption i{width:38px;height:38px;border-radius:50%;background:var(--like);color:#fff;display:grid;place-items:center;font-style:normal}
.tpl-match .x-rev figcaption span{margin-left:auto;color:var(--soft);font-weight:600;font-size:13px}
@media (max-width:900px){.tpl-match .x-revs{grid-template-columns:minmax(0,1fr)}.tpl-match .x-rev{transform:none}}
.tpl-match .x-ledger{border-radius:32px;background:var(--card);box-shadow:0 0 0 1px var(--line);padding:10px}
.tpl-match .x-lsum{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-bottom:6px}
.tpl-match .x-lsum div{background:var(--bg);border-radius:24px;padding:18px 20px}
.tpl-match .x-lsum span{font-size:13px;font-weight:700;color:var(--soft)}
.tpl-match .x-lsum b{display:block;font-size:clamp(20px,2.4vw,30px);font-weight:800;letter-spacing:-.02em}
.tpl-match .x-lsum .bal{background:var(--ink);color:var(--bg)}
.tpl-match .x-lsum .bal span{color:rgba(255,244,236,.6)}
.tpl-match .x-lrow{display:grid;grid-template-columns:44px minmax(0,1fr) auto;gap:14px;align-items:center;padding:14px 12px;border-top:1px solid var(--line)}
.tpl-match .x-lrow .ico{width:44px;height:44px;border-radius:50%;display:grid;place-items:center;font-weight:800;font-size:20px}
.tpl-match .x-lrow .ico.in{background:#DDF5E8;color:#1D8A55}.tpl-match .x-lrow .ico.out{background:#FDE3EA;color:var(--like)}
.tpl-match .x-lrow .c b{display:block;font-weight:700}
.tpl-match .x-lrow .c small{font-size:13px;color:var(--soft)}
.tpl-match .x-lrow .a{font-weight:800;white-space:nowrap}
.tpl-match .x-lrow .a.in{color:#1D8A55}
@media (max-width:700px){.tpl-match .x-lsum{grid-template-columns:minmax(0,1fr)}}
.tpl-match .x-contact{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);border-radius:40px;overflow:hidden;background:var(--card);box-shadow:0 0 0 1px var(--line)}
.tpl-match .x-contact .map{min-height:380px}
.tpl-match .x-contact .info{padding:clamp(24px,4vw,52px);display:flex;flex-direction:column;gap:18px}
.tpl-match .x-contact dl{margin:0;display:flex;flex-direction:column;gap:14px}
.tpl-match .x-contact dt{display:flex;align-items:center;gap:8px;font-size:13px;font-weight:800;color:var(--soft)}
.tpl-match .x-contact dt svg{width:16px;color:var(--like)}
.tpl-match .x-contact dd{margin:4px 0 0;font-size:17px;font-weight:600}
.tpl-match .x-contact .x-pill{align-self:flex-start}
@media (max-width:860px){.tpl-match .x-contact{grid-template-columns:minmax(0,1fr)}.tpl-match .x-contact .map{min-height:220px}}
.tpl-match .x-social{display:flex;flex-wrap:wrap;gap:16px 30px;align-items:center;justify-content:space-between}
.tpl-match .x-social p{color:var(--soft);max-width:30em}
.tpl-match .x-social p b{color:var(--ink)}
.tpl-match .x-social > div{display:flex;flex-wrap:wrap;gap:8px}
.tpl-match .x-social a{display:inline-flex;align-items:center;gap:8px;min-height:48px;padding:0 18px 0 14px;border-radius:999px;background:var(--card);box-shadow:0 0 0 1px var(--line);text-decoration:none;font-weight:700;transition:transform .3s cubic-bezier(.3,1.6,.5,1)}
.tpl-match .x-social a:hover{transform:translateY(-3px) rotate(-2deg)}
.tpl-match .x-social a svg{width:20px;color:var(--like)}
.tpl-match .ldg{border:0;padding:0;background:transparent;width:min(940px,calc(100vw - 24px));max-width:none;color:var(--ink)}
.tpl-match .ldg::backdrop{background:rgba(43,26,18,.6);backdrop-filter:blur(8px)}
.tpl-match .ldg-in{background:var(--card);border-radius:32px;padding:30px;position:relative;max-height:calc(100vh - 24px);overflow:auto;animation:xPop .45s cubic-bezier(.2,.9,.3,1.2)}
.tpl-match .ldg-k{font-weight:800;color:var(--like)}
.tpl-match .ldg-t{font-size:40px;font-weight:800;letter-spacing:-.03em}
.tpl-match .ldg-d{color:var(--soft)}
.tpl-match .ldg-sum{display:flex;gap:8px;flex-wrap:wrap;margin-top:16px}
.tpl-match .ldg-sum div{background:var(--bg);border-radius:18px;padding:12px 16px}
.tpl-match .ldg-sum span{display:block;font-size:12px;font-weight:700;color:var(--soft)}
.tpl-match .ldg-sum b{font-size:22px;font-weight:800}
.tpl-match .ldg-tw{overflow-x:auto;margin-top:16px}
.tpl-match .ldg table{width:100%;border-collapse:collapse;font-size:14px}
.tpl-match .ldg th,.tpl-match .ldg td{text-align:left;padding:12px 10px;border-bottom:1px solid var(--line)}
.tpl-match .ldg th{font-size:12px;color:var(--soft)}
.tpl-match .ldg .num{text-align:right;white-space:nowrap}
.tpl-match .ldg .lk{font-size:12px;font-weight:800;padding:4px 10px;border-radius:999px}
.tpl-match .ldg .lk.in{background:#DDF5E8;color:#1D8A55}.tpl-match .ldg .lk.out{background:#FDE3EA;color:var(--like)}
.tpl-match .ldg-x{position:absolute;top:14px;right:14px;width:44px;height:44px;border-radius:50%;border:0;background:var(--bg);cursor:pointer;display:grid;place-items:center}
.tpl-match .ldg-x svg{width:18px}

.tpl-match .x-cmp{border:0;padding:0;background:transparent;width:min(1000px,calc(100vw - 24px));max-width:none;color:var(--ink)}
.tpl-match .x-cmp::backdrop{background:rgba(43,26,18,.6);backdrop-filter:blur(8px)}
.tpl-match .x-cmp .in{background:var(--card);border-radius:32px;padding:28px;position:relative;animation:xPop .45s cubic-bezier(.2,.9,.3,1.2);max-height:calc(100vh - 24px);overflow:auto}
@keyframes xPop{from{opacity:0;transform:translateY(20px) scale(.96)}}
.tpl-match .x-cmp h3{font-size:30px;font-weight:800;letter-spacing:-.02em}
.tpl-match .x-cmp .cols{display:grid;grid-template-columns:120px repeat(var(--n),minmax(0,1fr));gap:0;margin-top:20px;font-size:15px}
.tpl-match .x-cmp .cols > div{padding:12px 10px;border-bottom:1px solid var(--line)}
.tpl-match .x-cmp .cols .k{color:var(--soft);font-weight:700;font-size:13px}
.tpl-match .x-cmp .cols .hd{border:0;padding-bottom:4px}
.tpl-match .x-cmp .cols .hd .ph{aspect-ratio:1/1;border-radius:20px;overflow:hidden;max-width:180px}
.tpl-match .x-cmp .cols .hd b{display:block;font-size:22px;font-weight:800;margin-top:10px}
.tpl-match .x-cmp .cols a{display:inline-flex;min-height:44px;align-items:center;padding:0 16px;border-radius:999px;background:var(--like);color:#fff;text-decoration:none;font-weight:800;font-size:14px}
.tpl-match .x-cmp .close{position:absolute;top:16px;right:16px;width:44px;height:44px;border-radius:50%;border:0;background:var(--bg);cursor:pointer;display:grid;place-items:center}
.tpl-match .x-cmp .close svg{width:18px}
@media (max-width:700px){.tpl-match .x-cmp .cols{grid-template-columns:80px repeat(var(--n),minmax(0,1fr));font-size:13px}.tpl-match .x-cmp .cols .hd b{font-size:16px}.tpl-match .x-cmp .in{padding:18px}}

.tpl-match dialog.sheet{border:0;padding:0;background:transparent;width:min(440px,calc(100vw - 24px));max-width:none}
.tpl-match dialog.sheet::backdrop{background:rgba(43,26,18,.6);backdrop-filter:blur(8px)}
.tpl-match .sh-in{background:var(--card);border-radius:32px;overflow:hidden;position:relative;animation:xPop .45s cubic-bezier(.2,.9,.3,1.2);max-height:calc(100vh - 24px);overflow-y:auto}
.tpl-match .sh-ph{aspect-ratio:1/1}
.tpl-match .sh-bd{padding:24px;display:flex;flex-direction:column;gap:12px}
.tpl-match .sh-k{font-size:13px;font-weight:700;color:var(--soft)}
.tpl-match .sh-n{font-size:44px;font-weight:800;letter-spacing:-.03em;line-height:1}
.tpl-match .sh-dl{display:flex;flex-wrap:wrap;gap:6px;margin:0}
.tpl-match .sh-dl div{display:flex;gap:6px;background:var(--bg);border-radius:999px;padding:8px 12px;font-size:14px}
.tpl-match .sh-dl dt{color:var(--soft)}
.tpl-match .sh-dl dd{margin:0;font-weight:700}
.tpl-match .sh-act{display:flex;gap:8px;flex-wrap:wrap}
.tpl-match .sh-b1,.tpl-match .sh-b2{min-height:50px;padding:0 20px;display:inline-flex;align-items:center;border-radius:999px;text-decoration:none;font-weight:800}
.tpl-match .sh-b1{background:var(--like);color:#fff}
.tpl-match .sh-b2{box-shadow:inset 0 0 0 1.5px var(--ink);color:var(--ink)}
.tpl-match .sh-x{position:absolute;top:14px;right:14px;width:44px;height:44px;border-radius:50%;border:0;background:#fff;cursor:pointer;display:grid;place-items:center;z-index:2}
.tpl-match .sh-x svg{width:18px}
.tpl-match .x-cause .ph{position:relative}
.tpl-match .x-contact.nomap{grid-template-columns:minmax(0,1fr)}
.tpl-match .x-contact .map{position:relative}
.tpl-match .x-contact .map iframe{position:absolute;inset:0}
.tpl-match .x-row a.t{text-decoration:none;color:inherit}
.tpl-match .x-logo .tpl-logo-img{width:100%;height:100%;object-fit:cover;border-radius:inherit}
`;

const DECKS: Record<string, (a: TplAnimal) => boolean> = {
  todos: () => true,
  perro: (a) => a.sp === 'perro',
  gato: (a) => a.sp === 'gato',
  otro: (a) => a.sp === 'otro',
  bebes: (a) => a.hasAge && a.months < 12,
  senior: (a) => a.stage === 'Senior',
  nuevos: (a) => a.isNew,
};

export const match: TemplateDesign = {
  id: 'match',
  fonts: 'family=Rethink+Sans:wght@400;500;600;700;800',
  css: CSS,
  html(m, KIT) {
    const { ORG, CAMPAIGN, ANIMALS, SHOW, BADGES, NEEDS, PRODUCTS, REVIEWS } = m;
    const n = m.COUNTS.total;
    const deckF = (
      [
        ['todos', 'Todos'],
        ['perro', 'Perros'],
        ['gato', 'Gatos'],
        ['otro', 'Otros'],
        ['bebes', 'Cachorros'],
        ['senior', 'Seniors'],
        ['nuevos', 'Nuevos'],
      ] as const
    ).filter(([f]) => f === 'todos' || ANIMALS.some(DECKS[f]));
    const t = KIT.transparencyParts();
    const map = mapEmbed(m);
    const initial = (name: string) => esc(unesc(name).charAt(0));
    const meta = (all: boolean) =>
      [
        ...(all ? BADGES : BADGES.slice(0, 2)).map(
          (b) => `<span class="${b.ok ? '' : 'off'}">${b.ok ? ic.check : ic.clock}${b.t}</span>`,
        ),
        ORG.city || ORG.type
          ? `<span>${ic.pin}${[all ? ORG.type : '', ORG.city].filter(Boolean).join(' · ')}</span>`
          : '',
      ].join('');
    return `
<header class="w x-top"><a class="x-logo" href="#x-deck"><i>${ORG.logo ? logoMark(m) : ic.paw}</i>${ORG.short}</a>
  <button type="button" class="x-fav" id="x-favbtn">${ic.heart}<span class="t">Tus favoritos</span> <b id="x-favn">0</b></button></header>
${SHOW.transparencia ? `<div class="w"><div class="x-tbar" data-sec="transparencia" role="group" aria-label="Transparencia">${ic.shield}<span><b>${t.level}</b></span><span>Formalización ${ORG.formalization}%</span><span>${t.accountability}</span><span class="ac">${t.note}</span></div></div>` : ''}
<section class="w x-hero" data-sec="animales">
  <div>
    <h1 class="x-h1"><span>Desliza.</span><span class="l">Enamórate.</span><span>Adopta.</span></h1>
    <p class="x-sub">${n ? `${countPhrase(m)} de ${ORG.name}, uno a la vez. Guarda a los que te gusten y compáralos antes de enviar tu solicitud.` : ORG.lede || availLine(m)}</p>
    <div class="x-acts" data-sec="acciones"><a class="x-btn" href="#x-deck" data-magnet>Adoptar ${ic.heart}</a><a class="x-pill big" href="#x-dir">Apadrinar</a><a class="x-pill big" href="${ORG.donateHref}">Donar</a><p>${COPY.adoptNote}</p></div>
    <div class="x-meta">${meta(false)}</div>
    ${n ? '<p class="x-how"><span><kbd>←</kbd>Pasar</span><span><kbd>→</kbd>Me gusta</span><span><kbd>↑</kbd>Ver ficha</span></p>' : ''}
  </div>
  <div class="x-play">
    ${deckF.length > 1 ? `<div class="x-filters" role="group" aria-label="Mazo">${deckF.map((f, i) => `<button type="button" data-f="${f[0]}" aria-pressed="${i === 0}">${f[1]}</button>`).join('')}</div>` : ''}
    <div class="x-deck" id="x-deck" aria-live="polite">${n ? '' : `<div class="x-end"><div><b>Sin animales por ahora</b>${EMPTY.animales}</div></div>`}</div>
    ${
      n
        ? `<div class="x-ctrl"><button type="button" class="undo" id="x-undo" aria-label="Deshacer">${ic.back}</button><button type="button" class="no" id="x-no" aria-label="Pasar">${ic.x}</button><button type="button" class="yes" id="x-yes" aria-label="Me gusta">${ic.heart}</button><button type="button" class="info" id="x-info" aria-label="Ver ficha">i</button></div>
    <p class="x-progress" id="x-prog"></p>`
        : ''
    }
  </div>
</section>
${
  n
    ? `<section class="w x-sec" id="x-dir" style="padding-top:20px">
  <h2 class="x-h2">¿Prefieres verlos a todos?</h2>
  <p class="x-sub" style="margin-top:12px">La lista completa, por nombre. Toca el corazón para guardarlo.</p>
  <div class="x-dir"><nav class="x-az" id="x-az" aria-label="Índice alfabético"></nav>
    <div><div class="x-tools"><label><span class="sr">Buscar</span>${ic.search}<input id="x-q" type="search" placeholder="Busca por nombre o raza" autocomplete="off"></label><span class="c" id="x-c"></span></div><div id="x-list"></div></div></div>
</section>`
    : ''
}
<section class="w x-sec" id="x-camp" data-sec="campana" style="padding-top:0">
  ${
    CAMPAIGN.active
      ? `<div class="x-cause"><div class="ph">${campaignArt(m)}</div>
    <div class="bd"><p style="font-weight:800;color:var(--like)">Campaña activa${CAMPAIGN.category ? ` · ${CAMPAIGN.category}` : ''}</p><h2 class="x-h2">${CAMPAIGN.title}</h2>
      ${CAMPAIGN.description ? `<p class="x-sub" style="margin:0">${CAMPAIGN.description}</p>` : ''}
      <p class="x-sub" style="margin:0">${COPY.adoptNote}</p>
      <div class="x-meter"><i id="x-meter"></i></div>
      <div class="x-nums"><div><b id="x-raised">${fmt(CAMPAIGN.raised)}</b><span>recaudado de ${fmt(CAMPAIGN.goal)}</span></div><div><b>${CAMPAIGN.pct}%</b><span>de la meta</span></div><div><b>${CAMPAIGN.deadline}</b><span>cierre</span></div></div>
      <a class="x-btn" href="${CAMPAIGN.href}" data-magnet>Ver campaña y aportar ${ic.arrow}</a>${KIT.moreCampaigns()}</div></div>`
      : `<h2 class="x-h2">Campaña activa</h2><p class="x-empty">${EMPTY.campana}</p>`
  }
</section>
<section class="w x-sec" data-sec="necesidades" style="padding-top:0"><div class="x-hd"><div><p class="x-eb">Necesita hoy</p><h2 class="x-h2">Haz match con lo que falta</h2></div></div>
  ${NEEDS.length ? `<div class="x-needs">${NEEDS.map((nd) => `<article class="x-need"><div class="ring" style="--p:${nd.pct}"><b>${nd.pct}%</b></div><div>${nd.category ? `<span class="cat">${nd.category}</span>` : ''}<b>${nd.title}</b><p>${nd.got} de ${nd.need} ${nd.unit}</p></div><a href="${nd.href}" class="x-pill">Ver y donar</a></article>`).join('')}</div>` : `<p class="x-empty">${EMPTY.necesidades}</p>`}
</section>
<section class="w x-sec" data-sec="productos" style="padding-top:0"><div class="x-hd"><div><p class="x-eb">Productos</p><h2 class="x-h2">Llévate algo, ayuda a todos</h2></div></div>
  ${PRODUCTS.length ? `<div class="x-prods">${PRODUCTS.map((p, k) => `<a class="x-prod" href="${p.href}" style="--r:${[-3, 2, -2, 3][k % 4]}deg;background:${p.tint}44"><div class="ph">${productArt(p)}</div><b>${p.name}</b>${p.category ? `<span>${p.category}</span>` : ''}<em>${fmt(p.price)}</em></a>`).join('')}</div>` : `<p class="x-empty">${EMPTY.productos}</p>`}
</section>
<section class="w x-sec" id="portal-help-cta" data-sec="ayuda" style="padding-top:0"><div class="x-help"><div class="hearts" aria-hidden="true">${Array.from({ length: 14 }, (_, k) => `<i style="--x:${(k * 37) % 100}%;--d:${(k % 7) * 0.6}s;--s:${0.6 + (k % 4) * 0.25}">${ic.heart}</i>`).join('')}</div><h2 class="x-h2">${COPY.helpTitle}</h2><p>${COPY.helpText}</p><a class="x-btn light" href="${ORG.donateHref}" data-magnet>${COPY.helpCta} ${ic.heart}</a></div></section>
${SHOW.nosotros ? `<section class="w x-sec" data-sec="nosotros" style="padding-top:0"><div class="x-about"><div><p class="x-eb">Sobre nosotros</p><h2 class="x-h2">${ORG.name}</h2></div><div><p class="x-sub" style="margin:0">${ORG.about}</p><div class="x-meta">${meta(true)}</div></div></div></section>` : ''}
<section class="w x-sec" data-sec="resenas" style="padding-top:0"><div class="x-hd"><div><p class="x-eb">Reseñas</p><h2 class="x-h2">Lo que dicen</h2></div><button type="button" class="x-pill big" data-review>Registrar reseña</button></div>
  ${REVIEWS.length ? `<div class="x-revs">${REVIEWS.map((r, k) => `<figure class="x-rev" style="--r:${[-2, 1.5, -1][k % 3]}deg"><span class="st" aria-label="${r.rating} de 5">${stars(r.rating)}</span>${r.text ? `<blockquote>${r.text}</blockquote>` : ''}<figcaption><i>${initial(r.name)}</i>${r.name}<span>${r.date}</span></figcaption></figure>`).join('')}</div>` : `<p class="x-empty">${EMPTY.resenas}</p>`}
</section>
<section class="w x-sec" data-sec="libro" style="padding-top:0"><div class="x-hd"><div><p class="x-eb">${COPY.ledgerTitle}</p><h2 class="x-h2">Cada peso, a la vista</h2><p class="x-sub" style="margin-top:10px">${COPY.ledgerText}</p></div><button type="button" class="x-pill big" data-ledger>Ver libro completo</button></div>
  <p class="x-empty">${EMPTY.libro}</p>
</section>
${
  SHOW.contacto
    ? `<section class="w x-sec" data-sec="contacto" style="padding-top:0"><div class="x-contact${map ? '' : ' nomap'}">${map ? `<div class="map">${map}</div>` : ''}<div class="info"><p class="x-eb">Información de contacto</p><h2 class="x-h2" style="font-size:clamp(30px,3.4vw,48px)">Ven a conocerlos</h2>
  ${KIT.contactRows('', true)}${mapLink(m, 'x-pill big')}</div></div></section>`
    : ''
}
${SHOW.redes ? `<section class="w" data-sec="redes" style="padding-bottom:60px"><div class="x-social"><p><b>${COPY.socialsTitle}.</b> ${COPY.socialsText}</p><div>${m.SOCIALS.map((x) => socialLink(x, `${ic[x.key]}<span>${x.label}</span>`)).join('')}</div></div></section>` : ''}
<footer class="w x-ftr"><span>${ORG.name}</span><span>Hecho con AdoptaFácil</span></footer>
<div class="x-tray" id="x-tray" aria-live="polite"><span class="av" id="x-av"></span><span class="lbl" id="x-lbl"></span><button type="button" id="x-cmpbtn">Comparar</button></div>
<dialog class="x-cmp" id="x-cmp" aria-label="Comparar favoritos"></dialog>`;
  },
  init(app, env) {
    const { m, motion, catalog } = env;
    const { signal } = motion;
    const A = m.ANIMALS;
    const byId = new Map(A.map((a) => [a.id, a]));
    const open = (a: TplAnimal | undefined) => {
      if (a) env.go(unesc(a.href));
    };
    const likes = new Set<string>();
    const deckEl = qs(app, '#x-deck');
    let deck: TplAnimal[] = [];
    let pos = 0;
    let hist: Array<[string, boolean]> = [];
    let fkey = 'todos';
    const favN = qs(app, '#x-favn');
    const trayEl = qs(app, '#x-tray');
    const avEl = qs(app, '#x-av');
    const lblEl = qs(app, '#x-lbl');
    const cmpBtn = qs(app, '#x-cmpbtn');
    const tray = () => {
      const L = [...likes].map((id) => byId.get(id)).filter((a): a is TplAnimal => Boolean(a));
      const n = L.length;
      if (favN) {
        favN.textContent = String(n);
        favN.classList.remove('bump');
        void favN.offsetWidth;
        favN.classList.add('bump');
        const tm = setTimeout(() => favN.classList.remove('bump'), 300);
        signal.addEventListener('abort', () => clearTimeout(tm));
      }
      trayEl?.classList.toggle('on', n > 0);
      if (avEl)
        avEl.innerHTML = L.slice(-4)
          .map((a) => `<span>${portrait(a, { decor: true, dx: 6, dy: 14, s: 1.1 })}</span>`)
          .join('');
      if (lblEl) lblEl.textContent = n === 1 ? '1 favorito' : `${n} favoritos`;
      if (cmpBtn) cmpBtn.textContent = n > 1 ? `Comparar ${Math.min(n, 3)}` : 'Ver';
      qsa(app, '.x-row .h').forEach((h) =>
        h.setAttribute('aria-pressed', String(likes.has(h.dataset.id ?? ''))),
      );
    };
    const cardHTML = (a: TplAnimal, k: number) =>
      `<article class="x-card${k === 0 ? ' top' : ''}" data-id="${a.id}" style="z-index:${10 - k};transform:translateY(${k * 14}px) scale(${1 - k * 0.05});${k > 2 ? 'opacity:0' : ''}" aria-label="${a.name}">
        <div class="ph">${portrait(a, { dx: 5, dy: 14, s: 0.9, decor: true })}</div>${a.isNew ? '<span class="new">Nuevo</span>' : ''}
        <span class="x-stamp yes">Me gusta</span><span class="x-stamp no">Paso</span><div class="gr"></div>
        <div class="tx"><h3>${a.name}<small>${a.age}</small></h3><p>${a.spLabel}${a.breed ? ` · ${a.breed}` : ''}</p><div class="tags"><span>${a.sizeLabel}</span>${a.stage ? `<span>${a.stage}</span>` : ''}${a.days ? `<span>${sinceLabel(a)}</span>` : ''}</div></div></article>`;
    const decide = (like: boolean, el = deckEl ? qs(deckEl, '.x-card.top') : null) => {
      const a = el ? byId.get(el.dataset.id ?? '') : undefined;
      if (!el || !a) return;
      if (like) likes.add(a.id);
      hist.push([a.id, like]);
      el.style.transition = 'transform .5s cubic-bezier(.3,.6,.4,1),opacity .5s';
      el.style.transform = `translate(${like ? 140 : -140}%, -6%) rotate(${like ? 24 : -24}deg)`;
      el.style.opacity = '0';
      const stamp = qs(el, like ? '.x-stamp.yes' : '.x-stamp.no');
      if (stamp) stamp.style.opacity = '1';
      pos++;
      tray();
      const tm = setTimeout(render, motion.reduce ? 0 : 320);
      signal.addEventListener('abort', () => clearTimeout(tm));
    };
    const bind = () => {
      const el = deckEl ? qs(deckEl, '.x-card.top') : null;
      if (!el) return;
      let sx = 0;
      let sy = 0;
      let dx = 0;
      let on = false;
      const yes = qs(el, '.x-stamp.yes');
      const no = qs(el, '.x-stamp.no');
      el.addEventListener(
        'pointerdown',
        (e) => {
          on = true;
          sx = e.clientX;
          sy = e.clientY;
          dx = 0;
          el.classList.add('drag');
          el.setPointerCapture(e.pointerId);
        },
        { signal },
      );
      el.addEventListener(
        'pointermove',
        (e) => {
          if (!on) return;
          dx = e.clientX - sx;
          const dy = (e.clientY - sy) * 0.3;
          el.style.transform = `translate(${dx}px,${dy}px) rotate(${dx / 18}deg)`;
          if (yes) yes.style.opacity = String(Math.max(0, Math.min(1, dx / 100)));
          if (no) no.style.opacity = String(Math.max(0, Math.min(1, -dx / 100)));
        },
        { signal },
      );
      const up = () => {
        if (!on) return;
        on = false;
        el.classList.remove('drag');
        if (Math.abs(dx) > 110) decide(dx > 0, el);
        else if (Math.abs(dx) < 4) open(byId.get(el.dataset.id ?? ''));
        else {
          el.style.transform = '';
          if (yes) yes.style.opacity = '0';
          if (no) no.style.opacity = '0';
        }
      };
      el.addEventListener('pointerup', up, { signal });
      el.addEventListener('pointercancel', up, { signal });
    };
    function render() {
      if (!deckEl) return;
      const rest = deck.slice(pos, pos + 3);
      deckEl.innerHTML = rest.length
        ? rest.map(cardHTML).reverse().join('')
        : `<div class="x-end"><div><b>Viste a todos los de este mazo</b>Revisa tus favoritos o cambia de mazo arriba.</div></div>`;
      const prog = qs(app, '#x-prog');
      if (prog)
        prog.innerHTML = deck.length
          ? `<b>${Math.min(pos + 1, deck.length)}</b> de <b>${deck.length}</b> en este mazo`
          : '';
      bind();
    }
    const build = () => {
      deck = catalog.query({ sort: 'recientes' }).filter(DECKS[fkey] ?? DECKS.todos);
      pos = 0;
      hist = [];
      render();
    };
    if (A.length) {
      qs(app, '#x-yes')?.addEventListener('click', () => decide(true), { signal });
      qs(app, '#x-no')?.addEventListener('click', () => decide(false), { signal });
      qs(app, '#x-info')?.addEventListener(
        'click',
        () => {
          const el = deckEl ? qs(deckEl, '.x-card.top') : null;
          if (el) open(byId.get(el.dataset.id ?? ''));
        },
        { signal },
      );
      qs(app, '#x-undo')?.addEventListener(
        'click',
        () => {
          const h = hist.pop();
          if (!h) return;
          if (h[1]) likes.delete(h[0]);
          pos = Math.max(0, pos - 1);
          tray();
          render();
        },
        { signal },
      );
      addEventListener(
        'keydown',
        (e) => {
          const target = e.target as Element | null;
          if (target?.closest?.('input,textarea,select,dialog,[contenteditable]') || !deckEl)
            return;
          const r = deckEl.getBoundingClientRect();
          if (r.bottom < 0 || r.top > innerHeight) return;
          if (e.key === 'ArrowRight') {
            e.preventDefault();
            decide(true);
          } else if (e.key === 'ArrowLeft') {
            e.preventDefault();
            decide(false);
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            qs(app, '#x-info')?.click();
          }
        },
        { signal },
      );
      qs(app, '.x-filters')?.addEventListener(
        'click',
        (e) => {
          const b = (e.target as Element).closest<HTMLElement>('button');
          if (!b) return;
          fkey = b.dataset.f ?? 'todos';
          qsa(app, '.x-filters button').forEach((x) =>
            x.setAttribute('aria-pressed', String(x === b)),
          );
          build();
        },
        { signal },
      );
    }

    // Directorio A–Z
    const listEl = qs(app, '#x-list');
    const azEl = qs(app, '#x-az');
    const cEl = qs(app, '#x-c');
    const LET = 'ABCDEFGHIJKLMNÑOPQRSTUVWXYZ'.split('');
    const dir = (q = '') => {
      if (!listEl || !azEl) return;
      const L = catalog.query({ q, sort: 'nombre' });
      const g: Record<string, TplAnimal[]> = {};
      L.forEach((a) => {
        const raw = unesc(a.name).charAt(0).toUpperCase();
        const k = raw === 'Ñ' ? 'Ñ' : norm(raw).toUpperCase();
        const key = LET.includes(k) ? k : '#';
        (g[key] = g[key] || []).push(a);
      });
      const keys = [...LET, '#'].filter((k) => g[k]);
      listEl.innerHTML =
        keys
          .map(
            (k, gi) =>
              `<div class="x-grp"><h3 id="x-l-${gi}">${esc(k)}</h3><div class="x-rows">${g[k]
                .map(
                  (a) =>
                    `<div class="x-row"><a class="a" href="${a.href}" aria-label="Ver a ${a.name}">${portrait(a, { decor: true, dx: 6, dy: 14, s: 1.1 })}</a><a class="t" href="${a.href}"><b>${a.name}</b><span>${[a.spLabel, a.age, a.sizeLabel, a.breed].filter(Boolean).join(' · ')}</span></a><button type="button" class="h" data-id="${a.id}" aria-pressed="${likes.has(a.id)}" aria-label="Guardar a ${a.name}">${ic.heart}</button></div>`,
                )
                .join('')}</div></div>`,
          )
          .join('') || `<p class="x-sub">Nadie con ese nombre. Prueba otra búsqueda.</p>`;
      azEl.innerHTML = LET.map((k) => {
        const gi = keys.indexOf(k);
        return gi >= 0
          ? `<a href="#x-l-${gi}">${k}</a>`
          : `<a class="dim" aria-disabled="true">${k}</a>`;
      }).join('');
      if (cEl) cEl.textContent = `${L.length} de ${A.length}`;
    };
    dir();
    qs<HTMLInputElement>(app, '#x-q')?.addEventListener(
      'input',
      (e) => dir((e.target as HTMLInputElement).value),
      { signal },
    );
    listEl?.addEventListener(
      'click',
      (e) => {
        const b = (e.target as Element).closest<HTMLElement>('button.h');
        const id = b?.dataset.id;
        if (!id) return;
        if (likes.has(id)) likes.delete(id);
        else likes.add(id);
        tray();
      },
      { signal },
    );
    azEl?.addEventListener(
      'click',
      (e) => {
        const a = (e.target as Element).closest('a');
        if (!a) return;
        e.preventDefault();
        e.stopPropagation();
        const href = a.getAttribute('href');
        const tgt = href ? qs(app, href) : null;
        tgt?.scrollIntoView({ behavior: motion.reduce ? 'auto' : 'smooth' });
      },
      { signal },
    );

    // Comparador
    const cmp = qs<HTMLDialogElement>(app, '#x-cmp');
    const compare = () => {
      const L = [...likes]
        .slice(-3)
        .map((id) => byId.get(id))
        .filter((a): a is TplAnimal => Boolean(a));
      if (!L.length || !cmp) return;
      const rows: Array<[string, (a: TplAnimal) => string]> = [
        ['Especie', (a) => a.spLabel],
        ['Edad', (a) => a.age],
        ['Tamaño', (a) => a.sizeLabel],
        ['Raza', (a) => a.breed || '—'],
        ['Etapa', (a) => a.stage || '—'],
        ['Publicado', (a) => (a.days ? sinceLabel(a) : '—')],
      ];
      cmp.innerHTML = `<div class="in"><button class="close" type="button" aria-label="Cerrar">${ic.close}</button><h3>${L.length > 1 ? 'Compáralos' : 'Tu favorito'}</h3>
        <div class="cols" style="--n:${L.length}"><div class="hd"></div>${L.map((a) => `<div class="hd"><div class="ph">${portrait(a, { decor: true })}</div><b>${a.name}</b></div>`).join('')}
        ${rows.map(([k, f]) => `<div class="k">${k}</div>${L.map((a) => `<div>${f(a)}</div>`).join('')}`).join('')}
        <div class="k"></div>${L.map((a) => `<div><a href="${a.href}">Ver ficha</a></div>`).join('')}</div></div>`;
      qs(cmp, '.close')?.addEventListener('click', () => cmp.close(), { signal });
      qsa(cmp, 'a').forEach((a) => a.addEventListener('click', () => cmp.close(), { signal }));
      cmp.showModal();
    };
    cmp?.addEventListener(
      'click',
      (e) => {
        if (e.target === cmp) cmp.close();
      },
      { signal },
    );
    cmpBtn?.addEventListener('click', compare, { signal });
    qs(app, '#x-favbtn')?.addEventListener(
      'click',
      () =>
        likes.size
          ? compare()
          : deckEl?.scrollIntoView({
              behavior: motion.reduce ? 'auto' : 'smooth',
              block: 'center',
            }),
      { signal },
    );
    signal.addEventListener('abort', () => {
      if (cmp?.open) cmp.close();
    });

    if (A.length) build();
    const meter = qs(app, '#x-meter');
    if (meter) {
      const fill = () => (meter.style.width = Math.max(2, m.CAMPAIGN.pct) + '%');
      if (typeof IntersectionObserver !== 'function') fill();
      motion.observe(
        [meter],
        (en, io) => {
          if (en.isIntersecting) {
            fill();
            io.disconnect();
          }
        },
        { threshold: 0.5 },
      );
      motion.countUp(qs(app, '#x-raised'), m.CAMPAIGN.raised, fmt);
    }
    motion.magnet(app);
  },
};
