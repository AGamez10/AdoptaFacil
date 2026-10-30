import { ledgerBlock } from '../engine/ledger';
import { COPY, EMPTY, type TplAnimal } from '../engine/model';
import {
  campaignArt,
  countPhrase,
  FACETS,
  fmt,
  ic,
  inCity,
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
  verb,
  type CatalogFilter,
} from '../engine/runtime';
import type { TemplateDesign } from '../engine/types';

const CSS = `
.tpl-estudio{--bg:#FBFBFD;--card:#FFFFFF;--ink:#1D1D1F;--soft:#6E6E73;--line:#E6E6EA;--tile:#F2F2F5;font-family:'Geist',system-ui,sans-serif;color:var(--ink);background:var(--bg);overflow-x:clip}
.tpl-estudio a{color:inherit}
.tpl-estudio .e-nav{position:sticky;top:var(--bar);z-index:30;background:color-mix(in srgb,var(--bg) 78%,transparent);backdrop-filter:saturate(180%) blur(20px);-webkit-backdrop-filter:saturate(180%) blur(20px);border-bottom:1px solid rgba(0,0,0,.06)}
.tpl-estudio .e-nav .w{display:flex;align-items:center;gap:24px;height:52px}
.tpl-estudio .e-nav .nm{font-weight:600;font-size:17px;letter-spacing:-.01em;margin-right:auto;display:flex;align-items:center;gap:8px;text-decoration:none}
.tpl-estudio .e-nav .nm svg{width:18px;color:var(--brand)}
.tpl-estudio .e-nav a.l{font-size:13px;text-decoration:none;color:var(--soft)}
.tpl-estudio .e-nav a.l:hover{color:var(--ink)}
.tpl-estudio .e-nav .cta{font-size:13px;font-weight:500;background:var(--brand);color:var(--brand-ink);padding:7px 14px;border-radius:999px;text-decoration:none}
@media (max-width:760px){.tpl-estudio .e-nav a.l{display:none}}
.tpl-estudio .e-pin{height:230vh;position:relative}
.tpl-estudio .e-stage{position:sticky;top:calc(var(--bar) + 52px);height:calc(100vh - var(--bar) - 52px);overflow:hidden;display:flex;flex-direction:column;align-items:center}
.tpl-estudio .e-hl{text-align:center;padding-top:clamp(24px,6vh,64px);will-change:transform,opacity;position:relative;z-index:2}
.tpl-estudio .e-eb{font-size:17px;font-weight:600;color:var(--brand)}
.tpl-estudio .e-h1{font-size:clamp(48px,8vw,128px);font-weight:700;letter-spacing:-.045em;line-height:.95;margin-top:10px}
.tpl-estudio .e-h1 span{background:linear-gradient(92deg,var(--ink) 20%,var(--brand) 60%,#B68CFF);-webkit-background-clip:text;background-clip:text;color:transparent}
.tpl-estudio .e-lead{margin-top:16px;font-size:clamp(17px,1.6vw,21px);color:var(--soft);line-height:1.45}
.tpl-estudio .e-media{position:absolute;left:50%;top:0;width:100%;height:100%;transform-origin:50% 0;will-change:transform,border-radius;overflow:hidden;display:grid;grid-template-columns:repeat(5,1fr);gap:0}
.tpl-estudio .e-media{background:radial-gradient(70% 60% at 50% 60%,color-mix(in srgb,var(--brand) 26%,#fff),#EEECE7 75%)}
.tpl-estudio .e-media > div{position:relative;display:flex;align-items:flex-end}
.tpl-estudio .e-media > div .portrait{height:auto;aspect-ratio:1/1}
.tpl-estudio .e-media .portrait{transition:transform 1.2s}
.tpl-estudio .e-cap{position:absolute;left:0;right:0;top:14%;z-index:3;text-align:center;color:var(--ink);opacity:0;will-change:opacity,transform;padding:0 16px}
.tpl-estudio .e-cap p{font-size:clamp(28px,4.4vw,64px);font-weight:700;letter-spacing:-.035em;line-height:1.02;}
.tpl-estudio .e-cap a{display:inline-flex;align-items:center;gap:8px;margin-top:22px;background:var(--ink);color:#fff;padding:14px 24px;border-radius:999px;font-weight:600;text-decoration:none;font-size:16px}
.tpl-estudio .e-cap a svg{width:16px}
.tpl-estudio .e-veil{position:absolute;inset:0;background:linear-gradient(180deg,rgba(255,255,255,.7),transparent 45%);opacity:0;z-index:2;pointer-events:none}
@media (max-width:760px){.tpl-estudio .e-media{grid-template-columns:repeat(3,1fr)}.tpl-estudio .e-media > div:nth-child(n+4){display:none}.tpl-estudio .e-pin{height:200vh}}

.tpl-estudio .e-sec{padding-block:110px}
.tpl-estudio .e-h2{font-size:clamp(38px,5vw,72px);font-weight:700;letter-spacing:-.04em;line-height:1}
.tpl-estudio .e-h2 small{display:block;font-size:.42em;color:var(--soft);font-weight:500;letter-spacing:-.02em;margin-top:12px;line-height:1.3}
.tpl-estudio .e-bento{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));grid-auto-rows:minmax(200px,auto);gap:16px;margin-top:48px}
.tpl-estudio .e-t{background:var(--card);border-radius:28px;padding:28px;box-shadow:0 0 0 1px rgba(0,0,0,.04),0 20px 40px -32px rgba(0,0,0,.3);position:relative;overflow:hidden;display:flex;flex-direction:column}
.tpl-estudio .e-t .k{font-size:14px;font-weight:600;color:var(--soft)}
.tpl-estudio .e-t .big{font-size:clamp(64px,8vw,132px);font-weight:700;letter-spacing:-.06em;line-height:.9;margin-top:auto;font-variant-numeric:tabular-nums}
.tpl-estudio .e-t .mid{font-size:44px;font-weight:700;letter-spacing:-.04em;line-height:1;font-variant-numeric:tabular-nums}
.tpl-estudio .e-t p{color:var(--soft);font-size:15px;line-height:1.5}
.tpl-estudio .t-total{grid-column:span 3;grid-row:span 2;background:var(--ink);color:#fff}
.tpl-estudio .t-total .k{color:rgba(255,255,255,.6)}
.tpl-estudio .t-total .faces{position:absolute;right:-30px;top:-30px;display:grid;grid-template-columns:repeat(6,46px);gap:6px;transform:rotate(-10deg);opacity:.9}
.tpl-estudio .t-total .faces span{width:46px;height:46px;border-radius:14px;overflow:hidden}
.tpl-estudio .t-split{grid-column:span 3}
.tpl-estudio .t-split .bar{display:flex;height:56px;border-radius:16px;overflow:hidden;margin-top:auto;gap:4px}
.tpl-estudio .t-split .bar i{display:flex;align-items:center;padding:0 16px;color:#fff;font-style:normal;font-weight:600;font-size:15px;width:0;transition:width 1.6s cubic-bezier(.2,.8,.2,1);white-space:nowrap;overflow:hidden}
.tpl-estudio .t-split .bar i:first-child{background:var(--brand)}
.tpl-estudio .t-split .bar i:last-child{background:#B68CFF}
.tpl-estudio .t-split .lg{display:flex;justify-content:space-between;margin-top:10px;font-size:14px;color:var(--soft)}
.tpl-estudio .t-age{grid-column:span 3}
.tpl-estudio .t-age .hist{display:flex;align-items:flex-end;gap:10px;height:120px;margin-top:auto}
.tpl-estudio .t-age .hist div{flex:1;display:flex;flex-direction:column;align-items:center;gap:6px;height:100%;justify-content:flex-end}
.tpl-estudio .t-age .hist i{width:100%;border-radius:10px 10px 4px 4px;background:color-mix(in srgb,var(--brand) 22%,var(--tile));height:0;transition:height 1.4s cubic-bezier(.2,.8,.2,1);position:relative}
.tpl-estudio .t-age .hist i::after{content:attr(data-n);position:absolute;top:-22px;left:0;right:0;text-align:center;font-size:13px;font-weight:600;color:var(--ink)}
.tpl-estudio .t-age .hist div:hover i,.tpl-estudio .t-age .hist div.pk i{background:var(--brand)}
.tpl-estudio .t-age .hist span{font-size:12px;color:var(--soft)}
.tpl-estudio .t-new{grid-column:span 2}
.tpl-estudio .t-new .av{display:flex;margin-top:auto}
.tpl-estudio .t-new .av span{width:52px;height:52px;border-radius:50%;overflow:hidden;box-shadow:0 0 0 3px var(--card);margin-left:-12px}
.tpl-estudio .t-new .av span:first-child{margin-left:0}
.tpl-estudio .t-camp{grid-column:span 2;align-items:flex-start}
.tpl-estudio .t-camp .ring{width:110px;height:110px;margin-top:auto;position:relative}
.tpl-estudio .t-camp .ring svg{width:100%;height:100%;transform:rotate(-90deg)}
.tpl-estudio .t-camp .ring b{position:absolute;inset:0;display:grid;place-items:center;font-size:24px;font-weight:700}
.tpl-estudio .t-camp .ring circle:last-child{transition:stroke-dashoffset 2s cubic-bezier(.2,.8,.2,1)}
.tpl-estudio .t-wait{grid-column:span 2;padding:0;flex-direction:row}
.tpl-estudio .t-wait .ph{width:44%}
.tpl-estudio .t-wait .bd{padding:24px;display:flex;flex-direction:column;gap:6px;flex:1}
.tpl-estudio .t-seal{grid-column:span 6;grid-row:auto;flex-direction:row;align-items:center;gap:28px;flex-wrap:wrap;min-height:0;padding:24px 28px}
.tpl-estudio .t-seal span{display:inline-flex;align-items:center;gap:8px;font-weight:500;font-size:15px}
.tpl-estudio .t-seal svg{width:18px;color:var(--brand)}
@media (max-width:980px){.tpl-estudio .e-bento{grid-template-columns:repeat(2,minmax(0,1fr))}.tpl-estudio .t-total,.tpl-estudio .t-split,.tpl-estudio .t-age,.tpl-estudio .t-seal{grid-column:span 2}.tpl-estudio .t-new,.tpl-estudio .t-camp,.tpl-estudio .t-wait{grid-column:span 2}.tpl-estudio .t-total{grid-row:span 1;min-height:320px}}

.tpl-estudio .e-row{margin-top:64px}
.tpl-estudio .e-row header{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;margin-bottom:18px}
.tpl-estudio .e-row h3{font-size:28px;font-weight:700;letter-spacing:-.03em}
.tpl-estudio .e-row h3 small{font-size:16px;color:var(--soft);font-weight:500;margin-left:10px;letter-spacing:0}
.tpl-estudio .e-arr{display:flex;gap:8px}
.tpl-estudio .e-arr button{width:40px;height:40px;border-radius:50%;border:0;background:var(--tile);cursor:pointer;display:grid;place-items:center;transition:background .2s}
.tpl-estudio .e-arr button:hover{background:var(--line)}
.tpl-estudio .e-arr svg{width:16px}
.tpl-estudio .e-track{display:flex;gap:16px;overflow-x:auto;scroll-snap-type:x mandatory;scrollbar-width:none;padding-bottom:30px;margin-bottom:-30px;scroll-padding-left:max(16px,calc((100vw - 1320px)/2 + 40px));padding-left:max(16px,calc((100vw - 1320px)/2 + 40px));padding-right:40px}
.tpl-estudio .e-track::-webkit-scrollbar{display:none}
.tpl-estudio .e-c{flex:0 0 clamp(200px,20vw,260px);scroll-snap-align:start;border:0;padding:0;background:transparent;text-align:left;cursor:pointer}
.tpl-estudio .e-c .ph{aspect-ratio:4/5;border-radius:24px;overflow:hidden;transition:transform .5s cubic-bezier(.2,.8,.2,1),box-shadow .5s;box-shadow:0 0 0 1px rgba(0,0,0,.04)}
.tpl-estudio .e-c:hover .ph{transform:translateY(-6px) scale(1.02);box-shadow:0 30px 50px -30px rgba(0,0,0,.5)}
.tpl-estudio .e-c b{display:block;margin-top:12px;font-size:17px;font-weight:600}
.tpl-estudio .e-c span{font-size:14px;color:var(--soft)}

.tpl-estudio .e-cat{background:var(--card);border-top:1px solid var(--line)}
.tpl-estudio .e-ctrl{display:flex;flex-wrap:wrap;gap:12px;align-items:center;margin-top:36px}
.tpl-estudio .e-seg{display:inline-flex;background:var(--tile);border-radius:12px;padding:3px;position:relative}
.tpl-estudio .e-seg button{position:relative;z-index:1;border:0;background:transparent;font-weight:500;font-size:14px;min-height:38px;padding:0 18px;border-radius:9px;cursor:pointer;color:var(--soft)}
.tpl-estudio .e-seg button[aria-pressed="true"]{color:var(--ink)}
.tpl-estudio .e-seg .pill{position:absolute;top:3px;bottom:3px;border-radius:9px;background:var(--card);box-shadow:0 2px 8px rgba(0,0,0,.1);transition:left .35s cubic-bezier(.2,.8,.2,1),width .35s cubic-bezier(.2,.8,.2,1)}
.tpl-estudio .e-sel{min-height:44px;border-radius:12px;border:0;background:var(--tile);padding:0 14px;font-size:14px;font-weight:500}
.tpl-estudio .e-srch{flex:1 1 220px;display:flex;align-items:center;gap:8px;min-height:44px;border-radius:12px;background:var(--tile);padding:0 14px}
.tpl-estudio .e-srch svg{width:17px;color:var(--soft)}
.tpl-estudio .e-srch input{border:0;background:transparent;outline:0;width:100%;font-size:14px}
.tpl-estudio .e-count{font-size:14px;color:var(--soft);margin-left:auto}
.tpl-estudio .e-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:24px 18px;margin-top:28px}
.tpl-estudio .e-grid .e-c{flex:auto;animation:eIn .6s cubic-bezier(.2,.8,.2,1) both;animation-delay:var(--d,0ms)}
@keyframes eIn{from{opacity:0;transform:translateY(20px)}}
@media (max-width:1100px){.tpl-estudio .e-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}
@media (max-width:640px){.tpl-estudio .e-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:18px 12px}.tpl-estudio .e-count{margin-left:0;width:100%}}
.tpl-estudio .e-more{display:flex;justify-content:center;margin-top:44px}
.tpl-estudio .e-more button{min-height:50px;padding:0 26px;border-radius:999px;border:0;background:var(--ink);color:#fff;font-weight:500;font-size:15px;cursor:pointer}
.tpl-estudio .e-ftr{background:var(--tile);color:var(--soft);font-size:12px;padding-block:28px 40px}
.tpl-estudio .e-ftr .w{display:flex;flex-wrap:wrap;gap:12px 28px;justify-content:space-between}

.tpl-estudio .e-tbar{background:var(--tile);font-size:13px;color:var(--soft)}
.tpl-estudio .e-tbar .w{display:flex;flex-wrap:wrap;align-items:center;gap:6px 22px;padding-block:10px}
.tpl-estudio .e-tbar svg{width:18px;color:var(--brand)}
.tpl-estudio .e-tbar b{color:var(--ink);font-weight:600}
.tpl-estudio .e-tbar .ac{margin-left:auto}
.tpl-estudio .e-acts{display:flex;flex-wrap:wrap;justify-content:center;gap:10px;margin-top:22px}
.tpl-estudio .e-acts a{min-height:44px;display:inline-flex;align-items:center;padding:0 20px;border-radius:999px;background:var(--tile);color:var(--ink);text-decoration:none;font-weight:500;font-size:15px}
.tpl-estudio .e-acts a.p{background:var(--brand);color:var(--brand-ink)}
.tpl-estudio .e-acts p{width:100%;font-size:12px;color:var(--soft)}
.tpl-estudio .t-seal span.off svg{color:var(--soft)}
.tpl-estudio .e-empty{margin-top:28px;padding:32px;border-radius:24px;background:var(--tile);color:var(--soft);font-size:17px;line-height:1.55}
.tpl-estudio .e-needs{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px;margin-top:44px}
.tpl-estudio .e-need{background:var(--card);border-radius:28px;padding:26px;box-shadow:0 0 0 1px rgba(0,0,0,.04),0 20px 40px -32px rgba(0,0,0,.3);display:flex;flex-direction:column;gap:12px}
.tpl-estudio .e-need .k{font-size:13px;font-weight:600;color:var(--brand)}
.tpl-estudio .e-need b{font-size:22px;font-weight:700;letter-spacing:-.02em;line-height:1.15}
.tpl-estudio .e-prog{height:8px;border-radius:8px;background:var(--tile);overflow:hidden;margin-top:auto}
.tpl-estudio .e-prog i{display:block;height:100%;width:0;border-radius:8px;background:var(--brand);transition:width 1.6s cubic-bezier(.2,.8,.2,1)}
.tpl-estudio .e-need p{font-size:14px;color:var(--soft);display:flex;justify-content:space-between}
.tpl-estudio .e-need strong{color:var(--ink);font-weight:600}
.tpl-estudio .e-need a{font-size:14px;font-weight:500;color:var(--brand);text-decoration:none}
@media (max-width:1000px){.tpl-estudio .e-needs{grid-template-columns:repeat(2,minmax(0,1fr))}}
.tpl-estudio .e-store{background:var(--tile)}
.tpl-estudio .e-prods{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px;margin-top:44px}
.tpl-estudio .e-prod{background:var(--card);border-radius:28px;padding:22px;text-decoration:none;display:flex;flex-direction:column;align-items:center;text-align:center;gap:4px;transition:transform .5s cubic-bezier(.2,.8,.2,1),box-shadow .5s}
.tpl-estudio .e-prod:hover{transform:scale(1.02);box-shadow:0 30px 50px -30px rgba(0,0,0,.35)}
.tpl-estudio .e-prod .ph{width:80%;aspect-ratio:1/1;margin-bottom:10px}
.tpl-estudio .e-prod .k{font-size:12px;color:var(--brand);font-weight:600}
.tpl-estudio .e-prod b{font-size:20px;font-weight:600;letter-spacing:-.02em}
.tpl-estudio .e-prod .pr{font-size:15px;color:var(--soft)}
.tpl-estudio .e-prod .buy{margin-top:12px;font-size:13px;font-weight:500;background:var(--ink);color:#fff;padding:8px 16px;border-radius:999px}
@media (max-width:1000px){.tpl-estudio .e-prods,.tpl-estudio .e-needs{grid-template-columns:repeat(2,minmax(0,1fr))}}
.tpl-estudio .e-help{background:#000;color:#F5F5F7;text-align:center;padding-block:140px}
.tpl-estudio .e-help h2{font-size:clamp(44px,6.4vw,104px);font-weight:700;letter-spacing:-.05em;line-height:.98;background:linear-gradient(180deg,#fff 30%,#86868B);-webkit-background-clip:text;background-clip:text;color:transparent}
.tpl-estudio .e-help p{font-size:clamp(17px,1.6vw,22px);color:#A1A1A6;max-width:30em;margin:22px auto 0;line-height:1.45}
.tpl-estudio .e-help a{display:inline-flex;align-items:center;gap:8px;margin-top:34px;background:var(--brand);color:var(--brand-ink);padding:16px 28px;border-radius:999px;font-weight:500;text-decoration:none;font-size:17px}
.tpl-estudio .e-help a svg{width:16px}
.tpl-estudio .e-about{display:grid;grid-template-columns:minmax(0,.8fr) minmax(0,1.2fr);gap:48px}
.tpl-estudio .e-about p{font-size:clamp(20px,2vw,28px);line-height:1.4;letter-spacing:-.015em;color:var(--ink)}
.tpl-estudio .e-badges{display:flex;flex-wrap:wrap;gap:8px;margin-top:22px}
.tpl-estudio .e-badges span{display:inline-flex;align-items:center;gap:6px;background:var(--tile);border-radius:999px;padding:8px 14px;font-size:14px}
.tpl-estudio .e-badges svg{width:15px;color:var(--brand)}
.tpl-estudio .e-badges span.off svg{color:var(--soft)}
@media (max-width:860px){.tpl-estudio .e-about{grid-template-columns:minmax(0,1fr);gap:18px}}
.tpl-estudio .e-rh{display:flex;justify-content:space-between;align-items:flex-end;gap:16px 30px;flex-wrap:wrap}
.tpl-estudio .e-link{display:inline-flex;align-items:center;gap:6px;font-size:17px;color:var(--brand);text-decoration:none;background:none;border:0;cursor:pointer;font-weight:500;padding:0}
.tpl-estudio .e-link svg{width:15px}
.tpl-estudio .e-revs{display:flex;gap:16px;overflow-x:auto;scroll-snap-type:x mandatory;scrollbar-width:none;margin-top:40px;padding-left:max(16px,calc((100vw - 1320px)/2 + 40px));padding-right:40px;scroll-padding-left:max(16px,calc((100vw - 1320px)/2 + 40px))}
.tpl-estudio .e-revs::-webkit-scrollbar{display:none}
.tpl-estudio .e-rev{flex:0 0 min(420px,82vw);scroll-snap-align:start;margin:0;background:var(--card);border-radius:28px;padding:30px;box-shadow:0 0 0 1px rgba(0,0,0,.04);display:flex;flex-direction:column;gap:14px}
.tpl-estudio .e-rev .st{color:var(--ink);letter-spacing:2px}
.tpl-estudio .e-rev blockquote{margin:0;font-size:21px;line-height:1.4;letter-spacing:-.015em}
.tpl-estudio .e-rev figcaption{font-size:14px;color:var(--soft);margin-top:auto}
.tpl-estudio .e-ledger{margin-top:36px;background:var(--card);border-radius:28px;box-shadow:0 0 0 1px rgba(0,0,0,.04);overflow:hidden}
.tpl-estudio .e-lsum{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));border-bottom:1px solid var(--line)}
.tpl-estudio .e-lsum div{padding:24px 28px}
.tpl-estudio .e-lsum div + div{border-left:1px solid var(--line)}
.tpl-estudio .e-lsum span{font-size:13px;color:var(--soft)}
.tpl-estudio .e-lsum b{display:block;font-size:clamp(22px,2.6vw,36px);font-weight:700;letter-spacing:-.03em}
.tpl-estudio .e-tw{overflow-x:auto}
.tpl-estudio .e-ledger table{width:100%;border-collapse:collapse;font-size:15px}
.tpl-estudio .e-ledger th,.tpl-estudio .e-ledger td{text-align:left;padding:16px 28px;border-bottom:1px solid var(--line)}
.tpl-estudio .e-ledger tr:last-child td{border-bottom:0}
.tpl-estudio .e-ledger th{font-size:12px;font-weight:500;color:var(--soft)}
.tpl-estudio .e-ledger .num{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
.tpl-estudio .e-ledger .lk{font-size:12px;padding:4px 10px;border-radius:999px;background:var(--tile)}
@media (max-width:700px){.tpl-estudio .e-lsum{grid-template-columns:minmax(0,1fr)}.tpl-estudio .e-lsum div + div{border-left:0;border-top:1px solid var(--line)}}
.tpl-estudio .e-contact{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.3fr);gap:0;border-radius:28px;overflow:hidden;background:var(--card);box-shadow:0 0 0 1px rgba(0,0,0,.04)}
.tpl-estudio .e-contact .info{padding:clamp(24px,4vw,52px);display:flex;flex-direction:column;gap:22px}
.tpl-estudio .e-contact dl{margin:0;display:flex;flex-direction:column;gap:16px}
.tpl-estudio .e-contact dt{font-size:13px;color:var(--soft)}
.tpl-estudio .e-contact dd{margin:4px 0 0;font-size:19px;font-weight:500;letter-spacing:-.01em}
.tpl-estudio .e-contact .map{min-height:380px}
@media (max-width:860px){.tpl-estudio .e-contact{grid-template-columns:minmax(0,1fr)}.tpl-estudio .e-contact .map{min-height:220px}}
.tpl-estudio .e-soc{display:flex!important;justify-content:space-between;align-items:center;gap:14px;padding-bottom:22px;margin-bottom:22px;border-bottom:1px solid var(--line)}
.tpl-estudio .e-soc p{font-size:14px;color:var(--soft)}
.tpl-estudio .e-soc > div{display:flex;gap:8px}
.tpl-estudio .e-soc a{width:40px;height:40px;border-radius:50%;background:var(--card);display:grid;place-items:center;color:var(--ink);box-shadow:0 0 0 1px var(--line)}
.tpl-estudio .e-soc a:hover{color:var(--brand)}
.tpl-estudio .e-soc svg{width:18px}
.tpl-estudio .ldg{border:0;padding:0;background:transparent;width:min(980px,calc(100vw - 24px));max-width:none}
.tpl-estudio .ldg::backdrop{background:rgba(0,0,0,.4);backdrop-filter:blur(20px)}
.tpl-estudio .ldg-in{background:var(--card);border-radius:28px;padding:40px;position:relative;max-height:calc(100vh - 24px);overflow:auto;animation:ePop .5s cubic-bezier(.2,.8,.2,1)}
.tpl-estudio .ldg-k{font-size:14px;font-weight:600;color:var(--brand)}
.tpl-estudio .ldg-t{font-size:44px;font-weight:700;letter-spacing:-.04em}
.tpl-estudio .ldg-d{color:var(--soft)}
.tpl-estudio .ldg-sum{display:flex;gap:30px;flex-wrap:wrap;margin-top:20px}
.tpl-estudio .ldg-sum span{display:block;font-size:13px;color:var(--soft)}
.tpl-estudio .ldg-sum b{font-size:28px;font-weight:700;letter-spacing:-.03em}
.tpl-estudio .ldg-tw{overflow-x:auto;margin-top:20px}
.tpl-estudio .ldg table{width:100%;border-collapse:collapse;font-size:14px}
.tpl-estudio .ldg th,.tpl-estudio .ldg td{text-align:left;padding:12px 10px;border-bottom:1px solid var(--line)}
.tpl-estudio .ldg th{font-size:12px;color:var(--soft);font-weight:500}
.tpl-estudio .ldg .num{text-align:right;white-space:nowrap}
.tpl-estudio .ldg .lk{font-size:12px;padding:4px 10px;border-radius:999px;background:var(--tile)}
.tpl-estudio .ldg-x{position:absolute;top:16px;right:16px;width:40px;height:40px;border-radius:50%;border:0;background:var(--tile);cursor:pointer;display:grid;place-items:center}
.tpl-estudio .ldg-x svg{width:16px}

.tpl-estudio dialog.sheet{border:0;padding:0;background:transparent;width:min(980px,calc(100vw - 24px));max-width:none}
.tpl-estudio dialog.sheet::backdrop{background:rgba(0,0,0,.4);backdrop-filter:blur(20px)}
.tpl-estudio .sh-in{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);background:var(--card);border-radius:28px;overflow:hidden;position:relative;animation:ePop .5s cubic-bezier(.2,.8,.2,1)}
@keyframes ePop{from{opacity:0;transform:translateY(30px) scale(.98)}}
.tpl-estudio .sh-ph{aspect-ratio:4/5}
.tpl-estudio .sh-bd{padding:40px;display:flex;flex-direction:column;gap:14px}
.tpl-estudio .sh-k{font-size:14px;font-weight:600;color:var(--brand)}
.tpl-estudio .sh-n{font-size:56px;font-weight:700;letter-spacing:-.045em;line-height:1}
.tpl-estudio .sh-dl{display:grid;grid-template-columns:1fr 1fr;gap:0;margin:8px 0 0;border-top:1px solid var(--line)}
.tpl-estudio .sh-dl div{padding:12px 0;border-bottom:1px solid var(--line)}
.tpl-estudio .sh-dl dt{font-size:12px;color:var(--soft)}
.tpl-estudio .sh-dl dd{margin:2px 0 0;font-weight:500;font-size:16px}
.tpl-estudio .sh-act{display:flex;gap:10px;margin-top:auto;flex-wrap:wrap}
.tpl-estudio .sh-b1,.tpl-estudio .sh-b2{min-height:48px;padding:0 22px;display:inline-flex;align-items:center;border-radius:999px;text-decoration:none;font-weight:500}
.tpl-estudio .sh-b1{background:var(--brand);color:var(--brand-ink)}
.tpl-estudio .sh-b2{background:var(--tile)}
.tpl-estudio .sh-x{position:absolute;top:16px;right:16px;width:40px;height:40px;border-radius:50%;border:0;background:var(--tile);cursor:pointer;display:grid;place-items:center;z-index:2}
.tpl-estudio .sh-x svg{width:16px}
@media (max-width:720px){.tpl-estudio .sh-in{grid-template-columns:minmax(0,1fr);max-height:calc(100vh - 24px);overflow:auto}.tpl-estudio .sh-ph{aspect-ratio:1/1}.tpl-estudio .sh-bd{padding:24px}.tpl-estudio .sh-n{font-size:42px}}

@media (max-width:560px){.tpl-estudio .e-needs{grid-template-columns:minmax(0,1fr)}.tpl-estudio .e-ledger table{min-width:600px}}
.tpl-estudio .e-ledger td:first-child{white-space:nowrap}
.tpl-estudio a.e-c,.tpl-estudio a.t-wait{text-decoration:none;color:inherit}
.tpl-estudio .e-media > div.solo{grid-column:1/-1;position:relative;min-height:100%}
.tpl-estudio .t-camp a{font-weight:700;color:var(--brand);text-decoration:none;margin-top:10px;display:inline-flex;gap:6px;align-items:center}
.tpl-estudio .t-camp a svg{width:16px}
.tpl-estudio .e-contact.nomap{grid-template-columns:minmax(0,1fr)}
.tpl-estudio .e-contact .map{position:relative}
.tpl-estudio .e-contact .map iframe{position:absolute;inset:0}
.tpl-estudio .e-nav .nm .tpl-logo-img{width:22px;height:22px;border-radius:6px;object-fit:cover}
`;

