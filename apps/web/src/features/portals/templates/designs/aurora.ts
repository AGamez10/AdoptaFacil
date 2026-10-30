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
.tpl-aurora{--ink:#F5F7FF;--soft:rgba(235,240,255,.66);--glass:rgba(255,255,255,.08);--glass2:rgba(255,255,255,.14);--edge:rgba(255,255,255,.18);font-family:'Onest',system-ui,sans-serif;color:var(--ink);background:#07070F;position:relative;z-index:1;overflow-x:clip}
.tpl-aurora .a-gl:not(.on){background:radial-gradient(60% 50% at 20% 20%,color-mix(in srgb,var(--brand) 70%,transparent),transparent),radial-gradient(50% 50% at 80% 30%,#5B3CFF88,transparent),radial-gradient(60% 60% at 60% 90%,#00C2FF55,transparent),#07070F}
.tpl-aurora a{color:inherit}
.tpl-aurora .a-gl{position:fixed;inset:0;width:100%;height:100%;z-index:-1;display:block;pointer-events:none}
.tpl-aurora .a-glass{background:var(--glass);backdrop-filter:blur(24px) saturate(160%);-webkit-backdrop-filter:blur(24px) saturate(160%);box-shadow:inset 0 0 0 1px var(--edge),inset 0 1px 0 rgba(255,255,255,.22),0 30px 60px -30px rgba(0,0,0,.6)}
.tpl-aurora .a-nav{position:sticky;top:calc(var(--bar) + 14px);z-index:30;margin:14px auto 0;width:min(1100px,calc(100% - 32px));border-radius:999px;display:flex;align-items:center;gap:20px;padding:8px 8px 8px 20px}
.tpl-aurora .a-nav .nm{font-weight:700;font-size:16px;display:flex;align-items:center;gap:10px;text-decoration:none;margin-right:auto}
.tpl-aurora .a-nav .nm i{width:30px;height:30px;border-radius:50%;background:var(--brand);display:grid;place-items:center;box-shadow:0 0 24px var(--brand)}
.tpl-aurora .a-nav .nm svg{width:16px;color:#fff}
.tpl-aurora .a-nav a.l{font-size:14px;text-decoration:none;color:var(--soft)}
.tpl-aurora .a-nav a.l:hover{color:var(--ink)}
.tpl-aurora .a-nav .k{display:inline-flex;align-items:center;gap:10px;min-height:42px;padding:0 10px 0 16px;border-radius:999px;border:0;background:var(--glass2);color:var(--ink);cursor:pointer;font-size:14px}
.tpl-aurora .a-nav .k svg{width:16px}
.tpl-aurora .a-nav kbd,.tpl-aurora .a-srch kbd{font-family:'Geist Mono',monospace;font-size:12px;padding:3px 7px;border-radius:7px;background:rgba(255,255,255,.12);color:var(--soft)}
@media (max-width:760px){.tpl-aurora .a-nav a.l{display:none}.tpl-aurora .a-nav kbd{display:none}}
.tpl-aurora .a-hero{min-height:calc(100vh - var(--bar) - 70px);display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;padding-block:70px 90px}
.tpl-aurora .a-pill{display:inline-flex;align-items:center;gap:10px;border-radius:999px;padding:7px 16px 7px 8px;font-size:14px;color:var(--soft)}
.tpl-aurora .a-pill b{background:var(--ink);color:#07070F;border-radius:999px;padding:3px 10px;font-size:12px}
.tpl-aurora .a-h1{font-size:clamp(46px,8.4vw,136px);line-height:.95;letter-spacing:-.05em;margin-top:26px;font-weight:300;max-width:12ch}
.tpl-aurora .a-h1 .ch{display:inline-block;transition:font-weight .25s ease}
.tpl-aurora .a-h1 .wd{display:inline-block;white-space:nowrap}
.tpl-aurora .a-sub{margin-top:24px;font-size:clamp(17px,1.6vw,21px);line-height:1.5;color:var(--soft);max-width:34em}
.tpl-aurora .a-srch{margin-top:38px;width:min(640px,100%);border-radius:22px;display:flex;align-items:center;gap:12px;padding:0 12px 0 22px;height:66px;border:0;cursor:text;color:var(--soft);font-size:17px;text-align:left}
.tpl-aurora .a-srch svg{width:22px;color:var(--ink);flex:none}
.tpl-aurora .a-srch span{flex:1}
.tpl-aurora .a-chips{display:flex;flex-wrap:wrap;justify-content:center;gap:8px;margin-top:16px}
.tpl-aurora .a-chips button{border:0;border-radius:999px;min-height:38px;padding:0 14px;font-size:14px;color:var(--ink);cursor:pointer;background:rgba(255,255,255,.06);box-shadow:inset 0 0 0 1px var(--edge)}
.tpl-aurora .a-chips button:hover{background:rgba(255,255,255,.14)}
.tpl-aurora .a-chips b{color:var(--soft);font-weight:500;margin-left:6px}

.tpl-aurora .a-sec{padding-block:100px}
.tpl-aurora .a-h2{font-size:clamp(38px,5vw,76px);font-weight:300;letter-spacing:-.045em;line-height:1}
.tpl-aurora .a-h2 b{font-weight:700}
.tpl-aurora .a-eb{font-family:'Geist Mono',monospace;font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:var(--soft)}
.tpl-aurora .a-flow{position:relative;height:520px;perspective:1400px;margin-top:40px;touch-action:pan-y;user-select:none}
.tpl-aurora .a-cv{position:absolute;left:50%;top:50%;width:300px;height:400px;margin:-200px 0 0 -150px;border-radius:30px;overflow:hidden;transition:transform .7s cubic-bezier(.2,.8,.2,1),opacity .7s,filter .7s;border:0;padding:0;cursor:pointer;color:var(--ink);text-align:left;background:#111}
.tpl-aurora .a-cv .gr{position:absolute;inset:auto 0 0;height:50%;background:linear-gradient(0deg,rgba(7,7,15,.9),transparent)}
.tpl-aurora .a-cv .tx{position:absolute;left:20px;right:20px;bottom:18px}
.tpl-aurora .a-cv b{display:block;font-size:32px;font-weight:700;letter-spacing:-.03em}
.tpl-aurora .a-cv span{font-size:14px;color:var(--soft)}
.tpl-aurora .a-cv .gl{position:absolute;inset:0;background:linear-gradient(115deg,transparent 30%,rgba(255,255,255,.22) 45%,transparent 60%);transform:translateX(-100%);transition:transform 1s}
.tpl-aurora .a-cv.c .gl{transform:translateX(100%)}
.tpl-aurora .a-fc{display:flex;justify-content:center;align-items:center;gap:14px;margin-top:8px}
.tpl-aurora .a-fc button{width:52px;height:52px;border-radius:50%;border:0;color:var(--ink);cursor:pointer;display:grid;place-items:center}
.tpl-aurora .a-fc button svg{width:20px}
.tpl-aurora .a-fc span{font-family:'Geist Mono',monospace;font-size:13px;color:var(--soft);min-width:70px;text-align:center}
@media (max-width:760px){.tpl-aurora .a-flow{height:420px}.tpl-aurora .a-cv{width:230px;height:320px;margin:-160px 0 0 -115px}}

.tpl-aurora .a-bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:30px;padding:8px;border-radius:22px}
.tpl-aurora .a-bar button{border:0;border-radius:14px;min-height:42px;padding:0 14px;font-size:14px;color:var(--soft);background:transparent;cursor:pointer}
.tpl-aurora .a-bar button[aria-pressed="true"]{background:rgba(255,255,255,.16);color:var(--ink);box-shadow:inset 0 0 0 1px var(--edge)}
.tpl-aurora .a-bar button b{font-family:'Geist Mono',monospace;font-weight:400;font-size:12px;margin-left:6px;opacity:.7}
.tpl-aurora .a-bar .sp{flex:1}
.tpl-aurora .a-bar .n{font-family:'Geist Mono',monospace;font-size:13px;color:var(--soft);padding:0 10px}
.tpl-aurora .a-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:18px;margin-top:22px}
@media (max-width:1100px){.tpl-aurora .a-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}
@media (max-width:700px){.tpl-aurora .a-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}}
.tpl-aurora .a-c{border:0;padding:8px;border-radius:26px;cursor:pointer;color:var(--ink);text-align:left;transition:transform .4s cubic-bezier(.2,.8,.2,1),background .4s;animation:aIn .7s cubic-bezier(.2,.8,.2,1) both;animation-delay:var(--d,0ms);position:relative}
@keyframes aIn{from{opacity:0;transform:translateY(24px) scale(.97)}}
.tpl-aurora .a-c:hover{transform:translateY(-6px);background:var(--glass2)}
.tpl-aurora .a-c .ph{aspect-ratio:1/1;border-radius:20px;overflow:hidden}
.tpl-aurora .a-c .bd{padding:12px 8px 6px;display:flex;justify-content:space-between;align-items:baseline;gap:8px}
.tpl-aurora .a-c b{font-size:18px;font-weight:600;letter-spacing:-.02em}
.tpl-aurora .a-c span{font-size:13px;color:var(--soft);white-space:nowrap}
.tpl-aurora .a-c .nw{position:absolute;top:18px;left:18px;font-family:'Geist Mono',monospace;font-size:11px;padding:4px 9px;border-radius:999px;background:rgba(7,7,15,.55);backdrop-filter:blur(8px)}
.tpl-aurora .a-more{display:flex;justify-content:center;margin-top:36px}
.tpl-aurora .a-more button{min-height:54px;padding:0 28px;border-radius:999px;border:0;color:var(--ink);font-size:15px;cursor:pointer}

.tpl-aurora .a-camp{display:grid;grid-template-columns:minmax(0,1fr) 260px;gap:40px;align-items:center;border-radius:36px;padding:clamp(26px,4vw,56px)}
.tpl-aurora .a-tube{position:relative;height:340px;width:120px;border-radius:60px;justify-self:center;overflow:hidden;background:rgba(255,255,255,.05);box-shadow:inset 0 0 0 1px var(--edge)}
.tpl-aurora .a-tube i{position:absolute;left:0;right:0;bottom:0;height:0;background:linear-gradient(0deg,var(--brand),#8A7DFF);transition:height 2.2s cubic-bezier(.2,.8,.2,1);box-shadow:0 0 40px var(--brand)}
.tpl-aurora .a-tube i::before{content:"";position:absolute;left:-50%;right:-50%;top:-14px;height:28px;border-radius:45%;background:inherit;animation:aWave 4s linear infinite}
@keyframes aWave{to{transform:rotate(360deg)}}
.tpl-aurora .a-tube b{position:absolute;inset:0;display:grid;place-items:center;font-size:30px;font-weight:700;z-index:2}
.tpl-aurora .a-stats{display:flex;flex-wrap:wrap;gap:12px;margin-top:26px}
.tpl-aurora .a-stats div{border-radius:18px;padding:14px 18px}
.tpl-aurora .a-stats b{display:block;font-size:24px;font-weight:700;letter-spacing:-.02em}
.tpl-aurora .a-stats span{font-size:13px;color:var(--soft)}
.tpl-aurora .a-btn{display:inline-flex;align-items:center;gap:10px;min-height:54px;padding:0 26px;border-radius:999px;background:var(--ink);color:#07070F!important;text-decoration:none;font-weight:600;margin-top:26px}
.tpl-aurora .a-btn svg{width:18px}
@media (max-width:860px){.tpl-aurora .a-camp{grid-template-columns:minmax(0,1fr)}.tpl-aurora .a-tube{height:220px;width:100%;border-radius:30px}}
.tpl-aurora .a-trust{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;margin-top:34px}
.tpl-aurora .a-trust div{border-radius:24px;padding:24px}
.tpl-aurora .a-trust svg{width:20px;color:#9CF6D8}
.tpl-aurora .a-trust b{display:block;margin-top:10px;font-size:17px}
.tpl-aurora .a-trust p{margin-top:6px;color:var(--soft);font-size:14px;line-height:1.55}
@media (max-width:860px){.tpl-aurora .a-trust{grid-template-columns:minmax(0,1fr)}}
.tpl-aurora .a-ftr{padding-block:40px 60px;display:flex;justify-content:space-between;flex-wrap:wrap;gap:14px;color:var(--soft);font-size:13px;border-top:1px solid var(--edge)}

.tpl-aurora .a-pal{border:0;padding:0;background:transparent;width:min(680px,calc(100vw - 24px));max-width:none;margin-top:12vh;color:var(--ink)}
.tpl-aurora .a-pal::backdrop{background:rgba(5,5,12,.55);backdrop-filter:blur(10px)}
.tpl-aurora .a-pal .in{border-radius:26px;overflow:hidden;background:rgba(24,24,40,.72);backdrop-filter:blur(30px) saturate(160%);-webkit-backdrop-filter:blur(30px) saturate(160%);box-shadow:inset 0 0 0 1px var(--edge),0 40px 80px -30px #000;animation:aPal .3s cubic-bezier(.2,.8,.2,1)}
@keyframes aPal{from{opacity:0;transform:translateY(-10px) scale(.98)}}
.tpl-aurora .a-pal .top{display:flex;align-items:center;gap:12px;padding:0 18px;height:64px;border-bottom:1px solid var(--edge)}
.tpl-aurora .a-pal .top svg{width:20px;color:var(--soft)}
.tpl-aurora .a-pal input{flex:1;background:transparent;border:0;outline:0;font-size:18px;color:var(--ink)}
.tpl-aurora .a-pal .res{max-height:min(420px,56vh);overflow:auto;padding:8px}
.tpl-aurora .a-pal .grp{font-family:'Geist Mono',monospace;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--soft);padding:12px 12px 6px}
.tpl-aurora .a-pal .it{display:grid;grid-template-columns:44px minmax(0,1fr) auto;gap:12px;align-items:center;padding:8px 10px;border-radius:14px;cursor:pointer;width:100%;border:0;background:transparent;color:var(--ink);text-align:left}
.tpl-aurora .a-pal .it[aria-selected="true"]{background:rgba(255,255,255,.12)}
.tpl-aurora .a-pal .it .av{width:44px;height:44px;border-radius:12px;overflow:hidden}
.tpl-aurora .a-pal .it b{font-weight:600}
.tpl-aurora .a-pal .it small{display:block;color:var(--soft);font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tpl-aurora .a-pal .it kbd{font-family:'Geist Mono',monospace;font-size:11px;color:var(--soft)}
.tpl-aurora .a-pal .ft{display:flex;gap:16px;padding:10px 18px;border-top:1px solid var(--edge);font-family:'Geist Mono',monospace;font-size:11px;color:var(--soft)}
.tpl-aurora .a-pal mark{background:transparent;color:#9CF6D8}

.tpl-aurora dialog.sheet{border:0;padding:0;background:transparent;width:min(960px,calc(100vw - 24px));max-width:none;color:var(--ink)}
.tpl-aurora dialog.sheet::backdrop{background:rgba(5,5,12,.6);backdrop-filter:blur(14px)}
.tpl-aurora .sh-in{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:0;border-radius:32px;overflow:hidden;position:relative;background:rgba(24,24,40,.75);backdrop-filter:blur(30px) saturate(160%);-webkit-backdrop-filter:blur(30px) saturate(160%);box-shadow:inset 0 0 0 1px var(--edge);animation:aPal .45s cubic-bezier(.2,.8,.2,1)}
.tpl-aurora .sh-ph{aspect-ratio:1/1;padding:10px}
.tpl-aurora .sh-ph .portrait{border-radius:24px}
.tpl-aurora .sh-bd{padding:36px;display:flex;flex-direction:column;gap:14px}
.tpl-aurora .sh-k{font-family:'Geist Mono',monospace;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#9CF6D8}
.tpl-aurora .sh-n{font-size:58px;font-weight:700;letter-spacing:-.05em;line-height:1}
.tpl-aurora .sh-dl{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:0}
.tpl-aurora .sh-dl div{border-radius:14px;padding:10px 12px;background:rgba(255,255,255,.06);box-shadow:inset 0 0 0 1px var(--edge)}
.tpl-aurora .sh-dl dt{font-size:12px;color:var(--soft)}
.tpl-aurora .sh-dl dd{margin:2px 0 0;font-weight:600}
.tpl-aurora .sh-act{display:flex;gap:8px;flex-wrap:wrap;margin-top:auto}
.tpl-aurora .sh-b1,.tpl-aurora .sh-b2{min-height:50px;padding:0 22px;display:inline-flex;align-items:center;border-radius:999px;text-decoration:none;font-weight:600}
.tpl-aurora .sh-b1{background:var(--ink);color:#07070F}
.tpl-aurora .sh-b2{box-shadow:inset 0 0 0 1px var(--edge);color:var(--ink)}
.tpl-aurora .sh-x{position:absolute;top:16px;right:16px;width:42px;height:42px;border-radius:50%;border:0;background:rgba(255,255,255,.1);color:var(--ink);cursor:pointer;display:grid;place-items:center;z-index:2}
.tpl-aurora .sh-x svg{width:16px}
@media (max-width:720px){.tpl-aurora .sh-in{grid-template-columns:minmax(0,1fr);max-height:calc(100vh - 24px);overflow:auto}.tpl-aurora .sh-bd{padding:22px}.tpl-aurora .sh-n{font-size:44px}}

.tpl-aurora .a-nav .lb{background:none;border:0;cursor:pointer;font:inherit;font-size:14px;padding:0}
.tpl-aurora .a-tb{position:relative;z-index:2;margin-top:14px}
.tpl-aurora .a-tb > div{display:flex;flex-wrap:wrap;align-items:center;gap:8px 18px;border-radius:18px;padding:12px 18px;font-size:13px;color:var(--soft)}
.tpl-aurora .a-tb svg{width:18px;color:var(--ink)}
.tpl-aurora .a-tb b{color:var(--ink);font-weight:500}
.tpl-aurora .a-tb .lv{display:inline-flex;gap:4px}
.tpl-aurora .a-tb .lv i{width:18px;height:5px;border-radius:5px;background:rgba(255,255,255,.18)}
.tpl-aurora .a-tb .lv i.on{background:var(--ink);box-shadow:0 0 10px var(--brand)}
.tpl-aurora .a-tb .ac{margin-left:auto}
.tpl-aurora .a-acts{display:flex;flex-wrap:wrap;justify-content:center;gap:10px;margin-top:22px}
.tpl-aurora .a-acts > a{margin:0!important;min-height:48px;display:inline-flex;align-items:center;padding:0 22px;border-radius:999px;text-decoration:none;font-size:15px}
.tpl-aurora .a-acts p{width:100%;font-size:13px;color:var(--soft)}
.tpl-aurora .a-empty{margin-top:30px;padding:30px;border-radius:24px;color:var(--soft);font-size:17px;line-height:1.55}
.tpl-aurora .a-needs{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px;margin-top:40px}
.tpl-aurora .a-nd{border-radius:26px;padding:26px;display:flex;flex-direction:column;gap:8px}
.tpl-aurora .a-nd .rg{--p:0;width:86px;height:86px;border-radius:50%;display:grid;place-items:center;margin-bottom:14px;background:conic-gradient(var(--ink) calc(var(--p) * 1%),rgba(255,255,255,.12) 0);position:relative}
.tpl-aurora .a-nd .rg span{position:absolute;z-index:1;font-family:'Geist Mono',monospace;font-size:14px}
.tpl-aurora .a-nd .rg::before{content:"";position:absolute;inset:7px;border-radius:50%;background:#0D0D1A}
.tpl-aurora .a-nd b{font-size:21px;font-weight:500;letter-spacing:-.02em}
.tpl-aurora .a-nd p{color:var(--soft);font-size:14px}
.tpl-aurora .a-nd a,.tpl-aurora .a-lnk{display:inline-flex;align-items:center;gap:8px;font-size:14px;color:var(--ink);text-decoration:none;background:none;border:0;cursor:pointer;font-family:inherit;padding:0}
.tpl-aurora .a-nd a{margin-top:auto;padding-top:10px}
.tpl-aurora .a-nd a svg,.tpl-aurora .a-lnk svg{width:14px}
.tpl-aurora .a-prods{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px;margin-top:40px}
.tpl-aurora .a-pr{border-radius:26px;padding:22px;text-decoration:none;display:flex;flex-direction:column;gap:4px;transition:transform .5s cubic-bezier(.2,.8,.2,1),background .4s}
.tpl-aurora .a-pr:hover{transform:translateY(-6px);background:var(--glass2)}
.tpl-aurora .a-pr .ph{aspect-ratio:1/1;margin-bottom:12px;border-radius:18px;overflow:hidden;background:rgba(255,255,255,.06)}
.tpl-aurora .a-pr .ph svg{width:100%;height:100%}
.tpl-aurora .a-pr b{font-size:20px;font-weight:500}
.tpl-aurora .a-pr .pz{color:var(--soft)}
.tpl-aurora .a-pr .by{align-self:flex-start;margin-top:12px;font-size:13px;background:var(--ink);color:#07070F;padding:8px 16px;border-radius:999px}
@media (max-width:1000px){.tpl-aurora .a-needs,.tpl-aurora .a-prods{grid-template-columns:repeat(2,minmax(0,1fr))}}
.tpl-aurora .a-help .in{border-radius:36px;padding:clamp(40px,7vw,100px);text-align:center;display:flex;flex-direction:column;align-items:center}
.tpl-aurora .a-help .a-sub{margin-inline:auto}
.tpl-aurora .a-help .a-btn{margin-top:30px}
.tpl-aurora .a-about{display:grid;grid-template-columns:minmax(0,.8fr) minmax(0,1.2fr);gap:44px}
.tpl-aurora .a-about p{font-size:clamp(20px,2vw,27px);line-height:1.45;font-weight:300;letter-spacing:-.015em}
.tpl-aurora .a-bdg{display:flex;flex-wrap:wrap;gap:8px;margin-top:22px}
.tpl-aurora .a-bdg span{display:inline-flex;align-items:center;gap:7px;border-radius:999px;padding:8px 14px;font-size:14px;color:var(--soft)}
.tpl-aurora .a-bdg span.ok{color:var(--ink)}
.tpl-aurora .a-bdg svg{width:15px}
@media (max-width:860px){.tpl-aurora .a-about{grid-template-columns:minmax(0,1fr);gap:16px}}
.tpl-aurora .a-hd{display:flex;justify-content:space-between;align-items:flex-end;gap:16px 30px;flex-wrap:wrap}
.tpl-aurora .a-revs{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;margin-top:40px}
.tpl-aurora .a-revs figure{margin:0;border-radius:26px;padding:28px;display:flex;flex-direction:column;gap:14px}
.tpl-aurora .a-revs .st{letter-spacing:3px}
.tpl-aurora .a-revs blockquote{margin:0;font-size:19px;line-height:1.5;font-weight:300}
.tpl-aurora .a-revs figcaption{font-family:'Geist Mono',monospace;font-size:12px;color:var(--soft);margin-top:auto}
@media (max-width:860px){.tpl-aurora .a-revs{grid-template-columns:minmax(0,1fr)}}
.tpl-aurora .a-ledger{margin-top:36px;border-radius:28px;overflow:hidden}
.tpl-aurora .a-lsum{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));border-bottom:1px solid var(--edge)}
.tpl-aurora .a-lsum div{padding:24px 28px}
.tpl-aurora .a-lsum div + div{border-left:1px solid var(--edge)}
.tpl-aurora .a-lsum span{font-family:'Geist Mono',monospace;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:var(--soft)}
.tpl-aurora .a-lsum b{display:block;margin-top:6px;font-size:clamp(22px,2.6vw,36px);font-weight:300;letter-spacing:-.03em}
.tpl-aurora .a-tw{overflow-x:auto}
.tpl-aurora .a-ledger table{width:100%;border-collapse:collapse;font-size:15px}
.tpl-aurora .a-ledger th,.tpl-aurora .a-ledger td{text-align:left;padding:16px 28px;border-bottom:1px solid var(--edge)}
.tpl-aurora .a-ledger tr:last-child td{border-bottom:0}
.tpl-aurora .a-ledger th{font-family:'Geist Mono',monospace;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--soft);font-weight:400}
.tpl-aurora .a-ledger .num{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
.tpl-aurora .a-ledger .lk{font-size:12px;padding:4px 10px;border-radius:999px;background:rgba(255,255,255,.1)}
@media (max-width:700px){.tpl-aurora .a-lsum{grid-template-columns:minmax(0,1fr)}.tpl-aurora .a-lsum div + div{border-left:0;border-top:1px solid var(--edge)}}
.tpl-aurora .a-contact{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.3fr);border-radius:28px;overflow:hidden}
.tpl-aurora .a-contact .info{padding:clamp(24px,4vw,48px);display:flex;flex-direction:column;align-items:flex-start}
.tpl-aurora .a-contact dl{margin:22px 0;display:grid;gap:4px}
.tpl-aurora .a-contact dt{font-family:'Geist Mono',monospace;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--soft);margin-top:12px}
.tpl-aurora .a-contact dd{margin:0;font-size:18px}
.tpl-aurora .a-contact .map{min-height:360px}
@media (max-width:860px){.tpl-aurora .a-contact{grid-template-columns:minmax(0,1fr)}.tpl-aurora .a-contact .map{min-height:220px}}
.tpl-aurora .a-soc{width:100%;display:flex;justify-content:space-between;align-items:center;gap:14px;flex-wrap:wrap;padding-bottom:20px;margin-bottom:6px;border-bottom:1px solid var(--edge)}
.tpl-aurora .a-soc p{font-size:14px;color:var(--soft)}
.tpl-aurora .a-soc div{display:flex;gap:8px}
.tpl-aurora .a-soc a{width:42px;height:42px;border-radius:50%;display:grid;place-items:center}
.tpl-aurora .a-soc svg{width:18px}
.tpl-aurora .ldg{border:0;padding:0;background:transparent;width:min(980px,calc(100vw - 24px));max-width:none;color:var(--ink)}
.tpl-aurora .ldg::backdrop{background:rgba(5,5,15,.6);backdrop-filter:blur(14px)}
.tpl-aurora .ldg-in{background:rgba(20,20,36,.92);box-shadow:inset 0 0 0 1px var(--edge);border-radius:28px;padding:40px;position:relative;max-height:calc(100vh - 24px);overflow:auto}
.tpl-aurora .ldg-k{font-family:'Geist Mono',monospace;font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:var(--soft)}
.tpl-aurora .ldg-t{font-size:44px;font-weight:300;letter-spacing:-.04em}
.tpl-aurora .ldg-d{color:var(--soft)}
.tpl-aurora .ldg-sum{display:flex;gap:30px;flex-wrap:wrap;margin-top:20px}
.tpl-aurora .ldg-sum span{display:block;font-size:12px;color:var(--soft)}
.tpl-aurora .ldg-sum b{font-size:28px;font-weight:300}
.tpl-aurora .ldg-tw{overflow-x:auto;margin-top:20px}
.tpl-aurora .ldg table{width:100%;border-collapse:collapse;font-size:14px}
.tpl-aurora .ldg th,.tpl-aurora .ldg td{text-align:left;padding:12px 10px;border-bottom:1px solid var(--edge)}
.tpl-aurora .ldg th{font-size:11px;color:var(--soft);font-weight:400;text-transform:uppercase;letter-spacing:.1em}
.tpl-aurora .ldg .num{text-align:right;white-space:nowrap}
.tpl-aurora .ldg .lk{font-size:12px;padding:3px 9px;border-radius:999px;background:rgba(255,255,255,.1)}
.tpl-aurora .ldg-x{position:absolute;top:16px;right:16px;width:40px;height:40px;border-radius:50%;border:0;background:rgba(255,255,255,.1);color:var(--ink);cursor:pointer;display:grid;place-items:center}
.tpl-aurora .ldg-x svg{width:16px}

@media (max-width:560px){.tpl-aurora .a-needs{grid-template-columns:minmax(0,1fr)}.tpl-aurora .a-ledger table{min-width:600px}}
.tpl-aurora .a-ledger td:first-child{white-space:nowrap}
.tpl-aurora a.a-c{text-decoration:none;display:block}
.tpl-aurora .a-contact.nomap{grid-template-columns:minmax(0,1fr)}
.tpl-aurora .a-contact .map{position:relative}
.tpl-aurora .a-contact .map iframe{position:absolute;inset:0}
.tpl-aurora .a-camp .art{position:relative;min-height:200px;border-radius:24px;overflow:hidden;margin-top:18px}
.tpl-aurora .a-nav .nm .tpl-logo-img{width:100%;height:100%;object-fit:cover;border-radius:inherit}
`;

const FILTERS: Array<[string, string, (a: TplAnimal) => boolean]> = [
  ['todos', 'Todos', () => true],
  ['perro', 'Perros', (a) => a.sp === 'perro'],
  ['gato', 'Gatos', (a) => a.sp === 'gato'],
  ['otro', 'Otros', (a) => a.sp === 'otro'],
  ['nuevos', 'Nuevos', (a) => a.isNew],
  ['bebes', 'Cachorros', (a) => a.hasAge && a.months < 12],
  ['senior', 'Seniors', (a) => a.stage === 'Senior'],
  ['grande', 'Grandes', (a) => a.size === 'Grande'],
];

export const aurora: TemplateDesign = {
  id: 'aurora',
  webgl: true,
  fonts: 'family=Onest:wght@300;400;500;600;700;800;900&family=Geist+Mono:wght@400;500',
  css: CSS,
  html(m, KIT) {
    const { ORG, CAMPAIGN, ANIMALS, SHOW, BADGES, NEEDS, PRODUCTS, REVIEWS } = m;
    const n = m.COUNTS.total;
    const words = 'Encuentra a quien te estaba esperando'.split(' ');
    const quick = FILTERS.filter(([k]) => k !== 'todos' && k !== 'grande')
      .map(([k, label, f]) => [label, k, ANIMALS.filter(f).length] as const)
      .filter(([, , c]) => c > 0);
    const fresh = ANIMALS.filter((a) => a.isNew);
    const t = KIT.transparencyParts();
    const map = mapEmbed(m);
    const ex = ANIMALS[0];
    const hint = ex
      ? `Prueba con “${ex.name}”${ex.breed ? ` o “${ex.breed}”` : ''}`
      : 'Busca por nombre o raza';
    const pill = [[ORG.type, ORG.city].filter(Boolean).join(' en '), ...BADGES.map((b) => b.t)]
      .filter(Boolean)
      .join(' · ');
    return `
<nav class="a-nav a-glass" aria-label="Principal"><a class="nm" href="#a-top"><i>${ORG.logo ? logoMark(m) : ic.paw}</i>${ORG.short}</a>${fresh.length ? '<a class="l" href="#a-new">Nuevos</a>' : ''}<a class="l" href="#a-all">Catálogo</a><a class="l" href="#a-camp">Campaña</a><button type="button" class="l lb" data-ledger>Transparencia</button>${n ? `<button type="button" class="k" id="a-k1">${ic.search}Buscar <kbd>Ctrl K</kbd></button>` : ''}</nav>
${SHOW.transparencia ? `<div class="w a-tb" data-sec="transparencia" role="group" aria-label="Transparencia"><div class="a-glass">${ic.shield}<b>${t.level}</b><span>${t.formalization}</span><span>${t.accountability}</span><span class="ac">${t.note}</span></div></div>` : ''}
<section class="w a-hero" id="a-top" data-sec="animales">
  <span class="a-pill a-glass"><b>${n}</b>${pill || 'en adopción'}</span>
  <h1 class="a-h1" id="a-h1" aria-label="${words.join(' ')}">${words.map((w) => `<span class="wd" aria-hidden="true">${[...w].map((c) => `<span class="ch">${c}</span>`).join('')}</span>`).join(' ')}</h1>
  <p class="a-sub">${n ? `${countPhrase(m)} de ${ORG.name}. Escribe un nombre o una raza: aparecen al instante.` : ORG.lede || availLine(m)}</p>
  ${n ? `<button type="button" class="a-srch a-glass" id="a-k2">${ic.search}<span>${hint}</span><kbd>Ctrl K</kbd></button>` : ''}
  <div class="a-acts" data-sec="acciones"><a class="a-btn" href="#a-all">Adoptar</a><a class="a-glass" href="#a-all">Apadrinar</a><a class="a-glass" href="${ORG.donateHref}">Donar</a><p>${COPY.adoptNote}</p></div>
  ${quick.length ? `<div class="a-chips">${quick.map(([label, k, c]) => `<button type="button" data-jump="${k}">${label}<b>${c}</b></button>`).join('')}</div>` : ''}
</section>
${
  fresh.length
    ? `<section class="a-sec" id="a-new" style="padding-top:20px">
  <div class="w" style="text-align:center"><p class="a-eb">Publicados en 14 días</p><h2 class="a-h2" style="margin-top:14px">Recién <b>publicados</b></h2></div>
  <div class="a-flow" id="a-flow" role="group" aria-roledescription="carrusel" aria-label="Recién publicados"></div>
  <div class="a-fc"><button type="button" class="a-glass" id="a-prev" aria-label="Anterior">${ic.back}</button><span id="a-pos"></span><button type="button" class="a-glass" id="a-next" aria-label="Siguiente">${ic.arrow}</button></div>
</section>`
    : ''
}
<section class="w a-sec" id="a-all" style="scroll-margin-top:calc(var(--bar) + 80px)">
  <p class="a-eb">Catálogo completo</p><h2 class="a-h2" style="margin-top:14px">Todos, <b>a tu ritmo</b></h2>
  ${
    n
      ? `<div class="a-bar a-glass" id="a-bar" role="group" aria-label="Filtros"></div>
  <div class="a-grid" id="a-grid"></div>
  <div class="a-more"><button type="button" class="a-glass" id="a-more"></button></div>`
      : `<p class="a-empty a-glass" style="margin-top:24px">${EMPTY.animales}</p>`
  }
</section>
<section class="w a-sec" id="a-camp" style="padding-top:0">
  ${
    CAMPAIGN.active
      ? `<div class="a-camp a-glass" data-sec="campana"><div><p class="a-eb">Campaña activa${CAMPAIGN.category ? ` · ${CAMPAIGN.category}` : ''}</p><h2 class="a-h2" style="margin-top:14px">${CAMPAIGN.title}</h2>
    ${CAMPAIGN.description ? `<p class="a-sub" style="margin-top:16px">${CAMPAIGN.description}</p>` : ''}
    <p class="a-sub" style="margin-top:12px">${COPY.adoptNote}</p>
    <div class="a-stats"><div class="a-glass"><b id="a-raised">${fmt(CAMPAIGN.raised)}</b><span>recaudado</span></div><div class="a-glass"><b>${fmt(CAMPAIGN.goal)}</b><span>meta</span></div><div class="a-glass"><b>${CAMPAIGN.daysLeft}</b><span>${CAMPAIGN.daysLeft === 1 ? 'día' : 'días'} · cierra ${CAMPAIGN.deadline}</span></div></div>
    <a class="a-btn" href="${CAMPAIGN.href}" data-magnet>Ver campaña y aportar ${ic.arrow}</a>${KIT.moreCampaigns()}${ORG.cover ? `<div class="art">${campaignArt(m)}</div>` : ''}</div>
    <div class="a-tube" id="a-tube"><i></i><b>${CAMPAIGN.pct}%</b></div></div>`
      : `<div class="a-camp a-glass" data-sec="campana"><div><p class="a-eb">Campaña activa</p><p class="a-sub" style="margin-top:14px">${EMPTY.campana}</p></div></div>`
  }
  ${BADGES.length ? `<div class="a-trust">${BADGES.map((b) => `<div class="a-glass">${b.ok ? ic.check : ic.clock}<b>${b.t}</b><p>Estado registrado en AdoptaFácil.</p></div>`).join('')}</div>` : ''}
</section>
<section class="w a-sec" data-sec="necesidades" style="padding-top:0"><p class="a-eb">Banco de recursos</p><h2 class="a-h2" style="margin-top:14px">Lo que <b>necesitamos</b></h2>
  ${NEEDS.length ? `<div class="a-needs">${NEEDS.map((nd) => `<div class="a-nd a-glass"><div class="rg" style="--p:${nd.pct}"><span>${nd.pct}%</span></div>${nd.category ? `<span class="a-eb">${nd.category}</span>` : ''}<b>${nd.title}</b><p>${nd.got} de ${nd.need} ${nd.unit}</p><a href="${nd.href}">Ver y donar ${ic.arrow}</a></div>`).join('')}</div>` : `<p class="a-empty a-glass">${EMPTY.necesidades}</p>`}
</section>
<section class="w a-sec" data-sec="productos" style="padding-top:0"><p class="a-eb">Tienda solidaria</p><h2 class="a-h2" style="margin-top:14px">Productos <b>que ayudan</b></h2>
  ${PRODUCTS.length ? `<div class="a-prods">${PRODUCTS.map((p) => `<a class="a-pr a-glass" href="${p.href}"><div class="ph">${productArt(p, 'transparent')}</div>${p.category ? `<span class="a-eb">${p.category}</span>` : ''}<b>${p.name}</b><span class="pz">${fmt(p.price)}</span><span class="by">Ver</span></a>`).join('')}</div>` : `<p class="a-empty a-glass">${EMPTY.productos}</p>`}
</section>
<section class="w a-sec a-help" id="portal-help-cta" data-sec="ayuda" style="padding-top:0"><div class="a-glass in"><h2 class="a-h2">${COPY.helpTitle.replace('grandes cambios', '<b>grandes cambios</b>')}</h2><p class="a-sub">${COPY.helpText}</p><a class="a-btn" href="${ORG.donateHref}" data-magnet>${COPY.helpCta} ${ic.arrow}</a></div></section>
${SHOW.nosotros ? `<section class="w a-sec a-about" data-sec="nosotros" style="padding-top:0"><div><p class="a-eb">Quiénes somos</p><h2 class="a-h2" style="margin-top:14px">Sobre <b>nosotros</b></h2></div><div><p>${ORG.about}</p>${BADGES.length ? `<div class="a-bdg">${BADGES.map((b) => `<span class="a-glass${b.ok ? ' ok' : ''}">${b.ok ? ic.check : ic.clock}${b.t}</span>`).join('')}</div>` : ''}</div></section>` : ''}
<section class="w a-sec" data-sec="resenas" style="padding-top:0"><div class="a-hd"><div><p class="a-eb">Opiniones</p><h2 class="a-h2" style="margin-top:14px">Reseñas</h2></div><button type="button" class="a-lnk" data-review>Registrar reseña ${ic.arrow}</button></div>
  ${REVIEWS.length ? `<div class="a-revs">${REVIEWS.map((r) => `<figure class="a-glass"><span class="st" aria-label="${r.rating} de 5">${stars(r.rating)}</span>${r.text ? `<blockquote>${r.text}</blockquote>` : ''}<figcaption>${r.name}${r.date ? ` · ${r.date}` : ''}</figcaption></figure>`).join('')}</div>` : `<p class="a-empty a-glass">${EMPTY.resenas}</p>`}
</section>
<section class="w a-sec" data-sec="libro" style="padding-top:0"><div class="a-hd"><div><p class="a-eb">Transparencia</p><h2 class="a-h2" style="margin-top:14px">Libro <b>público</b></h2><p class="a-sub" style="margin-top:12px">${COPY.ledgerText}</p></div><button type="button" class="a-lnk" data-ledger>Ver libro completo ${ic.arrow}</button></div>
  ${ledgerBlock(m, 'a-empty a-glass')}
</section>
${SHOW.contacto ? `<section class="w a-sec" data-sec="contacto" style="padding-top:0"><div class="a-contact a-glass${map ? '' : ' nomap'}"><div class="info"><p class="a-eb">Visítanos</p><h2 class="a-h2" style="margin-top:14px;font-size:clamp(32px,3.6vw,52px)">Información de contacto</h2>${KIT.contactRows()}${mapLink(m, 'a-lnk')}</div>${map ? `<div class="map">${map}</div>` : ''}</div></section>` : ''}
<footer class="w a-ftr">${SHOW.redes ? `<div class="a-soc" data-sec="redes"><p>${COPY.socialsText}</p><div>${m.SOCIALS.map((x) => socialLink(x, ic[x.key], 'a-glass')).join('')}</div></div>` : ''}<span>${ORG.name}${ORG.city ? ` · ${ORG.city}` : ''}</span><span>Hecho con AdoptaFácil</span></footer>
<dialog class="a-pal" id="a-pal" aria-label="Buscar animales"></dialog>`;
  },
  init(app, env) {
    const { m, motion, catalog, THREE } = env;
    const { signal } = motion;
    const A = m.ANIMALS;
    const byId = new Map(A.map((a) => [a.id, a]));
    const open = (id: string | undefined) => {
      const a = id ? byId.get(id) : undefined;
      if (a) env.go(unesc(a.href));
    };
    // Fondo líquido (shader). Sin WebGL queda el degradado CSS del lienzo.
    const cv = document.createElement('canvas');
    cv.className = 'a-gl';
    cv.setAttribute('aria-hidden', 'true');
    app.prepend(cv);
    signal.addEventListener('abort', () => cv.remove());
    if (THREE && !motion.reduce) {
      try {
        const r = new THREE.WebGLRenderer({ canvas: cv, antialias: false, alpha: false });
        r.setPixelRatio(Math.min(devicePixelRatio, 1.5));
        r.setSize(innerWidth, innerHeight, false);
        const sc = new THREE.Scene();
        const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        const u = {
          t: { value: 0 },
          res: { value: new THREE.Vector2(innerWidth, innerHeight) },
          m: { value: new THREE.Vector2(0.5, 0.5) },
          c1: { value: new THREE.Color(env.brand()) },
          c2: { value: new THREE.Color('#5B3CFF') },
          c3: { value: new THREE.Color('#00B8E6') },
          sc: { value: 0 },
        };
        const mat = new THREE.ShaderMaterial({
          uniforms: u,
          vertexShader: 'varying vec2 v;void main(){v=uv;gl_Position=vec4(position,1.);}',
          fragmentShader: `precision highp float;varying vec2 v;uniform float t,sc;uniform vec2 res,m;uniform vec3 c1,c2,c3;
            vec3 hash(vec3 p){p=vec3(dot(p,vec3(127.1,311.7,74.7)),dot(p,vec3(269.5,183.3,246.1)),dot(p,vec3(113.5,271.9,124.6)));return -1.+2.*fract(sin(p)*43758.5453);}
            float n(vec3 p){vec3 i=floor(p),f=fract(p),u=f*f*(3.-2.*f);return mix(mix(mix(dot(hash(i),f),dot(hash(i+vec3(1,0,0)),f-vec3(1,0,0)),u.x),mix(dot(hash(i+vec3(0,1,0)),f-vec3(0,1,0)),dot(hash(i+vec3(1,1,0)),f-vec3(1,1,0)),u.x),u.y),mix(mix(dot(hash(i+vec3(0,0,1)),f-vec3(0,0,1)),dot(hash(i+vec3(1,0,1)),f-vec3(1,0,1)),u.x),mix(dot(hash(i+vec3(0,1,1)),f-vec3(0,1,1)),dot(hash(i+vec3(1,1,1)),f-vec3(1,1,1)),u.x),u.y),u.z);}
            void main(){vec2 p=v;p.x*=res.x/res.y;float T=t*.05;
              vec2 q=vec2(n(vec3(p*1.4,T)),n(vec3(p*1.4+5.2,T)));
              vec2 w=vec2(n(vec3(p*1.2+2.*q+vec2(1.7,9.2),T*1.3)),n(vec3(p*1.2+2.*q+vec2(8.3,2.8),T*1.3)));
              float f=n(vec3(p+2.4*w,T*.7))*.5+.5;
              float d=distance(v,m);
              vec3 col=mix(vec3(.02,.02,.06),c1,smoothstep(.25,.85,f));
              col=mix(col,c2,smoothstep(.35,.95,length(q))*.8);
              col=mix(col,c3,smoothstep(.55,1.,w.y*.5+.5)*.45);
              col+=c1*.25*smoothstep(.45,0.,d);
              col*=mix(1.,.55,smoothstep(0.,1.,sc));
              col*=.82+.18*smoothstep(1.2,.2,length(v-.5));
              gl_FragColor=vec4(col,1.);}`,
        });
        sc.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat));
        cv.classList.add('on');
        let mx = 0.5;
        let my = 0.5;
        addEventListener(
          'pointermove',
          (e) => {
            mx = e.clientX / innerWidth;
            my = 1 - e.clientY / innerHeight;
          },
          { signal },
        );
        addEventListener(
          'resize',
          () => {
            r.setSize(innerWidth, innerHeight, false);
            u.res.value.set(innerWidth, innerHeight);
          },
          { signal },
        );
        motion.onFrame((tm) => {
          u.t.value = tm / 1000;
          u.m.value.x += (mx - u.m.value.x) * 0.04;
          u.m.value.y += (my - u.m.value.y) * 0.04;
          u.sc.value = Math.min(1, scrollY / (innerHeight * 1.2));
          r.render(sc, cam);
        });
        signal.addEventListener('abort', () => {
          mat.dispose();
          r.dispose();
        });
      } catch {
        cv.classList.remove('on');
      }
    }

    // Titular cinético: el peso de cada letra responde a la distancia del cursor
    const chs = qsa(app, '#a-h1 .ch');
    if (!motion.reduce && motion.hover) {
      let rects: Array<[number, number]> = [];
      const weights = new WeakMap<HTMLElement, number>();
      const measure = () => {
        rects = chs.map((c) => {
          const r = c.getBoundingClientRect();
          return [r.left + r.width / 2, r.top + r.height / 2 + scrollY];
        });
      };
      const tm = setTimeout(measure, 300);
      signal.addEventListener('abort', () => clearTimeout(tm));
      void document.fonts?.ready.then(() => {
        if (!signal.aborted) measure();
      });
      addEventListener('resize', measure, { signal });
      addEventListener(
        'pointermove',
        (e) => {
          const y = e.clientY + scrollY;
          chs.forEach((c, k) => {
            const [cx, cy] = rects[k] || [0, 0];
            const d = Math.hypot(e.clientX - cx, y - cy);
            const w = Math.round((300 + Math.max(0, 1 - d / 320) * 500) / 100) * 100;
            if (weights.get(c) !== w) {
              weights.set(c, w);
              c.style.fontWeight = String(w);
            }
          });
        },
        { signal },
      );
    } else chs.forEach((c, k) => (c.style.fontWeight = String([300, 500, 700][k % 3])));

    // Paleta de búsqueda
    const pal = qs<HTMLDialogElement>(app, '#a-pal');
    if (pal && A.length) {
      let sel = 0;
      let items: string[] = [];
      const hl = (raw: string, q: string) => {
        if (!q) return esc(raw);
        const i = norm(raw).indexOf(norm(q));
        return i < 0
          ? esc(raw)
          : esc(raw.slice(0, i)) +
              '<mark>' +
              esc(raw.slice(i, i + q.length)) +
              '</mark>' +
              esc(raw.slice(i + q.length));
      };
      const mark = () =>
        qsa(pal, '.it').forEach((el, k) => {
          el.setAttribute('aria-selected', String(k === sel));
          if (k === sel) el.scrollIntoView({ block: 'nearest' });
        });
      const results = (q: string) => {
        const res = qs(pal, '.res');
        if (!res) return;
        const L = catalog.query({ q, sort: q ? 'nombre' : 'recientes' });
        const byName = L.filter((a) => norm(unesc(a.name)).includes(norm(q)));
        const other = L.filter((a) => !byName.includes(a));
        const grp: Array<[string, TplAnimal[]]> = q
          ? [
              ['Por nombre', byName],
              ['Por raza o etapa', other],
            ]
          : [['Recién publicados', L.slice(0, 8)]];
        items = [];
        res.innerHTML =
          grp
            .filter((g) => g[1].length)
            .map(
              ([title, G]) =>
                `<p class="grp">${title} · ${G.length}</p>` +
                G.slice(0, 30)
                  .map((a) => {
                    items.push(a.id);
                    const breed = unesc(a.breed);
                    return `<button type="button" class="it" role="option" data-id="${a.id}" aria-selected="false"><span class="av">${portrait(a, { decor: true, dx: 6, dy: 14, s: 1.1 })}</span><span><b>${hl(unesc(a.name), q)}</b><small>${a.spLabel} · ${a.age}${breed ? ` · ${hl(breed, q)}` : ''}</small></span><kbd>↵</kbd></button>`;
                  })
                  .join(''),
            )
            .join('') ||
          `<p class="grp" style="padding:24px 12px">Nadie coincide con “${esc(q)}”.</p>`;
        sel = 0;
        mark();
      };
      const openPal = () => {
        pal.innerHTML = `<div class="in"><div class="top">${ic.search}<input type="text" enterkeyhint="search" placeholder="Nombre, raza o etapa" aria-label="Buscar" autocomplete="off"><kbd style="font-family:'Geist Mono',monospace;font-size:11px;color:var(--soft)">Esc</kbd></div><div class="res" role="listbox"></div><div class="ft"><span>↑↓ moverse</span><span>↵ abrir ficha</span><span>${A.length} animales</span></div></div>`;
        const inp = qs<HTMLInputElement>(pal, 'input');
        if (!inp) return;
        inp.addEventListener('input', () => results(inp.value.trim()), { signal });
        inp.addEventListener(
          'keydown',
          (e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              sel = Math.min(items.length - 1, sel + 1);
              mark();
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              sel = Math.max(0, sel - 1);
              mark();
            } else if (e.key === 'Enter' && items[sel]) {
              e.preventDefault();
              pal.close();
              open(items[sel]);
            }
          },
          { signal },
        );
        qs(pal, '.res')?.addEventListener(
          'click',
          (e) => {
            const b = (e.target as Element).closest<HTMLElement>('.it');
            if (!b) return;
            pal.close();
            open(b.dataset.id);
          },
          { signal },
        );
        results('');
        pal.showModal();
        inp.focus();
      };
      pal.addEventListener(
        'click',
        (e) => {
          if (e.target === pal) pal.close();
        },
        { signal },
      );
      qs(app, '#a-k1')?.addEventListener('click', openPal, { signal });
      qs(app, '#a-k2')?.addEventListener('click', openPal, { signal });
      addEventListener(
        'keydown',
        (e) => {
          if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
            e.preventDefault();
            if (!pal.open) openPal();
          }
        },
        { signal },
      );
      signal.addEventListener('abort', () => {
        if (pal.open) pal.close();
      });
    }

    // Coverflow de recién publicados
    const flow = qs(app, '#a-flow');
    if (flow) {
      const fresh = catalog.query({ isNew: true });
      let ci = 0;
      flow.innerHTML = fresh
        .map(
          (a) =>
            `<button type="button" class="a-cv" data-id="${a.id}" aria-label="${a.name}"><span style="position:absolute;inset:0">${portrait(a, { decor: true, dx: 4, dy: 16, s: 1.12 })}</span><span class="gr"></span><span class="gl"></span><span class="tx"><b>${a.name}</b><span>${a.spLabel} · ${a.age}${a.days ? ` · ${sinceLabel(a).toLowerCase()}` : ''}</span></span></button>`,
        )
        .join('');
      const cvs = qsa(flow, '.a-cv');
      const pos = qs(app, '#a-pos');
      const lay = () => {
        const sp = innerWidth < 760 ? 150 : 230;
        cvs.forEach((el, k) => {
          const o = k - ci;
          const ab = Math.abs(o);
          el.style.transform = `translateX(${o * sp}px) translateZ(${-ab * 160}px) rotateY(${o === 0 ? 0 : o < 0 ? 42 : -42}deg) scale(${o === 0 ? 1.06 : 1})`;
          el.style.zIndex = String(50 - ab);
          el.style.opacity = ab > 3 ? '0' : String(1 - ab * 0.12);
          el.style.filter = o === 0 ? 'none' : `brightness(${0.7 - ab * 0.08})`;
          el.classList.toggle('c', o === 0);
          el.tabIndex = ab > 3 ? -1 : 0;
        });
        if (pos)
          pos.textContent = `${String(ci + 1).padStart(2, '0')} / ${String(cvs.length).padStart(2, '0')}`;
      };
      const step = (d: number) => {
        ci = Math.max(0, Math.min(cvs.length - 1, ci + d));
        lay();
      };
      ci = Math.min(2, cvs.length - 1);
      lay();
      addEventListener('resize', lay, { signal });
      qs(app, '#a-prev')?.addEventListener('click', () => step(-1), { signal });
      qs(app, '#a-next')?.addEventListener('click', () => step(1), { signal });
      let sx: number | null = null;
      let moved = false;
      flow.addEventListener(
        'pointerdown',
        (e) => {
          sx = e.clientX;
          moved = false;
        },
        { signal },
      );
      flow.addEventListener(
        'pointermove',
        (e) => {
          if (sx === null) return;
          const dx = e.clientX - sx;
          if (Math.abs(dx) > 70) {
            step(dx < 0 ? 1 : -1);
            sx = e.clientX;
            moved = true;
          }
        },
        { signal },
      );
      flow.addEventListener('pointerup', () => (sx = null), { signal });
      flow.addEventListener(
        'click',
        (e) => {
          const b = (e.target as Element).closest<HTMLElement>('.a-cv');
          if (!b || moved) return;
          const k = cvs.indexOf(b);
          if (k === ci) open(b.dataset.id);
          else {
            ci = k;
            lay();
          }
        },
        { signal },
      );
      flow.addEventListener(
        'keydown',
        (e) => {
          if (e.key === 'ArrowRight') step(1);
          if (e.key === 'ArrowLeft') step(-1);
        },
        { signal },
      );
    }

    // Catálogo de vidrio
    const grid = qs(app, '#a-grid');
    const bar = qs(app, '#a-bar');
    if (grid && bar) {
      const avail = FILTERS.filter(([k, , f]) => k === 'todos' || A.some(f));
      let fk = 'todos';
      let shown = 12;
      bar.innerHTML =
        avail
          .map(
            ([k, label, f]) =>
              `<button type="button" data-f="${k}" aria-pressed="${k === fk}">${label}<b>${A.filter(f).length}</b></button>`,
          )
          .join('') + `<span class="sp"></span><span class="n" id="a-n" aria-live="polite"></span>`;
      const nEl = qs(app, '#a-n');
      const more = qs<HTMLButtonElement>(app, '#a-more');
      const paint = (keep = false) => {
        const f = FILTERS.find(([k]) => k === fk)?.[2] ?? (() => true);
        const L = catalog.query({ sort: 'recientes' }).filter(f);
        const c = Math.min(shown, L.length);
        const from = keep ? grid.children.length : 0;
        if (!keep) grid.innerHTML = '';
        grid.insertAdjacentHTML(
          'beforeend',
          L.slice(from, c)
            .map(
              (a, k) =>
                `<a class="a-c a-glass" href="${a.href}" style="--d:${k * 45}ms"><div class="ph">${portrait(a, { decor: true })}</div>${a.isNew ? '<span class="nw">NUEVO</span>' : ''}<div class="bd"><b>${a.name}</b><span>${a.age}</span></div></a>`,
            )
            .join(''),
        );
        if (nEl) nEl.textContent = `${c} / ${L.length}`;
        if (more) {
          more.hidden = c >= L.length;
          more.textContent = `Ver ${Math.min(12, L.length - c)} más`;
        }
      };
      bar.addEventListener(
        'click',
        (e) => {
          const b = (e.target as Element).closest<HTMLElement>('button');
          if (!b) return;
          fk = b.dataset.f ?? 'todos';
          shown = 12;
          qsa(bar, 'button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
          paint();
        },
        { signal },
      );
      more?.addEventListener(
        'click',
        () => {
          shown += 12;
          paint(true);
        },
        { signal },
      );
      qs(app, '.a-chips')?.addEventListener(
        'click',
        (e) => {
          const b = (e.target as Element).closest<HTMLElement>('button');
          if (!b) return;
          qs(bar, `[data-f="${b.dataset.jump}"]`)?.click();
          qs(app, '#a-all')?.scrollIntoView({ behavior: motion.reduce ? 'auto' : 'smooth' });
        },
        { signal },
      );
      paint();
    }

    const tube = qs(app, '#a-tube');
    const tubeFill = tube ? qs(tube, 'i') : null;
    if (tube && tubeFill) {
      const fill = () => (tubeFill.style.height = Math.max(6, m.CAMPAIGN.pct) + '%');
      if (typeof IntersectionObserver !== 'function') fill();
      motion.observe(
        [tube],
        (en, io) => {
          if (en.isIntersecting) {
            fill();
            io.disconnect();
          }
        },
        { threshold: 0.5 },
      );
      motion.countUp(qs(app, '#a-raised'), m.CAMPAIGN.raised, fmt);
    }
    motion.reveal(app, '.a-trust > div', { stagger: 90 });
    motion.magnet(app);
  },
};
