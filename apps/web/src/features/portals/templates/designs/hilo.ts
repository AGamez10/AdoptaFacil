import { ledgerBlock } from '../engine/ledger';
import { COPY, EMPTY, type TplAnimal } from '../engine/model';
import {
  availLine,
  campaignArt,
  fmt,
  ic,
  mapEmbed,
  mapLink,
  paw,
  portrait,
  productArt,
  qs,
  qsa,
  socialLink,
  stars,
} from '../engine/runtime';
import { unesc } from '../engine/safe';
import type { TemplateDesign } from '../engine/types';

const CSS = `
.tpl-hilo{--cream:#FFF4E6;--ink:#1C1A17;--soft:#6B6358;--coral:#FF5A3C;--butter:#FFC93C;--mint:#8FE0B9;--sky:#9AD3F5;--lila:#C9B6FF;--sh:6px 6px 0 var(--ink);font-family:'Geist',system-ui,sans-serif;color:var(--ink);background:var(--cream);overflow-x:clip;position:relative}
.tpl-hilo a{color:inherit}
.tpl-hilo > :not(.h-line):not(dialog){position:relative;z-index:1}
.tpl-hilo .h-d{font-family:'Syne',system-ui,sans-serif;font-weight:700;letter-spacing:-.035em}
.tpl-hilo .h-line{position:absolute;left:0;top:0;width:100%;height:100%;z-index:0;pointer-events:none;overflow:visible}
.tpl-hilo .h-line path{fill:none;stroke:var(--ink);stroke-width:3;stroke-linecap:round}
.tpl-hilo .h-line .bg{stroke:rgba(28,26,23,.08);stroke-dasharray:2 10}
.tpl-hilo .h-line circle{fill:var(--coral);stroke:var(--ink);stroke-width:3}
.tpl-hilo .h-line .kn{fill:var(--cream);stroke:rgba(28,26,23,.25);stroke-width:2;transition:fill .3s,stroke .3s}
.tpl-hilo .h-line .kn.on{fill:var(--butter);stroke:var(--ink)}
.tpl-hilo .h-sec{padding-block:clamp(80px,10vw,140px)}
.tpl-hilo .h-h2{font-family:'Syne',sans-serif;font-weight:700;font-size:clamp(42px,6.2vw,96px);line-height:.92;letter-spacing:-.045em}
.tpl-hilo .h-h2 mark{background:none;color:inherit;box-shadow:inset 0 -.28em 0 var(--butter)}
.tpl-hilo .h-eb{display:inline-flex;align-items:center;gap:8px;font-size:13px;font-weight:600;padding:7px 14px;border-radius:999px;background:#fff;border:2px solid var(--ink)}
.tpl-hilo .h-eb i{width:8px;height:8px;border-radius:50%;background:var(--coral)}
.tpl-hilo .h-sub{margin-top:18px;font-size:18px;line-height:1.55;color:var(--soft);max-width:32em}
.tpl-hilo .h-btn{display:inline-flex;align-items:center;gap:10px;min-height:54px;padding:0 24px;border-radius:999px;background:var(--ink);color:var(--cream)!important;border:2px solid var(--ink);font-weight:700;font-size:16px;text-decoration:none;cursor:pointer;box-shadow:4px 4px 0 var(--coral);transition:transform .2s,box-shadow .2s}
.tpl-hilo .h-btn:hover{transform:translate(-2px,-2px);box-shadow:6px 6px 0 var(--coral)}
.tpl-hilo .h-btn:active{transform:translate(2px,2px);box-shadow:1px 1px 0 var(--coral)}
.tpl-hilo .h-btn svg{width:16px}
.tpl-hilo .h-btn.l{background:#fff;color:var(--ink)!important;box-shadow:4px 4px 0 var(--ink)}
.tpl-hilo .h-lnk{display:inline-flex;align-items:center;gap:8px;font:inherit;font-weight:700;font-size:15px;background:none;border:0;padding:0;cursor:pointer;text-decoration:underline;text-decoration-thickness:2px;text-underline-offset:5px;text-decoration-color:var(--coral)}
.tpl-hilo .h-lnk svg{width:15px}
.tpl-hilo .h-empty{margin-top:30px;padding:30px;border-radius:24px;background:#fff;border:2px dashed var(--ink);font-size:18px;line-height:1.55;max-width:44em}
.tpl-hilo .h-card{background:#fff;border:2px solid var(--ink);border-radius:26px;box-shadow:var(--sh)}
.tpl-hilo .h-nav{display:flex;align-items:center;gap:22px;padding-block:18px}
.tpl-hilo .h-nav .nm{display:flex;align-items:center;gap:10px;font-family:'Syne',sans-serif;font-weight:700;font-size:20px;text-decoration:none;margin-right:auto;letter-spacing:-.03em}
.tpl-hilo .h-nav .nm i{width:38px;height:38px;border-radius:12px;background:var(--coral);border:2px solid var(--ink);display:grid;place-items:center;transform:rotate(-8deg)}
.tpl-hilo .h-nav .nm i svg{width:20px;color:var(--ink)}
.tpl-hilo .h-nav a.l,.tpl-hilo .h-nav button.l{font-weight:600;font-size:15px;text-decoration:none;background:none;border:0;cursor:pointer;padding:0}
.tpl-hilo .h-nav a.l:hover,.tpl-hilo .h-nav button.l:hover{color:var(--coral)}
@media (max-width:860px){.tpl-hilo .h-nav .l{display:none}}
.tpl-hilo .h-hero{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.05fr);gap:30px;align-items:center;padding-block:20px 60px;min-height:calc(100svh - var(--bar) - 80px)}
.tpl-hilo .h-hero h1{font-family:'Syne',sans-serif;font-weight:700;font-size:clamp(48px,5.3vw,92px);line-height:.92;letter-spacing:-.05em;margin-top:22px}
.tpl-hilo .h-hero h1 .ch{display:inline-block;transition:transform .5s cubic-bezier(.3,1.8,.4,1)}
.tpl-hilo .h-hero h1 .ch:hover{transform:translateY(-.12em) rotate(-8deg);color:var(--coral)}
.tpl-hilo .h-hero h1 .wd{display:inline-block;white-space:nowrap}
.tpl-hilo .h-hero h1 .h-sw{position:relative;display:inline-block}
.tpl-hilo .h-hero h1 .h-sw::after{content:"";position:absolute;left:-3%;right:-3%;bottom:-.1em;height:.26em;background:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 300 30' preserveAspectRatio='none'%3E%3Cpath d='M4 20 C60 6 110 28 160 16 S250 6 296 18' fill='none' stroke='%23FF5A3C' stroke-width='7' stroke-linecap='round'/%3E%3C/svg%3E") no-repeat center/100% 100%;transform-origin:left;transform:scaleX(0);animation:hGrow 1.1s .6s cubic-bezier(.6,0,.2,1) forwards}
@keyframes hGrow{to{transform:scaleX(1)}}
.tpl-hilo .h-hero .lead{margin-top:24px;font-size:19px;line-height:1.55;color:var(--soft);max-width:28em}
.tpl-hilo .h-play{position:relative;height:min(600px,70vh);min-height:440px;border-radius:36px;background:var(--sky);border:2px solid var(--ink);box-shadow:var(--sh);overflow:hidden;touch-action:pan-y}
.tpl-hilo .h-play::before{content:"";position:absolute;inset:0;background-image:radial-gradient(rgba(28,26,23,.14) 1.4px,transparent 1.6px);background-size:22px 22px}
.tpl-hilo .h-play .tag{position:absolute;left:18px;top:16px;z-index:2;font-weight:700;font-size:14px;background:#fff;border:2px solid var(--ink);border-radius:999px;padding:6px 12px}
.tpl-hilo .h-play .cnt{position:absolute;right:18px;top:16px;z-index:2;font-family:'Syne',sans-serif;font-weight:700;font-size:44px;line-height:1}
.tpl-hilo .h-play .cnt small{display:block;font-family:'Geist',sans-serif;font-size:13px;font-weight:600;text-align:right}
.tpl-hilo .h-stk{position:absolute;left:0;top:0;width:var(--s);height:var(--s);padding:0;border:0;background:none;cursor:grab;touch-action:none;will-change:transform;filter:drop-shadow(0 0 0 #fff) drop-shadow(3px 4px 0 rgba(28,26,23,.9))}
.tpl-hilo .h-stk:active{cursor:grabbing}
.tpl-hilo .h-stk .ph{position:absolute;inset:0;border-radius:50%;overflow:hidden;border:5px solid #fff}
.tpl-hilo .h-stk b{position:absolute;left:50%;bottom:-8px;transform:translateX(-50%) rotate(-4deg);background:var(--butter);border:2px solid var(--ink);border-radius:8px;padding:2px 8px;font-size:13px;font-weight:800;white-space:nowrap;font-family:'Syne',sans-serif}
@media (max-width:900px){.tpl-hilo .h-hero{grid-template-columns:minmax(0,1fr);min-height:0}.tpl-hilo .h-play{height:440px}}
@media (max-width:560px){.tpl-hilo .h-hero h1{font-size:10.6vw}}
.tpl-hilo .h-tb{display:flex;flex-wrap:wrap;align-items:center;gap:10px 20px;padding:14px 20px;border-radius:999px;background:#fff;border:2px solid var(--ink);font-size:14px;font-weight:500}
.tpl-hilo .h-tb svg{width:20px;color:var(--coral)}
.tpl-hilo .h-tb b{font-weight:800}
.tpl-hilo .h-tb .lv{display:inline-flex;gap:4px}
.tpl-hilo .h-tb .lv i{width:22px;height:10px;border-radius:5px;border:2px solid var(--ink)}
.tpl-hilo .h-tb .lv i.on{background:var(--mint)}
.tpl-hilo .h-tb .ac{margin-left:auto;color:var(--soft)}
@media (max-width:760px){.tpl-hilo .h-tb{border-radius:22px}.tpl-hilo .h-tb .ac{margin-left:0}}
.tpl-hilo .h-acts{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:22px;margin-top:44px}
.tpl-hilo .h-act{position:relative;display:flex;flex-direction:column;gap:12px;min-height:280px;padding:30px;border-radius:30px;border:2px solid var(--ink);box-shadow:var(--sh);text-decoration:none;transition:transform .4s cubic-bezier(.3,1.6,.4,1)}
.tpl-hilo .h-act:nth-child(1){background:var(--coral);transform:rotate(-1.5deg)}
.tpl-hilo .h-act:nth-child(2){background:var(--butter);transform:rotate(1deg)}
.tpl-hilo .h-act:nth-child(3){background:var(--mint);transform:rotate(-.5deg)}
.tpl-hilo .h-act:hover{transform:rotate(0) translateY(-8px) scale(1.02)}
.tpl-hilo .h-act b{font-family:'Syne',sans-serif;font-weight:700;font-size:clamp(40px,4vw,58px);line-height:1;letter-spacing:-.04em;margin-top:auto}
.tpl-hilo .h-act p{font-size:16px;line-height:1.5;max-width:20em}
.tpl-hilo .h-act .ic{width:62px;height:62px;border-radius:50%;background:#fff;border:2px solid var(--ink);display:grid;place-items:center}
.tpl-hilo .h-act .ic svg{width:28px}
.tpl-hilo .h-act .go{position:absolute;right:24px;top:24px;width:46px;height:46px;border-radius:50%;background:var(--ink);color:var(--cream);display:grid;place-items:center;transition:transform .4s}
.tpl-hilo .h-act:hover .go{transform:rotate(-45deg)}
.tpl-hilo .h-act .go svg{width:18px}
.tpl-hilo .h-note{margin-top:22px;font-size:14px;color:var(--soft)}
@media (max-width:900px){.tpl-hilo .h-acts{grid-template-columns:minmax(0,1fr)}.tpl-hilo .h-act{min-height:200px}}
.tpl-hilo .h-bento{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:12px;margin-top:40px}
.tpl-hilo .h-bento button{position:relative;text-align:left;border:2px solid var(--ink);border-radius:22px;padding:16px 18px 14px;min-height:108px;cursor:pointer;display:flex;flex-direction:column;justify-content:space-between;font:inherit;transition:transform .3s cubic-bezier(.3,1.6,.4,1),box-shadow .3s}
.tpl-hilo .h-bento button b{font-family:'Syne',sans-serif;font-weight:700;font-size:40px;line-height:1;letter-spacing:-.04em}
.tpl-hilo .h-bento button span{font-weight:700;font-size:15px}
.tpl-hilo .h-bento button[aria-pressed="true"]{box-shadow:var(--sh);transform:translate(-3px,-3px)}
.tpl-hilo .h-bento button[aria-pressed="true"]::after{content:"✓";position:absolute;right:12px;top:10px;width:26px;height:26px;border-radius:50%;background:var(--ink);color:#fff;display:grid;place-items:center;font-size:13px}
@media (max-width:900px){.tpl-hilo .h-bento{grid-template-columns:repeat(3,minmax(0,1fr))}}
@media (max-width:520px){.tpl-hilo .h-bento{grid-template-columns:repeat(2,minmax(0,1fr))}.tpl-hilo .h-bento button{min-height:92px}.tpl-hilo .h-bento button b{font-size:32px}}
.tpl-hilo .h-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:22px;margin-top:34px}
.tpl-hilo .h-a{position:relative;display:flex;flex-direction:column;text-align:left;padding:12px 12px 16px;border-radius:26px;border:2px solid var(--ink);background:#fff;cursor:pointer;font:inherit;color:var(--ink);transform:rotate(var(--r));transition:transform .45s cubic-bezier(.3,1.6,.4,1),box-shadow .3s}
.tpl-hilo .h-a:hover{transform:rotate(0) translateY(-6px);box-shadow:var(--sh)}
.tpl-hilo .h-a .ph{aspect-ratio:1/1;border-radius:18px;overflow:hidden;border:2px solid var(--ink)}
.tpl-hilo .h-a b{font-family:'Syne',sans-serif;font-weight:700;font-size:24px;letter-spacing:-.03em;margin-top:12px;padding-inline:4px}
.tpl-hilo .h-a span{font-size:14px;color:var(--soft);padding-inline:4px}
.tpl-hilo .h-a .nw{position:absolute;right:20px;top:20px;background:var(--coral);border:2px solid var(--ink);border-radius:999px;padding:3px 10px;font-size:12px;font-weight:800;color:var(--ink);transform:rotate(6deg)}
@media (max-width:1000px){.tpl-hilo .h-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}
@media (max-width:640px){.tpl-hilo .h-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.tpl-hilo .h-a b{font-size:19px}}
.tpl-hilo .h-more{display:flex;justify-content:center;align-items:center;gap:18px;margin-top:44px;flex-wrap:wrap}
.tpl-hilo .h-more span{font-weight:600;color:var(--soft)}
.tpl-hilo .h-camp{padding:clamp(24px,4vw,54px);border-radius:36px;background:var(--lila);border:2px solid var(--ink);box-shadow:var(--sh)}
.tpl-hilo .h-camp .top{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(0,1fr);gap:30px;align-items:end}
.tpl-hilo .h-run{position:relative;margin-top:60px;height:22px;border-radius:999px;background:#fff;border:2px solid var(--ink)}
.tpl-hilo .h-run i{position:absolute;left:0;top:0;bottom:0;width:0;border-radius:999px;background:repeating-linear-gradient(-45deg,var(--coral) 0 12px,#FF7A60 12px 24px);transition:width 2.2s cubic-bezier(.3,1.2,.4,1);animation:hStripe 1s linear infinite;background-size:34px 34px}
@keyframes hStripe{to{background-position:34px 0}}
.tpl-hilo .h-run .rd{position:absolute;top:50%;left:0;width:84px;height:84px;margin:-62px 0 0 -42px;border-radius:50%;overflow:hidden;border:4px solid #fff;box-shadow:0 0 0 2px var(--ink),4px 4px 0 2px var(--ink);transition:left 2.2s cubic-bezier(.3,1.2,.4,1)}
.tpl-hilo .h-run .gl{position:absolute;right:-4px;top:50%;transform:translateY(-50%);width:38px;height:38px;border-radius:50%;background:var(--butter);border:2px solid var(--ink);display:grid;place-items:center;font-weight:800;font-size:12px}
.tpl-hilo .h-kpis{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;margin-top:30px}
.tpl-hilo .h-kpis div{background:#fff;border:2px solid var(--ink);border-radius:20px;padding:16px 18px}
.tpl-hilo .h-kpis b{display:block;font-family:'Syne',sans-serif;font-weight:700;font-size:clamp(24px,2.6vw,36px);letter-spacing:-.03em}
.tpl-hilo .h-kpis span{font-size:13px;font-weight:600;color:var(--soft)}
@media (max-width:860px){.tpl-hilo .h-camp .top{grid-template-columns:minmax(0,1fr)}.tpl-hilo .h-kpis{grid-template-columns:minmax(0,1fr)}}
.tpl-hilo .h-needs{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:18px;margin-top:40px}
.tpl-hilo .h-nd{padding:24px;display:flex;flex-direction:column;gap:10px}
.tpl-hilo .h-nd .k{align-self:flex-start;font-size:12px;font-weight:800;padding:4px 10px;border-radius:999px;border:2px solid var(--ink);background:var(--mint)}
.tpl-hilo .h-nd:nth-child(2n) .k{background:var(--sky)}
.tpl-hilo .h-nd b{font-family:'Syne',sans-serif;font-weight:700;font-size:22px;line-height:1.08;letter-spacing:-.03em}
.tpl-hilo .h-nd .bar{height:16px;border-radius:999px;border:2px solid var(--ink);background:var(--cream);overflow:hidden;margin-top:auto}
.tpl-hilo .h-nd .bar i{display:block;height:100%;width:0;background:var(--butter);border-right:2px solid var(--ink);transition:width 1.8s cubic-bezier(.3,1.2,.4,1)}
.tpl-hilo .h-nd p{display:flex;justify-content:space-between;font-size:14px;font-weight:600}
.tpl-hilo .h-nd a{font-weight:800;text-decoration:none;color:var(--coral)}
@media (max-width:1000px){.tpl-hilo .h-needs{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (max-width:560px){.tpl-hilo .h-needs{grid-template-columns:minmax(0,1fr)}}
.tpl-hilo .h-prods{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:22px;margin-top:40px}
.tpl-hilo .h-pr{padding:16px;text-decoration:none;display:flex;flex-direction:column;gap:4px;transition:transform .45s cubic-bezier(.3,1.6,.4,1)}
.tpl-hilo .h-pr:nth-child(odd){transform:rotate(-1.5deg)}.tpl-hilo .h-pr:nth-child(even){transform:rotate(1.5deg)}
.tpl-hilo .h-pr:hover{transform:rotate(0) translateY(-6px)}
.tpl-hilo .h-pr .ph{aspect-ratio:1/1;border-radius:18px;border:2px solid var(--ink);padding:14%;margin-bottom:10px}
.tpl-hilo .h-pr:nth-child(4n+1) .ph{background:var(--butter)}.tpl-hilo .h-pr:nth-child(4n+2) .ph{background:var(--sky)}.tpl-hilo .h-pr:nth-child(4n+3) .ph{background:var(--mint)}.tpl-hilo .h-pr:nth-child(4n) .ph{background:var(--lila)}
.tpl-hilo .h-pr .ph svg{width:100%;height:100%}
.tpl-hilo .h-pr .k{font-size:12px;font-weight:700;color:var(--soft)}
.tpl-hilo .h-pr b{font-family:'Syne',sans-serif;font-weight:700;font-size:21px;letter-spacing:-.03em}
.tpl-hilo .h-pr .row{display:flex;justify-content:space-between;align-items:center;margin-top:8px}
.tpl-hilo .h-pr .pz{font-weight:800}
.tpl-hilo .h-pr .by{font-size:13px;font-weight:800;background:var(--ink);color:var(--cream);padding:7px 14px;border-radius:999px}
@media (max-width:1000px){.tpl-hilo .h-prods{grid-template-columns:repeat(2,minmax(0,1fr))}}
.tpl-hilo .h-help{background:var(--coral);border-block:2px solid var(--ink);overflow:hidden;padding-block:clamp(80px,10vw,140px) 0}
.tpl-hilo .h-help h2{font-family:'Syne',sans-serif;font-weight:700;font-size:clamp(52px,8.4vw,140px);line-height:.88;letter-spacing:-.055em;max-width:9em}
.tpl-hilo .h-help .row{display:flex;justify-content:space-between;align-items:flex-end;flex-wrap:wrap;gap:24px;margin-top:30px}
.tpl-hilo .h-help p{max-width:28em;font-size:19px;line-height:1.55;font-weight:500}
.tpl-hilo .h-help .h-btn{box-shadow:4px 4px 0 #fff}
.tpl-hilo .h-mq{margin-top:clamp(60px,8vw,110px);border-top:2px solid var(--ink);background:var(--butter);overflow:hidden;white-space:nowrap}
.tpl-hilo .h-mq div{display:inline-flex;gap:34px;padding:18px 0;animation:hMq 26s linear infinite;font-family:'Syne',sans-serif;font-weight:700;font-size:clamp(28px,3.4vw,48px);letter-spacing:-.03em}
.tpl-hilo .h-mq span::after{content:"✦";margin-left:34px;color:var(--coral)}
@keyframes hMq{to{transform:translateX(-50%)}}
.tpl-hilo .h-about{display:grid;grid-template-columns:minmax(0,.8fr) minmax(0,1.2fr);gap:44px;align-items:start}
.tpl-hilo .h-bub{position:relative;padding:clamp(24px,3.4vw,40px);font-size:clamp(19px,1.9vw,25px);line-height:1.5;font-weight:500}
.tpl-hilo .h-bub::after{content:"";position:absolute;left:44px;bottom:-22px;width:36px;height:36px;background:#fff;border-right:2px solid var(--ink);border-bottom:2px solid var(--ink);transform:skewY(35deg) rotate(10deg)}
.tpl-hilo .h-bdg{display:flex;flex-wrap:wrap;gap:10px;margin-top:44px}
.tpl-hilo .h-bdg span{display:inline-flex;align-items:center;gap:7px;padding:8px 14px;border-radius:999px;border:2px solid var(--ink);background:#fff;font-size:14px;font-weight:700;transform:rotate(var(--r))}
.tpl-hilo .h-bdg span.ok{background:var(--mint)}
.tpl-hilo .h-bdg svg{width:15px}
@media (max-width:860px){.tpl-hilo .h-about{grid-template-columns:minmax(0,1fr);gap:20px}}
.tpl-hilo .h-hd{display:flex;justify-content:space-between;align-items:flex-end;gap:16px 30px;flex-wrap:wrap}
.tpl-hilo .h-revs{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:24px;margin-top:44px}
.tpl-hilo .h-revs figure{margin:0;padding:28px;border:2px solid var(--ink);border-radius:6px 6px 26px 6px;box-shadow:var(--sh);display:flex;flex-direction:column;gap:14px;transition:transform .45s cubic-bezier(.3,1.6,.4,1)}
.tpl-hilo .h-revs figure:nth-child(1){background:var(--butter);transform:rotate(-2deg)}
.tpl-hilo .h-revs figure:nth-child(2){background:var(--sky);transform:rotate(1.5deg) translateY(18px)}
.tpl-hilo .h-revs figure:nth-child(3){background:var(--mint);transform:rotate(-1deg)}
.tpl-hilo .h-revs figure:hover{transform:rotate(0) scale(1.02)}
.tpl-hilo .h-revs .st{font-size:18px;letter-spacing:2px}
.tpl-hilo .h-revs blockquote{margin:0;font-size:19px;line-height:1.45;font-weight:500}
.tpl-hilo .h-revs figcaption{font-weight:800;font-size:14px;margin-top:auto}
@media (max-width:860px){.tpl-hilo .h-revs{grid-template-columns:minmax(0,1fr)}.tpl-hilo .h-revs figure:nth-child(2){transform:rotate(1.5deg)}}
.tpl-hilo .h-ledger{margin-top:40px;overflow:hidden}
.tpl-hilo .h-lsum{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));border-bottom:2px solid var(--ink)}
.tpl-hilo .h-lsum div{padding:22px 26px}
.tpl-hilo .h-lsum div + div{border-left:2px solid var(--ink)}
.tpl-hilo .h-lsum div:nth-child(1){background:var(--mint)}.tpl-hilo .h-lsum div:nth-child(2){background:#FFD7CE}.tpl-hilo .h-lsum div:nth-child(3){background:var(--butter)}
.tpl-hilo .h-lsum span{font-size:13px;font-weight:700}
.tpl-hilo .h-lsum b{display:block;font-family:'Syne',sans-serif;font-weight:700;font-size:clamp(26px,3vw,44px);letter-spacing:-.04em}
.tpl-hilo .h-tw{overflow-x:auto}
.tpl-hilo .h-ledger table{width:100%;border-collapse:collapse;font-size:15px}
.tpl-hilo .h-ledger th,.tpl-hilo .h-ledger td{text-align:left;padding:16px 26px;border-bottom:2px solid rgba(28,26,23,.1)}
.tpl-hilo .h-ledger td:first-child{white-space:nowrap;font-weight:700}
.tpl-hilo .h-ledger tr:last-child td{border-bottom:0}
.tpl-hilo .h-ledger th{font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.06em}
.tpl-hilo .h-ledger .num{text-align:right;white-space:nowrap;font-weight:800;font-variant-numeric:tabular-nums}
.tpl-hilo .h-ledger .lk{font-size:12px;font-weight:800;padding:3px 10px;border-radius:999px;border:2px solid var(--ink);background:#FFD7CE}
.tpl-hilo .h-ledger .lk.in{background:var(--mint)}
@media (max-width:700px){.tpl-hilo .h-lsum{grid-template-columns:minmax(0,1fr)}.tpl-hilo .h-lsum div + div{border-left:0;border-top:2px solid var(--ink)}.tpl-hilo .h-ledger table{min-width:600px}}
.tpl-hilo .h-contact{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.3fr);overflow:hidden}
.tpl-hilo .h-contact .info{padding:clamp(24px,4vw,48px);display:flex;flex-direction:column;align-items:flex-start;gap:8px}
.tpl-hilo .h-contact dl{margin:16px 0 20px;display:grid;gap:12px}
.tpl-hilo .h-contact dt{font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:var(--soft)}
.tpl-hilo .h-contact dd{margin:2px 0 0;font-size:19px;font-weight:600}
.tpl-hilo .h-contact .map{min-height:360px;border-left:2px solid var(--ink)}
@media (max-width:860px){.tpl-hilo .h-contact{grid-template-columns:minmax(0,1fr)}.tpl-hilo .h-contact .map{min-height:230px;border-left:0;border-top:2px solid var(--ink)}}
.tpl-hilo .h-ftr{background:var(--ink);color:var(--cream);padding-block:70px 40px;margin-top:40px}
.tpl-hilo .h-ftr .big{font-family:'Syne',sans-serif;font-weight:700;font-size:clamp(52px,10vw,170px);line-height:.85;letter-spacing:-.06em}
.tpl-hilo .h-ftr .big span{color:var(--coral)}
.tpl-hilo .h-soc{display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap;margin-top:40px}
.tpl-hilo .h-soc p{font-size:15px;opacity:.75}
.tpl-hilo .h-soc div{display:flex;gap:10px}
.tpl-hilo .h-soc a{width:50px;height:50px;border-radius:50%;display:grid;place-items:center;background:var(--cream);color:var(--ink);transition:transform .35s cubic-bezier(.3,1.8,.4,1),background .3s}
.tpl-hilo .h-soc a:nth-child(2n){background:var(--butter)}
.tpl-hilo .h-soc a:hover{transform:rotate(-12deg) scale(1.12);background:var(--coral)}
.tpl-hilo .h-soc svg{width:20px}
.tpl-hilo .h-fine{display:flex;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-top:40px;padding-top:18px;border-top:1px solid rgba(255,244,230,.2);font-size:13px;opacity:.7}
.tpl-hilo dialog.sheet,.tpl-hilo .ldg{border:0;padding:0;background:transparent;width:min(960px,calc(100vw - 24px));max-width:none;color:var(--ink);overflow:visible}
.tpl-hilo dialog.sheet::backdrop,.tpl-hilo .ldg::backdrop{background:rgba(28,26,23,.5)}
.tpl-hilo .sh-in{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:0;background:#fff;border:2px solid var(--ink);border-radius:32px;box-shadow:10px 10px 0 var(--ink);overflow:hidden;position:relative;animation:hPop .55s cubic-bezier(.3,1.5,.4,1)}
@keyframes hPop{from{opacity:0;transform:scale(.85) rotate(-3deg)}}
.tpl-hilo .sh-ph{aspect-ratio:4/5;border-right:2px solid var(--ink)}
.tpl-hilo .sh-bd{padding:40px;display:flex;flex-direction:column;gap:14px}
.tpl-hilo .sh-k{align-self:flex-start;font-size:13px;font-weight:800;padding:5px 12px;border-radius:999px;border:2px solid var(--ink);background:var(--butter)}
.tpl-hilo .sh-n{font-family:'Syne',sans-serif;font-weight:700;font-size:64px;line-height:.9;letter-spacing:-.05em}
.tpl-hilo .sh-dl{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:8px 0 0}
.tpl-hilo .sh-dl div{padding:10px 12px;border:2px solid var(--ink);border-radius:14px}
.tpl-hilo .sh-dl dt{font-size:11px;font-weight:800;text-transform:uppercase;color:var(--soft)}
.tpl-hilo .sh-dl dd{margin:2px 0 0;font-weight:700}
.tpl-hilo .sh-act{display:flex;gap:10px;margin-top:auto;flex-wrap:wrap}
.tpl-hilo .sh-b1,.tpl-hilo .sh-b2{min-height:52px;padding:0 22px;display:inline-flex;align-items:center;border-radius:999px;border:2px solid var(--ink);text-decoration:none;font-weight:800}
.tpl-hilo .sh-b1{background:var(--coral);box-shadow:4px 4px 0 var(--ink)}
.tpl-hilo .sh-b2{background:#fff}
.tpl-hilo .sh-x,.tpl-hilo .ldg-x{position:absolute;top:14px;right:14px;width:46px;height:46px;border-radius:50%;border:2px solid var(--ink);background:#fff;cursor:pointer;display:grid;place-items:center;z-index:2}
.tpl-hilo .sh-x svg,.tpl-hilo .ldg-x svg{width:18px}
@media (max-width:720px){.tpl-hilo .sh-in{grid-template-columns:minmax(0,1fr);max-height:calc(100vh - 24px);overflow:auto}.tpl-hilo .sh-ph{aspect-ratio:1/1;border-right:0;border-bottom:2px solid var(--ink)}.tpl-hilo .sh-bd{padding:22px}.tpl-hilo .sh-n{font-size:48px}}
.tpl-hilo .ldg-in{background:#fff;border:2px solid var(--ink);border-radius:32px;box-shadow:10px 10px 0 var(--ink);padding:40px;position:relative;max-height:calc(100vh - 34px);overflow:auto}
.tpl-hilo .ldg-k{display:inline-block;font-size:13px;font-weight:800;padding:5px 12px;border-radius:999px;border:2px solid var(--ink);background:var(--mint)}
.tpl-hilo .ldg-t{font-family:'Syne',sans-serif;font-weight:700;font-size:52px;letter-spacing:-.05em;margin-top:10px}
.tpl-hilo .ldg-d{color:var(--soft)}
.tpl-hilo .ldg-sum{display:flex;gap:12px;flex-wrap:wrap;margin-top:20px}
.tpl-hilo .ldg-sum div{border:2px solid var(--ink);border-radius:16px;padding:10px 16px}
.tpl-hilo .ldg-sum span{display:block;font-size:12px;font-weight:700;color:var(--soft)}
.tpl-hilo .ldg-sum b{font-family:'Syne',sans-serif;font-weight:700;font-size:26px}
.tpl-hilo .ldg-tw{overflow-x:auto;margin-top:20px}
.tpl-hilo .ldg table{width:100%;border-collapse:collapse;font-size:14px}
.tpl-hilo .ldg th,.tpl-hilo .ldg td{text-align:left;padding:12px 10px;border-bottom:2px solid rgba(28,26,23,.1)}
.tpl-hilo .ldg th{font-size:11px;font-weight:800;text-transform:uppercase}
.tpl-hilo .ldg .num{text-align:right;white-space:nowrap;font-weight:800}
.tpl-hilo .ldg .lk{font-size:11px;font-weight:800;padding:2px 8px;border-radius:999px;border:2px solid var(--ink)}
.tpl-hilo a.h-a{text-decoration:none}
.tpl-hilo .h-contact.nomap{grid-template-columns:minmax(0,1fr)}
.tpl-hilo .h-contact dd a{text-decoration:none}
.tpl-hilo .h-run .rd.pw{display:grid;place-items:center;background:var(--coral)}
.tpl-hilo .h-run .rd.pw span{width:50%;color:var(--ink)}
.tpl-hilo .h-art{position:relative;height:min(600px,70vh);min-height:440px;border-radius:36px;border:2px solid var(--ink);box-shadow:var(--sh);overflow:hidden}
@media (max-width:900px){.tpl-hilo .h-art{height:340px;min-height:0}}
`;