export const estudio: TemplateDesign = {
  id: 'estudio',
  fonts: 'family=Geist:wght@300;400;500;600;700;800',
  css: CSS,
  html(m, KIT) {
    const { ORG, CAMPAIGN, ANIMALS, SHOW, BADGES, NEEDS, PRODUCTS, REVIEWS, COUNTS } = m;
    const n = COUNTS.total;
    // Retratos del hero: primero los que tienen foto real.
    const strip = [...ANIMALS]
      .sort((a, b) => Number(Boolean(b.photo)) - Number(Boolean(a.photo)))
      .slice(0, 5);
    const stages = (['Cachorro', 'Gatito', 'Joven', 'Adulto', 'Senior'] as const)
      .map((s) => [s, ANIMALS.filter((a) => a.stage === s).length] as const)
      .filter(([, c]) => c > 0);
    const mx = Math.max(0, ...stages.map((x) => x[1]));
    const fresh = ANIMALS.filter((a) => a.isNew);
    const wait = [...ANIMALS].filter((a) => a.days > 0).sort((a, b) => b.days - a.days)[0];
    const C = 2 * Math.PI * 46;
    const by = (f: (a: TplAnimal) => boolean) => ANIMALS.filter(f);
    const rows = (
      [
        ['Recién publicados', fresh],
        [
          'Cachorros y gatitos',
          by((a) => a.hasAge && a.months < 12).sort((a, b) => a.months - b.months),
        ],
        [
          'Seniors que lo dan todo',
          by((a) => a.stage === 'Senior').sort((a, b) => b.months - a.months),
        ],
        ['Grandes de corazón y de tamaño', by((a) => a.size === 'Grande')],
        [
          'Los que más esperan',
          [...ANIMALS]
            .filter((a) => a.days > 90)
            .sort((a, b) => b.days - a.days)
            .slice(0, 14),
        ],
      ] as Array<[string, TplAnimal[]]>
    ).filter(([, L]) => L.length > 0);
    const card = (a: TplAnimal) =>
      `<a class="e-c" href="${a.href}"><div class="ph">${portrait(a, { decor: true })}</div><b>${a.name}</b><span>${a.spLabel} · ${a.age}</span></a>`;
    const pct = (x: number) => (n ? Math.round((x / n) * 100) : 0);
    const split = [
      [COUNTS.perros, 'perros'],
      [COUNTS.gatos, 'gatos'],
      [COUNTS.otros, 'otros'],
    ].filter(([c]) => Number(c) > 0) as Array<[number, string]>;
    const t = KIT.transparencyParts();
    const map = mapEmbed(m);
    const spOpts = FACETS.sp.filter(([v]) => ANIMALS.some((a) => a.sp === v));
    const sizeOpts = FACETS.size.filter(([v]) => ANIMALS.some((a) => a.size === v));
    const stageOpts = FACETS.stage.filter(([v]) => ANIMALS.some((a) => a.stage === v));
    const eb = [ORG.type, ORG.city, ...BADGES.map((b) => b.t)].filter(Boolean).join(' · ');
    const seals = [
      ...BADGES.map(
        (b) => `<span class="${b.ok ? '' : 'off'}">${b.ok ? ic.check : ic.clock}${b.t}</span>`,
      ),
      SHOW.transparencia ? `<span>${ic.shield}Formalización ${ORG.formalization}%</span>` : '',
    ].join('');
    return `
<nav class="e-nav" aria-label="Principal"><div class="w"><a class="nm" href="#e-pin">${ORG.logo ? logoMark(m) : ic.paw}${ORG.short}</a><a class="l" href="#e-cifras">Cifras</a>${rows.length ? '<a class="l" href="#e-filas">Explorar</a>' : ''}<a class="l" href="#e-cat">Catálogo</a><a class="cta" href="${ORG.donateHref}">Donar</a></div></nav>
${SHOW.transparencia ? `<div class="e-tbar" data-sec="transparencia" role="group" aria-label="Transparencia"><div class="w">${ic.shield}<span><b>${t.level}</b></span><span>Formalización ${ORG.formalization}%</span><span>${t.accountability}</span><span class="ac">${t.note}</span></div></div>` : ''}
<section class="e-pin" id="e-pin">
  <div class="e-stage">
    <div class="e-hl" id="e-hl">${eb ? `<p class="e-eb">${eb}</p>` : ''}<h1 class="e-h1">${n > 1 ? `Conoce a <span>los ${n}.</span>` : n === 1 ? `Conoce a <span>${ANIMALS[0].name}.</span>` : `<span>${ORG.name}</span>`}</h1><p class="e-lead">${n ? 'Cada uno con nombre, carácter y un lugar esperándolo.' : ORG.lede || EMPTY.animales}</p><div class="e-acts" data-sec="acciones"><a class="p" href="#e-cat">Adoptar</a><a href="${rows.length ? '#e-filas' : '#e-cat'}">Apadrinar</a><a href="${ORG.donateHref}">Donar</a><p>${COPY.adoptNote}</p></div></div>
    <div class="e-media" id="e-media"${strip.length && strip.length < 5 ? ` style="grid-template-columns:repeat(${strip.length},1fr)"` : ''}>${strip.length ? strip.map((a, i) => `<div>${portrait(a, { decor: i > 0, dx: 0, dy: 0, s: 1, bare: true })}</div>`).join('') : `<div class="solo">${campaignArt(m)}</div>`}<span class="e-veil" id="e-veil"></span></div>
    <div class="e-cap" id="e-cap"><p>Adoptar empieza por<br>conocerse.</p><a href="${rows.length ? '#e-filas' : '#e-cat'}">Explorar ahora ${ic.arrow}</a></div>
  </div>
</section>
<section class="w e-sec" id="e-cifras">
  <h2 class="e-h2">En cifras.<small>Calculadas con los animales que publicó la organización.</small></h2>
  <div class="e-bento">
    <div class="e-t t-total">${
      ANIMALS.length > 4
        ? `<span class="faces" aria-hidden="true">${ANIMALS.slice(4, 34)
            .map((a) => `<span>${portrait(a, { decor: true, dx: 6, dy: 14, s: 1.1 })}</span>`)
            .join('')}</span>`
        : ''
    }<span class="k">En adopción ahora</span><span class="big" id="e-tot">${n}</span><p style="color:rgba(255,255,255,.6);margin-top:10px">${n ? `${countPhrase(m).replace(/^\d+ /, '')} ${verb(m, 'espera', 'esperan')} hogar${inCity(m)}.` : EMPTY.animales}</p></div>
    ${split.length ? `<div class="e-t t-split"><span class="k">${split.map(([, l]) => l[0].toUpperCase() + l.slice(1)).join(' y ')}</span><div class="bar">${split.map(([c, l]) => `<i data-w="${c}">${c} ${l}</i>`).join('')}</div><div class="lg">${split.map(([c]) => `<span>${pct(c)}%</span>`).join('')}</div></div>` : ''}
    ${mx ? `<div class="e-t t-age"><span class="k">Por etapa de vida</span><div class="hist">${stages.map(([s, c]) => `<div class="${c === mx ? 'pk' : ''}"><i data-h="${(c / mx) * 100}" data-n="${c}"></i><span>${s}</span></div>`).join('')}</div></div>` : ''}
    <div class="e-t t-new"><span class="k">Publicados en 14 días</span><span class="mid" style="margin-top:8px">${fresh.length}</span><div class="av">${fresh
      .slice(0, 6)
      .map((a) => `<span>${portrait(a, { decor: true, dx: 6, dy: 14, s: 1.1 })}</span>`)
      .join('')}</div></div>
    ${
      CAMPAIGN.active
        ? `<div class="e-t t-camp" data-sec="campana"><span class="k">Campaña activa · ${CAMPAIGN.title}</span><p style="margin-top:6px">${fmt(CAMPAIGN.raised)} de ${fmt(CAMPAIGN.goal)} · cierra ${CAMPAIGN.deadline}</p><div class="ring"><svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="46" fill="none" stroke="var(--tile)" stroke-width="8"/><circle cx="50" cy="50" r="46" fill="none" stroke="var(--brand)" stroke-width="8" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C}" id="e-ring"/></svg><b>${CAMPAIGN.pct}%</b></div><a href="${CAMPAIGN.href}">Ver campaña y aportar ${ic.arrow}</a>${KIT.moreCampaigns()}</div>`
        : `<div class="e-t t-camp" data-sec="campana"><span class="k">Campaña activa</span><p style="margin-top:8px">${EMPTY.campana}</p></div>`
    }
    ${wait ? `<a class="e-t t-wait" href="${wait.href}"><div class="ph">${portrait(wait, { decor: true })}</div><div class="bd"><span class="k">Publicado hace más tiempo</span><span class="mid" style="font-size:34px">${wait.name}</span><p>${sinceLabel(wait)}. ${wait.spLabel}, ${wait.age}.</p></div></a>` : ''}
    ${seals ? `<div class="e-t t-seal">${seals}</div>` : ''}
  </div>
