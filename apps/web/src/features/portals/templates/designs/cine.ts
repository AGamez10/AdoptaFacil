import { ledgerBlock } from '../engine/ledger';
import { COPY, EMPTY, type TplAnimal } from '../engine/model';
import {
  availLine,
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
} from '../engine/runtime';
import { unesc } from '../engine/safe';
import type { TemplateDesign } from '../engine/types';

const CSS = `
.tpl-cine{--bg:#0B0A09;--ink:#F4EDE1;--soft:#A39A8C;--gold:#E8C27A;--line:rgba(244,237,225,.14);font-family:'Albert Sans',system-ui,sans-serif;color:var(--ink);background:var(--bg);overflow-x:clip}
.tpl-cine a{color:inherit}
.tpl-cine .k-serif{font-family:'Gloock',Georgia,serif;font-weight:400}
.tpl-cine .k-grain{position:fixed;inset:-50%;z-index:60;pointer-events:none;opacity:.09;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='220' height='220'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");animation:kGrain 1s steps(6) infinite}
@keyframes kGrain{0%{transform:translate(0,0)}20%{transform:translate(-5%,3%)}40%{transform:translate(4%,-6%)}60%{transform:translate(-3%,5%)}80%{transform:translate(6%,2%)}100%{transform:translate(0,0)}}
.tpl-cine .k-top{position:absolute;left:0;right:0;top:0;z-index:6;display:flex;align-items:center;justify-content:space-between;gap:16px;padding:20px max(16px,4vw)}
.tpl-cine .k-top .pres{font-size:12px;letter-spacing:.32em;text-transform:uppercase;color:var(--soft)}
.tpl-cine .k-top .pres b{color:var(--ink);font-weight:600}
.tpl-cine .k-top nav{display:flex;gap:24px;font-size:13px;letter-spacing:.14em;text-transform:uppercase}
.tpl-cine .k-top nav a{text-decoration:none;opacity:.8}
.tpl-cine .k-top nav a:hover{opacity:1}
@media (max-width:760px){.tpl-cine .k-top nav a:not(:last-child){display:none}}
.tpl-cine .k-hero{position:relative;height:calc(100svh - var(--bar));min-height:600px;overflow:hidden;background:#000}
.tpl-cine .k-slide{position:absolute;inset:0;opacity:0;transition:opacity 1.4s ease}
.tpl-cine .k-slide.on{opacity:1}
.tpl-cine .k-slide .ph{position:absolute;inset:-4%;transform:scale(1.02);transition:transform 9s linear}
.tpl-cine .k-slide.on .ph{transform:scale(1.14) translateX(-1.5%)}
.tpl-cine .k-hero::after{content:"";position:absolute;inset:0;background:radial-gradient(120% 90% at 70% 40%,transparent 30%,rgba(0,0,0,.75)),linear-gradient(0deg,rgba(0,0,0,.9),transparent 50%);z-index:2;pointer-events:none}
.tpl-cine .k-lb{position:absolute;left:0;right:0;height:7vh;background:#000;z-index:4}
.tpl-cine .k-lb.t{top:0}.tpl-cine .k-lb.b{bottom:0}
.tpl-cine .k-card{position:absolute;left:max(16px,6vw);bottom:calc(7vh + 48px);z-index:5;max-width:780px}
.tpl-cine .k-now{font-size:12px;letter-spacing:.34em;text-transform:uppercase;color:var(--gold);display:flex;align-items:center;gap:12px}
.tpl-cine .k-now::before{content:"";width:40px;height:1px;background:var(--gold)}
.tpl-cine .k-name{font-family:'Gloock',serif;font-size:clamp(80px,15vw,230px);line-height:.82;letter-spacing:-.02em;margin-top:14px}
.tpl-cine .k-name span{display:inline-block;opacity:0;transform:translateY(40px);filter:blur(8px);transition:opacity .9s,transform .9s cubic-bezier(.2,.8,.2,1),filter .9s}
.tpl-cine .k-card.on .k-name span{opacity:1;transform:none;filter:none}
.tpl-cine .k-line{margin-top:18px;font-size:18px;color:#D6CEC1;display:flex;flex-wrap:wrap;gap:8px 22px}
.tpl-cine .k-line i{font-style:normal;color:var(--soft)}
.tpl-cine .k-acts{display:flex;flex-wrap:wrap;gap:12px;margin-top:28px}
.tpl-cine .k-btn{display:inline-flex;align-items:center;gap:12px;min-height:54px;padding:0 26px;background:var(--ink);color:#0B0A09!important;text-decoration:none;font-weight:700;letter-spacing:.06em;text-transform:uppercase;font-size:13px;border:0;cursor:pointer}
.tpl-cine .k-btn svg{width:18px}
.tpl-cine .k-btn.ghost{background:transparent;color:var(--ink)!important;box-shadow:inset 0 0 0 1px rgba(244,237,225,.5)}
.tpl-cine .k-bars{position:absolute;right:max(16px,4vw);bottom:calc(7vh + 54px);z-index:5;display:flex;flex-direction:column;gap:14px;align-items:flex-end}
.tpl-cine .k-bars button{border:0;background:transparent;color:var(--soft);font-size:12px;letter-spacing:.2em;text-transform:uppercase;cursor:pointer;display:flex;align-items:center;gap:12px;padding:4px 0}
.tpl-cine .k-bars button i{width:60px;height:2px;background:rgba(244,237,225,.2);position:relative;overflow:hidden}
.tpl-cine .k-bars button i b{position:absolute;inset:0;background:var(--ink);transform-origin:0 50%;transform:scaleX(0)}
.tpl-cine .k-bars button[aria-current="true"]{color:var(--ink)}
@media (max-width:760px){.tpl-cine .k-bars{left:16px;right:16px;bottom:calc(7vh + 14px);flex-direction:row;gap:6px}.tpl-cine .k-bars button{flex:1;font-size:0;gap:0}.tpl-cine .k-bars button i{width:100%}.tpl-cine .k-card{bottom:calc(7vh + 44px)}.tpl-cine .k-line{font-size:15px}}

.tpl-cine .k-sec{padding-block:120px}
.tpl-cine .k-h2{font-family:'Gloock',serif;font-size:clamp(44px,6vw,96px);line-height:.92;letter-spacing:-.01em}
.tpl-cine .k-eb{font-size:12px;letter-spacing:.34em;text-transform:uppercase;color:var(--gold)}
.tpl-cine .k-strip{position:relative;background:#141210;padding-block:26px;overflow:hidden;border-block:1px solid var(--line)}
.tpl-cine .k-strip + .k-strip{border-top:0}
.tpl-cine .k-film{display:flex;gap:0;width:max-content;animation:kRoll var(--t,120s) linear infinite}
.tpl-cine .k-strip.rev .k-film{animation-direction:reverse}
.tpl-cine .k-strip:hover .k-film{animation-play-state:paused}
@keyframes kRoll{to{transform:translateX(-50%)}}
.tpl-cine .k-fr{position:relative;width:200px;padding:22px 8px;background:#1C1916;border:0;cursor:pointer;flex:none;color:var(--ink);text-align:left}
.tpl-cine .k-fr::before,.tpl-cine .k-fr::after{content:"";position:absolute;left:0;right:0;height:10px;background:repeating-linear-gradient(90deg,transparent 0 9px,#0B0A09 9px 21px,transparent 21px 30px);background-size:30px 10px}
.tpl-cine .k-fr::before{top:6px}.tpl-cine .k-fr::after{bottom:6px}
.tpl-cine .k-fr .ph{aspect-ratio:4/3;overflow:hidden;filter:sepia(.35) contrast(1.05) brightness(.85);transition:filter .4s}
.tpl-cine .k-fr:hover .ph{filter:none}
.tpl-cine .k-fr span{position:absolute;left:16px;bottom:34px;font-family:'Gloock',serif;font-size:20px;text-shadow:0 2px 10px #000;opacity:0;transition:opacity .3s}
.tpl-cine .k-fr:hover span,.tpl-cine .k-fr:focus-visible span{opacity:1}

.tpl-cine .k-posters{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:22px;margin-top:52px}
.tpl-cine .k-po{position:relative;aspect-ratio:2/3;overflow:hidden;border:0;padding:0;cursor:pointer;background:#000;color:var(--ink);text-align:left;box-shadow:0 40px 60px -40px #000}
.tpl-cine .k-po .ph{position:absolute;inset:0;transition:transform 1.2s cubic-bezier(.2,.8,.2,1)}
.tpl-cine .k-po:hover .ph{transform:scale(1.08)}
.tpl-cine .k-po::after{content:"";position:absolute;inset:0;background:linear-gradient(0deg,rgba(0,0,0,.92) 0,rgba(0,0,0,.2) 55%,rgba(0,0,0,.35))}
.tpl-cine .k-po .tp{position:absolute;top:16px;left:16px;right:16px;z-index:2;display:flex;justify-content:space-between;font-size:11px;letter-spacing:.26em;text-transform:uppercase;color:var(--gold)}
.tpl-cine .k-po .bt{position:absolute;left:18px;right:18px;bottom:18px;z-index:2}
.tpl-cine .k-po .bt b{display:block;font-family:'Gloock',serif;font-weight:400;font-size:clamp(34px,3.4vw,52px);line-height:.9}
.tpl-cine .k-po .bt span{display:block;margin-top:10px;font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:#CFC6B8}
.tpl-cine .k-po .bt em{display:block;margin-top:12px;padding-top:10px;border-top:1px solid var(--line);font-style:normal;font-size:10px;letter-spacing:.2em;text-transform:uppercase;color:var(--soft)}
@media (max-width:980px){.tpl-cine .k-posters{grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.tpl-cine .k-po .bt em{display:none}.tpl-cine .k-po .bt b{font-size:30px}.tpl-cine .k-po .bt span{font-size:10px;letter-spacing:.12em}}

.tpl-cine .k-soon{position:relative;overflow:hidden;border-block:1px solid var(--line)}
.tpl-cine .k-soon .bgp{position:absolute;inset:0;opacity:.28;filter:grayscale(1) contrast(1.2)}
.tpl-cine .k-soon .bgp::after{content:"";position:absolute;inset:0;background:linear-gradient(90deg,var(--bg) 20%,rgba(11,10,9,.6))}
.tpl-cine .k-soon .w{position:relative;display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,1fr);gap:48px;align-items:center;padding-block:120px}
.tpl-cine .k-clock{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}
.tpl-cine .k-clock div{border:1px solid var(--line);padding:22px 10px 14px;text-align:center;background:rgba(11,10,9,.5);backdrop-filter:blur(6px)}
.tpl-cine .k-clock b{display:block;font-family:'Gloock',serif;font-weight:400;font-size:clamp(40px,5vw,72px);line-height:1;font-variant-numeric:tabular-nums}
.tpl-cine .k-clock span{display:block;margin-top:8px;font-size:11px;letter-spacing:.24em;text-transform:uppercase;color:var(--soft)}
.tpl-cine .k-reel{height:2px;background:var(--line);margin-top:28px;position:relative}
.tpl-cine .k-reel i{position:absolute;inset:0 auto 0 0;width:0;background:var(--gold);transition:width 2s cubic-bezier(.2,.8,.2,1)}
.tpl-cine .k-reel-l{display:flex;justify-content:space-between;margin-top:12px;font-size:13px;color:var(--soft)}
@media (max-width:900px){.tpl-cine .k-soon .w{grid-template-columns:minmax(0,1fr)}.tpl-cine .k-clock b{font-size:38px}}

.tpl-cine .k-cred{text-align:center}
.tpl-cine .k-cf{display:flex;flex-wrap:wrap;justify-content:center;gap:8px;margin-top:34px}
.tpl-cine .k-cf button{border:0;background:transparent;color:var(--soft);font-size:12px;letter-spacing:.22em;text-transform:uppercase;min-height:40px;padding:0 14px;cursor:pointer;box-shadow:inset 0 0 0 1px var(--line)}
.tpl-cine .k-cf button[aria-pressed="true"]{color:#0B0A09;background:var(--ink)}
.tpl-cine .k-cf label{display:flex;align-items:center;gap:8px;min-height:40px;padding:0 14px;box-shadow:inset 0 0 0 1px var(--line)}
.tpl-cine .k-cf label svg{width:15px;color:var(--soft)}
.tpl-cine .k-cf input{background:transparent;border:0;outline:0;color:var(--ink);font-size:14px;width:150px}
.tpl-cine .k-win{position:relative;height:620px;overflow:hidden;margin-top:30px;-webkit-mask-image:linear-gradient(transparent,#000 14%,#000 86%,transparent);mask-image:linear-gradient(transparent,#000 14%,#000 86%,transparent)}
.tpl-cine .k-win.static{height:auto;-webkit-mask-image:none;mask-image:none}
.tpl-cine .k-roll{will-change:transform;padding-block:280px}
.tpl-cine .k-win.static .k-roll{padding-block:10px;transform:none!important}
.tpl-cine .k-role{margin-top:56px}
.tpl-cine .k-role:first-child{margin-top:0}
.tpl-cine .k-role h4{font-size:12px;letter-spacing:.34em;text-transform:uppercase;color:var(--gold);font-weight:600}
.tpl-cine .k-names{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px 40px;max-width:920px;margin:18px auto 0}
.tpl-cine .k-names button{border:0;background:transparent;color:var(--ink);cursor:pointer;display:flex;justify-content:space-between;gap:12px;align-items:baseline;padding:6px 0;border-bottom:1px dotted var(--line);text-align:left}
.tpl-cine .k-names b{font-family:'Gloock',serif;font-weight:400;font-size:22px}
.tpl-cine .k-names span{font-size:12px;color:var(--soft);letter-spacing:.08em;white-space:nowrap}
.tpl-cine .k-names button:hover b{color:var(--gold)}
@media (max-width:760px){.tpl-cine .k-names{grid-template-columns:minmax(0,1fr)}.tpl-cine .k-win{height:520px}}
.tpl-cine .k-cnote{margin-top:18px;font-size:13px;color:var(--soft)}
.tpl-cine .k-cnote button{background:none;border:0;color:var(--ink);text-decoration:underline;cursor:pointer;font-size:13px}
.tpl-cine .k-end{padding-block:120px 80px;text-align:center;border-top:1px solid var(--line)}
.tpl-cine .k-end .k-h2{font-size:clamp(36px,5vw,72px)}
.tpl-cine .k-end p{margin-top:16px;color:var(--soft);max-width:44em;margin-inline:auto;line-height:1.7}
.tpl-cine .k-end .sup{display:flex;flex-wrap:wrap;justify-content:center;gap:10px 30px;margin-top:34px;font-size:12px;letter-spacing:.2em;text-transform:uppercase;color:var(--soft)}
.tpl-cine .k-end .fine{margin-top:60px;font-size:12px;color:#6F675B}

.tpl-cine .k-rate{border-block:1px solid var(--line);background:#100E0B}
.tpl-cine .k-rate .w{display:flex;align-items:center;gap:22px;padding-block:22px}
.tpl-cine .k-rate .box{flex:none;width:72px;height:72px;border:2px solid var(--gold);display:grid;place-items:center;align-content:center;color:var(--gold)}
.tpl-cine .k-rate .box b{font-family:'Gloock',serif;font-size:28px;font-weight:400;line-height:1}
.tpl-cine .k-rate .box span{font-size:9px;letter-spacing:.3em;text-transform:uppercase}
.tpl-cine .k-rate p{display:flex;flex-direction:column;gap:4px}
.tpl-cine .k-rate strong{font-size:16px;font-weight:600}
.tpl-cine .k-rate em{font-style:normal;color:var(--soft);font-size:14px}
.tpl-cine .k-tix .row{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px;margin-top:30px}
.tpl-cine .k-tk{position:relative;display:flex;flex-direction:column;gap:6px;padding:30px 30px 30px 40px;background:var(--gold);color:#0B0A09!important;text-decoration:none;transition:transform .5s cubic-bezier(.2,.8,.2,1);-webkit-mask:radial-gradient(circle 14px at 0 50%,transparent 98%,#000) left/51% 100% no-repeat,radial-gradient(circle 14px at 100% 50%,transparent 98%,#000) right/51% 100% no-repeat}
.tpl-cine .k-tk::before{content:"";position:absolute;left:20px;top:16px;bottom:16px;border-left:2px dashed rgba(11,10,9,.35)}
.tpl-cine .k-tk:nth-child(2){background:#F4EDE1}.tpl-cine .k-tk:nth-child(3){background:#D9A35B}
.tpl-cine .k-tk:hover{transform:translateY(-6px) rotate(-1deg)}
.tpl-cine .k-tk .no{font-size:11px;letter-spacing:.3em;opacity:.6}
.tpl-cine .k-tk b{font-family:'Gloock',serif;font-weight:400;font-size:clamp(36px,3.6vw,54px);line-height:1}
.tpl-cine .k-tk .cl{font-size:11px;letter-spacing:.3em;text-transform:uppercase;font-weight:700}
.tpl-cine .k-tk p{font-size:15px;line-height:1.5;opacity:.8;max-width:18em}
.tpl-cine .k-tk .go{position:absolute;right:26px;top:28px;width:22px}
.tpl-cine .k-note{margin-top:18px;color:var(--soft);font-size:14px}
@media (max-width:860px){.tpl-cine .k-tix .row{grid-template-columns:minmax(0,1fr)}}
.tpl-cine .k-empty{margin-top:30px;padding:34px;border:1px dashed var(--line);color:var(--soft);font-size:17px;line-height:1.6;max-width:44em}
.tpl-cine .k-sub{margin-top:14px;color:var(--soft);font-size:17px;line-height:1.6;max-width:32em}
.tpl-cine .k-needs{margin-top:44px;border-top:1px solid var(--line)}
.tpl-cine .k-nd{display:grid;grid-template-columns:60px minmax(0,1.4fr) minmax(0,1fr) 130px 80px;align-items:center;gap:22px;padding:26px 0;border-bottom:1px solid var(--line)}
.tpl-cine .k-nd .ix{font-family:'Gloock',serif;font-size:30px;color:var(--gold)}
.tpl-cine .k-nd b{display:block;font-size:20px;font-weight:600}
.tpl-cine .k-nd div span{font-size:12px;letter-spacing:.2em;text-transform:uppercase;color:var(--soft)}
.tpl-cine .k-nd .br{height:4px;background:var(--line)}
.tpl-cine .k-nd .br i{display:block;height:100%;width:0;background:var(--gold);transition:width 1.8s cubic-bezier(.2,.8,.2,1)}
.tpl-cine .k-nd .v{color:var(--soft);font-size:14px}.tpl-cine .k-nd .v strong{color:var(--ink);font-size:18px}
.tpl-cine .k-nd a{font-size:12px;letter-spacing:.2em;text-transform:uppercase;text-decoration:none;color:var(--gold);font-weight:700;justify-self:end}
@media (max-width:860px){.tpl-cine .k-nd{grid-template-columns:44px minmax(0,1fr) auto;gap:10px 16px}.tpl-cine .k-nd .br{grid-column:2/4}.tpl-cine .k-nd .v{grid-column:2}.tpl-cine .k-nd a{grid-column:3;grid-row:3}}
.tpl-cine .k-shop{background:#14110D}
.tpl-cine .k-prods{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:18px;margin-top:44px}
.tpl-cine .k-pr{display:flex;flex-direction:column;gap:4px;text-decoration:none;padding:18px;border:1px solid var(--line);transition:border-color .4s,transform .5s cubic-bezier(.2,.8,.2,1)}
.tpl-cine .k-pr:hover{border-color:var(--gold);transform:translateY(-6px)}
.tpl-cine .k-pr .ph{aspect-ratio:3/4;margin-bottom:14px;overflow:hidden}
.tpl-cine .k-pr .ph svg{width:100%;height:100%}
.tpl-cine .k-pr .c{font-size:11px;letter-spacing:.3em;text-transform:uppercase;color:var(--gold)}
.tpl-cine .k-pr b{font-family:'Gloock',serif;font-weight:400;font-size:24px}
.tpl-cine .k-pr .pz{color:var(--soft)}
.tpl-cine .k-pr .by{display:flex;align-items:center;gap:8px;margin-top:10px;font-size:12px;letter-spacing:.2em;text-transform:uppercase;font-weight:700}
.tpl-cine .k-pr .by svg{width:14px}
@media (max-width:1000px){.tpl-cine .k-prods{grid-template-columns:repeat(2,minmax(0,1fr))}}
.tpl-cine .k-help{position:relative;text-align:center;padding-block:160px;background:radial-gradient(60% 70% at 50% 50%,rgba(232,194,122,.18),transparent 70%),#0B0A09;overflow:hidden}
.tpl-cine .k-help::before,.tpl-cine .k-help::after{content:"";position:absolute;left:0;right:0;height:46px;background:repeating-linear-gradient(90deg,transparent 0 22px,rgba(244,237,225,.08) 22px 40px);border-block:1px solid var(--line)}
.tpl-cine .k-help::before{top:0}.tpl-cine .k-help::after{bottom:0}
.tpl-cine .k-help h2{font-size:clamp(46px,7vw,120px);line-height:.95;margin:20px auto 0;max-width:12em}
.tpl-cine .k-help p{color:#D6CEC1;font-size:19px;line-height:1.6;max-width:32em;margin:26px auto 36px}
.tpl-cine .k-about{display:grid;grid-template-columns:minmax(0,.8fr) minmax(0,1.2fr);gap:50px;border-top:1px solid var(--line)}
.tpl-cine .k-about .tx{font-family:'Gloock',serif;font-size:clamp(22px,2.2vw,32px);line-height:1.35}
.tpl-cine .k-bdg{display:flex;flex-wrap:wrap;gap:10px;margin-top:28px}
.tpl-cine .k-bdg span{display:inline-flex;align-items:center;gap:8px;border:1px solid var(--line);padding:9px 16px;font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:var(--soft)}
.tpl-cine .k-bdg span.ok{color:var(--gold);border-color:rgba(232,194,122,.5)}
.tpl-cine .k-bdg svg{width:14px}
@media (max-width:860px){.tpl-cine .k-about{grid-template-columns:minmax(0,1fr);gap:20px}}
.tpl-cine .k-press .hd,.tpl-cine .k-box .hd{display:flex;justify-content:space-between;align-items:flex-end;gap:20px;flex-wrap:wrap}
.tpl-cine .k-lnk{display:inline-flex;align-items:center;gap:10px;background:none;border:0;color:var(--gold);font:inherit;font-size:13px;letter-spacing:.2em;text-transform:uppercase;font-weight:700;text-decoration:none;cursor:pointer;padding:0}
.tpl-cine .k-lnk svg{width:15px}
.tpl-cine .k-revs{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:0;margin-top:44px;border-top:1px solid var(--line)}
.tpl-cine .k-revs figure{margin:0;padding:34px 30px 10px 0;display:flex;flex-direction:column;gap:18px}
.tpl-cine .k-revs figure + figure{padding-left:30px;border-left:1px solid var(--line)}
.tpl-cine .k-revs .st{color:var(--gold);letter-spacing:4px}
.tpl-cine .k-revs blockquote{margin:0;font-size:24px;line-height:1.35}
.tpl-cine .k-revs figcaption{font-size:12px;letter-spacing:.2em;text-transform:uppercase;color:var(--soft);margin-top:auto}
@media (max-width:860px){.tpl-cine .k-revs{grid-template-columns:minmax(0,1fr)}.tpl-cine .k-revs figure + figure{padding-left:0;border-left:0;border-top:1px solid var(--line)}}
.tpl-cine .k-lsum{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));margin-top:40px;border-block:1px solid var(--line)}
.tpl-cine .k-lsum div{padding:24px 0}
.tpl-cine .k-lsum div + div{padding-left:28px;border-left:1px solid var(--line)}
.tpl-cine .k-lsum span{font-size:11px;letter-spacing:.3em;text-transform:uppercase;color:var(--soft)}
.tpl-cine .k-lsum b{display:block;margin-top:8px;font-family:'Gloock',serif;font-weight:400;font-size:clamp(26px,3vw,44px);color:var(--gold)}
.tpl-cine .k-tw{overflow-x:auto}
.tpl-cine .k-box table{width:100%;border-collapse:collapse;font-size:15px}
.tpl-cine .k-box th,.tpl-cine .k-box td{text-align:left;padding:18px 14px 18px 0;border-bottom:1px solid var(--line)}
.tpl-cine .k-box th{font-size:11px;letter-spacing:.24em;text-transform:uppercase;color:var(--soft);font-weight:500}
.tpl-cine .k-box .num{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
.tpl-cine .k-box .lk{font-size:11px;letter-spacing:.18em;text-transform:uppercase;padding:4px 10px;border:1px solid var(--line)}
.tpl-cine .k-box .lk.in{color:var(--gold)}
@media (max-width:700px){.tpl-cine .k-lsum{grid-template-columns:minmax(0,1fr)}.tpl-cine .k-lsum div + div{padding-left:0;border-left:0;border-top:1px solid var(--line)}}
.tpl-cine .k-hall .in{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.3fr);gap:40px;align-items:stretch}
.tpl-cine .k-hall dl{margin:28px 0;display:grid;gap:6px}
.tpl-cine .k-hall dt{font-size:11px;letter-spacing:.3em;text-transform:uppercase;color:var(--gold);margin-top:14px}
.tpl-cine .k-hall dd{margin:0;font-size:19px}
.tpl-cine .k-hall .map{min-height:380px;border:1px solid var(--line)}
@media (max-width:860px){.tpl-cine .k-hall .in{grid-template-columns:minmax(0,1fr)}.tpl-cine .k-hall .map{min-height:240px}}
.tpl-cine .k-soc{margin-top:40px;display:flex;flex-direction:column;align-items:center;gap:16px}
.tpl-cine .k-soc p{margin:0!important;font-size:14px}
.tpl-cine .k-soc div{display:flex;gap:10px}
.tpl-cine .k-soc a{width:44px;height:44px;border:1px solid var(--line);display:grid;place-items:center;border-radius:50%}
.tpl-cine .k-soc a:hover{border-color:var(--gold);color:var(--gold)}
.tpl-cine .k-soc svg{width:18px}
.tpl-cine .ldg{border:0;padding:0;background:transparent;width:min(980px,calc(100vw - 24px));max-width:none;color:var(--ink)}
.tpl-cine .ldg::backdrop{background:rgba(0,0,0,.88)}
.tpl-cine .ldg-in{background:#14110D;border:1px solid var(--line);padding:44px;position:relative;max-height:calc(100vh - 24px);overflow:auto}
.tpl-cine .ldg-k{font-size:11px;letter-spacing:.3em;text-transform:uppercase;color:var(--gold)}
.tpl-cine .ldg-t{font-family:'Gloock',serif;font-weight:400;font-size:48px}
.tpl-cine .ldg-d{color:var(--soft)}
.tpl-cine .ldg-sum{display:flex;gap:34px;flex-wrap:wrap;margin-top:22px}
.tpl-cine .ldg-sum span{display:block;font-size:11px;letter-spacing:.24em;text-transform:uppercase;color:var(--soft)}
.tpl-cine .ldg-sum b{font-family:'Gloock',serif;font-weight:400;font-size:30px;color:var(--gold)}
.tpl-cine .ldg-tw{overflow-x:auto;margin-top:22px}
.tpl-cine .ldg table{width:100%;border-collapse:collapse;font-size:14px}
.tpl-cine .ldg th,.tpl-cine .ldg td{text-align:left;padding:12px 10px;border-bottom:1px solid var(--line)}
.tpl-cine .ldg th{font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:var(--soft);font-weight:500}
.tpl-cine .ldg .num{text-align:right;white-space:nowrap}
.tpl-cine .ldg .lk{font-size:11px;padding:3px 8px;border:1px solid var(--line)}
.tpl-cine .ldg-x{position:absolute;top:16px;right:16px;width:42px;height:42px;border-radius:50%;border:1px solid var(--line);background:transparent;color:var(--ink);cursor:pointer;display:grid;place-items:center}
.tpl-cine .ldg-x svg{width:16px}

.tpl-cine dialog.sheet{border:0;padding:0;background:transparent;width:min(1080px,calc(100vw - 24px));max-width:none;color:var(--ink)}
.tpl-cine dialog.sheet::backdrop{background:rgba(0,0,0,.88)}
.tpl-cine .sh-in{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);background:#141210;position:relative;animation:kIn .6s ease;box-shadow:0 0 0 1px var(--line)}
@keyframes kIn{from{opacity:0;clip-path:inset(0 0 100% 0)}to{opacity:1;clip-path:inset(0)}}
.tpl-cine .sh-ph{aspect-ratio:2/3;max-height:80vh;width:100%}
.tpl-cine .sh-bd{padding:44px;display:flex;flex-direction:column;gap:18px;justify-content:center}
.tpl-cine .sh-k{font-size:12px;letter-spacing:.3em;text-transform:uppercase;color:var(--gold)}
.tpl-cine .sh-n{font-family:'Gloock',serif;font-weight:400;font-size:84px;line-height:.85}
.tpl-cine .sh-dl{display:grid;grid-template-columns:1fr 1fr;gap:14px 24px;margin:0}
.tpl-cine .sh-dl dt{font-size:11px;letter-spacing:.24em;text-transform:uppercase;color:var(--soft)}
.tpl-cine .sh-dl dd{margin:4px 0 0;font-size:17px}
.tpl-cine .sh-act{display:flex;gap:10px;flex-wrap:wrap;margin-top:10px}
.tpl-cine .sh-b1,.tpl-cine .sh-b2{min-height:52px;padding:0 24px;display:inline-flex;align-items:center;text-decoration:none;font-weight:700;letter-spacing:.06em;text-transform:uppercase;font-size:13px}
.tpl-cine .sh-b1{background:var(--ink);color:#0B0A09}
.tpl-cine .sh-b2{box-shadow:inset 0 0 0 1px rgba(244,237,225,.5);color:var(--ink)}
.tpl-cine .sh-x{position:absolute;top:14px;right:14px;width:44px;height:44px;border:0;background:rgba(0,0,0,.5);color:var(--ink);cursor:pointer;display:grid;place-items:center;z-index:2;border-radius:50%}
.tpl-cine .sh-x svg{width:18px}
@media (max-width:760px){.tpl-cine .sh-in{grid-template-columns:minmax(0,1fr);max-height:calc(100vh - 24px);overflow:auto}.tpl-cine .sh-ph{aspect-ratio:4/3}.tpl-cine .sh-bd{padding:24px}.tpl-cine .sh-n{font-size:56px}}

@media (max-width:560px){.tpl-cine .k-box table{min-width:600px}}
.tpl-cine .k-box td:first-child{white-space:nowrap}
.tpl-cine a.k-fr,.tpl-cine a.k-po{text-decoration:none;display:block}
.tpl-cine .k-names a{color:var(--ink);text-decoration:none;display:flex;justify-content:space-between;gap:12px;align-items:baseline;padding:6px 0;border-bottom:1px dotted var(--line)}
.tpl-cine .k-soon .bgp img{width:100%;height:100%;object-fit:cover}
.tpl-cine .k-hall .in.nomap{grid-template-columns:minmax(0,1fr)}
.tpl-cine .k-hall .map{position:relative}
.tpl-cine .k-hall .map iframe{position:absolute;inset:0}
.tpl-cine .k-slide .tpl-art{inset:0}
`;