type Filter = 'todos' | 'perro' | 'gato' | 'otro' | 'nuevos' | 'bebes' | 'senior';
const FILTERS: Record<Filter, (a: TplAnimal) => boolean> = {
  todos: () => true,
  perro: (a) => a.sp === 'perro',
  gato: (a) => a.sp === 'gato',
  otro: (a) => a.sp === 'otro',
  nuevos: (a) => a.isNew,
  bebes: (a) => a.hasAge && a.months < 12,
  senior: (a) => a.stage === 'Senior',
};

interface Body {
  el: HTMLButtonElement;
  a: TplAnimal;
  r: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  held: boolean;
}

export const hilo: TemplateDesign = {
  id: 'hilo',
  fonts: 'family=Geist:wght@300;400;500;600;700;800&family=Syne:wght@500;600;700;800',
  css: CSS,
  html(m, KIT) {
    const { ORG, CAMPAIGN, ANIMALS, SHOW, BADGES, NEEDS, PRODUCTS, REVIEWS } = m;
    const n = m.COUNTS.total;
    const BG = [
      'var(--coral)',
      'var(--butter)',
      'var(--mint)',
      'var(--sky)',
      'var(--lila)',
      '#FFB4A2',
      '#FFE9A8',
    ];
    const T = (
      [
        ['todos', 'Todos'],
        ['perro', 'Perros'],
        ['gato', 'Gatos'],
        ['otro', 'Otros'],
        ['nuevos', 'Recién llegados'],
        ['bebes', 'Cachorros'],
        ['senior', 'Seniors'],
      ] as const
    )
      .map(([k, t]) => [k, t, ANIMALS.filter(FILTERS[k]).length] as const)
      .filter(([k, , c]) => k === 'todos' || c > 0);
    const h1 = 'Un hilo te une a quien te espera.';
    const word = (w: string, c = '') =>
      `<span class="wd${c}">${[...w].map((ch) => `<span class="ch">${ch}</span>`).join('')}</span>`;
    const t = KIT.transparencyParts();
    const map = mapEmbed(m);
    const eb = [ORG.type, ORG.city, ...BADGES.slice(0, 2).map((b) => b.t)]
      .filter(Boolean)
      .join(' · ');
    return `
<svg class="h-line" id="h-line" aria-hidden="true"><path class="bg" id="h-pbg"/><path id="h-p"/><circle id="h-dot" r="9" cx="-40" cy="-40"/></svg>
<div class="w"><nav class="h-nav" aria-label="Principal"><a class="nm" href="#h-top"><i>${ic.paw}</i>${ORG.short}</a><a class="l" href="#h-cat">Adoptar</a><a class="l" href="#h-camp">Campaña</a><a class="l" href="#portal-help-cta">Cómo ayudar</a><button type="button" class="l" data-ledger>Transparencia</button><a class="h-btn" href="${ORG.donateHref}" style="min-height:44px;padding:0 18px">Donar</a></nav></div>
<section class="w h-hero" id="h-top" data-sec="animales">
  <div>${eb ? `<span class="h-eb"><i></i>${eb}</span>` : ''}
    <h1 aria-label="${h1}"><span aria-hidden="true">${word('Un')} ${word('hilo')} ${word('te')} ${word('une')} ${word('a')} ${word('quien')} ${word('te')} ${word('espera.', ' h-sw')}</span></h1>
    <p class="lead">${ORG.lede || availLine(m, 'casa')}${n ? ' Arrastra los stickers, lánzalos y toca el que te robe el corazón.' : ''}</p>
    <div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:30px"><a class="h-btn" href="#h-cat" data-magnet>${n ? 'Conocerlos' : 'Ver catálogo'} ${ic.arrow}</a><a class="h-btn l" href="${ORG.donateHref}">Donar</a></div></div>
  ${n ? `<div class="h-play" id="h-play" role="group" aria-label="Stickers de animales: toca uno para ver su ficha"><span class="tag">Arrástralos ✦</span><span class="cnt">${n}<small>en adopción</small></span></div>` : `<div class="h-art">${campaignArt(m)}</div>`}
</section>
${SHOW.transparencia ? `<div class="w" data-sec="transparencia" role="group" aria-label="Transparencia"><div class="h-tb">${ic.shield}<b>${t.level}</b><span>${t.formalization}</span><span>${t.accountability}</span><span class="ac">${t.note}</span></div></div>` : ''}
<section class="w h-sec" data-sec="acciones"><span class="h-eb"><i></i>Tres formas de tirar del hilo</span><h2 class="h-h2" style="margin-top:18px">¿Cómo quieres <mark>ayudar</mark>?</h2>
  <div class="h-acts">${(
    [
      ['Adoptar', 'Elige a uno de ellos y sigue su solicitud de adopción.', '#h-cat', ic.heart],
      ['Apadrinar', 'Elige a uno de ellos y acompaña sus cuidados.', '#h-cat', ic.paw],
      ['Donar', 'Apoya el trabajo de la organización.', ORG.donateHref, ic.star],
    ] as const
  )
    .map(
      ([tt, d, h, i]) =>
        `<a class="h-act" href="${h}"><span class="ic">${i}</span><span class="go">${ic.arrow}</span><b>${tt}</b><p>${d}</p></a>`,
    )
    .join('')}</div>
  <p class="h-note">${COPY.adoptNote}</p></section>
<section class="w h-sec" id="h-cat" data-sec="animales" style="padding-top:0"><span class="h-eb"><i></i>El catálogo</span><h2 class="h-h2" style="margin-top:18px">Elige por <mark>personalidad</mark></h2>
  ${
    n
      ? `<div class="h-bento" role="group" aria-label="Filtrar">${T.map(([k, tt, c], i) => `<button type="button" data-f="${k}" aria-pressed="${i === 0}" style="background:${BG[i % BG.length]}"><b>${c}</b><span>${tt}</span></button>`).join('')}</div>
  <div class="h-grid" id="h-grid"></div><div class="h-more"><span id="h-n" aria-live="polite"></span><button type="button" class="h-btn l" id="h-more"></button></div>`
      : `<p class="h-empty">${EMPTY.animales}</p>`
  }
</section>
<section class="w h-sec" id="h-camp" data-sec="campana" style="padding-top:0">${
      CAMPAIGN.active
        ? `<div class="h-camp"><div class="top"><div><span class="h-eb"><i></i>Campaña activa${CAMPAIGN.category ? ` · ${CAMPAIGN.category}` : ''}</span><h2 class="h-h2" style="margin-top:18px">${CAMPAIGN.title}</h2></div>
  <div>${CAMPAIGN.description ? `<p style="font-size:17px;line-height:1.55;font-weight:500">${CAMPAIGN.description}</p>` : ''}<p style="margin-top:10px;line-height:1.55">${COPY.adoptNote}</p><div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:18px"><a class="h-btn" href="${CAMPAIGN.href}" data-magnet>Ver campaña y aportar ${ic.arrow}</a></div>${KIT.moreCampaigns()}</div></div>
  <div class="h-run" id="h-run"><i></i><span class="rd pw" aria-hidden="true"><span>${paw('currentColor')}</span></span><span class="gl">Meta</span></div>
  <div class="h-kpis"><div><b id="h-raised">${fmt(CAMPAIGN.raised)}</b><span>recaudado · ${CAMPAIGN.pct}%</span></div><div><b>${fmt(CAMPAIGN.goal)}</b><span>meta</span></div><div><b>${CAMPAIGN.daysLeft} ${CAMPAIGN.daysLeft === 1 ? 'día' : 'días'}</b><span>${CAMPAIGN.deadline ? `cierra ${CAMPAIGN.deadline}` : 'restantes'}</span></div></div></div>`
        : `<span class="h-eb"><i></i>Campaña activa</span><h2 class="h-h2" style="margin-top:18px">Sin campaña <mark>por ahora</mark></h2><p class="h-empty">${EMPTY.campana}</p>`
    }</section>
<section class="w h-sec" data-sec="necesidades" style="padding-top:0"><span class="h-eb"><i></i>Banco de recursos</span><h2 class="h-h2" style="margin-top:18px">Lo que <mark>necesitamos</mark></h2>
  ${NEEDS.length ? `<div class="h-needs">${NEEDS.map((nd) => `<div class="h-nd h-card">${nd.category ? `<span class="k">${nd.category}</span>` : ''}<b>${nd.title}</b><div class="bar"><i data-w="${nd.pct}"></i></div><p><span>${nd.got} de ${nd.need} ${nd.unit}</span><span>${nd.pct}%</span></p><a href="${nd.href}">Ver y donar →</a></div>`).join('')}</div>` : `<p class="h-empty">${EMPTY.necesidades}</p>`}
</section>
<section class="w h-sec" data-sec="productos" style="padding-top:0"><span class="h-eb"><i></i>Tienda solidaria</span><h2 class="h-h2" style="margin-top:18px">Compra y <mark>ayuda</mark></h2>
  ${PRODUCTS.length ? `<div class="h-prods">${PRODUCTS.map((p) => `<a class="h-pr h-card" href="${p.href}"><div class="ph">${productArt(p, 'transparent')}</div>${p.category ? `<span class="k">${p.category}</span>` : ''}<b>${p.name}</b><span class="row"><span class="pz">${fmt(p.price)}</span><span class="by">Ver</span></span></a>`).join('')}</div>` : `<p class="h-empty">${EMPTY.productos}</p>`}
</section>
<section class="h-help" id="portal-help-cta" data-sec="ayuda"><div class="w"><span class="h-eb"><i></i>Cómo ayudar</span><h2 style="margin-top:20px">${COPY.helpTitle}</h2><div class="row"><p>${COPY.helpText}</p><a class="h-btn" href="${ORG.donateHref}" data-magnet>${COPY.helpCta} ${ic.arrow}</a></div></div>
  <div class="h-mq" aria-hidden="true"><div>${[0, 1].map(() => ['Adopta', 'Apadrina', 'Dona', 'Comparte', 'Adopta', 'Apadrina', 'Dona', 'Comparte'].map((w) => `<span>${w}</span>`).join('')).join('')}</div></div></section>
${SHOW.nosotros ? `<section class="w h-sec" data-sec="nosotros"><div class="h-about"><div><span class="h-eb"><i></i>Quiénes somos</span><h2 class="h-h2" style="margin-top:18px">Sobre <mark>nosotros</mark></h2></div><div><p class="h-bub h-card">${ORG.about}</p>${BADGES.length ? `<div class="h-bdg">${BADGES.map((b, i) => `<span class="${b.ok ? 'ok' : ''}" style="--r:${[-3, 2, -1, 3][i % 4]}deg">${b.ok ? ic.check : ic.clock}${b.t}</span>`).join('')}</div>` : ''}</div></div></section>` : ''}
<section class="w h-sec" data-sec="resenas" ${SHOW.nosotros ? 'style="padding-top:0"' : ''}><div class="h-hd"><div><span class="h-eb"><i></i>Opiniones</span><h2 class="h-h2" style="margin-top:18px">Reseñas</h2></div><button type="button" class="h-lnk" data-review>Registrar reseña ${ic.arrow}</button></div>
  ${REVIEWS.length ? `<div class="h-revs">${REVIEWS.map((r) => `<figure><span class="st" aria-label="${r.rating} de 5 estrellas">${stars(r.rating)}</span>${r.text ? `<blockquote>${r.text}</blockquote>` : ''}<figcaption>${r.name}${r.date ? ` · ${r.date}` : ''}</figcaption></figure>`).join('')}</div>` : `<p class="h-empty">${EMPTY.resenas}</p>`}
</section>
<section class="w h-sec" data-sec="libro" style="padding-top:${REVIEWS.length ? '40px' : '0'}"><div class="h-hd"><div><span class="h-eb"><i></i>Transparencia</span><h2 class="h-h2" style="margin-top:18px">Libro <mark>público</mark></h2><p class="h-sub">${COPY.ledgerText}</p></div><button type="button" class="h-lnk" data-ledger>Ver libro completo ${ic.arrow}</button></div>
  ${ledgerBlock(m, 'h-empty')}
</section>
${SHOW.contacto ? `<section class="w h-sec" data-sec="contacto" style="padding-top:0"><div class="h-contact h-card${map ? '' : ' nomap'}"><div class="info"><span class="h-eb"><i></i>Visítanos</span><h2 class="h-h2" style="margin-top:14px;font-size:clamp(36px,4vw,58px)">Contacto</h2>${KIT.contactRows()}${mapLink(m, 'h-lnk')}</div>${map ? `<div class="map">${map}</div>` : ''}</div></section>` : ''}
<footer class="h-ftr"><div class="w"><p class="big">${ORG.short}<span>.</span></p>
  ${SHOW.redes ? `<div class="h-soc" data-sec="redes"><p>${COPY.socialsText}</p><div>${m.SOCIALS.map((x) => socialLink(x, ic[x.key])).join('')}</div></div>` : ''}
  <div class="h-fine"><span>© ${ORG.name}${ORG.place ? ` · ${ORG.place}` : ''}</span><span>Hecho con AdoptaFácil</span></div></div></footer>`;
  },
  init(app, env) {
    const { m, motion, catalog } = env;
    const { signal } = motion;
    const small = innerWidth < 700;

    // Stickers con física simple: gravedad, rebote en paredes, choques entre ellos y lanzamiento
    const play = qs(app, '#h-play');
    const B: Body[] = [];
    if (play) {
      catalog
        .query({ sort: 'recientes' })
        .slice(0, small ? 9 : 13)
        .forEach((a, i) => {
          const s = (small ? 96 : 128) + (i % 3) * 18;
          const el = document.createElement('button');
          el.type = 'button';
          el.className = 'h-stk';
          el.style.setProperty('--s', s + 'px');
          el.setAttribute(
            'aria-label',
            unesc(`Ver a ${a.name}${a.age ? `, ${a.spLabel.toLowerCase()} de ${a.age}` : ''}`),
          );
          el.innerHTML = `<span class="ph">${portrait(a, { decor: true, dx: 6, dy: 14, s: 1.1 })}</span><b>${a.name}</b>`;
          play.appendChild(el);
          B.push({
            el,
            a,
            r: s / 2,
            x: 0,
            y: 0,
            vx: 0,
            vy: 0,
            rot: (i % 2 ? 1 : -1) * (6 + i * 3),
            held: false,
          });
        });
      let W = 0;
      let H = 0;
      const size = () => {
        W = play.clientWidth;
        H = play.clientHeight;
      };
      size();
      addEventListener('resize', size, { signal });
      B.forEach((b, i) => {
        b.x = b.r + ((i * 97) % Math.max(1, W - 2 * b.r));
        b.y = motion.reduce ? H - b.r - (i % 3) * b.r * 1.4 : -b.r * 2 - i * 70;
      });
      let drag: {
        b: Body;
        ox: number;
        oy: number;
        lx: number;
        ly: number;
        t: number;
        moved: number;
      } | null = null;
      play.addEventListener(
        'pointerdown',
        (e) => {
          const el = (e.target as HTMLElement).closest('.h-stk');
          const b = B.find((x) => x.el === el);
          if (!b) return;
          const r = play.getBoundingClientRect();
          drag = {
            b,
            ox: e.clientX - r.left - b.x,
            oy: e.clientY - r.top - b.y,
            lx: e.clientX,
            ly: e.clientY,
            t: performance.now(),
            moved: 0,
          };
          b.held = true;
          b.el.setPointerCapture(e.pointerId);
          e.preventDefault();
        },
        { signal },
      );
      play.addEventListener(
        'pointermove',
        (e) => {
          if (!drag) return;
          const r = play.getBoundingClientRect();
          const b = drag.b;
          const now = performance.now();
          const dt = Math.max(8, now - drag.t);
          b.vx = ((e.clientX - drag.lx) / dt) * 16;
          b.vy = ((e.clientY - drag.ly) / dt) * 16;
          drag.moved += Math.abs(e.clientX - drag.lx) + Math.abs(e.clientY - drag.ly);
          b.x = e.clientX - r.left - drag.ox;
          b.y = e.clientY - r.top - drag.oy;
          drag.lx = e.clientX;
          drag.ly = e.clientY;
          drag.t = now;
        },
        { signal },
      );
      const up = () => {
        if (!drag) return;
        const d = drag;
        drag = null;
        d.b.held = false;
        if (d.moved < 6) env.go(unesc(d.b.a.href));
      };
      play.addEventListener('pointerup', up, { signal });
      play.addEventListener('pointercancel', () => drag && ((drag.b.held = false), (drag = null)), {
        signal,
      });
      // Teclado: Enter/Espacio disparan "click" (no pointerdown), así que se navega desde aquí
      play.addEventListener(
        'click',
        (e) => {
          if ((e as MouseEvent).detail !== 0) return;
          const b = B.find((x) => x.el === (e.target as HTMLElement).closest('.h-stk'));
          if (b) env.go(unesc(b.a.href));
        },
        { signal },
      );
      let inView = true;
      motion.observe([play], (en) => {
        inView = en.isIntersecting;
      });
      const draw = () =>
        B.forEach((b) => {
          b.el.style.transform = `translate(${(b.x - b.r).toFixed(1)}px,${(b.y - b.r).toFixed(1)}px) rotate(${b.rot.toFixed(1)}deg)`;
        });
      draw();
      if (!motion.reduce)
        motion.onFrame(() => {
          if (!inView) return;
          for (const b of B) {
            if (b.held) continue;
            b.vy += 0.55;
            b.vx *= 0.995;
            b.x += b.vx;
            b.y += b.vy;
            b.rot += b.vx * 0.6;
            if (b.y > H - b.r) {
              b.y = H - b.r;
              b.vy *= -0.42;
              b.vx *= 0.9;
              if (Math.abs(b.vy) < 1) b.vy = 0;
            }
            if (b.x < b.r) {
              b.x = b.r;
              b.vx *= -0.6;
            }
            if (b.x > W - b.r) {
              b.x = W - b.r;
              b.vx *= -0.6;
            }
            if (b.y < -H) {
              b.y = -H;
              b.vy = 0;
            }
          }
          for (let i = 0; i < B.length; i++)
            for (let j = i + 1; j < B.length; j++) {
              const p = B[i];
              const q = B[j];
              const dx = q.x - p.x;
              const dy = q.y - p.y;
              const d = Math.hypot(dx, dy) || 0.01;
              const mn = p.r + q.r - 6;
              if (d < mn) {
                const nx = dx / d;
                const ny = dy / d;
                const o = (mn - d) / 2;
                const wp = p.held ? 0 : q.held ? 2 : 1;
                const wq = q.held ? 0 : p.held ? 2 : 1;
                p.x -= nx * o * wp;
                p.y -= ny * o * wp;
                q.x += nx * o * wq;
                q.y += ny * o * wq;
                const rv = (q.vx - p.vx) * nx + (q.vy - p.vy) * ny;
                if (rv < 0) {
                  const k = rv * 0.5;
                  if (!p.held) {
                    p.vx += k * nx;
                    p.vy += k * ny;
                  }
                  if (!q.held) {
                    q.vx -= k * nx;
                    q.vy -= k * ny;
                  }
                }
              }
            }
          draw();
        });
    }

    // Catálogo con filtros en bento
    const BG = ['#FFD7CE', '#FFE9A8', '#D3F3E2', '#D6EEFC', '#E7DEFF'];
    const grid = qs(app, '#h-grid');
    const more = qs<HTMLButtonElement>(app, '#h-more');
    const count = qs(app, '#h-n');
    let fk: Filter = 'todos';
    let n = 16;
    const paint = () => {
      if (!grid || !more) return;
      const L = catalog.query({ sort: 'recientes' }).filter(FILTERS[fk]);
      const k = Math.min(n, L.length);
      grid.innerHTML = L.slice(0, k)
        .map(
          (a, i) =>
            `<a class="h-a" href="${a.href}" style="--r:${[-1.6, 1.2, -0.6, 1.8][i % 4]}deg"><div class="ph">${portrait(a, { decor: true, dx: 6, dy: 14, s: 1.1, bg: BG[i % BG.length] })}</div>${a.isNew ? '<span class="nw">¡Nuevo!</span>' : ''}<b>${a.name}</b><span>${[a.spLabel, a.age, a.sizeLabel.toLowerCase()].filter(Boolean).join(' · ')}</span></a>`,
        )
        .join('');
      if (count) count.textContent = `${k} de ${L.length}`;
      more.hidden = k >= L.length;
      more.textContent = `Mostrar ${Math.min(16, L.length - k)} más`;
    };
    qs(app, '.h-bento')?.addEventListener(
      'click',
      (e) => {
        const b = (e.target as HTMLElement).closest<HTMLElement>('[data-f]');
        if (!b) return;
        fk = b.dataset.f as Filter;
        n = 16;
        qsa(app, '.h-bento [data-f]').forEach((x) =>
          x.setAttribute('aria-pressed', String(x === b)),
        );
        paint();
        requestAnimationFrame(lay);
      },
      { signal },
    );
    more?.addEventListener(
      'click',
      () => {
        n += 16;
        paint();
        requestAnimationFrame(lay);
      },
      { signal },
    );
    paint();

    // El hilo: una curva que zigzaguea entre secciones y se dibuja con el scroll
    const svg = qs<SVGSVGElement>(app, '#h-line');
    const path = qs<SVGPathElement>(app, '#h-p');
    const pbg = qs<SVGPathElement>(app, '#h-pbg');
    const dot = qs<SVGCircleElement>(app, '#h-dot');
    const hero = qs(app, '.h-hero');
    let L = 0;
    let map: [number, number][] = [];
    let kys: number[] = [];
    const knots = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    if (svg && dot) svg.insertBefore(knots, dot);
    function lay() {
      if (!svg || !path || !pbg || !hero) return;
      svg.style.height = '0px';
      const ar = app.getBoundingClientRect();
      const Wd = app.clientWidth;
      const Hd = app.scrollHeight;
      svg.setAttribute('viewBox', `0 0 ${Wd} ${Hd}`);
      svg.style.height = Hd + 'px';
      const marks = qsa(app, '[data-sec]')
        .filter((el) => el.offsetHeight > 0)
        .map((el) => el.getBoundingClientRect().top - ar.top);
      const gx = Wd < 700 ? 7 : Math.max(28, (Wd - 1320) / 2 + 40 - 44);
      const amp = Wd < 700 ? 4 : 26;
      const sy = (play ?? hero).getBoundingClientRect().bottom - ar.top + 30;
      const ys = [...new Set(marks.map((y) => Math.round(y)))]
        .sort((a, b) => a - b)
        .filter((y, i, A) => i === 0 || y - A[i - 1] > 120)
        .filter((y) => y > sy + 80);
      let d = `M ${gx} ${sy}`;
      let py = sy;
      ys.concat([Hd - 120]).forEach((y, i) => {
        const h = y - py;
        const k = i % 2 ? -1 : 1;
        d += ` C ${gx + amp * k} ${py + h * 0.3}, ${gx - amp * k} ${py + h * 0.7}, ${gx} ${y}`;
        py = y;
      });
      knots.innerHTML = ys.map((y) => `<circle class="kn" cx="${gx}" cy="${y}" r="7"/>`).join('');
      kys = ys;
      path.setAttribute('d', d);
      pbg.setAttribute('d', d);
      L = path.getTotalLength();
      path.style.strokeDasharray = `${L} ${L}`;
      map = [];
      for (let i = 0; i <= 600; i++) {
        const p = path.getPointAtLength((L * i) / 600);
        map.push([p.y, (L * i) / 600]);
      }
      for (let i = 1; i < map.length; i++) if (map[i][0] < map[i - 1][0]) map[i][0] = map[i - 1][0];
    }
    const at = (y: number) => {
      let lo = 0;
      let hi = map.length - 1;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (map[mid][0] < y) lo = mid + 1;
        else hi = mid;
      }
      return map[lo] ? map[lo][1] : 0;
    };
    lay();
    const tm = setTimeout(lay, 400);
    signal.addEventListener('abort', () => clearTimeout(tm));
    void document.fonts?.ready.then(() => {
      if (!signal.aborted) lay();
    });
    addEventListener('resize', lay, { signal });
    if (typeof ResizeObserver === 'function') {
      let raf = 0;
      const ro = new ResizeObserver(() => {
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(lay);
      });
      ro.observe(app);
      signal.addEventListener('abort', () => {
        ro.disconnect();
        cancelAnimationFrame(raf);
      });
    }
    let shownL = 0;
    if (path && dot)
      motion.onFrame(() => {
        if (!L) return;
        const ar = app.getBoundingClientRect();
        const y = innerHeight * 0.62 - ar.top;
        const tgt = motion.reduce ? L : Math.min(L, at(y));
        shownL += (tgt - shownL) * 0.12;
        path.style.strokeDashoffset = (L - shownL).toFixed(1);
        const p = path.getPointAtLength(shownL);
        dot.setAttribute('cx', p.x.toFixed(1));
        dot.setAttribute('cy', p.y.toFixed(1));
        [...knots.children].forEach((c, i) => c.classList.toggle('on', p.y >= kys[i] - 2));
      });

    // Barras que se llenan
    const run = qs(app, '#h-run');
    const fills = [...(run ? [run] : []), ...qsa(app, '.h-nd .bar i')];
    const fill = (el: HTMLElement) => {
      if (el.id === 'h-run') {
        const p = Math.max(2, m.CAMPAIGN.pct);
        const bar = qs(el, 'i');
        const rd = qs(el, '.rd');
        if (bar) bar.style.width = p + '%';
        if (rd) rd.style.left = p + '%';
      } else el.style.width = el.dataset.w + '%';
    };
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
    if (m.CAMPAIGN.active) motion.countUp(qs(app, '#h-raised'), m.CAMPAIGN.raised, fmt);
    motion.reveal(app, '.h-act,.h-nd,.h-pr,.h-revs figure', { stagger: 90 });
    motion.magnet(app);
  },
};
