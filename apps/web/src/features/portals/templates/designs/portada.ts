import { ledgerBlock } from '../engine/ledger';
import { COPY, EMPTY, type TplAnimal, type TplModel } from '../engine/model';
import {
  campaignArt,
  countPhrase,
  fmt,
  ic,
  mapEmbed,
  mapLink,
  portrait,
  productArt,
  qs,
  qsa,
  sinceLabel,
  socialLink,
  stars,
  verb,
} from '../engine/runtime';
import { esc } from '../engine/safe';
import type { TemplateDesign } from '../engine/types';

const CSS = `
.tpl-portada{--paper:#F2EDE4;--ink:#171513;--soft:#6E675D;--rule:rgba(23,21,19,.18);--hi:var(--brand);font-family:'Space Grotesk',system-ui,sans-serif;color:var(--ink);background:var(--paper);overflow-x:clip}
.tpl-portada a{color:inherit}
.tpl-portada .r-s{font-family:'Instrument Serif',Georgia,serif;font-weight:400}
.tpl-portada .r-m{font-family:'Geist Mono',monospace;font-size:11px;letter-spacing:.16em;text-transform:uppercase}
.tpl-portada .r-sec{padding-block:clamp(70px,9vw,130px);border-top:1px solid var(--ink)}
.tpl-portada .r-hd{display:grid;grid-template-columns:120px minmax(0,1fr) auto;gap:20px;align-items:end;padding-bottom:26px;border-bottom:1px solid var(--rule);margin-bottom:40px}
.tpl-portada .r-hd .pg{font-family:'Geist Mono',monospace;font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:var(--soft);align-self:start;padding-top:12px}
.tpl-portada .r-hd h2{font-family:'Instrument Serif',serif;font-weight:400;font-size:clamp(46px,6.6vw,104px);line-height:.9;letter-spacing:-.02em}
.tpl-portada .r-hd h2 em{color:var(--hi)}
.tpl-portada .r-hd p{max-width:22em;color:var(--soft);line-height:1.55;font-size:15px}
@media (max-width:760px){.tpl-portada .r-hd{grid-template-columns:minmax(0,1fr);gap:10px}.tpl-portada .r-hd .pg{padding:0}}
.tpl-portada .r-btn{display:inline-flex;align-items:center;gap:12px;min-height:52px;padding:0 24px;background:var(--ink);color:var(--paper)!important;text-decoration:none;font-weight:500;font-size:15px;border:0;cursor:pointer;transition:background .3s}
.tpl-portada .r-btn:hover{background:var(--hi)}
.tpl-portada .r-btn svg{width:16px}
.tpl-portada .r-btn.o{background:transparent;color:var(--ink)!important;box-shadow:inset 0 0 0 1px var(--ink)}
.tpl-portada .r-btn.o:hover{background:var(--ink);color:var(--paper)!important}
.tpl-portada .r-lnk{display:inline-flex;align-items:center;gap:8px;font:inherit;font-size:14px;font-weight:500;background:none;border:0;padding:0 0 3px;cursor:pointer;text-decoration:none;color:var(--ink);background-image:linear-gradient(currentColor,currentColor);background-size:100% 1px;background-repeat:no-repeat;background-position:0 100%;transition:background-size .4s}
.tpl-portada .r-lnk:hover{background-size:0 1px;background-position:100% 100%}
.tpl-portada .r-lnk svg{width:14px}
.tpl-portada .r-empty{padding:30px 0;border-block:1px solid var(--rule);font-family:'Instrument Serif',serif;font-size:clamp(22px,2.2vw,30px);line-height:1.35;color:var(--soft);max-width:30em}
.tpl-portada .r-top{display:flex;align-items:center;gap:22px;padding-block:14px;border-bottom:1px solid var(--ink);font-size:13px}
.tpl-portada .r-top .ed{margin-right:auto;color:var(--soft)}
.tpl-portada .r-top nav{display:flex;gap:22px}
.tpl-portada .r-top nav a,.tpl-portada .r-top nav button{text-decoration:none;background:none;border:0;padding:0;cursor:pointer;font:inherit}
.tpl-portada .r-top nav a:hover,.tpl-portada .r-top nav button:hover{color:var(--hi)}
@media (max-width:860px){.tpl-portada .r-top nav{display:none}.tpl-portada .r-top .ed{font-size:11px}}
.tpl-portada .r-mast{font-family:'Instrument Serif',serif;font-weight:400;font-size:clamp(64px,15.2vw,232px);line-height:.82;letter-spacing:-.035em;text-align:center;padding-block:26px 18px;border-bottom:1px solid var(--ink);white-space:nowrap;overflow:hidden}
.tpl-portada .r-mast span{display:inline-block;transform:translateY(105%);transition:transform 1.2s cubic-bezier(.2,.8,.2,1)}
.tpl-portada .r-mast.in span{transform:none}
.tpl-portada .r-mast em{color:var(--hi)}
.tpl-portada .r-strap span:first-child{}
@media (max-width:640px){.tpl-portada .r-strap span:first-child{display:none}.tpl-portada .r-folio{display:none}}
.tpl-portada .r-strap{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;padding-block:10px;border-bottom:3px double var(--ink)}
.tpl-portada .r-cover{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.25fr) minmax(0,1fr);gap:clamp(20px,3vw,48px);padding-block:40px 70px}
.tpl-portada .r-lines{display:flex;flex-direction:column;gap:26px}
.tpl-portada .r-line{text-decoration:none;display:block;padding-bottom:22px;border-bottom:1px solid var(--rule)}
.tpl-portada .r-line .r-m{color:var(--hi)}
.tpl-portada .r-line b{display:block;font-family:'Instrument Serif',serif;font-weight:400;font-size:clamp(28px,2.6vw,40px);line-height:1;margin-top:8px}
.tpl-portada .r-line p{margin-top:8px;color:var(--soft);font-size:14px;line-height:1.5}
.tpl-portada .r-line:hover b{color:var(--hi)}
.tpl-portada .r-fig{position:relative}
.tpl-portada .r-fig .ph{aspect-ratio:4/5.2;border-radius:999px 999px 0 0;overflow:hidden;clip-path:inset(100% 0 0 0);transition:clip-path 1.6s cubic-bezier(.7,0,.2,1) .2s}
.tpl-portada .r-fig.in .ph{clip-path:inset(0 0 0 0)}
.tpl-portada .r-fig .ph svg{transform:scale(1.15);transition:transform 2.4s cubic-bezier(.2,.8,.2,1) .2s}
.tpl-portada .r-fig.in .ph svg{transform:none}
.tpl-portada .r-fig figcaption{display:flex;justify-content:space-between;margin-top:12px;font-size:13px;color:var(--soft)}
.tpl-portada .r-stamp{position:absolute;right:-14px;top:22px;width:118px;height:118px;border-radius:50%;background:var(--hi);color:#fff;display:grid;place-items:center;text-align:center;transform:rotate(12deg);font-family:'Instrument Serif',serif;font-size:19px;line-height:1.05;padding:14px;box-shadow:0 10px 30px rgba(0,0,0,.2)}
.tpl-portada .r-stamp b{display:block;font-size:44px;font-weight:400;line-height:.9}
.tpl-portada .r-toc h3{font-family:'Geist Mono',monospace;font-size:11px;letter-spacing:.16em;text-transform:uppercase;font-weight:400;padding-bottom:12px;border-bottom:1px solid var(--ink)}
.tpl-portada .r-toc ol{list-style:none;margin:0;padding:0}
.tpl-portada .r-toc a{display:grid;grid-template-columns:30px minmax(0,1fr) auto;gap:10px;align-items:baseline;padding:9px 0;border-bottom:1px solid var(--rule);text-decoration:none;font-size:15px;transition:padding .3s,color .3s}
.tpl-portada .r-toc a:hover{padding-left:8px;color:var(--hi)}
.tpl-portada .r-toc a i{font-style:normal;font-family:'Geist Mono',monospace;font-size:11px;color:var(--soft)}
.tpl-portada .r-toc .sl{display:flex;flex-wrap:wrap;gap:6px;margin-top:20px}
.tpl-portada .r-toc .sl span{font-family:'Geist Mono',monospace;font-size:10px;letter-spacing:.1em;text-transform:uppercase;padding:6px 9px;box-shadow:inset 0 0 0 1px var(--ink)}
.tpl-portada .r-toc .sl span.ok{background:var(--ink);color:var(--paper)}
@media (max-width:1000px){.tpl-portada .r-cover{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}.tpl-portada .r-fig{grid-row:1;grid-column:1/3;max-width:520px;width:100%;margin-inline:auto}}
@media (max-width:640px){.tpl-portada .r-cover{grid-template-columns:minmax(0,1fr)}.tpl-portada .r-fig{grid-column:1}.tpl-portada .r-stamp{right:4px;width:96px;height:96px;font-size:15px}.tpl-portada .r-stamp b{font-size:34px}}
.tpl-portada .r-note{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:20px;align-items:center;padding:18px 22px;margin-bottom:-1px;border:1px solid var(--ink);background:#fff}
.tpl-portada .r-note .lv{font-family:'Instrument Serif',serif;font-size:44px;line-height:1}
.tpl-portada .r-note .lv small{font-size:20px;color:var(--soft)}
.tpl-portada .r-note p{font-size:14px;line-height:1.5}
.tpl-portada .r-note b{font-weight:600}
@media (max-width:760px){.tpl-portada .r-note{grid-template-columns:auto minmax(0,1fr)}.tpl-portada .r-note .r-m{grid-column:1/3}}
.tpl-portada .r-acts{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));border-top:1px solid var(--ink)}
.tpl-portada .r-act{padding:30px 28px 34px 0;display:flex;flex-direction:column;gap:12px;text-decoration:none}
.tpl-portada .r-act + .r-act{padding-left:28px;border-left:1px solid var(--rule)}
.tpl-portada .r-act .n{font-family:'Instrument Serif',serif;font-size:90px;line-height:.8;color:var(--hi)}
.tpl-portada .r-act b{font-family:'Instrument Serif',serif;font-weight:400;font-size:44px;line-height:1}
.tpl-portada .r-act p{color:var(--soft);line-height:1.55;max-width:22em}
.tpl-portada .r-act .r-lnk{margin-top:auto;align-self:flex-start}
.tpl-portada .r-adn{margin-top:22px;font-size:13px;color:var(--soft)}
@media (max-width:860px){.tpl-portada .r-acts{grid-template-columns:minmax(0,1fr)}.tpl-portada .r-act + .r-act{padding-left:0;border-left:0;border-top:1px solid var(--rule)}}
.tpl-portada .r-pin{position:relative;border-top:1px solid var(--ink)}
.tpl-portada .r-pin .stk{position:sticky;top:var(--bar);height:calc(100vh - var(--bar));display:flex;flex-direction:column;justify-content:center;overflow:hidden}
.tpl-portada .r-pin .w.h{display:flex;justify-content:space-between;align-items:flex-end;gap:20px;width:100%;margin-bottom:30px}
.tpl-portada .r-pin h2{font-family:'Instrument Serif',serif;font-weight:400;font-size:clamp(46px,6vw,96px);line-height:.9}
.tpl-portada .r-pin h2 em{color:var(--hi)}
.tpl-portada .r-track{display:flex;gap:28px;padding-inline:max(16px,calc((100vw - 1320px)/2 + 40px));will-change:transform}
.tpl-portada .r-plate{flex:0 0 auto;width:clamp(240px,23vw,340px);background:none;border:0;padding:0;text-align:left;cursor:pointer;color:var(--ink)}
.tpl-portada .r-plate .ph{aspect-ratio:3/4;overflow:hidden;border-radius:999px 999px 0 0}
.tpl-portada .r-plate:nth-child(3n+2) .ph{border-radius:0}
.tpl-portada .r-plate:nth-child(3n) .ph{border-radius:50%;aspect-ratio:1/1;margin-top:24%}
.tpl-portada .r-plate .ph svg{transition:transform 1s cubic-bezier(.2,.8,.2,1)}
.tpl-portada .r-plate:hover .ph svg{transform:scale(1.06)}
.tpl-portada .r-plate .cap{display:flex;justify-content:space-between;gap:10px;margin-top:14px;padding-top:10px;border-top:1px solid var(--ink)}
.tpl-portada .r-plate b{font-family:'Instrument Serif',serif;font-weight:400;font-size:30px;line-height:1}
.tpl-portada .r-plate span{font-size:13px;color:var(--soft)}
.tpl-portada .r-prog{height:1px;background:var(--rule);margin-top:34px}
.tpl-portada .r-prog i{display:block;height:100%;width:0;background:var(--ink)}
@media (max-width:899px){.tpl-portada .r-pin{height:auto!important}.tpl-portada .r-pin .stk{position:static;height:auto;padding-block:70px}.tpl-portada .r-track{overflow-x:auto;scroll-snap-type:x mandatory;scrollbar-width:none;transform:none!important}.tpl-portada .r-track::-webkit-scrollbar{display:none}.tpl-portada .r-plate{scroll-snap-align:start;width:72vw}.tpl-portada .r-prog{display:none}}
.tpl-portada .r-cls .bar{display:flex;flex-wrap:wrap;align-items:center;gap:6px 18px;padding-bottom:16px;border-bottom:3px double var(--ink)}
.tpl-portada .r-cls .bar button{background:none;border:0;padding:6px 0;font:inherit;font-size:14px;cursor:pointer;color:var(--soft)}
.tpl-portada .r-cls .bar button[aria-pressed="true"]{color:var(--ink);text-decoration:underline;text-decoration-color:var(--hi);text-decoration-thickness:2px;text-underline-offset:6px}
.tpl-portada .r-cls .bar label{margin-left:auto;display:flex;align-items:center;gap:8px;border-bottom:1px solid var(--ink);padding:4px 0}
.tpl-portada .r-cls .bar svg{width:16px}
.tpl-portada .r-cls .bar input{border:0;background:transparent;outline:0;font-size:15px;width:180px}
.tpl-portada .r-cols{columns:4 240px;column-gap:34px;column-rule:1px solid var(--rule);margin-top:26px}
.tpl-portada .r-ad{break-inside:avoid;display:block;width:100%;text-align:left;background:none;border:0;padding:12px 0 14px;border-bottom:1px solid var(--rule);cursor:pointer;color:var(--ink);font-size:14px;line-height:1.5}
.tpl-portada .r-ad b{font-family:'Instrument Serif',serif;font-weight:400;font-size:24px;line-height:1;letter-spacing:-.005em;display:block;margin-bottom:4px;transition:color .2s}
.tpl-portada .r-ad b small{font-family:'Geist Mono',monospace;font-size:10px;letter-spacing:.12em;color:var(--hi);margin-left:8px;vertical-align:middle}
.tpl-portada .r-ad:hover b{color:var(--hi)}
.tpl-portada .r-ad span{color:var(--soft)}
.tpl-portada .r-cn{display:flex;justify-content:space-between;align-items:center;gap:14px;margin-top:22px;font-size:13px;color:var(--soft)}
.tpl-portada .r-peek{position:fixed;left:0;top:0;z-index:120;width:190px;aspect-ratio:3/4;border-radius:999px 999px 0 0;overflow:hidden;pointer-events:none;opacity:0;transform:translate(-50%,-50%) scale(.6);transition:opacity .25s,transform .35s cubic-bezier(.2,.8,.2,1);box-shadow:0 30px 60px -20px rgba(0,0,0,.4)}
.tpl-portada .r-peek.on{opacity:1}
.tpl-portada .r-folio{position:fixed;left:max(16px,2vw);bottom:18px;z-index:110;font-family:'Geist Mono',monospace;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#171513;background:#F2EDE4;padding:7px 10px;box-shadow:inset 0 0 0 1px #171513;opacity:0;transition:opacity .4s}
.tpl-portada .r-folio.on{opacity:1}
.tpl-portada .r-rep{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,1fr);gap:clamp(30px,5vw,80px)}
.tpl-portada .r-rep .lede{font-family:'Instrument Serif',serif;font-size:clamp(24px,2.4vw,34px);line-height:1.3}
.tpl-portada .r-rep .body{columns:2 220px;column-gap:28px;margin-top:26px;font-size:15px;line-height:1.7;color:#3A352F}
.tpl-portada .r-rep .body p + p{margin-top:12px}
.tpl-portada .r-rep .body p:first-child::first-letter{float:left;font-family:'Instrument Serif',serif;font-size:76px;line-height:.8;padding:6px 10px 0 0;color:var(--hi)}
.tpl-portada .r-quote{border-top:1px solid var(--ink);padding-top:20px}
.tpl-portada .r-quote .big{font-family:'Instrument Serif',serif;font-size:clamp(110px,14vw,220px);line-height:.8;letter-spacing:-.04em}
.tpl-portada .r-quote .big small{font-size:.4em;color:var(--hi)}
.tpl-portada .r-rule{position:relative;height:30px;margin-top:20px;border-bottom:1px solid var(--ink)}
.tpl-portada .r-rule i{position:absolute;left:0;bottom:-1px;height:5px;width:0;background:var(--hi);transition:width 2s cubic-bezier(.2,.8,.2,1)}
.tpl-portada .r-rule span{position:absolute;bottom:8px;font-family:'Geist Mono',monospace;font-size:10px;color:var(--soft);transform:translateX(-50%)}
.tpl-portada .r-rule span::after{content:"";position:absolute;left:50%;top:16px;height:6px;border-left:1px solid var(--ink)}
.tpl-portada .r-kv{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));margin-top:30px;border-top:1px solid var(--rule)}
.tpl-portada .r-kv div{padding:16px 0}
.tpl-portada .r-kv div + div{padding-left:18px;border-left:1px solid var(--rule)}
.tpl-portada .r-kv b{display:block;font-family:'Instrument Serif',serif;font-weight:400;font-size:30px}
.tpl-portada .r-kv span{font-size:12px;color:var(--soft)}
@media (max-width:900px){.tpl-portada .r-rep{grid-template-columns:minmax(0,1fr)}}
.tpl-portada .r-rcpt{max-width:860px;margin-inline:auto;background:#fff;padding:clamp(24px,4vw,46px);box-shadow:0 1px 0 var(--rule),0 30px 60px -40px rgba(0,0,0,.4);-webkit-mask:radial-gradient(8px at 50% 0,transparent 98%,#000) 0 0/18px 51% repeat-x,radial-gradient(8px at 50% 100%,transparent 98%,#000) 0 100%/18px 51% repeat-x;mask:radial-gradient(8px at 50% 0,transparent 98%,#000) 0 0/18px 51% repeat-x,radial-gradient(8px at 50% 100%,transparent 98%,#000) 0 100%/18px 51% repeat-x}
.tpl-portada .r-rcpt h3{font-family:'Geist Mono',monospace;font-size:12px;letter-spacing:.2em;text-transform:uppercase;text-align:center;font-weight:400;padding-bottom:16px;border-bottom:1px dashed var(--ink)}
.tpl-portada .r-it{display:grid;grid-template-columns:minmax(0,auto) minmax(20px,1fr) auto;gap:10px;align-items:baseline;padding:18px 0 6px}
.tpl-portada .r-it b{font-family:'Instrument Serif',serif;font-weight:400;font-size:26px;line-height:1.1}
.tpl-portada .r-it .dots{border-bottom:2px dotted var(--rule);transform:translateY(-6px)}
.tpl-portada .r-it .q{font-family:'Geist Mono',monospace;font-size:14px;white-space:nowrap}
.tpl-portada .r-it2{display:flex;align-items:center;gap:14px;padding-bottom:16px;border-bottom:1px dashed var(--rule);font-size:13px;color:var(--soft)}
.tpl-portada .r-it2 .bar{flex:1;height:3px;background:var(--rule)}
.tpl-portada .r-it2 .bar i{display:block;height:100%;width:0;background:var(--ink);transition:width 1.8s cubic-bezier(.2,.8,.2,1)}
.tpl-portada .r-it2 a{color:var(--hi);font-weight:600;text-decoration:none}
.tpl-portada .r-prods{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:28px}
.tpl-portada .r-pr{text-decoration:none;display:flex;flex-direction:column;gap:4px}
.tpl-portada .r-pr .ph{aspect-ratio:4/5;background:#E8E1D5;display:grid;place-items:center;padding:16%;transition:background .4s}
.tpl-portada .r-pr:hover .ph{background:#fff}
.tpl-portada .r-pr .ph svg{width:100%;height:100%;transition:transform .8s cubic-bezier(.2,.8,.2,1)}
.tpl-portada .r-pr:hover .ph svg{transform:rotate(-4deg) scale(1.06)}
.tpl-portada .r-pr .lm{display:flex;justify-content:space-between;margin-top:10px;padding-top:8px;border-top:1px solid var(--ink)}
.tpl-portada .r-pr b{font-family:'Instrument Serif',serif;font-weight:400;font-size:26px;line-height:1.05}
.tpl-portada .r-pr .pz{font-family:'Geist Mono',monospace;font-size:13px}
@media (max-width:1000px){.tpl-portada .r-prods{grid-template-columns:repeat(2,minmax(0,1fr))}}
.tpl-portada .r-help{background:var(--hi);color:#fff;padding-block:clamp(90px,12vw,170px);border-top:1px solid var(--ink)}
.tpl-portada .r-help .r-m{opacity:.8}
.tpl-portada .r-help h2{font-family:'Instrument Serif',serif;font-style:italic;font-weight:400;font-size:clamp(56px,9.4vw,160px);line-height:.88;letter-spacing:-.03em;margin-top:20px;max-width:9em}
.tpl-portada .r-help .row{display:flex;justify-content:space-between;align-items:flex-end;gap:30px;flex-wrap:wrap;margin-top:40px;padding-top:24px;border-top:1px solid rgba(255,255,255,.5)}
.tpl-portada .r-help p{max-width:30em;font-size:18px;line-height:1.6}
.tpl-portada .r-help .r-btn{background:#fff;color:var(--ink)!important}
.tpl-portada .r-help .r-btn:hover{background:var(--ink);color:#fff!important}
.tpl-portada .r-ed{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,2fr);gap:clamp(24px,4vw,60px)}
.tpl-portada .r-ed .txt{columns:2 260px;column-gap:34px;font-size:17px;line-height:1.7}
.tpl-portada .r-ed .txt::first-letter{float:left;font-family:'Instrument Serif',serif;font-size:110px;line-height:.78;padding:8px 12px 0 0;color:var(--hi)}
.tpl-portada .r-ed .sign{font-family:'Instrument Serif',serif;font-style:italic;font-size:30px;margin-top:20px}
.tpl-portada .r-ed .sl{display:flex;flex-wrap:wrap;gap:8px;margin-top:20px}
.tpl-portada .r-ed .sl span{display:inline-flex;align-items:center;gap:6px;font-family:'Geist Mono',monospace;font-size:10px;letter-spacing:.1em;text-transform:uppercase;padding:7px 10px;box-shadow:inset 0 0 0 1px var(--ink)}
.tpl-portada .r-ed .sl span.ok{background:var(--ink);color:var(--paper)}
.tpl-portada .r-ed .sl svg{width:12px}
@media (max-width:860px){.tpl-portada .r-ed{grid-template-columns:minmax(0,1fr)}}
.tpl-portada .r-lets{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:0}
.tpl-portada .r-lets figure{margin:0;padding:0 28px 0 0;display:flex;flex-direction:column;gap:16px}
.tpl-portada .r-lets figure + figure{padding-left:28px;border-left:1px solid var(--rule)}
.tpl-portada .r-lets .st{color:var(--hi);letter-spacing:3px}
.tpl-portada .r-lets blockquote{margin:0;font-family:'Instrument Serif',serif;font-size:27px;line-height:1.22}
.tpl-portada .r-lets figcaption{font-family:'Geist Mono',monospace;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--soft)}
@media (max-width:860px){.tpl-portada .r-lets{grid-template-columns:minmax(0,1fr);gap:28px}.tpl-portada .r-lets figure + figure{padding:28px 0 0;border-left:0;border-top:1px solid var(--rule)}}
.tpl-portada .r-acc .sum{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));border-bottom:3px double var(--ink)}
.tpl-portada .r-acc .sum div{padding:4px 0 22px}
.tpl-portada .r-acc .sum div + div{padding-left:24px;border-left:1px solid var(--rule)}
.tpl-portada .r-acc .sum b{display:block;font-family:'Instrument Serif',serif;font-weight:400;font-size:clamp(40px,5vw,76px);line-height:1}
.tpl-portada .r-acc .sum div:last-child b{color:var(--hi)}
.tpl-portada .r-tw{overflow-x:auto}
.tpl-portada .r-acc table{width:100%;border-collapse:collapse;font-size:15px}
.tpl-portada .r-acc th,.tpl-portada .r-acc td{text-align:left;padding:15px 14px 15px 0;border-bottom:1px solid var(--rule)}
.tpl-portada .r-acc td:first-child{white-space:nowrap;font-family:'Instrument Serif',serif;font-style:italic;font-size:19px}
.tpl-portada .r-acc th{font-family:'Geist Mono',monospace;font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--soft);font-weight:400}
.tpl-portada .r-acc .num{text-align:right;white-space:nowrap;font-family:'Geist Mono',monospace;font-size:14px}
.tpl-portada .r-acc .lk{font-family:'Geist Mono',monospace;font-size:10px;letter-spacing:.1em;text-transform:uppercase;padding:3px 7px;box-shadow:inset 0 0 0 1px var(--ink)}
.tpl-portada .r-acc .lk.in{background:var(--ink);color:var(--paper)}
@media (max-width:700px){.tpl-portada .r-acc .sum{grid-template-columns:minmax(0,1fr)}.tpl-portada .r-acc .sum div + div{padding-left:0;border-left:0;border-top:1px solid var(--rule);padding-top:16px}.tpl-portada .r-acc table{min-width:600px}}
.tpl-portada .r-dir{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.4fr);gap:clamp(24px,4vw,60px)}
.tpl-portada .r-dir dl{margin:0}
.tpl-portada .r-dir dt{font-family:'Geist Mono',monospace;font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:var(--soft);padding-top:16px;border-top:1px solid var(--rule)}
.tpl-portada .r-dir dd{margin:6px 0 18px;font-family:'Instrument Serif',serif;font-size:28px;line-height:1.15}
.tpl-portada .r-dir .map{min-height:360px;border:1px solid var(--ink);filter:grayscale(.2) contrast(1.05)}
@media (max-width:860px){.tpl-portada .r-dir{grid-template-columns:minmax(0,1fr)}.tpl-portada .r-dir .map{min-height:230px}}
.tpl-portada .r-col{border-top:3px double var(--ink);padding-block:50px 90px}
.tpl-portada .r-col .g{display:grid;grid-template-columns:minmax(0,1.4fr) minmax(0,1fr);gap:30px;align-items:end}
.tpl-portada .r-col .nm{font-family:'Instrument Serif',serif;font-size:clamp(48px,7vw,110px);line-height:.88;letter-spacing:-.03em}
.tpl-portada .r-col .soc p{font-size:14px;color:var(--soft);margin-bottom:12px}
.tpl-portada .r-col .soc div{display:flex;gap:8px;flex-wrap:wrap}
.tpl-portada .r-col .soc a{width:44px;height:44px;display:grid;place-items:center;box-shadow:inset 0 0 0 1px var(--ink);transition:background .3s,color .3s}
.tpl-portada .r-col .soc a:hover{background:var(--ink);color:var(--paper)}
.tpl-portada .r-col .soc svg{width:18px}
.tpl-portada .r-col .fine{display:flex;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-top:40px;padding-top:14px;border-top:1px solid var(--rule);font-size:12px;color:var(--soft)}
@media (max-width:760px){.tpl-portada .r-col .g{grid-template-columns:minmax(0,1fr)}}
.tpl-portada dialog.sheet,.tpl-portada .ldg{border:0;padding:0;background:transparent;width:min(1000px,calc(100vw - 24px));max-width:none;color:var(--ink)}
.tpl-portada dialog.sheet::backdrop,.tpl-portada .ldg::backdrop{background:rgba(23,21,19,.55)}
.tpl-portada .sh-in{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.1fr);background:var(--paper);position:relative;box-shadow:0 40px 100px rgba(0,0,0,.35);animation:rIn .7s cubic-bezier(.2,.8,.2,1)}
@keyframes rIn{from{opacity:0;transform:translateY(40px)}}
.tpl-portada .sh-ph{aspect-ratio:4/5;margin:24px 0 24px 24px;border-radius:999px 999px 0 0;overflow:hidden}
.tpl-portada .sh-bd{padding:44px;display:flex;flex-direction:column;gap:14px}
.tpl-portada .sh-k{font-family:'Geist Mono',monospace;font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:var(--hi)}
.tpl-portada .sh-n{font-family:'Instrument Serif',serif;font-weight:400;font-size:84px;line-height:.85;letter-spacing:-.03em}
.tpl-portada .sh-dl{display:grid;grid-template-columns:1fr 1fr;margin:8px 0 0;border-top:1px solid var(--ink)}
.tpl-portada .sh-dl div{padding:12px 0;border-bottom:1px solid var(--rule)}
.tpl-portada .sh-dl dt{font-family:'Geist Mono',monospace;font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--soft)}
.tpl-portada .sh-dl dd{margin:3px 0 0;font-family:'Instrument Serif',serif;font-size:22px}
.tpl-portada .sh-act{display:flex;gap:10px;margin-top:auto;flex-wrap:wrap}
.tpl-portada .sh-b1,.tpl-portada .sh-b2{min-height:52px;padding:0 24px;display:inline-flex;align-items:center;text-decoration:none;font-weight:500}
.tpl-portada .sh-b1{background:var(--ink);color:var(--paper)!important}
.tpl-portada .sh-b2{box-shadow:inset 0 0 0 1px var(--ink)}
.tpl-portada .sh-x,.tpl-portada .ldg-x{position:absolute;top:14px;right:14px;width:44px;height:44px;border:0;background:var(--ink);color:var(--paper);cursor:pointer;display:grid;place-items:center;z-index:2}
.tpl-portada .sh-x svg,.tpl-portada .ldg-x svg{width:16px}
@media (max-width:720px){.tpl-portada .sh-in{grid-template-columns:minmax(0,1fr);max-height:calc(100vh - 24px);overflow:auto}.tpl-portada .sh-ph{aspect-ratio:1/1;margin:16px 16px 0}.tpl-portada .sh-bd{padding:24px}.tpl-portada .sh-n{font-size:60px}}
.tpl-portada .ldg-in{background:var(--paper);padding:44px;position:relative;max-height:calc(100vh - 24px);overflow:auto}
.tpl-portada .ldg-k{font-family:'Geist Mono',monospace;font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:var(--hi)}
.tpl-portada .ldg-t{font-family:'Instrument Serif',serif;font-weight:400;font-size:60px;line-height:1}
.tpl-portada .ldg-d{color:var(--soft)}
.tpl-portada .ldg-sum{display:flex;gap:34px;flex-wrap:wrap;margin-top:22px;padding-bottom:18px;border-bottom:3px double var(--ink)}
.tpl-portada .ldg-sum span{display:block;font-family:'Geist Mono',monospace;font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--soft)}
.tpl-portada .ldg-sum b{font-family:'Instrument Serif',serif;font-weight:400;font-size:36px}
.tpl-portada .ldg-tw{overflow-x:auto;margin-top:10px}
.tpl-portada .ldg table{width:100%;border-collapse:collapse;font-size:14px}
.tpl-portada .ldg th,.tpl-portada .ldg td{text-align:left;padding:12px 10px 12px 0;border-bottom:1px solid var(--rule)}
.tpl-portada .ldg th{font-family:'Geist Mono',monospace;font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--soft);font-weight:400}
.tpl-portada .ldg .num{text-align:right;white-space:nowrap}
.tpl-portada .ldg .lk{font-family:'Geist Mono',monospace;font-size:10px;text-transform:uppercase;padding:3px 7px;box-shadow:inset 0 0 0 1px var(--ink)}
.tpl-portada a.r-plate{display:block;text-decoration:none}
.tpl-portada a.r-ad{text-decoration:none}
.tpl-portada .r-fig .ph{position:relative}
.tpl-portada .r-dir.nomap{grid-template-columns:minmax(0,1fr)}
.tpl-portada .r-dir dl > div{display:block}
.tpl-portada .r-dir dd a{text-decoration:none}
.tpl-portada .r-acts-note{margin-top:22px;font-size:13px;color:var(--soft)}
`;