const FILTERS: Record<string, (a: TplAnimal) => boolean> = {
  todos: () => true,
  perro: (a) => a.sp === 'perro',
  gato: (a) => a.sp === 'gato',
  otro: (a) => a.sp === 'otro',
  bebes: (a) => a.hasAge && a.months < 12,
  senior: (a) => a.stage === 'Senior',
};
/** Protagonistas del hero: hasta 4, primero los que tienen foto real. */
const castOf = (A: readonly TplAnimal[]) =>
  [...A].sort((a, b) => Number(Boolean(b.photo)) - Number(Boolean(a.photo))).slice(0, 4);

export const cine: TemplateDesign = {
  id: 'cine',
  fonts: 'family=Albert+Sans:wght@300;400;500;600;700&family=Gloock',
  css: CSS,
  html(m, KIT) {
    const { ORG, CAMPAIGN, ANIMALS, SHOW, BADGES, NEEDS, PRODUCTS, REVIEWS } = m;
    const n = m.COUNTS.total;
    const cast = castOf(ANIMALS);
    const half = Math.ceil(ANIMALS.length / 2);
    const frame = (a: TplAnimal, dup: boolean) =>
      `<a class="k-fr" href="${a.href}"${dup ? ' tabindex="-1" aria-hidden="true"' : ` aria-label="${a.name}"`}><div class="ph">${portrait(a, { decor: true })}</div><span>${a.name}</span></a>`;
    const film = (L: TplAnimal[]) =>
      L.map((a) => frame(a, false)).join('') + L.map((a) => frame(a, true)).join('');
    const fresh = ANIMALS.filter((a) => a.isNew);
    const t = KIT.transparencyParts();
    const map = mapEmbed(m);
    const filters = (
      [
        ['todos', 'Todos'],
        ['perro', 'Perros'],
        ['gato', 'Gatos'],
        ['otro', 'Otros'],
        ['bebes', 'Cachorros'],
        ['senior', 'Seniors'],
      ] as const
    ).filter(([f]) => f === 'todos' || ANIMALS.some(FILTERS[f]));
    const mobile = typeof innerWidth === 'number' && innerWidth < 760;
    return `
<div class="k-grain" aria-hidden="true"></div>
<section class="k-hero" id="k-hero"${cast.length > 1 ? ' aria-roledescription="carrusel"' : ''} aria-label="Protagonistas">
  <header class="k-top"><p class="pres"><b>${ORG.name}</b> presenta</p><nav aria-label="Principal">${fresh.length ? '<a href="#k-estrenos">Estrenos</a>' : ''}<a href="#k-soon">Campaña</a><a href="#k-cred">Reparto</a><a href="#k-libro">Transparencia</a></nav></header>
  <h1 class="sr">${ORG.name}</h1>
  ${
    cast.length
      ? cast
          .map(
            (a, i) =>
              `<div class="k-slide${i === 0 ? ' on' : ''}" data-i="${i}"><div class="ph">${portrait(a, mobile ? { dx: 10, dy: 2, s: 0.8, decor: true } : { dx: 42, dy: 24, s: 0.52, decor: true })}</div></div>`,
          )
          .join('')
      : `<div class="k-slide on"><div class="ph" style="opacity:.5">${ORG.cover ? `<img class="portrait portrait--photo" src="${ORG.cover}" alt="" aria-hidden="true" referrerpolicy="no-referrer">` : ''}</div></div>`
  }
  <div class="k-lb t"></div><div class="k-lb b"></div>
  <div class="k-card${cast.length ? '' : ' on'}" id="k-card">${cast.length ? '' : `<p class="k-now">Próximamente en cartelera</p><h2 class="k-name">${ORG.name}</h2><p class="k-line"><span>${ORG.lede || availLine(m)}</span></p>`}</div>
  ${cast.length > 1 ? `<div class="k-bars" role="tablist">${cast.map((a, i) => `<button type="button" role="tab" data-i="${i}" aria-current="${i === 0}">${a.name}<i><b></b></i></button>`).join('')}</div>` : ''}
</section>
${SHOW.transparencia ? `<section class="k-rate" data-sec="transparencia" aria-label="Transparencia"><div class="w"><div class="box"><b>${ORG.level}</b><span>Nivel</span></div><p><span class="k-eb">Indicador de transparencia</span><strong>${t.level} · ${t.formalization}</strong><em>${t.accountability} · ${t.note}</em></p></div></section>` : ''}
<section class="w k-sec k-tix" data-sec="acciones"><p class="k-eb">Tres formas de entrar a la función</p>
  <div class="row">${[
    ['Adoptar', 'Admisión general', 'Lleva a uno de los protagonistas a casa.', '#k-cred'],
    ['Apadrinar', 'Abono de temporada', 'Acompaña su historia mes a mes.', '#k-cred'],
    ['Donar', 'Patrocinio', 'Haz posible la próxima función.', ORG.donateHref],
  ]
    .map(
      (tk, i) =>
        `<a class="k-tk" href="${tk[3]}"><span class="no">Nº 00${i + 1}</span><b>${tk[0]}</b><span class="cl">${tk[1]}</span><p>${tk[2]}</p><span class="go">${ic.arrow}</span></a>`,
    )
    .join('')}</div>
  <p class="k-note">${COPY.adoptNote}</p></section>
${
  n
    ? `<section class="k-sec" style="padding-bottom:70px"><div class="w"><p class="k-eb">El reparto completo</p><h2 class="k-h2" style="margin-top:16px">${n === 1 ? '1 historia' : `${n} historias`}<br>en cartelera</h2></div></section>
<div class="k-strip" style="--t:150s"><div class="k-film">${film(ANIMALS.slice(0, half))}</div></div>
${ANIMALS.length > 1 ? `<div class="k-strip rev" style="--t:170s"><div class="k-film">${film(ANIMALS.slice(half))}</div></div>` : ''}`
    : ''
}
${
  fresh.length
    ? `<section class="w k-sec" id="k-estrenos">
  <div style="display:flex;justify-content:space-between;align-items:flex-end;gap:20px;flex-wrap:wrap"><div><p class="k-eb">Estrenos</p><h2 class="k-h2" style="margin-top:16px">Recién publicados</h2></div><p style="color:var(--soft);max-width:22em;line-height:1.6">${fresh.length === 1 ? '1 se publicó' : `${fresh.length} se publicaron`} en los últimos 14 días.</p></div>
  <div class="k-posters">${fresh
    .slice(0, 8)
    .map(
      (a) =>
        `<a class="k-po" href="${a.href}"><div class="ph">${portrait(a, { decor: true, dx: 5, dy: 2, s: 0.9 })}</div><span class="tp"><span>Estreno</span><span>${a.spLabel}</span></span><span class="bt"><b>${a.name}</b><span>${a.age} · ${a.sizeLabel}</span><em>${sinceLabel(a)} · ${ORG.short}</em></span></a>`,
    )
    .join('')}</div>
</section>`
    : ''
}
${
  CAMPAIGN.active
    ? `<section class="k-soon" id="k-soon" data-sec="campana">${ORG.cover ? `<div class="bgp"><img src="${ORG.cover}" alt="" aria-hidden="true" referrerpolicy="no-referrer" loading="lazy"></div>` : ''}
  <div class="w"><div><p class="k-eb">Campaña activa${CAMPAIGN.category ? ` · ${CAMPAIGN.category}` : ''}</p><h2 class="k-h2" style="margin-top:16px">${CAMPAIGN.title}</h2>
    ${CAMPAIGN.description ? `<p style="margin-top:20px;color:#D6CEC1;font-size:18px;line-height:1.6;max-width:30em">${CAMPAIGN.description}</p>` : ''}
    <p style="margin-top:14px;color:#D6CEC1;line-height:1.6;max-width:30em">${COPY.adoptNote}</p>
    <div class="k-acts"><a class="k-btn" href="${CAMPAIGN.href}" data-magnet>Ver campaña y aportar ${ic.arrow}</a></div>${KIT.moreCampaigns()}</div>
    <div>${CAMPAIGN.deadlineISO ? `<div class="k-clock" role="timer" aria-label="Tiempo restante de la campaña"><div><b id="k-d">00</b><span>Días</span></div><div><b id="k-h">00</b><span>Horas</span></div><div><b id="k-m">00</b><span>Min</span></div><div><b id="k-s">00</b><span>Seg</span></div></div>` : ''}
      <div class="k-reel"><i id="k-reel"></i></div><div class="k-reel-l"><span><b id="k-raised" style="color:var(--ink)">${fmt(CAMPAIGN.raised)}</b> recaudado</span><span>Meta ${fmt(CAMPAIGN.goal)} · ${CAMPAIGN.pct}%</span></div></div></div>
</section>`
    : `<section class="w k-sec" id="k-soon" data-sec="campana"><p class="k-eb">Próximamente</p><h2 class="k-h2" style="margin-top:16px">Campaña activa</h2><p class="k-empty">${EMPTY.campana}</p></section>`
}
<section class="w k-sec k-cred" id="k-cred" data-sec="animales">
  <p class="k-eb">Créditos</p><h2 class="k-h2" style="margin-top:16px">Reparto</h2>
  ${
    n
      ? `<div class="k-cf" role="group" aria-label="Filtrar reparto">${filters.map((f, i) => `<button type="button" data-f="${f[0]}" aria-pressed="${i === 0}">${f[1]}</button>`).join('')}<label><span class="sr">Buscar</span>${ic.search}<input id="k-q" type="search" placeholder="Buscar un nombre" autocomplete="off"></label></div>
  <div class="k-win" id="k-win"><div class="k-roll" id="k-roll"></div></div>
  <p class="k-cnote"><span id="k-cn"></span> · <button type="button" id="k-static">Ver como lista</button></p>`
      : `<p class="k-empty">${EMPTY.animales}</p>`
  }
</section>
<section class="w k-sec" data-sec="necesidades"><p class="k-eb">Detrás de cámaras</p><h2 class="k-h2" style="margin-top:16px">Lo que necesita<br>la producción</h2>
  ${NEEDS.length ? `<div class="k-needs">${NEEDS.map((nd, i) => `<div class="k-nd"><span class="ix">${String(i + 1).padStart(2, '0')}</span><div><b>${nd.title}</b>${nd.category ? `<span>${nd.category}</span>` : ''}</div><div class="br"><i data-w="${nd.pct}"></i></div><span class="v"><strong>${nd.got}</strong>/${nd.need} ${nd.unit}</span><a href="${nd.href}">Ver y donar</a></div>`).join('')}</div>` : `<p class="k-empty">${EMPTY.necesidades}</p>`}
</section>
<section class="k-shop" data-sec="productos"><div class="w k-sec"><p class="k-eb">Confitería y recuerdos</p><h2 class="k-h2" style="margin-top:16px">Productos</h2><p class="k-sub">De la tienda solidaria de la organización.</p>
  ${PRODUCTS.length ? `<div class="k-prods">${PRODUCTS.map((p) => `<a class="k-pr" href="${p.href}"><div class="ph">${productArt(p, '#17140F')}</div>${p.category ? `<span class="c">${p.category}</span>` : ''}<b>${p.name}</b><span class="pz">${fmt(p.price)}</span><span class="by">Ver ${ic.arrow}</span></a>`).join('')}</div>` : `<p class="k-empty">${EMPTY.productos}</p>`}
</div></section>
<section class="k-help" id="portal-help-cta" data-sec="ayuda"><div class="w"><p class="k-eb">Intermedio</p><h2 class="k-serif">${COPY.helpTitle}</h2><p>${COPY.helpText}</p><a class="k-btn" href="${ORG.donateHref}" data-magnet>${COPY.helpCta} ${ic.arrow}</a></div></section>
${SHOW.nosotros ? `<section class="w k-sec k-about" data-sec="nosotros"><div><p class="k-eb">La productora</p><h2 class="k-h2" style="margin-top:16px">Sobre<br>nosotros</h2></div><div><p class="tx">${ORG.about}</p>${BADGES.length ? `<div class="k-bdg">${BADGES.map((b) => `<span class="${b.ok ? 'ok' : ''}">${b.ok ? ic.check : ic.clock}${b.t}</span>`).join('')}</div>` : ''}</div></section>` : ''}
<section class="w k-sec k-press" data-sec="resenas" style="padding-top:0"><div class="hd"><div><p class="k-eb">La crítica dice</p><h2 class="k-h2" style="margin-top:16px">Reseñas</h2></div><button type="button" class="k-lnk" data-review>Registrar reseña ${ic.arrow}</button></div>
  ${REVIEWS.length ? `<div class="k-revs">${REVIEWS.map((r) => `<figure><span class="st" aria-label="${r.rating} de 5">${stars(r.rating)}</span>${r.text ? `<blockquote class="k-serif">“${r.text}”</blockquote>` : ''}<figcaption>${r.name}${r.date ? ` · ${r.date}` : ''}</figcaption></figure>`).join('')}</div>` : `<p class="k-empty">${EMPTY.resenas}</p>`}
</section>
<section class="w k-sec k-box" id="k-libro" data-sec="libro" style="padding-top:0"><div class="hd"><div><p class="k-eb">Taquilla pública · Transparencia</p><h2 class="k-h2" style="margin-top:16px">Libro público</h2><p class="k-sub">${COPY.ledgerText}</p></div><button type="button" class="k-lnk" data-ledger>Ver libro completo ${ic.arrow}</button></div>
  ${ledgerBlock(m, 'k-empty')}
</section>
${SHOW.contacto ? `<section class="w k-sec k-hall" data-sec="contacto" style="padding-top:0"><div class="in${map ? '' : ' nomap'}"><div><p class="k-eb">La sala</p><h2 class="k-h2" style="margin-top:16px">Información de contacto</h2>${KIT.contactRows()}${mapLink(m, 'k-lnk', 'Cómo llegar')}</div>${map ? `<div class="map">${map}</div>` : ''}</div></section>` : ''}
<footer class="w k-end"><p class="k-eb">Una producción de</p><h2 class="k-h2" style="margin-top:16px">${ORG.name}</h2>
  <div class="sup">${ORG.place ? `<span>${ORG.place}</span>` : ''}${BADGES.map((b) => `<span>${b.t}</span>`).join('')}</div>
  ${SHOW.redes ? `<div class="k-soc" data-sec="redes"><p>${COPY.socialsText}</p><div>${m.SOCIALS.map((x) => socialLink(x, ic[x.key])).join('')}</div></div>` : ''}
  <p class="fine">Hecho con AdoptaFácil</p></footer>`;
  },
  init(app, env) {
    const { m, motion, catalog } = env;
    const { signal } = motion;
    // Cartelera
    const cast = castOf(m.ANIMALS);
    const slides = qsa(app, '.k-slide');
    const bars = qsa(app, '.k-bars button');
    const card = qs(app, '#k-card');
    let cur = 0;
    let t0 = performance.now();
    const DUR = 7000;
    const show = (i: number) => {
      const a = cast[i];
      if (!a || !card) return;
      cur = i;
      t0 = performance.now();
      slides.forEach((s, k) => s.classList.toggle('on', k === i));
      bars.forEach((b, k) => {
        b.setAttribute('aria-current', String(k === i));
        const fill = qs(b, 'b');
        if (fill) fill.style.transform = `scaleX(${k < i ? 1 : 0})`;
      });
      card.classList.remove('on');
      const letters = [...unesc(a.name)]
        .map(
          (c, k) =>
            `<span style="transition-delay:${k * 70}ms">${c.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`)}</span>`,
        )
        .join('');
      card.innerHTML = `<p class="k-now">Ahora en cartelera${a.isNew ? ' · Recién publicado' : ''}</p><h2 class="k-name" aria-label="${a.name}">${letters}</h2>
        <p class="k-line"><span>${a.spLabel}</span><i>·</i><span>${a.age}</span><i>·</i><span>${a.sizeLabel}</span>${a.breed ? `<i>·</i><span>${a.breed}</span>` : ''}</p>
        <div class="k-acts"><a class="k-btn" href="${a.href}">Ver ficha ${ic.arrow}</a><a class="k-btn ghost" href="#k-cred">Todo el reparto</a></div>`;
      requestAnimationFrame(() => requestAnimationFrame(() => card.classList.add('on')));
    };
    show(0);
    bars.forEach((b) => b.addEventListener('click', () => show(Number(b.dataset.i)), { signal }));
    if (cast.length > 1)
      motion.onFrame((tm) => {
        if (motion.reduce) return;
        const k = Math.min(1, (tm - t0) / DUR);
        const fill = bars[cur] ? qs(bars[cur], 'b') : null;
        if (fill) fill.style.transform = `scaleX(${k})`;
        if (k >= 1) show((cur + 1) % cast.length);
      });

    // Cuenta regresiva
    if (m.CAMPAIGN.active) {
      const end = new Date(unesc(m.CAMPAIGN.deadlineISO)).getTime();
      const els = ['#k-d', '#k-h', '#k-m', '#k-s'].map((sel) => qs(app, sel));
      if (!Number.isNaN(end) && els.every(Boolean)) {
        const pad = (v: number) => String(v).padStart(2, '0');
        const tick = () => {
          const s = Math.max(0, Math.floor((end - Date.now()) / 1000));
          const v = [
            Math.floor(s / 86400),
            Math.floor((s % 86400) / 3600),
            Math.floor((s % 3600) / 60),
            s % 60,
          ];
          els.forEach((e, k) => {
            if (e) e.textContent = pad(v[k]);
          });
        };
        tick();
        const iv = setInterval(tick, 1000);
        signal.addEventListener('abort', () => clearInterval(iv));
      } else qs(app, '.k-clock')?.remove();
      const reel = qs(app, '#k-reel');
      if (reel) {
        const fill = () => (reel.style.width = Math.max(1.5, m.CAMPAIGN.pct) + '%');
        if (typeof IntersectionObserver !== 'function') fill();
        motion.observe(
          [reel],
          (en, io) => {
            if (en.isIntersecting) {
              fill();
              io.disconnect();
            }
          },
          { threshold: 0.5 },
        );
      }
      motion.countUp(qs(app, '#k-raised'), m.CAMPAIGN.raised, fmt);
    }
    const nbars = qsa(app, '.k-nd .br i');
    if (typeof IntersectionObserver !== 'function')
      nbars.forEach((i) => (i.style.width = i.dataset.w + '%'));
    motion.observe(
      nbars,
      (en, io) => {
        if (!en.isIntersecting) return;
        const el = en.target as HTMLElement;
        el.style.width = el.dataset.w + '%';
        io.unobserve(el);
      },
      { threshold: 0.4 },
    );

    // Créditos que corren solos
    const roll = qs(app, '#k-roll');
    const win = qs(app, '#k-win');
    if (roll && win) {
      let fk = 'todos';
      let q = '';
      let y = 0;
      let paused = false;
      const cn = qs(app, '#k-cn');
      const credits = () => {
        const L = catalog.query({ q, sort: 'nombre' }).filter(FILTERS[fk] ?? FILTERS.todos);
        const roles = (
          [
            ['Perros', L.filter((a) => a.sp === 'perro')],
            ['Gatos', L.filter((a) => a.sp === 'gato')],
            ['Otros', L.filter((a) => a.sp === 'otro')],
          ] as Array<[string, TplAnimal[]]>
        ).filter((r) => r[1].length);
        roll.innerHTML =
          roles
            .map(
              ([title, R]) =>
                `<div class="k-role"><h4>${title} · ${R.length}</h4><div class="k-names">${R.map((a) => `<a href="${a.href}"><b>${a.name}</b><span>${a.age} · ${a.sizeLabel}</span></a>`).join('')}</div></div>`,
            )
            .join('') || `<p style="color:var(--soft)">Nadie con ese nombre en el reparto.</p>`;
        if (cn) cn.textContent = `${L.length} de ${m.ANIMALS.length} en el reparto`;
        y = 0;
      };
      credits();
      if (motion.reduce) win.classList.add('static');
      win.addEventListener('pointerenter', () => (paused = true), { signal });
      win.addEventListener('pointerleave', () => (paused = false), { signal });
      win.addEventListener('focusin', () => (paused = true), { signal });
      win.addEventListener('focusout', () => (paused = false), { signal });
      win.addEventListener(
        'wheel',
        (e) => {
          if (win.classList.contains('static')) return;
          const max = Math.max(0, roll.offsetHeight - win.clientHeight);
          if (max === 0) return;
          e.preventDefault();
          y = Math.max(0, Math.min(max, y + e.deltaY));
        },
        { signal, passive: false },
      );
      let inView = typeof IntersectionObserver !== 'function';
      motion.observe([win], (en) => {
        inView = en.isIntersecting;
      });
      motion.onFrame(() => {
        if (win.classList.contains('static') || !inView) {
          roll.style.transform = '';
          return;
        }
        const max = Math.max(0, roll.offsetHeight - win.clientHeight);
        if (!paused) y += 0.6;
        if (y > max) y = 0;
        roll.style.transform = `translateY(${-y}px)`;
      });
      qs(app, '.k-cf')?.addEventListener(
        'click',
        (e) => {
          const b = (e.target as Element).closest<HTMLElement>('button');
          if (!b) return;
          fk = b.dataset.f ?? 'todos';
          qsa(app, '.k-cf button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
          credits();
        },
        { signal },
      );
      qs<HTMLInputElement>(app, '#k-q')?.addEventListener(
        'input',
        (e) => {
          q = (e.target as HTMLInputElement).value;
          credits();
        },
        { signal },
      );
      qs(app, '#k-static')?.addEventListener(
        'click',
        (e) => {
          const s = win.classList.toggle('static');
          (e.currentTarget as HTMLElement).textContent = s ? 'Ver como créditos' : 'Ver como lista';
        },
        { signal },
      );
    }
    motion.magnet(app);
  },
};