</section>
${
  rows.length
    ? `<section id="e-filas" style="padding-bottom:110px">
  <div class="w"><h2 class="e-h2">Empieza por aquí.<small>Grupos cortos para no perderte entre ${n}.</small></h2></div>
  ${rows.map(([title, L], k) => `<div class="e-row"><header class="w"><h3>${title}<small>${L.length}</small></h3><div class="e-arr"><button type="button" data-r="${k}" data-d="-1" aria-label="Anterior">${ic.back}</button><button type="button" data-r="${k}" data-d="1" aria-label="Siguiente">${ic.arrow}</button></div></header><div class="e-track" data-track="${k}">${L.map(card).join('')}</div></div>`).join('')}
</section>`
    : ''
}
<section class="e-cat e-sec" id="e-cat" data-sec="animales">
  <div class="w"><h2 class="e-h2">Todo el catálogo.</h2>
  ${
    n
      ? `<div class="e-ctrl">${spOpts.length > 1 ? `<div class="e-seg" id="e-seg"><span class="pill"></span><button type="button" data-v="" aria-pressed="true">Todos</button>${spOpts.map(([v, l]) => `<button type="button" data-v="${v}" aria-pressed="false">${l}</button>`).join('')}</div>` : ''}
      ${sizeOpts.length > 1 ? `<label><span class="sr">Tamaño</span><select class="e-sel" id="e-size"><option value="">Todos los tamaños</option>${sizeOpts.map((o) => `<option value="${o[0]}">${o[1]}</option>`).join('')}</select></label>` : ''}
      ${stageOpts.length > 1 ? `<label><span class="sr">Etapa</span><select class="e-sel" id="e-stage"><option value="">Todas las edades</option>${stageOpts.map((o) => `<option value="${o[0]}">${o[1]}</option>`).join('')}</select></label>` : ''}
      <label><span class="sr">Orden</span><select class="e-sel" id="e-sort"><option value="recientes">Más recientes</option><option value="espera">Más tiempo publicados</option><option value="nombre">Nombre</option></select></label>
      <label class="e-srch"><span class="sr">Buscar</span>${ic.search}<input id="e-q" type="search" placeholder="Buscar" autocomplete="off"></label>
      <span class="e-count" id="e-count" aria-live="polite"></span></div>
    <div class="e-grid" id="e-grid"></div><div class="e-more"><button type="button" id="e-more">Mostrar más</button></div>`
      : `<p class="e-empty">${EMPTY.animales}</p>`
  }</div>