type SecId =
  | 'transparencia'
  | 'acciones'
  | 'animales'
  | 'campana'
  | 'necesidades'
  | 'productos'
  | 'ayuda'
  | 'nosotros'
  | 'resenas'
  | 'libro'
  | 'contacto'
  | 'redes';

/** Índice de la edición: solo las secciones que esta organización muestra, en el orden de la página. */
function pages(m: TplModel) {
  const all: [SecId, string, string][] = [
    ['transparencia', 'Transparencia', 'r-tr'],
    ['acciones', 'Cómo participar', 'r-acc-p'],
    ['animales', 'Mascotas en adopción', m.ANIMALS.length ? 'r-ret' : 'r-cls'],
    ['campana', 'Campaña', 'r-rep'],
    ['necesidades', 'Necesidades', 'r-nec'],
    ['productos', 'Productos', 'r-tie'],
    ['ayuda', 'Cómo ayudar', 'portal-help-cta'],
    ['nosotros', 'Nosotros', 'r-nos'],
    ['resenas', 'Reseñas', 'r-res'],
    ['libro', 'Libro público', 'r-acc'],
    ['contacto', 'Contacto', 'r-dirx'],
    ['redes', 'Redes sociales', 'r-redes'],
  ];
  const hidden: Partial<Record<SecId, boolean>> = {
    transparencia: !m.SHOW.transparencia,
    nosotros: !m.SHOW.nosotros,
    contacto: !m.SHOW.contacto,
    redes: !m.SHOW.redes,
  };
  return all
    .filter(([id]) => !hidden[id])
    .map(([id, t, a], i) => ({ id, t, a, pg: String(i + 1).padStart(2, '0') }));
}

