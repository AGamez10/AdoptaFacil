import { ledgerBlock } from '../engine/ledger';
import { COPY, EMPTY, type TplAnimal } from '../engine/model';
import {
  availLine,
  FACETS,
  fmt,
  ic,
  logoMark,
  mapEmbed,
  mapLink,
  portrait,
  productArt,
  qs,
  qsa,
  socialLink,
  stars,
} from '../engine/runtime';
import { esc, unesc } from '../engine/safe';
import type { TemplateDesign } from '../engine/types';

const CSS = `
.tpl-mosaico{--bg:#F4F1EA;--card:#FFFFFF;--ink:#15140F;--soft:#6B675C;--line:#E2DDD1;font-family:'Onest',system-ui,sans-serif;color:var(--ink);background:var(--bg);overflow-x:clip}
.tpl-mosaico a{color:inherit}
.tpl-mosaico .m-head{font-family:'Schibsted Grotesk',system-ui,sans-serif}
.tpl-mosaico .m-top{display:flex;align-items:center;justify-content:space-between;gap:16px;padding-block:18px}
.tpl-mosaico .m-brand{display:flex;align-items:center;gap:12px;font-family:'Schibsted Grotesk',sans-serif;font-weight:800;font-size:18px;text-decoration:none}
.tpl-mosaico .m-mark{width:38px;height:38px;border-radius:12px;background:var(--brand);color:var(--brand-ink);display:grid;place-items:center}
.tpl-mosaico .m-mark svg{width:20px}
.tpl-mosaico .m-nav{display:flex;align-items:center;gap:26px;font-weight:600;font-size:15px}
.tpl-mosaico .m-nav a{text-decoration:none}
.tpl-mosaico .m-nav .m-pill{background:var(--ink);color:var(--bg);padding:12px 20px;border-radius:999px}
@media (max-width:820px){.tpl-mosaico .m-nav a:not(.m-pill){display:none}}
.tpl-mosaico .m-hero{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:56px;align-items:center;padding-block:12px 90px}
.tpl-mosaico .m-k{display:inline-flex;align-items:center;gap:8px;font-size:13px;font-weight:700;color:var(--soft);background:var(--card);padding:8px 14px 8px 8px;border-radius:999px;box-shadow:0 0 0 1px var(--line)}
.tpl-mosaico .m-k i{width:22px;height:22px;border-radius:50%;background:var(--brand);color:var(--brand-ink);display:grid;place-items:center}
.tpl-mosaico .m-k svg{width:12px}
.tpl-mosaico .m-h1{font-family:'Schibsted Grotesk',sans-serif;font-weight:900;font-size:clamp(44px,5.4vw,80px);line-height:.92;letter-spacing:-.035em;margin-top:22px}
.tpl-mosaico .m-h1 span{color:var(--brand);font-style:italic;font-weight:800}
.tpl-mosaico .m-sub{margin-top:18px;font-size:18px;line-height:1.6;color:var(--soft);max-width:30em}
.tpl-mosaico .m-quiz{margin-top:26px;background:var(--card);border-radius:28px;padding:22px;box-shadow:0 0 0 1px var(--line),0 30px 60px -40px rgba(0,0,0,.35);display:flex;flex-direction:column;gap:16px}
.tpl-mosaico .m-q{display:flex;flex-direction:column;gap:8px}
.tpl-mosaico .m-q > span{font-size:12px;font-weight:700;color:var(--soft);letter-spacing:.08em;text-transform:uppercase}
.tpl-mosaico .m-seg{display:flex;flex-wrap:wrap;gap:6px}
.tpl-mosaico .m-seg button{border:0;background:var(--bg);font-weight:600;font-size:14px;min-height:40px;padding:0 14px;border-radius:999px;cursor:pointer;transition:background .25s,color .25s,transform .2s}
.tpl-mosaico .m-seg button:hover{transform:translateY(-1px)}
.tpl-mosaico .m-seg button[aria-pressed="true"]{background:var(--ink);color:var(--bg)}
.tpl-mosaico .m-seg button small{opacity:.55;font-weight:700;margin-left:4px;font-variant-numeric:tabular-nums}
.tpl-mosaico .m-res{display:flex;align-items:center;justify-content:space-between;gap:14px;border-top:1px solid var(--line);padding-top:16px;flex-wrap:wrap}
.tpl-mosaico .m-res .n{font-family:'Schibsted Grotesk',sans-serif;font-weight:900;font-size:40px;line-height:1;letter-spacing:-.03em;font-variant-numeric:tabular-nums}
.tpl-mosaico .m-res .n small{font-size:15px;font-weight:600;color:var(--soft);letter-spacing:0;margin-left:8px}
.tpl-mosaico .m-go{display:inline-flex;align-items:center;gap:10px;min-height:52px;padding:0 22px;border-radius:999px;background:var(--brand);color:var(--brand-ink)!important;text-decoration:none;font-weight:700;border:0;cursor:pointer}
.tpl-mosaico .m-go svg{width:18px}
@media (max-width:980px){.tpl-mosaico .m-hero{grid-template-columns:minmax(0,1fr);gap:28px}.tpl-mosaico .m-art{order:-1}}
.tpl-mosaico .m-art{position:relative;aspect-ratio:1/1;width:100%;max-width:640px;justify-self:center}
.tpl-mosaico .m-cell{position:absolute;border-radius:22%;overflow:hidden;border:0;padding:0;cursor:pointer;background:#ddd;transition:opacity .5s,transform .6s cubic-bezier(.2,.8,.2,1),filter .5s,box-shadow .3s;box-shadow:0 0 0 0 transparent}
.tpl-mosaico .m-cell.pre{opacity:0;transform:translate(var(--fx),var(--fy)) scale(.2) rotate(var(--fr))}
.tpl-mosaico .m-cell.off{opacity:.14;filter:grayscale(1);transform:scale(.82)}
.tpl-mosaico .m-cell.hit{box-shadow:0 0 0 2px var(--brand)}
.tpl-mosaico .m-cell:hover,.tpl-mosaico .m-cell:focus-visible{transform:scale(1.9);z-index:5;box-shadow:0 14px 30px -8px rgba(0,0,0,.45)}
.tpl-mosaico .m-cell.fill{background:var(--brand);opacity:.18;cursor:default;pointer-events:none}
.tpl-mosaico .m-tip{position:absolute;z-index:6;pointer-events:none;background:var(--ink);color:var(--bg);font-size:13px;font-weight:600;padding:8px 12px;border-radius:12px;white-space:nowrap;transform:translate(-50%,calc(-100% - 22px));opacity:0;transition:opacity .2s}
.tpl-mosaico .m-tip.on{opacity:1}
.tpl-mosaico .m-tip b{font-family:'Schibsted Grotesk',sans-serif}
.tpl-mosaico .m-legend{position:absolute;left:0;bottom:-6px;font-size:12px;font-weight:600;color:var(--soft)}

.tpl-mosaico .m-sec{padding-block:96px}
.tpl-mosaico .m-h2{font-family:'Schibsted Grotesk',sans-serif;font-weight:900;font-size:clamp(36px,4.4vw,64px);line-height:.95;letter-spacing:-.03em}
.tpl-mosaico .m-bar{position:sticky;top:var(--bar);z-index:20;background:color-mix(in srgb,var(--bg) 88%,transparent);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);border-bottom:1px solid var(--line);margin-top:30px}
.tpl-mosaico .m-bar .w{display:flex;align-items:center;gap:10px;padding-block:12px;flex-wrap:wrap}
.tpl-mosaico .m-srch{flex:1 1 220px;display:flex;align-items:center;gap:8px;background:var(--card);border-radius:999px;padding:0 16px;height:46px;box-shadow:0 0 0 1px var(--line)}
.tpl-mosaico .m-srch svg{width:18px;color:var(--soft);flex:none}
.tpl-mosaico .m-srch input{border:0;outline:0;background:transparent;width:100%;font-size:15px}
.tpl-mosaico .m-tag{display:inline-flex;align-items:center;gap:6px;background:var(--ink);color:var(--bg);border:0;border-radius:999px;min-height:38px;padding:0 10px 0 14px;font-size:13px;font-weight:600;cursor:pointer}
.tpl-mosaico .m-tag svg{width:14px}
.tpl-mosaico .m-sel{height:46px;border-radius:999px;border:0;box-shadow:0 0 0 1px var(--line);background:var(--card);padding:0 16px;font-weight:600;font-size:14px}
.tpl-mosaico .m-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:20px;margin-top:30px}
@media (max-width:1100px){.tpl-mosaico .m-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}
@media (max-width:760px){.tpl-mosaico .m-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}}
.tpl-mosaico .m-card{background:var(--card);border-radius:24px;overflow:hidden;box-shadow:0 0 0 1px var(--line);border:0;padding:0;text-align:left;cursor:pointer;display:flex;flex-direction:column;transition:transform .35s cubic-bezier(.2,.8,.2,1),box-shadow .35s;animation:mUp .6s cubic-bezier(.2,.8,.2,1) both;animation-delay:var(--d,0ms)}
@keyframes mUp{from{opacity:0;transform:translateY(24px)}}
.tpl-mosaico .m-card:hover{transform:translateY(-6px);box-shadow:0 0 0 1px var(--line),0 30px 50px -30px rgba(0,0,0,.4)}
.tpl-mosaico .m-card .ph{aspect-ratio:1/1;position:relative;overflow:hidden}
.tpl-mosaico .m-card .ph .portrait{transition:transform .8s cubic-bezier(.2,.8,.2,1)}
.tpl-mosaico .m-card:hover .ph .portrait{transform:scale(1.06)}
.tpl-mosaico .m-card .bd{padding:14px 16px 18px;display:flex;flex-direction:column;gap:4px}
.tpl-mosaico .m-card b{font-family:'Schibsted Grotesk',sans-serif;font-size:20px;font-weight:800;letter-spacing:-.01em}
.tpl-mosaico .m-card span{font-size:13px;color:var(--soft);font-weight:500}
.tpl-mosaico .m-new{position:absolute;top:12px;left:12px;background:var(--card);font-size:11px;font-weight:800;letter-spacing:.06em;padding:5px 10px;border-radius:999px}
.tpl-mosaico .m-more{display:flex;flex-direction:column;align-items:center;gap:14px;margin-top:44px}
.tpl-mosaico .m-prog{width:min(260px,70%);height:4px;border-radius:4px;background:var(--line);overflow:hidden}
.tpl-mosaico .m-prog i{display:block;height:100%;background:var(--ink);transition:width .6s}
.tpl-mosaico .m-more p{font-size:14px;color:var(--soft);font-weight:600}
.tpl-mosaico .m-btn2{min-height:52px;padding:0 26px;border-radius:999px;border:0;background:var(--ink);color:var(--bg);font-weight:700;cursor:pointer}
.tpl-mosaico .m-empty{grid-column:1/-1;text-align:center;padding:60px 20px;color:var(--soft)}

.tpl-mosaico .m-camp{background:var(--ink);color:var(--bg);border-radius:36px;padding:clamp(28px,5vw,64px);display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:48px;align-items:center}
.tpl-mosaico .m-camp .m-h2{color:var(--bg)}
.tpl-mosaico .m-dots{display:grid;grid-template-columns:repeat(10,1fr);gap:6px}
.tpl-mosaico .m-dots i{aspect-ratio:1/1;border-radius:30%;background:rgba(255,255,255,.1);transition:background .4s}
.tpl-mosaico .m-dots i.on{background:var(--brand)}
.tpl-mosaico .m-camp dl{display:flex;gap:28px;flex-wrap:wrap;margin:22px 0 0}
.tpl-mosaico .m-camp dt{font-size:12px;color:rgba(255,255,255,.55);font-weight:700;letter-spacing:.08em;text-transform:uppercase}
.tpl-mosaico .m-camp dd{margin:4px 0 0;font-family:'Schibsted Grotesk',sans-serif;font-weight:800;font-size:26px}
@media (max-width:900px){.tpl-mosaico .m-camp{grid-template-columns:minmax(0,1fr)}}
.tpl-mosaico .m-trust{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;margin-top:36px}
.tpl-mosaico .m-tc{background:var(--card);border-radius:24px;padding:26px;box-shadow:0 0 0 1px var(--line)}
.tpl-mosaico .m-tc svg{width:22px;color:var(--brand)}
.tpl-mosaico .m-tc b{display:block;margin-top:14px;font-family:'Schibsted Grotesk',sans-serif;font-size:19px}
.tpl-mosaico .m-tc p{margin-top:6px;color:var(--soft);font-size:15px;line-height:1.55}
@media (max-width:900px){.tpl-mosaico .m-trust{grid-template-columns:minmax(0,1fr)}}
.tpl-mosaico .m-ftr{padding-block:40px 56px;border-top:1px solid var(--line);display:flex;justify-content:space-between;gap:18px;flex-wrap:wrap;font-size:14px;color:var(--soft)}

.tpl-mosaico .m-tbar{display:flex;flex-wrap:wrap;align-items:center;gap:10px 26px;padding:12px 18px;border-radius:18px;background:var(--card);box-shadow:0 0 0 1px var(--line);font-size:14px;color:var(--soft)}
.tpl-mosaico .m-tbar .lv{display:flex;align-items:center;gap:8px;color:var(--ink)}
.tpl-mosaico .m-tbar .lv svg{width:20px;color:var(--brand)}
.tpl-mosaico .m-tbar b{color:var(--ink)}
.tpl-mosaico .m-tbar .steps{display:flex;gap:4px}
.tpl-mosaico .m-tbar .steps i{width:18px;height:8px;border-radius:4px;background:var(--line)}
.tpl-mosaico .m-tbar .steps i.on{background:var(--brand)}
.tpl-mosaico .m-tbar .ac{margin-left:auto}
.tpl-mosaico .m-badges{display:flex;flex-wrap:wrap;gap:8px}
.tpl-mosaico .m-k.off i{background:var(--line);color:var(--soft)}
.tpl-mosaico .m-k.plain{padding-left:14px}
.tpl-mosaico .m-acts{display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin-top:24px}
.tpl-mosaico .m-acts p{width:100%;font-size:13px;color:var(--soft)}
.tpl-mosaico .m-go2{display:inline-flex;align-items:center;gap:8px;min-height:52px;padding:0 22px;border-radius:999px;background:transparent;box-shadow:inset 0 0 0 1.5px var(--ink);color:var(--ink)!important;text-decoration:none;font-weight:700;border:0;cursor:pointer;font-size:15px}
.tpl-mosaico .m-go2 svg{width:16px}
.tpl-mosaico .m-empty{margin-top:22px;padding:30px;border-radius:24px;border:1.5px dashed var(--line);color:var(--soft);font-size:16px;line-height:1.6}
.tpl-mosaico .m-camp .m-empty{border-color:rgba(255,255,255,.2);color:rgba(255,255,255,.7)}
.tpl-mosaico .m-hd{display:flex;justify-content:space-between;align-items:flex-end;gap:16px 30px;flex-wrap:wrap;margin-bottom:28px}
.tpl-mosaico .m-needs{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px}
.tpl-mosaico .m-need{background:var(--card);border-radius:24px;padding:22px;box-shadow:0 0 0 1px var(--line);display:flex;flex-direction:column;gap:12px}
.tpl-mosaico .m-need .cat{font-size:12px;font-weight:700;color:var(--brand);text-transform:uppercase;letter-spacing:.08em}
.tpl-mosaico .m-need b{font-family:'Schibsted Grotesk',sans-serif;font-size:20px;font-weight:800;line-height:1.15}
.tpl-mosaico .m-need .cells{display:grid;grid-template-columns:repeat(10,1fr);gap:4px;margin-top:auto}
.tpl-mosaico .m-need .cells i{aspect-ratio:1/1;border-radius:30%;background:var(--bg)}
.tpl-mosaico .m-need .cells i.on{background:var(--brand)}
.tpl-mosaico .m-need p{font-size:14px;color:var(--soft)}
.tpl-mosaico .m-need strong{color:var(--ink)}
.tpl-mosaico .m-need .m-go2{min-height:44px;font-size:14px;align-self:flex-start}
@media (max-width:1000px){.tpl-mosaico .m-needs{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (max-width:560px){.tpl-mosaico .m-needs{grid-template-columns:minmax(0,1fr)}}
.tpl-mosaico .m-prods .m-card{text-decoration:none;color:inherit}
.tpl-mosaico .m-help{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);border-radius:36px;overflow:hidden;background:var(--brand);color:var(--brand-ink)}
.tpl-mosaico .m-help-art{display:grid;grid-template-columns:repeat(6,1fr);gap:6px;padding:24px;transform:rotate(-6deg) scale(1.15)}
.tpl-mosaico .m-help-art span{aspect-ratio:1/1;border-radius:24%;overflow:hidden}
.tpl-mosaico .m-help-bd{padding:clamp(28px,5vw,64px);display:flex;flex-direction:column;gap:16px;justify-content:center}
.tpl-mosaico .m-help .m-sub{color:inherit;opacity:.85;margin:0}
.tpl-mosaico .m-help .m-go{background:var(--brand-ink);color:var(--brand)!important;align-self:flex-start}
@media (max-width:900px){.tpl-mosaico .m-help{grid-template-columns:minmax(0,1fr)}.tpl-mosaico .m-help-art{max-height:220px}}
.tpl-mosaico .m-tc.off svg{color:var(--soft)}
.tpl-mosaico .m-revs{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}
.tpl-mosaico .m-rev{margin:0;background:var(--card);border-radius:24px;padding:26px;box-shadow:0 0 0 1px var(--line);display:flex;flex-direction:column;gap:14px}
.tpl-mosaico .m-rev .st{color:#E0A243;letter-spacing:2px}
.tpl-mosaico .m-rev blockquote{margin:0;font-size:17px;line-height:1.55}
.tpl-mosaico .m-rev figcaption{display:flex;align-items:center;gap:10px;font-size:14px;color:var(--soft);font-weight:600;margin-top:auto}
.tpl-mosaico .m-rev figcaption i{width:34px;height:34px;border-radius:50%;background:var(--brand);color:var(--brand-ink);display:grid;place-items:center;font-style:normal;font-weight:800}
@media (max-width:900px){.tpl-mosaico .m-revs{grid-template-columns:minmax(0,1fr)}}
.tpl-mosaico .m-ledger{display:grid;grid-template-columns:280px minmax(0,1fr);gap:16px}
.tpl-mosaico .m-lsum{display:flex;flex-direction:column;gap:10px}
.tpl-mosaico .m-lsum div{background:var(--card);border-radius:20px;padding:18px 20px;box-shadow:0 0 0 1px var(--line)}
.tpl-mosaico .m-lsum span{font-size:12px;font-weight:700;color:var(--soft);text-transform:uppercase;letter-spacing:.08em}
.tpl-mosaico .m-lsum b{display:block;font-family:'Schibsted Grotesk',sans-serif;font-size:28px;font-weight:900;letter-spacing:-.02em}
.tpl-mosaico .m-lsum .bal{background:var(--ink);color:var(--bg)}
.tpl-mosaico .m-lrows{list-style:none;margin:0;padding:0;background:var(--card);border-radius:24px;box-shadow:0 0 0 1px var(--line);overflow:hidden}
.tpl-mosaico .m-lrows li{display:grid;grid-template-columns:80px minmax(0,1fr) auto;gap:16px;align-items:center;padding:18px 22px;border-bottom:1px solid var(--line)}
.tpl-mosaico .m-lrows li:last-child{border-bottom:0}
.tpl-mosaico .m-lrows .d{font-weight:700;color:var(--soft);font-size:14px}
.tpl-mosaico .m-lrows .c b{display:block;font-weight:600}
.tpl-mosaico .m-lrows .c small{color:var(--soft);font-size:13px}
.tpl-mosaico .m-lrows .a{font-family:'Schibsted Grotesk',sans-serif;font-weight:800;font-variant-numeric:tabular-nums;white-space:nowrap}
.tpl-mosaico .m-lrows .a.in{color:var(--brand)}
@media (max-width:800px){.tpl-mosaico .m-ledger{grid-template-columns:minmax(0,1fr)}.tpl-mosaico .m-lsum{flex-direction:row;flex-wrap:wrap}.tpl-mosaico .m-lsum div{flex:1 1 140px}.tpl-mosaico .m-lrows li{grid-template-columns:minmax(0,1fr) auto}.tpl-mosaico .m-lrows .d{grid-column:1/-1}}
.tpl-mosaico .m-contact{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(0,1fr);border-radius:32px;overflow:hidden;background:var(--card);box-shadow:0 0 0 1px var(--line)}
.tpl-mosaico .m-contact .map{min-height:360px}
.tpl-mosaico .m-contact .info{padding:clamp(24px,4vw,48px);display:flex;flex-direction:column;gap:20px}
.tpl-mosaico .m-contact dl{margin:0;display:flex;flex-direction:column;gap:16px}
.tpl-mosaico .m-contact dt{display:flex;align-items:center;gap:8px;font-size:13px;font-weight:700;color:var(--soft)}
.tpl-mosaico .m-contact dt svg{width:16px;color:var(--brand)}
.tpl-mosaico .m-contact dd{margin:4px 0 0;font-weight:600;font-size:17px}
.tpl-mosaico .m-contact .m-go2{align-self:flex-start}
@media (max-width:860px){.tpl-mosaico .m-contact{grid-template-columns:minmax(0,1fr)}.tpl-mosaico .m-contact .map{min-height:220px}}
.tpl-mosaico .m-social{display:flex;flex-wrap:wrap;gap:20px 40px;align-items:center;justify-content:space-between;padding:28px;border-radius:28px;background:var(--card);box-shadow:0 0 0 1px var(--line)}
.tpl-mosaico .m-social h3{font-family:'Schibsted Grotesk',sans-serif;font-weight:900;font-size:28px}
.tpl-mosaico .m-social p{color:var(--soft);margin-top:4px}
.tpl-mosaico .m-social .ls{display:flex;flex-wrap:wrap;gap:8px}
.tpl-mosaico .m-social a{display:flex;align-items:center;gap:10px;padding:10px 16px 10px 12px;border-radius:999px;background:var(--bg);text-decoration:none;transition:transform .25s}
.tpl-mosaico .m-social a:hover{transform:translateY(-2px)}
.tpl-mosaico .m-social a svg{width:20px;color:var(--brand)}
.tpl-mosaico .m-social a b{display:block;font-size:14px}
.tpl-mosaico .m-social a small{display:block;font-size:12px;color:var(--soft)}
.tpl-mosaico .ldg{border:0;padding:0;background:transparent;width:min(960px,calc(100vw - 24px));max-width:none}
.tpl-mosaico .ldg::backdrop{background:rgba(21,20,15,.55);backdrop-filter:blur(8px)}
.tpl-mosaico .ldg-in{background:var(--card);border-radius:32px;padding:32px;position:relative;max-height:calc(100vh - 24px);overflow:auto;animation:mPop .45s cubic-bezier(.2,.9,.3,1.2)}
.tpl-mosaico .ldg-k{font-size:13px;font-weight:700;color:var(--brand)}
.tpl-mosaico .ldg-t{font-family:'Schibsted Grotesk',sans-serif;font-weight:900;font-size:44px;letter-spacing:-.03em}
.tpl-mosaico .ldg-d{color:var(--soft)}
.tpl-mosaico .ldg-sum{display:flex;gap:10px;flex-wrap:wrap;margin-top:18px}
.tpl-mosaico .ldg-sum div{background:var(--bg);border-radius:16px;padding:12px 16px}
.tpl-mosaico .ldg-sum span{display:block;font-size:12px;color:var(--soft);font-weight:700}
.tpl-mosaico .ldg-sum b{font-family:'Schibsted Grotesk',sans-serif;font-size:24px}
.tpl-mosaico .ldg-tw{overflow-x:auto;margin-top:18px}
.tpl-mosaico .ldg table{width:100%;border-collapse:collapse;font-size:14px}
.tpl-mosaico .ldg th,.tpl-mosaico .ldg td{text-align:left;padding:12px 10px;border-bottom:1px solid var(--line)}
.tpl-mosaico .ldg th{font-size:12px;color:var(--soft)}
.tpl-mosaico .ldg .num{text-align:right;white-space:nowrap}
.tpl-mosaico .ldg .lk{font-size:12px;font-weight:700;padding:4px 10px;border-radius:999px;background:var(--bg)}
.tpl-mosaico .ldg-x{position:absolute;top:14px;right:14px;width:44px;height:44px;border-radius:50%;border:0;background:var(--bg);cursor:pointer;display:grid;place-items:center}
.tpl-mosaico .ldg-x svg{width:18px}

.tpl-mosaico dialog.sheet{border:0;padding:0;background:transparent;max-width:min(900px,calc(100vw - 24px));width:100%}
.tpl-mosaico dialog.sheet::backdrop{background:rgba(21,20,15,.55);backdrop-filter:blur(8px)}
.tpl-mosaico .sh-in{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);background:var(--card);border-radius:32px;overflow:hidden;position:relative;animation:mPop .45s cubic-bezier(.2,.9,.3,1.2)}
@keyframes mPop{from{opacity:0;transform:scale(.92)}}
.tpl-mosaico .sh-ph{aspect-ratio:1/1}
.tpl-mosaico .sh-bd{padding:32px;display:flex;flex-direction:column;gap:14px}
.tpl-mosaico .sh-k{font-size:13px;color:var(--soft);font-weight:700}
.tpl-mosaico .sh-n{font-family:'Schibsted Grotesk',sans-serif;font-weight:900;font-size:52px;letter-spacing:-.03em;line-height:1}
.tpl-mosaico .sh-dl{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:0}
.tpl-mosaico .sh-dl div{background:var(--bg);border-radius:14px;padding:10px 12px}
.tpl-mosaico .sh-dl dt{font-size:11px;font-weight:700;color:var(--soft);text-transform:uppercase;letter-spacing:.06em}
.tpl-mosaico .sh-dl dd{margin:2px 0 0;font-weight:700}
.tpl-mosaico .sh-act{display:flex;gap:8px;flex-wrap:wrap;margin-top:auto}
.tpl-mosaico .sh-b1,.tpl-mosaico .sh-b2{min-height:50px;padding:0 20px;display:inline-flex;align-items:center;border-radius:999px;text-decoration:none;font-weight:700}
.tpl-mosaico .sh-b1{background:var(--brand);color:var(--brand-ink)}
.tpl-mosaico .sh-b2{box-shadow:inset 0 0 0 1.5px var(--ink)}
.tpl-mosaico .sh-x{position:absolute;top:14px;right:14px;width:44px;height:44px;border-radius:50%;border:0;background:var(--card);cursor:pointer;display:grid;place-items:center;z-index:2;box-shadow:0 4px 14px rgba(0,0,0,.15)}
.tpl-mosaico .sh-x svg{width:18px}
@media (max-width:720px){.tpl-mosaico .sh-in{grid-template-columns:minmax(0,1fr);max-height:calc(100vh - 24px);overflow:auto}.tpl-mosaico .sh-ph{aspect-ratio:4/3}.tpl-mosaico .sh-bd{padding:22px}.tpl-mosaico .sh-n{font-size:40px}}
.tpl-mosaico .m-contact.nomap{grid-template-columns:minmax(0,1fr)}
.tpl-mosaico .m-contact .map{position:relative}
.tpl-mosaico .m-contact .map iframe{position:absolute;inset:0}
.tpl-mosaico a.m-card,.tpl-mosaico a.m-cell{text-decoration:none;color:inherit}
.tpl-mosaico .m-mark .tpl-logo-img{width:100%;height:100%;object-fit:cover;border-radius:inherit}
`;

