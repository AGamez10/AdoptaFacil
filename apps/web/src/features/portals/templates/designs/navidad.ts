import { EMPTY, type TplAnimal, type TplModel } from '../engine/model';
import { animalArt, leadImage, leadSource, meta, revealFallback } from '../engine/modern';
import { pic, premiumDesign, scopedTransition, vtName } from '../engine/premium';
import { availLine, fmt, logoMark, paw } from '../engine/runtime';

/*
 * Navidad (de pago y de temporada; ver `PORTAL_TEMPLATE_SEASONS`).
 * Pensada para que el visitante done o adopte en diciembre: una guirnalda de
 * luces arriba, nieve suave, una ventana con el animal de portada, cuántos días
 * faltan para Nochebuena, una "carta de deseos" por animal ("Mi deseo: un
 * hogar") y la campaña envuelta como un regalo con su cinta de avance.
 * Todo es CSS (sin bucles de JavaScript ni imágenes externas): las luces y la
 * nieve se apagan con `prefers-reduced-motion`. Colores con contraste AA.
 * Claro, "Día": papel crema, rojo y pino. Oscuro, "Nochebuena": noche de pino y oro.
 */
const CSS = `
.tpl-navidad{--k-fd:'Fraunces',Georgia,serif;--k-fw:700;--k-ls:-.025em;--k-r:22px;font-family:'Figtree',system-ui,sans-serif;--red:#B3202A;--pine:#1F5C3A;--gold:#C9962B}
.tpl-navidad[data-mode=light]{--k-bg:#FFF8F0;--k-ink:#2A1215;--k-soft:#6B4A4A;--k-line:rgba(42,18,21,.12);--k-card:#FFFFFF;--k-tint:#F7EADB;--k-acc:#B3202A;--k-acc-ink:#FFFFFF;--k-sh:0 0 0 1px rgba(42,18,21,.07),0 24px 40px -30px rgba(90,20,20,.45);--snow:rgba(179,32,42,.16);--ribbon:#B3202A;--hl:#1F5C3A;color-scheme:light}
.tpl-navidad[data-mode=dark]{--k-bg:#0D1913;--k-ink:#FFF4E6;--k-soft:#CDBCA8;--k-line:rgba(255,244,230,.14);--k-card:#14251C;--k-tint:rgba(255,244,230,.07);--k-acc:#E7B85A;--k-acc-ink:#2A1215;--k-sh:0 0 0 1px rgba(231,184,90,.18);--snow:rgba(255,255,255,.55);--ribbon:#D23A44;--hl:#E7B85A;color-scheme:dark}
.tpl-navidad .k-eb{color:var(--hl)}
.tpl-navidad .k-h2{font-variation-settings:'opsz' 144}
.tpl-navidad .rv{--i:0}

/* Nieve: dos capas de puntos que bajan despacio; quieta con movimiento reducido. */
.tpl-navidad .nv-snow{position:fixed;inset:0;pointer-events:none;z-index:1;opacity:.9;overflow:hidden}
.tpl-navidad .nv-snow::before,.tpl-navidad .nv-snow::after{content:"";position:absolute;inset:-100% 0 0;background-image:radial-gradient(3px 3px at 20px 30px,var(--snow) 50%,transparent 51%),radial-gradient(2px 2px at 90px 120px,var(--snow) 50%,transparent 51%),radial-gradient(4px 4px at 160px 60px,var(--snow) 50%,transparent 51%),radial-gradient(2px 2px at 230px 170px,var(--snow) 50%,transparent 51%);background-size:260px 220px}
.tpl-navidad .nv-snow::after{background-size:380px 300px;opacity:.7;filter:blur(1px)}
@media (prefers-reduced-motion:no-preference){
  .tpl-navidad .nv-snow::before{animation:nvSnow 28s linear infinite}
  .tpl-navidad .nv-snow::after{animation:nvSnow 46s linear infinite}
  @keyframes nvSnow{to{translate:0 50%}}
}
.tpl-navidad>*:not(.nv-snow){position:relative;z-index:2}

/* Guirnalda de luces. */
.tpl-navidad .nv-lights{display:flex;justify-content:space-between;gap:0;height:26px;padding-inline:8px;overflow:hidden;background:linear-gradient(180deg,var(--pine),transparent)}
.tpl-navidad[data-mode=dark] .nv-lights{background:linear-gradient(180deg,#07100B,transparent)}
.tpl-navidad .nv-lights i{flex:none;width:9px;height:14px;margin-top:6px;border-radius:50% 50% 45% 45%;background:var(--c);box-shadow:0 0 10px 2px color-mix(in srgb,var(--c) 70%,transparent)}
.tpl-navidad .nv-lights i:nth-child(4n+1){--c:#FF4D4D}
.tpl-navidad .nv-lights i:nth-child(4n+2){--c:#FFD24D}
.tpl-navidad .nv-lights i:nth-child(4n+3){--c:#4DE08A}
.tpl-navidad .nv-lights i:nth-child(4n){--c:#6FB7FF}
@media (prefers-reduced-motion:no-preference){
  .tpl-navidad .nv-lights i{animation:nvTw 2.4s ease-in-out infinite}
  .tpl-navidad .nv-lights i:nth-child(3n){animation-delay:-.8s}
  .tpl-navidad .nv-lights i:nth-child(3n+1){animation-delay:-1.6s}
  @keyframes nvTw{50%{opacity:.35;box-shadow:none}}
}
@media (max-width:700px){.tpl-navidad .nv-lights i:nth-child(n+19){display:none}}

/* Cabecera. */
.tpl-navidad .nv-top{position:sticky;top:0;z-index:40;background:color-mix(in srgb,var(--k-bg) 92%,transparent);box-shadow:0 1px 0 var(--k-line)}
.tpl-navidad .nv-top .w{display:flex;align-items:center;gap:12px;min-height:62px}
.tpl-navidad .nv-id{display:flex;align-items:center;gap:10px;text-decoration:none;min-width:0}
.tpl-navidad .nv-id i{width:36px;height:36px;border-radius:50%;display:grid;place-items:center;font-style:normal;font-weight:700;font-size:12px;background:var(--red);color:#fff;flex:none;overflow:hidden;box-shadow:0 0 0 2px var(--gold)}
.tpl-navidad .nv-id b{font-family:var(--k-fd);font-weight:700;font-size:17px;line-height:1.15;overflow-wrap:anywhere}
.tpl-navidad .nv-nav{display:flex;gap:2px;margin-left:auto}
.tpl-navidad .nv-nav a{padding:8px 12px;text-decoration:none;font-size:15px;color:var(--k-soft);border-radius:999px}
.tpl-navidad .nv-nav a:hover{color:var(--k-ink);background:var(--k-tint)}
.tpl-navidad .nv-top .k-mode{height:40px;font-size:13px}
.tpl-navidad .nv-don{display:inline-flex;align-items:center;gap:6px;min-height:42px;padding:0 18px;border-radius:999px;background:var(--k-acc);color:var(--k-acc-ink)!important;text-decoration:none;font-weight:700;font-size:15px;flex:none}
@media (max-width:860px){.tpl-navidad .nv-nav{display:none}.tpl-navidad .nv-top .k-mode{margin-left:auto;padding:0 11px}.tpl-navidad .nv-top .k-mode span{display:none}}

/* Portada. */
.tpl-navidad .nv-hero{padding-block:clamp(36px,6vw,88px) clamp(40px,6vw,80px)}
.tpl-navidad .nv-hero .w{display:grid;grid-template-columns:minmax(0,1.05fr) minmax(0,.95fr);gap:clamp(28px,5vw,72px);align-items:center}
@media (max-width:860px){.tpl-navidad .nv-hero .w{grid-template-columns:minmax(0,1fr)}}
.tpl-navidad .nv-tag{display:inline-flex;align-items:center;gap:8px;padding:7px 14px;border-radius:999px;background:var(--k-tint);color:var(--k-ink);font-weight:600;font-size:14px}
.tpl-navidad .nv-tag svg{width:16px;color:var(--red)}
.tpl-navidad[data-mode=dark] .nv-tag svg{color:var(--gold)}
.tpl-navidad .nv-h1{font-family:var(--k-fd);font-weight:800;font-size:clamp(44px,6.2vw,92px);line-height:.95;letter-spacing:-.035em;margin-top:18px;font-variation-settings:'opsz' 144}
.tpl-navidad .nv-h1 em{font-style:italic;color:var(--red)}
.tpl-navidad[data-mode=dark] .nv-h1 em{color:var(--gold)}
.tpl-navidad .nv-lede{font-size:clamp(18px,1.6vw,21px);line-height:1.55;color:var(--k-soft);max-width:30em;margin-top:18px}
.tpl-navidad .nv-cta{display:flex;flex-wrap:wrap;gap:12px;margin-top:26px}
.tpl-navidad .nv-cta .gh{display:inline-flex;align-items:center;gap:8px;min-height:54px;padding:0 22px;border-radius:999px;text-decoration:none;font-weight:700;color:var(--k-ink);box-shadow:inset 0 0 0 2px var(--k-line)}
.tpl-navidad .nv-cta svg{width:18px}
.tpl-navidad .nv-count{display:flex;flex-wrap:wrap;gap:10px 28px;margin-top:28px;color:var(--k-soft);font-size:14px}
.tpl-navidad .nv-count b{display:block;font-family:var(--k-fd);font-size:clamp(28px,3vw,40px);line-height:1;color:var(--k-ink);font-variant-numeric:tabular-nums}

.tpl-navidad .nv-win{position:relative;aspect-ratio:4/5;border-radius:999px 999px 28px 28px;overflow:hidden;background:var(--pine);box-shadow:0 0 0 10px var(--k-card),0 0 0 12px var(--gold),0 40px 60px -30px rgba(60,10,10,.5)}
.tpl-navidad .nv-win>.portrait,.tpl-navidad .nv-win>a,.tpl-navidad .nv-win>a>.portrait{position:absolute;inset:0}
.tpl-navidad .nv-win::after{content:"";position:absolute;inset:0;pointer-events:none;background:linear-gradient(180deg,transparent 55%,rgba(20,8,8,.55))}
.tpl-navidad .nv-art{position:absolute;inset:0;display:grid;place-items:center;background:radial-gradient(70% 60% at 50% 110%,#2E7D50,transparent 70%),#1F5C3A;color:#FFF4E6}
.tpl-navidad .nv-art svg{width:30%;opacity:.35}
.tpl-navidad .nv-wish{position:absolute;left:16px;right:16px;bottom:16px;z-index:1;display:flex;align-items:center;gap:10px;padding:12px 16px;border-radius:16px;background:rgba(255,248,240,.94);color:#2A1215;font-size:15px;line-height:1.35}
.tpl-navidad .nv-wish svg{width:22px;flex:none;color:#B3202A}
.tpl-navidad .nv-wish b{font-family:var(--k-fd)}
.tpl-navidad .nv-bow{position:absolute;top:-6px;left:50%;translate:-50% 0;z-index:2;width:74px;color:var(--red);filter:drop-shadow(0 6px 8px rgba(0,0,0,.25))}
.tpl-navidad .nv-winw{position:relative;max-width:460px;width:100%;justify-self:center;padding-top:18px}

/* Cómo participar: tres regalos. */
.tpl-navidad .k-act{border-top:6px solid var(--red)}
.tpl-navidad .k-act:nth-child(2){border-top-color:var(--pine)}
.tpl-navidad .k-act:nth-child(3){border-top-color:var(--gold)}
.tpl-navidad[data-mode=dark] .k-act:nth-child(2){border-top-color:#3FA36B}

/* Catálogo: carta de deseos por animal. */
.tpl-navidad .nv-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,230px),1fr));gap:clamp(18px,2vw,28px)}
.tpl-navidad .nv-card{display:flex;flex-direction:column;gap:12px;padding:12px 12px 18px;border-radius:var(--k-r);background:var(--k-card);box-shadow:var(--k-sh);text-decoration:none;color:inherit;transition:translate .4s cubic-bezier(.2,.8,.2,1)}
.tpl-navidad .nv-card:hover{translate:0 -6px}
.tpl-navidad .nv-card:nth-child(odd):hover{rotate:-.6deg}
.tpl-navidad .nv-card:nth-child(even):hover{rotate:.6deg}
.tpl-navidad .nv-card .ph{position:relative;aspect-ratio:1;border-radius:calc(var(--k-r) - 8px);overflow:hidden;background:var(--k-tint)}
.tpl-navidad .nv-card .ph .portrait{position:absolute;inset:0}
.tpl-navidad .nv-card .nw{position:absolute;top:10px;left:10px;padding:5px 10px;border-radius:999px;background:#FFF8F0;color:#2A1215;font-size:12px;font-weight:700}
.tpl-navidad .nv-card b{font-family:var(--k-fd);font-size:24px;line-height:1.05;padding:0 6px;overflow-wrap:anywhere}
.tpl-navidad .nv-card small{font-size:14px;color:var(--k-soft);padding:0 6px;margin-top:-6px}
.tpl-navidad .nv-card .ds{display:flex;align-items:center;gap:8px;margin:2px 6px 0;padding:8px 12px;border-radius:12px;background:var(--k-tint);font-size:14px;font-weight:600}
.tpl-navidad .nv-card .ds svg{width:16px;flex:none;color:var(--red)}
.tpl-navidad[data-mode=dark] .nv-card .ds svg{color:var(--gold)}

@media (max-width:560px){.tpl-navidad .nv-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.tpl-navidad .nv-card{padding:8px 8px 12px;gap:8px}.tpl-navidad .nv-card b{font-size:19px}.tpl-navidad .nv-card .ds{font-size:12px;padding:6px 8px;margin:0}}
/* Campaña envuelta como regalo. */
.tpl-navidad .nv-gift{position:relative;display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:clamp(24px,4vw,56px);align-items:center;padding:clamp(28px,5vw,64px);border-radius:clamp(24px,3vw,40px);background:var(--k-card);box-shadow:var(--k-sh);overflow:hidden}
.tpl-navidad .nv-gift::before,.tpl-navidad .nv-gift::after{content:"";position:absolute;background:var(--ribbon);opacity:.9;pointer-events:none}
.tpl-navidad .nv-gift::before{top:0;bottom:0;left:clamp(18px,3vw,34px);width:12px}
.tpl-navidad .nv-gift::after{left:0;right:0;top:clamp(18px,3vw,34px);height:12px}
.tpl-navidad .nv-gift>*{position:relative;z-index:1;padding-left:clamp(14px,2vw,22px)}
@media (max-width:860px){.tpl-navidad .nv-gift{grid-template-columns:minmax(0,1fr)}}
.tpl-navidad .nv-gift h2{font-family:var(--k-fd);font-weight:800;font-size:clamp(32px,4.4vw,60px);line-height:1;letter-spacing:-.03em;margin-top:12px}
.tpl-navidad .nv-gift .k-sub{margin-top:12px}
.tpl-navidad .nv-pct{font-family:var(--k-fd);font-weight:800;font-size:clamp(72px,12vw,160px);line-height:.85;color:var(--red);font-variant-numeric:tabular-nums}
.tpl-navidad[data-mode=dark] .nv-pct{color:var(--gold)}
.tpl-navidad .nv-bar{height:14px;border-radius:14px;background:var(--k-tint);overflow:hidden;margin-top:18px}
.tpl-navidad .nv-bar i{display:block;height:100%;width:100%;transform-origin:0 50%;scale:var(--v) 1;border-radius:14px;background:repeating-linear-gradient(-45deg,var(--red) 0 12px,#D9434C 12px 24px)}
.tpl-navidad[data-mode=dark] .nv-bar i{background:repeating-linear-gradient(-45deg,#E7B85A 0 12px,#F2CD7E 12px 24px)}
.tpl-navidad .nv-figs{display:flex;flex-wrap:wrap;gap:10px 30px;margin-top:18px}
.tpl-navidad .nv-figs span{display:block;font-size:13px;color:var(--k-soft)}
.tpl-navidad .nv-figs b{font-size:clamp(18px,1.8vw,24px);font-weight:700;font-variant-numeric:tabular-nums}
.tpl-navidad .nv-gift .k-btn{margin-top:22px}
.tpl-navidad .nv-gift .tpl-more{margin-top:18px}

.tpl-navidad .k-help{background:radial-gradient(80% 120% at 100% 0%,#2E7D50,transparent 60%),linear-gradient(135deg,#8E1520,#B3202A);color:#FFF8F0}
.tpl-navidad .k-help h2{font-family:var(--k-fd)}
.tpl-navidad .k-help .k-btn{background:#FFF8F0;color:#8E1520!important}
.tpl-navidad .nv-late{content-visibility:auto;contain-intrinsic-size:auto 760px}

/* Botón de donar siempre a mano en el celular. */
.tpl-navidad .nv-float{display:none}
@media (max-width:700px){
  .tpl-navidad .nv-float{position:fixed;left:16px;right:16px;bottom:max(14px,env(safe-area-inset-bottom));z-index:45;display:flex;justify-content:center;align-items:center;gap:8px;min-height:52px;border-radius:999px;background:var(--k-acc);color:var(--k-acc-ink)!important;font-weight:700;text-decoration:none;box-shadow:0 14px 30px -10px rgba(0,0,0,.45)}
  .tpl-navidad .nv-float svg{width:18px}
  .tpl-navidad .k-foot{padding-bottom:84px}
}

@media (prefers-reduced-motion:no-preference){
  @supports ((animation-timeline:view()) and (animation-range:entry)){
    .tpl-navidad .rv,.tpl-navidad .k-act,.tpl-navidad .k-nd,.tpl-navidad .k-pr,.tpl-navidad .k-revs figure{animation:nvIn linear both;animation-timeline:view();animation-range:entry calc(var(--i,0) * 5%) entry calc(65% + var(--i,0) * 5%)}
    @keyframes nvIn{from{opacity:0;translate:0 48px}}
    .tpl-navidad .nv-bar i{animation:nvFill linear both;animation-timeline:view();animation-range:entry 30% cover 45%}
    @keyframes nvFill{from{scale:0 1}}
  }
}

/* Libro público: el saldo se destaca en rojo de Navidad. */
.tpl-navidad{--lg-hi:linear-gradient(135deg,#8E1520,#B3202A)}
`;