</section>
<section class="w e-sec" data-sec="necesidades">
  <h2 class="e-h2">Necesita hoy.<small>Del banco de recursos de la organización.</small></h2>
  ${NEEDS.length ? `<div class="e-needs">${NEEDS.map((nd) => `<article class="e-need">${nd.category ? `<span class="k">${nd.category}</span>` : ''}<b>${nd.title}</b><div class="e-prog"><i data-w="${nd.pct}"></i></div><p><strong>${nd.got}</strong> de ${nd.need} ${nd.unit}<span>${nd.pct}%</span></p><a href="${nd.href}">Ver y donar</a></article>`).join('')}</div>` : `<p class="e-empty">${EMPTY.necesidades}</p>`}
</section>
<section class="e-store" data-sec="productos"><div class="w e-sec">
  <h2 class="e-h2">Productos.<small>De la tienda solidaria de la organización.</small></h2>
  ${PRODUCTS.length ? `<div class="e-prods">${PRODUCTS.map((p) => `<a class="e-prod" href="${p.href}"><div class="ph">${productArt(p)}</div>${p.category ? `<span class="k">${p.category}</span>` : ''}<b>${p.name}</b><span class="pr">${fmt(p.price)}</span><span class="buy">Ver</span></a>`).join('')}</div>` : `<p class="e-empty">${EMPTY.productos}</p>`}