type Key = 'sp' | 'size' | 'age';
const AGE_OPTS = [
  ['young', 'Bebé'],
  ['Joven', 'Joven'],
  ['Adulto', 'Adulto'],
  ['Senior', 'Senior'],
] as const;
const ageOk = (a: TplAnimal, v: string) =>
  v === 'young' ? a.hasAge && a.months < 12 : a.stage === v;

export const mosaico: TemplateDesign = {
  id: 'mosaico',
  fonts:
    'family=Onest:wght@300;400;500;600;700;800;900&family=Schibsted+Grotesk:ital,wght@0,400;0,500;0,700;0,800;0,900;1,800',
  css: CSS,
  html(m, KIT) {
    const { ORG, CAMPAIGN, ANIMALS, SHOW, BADGES, NEEDS, PRODUCTS, REVIEWS } = m;
    const n = m.COUNTS.total;
    // Solo se ofrecen opciones que tengan al menos un animal.
    const quiz: Array<[Key, string, Array<readonly [string, string]>]> = (
      [
        [
          'sp',
          '¿Perro o gato?',
          [['', 'Me da igual'], ...FACETS.sp.filter(([v]) => ANIMALS.some((a) => a.sp === v))],
        ],
        [
          'size',
          '¿De qué tamaño?',
          [['', 'Cualquiera'], ...FACETS.size.filter(([v]) => ANIMALS.some((a) => a.size === v))],
        ],
        [
          'age',
          '¿Qué edad?',
          [['', 'Cualquiera'], ...AGE_OPTS.filter(([v]) => ANIMALS.some((a) => ageOk(a, v)))],
        ],
      ] as Array<[Key, string, Array<readonly [string, string]>]>
    ).filter(([, , opts]) => opts.length > 2);
    const t = KIT.transparencyParts();
    const map = mapEmbed(m);
    const plain = [ORG.type, ORG.city].filter(Boolean).join(' · ');
    return `
<header class="w m-top"><a class="m-brand" href="#m-hero"><span class="m-mark">${ORG.logo ? logoMark(m) : ic.paw}</span>${ORG.short}</a>
  <nav class="m-nav" aria-label="Principal"><a href="#m-cat">Adopta</a><a href="#portal-help-cta">Cómo ayudar</a>${SHOW.nosotros ? '<a href="#m-trust">Nosotros</a>' : ''}<a href="#m-libro">Transparencia</a><a class="m-pill" href="${ORG.donateHref}">Donar</a></nav></header>
${SHOW.transparencia ? `<div class="w"><div class="m-tbar" data-sec="transparencia" role="group" aria-label="Transparencia"><span class="lv">${ic.shield}<b>${t.level}</b></span><span>Formalización <b>${ORG.formalization}%</b></span><span>${t.accountability}</span><span class="ac">${t.note}</span></div></div>` : ''}
<section class="w m-hero" id="m-hero">
  <div>
    <div class="m-badges">${BADGES.map((b) => `<span class="m-k${b.ok ? '' : ' off'}"><i>${b.ok ? ic.check : '·'}</i>${b.t}</span>`).join('')}${plain ? `<span class="m-k plain">${plain}</span>` : ''}</div>
    <h1 class="m-h1">${n > 1 ? `${n} caras.<br><span>Una</span> es la tuya.` : n === 1 ? `Una cara.<br><span>Puede</span> ser la tuya.` : ORG.name}</h1>
    <p class="m-sub">${n > 1 && quiz.length ? 'Responde las preguntas y la huella te muestra quiénes encajan contigo. Sin listas eternas.' : ORG.lede || availLine(m)}</p>
    <div class="m-acts" data-sec="acciones"><a class="m-go" href="#m-cat" data-magnet>Adoptar ${ic.arrow}</a><a class="m-go2" href="#m-cat">Apadrinar</a><a class="m-go2" href="${ORG.donateHref}">Donar</a><p>${COPY.adoptNote}</p></div>
    ${
      n > 1 && quiz.length
        ? `<div class="m-quiz" role="group" aria-label="Buscador guiado">
      ${quiz.map(([k, title, opts]) => `<div class="m-q"><span id="mq-${k}">${title}</span><div class="m-seg" role="group" aria-labelledby="mq-${k}">${opts.map((o, i) => `<button type="button" data-k="${k}" data-v="${o[0]}" aria-pressed="${i === 0}">${o[1]}<small></small></button>`).join('')}</div></div>`).join('')}
      <div class="m-res"><span class="n" aria-live="polite"><span id="m-n">${n}</span><small>coinciden contigo</small></span><a class="m-go" href="#m-cat">Conócelos ${ic.arrow}</a></div>
    </div>`
        : ''
    }
  </div>
  <div class="m-art" id="m-art" aria-label="${n ? 'Huella formada por los retratos de los animales en adopción' : 'Huella'}"><span class="m-tip" id="m-tip"></span></div>
</section>
<section id="m-cat" data-sec="animales" style="scroll-margin-top:var(--bar)">
  <div class="w"><h2 class="m-h2">Mascotas en adopción</h2></div>
  ${
    n
      ? `<div class="m-bar"><div class="w">
    <label class="m-srch"><span class="sr">Buscar</span>${ic.search}<input id="m-q" type="search" placeholder="Busca por nombre o raza" autocomplete="off"></label>
    <span id="m-tags" style="display:contents"></span>
    <label><span class="sr">Ordenar</span><select class="m-sel" id="m-sort"><option value="recientes">Recién publicados</option><option value="espera">Los que más esperan</option><option value="jovenes">Más jóvenes</option><option value="mayores">Mayores</option><option value="nombre">Nombre A–Z</option></select></label>
  </div></div>
  <div class="w"><div class="m-grid" id="m-grid"></div>
    <div class="m-more"><div class="m-prog"><i id="m-prog"></i></div><p id="m-of"></p><button type="button" class="m-btn2" id="m-load">Cargar 12 más</button></div></div>`
      : `<div class="w"><p class="m-empty">${EMPTY.animales}</p></div>`
  }
</section>
<section class="w m-sec" id="m-camp" data-sec="campana">
  ${
    CAMPAIGN.active
      ? `<div class="m-camp">
    <div><p style="font-weight:700;color:rgba(255,255,255,.6)">Campaña activa${CAMPAIGN.category ? ` · ${CAMPAIGN.category}` : ''}</p><h2 class="m-h2" style="margin-top:12px">${CAMPAIGN.title}</h2>
      <p style="margin-top:14px;color:rgba(255,255,255,.7);line-height:1.6;max-width:28em">${CAMPAIGN.description ? `${CAMPAIGN.description} ` : ''}Cada cuadro es el 1% de la meta (${fmt(CAMPAIGN.goal / 100)}). ${COPY.adoptNote}</p>
      <dl><div><dt>Recaudado</dt><dd id="m-raised">${fmt(CAMPAIGN.raised)}</dd></div><div><dt>Meta</dt><dd>${fmt(CAMPAIGN.goal)}</dd></div><div><dt>Cierra</dt><dd>${CAMPAIGN.deadline}</dd></div></dl>
      <a class="m-go" href="${CAMPAIGN.href}" style="margin-top:26px" data-magnet>Ver campaña y aportar ${ic.arrow}</a>${KIT.moreCampaigns()}</div>
    <div class="m-dots" id="m-dots" role="img" aria-label="${CAMPAIGN.pct}% de la meta">${Array.from({ length: 100 }, () => '<i></i>').join('')}</div>
  </div>`
      : `<h2 class="m-h2">Campaña activa</h2><p class="m-empty">${EMPTY.campana}</p>`
  }
</section>
<section class="w m-sec" data-sec="necesidades" style="padding-top:0"><div class="m-hd"><h2 class="m-h2">Necesita hoy</h2><p class="m-sub" style="margin:0">Del banco de recursos. Cada cuadro es el 5% de lo que se necesita.</p></div>
  ${NEEDS.length ? `<div class="m-needs">${NEEDS.map((nd) => `<article class="m-need">${nd.category ? `<span class="cat">${nd.category}</span>` : ''}<b>${nd.title}</b><div class="cells" role="img" aria-label="${nd.got} de ${nd.need} ${nd.unit}">${Array.from({ length: 20 }, (_, k) => `<i class="${k < Math.round(nd.pct / 5) ? 'on' : ''}"></i>`).join('')}</div><p><strong>${nd.got}</strong> de ${nd.need} ${nd.unit} · ${nd.pct}%</p><a class="m-go2" href="${nd.href}">Ver y donar</a></article>`).join('')}</div>` : `<p class="m-empty">${EMPTY.necesidades}</p>`}
</section>
<section class="w m-sec" data-sec="productos" style="padding-top:0"><div class="m-hd"><h2 class="m-h2">Productos</h2><p class="m-sub" style="margin:0">De la tienda solidaria de la organización.</p></div>
  ${PRODUCTS.length ? `<div class="m-grid m-prods">${PRODUCTS.map((p) => `<a class="m-card" href="${p.href}"><div class="ph" style="background:${p.tint}33">${productArt(p)}</div><div class="bd"><b>${p.name}</b><span>${p.category ? `${p.category} · ` : ''}<strong style="color:var(--ink)">${fmt(p.price)}</strong></span></div></a>`).join('')}</div>` : `<p class="m-empty">${EMPTY.productos}</p>`}
</section>
<section class="w" id="portal-help-cta" data-sec="ayuda" style="padding-bottom:96px"><div class="m-help">${
      ANIMALS.length
        ? `<div class="m-help-art" aria-hidden="true">${ANIMALS.slice(0, 18)
            .map((a) => `<span>${portrait(a, { decor: true, dx: 6, dy: 14, s: 1.1 })}</span>`)
            .join('')}</div>`
        : ''
    }<div class="m-help-bd"><h2 class="m-h2">${COPY.helpTitle}</h2><p class="m-sub">${COPY.helpText}</p><a class="m-go" href="${ORG.donateHref}" data-magnet>${COPY.helpCta} ${ic.arrow}</a></div></div></section>
${
  SHOW.nosotros
    ? `<section class="w" id="m-trust" data-sec="nosotros" style="padding-bottom:96px">
  <h2 class="m-h2">Sobre nosotros</h2><p class="m-sub" style="max-width:44em">${ORG.about}</p>
  ${BADGES.length ? `<div class="m-trust">${BADGES.map((b) => `<div class="m-tc${b.ok ? '' : ' off'}">${b.ok ? ic.check : ic.clock}<b>${b.t}</b><p>Estado registrado en AdoptaFácil.</p></div>`).join('')}</div>` : ''}
</section>`
    : ''
}
<section class="w" data-sec="resenas" style="padding-bottom:96px"><div class="m-hd"><h2 class="m-h2">Reseñas</h2><button type="button" class="m-go2" data-review>Registrar reseña</button></div>
  ${REVIEWS.length ? `<div class="m-revs">${REVIEWS.map((r) => `<figure class="m-rev"><span class="st" aria-label="${r.rating} de 5">${stars(r.rating)}</span>${r.text ? `<blockquote>“${r.text}”</blockquote>` : ''}<figcaption><i>${esc(unesc(r.name).charAt(0))}</i>${r.name}${r.date ? ` · ${r.date}` : ''}</figcaption></figure>`).join('')}</div>` : `<p class="m-empty">${EMPTY.resenas}</p>`}
</section>
<section class="w" id="m-libro" data-sec="libro" style="padding-bottom:96px"><div class="m-hd"><div><h2 class="m-h2">${COPY.ledgerTitle}</h2><p class="m-sub" style="margin-top:10px">${COPY.ledgerText}</p></div><button type="button" class="m-go2" data-ledger>Ver libro completo ${ic.arrow}</button></div>
  ${ledgerBlock(m, 'm-empty')}
</section>
${
  SHOW.contacto
    ? `<section class="w" data-sec="contacto" style="padding-bottom:96px"><div class="m-contact${map ? '' : ' nomap'}">${map ? `<div class="map">${map}</div>` : ''}<div class="info"><h2 class="m-h2" style="font-size:clamp(30px,3vw,44px)">Información de contacto</h2>
  ${KIT.contactRows('', true)}${mapLink(m, 'm-go2')}</div></div></section>`
    : ''
}
${SHOW.redes ? `<section class="w" data-sec="redes" style="padding-bottom:70px"><div class="m-social"><div><h3>${COPY.socialsTitle}</h3><p>${COPY.socialsText}</p></div><div class="ls">${m.SOCIALS.map((x) => socialLink(x, `${ic[x.key]}<span><b>${x.label}</b><small>${x.handle}</small></span>`)).join('')}</div></div></section>` : ''}
<footer class="w m-ftr"><span>${ORG.name}${ORG.city ? ` · ${ORG.city}` : ''}</span><span>Hecho con AdoptaFácil</span></footer>`;
  },
  init(app, env) {
    const { m, motion, catalog } = env;
    const { signal } = motion;
    const A = m.ANIMALS;
    const byId = new Map(A.map((a) => [a.id, a]));
    const art = qs(app, '#m-art');
    const tip = qs(app, '#m-tip');
    // Huella: la rejilla más pequeña con suficientes celdas dentro de la forma
    const pads = [
      [0.5, 0.7, 0.27, 0.22],
      [0.17, 0.42, 0.1, 0.13],
      [0.37, 0.23, 0.105, 0.135],
      [0.63, 0.23, 0.105, 0.135],
      [0.83, 0.42, 0.1, 0.13],
    ];
    const inside = (x: number, y: number) =>
      pads.some(([cx, cy, rx, ry]) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1);
    const TARGET = Math.min(200, Math.max(A.length, 60));
    let C = 10;
    let cells: Array<[number, number]> = [];
    for (; C < 30; C++) {
      cells = [];
      for (let r = 0; r < C; r++)
        for (let c = 0; c < C; c++) {
          if (inside((c + 0.5) / C, (r + 0.5) / C)) cells.push([c, r]);
        }
      if (cells.length >= TARGET) break;
    }
    // Sobran celdas: quita las del borde (menos vecinas)
    while (cells.length > TARGET) {
      const has = new Set(cells.map((c) => c.join()));
      let wi = 0;
      let wn = 9;
      cells.forEach(([c, r], k) => {
        let nb = 0;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && has.has([c + dx, r + dy].join())) nb++;
        if (nb < wn) {
          wn = nb;
          wi = k;
        }
      });
      cells.splice(wi, 1);
    }
    let cellEls: HTMLElement[] = [];
    if (art) {
      const sz = 100 / C;
      const g = sz * 0.1;
      // Agrupa por color de la ilustración: la huella se ve pintada, no ruidosa
      const order = [...A].sort((a, b) => a.bg.localeCompare(b.bg) || a.i - b.i);
      cells.sort((a, b) => a[1] * 3 + a[0] - (b[1] * 3 + b[0]));
      art.insertAdjacentHTML(
        'beforeend',
        cells
          .map(([c, r], k) => {
            const a = order.length ? order[k % order.length] : null;
            const dup = k >= order.length;
            const st = `left:${c * sz + g / 2}%;top:${r * sz + g / 2}%;width:${sz - g}%;height:${sz - g}%;--fx:${((Math.random() - 0.5) * 400) | 0}px;--fy:${((Math.random() - 0.5) * 400) | 0}px;--fr:${((Math.random() - 0.5) * 180) | 0}deg;transition-delay:${motion.reduce ? 0 : k * 9}ms`;
            return a
              ? `<a class="m-cell${motion.reduce ? '' : ' pre'}" href="${a.href}" data-id="${a.id}" style="${st}"${dup ? ' aria-hidden="true" tabindex="-1"' : ` aria-label="${a.name}, ${a.spLabel.toLowerCase()}, ${a.age}"`}>${portrait(a, { decor: true, dx: 6, dy: 14, s: 1.1 })}</a>`
              : `<span class="m-cell fill" style="${st}"></span>`;
          })
          .join(''),
      );
      cellEls = qsa(art, '.m-cell[data-id]');
      if (!motion.reduce)
        requestAnimationFrame(() =>
          requestAnimationFrame(() => cellEls.forEach((el) => el.classList.remove('pre'))),
        );
      const t = setTimeout(() => cellEls.forEach((el) => (el.style.transitionDelay = '')), 2200);
      signal.addEventListener('abort', () => clearTimeout(t));
      if (tip) {
        art.addEventListener(
          'pointerover',
          (e) => {
            const el = (e.target as Element).closest<HTMLElement>('.m-cell[data-id]');
            const a = el ? byId.get(el.dataset.id ?? '') : undefined;
            if (!el || !a) return;
            const r = el.getBoundingClientRect();
            const ar = art.getBoundingClientRect();
            tip.innerHTML = `<b>${a.name}</b> · ${a.age}`;
            tip.style.left = r.left - ar.left + r.width / 2 + 'px';
            tip.style.top = r.top - ar.top + 'px';
            tip.classList.add('on');
          },
          { signal },
        );
        art.addEventListener('pointerleave', () => tip.classList.remove('on'), { signal });
      }
    }

    // Estado compartido entre el buscador guiado y el catálogo
    const grid = qs(app, '#m-grid');
    if (!grid) return motion.magnet(app);
    const st: Record<Key, string> & {
      q: string;
      sort: 'recientes' | 'espera' | 'jovenes' | 'mayores' | 'nombre';
      shown: number;
    } = {
      sp: '',
      size: '',
      age: '',
      q: '',
      sort: 'recientes',
      shown: 12,
    };
    const match = (a: TplAnimal, s: Record<Key, string> = st) =>
      (!s.sp || a.sp === s.sp) && (!s.size || a.size === s.size) && (!s.age || ageOk(a, s.age));
    const LBL: Record<Key, Record<string, string>> = {
      sp: Object.fromEntries(FACETS.sp),
      size: Object.fromEntries(FACETS.size),
      age: Object.fromEntries(AGE_OPTS),
    };
    const nEl = qs(app, '#m-n');
    const tags = qs(app, '#m-tags');
    const of = qs(app, '#m-of');
    const prog = qs(app, '#m-prog');
    const more = qs<HTMLButtonElement>(app, '#m-load');
    let lastN = A.length;
    const list = () => catalog.query({ q: st.q, sort: st.sort }).filter((a) => match(a));
    const paint = (append: boolean) => {
      const L = list();
      const shown = Math.min(st.shown, L.length);
      const from = append ? qsa(grid, '.m-card').length : 0;
      if (!append) grid.innerHTML = '';
      grid.insertAdjacentHTML(
        'beforeend',
        L.slice(from, shown)
          .map(
            (a, k) =>
              `<a class="m-card" href="${a.href}" style="--d:${k * 40}ms"><div class="ph">${portrait(a, { decor: true })}${a.isNew ? '<span class="m-new">Nuevo</span>' : ''}</div><div class="bd"><b>${a.name}</b><span>${a.spLabel} · ${a.age} · ${a.sizeLabel}</span></div></a>`,
          )
          .join('') ||
          (append
            ? ''
            : '<p class="m-empty">Nadie coincide con todo eso. Prueba quitando un filtro.</p>'),
      );
      if (of) of.textContent = `Viendo ${shown} de ${L.length}`;
      if (prog) prog.style.width = (L.length ? (shown / L.length) * 100 : 0) + '%';
      if (more) {
        more.hidden = shown >= L.length;
        more.textContent = `Cargar ${Math.min(12, L.length - shown)} más`;
      }
    };
    const sync = () => {
      const n = A.filter((a) => match(a)).length;
      cellEls.forEach((el) => {
        const a = byId.get(el.dataset.id ?? '');
        const on = a ? match(a) : false;
        el.classList.toggle('off', !on);
        el.classList.toggle('hit', on && n < A.length);
      });
      // Conteo animado y cuántos quedarían en cada opción
      if (nEl) {
        const from = lastN;
        lastN = n;
        const t0 = performance.now();
        const step = (tm: number) => {
          if (signal.aborted) return;
          const k = Math.min(1, (tm - t0) / 500);
          nEl.textContent = String(Math.round(from + (n - from) * (1 - Math.pow(1 - k, 3))));
          if (k < 1 && !motion.reduce) requestAnimationFrame(step);
          else nEl.textContent = String(n);
        };
        step(t0);
      }
      qsa(app, '.m-seg button').forEach((b) => {
        const k = b.dataset.k as Key;
        const v = b.dataset.v ?? '';
        b.setAttribute('aria-pressed', String(st[k] === v));
        const small = qs(b, 'small');
        if (small)
          small.textContent = v ? String(A.filter((a) => match(a, { ...st, [k]: v })).length) : '';
      });
      if (tags)
        tags.innerHTML = (['sp', 'size', 'age'] as Key[])
          .filter((k) => st[k])
          .map(
            (k) =>
              `<button type="button" class="m-tag" data-k="${k}">${LBL[k][st[k]] ?? ''} ${ic.x}<span class="sr">Quitar</span></button>`,
          )
          .join('');
      st.shown = 12;
      paint(false);
    };
    qs(app, '.m-quiz')?.addEventListener(
      'click',
      (e) => {
        const b = (e.target as Element).closest<HTMLElement>('.m-seg button');
        if (!b) return;
        st[b.dataset.k as Key] = b.dataset.v ?? '';
        sync();
      },
      { signal },
    );
    tags?.addEventListener(
      'click',
      (e) => {
        const b = (e.target as Element).closest<HTMLElement>('.m-tag');
        if (!b) return;
        st[b.dataset.k as Key] = '';
        sync();
      },
      { signal },
    );
    qs<HTMLInputElement>(app, '#m-q')?.addEventListener(
      'input',
      (e) => {
        st.q = (e.target as HTMLInputElement).value;
        st.shown = 12;
        paint(false);
      },
      { signal },
    );
    qs<HTMLSelectElement>(app, '#m-sort')?.addEventListener(
      'change',
      (e) => {
        st.sort = (e.target as HTMLSelectElement).value as typeof st.sort;
        st.shown = 12;
        paint(false);
      },
      { signal },
    );
    more?.addEventListener(
      'click',
      () => {
        st.shown += 12;
        paint(true);
      },
      { signal },
    );
    sync();
    // Campaña: un cuadro por cada 1%
    const dEl = qs(app, '#m-dots');
    if (dEl) {
      const dots = qsa(dEl, 'i').slice(0, m.CAMPAIGN.pct);
      const light = () =>
        dots.forEach((d, k) => {
          const tm = setTimeout(() => d.classList.add('on'), motion.reduce ? 0 : 200 + k * 120);
          signal.addEventListener('abort', () => clearTimeout(tm));
        });
      if (typeof IntersectionObserver !== 'function') light();
      motion.observe(
        [dEl],
        (en, io) => {
          if (!en.isIntersecting) return;
          io.disconnect();
          light();
        },
        { threshold: 0.4 },
      );
      motion.countUp(qs(app, '#m-raised'), m.CAMPAIGN.raised, fmt);
    }
    motion.magnet(app);
  },
};