const STAR = `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2l2.9 6.6 7.1.6-5.4 4.7 1.6 7L12 17.3 5.8 21l1.6-7L2 9.2l7.1-.6z"/></svg>`;
const HEART = `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 21s-7.5-4.6-9.6-9.3C.9 8.2 3 4.5 6.6 4.5c2.1 0 3.6 1.2 4.4 2.5.8-1.3 2.3-2.5 4.4-2.5 3.6 0 5.7 3.7 4.2 7.2C19.5 16.4 12 21 12 21z"/></svg>`;
const GIFT = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7M7.5 8a2.5 2.5 0 0 1 0-5C10 3 12 8 12 8s2-5 4.5-5a2.5 2.5 0 0 1 0 5"/></svg>`;
const BOW = `<svg viewBox="0 0 80 40" fill="currentColor" aria-hidden="true"><path d="M40 20C30 4 10 0 8 10s16 14 32 10zM40 20c10-16 30-20 32-10S56 24 40 20z"/><circle cx="40" cy="20" r="7"/><path d="M36 24l-8 16 8-3 4 3 1-16zM44 24l8 16-8-3-4 3-1-16z" opacity=".85"/></svg>`;

/** Días que faltan para Nochebuena en Colombia (UTC-5); 0 el 24 y después. */
function daysToNochebuena(now = new Date()): number {
  const co = new Date(now.getTime() - 5 * 3600_000);
  const y = co.getUTCMonth() === 0 ? co.getUTCFullYear() - 1 : co.getUTCFullYear();
  const eve = Date.UTC(y, 11, 24);
  const today = Date.UTC(co.getUTCFullYear(), co.getUTCMonth(), co.getUTCDate());
  return Math.max(0, Math.round((eve - today) / 86_400_000));
}