</div></section>
<section class="e-help" id="portal-help-cta" data-sec="ayuda"><div class="w"><h2>${COPY.helpTitle.replace(', ', ',<br>')}</h2><p>${COPY.helpText}</p><a href="${ORG.donateHref}" data-magnet>${COPY.helpCta} ${ic.arrow}</a></div></section>
${SHOW.nosotros ? `<section class="w e-sec" data-sec="nosotros"><div class="e-about"><h2 class="e-h2">Sobre nosotros.</h2><div><p>${ORG.about}</p>${BADGES.length ? `<div class="e-badges">${BADGES.map((b) => `<span class="${b.ok ? '' : 'off'}">${b.ok ? ic.check : ic.clock}${b.t}</span>`).join('')}</div>` : ''}</div></div></section>` : ''}
<section class="e-sec" data-sec="resenas" style="padding-top:0"><div class="w e-rh"><h2 class="e-h2">Reseñas.<small>Lo que dicen de la organización.</small></h2><button type="button" class="e-link" data-review>Registrar reseña ${ic.arrow}</button></div>
  ${REVIEWS.length ? `<div class="e-revs">${REVIEWS.map((r) => `<figure class="e-rev"><span class="st" aria-label="${r.rating} de 5">${stars(r.rating)}</span>${r.text ? `<blockquote>${r.text}</blockquote>` : ''}<figcaption>${r.name}${r.date ? ` · ${r.date}` : ''}</figcaption></figure>`).join('')}</div>` : `<div class="w"><p class="e-empty">${EMPTY.resenas}</p></div>`}
