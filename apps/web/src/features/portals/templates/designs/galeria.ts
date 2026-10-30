import { ledgerBlock } from '../engine/ledger';
import { COPY, EMPTY, type TplAnimal } from '../engine/model';
import {
  availLine,
  campaignArt,
  fmt,
  ic,
  mapEmbed,
  mapLink,
  norm,
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
.tpl-galeria{--bg:#101010;--wall:#161615;--ink:#F3F1EC;--soft:#A7A49C;--line:rgba(255,255,255,.12);font-family:'Manrope',system-ui,sans-serif;color:var(--ink);background:var(--bg)}
.tpl-galeria a{color:inherit}
.tpl-galeria .g-serif{font-family:'Bodoni Moda',Didot,'Times New Roman',serif}
.tpl-galeria .g-wall{position:relative;height:calc(100vh - var(--bar));min-height:560px;overflow:hidden;background:radial-gradient(1200px 700px at 50% 40%,#1d1c1a,var(--wall) 70%);touch-action:none;cursor:grab;user-select:none}
.tpl-galeria .g-wall.drag{cursor:grabbing}
.tpl-galeria .g-tile{position:absolute;left:0;top:0;will-change:transform;padding:10px 10px 30px;background:#F6F4EF;box-shadow:0 30px 50px -28px rgba(0,0,0,.9),0 2px 6px rgba(0,0,0,.35);transition:opacity .5s,filter .5s,box-shadow .3s;border:0;cursor:inherit}
.tpl-galeria .g-tile .ph{width:100%;height:100%;overflow:hidden;background:#ddd}
.tpl-galeria .g-tile .ph .portrait{transition:transform .8s cubic-bezier(.2,.8,.2,1)}
.tpl-galeria .g-tile:hover .ph .portrait{transform:scale(1.07)}
.tpl-galeria .g-tile .cap{position:absolute;left:10px;right:10px;bottom:7px;display:flex;justify-content:space-between;font-size:11px;color:#3B3A36;font-weight:600;letter-spacing:.02em}
.tpl-galeria .g-tile .cap i{font-family:'Bodoni Moda',serif;font-style:italic;font-size:13px;font-weight:500}
.tpl-galeria .g-tile.off{opacity:.1;filter:grayscale(1)}
.tpl-galeria .g-tile.new::after{content:"Nuevo";position:absolute;top:16px;left:16px;font-size:10px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;background:var(--brand);color:var(--brand-ink);padding:4px 8px}
.tpl-galeria .g-shade{position:absolute;inset:0;pointer-events:none;background:linear-gradient(90deg,rgba(14,14,14,.96) 0,rgba(14,14,14,.82) 30%,rgba(14,14,14,.3) 52%,transparent 66%),linear-gradient(0deg,rgba(14,14,14,.9),transparent 28%),linear-gradient(180deg,rgba(14,14,14,.6),transparent 18%)}
.tpl-galeria .g-intro{position:absolute;left:max(24px,4vw);top:clamp(28px,8vh,90px);z-index:3;max-width:560px;pointer-events:none}
.tpl-galeria .g-intro > *{pointer-events:auto}
.tpl-galeria .g-k{font-size:12px;font-weight:700;letter-spacing:.22em;text-transform:uppercase;color:var(--soft);display:flex;gap:14px;flex-wrap:wrap}
.tpl-galeria .g-k span{display:inline-flex;align-items:center;gap:6px}
.tpl-galeria .g-k svg{width:13px;color:#9FE3CF}
.tpl-galeria .g-title{font-family:'Bodoni Moda',serif;font-weight:400;font-size:clamp(48px,7vw,112px);line-height:.88;letter-spacing:-.02em;margin-top:18px}
.tpl-galeria .g-title em{font-style:italic;font-weight:400}
.tpl-galeria .g-lede{margin-top:20px;font-size:17px;line-height:1.65;color:#CFCCC4;max-width:30em}
.tpl-galeria .g-cta{display:flex;flex-wrap:wrap;gap:12px;margin-top:28px}
.tpl-galeria .g-btn{display:inline-flex;align-items:center;gap:12px;min-height:52px;padding:0 24px;background:var(--ink);color:#111!important;text-decoration:none;font-weight:700;font-size:15px;border:0;cursor:pointer;transition:background .3s,color .3s}
.tpl-galeria .g-btn svg{width:18px;transition:transform .3s}
.tpl-galeria .g-btn:hover svg{transform:translateX(4px)}
.tpl-galeria .g-btn.ghost{background:transparent;color:var(--ink)!important;box-shadow:inset 0 0 0 1px rgba(255,255,255,.4)}
.tpl-galeria .g-btn.ghost:hover{background:rgba(255,255,255,.08)}
.tpl-galeria .g-dock{position:absolute;left:50%;bottom:22px;transform:translateX(-50%);z-index:4;display:flex;align-items:center;gap:8px;padding:8px;border-radius:999px;background:rgba(22,22,21,.72);backdrop-filter:blur(18px) saturate(140%);-webkit-backdrop-filter:blur(18px) saturate(140%);box-shadow:inset 0 0 0 1px var(--line),0 20px 50px -20px #000;max-width:calc(100% - 32px)}
.tpl-galeria .g-search{display:flex;align-items:center;gap:8px;padding:0 14px;height:44px;border-radius:999px;background:rgba(255,255,255,.07);min-width:0}
.tpl-galeria .g-search svg{width:17px;color:var(--soft);flex:none}
.tpl-galeria .g-search input{background:transparent;border:0;outline:0;width:170px;color:var(--ink);font-size:14px;min-width:0}
.tpl-galeria .g-search input::placeholder{color:var(--soft)}
.tpl-galeria .g-chips{display:flex;gap:4px;overflow-x:auto;scrollbar-width:none}
.tpl-galeria .g-chips::-webkit-scrollbar{display:none}
.tpl-galeria .g-chip{border:0;background:transparent;color:var(--soft);font-weight:700;font-size:13px;height:44px;padding:0 14px;border-radius:999px;cursor:pointer;white-space:nowrap}
.tpl-galeria .g-chip[aria-pressed="true"]{background:var(--ink);color:#111}
.tpl-galeria .g-count{font-size:13px;font-weight:700;color:var(--ink);padding:0 12px 0 6px;white-space:nowrap}
.tpl-galeria .g-count b{font-variant-numeric:tabular-nums}
.tpl-galeria .g-hint{position:absolute;right:max(24px,4vw);top:clamp(28px,8vh,90px);z-index:3;font-size:12px;font-weight:700;letter-spacing:.2em;text-transform:uppercase;color:var(--ink);display:flex;align-items:center;gap:10px;padding:6px 6px 6px 16px;border-radius:999px;background:rgba(22,22,21,.72);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);box-shadow:inset 0 0 0 1px var(--line)}
.tpl-galeria .g-hint i{width:34px;height:34px;border-radius:50%;box-shadow:inset 0 0 0 1px var(--line);display:grid;place-items:center;font-style:normal;animation:gNudge 2.4s ease-in-out infinite}
@keyframes gNudge{50%{transform:translateX(8px)}}
@media (max-width:900px){.tpl-galeria .g-wall{height:calc(100svh - var(--bar));min-height:600px}.tpl-galeria .g-shade{background:linear-gradient(0deg,rgba(14,14,14,.97) 0,rgba(14,14,14,.86) 42%,transparent 68%)}.tpl-galeria .g-intro{top:auto;bottom:150px;left:16px;right:16px}.tpl-galeria .g-k{font-size:11px;gap:4px 12px}.tpl-galeria .g-title{font-size:48px;margin-top:12px}.tpl-galeria .g-lede{display:none}.tpl-galeria .g-cta{display:none}.tpl-galeria .g-hint{display:none}.tpl-galeria .g-dock{left:12px;right:12px;transform:none;max-width:none;border-radius:22px;flex-wrap:wrap}.tpl-galeria .g-search{flex:1}.tpl-galeria .g-search input{width:100%}.tpl-galeria .g-count{display:none}}

.tpl-galeria .g-sec{padding-block:110px}
.tpl-galeria .g-h2{font-family:'Bodoni Moda',serif;font-weight:400;font-size:clamp(40px,5vw,76px);line-height:.95;letter-spacing:-.015em}
.tpl-galeria .g-h2 em{font-style:italic}
.tpl-galeria .g-eyebrow{font-size:12px;font-weight:700;letter-spacing:.22em;text-transform:uppercase;color:var(--soft)}
.tpl-galeria .g-rooms{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:18px;margin-top:48px}
.tpl-galeria .g-room{position:relative;aspect-ratio:3/4;overflow:hidden;border:0;padding:0;cursor:pointer;background:#1b1b1a;text-align:left;color:var(--ink)}
.tpl-galeria .g-room .stack{position:absolute;inset:0;display:grid;grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr;gap:3px;transition:transform 1s cubic-bezier(.2,.8,.2,1)}
.tpl-galeria .g-room:hover .stack{transform:scale(1.06)}
.tpl-galeria .g-room .veil{position:absolute;inset:0;background:linear-gradient(0deg,rgba(0,0,0,.88),rgba(0,0,0,.1) 60%)}
.tpl-galeria .g-room .lb{position:absolute;left:20px;right:20px;bottom:20px;display:flex;flex-direction:column;gap:4px}
.tpl-galeria .g-room .lb b{font-family:'Bodoni Moda',serif;font-weight:400;font-style:italic;font-size:32px;line-height:1}
.tpl-galeria .g-room .lb span{font-size:13px;color:var(--soft);font-weight:600;letter-spacing:.04em}
.tpl-galeria .g-room .n{position:absolute;top:16px;right:18px;font-family:'Bodoni Moda',serif;font-size:44px;line-height:1}
@media (max-width:900px){.tpl-galeria .g-rooms{grid-template-columns:repeat(2,minmax(0,1fr))}}

.tpl-galeria .g-piece{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:72px;align-items:center}
.tpl-galeria .g-frame{background:#F6F4EF;padding:22px 22px 56px;box-shadow:0 60px 80px -40px #000;position:relative;max-width:520px;justify-self:center;width:100%}
.tpl-galeria .g-frame .ph{aspect-ratio:4/5;overflow:hidden}
.tpl-galeria .g-frame .cap{position:absolute;left:22px;bottom:18px;color:#3B3A36;font-family:'Bodoni Moda',serif;font-style:italic;font-size:18px}
.tpl-galeria .g-label{border-left:1px solid var(--line);padding-left:28px;display:flex;flex-direction:column;gap:18px}
.tpl-galeria .g-label dl{display:grid;grid-template-columns:auto 1fr;gap:10px 24px;margin:0;font-size:15px}
.tpl-galeria .g-label dt{color:var(--soft);font-size:12px;letter-spacing:.16em;text-transform:uppercase;padding-top:2px}
.tpl-galeria .g-label dd{margin:0}
.tpl-galeria .g-bar{height:2px;background:var(--line);position:relative}
.tpl-galeria .g-bar i{position:absolute;inset:0 auto 0 0;width:0;background:var(--ink);transition:width 2s cubic-bezier(.2,.8,.2,1)}
@media (max-width:900px){.tpl-galeria .g-piece{grid-template-columns:minmax(0,1fr);gap:40px}}
.tpl-galeria .g-wallt{max-width:820px;margin:0 auto;text-align:center}
.tpl-galeria .g-wallt p{font-family:'Bodoni Moda',serif;font-size:clamp(26px,3.2vw,44px);line-height:1.25;margin-top:22px}
.tpl-galeria .g-plaques{display:flex;flex-wrap:wrap;justify-content:center;gap:14px;margin-top:44px}
.tpl-galeria .g-plaque{padding:16px 22px;border:1px solid var(--line);display:flex;align-items:center;gap:12px;font-size:14px}
.tpl-galeria .g-plaque svg{width:16px;color:#9FE3CF}
.tpl-galeria .g-ftr{border-top:1px solid var(--line);padding-block:44px 56px}
.tpl-galeria .g-ftr .w{display:flex;flex-wrap:wrap;gap:18px;justify-content:space-between;align-items:flex-end}
.tpl-galeria .g-ftr .big{font-family:'Bodoni Moda',serif;font-style:italic;font-size:clamp(40px,6vw,84px);line-height:.9}
.tpl-galeria .g-ftr nav{display:flex;flex-wrap:wrap;gap:20px;font-size:14px;color:var(--soft)}

.tpl-galeria .g-tbar{border-block:1px solid var(--line);background:#141413}
.tpl-galeria .g-tbar .w{display:flex;flex-wrap:wrap;align-items:center;gap:14px 36px;padding-block:18px;font-size:13px}
.tpl-galeria .g-tbar .lv{display:flex;align-items:center;gap:10px;font-weight:700}
.tpl-galeria .g-tbar .lv svg{width:20px;color:#9FE3CF}
.tpl-galeria .g-tbar .dots{display:flex;gap:4px}
.tpl-galeria .g-tbar .dots i{width:22px;height:4px;background:var(--line)}
.tpl-galeria .g-tbar .dots i.on{background:#9FE3CF}
.tpl-galeria .g-tbar .mt{display:flex;align-items:center;gap:10px;color:var(--soft)}
.tpl-galeria .g-tbar .mt span{width:120px;height:2px;background:var(--line);position:relative}
.tpl-galeria .g-tbar .mt span i{position:absolute;inset:0 auto 0 0;background:var(--ink)}
.tpl-galeria .g-tbar .ac{color:var(--soft);margin-left:auto}
.tpl-galeria .g-tbar .ac b{color:var(--ink);font-weight:600}
.tpl-galeria .g-empty{color:var(--soft);font-size:17px;line-height:1.6;margin-top:24px;padding:28px;border:1px dashed var(--line)}
.tpl-galeria .g-note{font-size:12px;color:var(--soft);margin-top:12px;max-width:34em}
.tpl-galeria .g-split{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.3fr);gap:56px;align-items:start}
@media (max-width:900px){.tpl-galeria .g-split{grid-template-columns:minmax(0,1fr);gap:28px}}
.tpl-galeria .g-needs{display:flex;flex-direction:column}
.tpl-galeria .g-need{display:grid;grid-template-columns:56px minmax(0,1fr) auto;gap:20px;align-items:center;padding:22px 0;border-top:1px solid var(--line)}
.tpl-galeria .g-need:last-child{border-bottom:1px solid var(--line)}
.tpl-galeria .g-need .no{font-family:'Bodoni Moda',serif;font-style:italic;font-size:34px;color:var(--soft)}
.tpl-galeria .g-need b{font-family:'Bodoni Moda',serif;font-weight:400;font-size:24px;display:block}
.tpl-galeria .g-need small{display:block;font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:var(--soft);margin-top:6px}
.tpl-galeria .g-need .pr{width:min(180px,30vw)}
.tpl-galeria .g-need .pr span{display:block;font-size:13px;color:var(--soft);text-align:right;margin-bottom:8px}
.tpl-galeria .g-shop{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:18px;margin-top:40px}
.tpl-galeria .g-prod{background:#F6F4EF;color:#1b1b1a;padding:14px 14px 18px;text-decoration:none;display:flex;flex-direction:column;gap:6px;transition:transform .4s cubic-bezier(.2,.8,.2,1)}
.tpl-galeria .g-prod:hover{transform:translateY(-6px)}
.tpl-galeria .g-prod .ph{aspect-ratio:1/1;background:#ECE8E0}
.tpl-galeria .g-prod b{font-family:'Bodoni Moda',serif;font-weight:400;font-size:21px;margin-top:8px}
.tpl-galeria .g-prod span{font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#6d6a63}
.tpl-galeria .g-prod em{font-style:normal;font-weight:700;font-size:15px}
@media (max-width:900px){.tpl-galeria .g-shop{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}}
.tpl-galeria .g-help{position:relative;overflow:hidden;text-align:center;padding:120px 16px;border-block:1px solid var(--line);background:radial-gradient(60% 80% at 50% 0,#22211e,var(--bg))}
.tpl-galeria .g-help p{color:var(--soft);font-size:18px;max-width:32em;margin:18px auto 0;line-height:1.6}
.tpl-galeria .g-visit{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px;margin-top:40px}
.tpl-galeria .g-vc{border:1px solid var(--line);padding:28px;display:flex;flex-direction:column;gap:16px}
.tpl-galeria .g-vc .st{color:#E8C27A;letter-spacing:3px}
.tpl-galeria .g-vc p{font-family:'Bodoni Moda',serif;font-size:21px;line-height:1.45}
.tpl-galeria .g-vc footer{font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:var(--soft)}
@media (max-width:900px){.tpl-galeria .g-visit{grid-template-columns:minmax(0,1fr)}}
.tpl-galeria .g-reg{width:100%;border-collapse:collapse;font-size:15px;margin-top:30px}
.tpl-galeria .g-reg th{font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:var(--soft);text-align:left;font-weight:600;padding:0 12px 12px 0;border-bottom:1px solid var(--line)}
.tpl-galeria .g-reg td{padding:18px 12px 18px 0;border-bottom:1px solid var(--line);vertical-align:top}
.tpl-galeria .g-reg td:first-child{font-family:'Bodoni Moda',serif;font-style:italic;font-size:18px;white-space:nowrap}
.tpl-galeria .g-reg .num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.tpl-galeria .g-reg .lk{font-size:11px;letter-spacing:.14em;text-transform:uppercase}
.tpl-galeria .g-reg .lk.in{color:#9FE3CF}.tpl-galeria .g-reg .lk.out{color:#E8C27A}
.tpl-galeria .g-regw{overflow-x:auto}
.tpl-galeria .g-sums{display:flex;flex-wrap:wrap;gap:30px;margin-top:26px}
.tpl-galeria .g-sums span{display:block;font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:var(--soft)}
.tpl-galeria .g-sums b{font-family:'Bodoni Moda',serif;font-weight:400;font-size:34px}
.tpl-galeria .g-cont{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.2fr);gap:0;border:1px solid var(--line)}
.tpl-galeria .g-cont .info{padding:36px;display:flex;flex-direction:column;gap:20px}
.tpl-galeria .g-cont dl{margin:0;display:flex;flex-direction:column;gap:18px}
.tpl-galeria .g-cont dt{display:flex;align-items:center;gap:8px;font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:var(--soft)}
.tpl-galeria .g-cont dt svg{width:14px}
.tpl-galeria .g-cont dd{margin:6px 0 0;font-size:17px}
.tpl-galeria .g-cont .map{min-height:340px;filter:grayscale(.6) contrast(1.05)}
.tpl-galeria .g-cont .map a{position:absolute}
@media (max-width:900px){.tpl-galeria .g-cont{grid-template-columns:minmax(0,1fr)}.tpl-galeria .g-cont .map{min-height:240px}}
.tpl-galeria .g-soc{display:flex;flex-wrap:wrap;gap:10px;margin-top:22px}
.tpl-galeria .g-soc a{display:inline-flex;align-items:center;gap:10px;min-height:46px;padding:0 16px;border:1px solid var(--line);text-decoration:none;font-size:14px;transition:background .3s}
.tpl-galeria .g-soc a:hover{background:rgba(255,255,255,.06)}
.tpl-galeria .g-soc svg{width:17px}
.tpl-galeria .g-ftr .soc{margin-top:0}
.tpl-galeria .ldg{border:0;padding:0;background:transparent;width:min(980px,calc(100vw - 24px));max-width:none;color:var(--ink)}
.tpl-galeria .ldg::backdrop{background:rgba(8,8,8,.86)}
.tpl-galeria .ldg-in{background:#141413;box-shadow:0 0 0 1px var(--line);padding:40px;position:relative;max-height:calc(100vh - 24px);overflow:auto}
.tpl-galeria .ldg-k{font-size:12px;letter-spacing:.2em;text-transform:uppercase;color:var(--soft)}
.tpl-galeria .ldg-t{font-family:'Bodoni Moda',serif;font-weight:400;font-style:italic;font-size:52px;margin-top:8px}
.tpl-galeria .ldg-d{color:var(--soft);margin-top:8px}
.tpl-galeria .ldg-sum{display:flex;gap:30px;flex-wrap:wrap;margin-top:22px}
.tpl-galeria .ldg-sum span{display:block;font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:var(--soft)}
.tpl-galeria .ldg-sum b{font-family:'Bodoni Moda',serif;font-weight:400;font-size:30px}
.tpl-galeria .ldg-tw{overflow-x:auto;margin-top:22px}
.tpl-galeria .ldg table{width:100%;border-collapse:collapse;font-size:14px}
.tpl-galeria .ldg th,.tpl-galeria .ldg td{text-align:left;padding:12px 10px 12px 0;border-bottom:1px solid var(--line)}
.tpl-galeria .ldg th{font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:var(--soft);font-weight:600}
.tpl-galeria .ldg .num{text-align:right;white-space:nowrap}
.tpl-galeria .ldg .lk.in{color:#9FE3CF}.tpl-galeria .ldg .lk.out{color:#E8C27A}
.tpl-galeria .ldg-x{position:absolute;top:14px;right:14px;width:44px;height:44px;border-radius:50%;border:0;background:rgba(255,255,255,.08);color:var(--ink);cursor:pointer;display:grid;place-items:center}
.tpl-galeria .ldg-x svg{width:18px}

.tpl-galeria dialog.sheet{border:0;padding:0;background:transparent;max-width:min(1040px,calc(100vw - 32px));width:100%;color:var(--ink)}
.tpl-galeria dialog.sheet::backdrop{background:rgba(8,8,8,.86);backdrop-filter:blur(6px)}
.tpl-galeria .sh-in{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,1fr);gap:0;background:#141413;box-shadow:0 0 0 1px var(--line);position:relative;animation:gIn .5s cubic-bezier(.2,.8,.2,1)}
@keyframes gIn{from{opacity:0;transform:scale(.97)}}
.tpl-galeria .sh-ph{background:#F6F4EF;padding:22px 22px 22px;aspect-ratio:4/5}
.tpl-galeria .sh-bd{padding:40px;display:flex;flex-direction:column;gap:18px}
.tpl-galeria .sh-k{font-size:12px;letter-spacing:.2em;text-transform:uppercase;color:var(--soft);font-weight:700}
.tpl-galeria .sh-n{font-family:'Bodoni Moda',serif;font-weight:400;font-style:italic;font-size:64px;line-height:.9}
.tpl-galeria .sh-dl{display:grid;grid-template-columns:auto 1fr;gap:10px 24px;margin:0;font-size:15px;border-top:1px solid var(--line);padding-top:18px}
.tpl-galeria .sh-dl div{display:contents}
.tpl-galeria .sh-dl dt{color:var(--soft);font-size:12px;letter-spacing:.16em;text-transform:uppercase}
.tpl-galeria .sh-dl dd{margin:0}
.tpl-galeria .sh-act{display:flex;gap:10px;flex-wrap:wrap;margin-top:auto}
.tpl-galeria .sh-b1,.tpl-galeria .sh-b2{display:inline-flex;align-items:center;min-height:50px;padding:0 22px;text-decoration:none;font-weight:700;font-size:15px}
.tpl-galeria .sh-b1{background:var(--ink);color:#111}
.tpl-galeria .sh-b2{box-shadow:inset 0 0 0 1px rgba(255,255,255,.4);color:var(--ink)}
.tpl-galeria .sh-x{position:absolute;top:14px;right:14px;width:44px;height:44px;border-radius:50%;border:0;background:rgba(255,255,255,.08);color:var(--ink);cursor:pointer;display:grid;place-items:center;z-index:2}
.tpl-galeria .sh-x svg{width:18px}
.tpl-galeria .sh-nav{display:flex;gap:8px}
.tpl-galeria .sh-nav button{width:44px;height:44px;border-radius:50%;border:0;background:rgba(255,255,255,.08);color:var(--ink);cursor:pointer;display:grid;place-items:center}
.tpl-galeria .sh-nav svg{width:18px}
@media (max-width:760px){.tpl-galeria .sh-in{grid-template-columns:minmax(0,1fr);max-height:calc(100vh - 32px);overflow:auto}.tpl-galeria .sh-ph{aspect-ratio:1/1}.tpl-galeria .sh-bd{padding:24px}.tpl-galeria .sh-n{font-size:46px}}
.tpl-galeria .g-cont.nomap{grid-template-columns:minmax(0,1fr)}
.tpl-galeria .g-cont .map{position:relative}
.tpl-galeria .g-cont .map iframe{position:absolute;inset:0}
.tpl-galeria .g-need-a{text-decoration:none;color:inherit}
.tpl-galeria .g-tile.dup{pointer-events:none}
`;

type RoomKey = 'nuevos' | 'jovenes' | 'espera' | 'senior';
const inRoom = (a: TplAnimal, f: string): boolean =>
  f === 'todos' ||
  a.sp === f ||
  (f === 'jovenes' && a.hasAge && a.months < 12) ||
  (f === 'senior' && a.stage === 'Senior') ||
  (f === 'nuevos' && a.isNew) ||
  (f === 'espera' && a.days > 90);

export const galeria: TemplateDesign = {
  id: 'galeria',
  fonts:
    'family=Manrope:wght@400;500;600;700;800&family=Bodoni+Moda:ital,opsz,wght@0,6..96,400;0,6..96,600;1,6..96,400;1,6..96,500',
  css: CSS,
  html(m, KIT) {
    const { ORG, CAMPAIGN, ANIMALS, SHOW, BADGES, NEEDS, PRODUCTS, REVIEWS } = m;
    const n = m.COUNTS.total;
    const rooms = (
      [
        ['Recién llegados', 'nuevos', 'Publicados en las últimas dos semanas'],
        ['Cachorros y gatitos', 'jovenes', 'Menos de un año'],
        ['Los que más esperan', 'espera', 'Publicados hace más de tres meses'],
        ['Seniors', 'senior', 'Ocho años o más'],
      ] as Array<[string, RoomKey, string]>
    )
      .map(([t, key, d]) => {
        const list = ANIMALS.filter((a) => inRoom(a, key));
        if (!list.length) return '';
        return `<button class="g-room g-rv" type="button" data-room="${key}"><div class="stack">${list
          .slice(0, 4)
          .map((a) => `<div>${portrait(a, { decor: true })}</div>`)
          .join(
            '',
          )}</div><span class="veil"></span><span class="n">${list.length}</span><span class="lb"><b>${t}</b><span>${d}</span></span></button>`;
      })
      .join('');
    const chips = (
      [
        ['todos', 'Todos'],
        ['perro', 'Perros'],
        ['gato', 'Gatos'],
        ['otro', 'Otros'],
        ['jovenes', 'Cachorros'],
        ['senior', 'Seniors'],
        ['nuevos', 'Nuevos'],
      ] as const
    ).filter(([f]) => f === 'todos' || ANIMALS.some((a) => inRoom(a, f)));
    const words = ORG.name.split(' ');
    const title =
      words.length > 1
        ? `${words.slice(0, -1).join(' ')} <em>${words[words.length - 1]}</em>`
        : ORG.name;
    const t = KIT.transparencyParts();
    const c = ORG.contact;
    const map = mapEmbed(m);
    const kick = [
      [ORG.type, ORG.city].filter(Boolean).join(' · '),
      ...BADGES.map((b) => `${b.ok ? ic.check : ''}${b.t}`),
    ]
      .filter(Boolean)
      .map((x) => `<span>${x}</span>`)
      .join('');
    return `
<section class="g-wall" id="g-wall" data-sec="animales" aria-label="${n ? `Muro de ${n} animales en adopción. Arrastra para explorar.` : 'Animales en adopción'}">
  <div id="g-world"></div>
  <div class="g-shade"></div>
  <div class="g-intro">
    ${kick ? `<p class="g-k">${kick}</p>` : ''}
    <h1 class="g-title">${title}</h1>
    <p class="g-lede">${n ? `${ORG.lede ? `${ORG.lede} ` : ''}Una galería con ${n === 1 ? 'un retrato que espera' : `${n} retratos que esperan`} casa. Arrastra el muro, filtra abajo y toca a quien te mire primero.` : ORG.lede || availLine(m)}</p>
    <div data-sec="acciones"><div class="g-cta"><a class="g-btn" href="#g-salas" data-magnet>Adoptar ${ic.arrow}</a><a class="g-btn ghost" href="#g-salas">Apadrinar</a><a class="g-btn ghost" href="${ORG.donateHref}">Donar</a></div><p class="g-note">${COPY.adoptNote}</p></div>
  </div>
  ${n ? '<div class="g-hint" aria-hidden="true">Arrastra <i>→</i></div>' : ''}
  ${
    n
      ? `<div class="g-dock" role="search">
    <label class="g-search"><span class="sr">Buscar por nombre o raza</span>${ic.search}<input id="g-q" type="search" placeholder="Nombre o raza" autocomplete="off"></label>
    <div class="g-chips" role="group" aria-label="Filtrar">${chips.map((ch, i) => `<button type="button" class="g-chip" data-f="${ch[0]}" aria-pressed="${i === 0}">${ch[1]}</button>`).join('')}</div>
    <span class="g-count" aria-live="polite"><b id="g-n">${n}</b> de ${n}</span>
  </div>`
      : ''
  }
</section>
${SHOW.transparencia ? `<div class="g-tbar" data-sec="transparencia" role="group" aria-label="Transparencia"><div class="w"><span class="lv">${ic.shield}${t.level}</span><span class="mt">Formalización <span><i style="width:${ORG.formalization}%"></i></span>${ORG.formalization}%</span><span class="ac"><b>${t.accountability}</b> · ${t.note}</span></div></div>` : ''}
<main>
${
  rooms
    ? `<section class="w g-sec" id="g-salas">
  <p class="g-eyebrow">Salas</p><h2 class="g-h2" style="margin-top:14px">Salas para <em>no perderte</em> entre ${n}</h2>
  <div class="g-rooms">${rooms}</div>
</section>`
    : `<section class="w g-sec" id="g-salas"><p class="g-eyebrow">Salas</p><p class="g-empty">${EMPTY.animales}</p></section>`
}
${
  CAMPAIGN.active
    ? `<section class="w g-sec" id="g-pieza" data-sec="campana" style="padding-top:0">
  <div class="g-piece">
    <figure class="g-frame g-rv" style="margin:0"><div class="ph" style="position:relative">${campaignArt(m)}</div><figcaption class="cap">${CAMPAIGN.category || 'Campaña activa'}</figcaption></figure>
    <div class="g-label g-rv"><p class="g-eyebrow">Pieza destacada · campaña activa</p><h2 class="g-h2">${CAMPAIGN.title}</h2>
      <dl><dt>Meta</dt><dd>${fmt(CAMPAIGN.goal)}</dd><dt>Recaudado</dt><dd id="g-raised">${fmt(CAMPAIGN.raised)}</dd><dt>Cierra</dt><dd>${CAMPAIGN.deadline}${CAMPAIGN.daysLeft > 0 ? ` · ${CAMPAIGN.daysLeft === 1 ? 'falta 1 día' : `faltan ${CAMPAIGN.daysLeft} días`}` : ''}</dd></dl>
      <div class="g-bar"><i id="g-bar"></i></div>
      ${CAMPAIGN.description ? `<p style="color:var(--soft);line-height:1.6">${CAMPAIGN.description}</p>` : ''}
      <p style="color:var(--soft);line-height:1.6">${COPY.adoptNote}</p>
      <div class="g-cta" style="margin-top:4px"><a class="g-btn" href="${CAMPAIGN.href}" data-magnet>Ver campaña y aportar ${ic.arrow}</a></div>
      ${KIT.moreCampaigns()}</div>
  </div>
</section>`
    : `<section class="w g-sec" id="g-pieza" data-sec="campana" style="padding-top:0"><p class="g-eyebrow">Campaña activa</p><p class="g-empty">${EMPTY.campana}</p></section>`
}
${
  SHOW.nosotros
    ? `<section class="w g-sec" data-sec="nosotros" style="padding-top:0"><div class="g-wallt g-rv"><p class="g-eyebrow">Texto de sala · Nosotros</p><p>${ORG.about}</p>
  <div class="g-plaques">${BADGES.map((x) => `<span class="g-plaque">${x.ok ? ic.check : ''}${x.t}</span>`).join('')}${SHOW.transparencia ? `<span class="g-plaque">Formalización ${ORG.formalization}%</span>` : ''}</div></div></section>`
    : ''
}
<section class="w g-sec" data-sec="necesidades" style="padding-top:0"><div class="g-split"><div><p class="g-eyebrow">Necesita hoy</p><h2 class="g-h2" style="margin-top:14px">Lo que <em>falta</em> en la sala</h2><p class="g-note" style="font-size:15px">Del banco de recursos de la organización.</p></div>
  <div class="g-needs">${
    NEEDS.length
      ? NEEDS.map(
          (nd, k) =>
            `<a class="g-need g-need-a" href="${nd.href}"><span class="no">${String(k + 1).padStart(2, '0')}</span><div><b>${nd.title}</b><small>${nd.category ? `${nd.category} · ` : ''}${nd.got} de ${nd.need} ${nd.unit}</small></div><div class="pr"><span>${nd.pct}%</span><div class="g-bar"><i class="g-nb" data-w="${nd.pct}"></i></div></div></a>`,
        ).join('')
      : `<p class="g-empty">${EMPTY.necesidades}</p>`
  }</div></div></section>
<section class="w g-sec" data-sec="productos" style="padding-top:0"><p class="g-eyebrow">Tienda de la galería</p><h2 class="g-h2" style="margin-top:14px">Productos que <em>sostienen</em> la organización</h2>
  ${PRODUCTS.length ? `<div class="g-shop">${PRODUCTS.map((p) => `<a class="g-prod g-rv" href="${p.href}"><div class="ph">${productArt(p)}</div>${p.category ? `<span>${p.category}</span>` : ''}<b>${p.name}</b><em>${fmt(p.price)}</em></a>`).join('')}</div>` : `<p class="g-empty">${EMPTY.productos}</p>`}</section>
</main>
<section class="g-help" id="portal-help-cta" data-sec="ayuda"><p class="g-eyebrow">${ORG.short}</p><h2 class="g-h2" style="margin-top:14px">${COPY.helpTitle.replace('grandes cambios', '<em>grandes cambios</em>')}</h2><p>${COPY.helpText}</p><div class="g-cta" style="justify-content:center"><a class="g-btn" href="${ORG.donateHref}" data-magnet>${COPY.helpCta} ${ic.arrow}</a></div></section>
<div>
<section class="w g-sec" data-sec="resenas"><div style="display:flex;justify-content:space-between;align-items:flex-end;gap:20px;flex-wrap:wrap"><div><p class="g-eyebrow">Libro de visitas</p><h2 class="g-h2" style="margin-top:14px">Lo que dicen <em>quienes nos conocen</em></h2></div><button type="button" class="g-btn ghost" data-review>Registrar reseña</button></div>
  ${REVIEWS.length ? `<div class="g-visit">${REVIEWS.map((r) => `<blockquote class="g-vc g-rv" style="margin:0"><span class="st" aria-label="${r.rating} de 5">${stars(r.rating)}</span>${r.text ? `<p>“${r.text}”</p>` : ''}<footer>${r.name}${r.date ? ` · ${r.date}` : ''}</footer></blockquote>`).join('')}</div>` : `<p class="g-empty">${EMPTY.resenas}</p>`}</section>
<section class="w g-sec" data-sec="libro" style="padding-top:0"><div style="display:flex;justify-content:space-between;align-items:flex-end;gap:20px;flex-wrap:wrap"><div><p class="g-eyebrow">Transparencia · libro público</p><h2 class="g-h2" style="margin-top:14px">Registro de la <em>colección</em></h2><p class="g-note" style="font-size:15px">${COPY.ledgerText}</p></div><button type="button" class="g-btn ghost" data-ledger>Ver libro completo ${ic.arrow}</button></div>
  ${ledgerBlock(m, 'g-empty')}</section>
${
  SHOW.contacto
    ? `<section class="w g-sec" data-sec="contacto" style="padding-top:0"><p class="g-eyebrow">Visítanos</p><h2 class="g-h2" style="margin:14px 0 36px">Información de <em>contacto</em></h2>
  <div class="g-cont${map ? '' : ' nomap'}"><div class="info"><dl>${c.hours ? `<div><dt>${ic.clock}Horario de atención</dt><dd>${c.hours}</dd></div>` : ''}${c.fullAddress ? `<div><dt>${ic.pin}Dirección</dt><dd>${c.fullAddress}</dd></div>` : ''}${c.phones.length ? `<div><dt>${ic.phone}Teléfonos</dt><dd>${c.phones.map((ph, i) => (c.phoneHrefs[i] ? `<a href="${c.phoneHrefs[i]}">${ph}</a>` : ph)).join(' · ')}</dd></div>` : ''}</dl>${mapLink(m, 'g-btn ghost')}</div>${map ? `<div class="map">${map}</div>` : ''}</div></section>`
    : ''
}
</div>
<footer class="g-ftr">${SHOW.redes ? `<div class="w" data-sec="redes" style="margin-bottom:34px;display:block"><p class="g-eyebrow">${COPY.socialsTitle}</p><p style="color:var(--soft);margin-top:10px">${COPY.socialsText}</p><div class="g-soc">${m.SOCIALS.map((x) => socialLink(x, `${ic[x.key]}<span>${x.label}<span class="sr"> · ${x.handle}</span></span>`)).join('')}</div></div>` : ''}<div class="w"><span class="big">${ORG.short}</span><nav aria-label="Pie"><a href="#g-wall">Muro</a><a href="#g-salas">Salas</a><a href="#g-pieza">Campaña</a><button type="button" data-ledger style="background:none;border:0;padding:0;font:inherit;color:inherit;cursor:pointer">Transparencia</button><span>Hecho con AdoptaFácil</span></nav></div></footer>`;
  },
  init(app, env) {
    const { m, motion } = env;
    const { signal } = motion;
    const A = m.ANIMALS;
    const wall = qs(app, '#g-wall');
    const world = qs(app, '#g-world');
    if (wall && world && A.length) {
      // El muro se rellena repitiendo retratos (las copias son decorativas).
      const SRC: Array<{ a: TplAnimal; dup: boolean }> = A.map((a) => ({ a, dup: false }));
      for (let k = 0; SRC.length < 40; k++) SRC.push({ a: A[k % A.length], dup: true });
      const mob = innerWidth < 760;
      const TW = mob ? 150 : 250;
      const TH = Math.round(TW * 1.28);
      const G = mob ? 14 : 26;
      const C = 10;
      const R = Math.ceil(SRC.length / C);
      const W = C * (TW + G);
      const H = R * (TH + G);
      world.innerHTML = SRC.map(
        ({ a, dup }) =>
          `<button type="button" class="g-tile${a.isNew ? ' new' : ''}${dup ? ' dup' : ''}" data-id="${a.id}" style="width:${TW}px;height:${TH}px"${dup ? ' aria-hidden="true" tabindex="-1"' : ` aria-label="${a.name}, ${a.spLabel.toLowerCase()}, ${a.age}"`}><div class="ph">${portrait(a, { decor: true })}</div><span class="cap"><i>${a.name}</i><span>${a.age}</span></span></button>`,
      ).join('');
      const byId = new Map(A.map((a) => [a.id, a]));
      const tiles = qsa(world, '.g-tile').map((el, k) => ({
        el,
        a: SRC[k].a,
        dup: SRC[k].dup,
        bx: (k % C) * (TW + G),
        by: Math.floor(k / C) * (TH + G) + ((k % C) % 2 ? TH * 0.42 : 0),
      }));
      const drift = motion.reduce ? 0 : 1;
      let px = -W * 0.18;
      let py = -H * 0.12;
      let vx = -0.35 * drift;
      let vy = -0.12 * drift;
      let drag = false;
      let moved = 0;
      let lx = 0;
      let ly = 0;
      const wrap = (v: number, mod: number) => ((v % mod) + mod) % mod;
      const open = (id: string | undefined) => {
        const a = id ? byId.get(id) : undefined;
        if (a) env.go(unesc(a.href));
      };
      wall.addEventListener(
        'pointerdown',
        (e) => {
          if ((e.target as Element).closest('.g-dock,.g-intro a,.g-intro button')) return;
          drag = true;
          moved = 0;
          lx = e.clientX;
          ly = e.clientY;
          wall.classList.add('drag');
          wall.setPointerCapture(e.pointerId);
        },
        { signal },
      );
      wall.addEventListener(
        'pointermove',
        (e) => {
          if (!drag) return;
          const dx = e.clientX - lx;
          const dy = e.clientY - ly;
          lx = e.clientX;
          ly = e.clientY;
          moved += Math.abs(dx) + Math.abs(dy);
          px += dx;
          py += dy;
          vx = dx;
          vy = dy;
        },
        { signal },
      );
      const end = () => {
        drag = false;
        wall.classList.remove('drag');
      };
      wall.addEventListener(
        'pointerup',
        (e) => {
          if (!drag) return;
          end();
          if (moved < 6) {
            const tile = document
              .elementsFromPoint(e.clientX, e.clientY)
              .find((el) => el.classList.contains('g-tile') && !el.classList.contains('off')) as
              HTMLElement | undefined;
            if (tile) open(tile.dataset.id);
          }
        },
        { signal },
      );
      wall.addEventListener('pointercancel', end, { signal });
      wall.addEventListener(
        'keydown',
        (e) => {
          const tile = (e.target as Element).closest<HTMLElement>('.g-tile');
          if (tile && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            open(tile.dataset.id);
          }
        },
        { signal },
      );
      const place = () => {
        const sk = Math.max(-6, Math.min(6, vx * 0.25));
        for (const t of tiles) {
          const x = wrap(t.bx + px, W) - (TW + G);
          const y = wrap(t.by + py, H) - (TH + G);
          t.el.style.transform = `translate3d(${x}px,${y}px,0) skewX(${(-sk).toFixed(2)}deg)`;
        }
      };
      place();
      motion.onFrame(() => {
        if (!drag) {
          px += vx;
          py += vy;
          vx = vx * 0.95 - 0.35 * drift * 0.05;
          vy = vy * 0.95 - 0.12 * drift * 0.05;
        }
        place();
      });
      // Filtros: apagan sin reordenar
      const st = { f: 'todos', q: '' };
      const nEl = qs(app, '#g-n');
      const apply = () => {
        const q = norm(st.q);
        const seen = new Set<string>();
        tiles.forEach((t) => {
          const on =
            inRoom(t.a, st.f) &&
            (!q || norm(`${t.a.name} ${t.a.breed} ${t.a.spLabel}`).includes(q));
          t.el.classList.toggle('off', !on);
          if (!t.dup) t.el.tabIndex = on ? 0 : -1;
          if (on) seen.add(t.a.id);
        });
        if (nEl) nEl.textContent = String(seen.size);
        qsa(app, '.g-chip').forEach((ch) =>
          ch.setAttribute('aria-pressed', String(ch.dataset.f === st.f)),
        );
      };
      qsa(app, '.g-chip').forEach((ch) =>
        ch.addEventListener(
          'click',
          () => {
            st.f = ch.dataset.f ?? 'todos';
            apply();
          },
          { signal },
        ),
      );
      qs<HTMLInputElement>(app, '#g-q')?.addEventListener(
        'input',
        (e) => {
          st.q = (e.target as HTMLInputElement).value;
          apply();
        },
        { signal },
      );
      qsa(app, '.g-room').forEach((b) =>
        b.addEventListener(
          'click',
          () => {
            st.f = b.dataset.room ?? 'todos';
            apply();
            wall.scrollIntoView({ behavior: motion.reduce ? 'auto' : 'smooth' });
          },
          { signal },
        ),
      );
    }
    const fill = (els: HTMLElement[], w: (el: HTMLElement) => string) => {
      if (typeof IntersectionObserver !== 'function')
        return els.forEach((el) => (el.style.width = w(el)));
      motion.observe(
        els,
        (en, io) => {
          if (!en.isIntersecting) return;
          const el = en.target as HTMLElement;
          el.style.width = w(el);
          io.unobserve(el);
        },
        { threshold: 0.5 },
      );
    };
    const bar = qs(app, '#g-bar');
    if (bar) {
      fill([bar], () => m.CAMPAIGN.pct + '%');
      motion.countUp(qs(app, '#g-raised'), m.CAMPAIGN.raised, fmt);
    }
    fill(qsa(app, '.g-nb'), (el) => (el.dataset.w ?? '0') + '%');
    motion.reveal(app, '.g-rv', { stagger: 100 });
    motion.magnet(app);
  },
};