function countdown(): string {
  const d = daysToNochebuena();
  if (d === 0) return `<div><b>¡Feliz Navidad!</b>Gracias por estar aquí</div>`;
  return `<div><b>${d}</b>${d === 1 ? 'día' : 'días'} para Nochebuena</div>`;
}

const card = (a: TplAnimal, i: number) =>
  `<a class="nv-card rv" href="${a.href}" data-id="${a.id}" style="--i:${i % 4};view-transition-name:${vtName('nv', a.id)}"><span class="ph">${animalArt(a, { decor: true })}${a.isNew ? '<span class="nw">Recién llegado</span>' : ''}</span><b>${a.name}</b><small>${meta(a)}</small><span class="ds">${STAR}Mi deseo: un hogar</span></a>`;

function lights(): string {
  return `<div class="nv-lights" aria-hidden="true">${'<i></i>'.repeat(36)}</div>`;
}

function windowFrame(m: TplModel): string {
  const lead = leadSource(m);
  const inner =
    lead.kind === 'cover'
      ? leadImage(m.ORG.cover as string, `Portada de ${m.ORG.name}`)
      : lead.kind === 'animal' && lead.animal
        ? `<a href="${lead.animal.href}" aria-label="Conocer a ${lead.animal.name}">${animalArt(lead.animal, { lead: true, decor: true })}</a>`
        : `<span class="nv-art">${paw()}</span>`;
  const wish =
    lead.kind === 'animal' && lead.animal
      ? `<p class="nv-wish">${HEART}<span><b>${lead.animal.name}</b> pidió un solo regalo: una familia.</span></p>`
      : `<p class="nv-wish">${HEART}<span>Esta Navidad, <b>cada aporte</b> se convierte en comida, abrigo y cuidados.</span></p>`;
  return `<div class="nv-winw"><span class="nv-bow">${BOW}</span><div class="nv-win">${inner}${wish}</div></div>`;
}