</section>
<section class="w e-sec" data-sec="libro" style="padding-top:0"><div class="e-rh"><h2 class="e-h2">${COPY.ledgerTitle}.<small>${COPY.ledgerText}</small></h2><button type="button" class="e-link" data-ledger>Ver libro completo ${ic.arrow}</button></div>
  ${ledgerBlock(m, 'e-empty')}
</section>
${SHOW.contacto ? `<section class="w e-sec" data-sec="contacto" style="padding-top:0"><div class="e-contact${map ? '' : ' nomap'}"><div class="info"><h2 class="e-h2" style="font-size:clamp(32px,3.4vw,52px)">Información de contacto.</h2>${KIT.contactRows()}${mapLink(m, 'e-link')}</div>${map ? `<div class="map">${map}</div>` : ''}</div></section>` : ''}
<footer class="e-ftr">${SHOW.redes ? `<div class="w e-soc" data-sec="redes"><p>${COPY.socialsText}</p><div>${m.SOCIALS.map((x) => socialLink(x, ic[x.key])).join('')}</div></div>` : ''}<div class="w"><span>${ORG.name}${ORG.place ? ` · ${ORG.place}` : ''}</span><span>Hecho con AdoptaFácil</span></div></footer>`;
  },
  init(app, env) {
    const { m, motion, catalog } = env;
    const { signal } = motion;
    // Hero que crece con el scroll
    const pin = qs(app, '#e-pin');
    const hl = qs(app, '#e-hl');
    const media = qs(app, '#e-media');
    const cap = qs(app, '#e-cap');
    const veil = qs(app, '#e-veil');
    if (pin && hl && media && cap && veil) {
      const set = () => {
        const r = pin.getBoundingClientRect();
        const span = pin.offsetHeight - innerHeight;
        const p = motion.reduce ? 1 : Math.min(1, Math.max(0, -r.top / Math.max(1, span * 0.75)));
        const e = 1 - Math.pow(1 - p, 3);
        const mob = innerWidth < 760;
        const s0 = mob ? 0.67 : 0.6;
        const sc = s0 + e * (1 - s0);
        const top = (mob ? 33 : 46) * (1 - e);
        media.style.transform = `translateX(-50%) translateY(${top}%) scale(${sc})`;
        media.style.borderRadius = `${(1 - e) * 44}px`;
        hl.style.opacity = String(1 - Math.min(1, p * 2.2));
        hl.style.transform = `translateY(${-p * 80}px) scale(${1 - p * 0.1})`;
        const k = Math.max(0, (p - 0.65) / 0.35);
        cap.style.opacity = String(k);
        cap.style.transform = `translateY(${(1 - k) * 30}px)`;
        veil.style.opacity = String(e);
        media.style.gap = `${(1 - e) * 10}px`;
      };
      set();
      addEventListener('scroll', set, { signal, passive: true });
      addEventListener('resize', set, { signal });
    }

    // Bento animado al entrar
    const total = Math.max(1, m.COUNTS.total);
    const enter = (el: HTMLElement) => {
      if (el.classList.contains('t-split'))
        qsa(el, 'i').forEach((i) => (i.style.width = (Number(i.dataset.w) / total) * 100 + '%'));
      if (el.classList.contains('t-age'))
        qsa(el, 'i').forEach((i, k) => {
          const tm = setTimeout(
            () => (i.style.height = i.dataset.h + '%'),
            motion.reduce ? 0 : k * 90,
          );
          signal.addEventListener('abort', () => clearTimeout(tm));
        });
      if (el.classList.contains('e-need')) {
        const b = qs(el, '.e-prog i');
        if (b) b.style.width = b.dataset.w + '%';
      }
      const ring = qs(el, '#e-ring');
      if (ring)
        ring.style.strokeDashoffset = String(
          2 * Math.PI * 46 * (1 - Math.max(0.02, m.CAMPAIGN.pct / 100)),
        );
    };
    const tiles = qsa(app, '.t-split,.t-age,.t-camp,.e-need');
    if (typeof IntersectionObserver !== 'function') tiles.forEach(enter);
    motion.observe(
      tiles,
      (en, io) => {
        if (!en.isIntersecting) return;
        io.unobserve(en.target);
        enter(en.target as HTMLElement);
      },
      { threshold: 0.35 },
    );
    motion.countUp(qs(app, '#e-tot'), m.COUNTS.total);
    motion.reveal(app, '.e-t', { stagger: 70, mod: 6 });

    // Filas
    qsa(app, '.e-arr button').forEach((b) =>
      b.addEventListener(
        'click',
        () => {
          const tr = qs(app, `[data-track="${b.dataset.r}"]`);
          tr?.scrollBy({
            left: Number(b.dataset.d) * tr.clientWidth * 0.8,
            behavior: motion.reduce ? 'auto' : 'smooth',
          });
        },
        { signal },
      ),
    );

    // Catálogo
    const grid = qs(app, '#e-grid');
    if (!grid) return;
    const st: CatalogFilter & { n: number } = {
      sp: '',
      size: '',
      stage: '',
      sort: 'recientes',
      q: '',
      n: 15,
    };
    const seg = qs(app, '#e-seg');
    const pill = seg ? qs(seg, '.pill') : null;
    const count = qs(app, '#e-count');
    const more = qs<HTMLButtonElement>(app, '#e-more');
    const movePill = () => {
      const b = seg ? qs(seg, '[aria-pressed="true"]') : null;
      if (!b || !pill) return;
      pill.style.left = b.offsetLeft + 'px';
      pill.style.width = b.offsetWidth + 'px';
    };
    const paint = (keep = false) => {
      const L = catalog.query(st);
      const shown = Math.min(st.n, L.length);
      const from = keep ? grid.children.length : 0;
      if (!keep) grid.innerHTML = '';
      grid.insertAdjacentHTML(
        'beforeend',
        L.slice(from, shown)
          .map(
            (a, k) =>
              `<a class="e-c" href="${a.href}" style="--d:${k * 35}ms"><div class="ph">${portrait(a, { decor: true })}</div><b>${a.name}</b><span>${a.spLabel} · ${a.age} · ${a.sizeLabel}</span></a>`,
          )
          .join(''),
      );
      if (!L.length)
        grid.innerHTML = `<p style="grid-column:1/-1;color:var(--soft);padding:40px 0">Sin resultados con esos filtros.</p>`;
      if (count)
        count.textContent = `${shown} de ${L.length} ${L.length === 1 ? 'animal' : 'animales'}`;
      if (more) {
        more.hidden = shown >= L.length;
        more.textContent = `Mostrar ${Math.min(15, L.length - shown)} más`;
      }
    };
    seg?.addEventListener(
      'click',
      (e) => {
        const b = (e.target as Element).closest<HTMLElement>('button');
        if (!b) return;
        qsa(seg, 'button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
        st.sp = b.dataset.v ?? '';
        st.n = 15;
        movePill();
        paint();
      },
      { signal },
    );
    (
      [
        ['#e-size', 'size'],
        ['#e-stage', 'stage'],
        ['#e-sort', 'sort'],
      ] as const
    ).forEach(([sel, k]) =>
      qs<HTMLSelectElement>(app, sel)?.addEventListener(
        'change',
        (e) => {
          const v = (e.target as HTMLSelectElement).value;
          if (k === 'sort') st.sort = v as CatalogFilter['sort'];
          else st[k] = v;
          st.n = 15;
          paint();
        },
        { signal },
      ),
    );
    qs<HTMLInputElement>(app, '#e-q')?.addEventListener(
      'input',
      (e) => {
        st.q = (e.target as HTMLInputElement).value;
        st.n = 15;
        paint();
      },
      { signal },
    );
    more?.addEventListener(
      'click',
      () => {
        st.n += 15;
        paint(true);
      },
      { signal },
    );
    paint();
    requestAnimationFrame(movePill);
    addEventListener('resize', movePill, { signal });
    void document.fonts?.ready.then(() => {
      if (!signal.aborted) movePill();
    });
  },
};