type Filter = 'todos' | 'perro' | 'gato' | 'otro' | 'nuevos' | 'bebes' | 'senior' | 'espera';
const FILTERS: Record<Filter, (a: TplAnimal) => boolean> = {
  todos: () => true,
  perro: (a) => a.sp === 'perro',
  gato: (a) => a.sp === 'gato',
  otro: (a) => a.sp === 'otro',
  nuevos: (a) => a.isNew,
  bebes: (a) => a.hasAge && a.months < 12,
  senior: (a) => a.stage === 'Senior',
  espera: () => true,
};

export const portada: TemplateDesign = {
  id: 'portada',
  fonts:
    'family=Space+Grotesk:wght@400;500;600;700&family=Instrument+Serif:ital@0;1&family=Geist+Mono:wght@400;500',
  css: CSS,
  html(m, KIT) {
    const { ORG, CAMPAIGN, ANIMALS, SHOW, BADGES, NEEDS, PRODUCTS, REVIEWS } = m;
    const n = m.COUNTS.total;
    const P = pages(m);
    const pg = (id: SecId) => P.find((p) => p.id === id)?.pg ?? '';
    const plates = [...ANIMALS].sort((a, b) => a.days - b.days).slice(0, 10);
    const cover = ANIMALS[0];
    const mon = new Date().toLocaleDateString('es-CO', {
      month: 'long',
      year: 'numeric',
      timeZone: 'America/Bogota',
    });
    const hd = (id: SecId, title: string, desc: string, extra = '') =>
      `<div class="r-hd"><span class="pg">p. ${pg(id)}</span><div><h2>${title}</h2></div><div>${desc ? `<p>${desc}</p>` : ''}${extra}</div></div>`;
    const words = ORG.short.split(' ');
    const t = KIT.transparencyParts();
    const map = mapEmbed(m);
    const filters = (
      [
        ['todos', 'Todos'],
        ['perro', 'Perros'],
        ['gato', 'Gatos'],
        ['otro', 'Otros'],
        ['nuevos', 'Recién llegados'],
        ['bebes', 'Cachorros'],
        ['senior', 'Seniors'],
        ['espera', 'Los que más esperan'],
      ] as const
    ).filter(
      ([f]) => f === 'todos' || (f === 'espera' ? ANIMALS.length > 1 : ANIMALS.some(FILTERS[f])),
    );
    const badgeSpans = (withIcon: boolean) =>
      BADGES.map(
        (b) =>
          `<span class="${b.ok ? 'ok' : ''}">${withIcon ? (b.ok ? ic.check : ic.clock) : ''}${b.t}</span>`,
      ).join('');
    return `
<div class="w">
  <div class="r-top"><span class="ed">Edición de ${mon}${ORG.city ? ` · ${ORG.city}` : ''}</span><nav aria-label="Principal">${n ? '<a href="#r-ret">Retratos</a>' : ''}<a href="#r-cls">Clasificados</a><a href="#r-rep">Reportaje</a><button type="button" data-ledger>Transparencia</button></nav><a class="r-btn" href="${ORG.donateHref}" style="min-height:40px;padding:0 16px">Donar</a></div>
  <h1 class="r-mast" id="r-mast" aria-label="${ORG.name}">${words.map((w, i) => `<span style="transition-delay:${i * 120}ms">${i === words.length - 1 && words.length > 1 ? `<em>${w}</em>` : w}</span>`).join(' ')}</h1>
  <div class="r-strap r-m"><span>${ORG.name}</span>${ORG.type || ORG.place ? `<span>${[ORG.type, ORG.place].filter(Boolean).join(' · ')}</span>` : ''}<span>${n} en adopción</span></div>
  <div class="r-cover">
    <div class="r-lines">
      <a class="r-line" href="#r-cls"><span class="r-m">p. ${pg('animales')} · Clasificados</span><b>${n ? `${countPhrase(m)} ${verb(m, 'busca', 'buscan')} casa` : 'Pronto, nuevos clasificados'}</b><p>${n ? 'Todos en una sola página, con filtros y buscador.' : EMPTY.animales}</p></a>
      <a class="r-line" href="#r-rep"><span class="r-m">p. ${pg('campana')} · Reportaje</span><b>${CAMPAIGN.active ? CAMPAIGN.title : 'Sin campaña activa'}</b><p>${CAMPAIGN.active ? `${fmt(CAMPAIGN.raised)} de ${fmt(CAMPAIGN.goal)}${CAMPAIGN.deadline ? `, cierra el ${CAMPAIGN.deadline}` : ''}.` : EMPTY.campana}</p></a>
      <a class="r-line" href="#r-acc"><span class="r-m">p. ${pg('libro')} · Transparencia</span><b>Libro público</b><p>${COPY.ledgerText}</p></a>
    </div>
    <figure class="r-fig" id="r-fig" style="margin:0">${
      cover
        ? `<a class="ph" href="${cover.href}" aria-label="Ver a ${cover.name}" style="display:block">${portrait(cover, { decor: true, dx: 10, dy: 26, s: 0.8 })}</a>`
        : `<div class="ph">${campaignArt(m)}</div>`
    }
      ${CAMPAIGN.active ? `<a class="r-stamp" href="${CAMPAIGN.href}" style="text-decoration:none"><span><b>${CAMPAIGN.pct}%</b>de la meta</span></a>` : ''}
      ${cover ? `<figcaption><span>En portada: ${cover.name}${cover.age ? `, ${cover.age}` : ''}</span><span>${cover.breed}</span></figcaption>` : ''}</figure>
    <div class="r-toc"><h3>En esta edición</h3><ol>${P.filter((p) => p.id !== 'redes')
      .map((p) => `<li><a href="#${p.a}"><i>${p.pg}</i><span>${p.t}</span><i>→</i></a></li>`)
      .join('')}</ol>
      ${BADGES.length ? `<div class="sl">${badgeSpans(false)}</div>` : ''}</div>
  </div>
  ${SHOW.transparencia ? `<div class="r-note" id="r-tr" data-sec="transparencia" role="group" aria-label="Transparencia"><span class="lv">${ORG.level}</span><p><b>Nota de transparencia.</b> ${t.level} · ${t.formalization} · ${t.accountability}. ${t.note}</p><span class="r-m">Transparencia</span></div>` : ''}
</div>
<section class="w r-sec" id="r-acc-p" data-sec="acciones">${hd('acciones', 'Tres maneras de <em>participar</em>', COPY.adoptNote)}
  <div class="r-acts">${(
    [
      [
        'I',
        'Adoptar',
        'Elige a uno de los que aparecen en estas páginas y sigue su solicitud de adopción.',
        '#r-cls',
        'Ver clasificados',
      ],
      [
        'II',
        'Apadrinar',
        'Elige a uno de ellos y acompaña sus cuidados.',
        '#r-cls',
        'Elegir a quién',
      ],
      ['III', 'Donar', 'Apoya el trabajo de la organización.', ORG.donateHref, 'Hacer un aporte'],
    ] as const
  )
    .map(
      ([k, tt, d, h, c]) =>
        `<a class="r-act" href="${h}"><span class="n">${k}</span><b>${tt}</b><p>${d}</p><span class="r-lnk">${c} ${ic.arrow}</span></a>`,
    )
    .join('')}</div>
</section>
${
  plates.length
    ? `<section class="r-pin" id="r-ret" data-sec="animales"><div class="stk">
  <div class="w h"><div><p class="r-m" style="color:var(--soft)">p. ${pg('animales')} · Retratos</p><h2 style="margin-top:12px">Los recién <em>llegados</em></h2></div><a class="r-lnk" href="#r-cls">${n === 1 ? 'Ver su clasificado' : `Ver los ${n}`} ${ic.arrow}</a></div>
  <div class="r-track" id="r-track">${plates.map((a, i) => `<a class="r-plate" href="${a.href}"><div class="ph">${portrait(a, { decor: true, dx: 4, dy: 18, s: 1.1 })}</div><div class="cap"><b>${a.name}</b><span>Fig. ${String(i + 1).padStart(2, '0')}</span></div><span>${[a.spLabel, a.age, sinceLabel(a).toLowerCase()].filter(Boolean).join(' · ')}</span></a>`).join('')}</div>
  <div class="w" style="width:100%"><div class="r-prog"><i id="r-prog"></i></div></div>
</div></section>`
    : ''
}
<section class="w r-sec r-cls" id="r-cls" data-sec="animales">${hd('animales', 'Clasificados', n ? 'Toca un nombre para abrir su ficha.' : '')}
  ${
    n
      ? `<div class="bar" role="group" aria-label="Filtrar clasificados">${filters.map((f, i) => `<button type="button" data-f="${f[0]}" aria-pressed="${i === 0}">${f[1]}</button>`).join('')}<label>${ic.search}<span class="sr">Buscar</span><input id="r-q" type="search" placeholder="Nombre, raza o especie" autocomplete="off"></label></div>
  <div class="r-cols" id="r-cols"></div><p class="r-cn"><span id="r-cn" aria-live="polite"></span><span>Datos publicados por la organización</span></p>`
      : `<p class="r-empty">${EMPTY.animales}</p>`
  }
</section>
<section class="w r-sec" id="r-rep" data-sec="campana">${
      CAMPAIGN.active
        ? `${hd('campana', CAMPAIGN.title, `Campaña activa${CAMPAIGN.category ? ` · ${CAMPAIGN.category}` : ''}`)}
  <div class="r-rep"><div><p class="lede">${CAMPAIGN.deadline ? `Campaña abierta hasta el ${CAMPAIGN.deadline}.` : 'Campaña abierta.'}</p>
    <div class="body">${CAMPAIGN.description ? `<p>${CAMPAIGN.description}</p>` : ''}<p>${COPY.adoptNote}</p></div>
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:28px"><a class="r-btn" href="${CAMPAIGN.href}" data-magnet>Ver campaña y aportar ${ic.arrow}</a></div>${KIT.moreCampaigns()}</div>
    <div class="r-quote"><p class="r-m" style="color:var(--soft)">Avance de la meta</p><p class="big"><span id="r-pct">${CAMPAIGN.pct}</span><small>%</small></p>
      <div class="r-rule"><i id="r-bar"></i>${[0, 25, 50, 75, 100].map((k) => `<span style="left:${k}%">${k}</span>`).join('')}</div>
      <div class="r-kv"><div><b id="r-raised">${fmt(CAMPAIGN.raised)}</b><span>recaudado</span></div><div><b>${fmt(CAMPAIGN.goal)}</b><span>meta</span></div><div><b>${CAMPAIGN.daysLeft}</b><span>${CAMPAIGN.daysLeft === 1 ? 'día' : 'días'}${CAMPAIGN.deadline ? ` · cierra ${CAMPAIGN.deadline}` : ''}</span></div></div></div></div>`
        : `${hd('campana', 'Sin campaña <em>activa</em>', 'Reportaje')}<p class="r-empty">${EMPTY.campana}</p>`
    }</section>
<section class="w r-sec" id="r-nec" data-sec="necesidades">${hd('necesidades', 'Lista de <em>necesidades</em>', 'Lo que la organización necesita hoy, del banco de recursos.')}
  ${NEEDS.length ? `<div class="r-rcpt"><h3>${ORG.short} · Necesidades</h3>${NEEDS.map((nd) => `<div class="r-it"><b>${nd.title}</b><span class="dots"></span><span class="q">${nd.got}/${nd.need} ${nd.unit}</span></div><div class="r-it2"><span>${nd.category}</span><span class="bar"><i data-w="${nd.pct}"></i></span><span>${nd.pct}%</span><a href="${nd.href}">Ver y donar</a></div>`).join('')}</div>` : `<p class="r-empty">${EMPTY.necesidades}</p>`}
</section>
<section class="w r-sec" id="r-tie" data-sec="productos">${hd('productos', 'La <em>tienda</em>', 'De la tienda solidaria de la organización.')}
  ${PRODUCTS.length ? `<div class="r-prods">${PRODUCTS.map((p, i) => `<a class="r-pr" href="${p.href}"><div class="ph">${productArt(p, 'transparent')}</div><div class="lm"><span class="r-m" style="color:var(--soft)">Lám. ${i + 1}${p.category ? ` · ${p.category}` : ''}</span><span class="pz">${fmt(p.price)}</span></div><b>${p.name}</b><span class="r-lnk" style="align-self:flex-start;margin-top:6px">Ver</span></a>`).join('')}</div>` : `<p class="r-empty">${EMPTY.productos}</p>`}
</section>
<section class="r-help" id="portal-help-cta" data-sec="ayuda"><div class="w"><p class="r-m">p. ${pg('ayuda')} · Cómo ayudar</p><h2>${COPY.helpTitle}</h2><div class="row"><p>${COPY.helpText}</p><a class="r-btn" href="${ORG.donateHref}" data-magnet>${COPY.helpCta} ${ic.arrow}</a></div></div></section>
${
  SHOW.nosotros
    ? `<section class="w r-sec" id="r-nos" data-sec="nosotros" style="border-top:0">${hd('nosotros', 'Sobre <em>nosotros</em>', 'Editorial')}
  <div class="r-ed"><div>${BADGES.length ? `<div class="sl">${badgeSpans(true)}</div>` : ''}</div><div><p class="txt">${ORG.about}</p><p class="sign">— ${ORG.name}</p></div></div></section>`
    : ''
}
<section class="w r-sec" id="r-res" data-sec="resenas" ${SHOW.nosotros ? '' : 'style="border-top:0"'}>${hd('resenas', 'Cartas de los <em>lectores</em>', 'Reseñas de la comunidad.', `<button type="button" class="r-lnk" data-review style="margin-top:12px">Registrar reseña ${ic.arrow}</button>`)}
  ${REVIEWS.length ? `<div class="r-lets">${REVIEWS.map((r) => `<figure><span class="st" aria-label="${r.rating} de 5 estrellas">${stars(r.rating)}</span>${r.text ? `<blockquote>“${r.text}”</blockquote>` : ''}<figcaption>${r.name}${r.date ? ` · ${r.date}` : ''}</figcaption></figure>`).join('')}</div>` : `<p class="r-empty">${EMPTY.resenas}</p>`}
</section>
<section class="w r-sec r-acc" id="r-acc" data-sec="libro">${hd('libro', 'Libro <em>público</em>', `Transparencia. ${COPY.ledgerText}`, `<button type="button" class="r-lnk" data-ledger style="margin-top:12px">Ver libro completo ${ic.arrow}</button>`)}
  ${ledgerBlock(m, 'r-empty')}
</section>
${
  SHOW.contacto
    ? `<section class="w r-sec" id="r-dirx" data-sec="contacto">${hd('contacto', 'Directorio', 'Información de contacto.')}
  <div class="r-dir${map ? '' : ' nomap'}"><div>${KIT.contactRows()}${mapLink(m, 'r-lnk')}</div>${map ? `<div class="map">${map}</div>` : ''}</div></section>`
    : ''
}
<footer class="w r-col" id="r-redes"><div class="g"><p class="nm">${ORG.short}<span style="color:var(--hi)">.</span></p>
  ${SHOW.redes ? `<div class="soc" data-sec="redes"><p>${COPY.socialsText}</p><div>${m.SOCIALS.map((x) => socialLink(x, ic[x.key])).join('')}</div></div>` : '<div></div>'}</div>
  <div class="fine"><span>© ${ORG.name}${ORG.place ? ` · ${ORG.place}` : ''}</span><span>Edición digital hecha con AdoptaFácil</span></div></footer>
<div class="r-folio" aria-hidden="true"></div><div class="r-peek" aria-hidden="true"></div>`;
  },
  init(app, env) {
    const { m, motion, catalog } = env;
    const { signal } = motion;
    const mast = qs(app, '#r-mast');
    const fig = qs(app, '#r-fig');
    const show = () => {
      mast?.classList.add('in');
      fig?.classList.add('in');
    };
    // El nombre nunca se corta: si no cabe en una línea, se reduce hasta caber
    if (mast) {
      const fit = () => {
        mast.style.fontSize = '';
        const k = mast.clientWidth / Math.max(1, mast.scrollWidth);
        if (k < 1)
          mast.style.fontSize = parseFloat(getComputedStyle(mast).fontSize) * k * 0.98 + 'px';
      };
      fit();
      addEventListener('resize', fit, { signal });
      void document.fonts?.ready.then(() => {
        if (!signal.aborted) fit();
      });
    }
    if (motion.reduce) show();
    else requestAnimationFrame(() => requestAnimationFrame(show));

    // Folio: número de página de la sección que se está leyendo
    const P = pages(m);
    const folio = qs(app, '.r-folio');
    if (folio) {
      motion.observe(
        qsa(app, '[data-sec]'),
        (en) => {
          if (!en.isIntersecting) return;
          const id = (en.target as HTMLElement).dataset.sec?.split(' ')[0];
          const p = P.find((x) => x.id === id);
          if (!p) return;
          folio.textContent = `p. ${p.pg} — ${p.t}`;
          folio.classList.add('on');
        },
        { rootMargin: '-45% 0px -50% 0px' },
      );
      addEventListener('scroll', () => scrollY < 300 && folio.classList.remove('on'), {
        signal,
        passive: true,
      });
    }

    // Retratos: recorrido horizontal anclado al scroll (en móvil, deslizamiento nativo)
    const pin = qs(app, '.r-pin');
    const track = qs(app, '#r-track');
    const prog = qs(app, '#r-prog');
    if (pin && track) {
      const bar = () => parseFloat(getComputedStyle(app).getPropertyValue('--bar')) || 0;
      let dist = 0;
      const measure = () => {
        if (innerWidth < 900) {
          pin.style.height = '';
          dist = 0;
          return;
        }
        dist = Math.max(0, track.scrollWidth - innerWidth);
        pin.style.height = innerHeight - bar() + dist + 'px';
      };
      measure();
      addEventListener('resize', measure, { signal });
      void document.fonts?.ready.then(() => {
        if (!signal.aborted) measure();
      });
      motion.onFrame(() => {
        if (!dist) return;
        const top = pin.getBoundingClientRect().top - bar();
        const k = Math.min(1, Math.max(0, -top / dist));
        track.style.transform = `translateX(${(-k * dist).toFixed(1)}px)`;
        if (prog) prog.style.width = k * 100 + '%';
      });
    }

    // Clasificados
    const cols = qs(app, '#r-cols');
    const input = qs<HTMLInputElement>(app, '#r-q');
    const cn = qs(app, '#r-cn');
    let fk: Filter = 'todos';
    let q = '';
    const paint = () => {
      if (!cols) return;
      const L = catalog
        .query({ q, sort: fk === 'espera' ? 'espera' : 'recientes' })
        .filter(FILTERS[fk]);
      cols.innerHTML =
        L.map(
          (a) =>
            `<a class="r-ad" href="${a.href}" data-i="${a.i}"><b>${a.name}${a.isNew ? '<small>NUEVO</small>' : ''}</b>${[a.spLabel, a.age, a.sizeLabel.toLowerCase(), a.breed.toLowerCase(), a.coatLabel.toLowerCase()].filter(Boolean).join(', ')}. <span>${sinceLabel(a)}.</span></a>`,
        ).join('') ||
        `<p class="r-empty" style="column-span:all">Ningún clasificado coincide con “${esc(q)}”.</p>`;
      if (cn) cn.textContent = `${L.length} de ${m.ANIMALS.length} clasificados`;
    };
    paint();
    qs(app, '.r-cls .bar')?.addEventListener(
      'click',
      (e) => {
        const b = (e.target as HTMLElement).closest<HTMLElement>('[data-f]');
        if (!b) return;
        fk = b.dataset.f as Filter;
        qsa(app, '.r-cls .bar [data-f]').forEach((x) =>
          x.setAttribute('aria-pressed', String(x === b)),
        );
        paint();
      },
      { signal },
    );
    input?.addEventListener(
      'input',
      () => {
        q = input.value.trim();
        paint();
      },
      { signal },
    );

    // Retrato flotante al pasar por un nombre
    const peek = qs(app, '.r-peek');
    if (cols && peek && motion.hover && !motion.reduce) {
      let cur = -1;
      let px = 0;
      let py = 0;
      let x = 0;
      let y = 0;
      cols.addEventListener(
        'pointerover',
        (e) => {
          const b = (e.target as HTMLElement).closest<HTMLElement>('.r-ad');
          const k = Number(b?.dataset.i);
          if (!b || k === cur) return;
          const a = m.ANIMALS.find((z) => z.i === k);
          if (!a) return;
          cur = k;
          peek.innerHTML = portrait(a, { decor: true, dx: 4, dy: 18, s: 1.1 });
          peek.classList.add('on');
        },
        { signal },
      );
      cols.addEventListener(
        'pointerleave',
        () => {
          cur = -1;
          peek.classList.remove('on');
        },
        { signal },
      );
      addEventListener(
        'pointermove',
        (e) => {
          px = e.clientX;
          py = e.clientY;
        },
        { signal, passive: true },
      );
      motion.onFrame(() => {
        if (!peek.classList.contains('on') && Math.abs(px + 130 - x) < 0.5) return;
        x += (px + 130 - x) * 0.14;
        y += (py - y) * 0.14;
        peek.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px) translate(-50%,-50%) scale(${peek.classList.contains('on') ? 1 : 0.6}) rotate(${((px + 130 - x) * 0.04).toFixed(2)}deg)`;
      });
    }

    // Reportaje y lista de necesidades
    const fills = qsa(app, '#r-bar,.r-it2 .bar i');
    const fill = (el: HTMLElement) =>
      (el.style.width =
        (el.id === 'r-bar' ? Math.max(1, m.CAMPAIGN.pct) : Number(el.dataset.w)) + '%');
    if (typeof IntersectionObserver !== 'function') fills.forEach(fill);
    motion.observe(
      fills,
      (en, io) => {
        if (!en.isIntersecting) return;
        io.unobserve(en.target);
        fill(en.target as HTMLElement);
      },
      { threshold: 0.5 },
    );
    if (m.CAMPAIGN.active) {
      motion.countUp(qs(app, '#r-pct'), m.CAMPAIGN.pct, (v) => Math.round(v), 1800);
      motion.countUp(qs(app, '#r-raised'), m.CAMPAIGN.raised, fmt);
    }
    motion.reveal(app, '.r-act,.r-pr,.r-lets figure,.r-line', { stagger: 90 });
    motion.magnet(app);
  },
};