export const navidad = premiumDesign({
  id: 'navidad',
  catId: 'nv-cat',
  modes: { light: 'Día', dark: 'Nochebuena' },
  fonts:
    'family=Fraunces:ital,opsz,wght@0,9..144,600..800;1,9..144,600..800&family=Figtree:wght@400..700',
  css: CSS,
  html({ m, P }) {
    const { ORG, ANIMALS, CAMPAIGN } = m;
    const n = ANIMALS.length;
    const missing = Math.max(0, CAMPAIGN.goal - CAMPAIGN.raised);
    const gifts = (t: string, d: string, i: number, href: string) =>
      `<a class="k-act" href="${href}"><b>${['Regala un hogar', 'Regala cuidados', 'Regala esperanza'][i] ?? t}</b><p>${d}</p><span class="k-go">${pic.arrow}</span></a>`;
    return `
<div class="nv-snow" aria-hidden="true"></div>
${lights()}
<header class="nv-top"><div class="w"><a class="nv-id" href="#nv-top"><i>${logoMark(m)}</i><b>${ORG.name}</b></a><nav class="nv-nav" aria-label="Secciones"><a href="#nv-cat">Adopta</a><a href="#nv-camp">Campaña</a><a href="#nv-ldg">Transparencia</a></nav>${P.modeBtn()}<a class="nv-don" href="${ORG.donateHref}">Donar</a></div></header>
${P.tbar()}
<section class="nv-hero" id="nv-top"><div class="w">
  <div>
    <p class="nv-tag">${STAR}Navidad en ${ORG.name}</p>
    <h1 class="nv-h1">Esta Navidad, <em>regala un hogar.</em></h1>
    <p class="nv-lede">${ORG.lede || availLine(m)}</p>
    <div class="nv-cta"><a class="k-btn" href="${ORG.donateHref}" data-magnet>${GIFT} Donar esta Navidad</a><a class="gh" href="#nv-cat">${n ? 'Conocerlos' : 'Cómo ayudar'} ${pic.arrow}</a></div>
    <div class="nv-count">${countdown()}<div><b>${n}</b>${n === 1 ? 'espera' : 'esperan'} su regalo</div>${CAMPAIGN.active ? `<div><b>${CAMPAIGN.pct}%</b>de la campaña</div>` : ''}</div>
  </div>
  ${windowFrame(m)}
</div></section>
${P.acts(P.hd('Cómo participar', 'Tres regalos que cambian una Navidad'), gifts)}
<section class="k-sec" data-sec="animales" id="nv-cat">
  <div class="w">${P.hd('En adopción', n === 1 ? 'Su carta dice: “quiero un hogar”.' : 'Sus cartas dicen: “queremos un hogar”.', '', n ? 'Busca por nombre o raza y conoce su historia.' : '')}
  ${n ? P.catControls('nv-f', 'Busca por nombre o raza') : ''}<div class="nv-grid" id="nv-grid">${n ? '' : `<p class="k-empty">${EMPTY.animales}</p>`}</div><button type="button" class="k-more" id="nv-more" hidden></button></div>
</section>
${P.campaign(
  () => `<section class="w k-sec" data-sec="campana" id="nv-camp"><div class="nv-gift">
  <div><p class="k-eb">Campaña de Navidad${CAMPAIGN.category ? ` · ${CAMPAIGN.category}` : ''}</p><h2>${CAMPAIGN.title}</h2>${CAMPAIGN.description ? `<p class="k-sub">${CAMPAIGN.description}</p>` : ''}<a class="k-btn" href="${CAMPAIGN.href}" data-magnet>${GIFT} Aportar a este regalo</a></div>
  <div><p class="nv-pct" aria-label="${CAMPAIGN.pct}% de la meta">${CAMPAIGN.pct}%</p><div class="nv-bar" aria-hidden="true"><i style="--v:${CAMPAIGN.pct / 100}"></i></div>
  <div class="nv-figs"><div><span>Recaudado</span><b>${fmt(CAMPAIGN.raised)}</b></div><div><span>${missing > 0 ? 'Faltan' : 'Meta'}</span><b>${fmt(missing > 0 ? missing : CAMPAIGN.goal)}</b></div><div><span>Cierra</span><b>${CAMPAIGN.deadline || '—'}</b></div></div>${P.more()}</div>
</div></section>`,
  P.hd('Campaña activa', 'Sin campaña por ahora'),
).replace('data-sec="campana">', 'data-sec="campana" id="nv-camp">')}
<div class="nv-late">${P.needs(P.hd('Lista de regalos', 'Lo que necesitan hoy'))}${P.prods(P.hd('Tienda solidaria', 'Regalos con causa'))}</div>
${P.help()}
<div class="nv-late">${P.about()}${P.revs()}</div>
<div class="nv-late" id="nv-ldg">${P.ledger()}</div>
${P.contact()}
${P.foot()}
<a class="nv-float" href="${ORG.donateHref}">${GIFT} Donar esta Navidad</a>`;
  },
  init(app, { env, fx, cat }) {
    fx.fillOnView(app, '.k-bar');
    fx.magnet(app);
    cat({
      id: 'nv-f',
      grid: '#nv-grid',
      more: '#nv-more',
      page: 12,
      render: (L) => L.map(card).join(''),
      transition: scopedTransition,
    });
    revealFallback(app, env, '.rv, .k-act, .k-nd, .k-pr, .k-revs figure');
  },
});
