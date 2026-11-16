import { COPY, type TplAnimal, type TplModel } from '../engine/model';
import { deco, pic, premiumDesign, type Fx } from '../engine/premium';
import { availLine, countPhrase, fmt, inCity, logoMark, qs, qsa, verb } from '../engine/runtime';

/*
 * Documental (Premium).
 * El video de la organización (30 a 60 s) abre el portal a pantalla completa y
 * no se queda ahí: al bajar, la imagen se encoge hasta volverse una pantalla
 * dentro de la página mientras aparecen los tres capítulos de la historia, y el
 * resto del portal sigue con el mismo lenguaje.
 * Claro, "Campo": película de campo sobre papel, con marcas de lápiz graso,
 * hoja de contactos por animal y notas a mano.
 * Oscuro, "Sala": sala de cine. El telón se abre en franjas, grano de película,
 * código de tiempo del video, el reparto en fotogramas con perforaciones y
 * créditos finales.
 * Sin video, la portada es un carrete con las fotos reales de los animales (o
 * la portada de la organización) en movimiento lento.
 */
const CSS = `
.tpl-documental{--k-fd:'Fraunces',Georgia,serif;--k-fw:600;--k-ls:-.025em;--k-r:18px;--mono:'JetBrains Mono',ui-monospace,monospace;font-family:'Inter',system-ui,sans-serif;--p:0;--q:0;--c:1}
.tpl-documental[data-mode=light]{--k-bg:#F4EFE6;--k-ink:#1C1A17;--k-soft:#5E574D;--k-line:rgba(28,26,23,.14);--k-card:#FFFCF6;--k-tint:rgba(28,26,23,.06);--k-sh:0 0 0 1px rgba(28,26,23,.08),0 18px 40px -30px rgba(28,26,23,.5);--pen:#D9622B;--frame:#FFFCF6;color-scheme:light}
.tpl-documental[data-mode=dark]{--k-bg:#0A0908;--k-ink:#F3EEE6;--k-soft:#A39C90;--k-line:rgba(243,238,230,.12);--k-card:#14120F;--k-tint:rgba(243,238,230,.06);--k-sh:0 0 0 1px rgba(243,238,230,.08);--k-acc:#E9C46A;--k-acc-ink:#1A1408;--pen:#E9C46A;--frame:#0A0908;color-scheme:dark}
.tpl-documental .k-h2{font-variation-settings:'opsz' 144}
.tpl-documental[data-mode=dark] .k-h2{text-transform:uppercase;letter-spacing:.01em;font-weight:500}
.tpl-documental .k-eb{font-family:var(--mono);font-weight:500;letter-spacing:.18em}

/* Cabecera sobre el video */
.tpl-documental .dc-top{position:absolute;inset:0 0 auto;z-index:6;color:#fff;opacity:var(--c)}
.tpl-documental .dc-top.is-gone{visibility:hidden}
.tpl-documental .dc-top .w{display:flex;align-items:center;gap:16px;padding-block:18px}
.tpl-documental .dc-logo{display:flex;align-items:center;gap:12px;text-decoration:none;font-family:var(--k-fd);font-weight:600;font-size:19px;letter-spacing:-.01em;color:#fff!important;text-shadow:0 1px 18px rgba(0,0,0,.4);min-width:0}
.tpl-documental .dc-logo span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tpl-documental .dc-logo i{flex:none;width:42px;height:42px;border-radius:50%;display:grid;place-items:center;font-style:normal;font-family:var(--mono);font-size:13px;background:rgba(255,255,255,.14);backdrop-filter:blur(10px);box-shadow:inset 0 0 0 1px rgba(255,255,255,.35);overflow:hidden}
.tpl-documental .dc-nav{display:flex;gap:2px;margin-left:auto}
.tpl-documental .dc-nav a{padding:10px 14px;border-radius:999px;text-decoration:none;font-weight:600;font-size:14px;color:rgba(255,255,255,.86)!important}
.tpl-documental .dc-nav a:hover{background:rgba(255,255,255,.14);color:#fff!important}
.tpl-documental .dc-top .k-mode{background:rgba(255,255,255,.14);color:#fff;backdrop-filter:blur(10px)}
@media (max-width:820px){.tpl-documental .dc-nav{display:none}.tpl-documental .dc-top .k-mode{margin-left:auto}.tpl-documental .dc-top .k-mode span{display:none}.tpl-documental .dc-top .k-mode{padding:0 12px}}

/* Película: contenedor alto + escenario fijo. Sin JS (o con menos movimiento) no hay recorrido. */
.tpl-documental .dc-film{position:relative}
.tpl-documental .dc-film[data-scrub]{height:250svh}
.tpl-documental .dc-stage{position:relative;height:100svh;min-height:560px;overflow:hidden;color:#fff;background:#0A0908}
.tpl-documental .dc-film[data-scrub] .dc-stage{position:sticky;top:0}
.tpl-documental .dc-media{position:absolute;inset:0;overflow:hidden;background:#0A0908;clip-path:inset(calc(var(--q) * 8svh) calc(var(--q) * 5vw) calc(var(--q) * 12svh) calc(var(--q) * 5vw) round calc(var(--q) * 26px));will-change:clip-path}
.tpl-documental[data-mode=light] .dc-stage{background:var(--k-bg)}
.tpl-documental[data-mode=light] .dc-media{box-shadow:0 0 0 calc(var(--q) * 14px) var(--frame)}
.tpl-documental .dc-v{opacity:0;transition:opacity 1.2s ease}
.tpl-documental .dc-v.on{opacity:1}
.tpl-documental .dc-v,.tpl-documental .dc-media > .portrait{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;transform:scale(calc(1.06 - var(--q) * .06));transform-origin:50% 40%}
.tpl-documental .dc-scrim{position:absolute;inset:0;pointer-events:none;background:linear-gradient(180deg,rgba(0,0,0,.55) 0%,rgba(0,0,0,0) 26%,rgba(0,0,0,0) 46%,rgba(0,0,0,.72) 100%),radial-gradient(120% 90% at 50% 40%,transparent 50%,rgba(0,0,0,.45))}
@media (max-width:620px){.tpl-documental .dc-scrim{background:linear-gradient(180deg,rgba(0,0,0,.55) 0%,rgba(0,0,0,.1) 24%,rgba(0,0,0,.55) 48%,rgba(0,0,0,.82) 100%)}}
.tpl-documental .dc-grain{position:absolute;inset:0;opacity:.22;mix-blend-mode:overlay;pointer-events:none;background-size:180px 180px}
.tpl-documental[data-mode=light] .dc-grain{display:none}

/* Carrete sin video: fotos reales que pasan despacio */
.tpl-documental .dc-reel{position:absolute;inset:0}
.tpl-documental .dc-sl{position:absolute;inset:0;opacity:0;transition:opacity 1.8s ease}
.tpl-documental .dc-sl.on{opacity:1}
.tpl-documental .dc-sl .portrait{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;animation:dcKen 16s ease-in-out infinite alternate}
.tpl-documental .dc-sl:nth-child(even) .portrait{animation-direction:alternate-reverse}
@keyframes dcKen{from{transform:scale(1.04) translate(0,0)}to{transform:scale(1.16) translate(-2.5%,-1.5%)}}
.tpl-documental .dc-reel.paused .portrait,.tpl-documental .dc-reel.paused .dc-track{animation-play-state:paused}
/* Sin fotos reales: una tira de película con los retratos, que avanza despacio */
.tpl-documental .dc-strip{position:absolute;inset:0;display:flex;align-items:center;overflow:hidden;background:radial-gradient(70% 90% at 75% 30%,color-mix(in srgb,var(--k-acc) 55%,transparent),transparent 70%),radial-gradient(60% 80% at 10% 90%,color-mix(in srgb,var(--k-acc) 30%,transparent),transparent 70%),#14110D}
.tpl-documental .dc-track{position:relative;display:flex;gap:clamp(14px,2vw,28px);padding:26px clamp(14px,2vw,28px);background:#050505;rotate:-6deg;scale:1.15;translate:0 -4%;animation:dcPan 70s linear infinite;box-shadow:0 30px 80px rgba(0,0,0,.5)}
.tpl-documental .dc-track::before,.tpl-documental .dc-track::after{content:"";position:absolute;left:0;right:0;height:10px;background:repeating-linear-gradient(90deg,rgba(255,255,255,.22) 0 14px,transparent 14px 28px)}
.tpl-documental .dc-track::before{top:8px}
.tpl-documental .dc-track::after{bottom:8px}
.tpl-documental .dc-sf{position:relative;flex:none;width:clamp(170px,21vw,330px);aspect-ratio:3/4;border-radius:6px;overflow:hidden}
.tpl-documental .dc-sf .portrait{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
@keyframes dcPan{to{transform:translateX(-50%)}}

/* Telón de cine (oscuro): las franjas quedan como formato panorámico */
.tpl-documental .dc-bars{position:absolute;inset:0;pointer-events:none;z-index:2}
.tpl-documental .dc-bars i{position:absolute;left:0;right:0;height:7svh;background:#000}
.tpl-documental .dc-bars i:first-child{top:0}
.tpl-documental .dc-bars i:last-child{bottom:0}
.tpl-documental[data-mode=dark] .dc-bars i:first-child{animation:dcTop 1.6s cubic-bezier(.7,0,.2,1) .2s both}
.tpl-documental[data-mode=dark] .dc-bars i:last-child{animation:dcBot 1.6s cubic-bezier(.7,0,.2,1) .2s both}
@keyframes dcTop{from{height:50.5svh}}
@keyframes dcBot{from{height:50.5svh}}
.tpl-documental[data-mode=light] .dc-bars{display:none}
.tpl-documental .dc-bars{opacity:calc(1 - var(--q))}

/* HUD: código de tiempo / cuaderno */
.tpl-documental .dc-hud{position:absolute;z-index:3;top:calc(7svh + 84px);right:max(16px,4vw);display:flex;align-items:center;gap:10px;font-family:var(--mono);font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:rgba(255,255,255,.82);opacity:var(--c)}
.tpl-documental .dc-hud b{display:inline-block;width:9px;height:9px;border-radius:50%;background:#FF3B30;box-shadow:0 0 12px #FF3B30;animation:dcRec 1.2s steps(2) infinite}
@keyframes dcRec{50%{opacity:.15}}
.tpl-documental[data-mode=light] .dc-hud{top:88px}
.tpl-documental[data-mode=light] .dc-hud b{background:var(--pen);box-shadow:none;animation:none;border-radius:2px;transform:rotate(45deg)}
@media (max-width:620px){.tpl-documental .dc-hud,.tpl-documental[data-mode=light] .dc-hud{top:92px;left:16px;right:auto;font-size:11px}}

/* Texto del inicio */
.tpl-documental .dc-copy{position:absolute;z-index:4;left:0;right:0;bottom:calc(7svh + clamp(28px,6svh,72px));opacity:var(--c);transform:translateY(calc((1 - var(--c)) * -40px))}
.tpl-documental .dc-pre{font-family:var(--mono);font-size:13px;letter-spacing:.24em;text-transform:uppercase;color:rgba(255,255,255,.85);display:flex;align-items:center;gap:14px}
.tpl-documental .dc-pre::before{content:"";width:36px;height:1px;background:currentColor}
.tpl-documental .dc-h1{font-family:var(--k-fd);font-weight:500;font-size:clamp(46px,8.2vw,132px);line-height:.88;letter-spacing:-.035em;margin-top:14px;max-width:11em;text-wrap:balance;font-variation-settings:'opsz' 144;text-shadow:0 2px 40px rgba(0,0,0,.35)}
.tpl-documental[data-mode=dark] .dc-h1{text-transform:uppercase;letter-spacing:-.01em;font-weight:400;line-height:.92}
.tpl-documental[data-mode=light] .dc-h1{font-style:italic}
.tpl-documental .dc-h1 .ln{display:block;overflow:hidden;padding-bottom:.04em}
.tpl-documental .dc-h1 .ln > span{display:inline-block;animation:dcRise 1.3s cubic-bezier(.2,.8,.2,1) calc(.5s + var(--d,0s)) both}
@keyframes dcRise{from{transform:translateY(105%)}}
.tpl-documental .dc-lede{margin-top:20px;font-size:clamp(16px,1.5vw,20px);line-height:1.55;max-width:36em;color:rgba(255,255,255,.88);animation:dcIn 1.2s ease 1.1s both}
.tpl-documental .dc-cta{display:flex;flex-wrap:wrap;gap:12px;margin-top:26px;animation:dcIn 1.2s ease 1.3s both}
@keyframes dcIn{from{opacity:0;transform:translateY(14px)}}
.tpl-documental .dc-cta .k-btn{background:#fff;color:#111!important}
.tpl-documental[data-mode=dark] .dc-cta .k-btn{background:var(--k-acc);color:var(--k-acc-ink)!important}
.tpl-documental .dc-ghost{display:inline-flex;align-items:center;gap:10px;min-height:54px;padding:0 24px;border-radius:999px;text-decoration:none;font-weight:700;color:#fff!important;box-shadow:inset 0 0 0 1.5px rgba(255,255,255,.6);backdrop-filter:blur(8px)}
.tpl-documental .dc-ghost svg{width:18px}

/* Controles del video (pausar siempre disponible, sonido opcional) */
.tpl-documental .dc-ctrl{position:absolute;z-index:5;right:max(16px,4vw);bottom:calc(7svh + 22px);display:flex;gap:8px;opacity:var(--c)}
.tpl-documental .dc-ctrl button{display:inline-flex;align-items:center;gap:8px;height:44px;padding:0 16px;border-radius:999px;border:0;cursor:pointer;font-weight:600;font-size:13px;color:#fff;background:rgba(0,0,0,.42);backdrop-filter:blur(10px);box-shadow:inset 0 0 0 1px rgba(255,255,255,.28)}
.tpl-documental .dc-ctrl button:hover{background:rgba(0,0,0,.6)}
.tpl-documental .dc-ctrl svg{width:16px;height:16px}
.tpl-documental .dc-ctrl button[aria-pressed=true]{background:#fff;color:#111}
@media (max-width:620px){.tpl-documental .dc-ctrl{bottom:auto;top:84px;right:16px}.tpl-documental .dc-ctrl button span{display:none}.tpl-documental .dc-ctrl button{width:44px;padding:0;justify-content:center}}
.tpl-documental .dc-cue{position:absolute;z-index:4;left:50%;bottom:calc(7svh + 10px);translate:-50% 0;display:flex;flex-direction:column;align-items:center;gap:6px;font-family:var(--mono);font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:rgba(255,255,255,.7)!important;text-decoration:none;opacity:var(--c)}
.tpl-documental .dc-cue i{width:1px;height:34px;background:linear-gradient(rgba(255,255,255,.8),transparent);animation:dcCue 2s ease-in-out infinite}
@keyframes dcCue{0%{transform:scaleY(0);transform-origin:top}50%{transform:scaleY(1);transform-origin:top}51%{transform-origin:bottom}100%{transform:scaleY(0);transform-origin:bottom}}
@media (max-width:620px){.tpl-documental .dc-cue{display:none}}

/* Capítulos: sobre la pantalla durante el recorrido; en lista sin él */
.tpl-documental .dc-chap{list-style:none;margin:0;padding:0}
.tpl-documental .dc-chap li{display:flex;flex-direction:column;gap:12px}
.tpl-documental .dc-chap small{font-family:var(--mono);font-size:12px;letter-spacing:.22em;text-transform:uppercase;color:var(--pen)}
.tpl-documental .dc-chap b{font-family:var(--k-fd);font-weight:500;font-size:clamp(30px,4.6vw,72px);line-height:1;letter-spacing:-.02em;text-wrap:balance}
.tpl-documental[data-mode=dark] .dc-chap b{text-transform:uppercase;letter-spacing:0;font-weight:400}
.tpl-documental .dc-film[data-scrub] .dc-chap{position:sticky;top:0;z-index:4;height:100svh;min-height:560px;margin-top:max(-100svh,-560px);pointer-events:none}
.tpl-documental .dc-film[data-scrub] .dc-chap li{position:absolute;left:50%;top:50%;width:min(880px,82vw);translate:-50% -50%;text-align:center;align-items:center;color:#fff;opacity:0;filter:blur(8px);transform:translateY(24px);transition:opacity .7s ease,filter .7s ease,transform .9s cubic-bezier(.2,.8,.2,1);text-shadow:0 2px 30px rgba(0,0,0,.5)}
.tpl-documental .dc-film[data-scrub] .dc-chap li.on{opacity:1;filter:none;transform:none}
.tpl-documental .dc-film[data-scrub] .dc-chap small{color:#fff;opacity:.85}
.tpl-documental[data-mode=dark] .dc-film[data-scrub] .dc-chap small{color:var(--k-acc);opacity:1}
.tpl-documental .dc-film:not([data-scrub]) .dc-chap{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:clamp(18px,3vw,40px);max-width:1320px;margin:0 auto;padding:clamp(40px,6vw,80px) max(16px,4vw) 0}
.tpl-documental .dc-film:not([data-scrub]) .dc-chap b{font-size:clamp(24px,2.4vw,34px)}
@media (max-width:760px){.tpl-documental .dc-film:not([data-scrub]) .dc-chap{grid-template-columns:minmax(0,1fr)}}

/* Reparto */
.tpl-documental .dc-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:clamp(14px,2vw,26px)}
@media (max-width:1080px){.tpl-documental .dc-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}
@media (max-width:760px){.tpl-documental .dc-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}}
.tpl-documental .dc-fr{position:relative;display:flex;flex-direction:column;text-decoration:none;color:inherit!important}
.tpl-documental .dc-ph{position:relative;display:block;aspect-ratio:4/5;overflow:hidden}
.tpl-documental .dc-ph .portrait{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;transition:transform 1s cubic-bezier(.2,.8,.2,1),filter .6s}
.tpl-documental .dc-fr:hover .dc-ph .portrait,.tpl-documental .dc-fr:focus-visible .dc-ph .portrait{transform:scale(1.06)}
.tpl-documental .dc-cap{display:flex;flex-direction:column;gap:2px;padding-top:12px;min-width:0}
.tpl-documental .dc-cap small{font-family:var(--mono);font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--k-soft)}
.tpl-documental .dc-cap b{font-family:var(--k-fd);font-weight:600;font-size:clamp(22px,2vw,28px);line-height:1.05;letter-spacing:-.015em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tpl-documental .dc-cap span{font-size:14px;color:var(--k-soft)}
.tpl-documental .dc-tag{position:absolute;z-index:2;top:10px;left:10px;font-family:var(--mono);font-size:10px;letter-spacing:.14em;text-transform:uppercase;padding:5px 8px;border-radius:4px;background:var(--pen);color:#fff}
.tpl-documental[data-mode=dark] .dc-tag{color:var(--k-acc-ink)}
/* Claro: hoja de contactos con marca de lápiz graso */
.tpl-documental[data-mode=light] .dc-ph{background:#1C1A17;padding:10px 10px 26px;border-radius:2px;box-shadow:0 14px 30px -22px rgba(28,26,23,.8)}
.tpl-documental[data-mode=light] .dc-ph .portrait{inset:10px 10px 26px;width:calc(100% - 20px);height:calc(100% - 36px)}
.tpl-documental[data-mode=light] .dc-ph::after{content:attr(data-n);position:absolute;left:12px;bottom:6px;font-family:var(--mono);font-size:10px;letter-spacing:.12em;color:#F2B544}
.tpl-documental .dc-pen{position:absolute;z-index:2;inset:-6%;width:112%;height:112%;pointer-events:none;color:var(--pen);overflow:visible}
.tpl-documental .dc-pen path{fill:none;stroke:currentColor;stroke-width:3.2;stroke-linecap:round;stroke-dasharray:1;stroke-dashoffset:1;transition:stroke-dashoffset .7s cubic-bezier(.6,0,.3,1)}
.tpl-documental .dc-fr:hover .dc-pen path,.tpl-documental .dc-fr:focus-visible .dc-pen path{stroke-dashoffset:0}
.tpl-documental[data-mode=dark] .dc-pen{display:none}
/* Oscuro: fotogramas con perforaciones */
.tpl-documental[data-mode=dark] .dc-ph{padding:18px 0;background:#000;border-radius:4px}
.tpl-documental[data-mode=dark] .dc-ph .portrait{inset:18px 0;height:calc(100% - 36px);filter:saturate(.85) contrast(1.05)}
.tpl-documental[data-mode=dark] .dc-fr:hover .dc-ph .portrait{filter:none}
.tpl-documental[data-mode=dark] .dc-ph::before,.tpl-documental[data-mode=dark] .dc-ph::after{content:"";position:absolute;left:6px;right:6px;height:8px;background:repeating-linear-gradient(90deg,#3A342C 0 10px,transparent 10px 20px);border-radius:2px}
.tpl-documental[data-mode=dark] .dc-ph::before{top:5px}
.tpl-documental[data-mode=dark] .dc-ph::after{bottom:5px}
.tpl-documental[data-mode=dark] .dc-cap b{text-transform:uppercase;font-weight:500;letter-spacing:.01em}
.tpl-documental .dc-go{font-size:13px;font-weight:700;color:var(--k-acc)!important;margin-top:6px;display:inline-flex;align-items:center;gap:6px;opacity:0;transform:translateX(-6px);transition:opacity .3s,transform .3s}
.tpl-documental .dc-go svg{width:14px}
.tpl-documental .dc-fr:hover .dc-go,.tpl-documental .dc-fr:focus-visible .dc-go{opacity:1;transform:none}
@media (hover:none){.tpl-documental .dc-go{opacity:1;transform:none}}

/* Campaña: estreno */
.tpl-documental .dc-camp{position:relative;display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,.9fr);gap:clamp(24px,4vw,64px);align-items:end;padding:clamp(28px,5vw,72px);border-radius:var(--k-r);background:var(--k-card);box-shadow:var(--k-sh);overflow:hidden}
.tpl-documental[data-mode=dark] .dc-camp{background:radial-gradient(90% 120% at 100% 0%,rgba(233,196,106,.16),transparent 60%),#14120F}
.tpl-documental .dc-camp h2{font-family:var(--k-fd);font-weight:500;font-size:clamp(36px,5vw,76px);line-height:.98;letter-spacing:-.02em;margin-top:12px}
.tpl-documental[data-mode=dark] .dc-camp h2{text-transform:uppercase;font-weight:400;letter-spacing:0}
.tpl-documental .dc-figs{display:grid;grid-template-columns:1fr 1fr;gap:18px 24px;margin:0}
.tpl-documental .dc-figs dt{font-family:var(--mono);font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:var(--k-soft)}
.tpl-documental .dc-figs dd{margin:4px 0 0;font-family:var(--k-fd);font-size:clamp(24px,2.6vw,36px);font-variant-numeric:tabular-nums;font-weight:500}
.tpl-documental .dc-camp .k-bar{height:6px;margin:22px 0 26px;grid-column:1/-1}
@media (max-width:860px){.tpl-documental .dc-camp{grid-template-columns:minmax(0,1fr)}}

/* Créditos finales */
.tpl-documental .dc-credits{position:relative;height:clamp(360px,62svh,560px);overflow:hidden;text-align:center;-webkit-mask:linear-gradient(transparent,#000 18%,#000 82%,transparent);mask:linear-gradient(transparent,#000 18%,#000 82%,transparent)}
.tpl-documental .dc-roll{display:flex;flex-direction:column;align-items:center;gap:30px;padding-block:20px}
.tpl-documental .dc-roll{animation:dcRoll var(--dur,40s) linear infinite}
.tpl-documental .dc-credits:hover .dc-roll,.tpl-documental .dc-credits:focus-within .dc-roll{animation-play-state:paused}
@keyframes dcRoll{from{transform:translateY(clamp(360px,62svh,560px))}to{transform:translateY(-100%)}}
.tpl-documental .dc-roll small{font-family:var(--mono);font-size:12px;letter-spacing:.24em;text-transform:uppercase;color:var(--k-soft)}
.tpl-documental .dc-roll b{display:block;font-family:var(--k-fd);font-weight:500;font-size:clamp(22px,2.4vw,32px);margin-top:6px}
.tpl-documental .dc-roll ul{list-style:none;margin:8px 0 0;padding:0;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px 40px;font-family:var(--k-fd);font-size:clamp(18px,1.8vw,24px)}
.tpl-documental .dc-roll li span{color:var(--k-soft);font-family:'Inter',sans-serif;font-size:14px;margin-left:8px}
.tpl-documental[data-mode=dark] .dc-roll b,.tpl-documental[data-mode=dark] .dc-roll ul{text-transform:uppercase}

/* Detalles del modo claro y oscuro sobre el kit */
.tpl-documental[data-mode=light] .k-act{border-radius:6px}
.tpl-documental[data-mode=light] .k-act b{font-style:italic}
.tpl-documental[data-mode=light] .k-act .k-go{background:var(--pen);color:#fff}
.tpl-documental[data-mode=light] .k-help{border-radius:6px;background:#1C1A17;color:#F4EFE6}
.tpl-documental[data-mode=light] .k-help h2{font-style:italic}
.tpl-documental[data-mode=light] .k-help .k-btn{background:var(--pen);color:#fff!important}
.tpl-documental[data-mode=dark] .k-act{border-radius:6px;background:#14120F}
.tpl-documental[data-mode=dark] .k-act .k-go{background:var(--k-acc);color:var(--k-acc-ink)}
.tpl-documental[data-mode=dark] .k-act b,.tpl-documental[data-mode=dark] .k-help h2{text-transform:uppercase;font-weight:400;letter-spacing:0}
.tpl-documental[data-mode=dark] .k-help{border-radius:6px;background:radial-gradient(80% 120% at 50% 0%,rgba(233,196,106,.2),transparent 60%),#14120F;color:var(--k-ink);box-shadow:inset 0 0 0 1px var(--k-line)}
.tpl-documental[data-mode=dark] .k-help h2{color:var(--k-acc)}
.tpl-documental[data-mode=dark] .k-help .k-btn{background:var(--k-acc);color:var(--k-acc-ink)!important}
.tpl-documental .k-chip[aria-pressed="true"]{background:var(--pen);color:#fff}
.tpl-documental[data-mode=dark] .k-chip[aria-pressed="true"],.tpl-documental[data-mode=dark] .k-more{background:var(--k-acc);color:var(--k-acc-ink)}

@media (prefers-reduced-motion:reduce){
.tpl-documental .dc-sl .portrait,.tpl-documental .dc-track,.tpl-documental .dc-roll,.tpl-documental .dc-h1 .ln > span,.tpl-documental .dc-lede,.tpl-documental .dc-cta,.tpl-documental .dc-bars i,.tpl-documental .dc-cue i,.tpl-documental .dc-hud b{animation:none!important}
.tpl-documental .dc-credits{height:auto;-webkit-mask:none;mask:none}
}
`;

const PLAY = `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.4-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z"/></svg>`;
const PAUSE = `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>`;
const MUTED = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4z"/><path d="m22 9-6 6M16 9l6 6"/></svg>`;
const SOUND = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/></svg>`;
/** Círculo de lápiz graso (hoja de contactos). `pathLength=1` para animar el trazo. */
const PEN = `<svg class="dc-pen" viewBox="0 0 100 125" preserveAspectRatio="none" aria-hidden="true"><path pathLength="1" d="M52 4C24 2 6 24 5 60c-1 38 20 60 48 60 30 0 44-26 43-60C95 26 78 6 46 7"/></svg>`;

const two = (n: number) => String(n).padStart(2, '0');

/** Título partido en líneas para que suban una a una. Recibe texto ya escapado. */
function titleLines(name: string): string {
  const words = name.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    if (cur && (cur + ' ' + w).length > 14) {
      lines.push(cur);
      cur = w;
    } else cur = cur ? `${cur} ${w}` : w;
  }
  if (cur) lines.push(cur);
  return lines
    .map(
      (l, i) => `<span class="ln"><span style="--d:${(i * 0.12).toFixed(2)}s">${l}</span></span>`,
    )
    .join('');
}

/** Lo que se ve detrás del título: el video, o un carrete con fotos reales. */
function media(m: TplModel): string {
  if (m.VIDEOS.length) {
    // Con dos videos se reproducen uno tras otro (el segundo carga solo al llegar su turno).
    const n = m.VIDEOS.length;
    return m.VIDEOS.map((v, i) => {
      const poster = v.poster ?? m.ORG.cover;
      const attrs = i === 0 ? 'autoplay loop preload="metadata"' : 'preload="none"';
      return `<video class="dc-v${i === 0 ? ' on' : ''}" src="${v.src}"${poster ? ` poster="${poster}"` : ''} ${attrs} muted playsinline aria-label="Video ${n > 1 ? `${i + 1} de ${n} ` : ''}de ${m.ORG.name}"${i ? ' aria-hidden="true"' : ''} data-dc-video></video>`;
    }).join('');
  }
  const photos = m.ANIMALS.filter((a) => a.photo).slice(0, 6);
  const slides: string[] = m.ORG.cover
    ? [
        `<img class="portrait portrait--photo" src="${m.ORG.cover}" alt="" decoding="async" referrerpolicy="no-referrer" aria-hidden="true">`,
      ]
    : [];
  for (const a of photos) slides.push(deco(a, { dx: 12, dy: 18, s: 1 }));
  if (slides.length) {
    return `<div class="dc-reel" aria-hidden="true">${slides
      .slice(0, 6)
      .map((s, i) => `<span class="dc-sl${i ? '' : ' on'}">${s}</span>`)
      .join('')}</div>`;
  }
  // Sin fotos: tira de película con los retratos ilustrados (dos vueltas para el bucle).
  const cast = m.ANIMALS.slice(0, 6);
  const frames = cast
    .map((a) => `<span class="dc-sf">${deco(a, { dx: 10, dy: 16, s: 1 })}</span>`)
    .join('');
  return `<div class="dc-reel dc-strip" aria-hidden="true">${frames ? `<div class="dc-track">${frames}${frames}</div>` : ''}</div>`;
}

/** Los tres capítulos que aparecen sobre la pantalla. Solo datos reales. */
function chapters(m: TplModel): string {
  const { COUNTS, CAMPAIGN } = m;
  const first = COUNTS.total
    ? `${countPhrase(m)} ${verb(m, 'espera', 'esperan')} un hogar${inCity(m)}`
    : 'Pronto llegan nuevas historias a este portal';
  const second = CAMPAIGN.active
    ? `${CAMPAIGN.title}: ${CAMPAIGN.pct}% de la meta`
    : 'Lo que entra y lo que se gasta, a la vista en el libro público';
  const third = 'El final lo escribes tú: adopta, apadrina o dona';
  return `<ol class="dc-chap" aria-label="La historia en tres capítulos">${[first, second, third]
    .map((t, i) => `<li data-i="${i}"><small>Capítulo ${i + 1}</small><b>${t}</b></li>`)
    .join('')}</ol>`;
}

const ageLine = (a: TplAnimal) => [a.spLabel, a.age, a.sizeLabel].filter(Boolean).join(' · ');

function frame(a: TplAnimal, mode: 'light' | 'dark'): string {
  const tag = a.isNew ? 'Recién llegado' : a.days > 90 ? 'Espera hace tiempo' : '';
  const n = mode === 'light' ? `${a.i + 1}A ▸` : '';
  return `<a class="dc-fr" href="${a.href}" data-id="${a.id}">${tag ? `<span class="dc-tag">${tag}</span>` : ''}<span class="dc-ph" data-n="${n}">${deco(a, { dx: 10, dy: 16, s: 1.05 })}</span>${mode === 'light' ? PEN : ''}<span class="dc-cap"><small>${mode === 'light' ? `Toma ${two(a.i + 1)}` : `Escena ${two(a.i + 1)}`}</small><b>${a.name}</b><span>${ageLine(a)}</span><span class="dc-go">Ver su historia ${pic.arrow}</span></span></a>`;
}

/** Créditos finales: el reparto real y quien produce. */
function credits(m: TplModel): string {
  const cast = m.ANIMALS.slice(0, 24);
  const castList = cast.length
    ? `<div><small>Reparto</small><ul>${cast.map((a) => `<li>${a.name}<span>${a.spLabel.toLowerCase()}</span></li>`).join('')}</ul></div>`
    : '';
  const dur = Math.max(26, 18 + cast.length * 1.6);
  return `<section class="w dc-credits" aria-label="Créditos"><div class="dc-roll" style="--dur:${dur.toFixed(0)}s"><div><small>Una producción de</small><b>${m.ORG.name}</b></div>${castList}<div><small>Con el apoyo de</small><b>quienes adoptan, apadrinan y donan</b></div><div><small>Hecho con</small><b>AdoptaFácil</b></div></div></section>`;
}

export const documental = premiumDesign({
  id: 'documental',
  catId: 'dc-cat',
  modes: { light: 'Campo', dark: 'Sala de cine' },
  fonts:
    'family=Fraunces:ital,opsz,wght@0,9..144,300..700;1,9..144,300..700&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@500',
  css: CSS,
  html({ m, P, mode }) {
    const { ORG, ANIMALS, CAMPAIGN } = m;
    const n = ANIMALS.length;
    const lede = ORG.lede || availLine(m);
    const nav = `<nav class="dc-nav" aria-label="Secciones"><a href="#dc-cat">Reparto</a><a href="#dc-camp">Campaña</a><a href="#dc-ldg">Libro público</a></nav>`;
    const top = `<header class="dc-top"><div class="w"><a class="dc-logo" href="#dc-cat"><i>${logoMark(m)}</i><span>${ORG.name}</span></a>${nav}${P.modeBtn()}</div></header>`;
    const hud =
      mode === 'dark'
        ? `<div class="dc-hud" aria-hidden="true"><b></b><span data-dc-tc>${m.VIDEO ? `${m.VIDEOS.length > 1 ? 'Rollo 1/2 · ' : ''}00:00:00:00` : 'En rodaje'}</span></div>`
        : `<div class="dc-hud" aria-hidden="true"><b></b><span>Cuaderno de campo${ORG.city ? ` · ${ORG.city}` : ''}</span></div>`;
    const ctrl = `<div class="dc-ctrl"><button type="button" data-dc-play aria-pressed="false">${PAUSE}<span>Pausar</span></button>${m.VIDEO ? `<button type="button" data-dc-sound aria-pressed="false">${MUTED}<span>Activar sonido</span></button>` : ''}</div>`;
    const stage = `<div class="dc-film" id="dc-film"><section class="dc-stage" aria-labelledby="dc-h1">${top}<div class="dc-media">${media(m)}<div class="dc-scrim"></div>${mode === 'dark' ? '<div class="dc-grain" aria-hidden="true"></div>' : ''}</div><div class="dc-bars" aria-hidden="true"><i></i><i></i></div>${hud}
      <div class="w dc-copy"><p class="dc-pre">${mode === 'dark' ? 'Un documental de' : 'Una película de campo de'} ${ORG.short}</p><h1 id="dc-h1" class="dc-h1">${titleLines(ORG.name)}</h1><p class="dc-lede">${lede}</p>
      <div class="dc-cta"><a class="k-btn" href="#dc-cat" data-magnet>${n ? 'Conoce a quién espera' : 'Conoce el refugio'} ${pic.arrow}</a><a class="dc-ghost" href="${ORG.donateHref}">${pic.heart}${COPY.helpCta}</a></div></div>
      ${ctrl}<a class="dc-cue" href="#dc-cat"><span>Desliza</span><i></i></a></section>${chapters(m)}</div>`;

    const camp = P.campaign(
      () =>
        `<section class="w k-sec" data-sec="campana" id="dc-camp"><div class="dc-camp"><div><p class="k-eb">${mode === 'dark' ? 'Próximo estreno' : 'Expedición en curso'}${CAMPAIGN.category ? ` · ${CAMPAIGN.category}` : ''}</p><h2>${CAMPAIGN.title}</h2>${CAMPAIGN.description ? `<p class="k-sub">${CAMPAIGN.description}</p>` : ''}</div>
        <div><dl class="dc-figs"><div><dt>Recaudado</dt><dd id="dc-raised">${fmt(CAMPAIGN.raised)}</dd></div><div><dt>Meta</dt><dd>${fmt(CAMPAIGN.goal)}</dd></div><div><dt>Avance</dt><dd>${CAMPAIGN.pct}%</dd></div><div><dt>${CAMPAIGN.deadlineShort ? 'Cierra' : 'Faltan'}</dt><dd>${CAMPAIGN.deadlineShort || `${CAMPAIGN.daysLeft} días`}</dd></div></dl></div>
        <div class="k-bar" data-w="${Math.max(2, CAMPAIGN.pct)}"><i></i></div><div><a class="k-btn" href="${CAMPAIGN.href}" data-magnet>Ver campaña y aportar ${pic.arrow}</a>${P.more()}</div></div></section>`,
      P.hd(mode === 'dark' ? 'Cartelera' : 'Expediciones', 'Sin campaña por ahora'),
    );

    return `${stage}${P.tbar()}
      ${P.acts(P.hd(mode === 'dark' ? 'Tu papel en esta historia' : 'Cómo sumarte', 'Adopta, apadrina o dona'))}
      <section class="w k-sec" data-sec="animales" id="dc-cat">${P.hd(mode === 'dark' ? 'El reparto' : 'Hoja de contactos', 'Mascotas en adopción', '', n ? 'Cada toma es un animal que espera. Ábrela para conocer su historia completa.' : '')}${P.catControls('dc-f')}<div class="dc-grid" id="dc-grid"></div><button type="button" class="k-more" id="dc-more" hidden></button></section>
      ${camp}
      ${P.needs()}${P.prods(P.hd('Tienda solidaria', 'Productos'), mode === 'dark' ? '#1A1714' : '#EDE6DA')}${P.help()}${P.about()}${P.revs(P.hd(mode === 'dark' ? 'Críticas' : 'Lo que dicen', 'Reseñas', `<button type="button" class="k-lnk" data-review>Registrar reseña ${pic.arrow}</button>`))}<div id="dc-ldg">${P.ledger()}</div>${P.contact()}${credits(m)}${P.foot()}`;
  },
  init(app, { m, mode, fx, cat }) {
    fx.fillOnView(app, '.k-bar');
    fx.countUp(qs(app, '#dc-raised'), m.CAMPAIGN.raised, fmt);
    fx.magnet(app);
    fx.reveal(app, '.k-act,.k-nd,.k-pr,.k-revs figure,.dc-camp', { stagger: 80 });
    cat({
      id: 'dc-f',
      grid: '#dc-grid',
      more: '#dc-more',
      page: 12,
      render: (L) => L.map((a) => frame(a, mode)).join(''),
      after: (host) => fx.reveal(host, '.dc-fr:not(.is-in)', { stagger: 70, mod: 4 }),
    });
    initStage(app, fx, mode);
  },
});

/** Video (o carrete), controles, recorrido de los capítulos, grano y código de tiempo. */
function initStage(app: HTMLElement, fx: Fx, mode: 'light' | 'dark') {
  const { signal } = fx;
  const film = qs(app, '#dc-film');
  const stage = qs(app, '.dc-stage');
  if (!film || !stage) return;
  const videos = qsa<HTMLVideoElement>(app, '[data-dc-video]');
  let cur = 0;
  /** El video que se está viendo (con dos, se alternan). */
  const active = (): HTMLVideoElement | undefined => videos[cur];
  const reel = qs(app, '.dc-reel');
  const play = qs<HTMLButtonElement>(app, '[data-dc-play]');
  const sound = qs<HTMLButtonElement>(app, '[data-dc-sound]');
  const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  const saveData = Boolean(conn?.saveData);

  let paused = false;
  const setPaused = (next: boolean) => {
    paused = next;
    const video = active();
    if (video) {
      if (next) video.pause();
      else void video.play()?.catch(() => setPaused(true));
    }
    reel?.classList.toggle('paused', next);
    if (play) {
      play.setAttribute('aria-pressed', String(next));
      play.innerHTML = next ? `${PLAY}<span>Reproducir</span>` : `${PAUSE}<span>Pausar</span>`;
      play.setAttribute('aria-label', next ? 'Reproducir el video' : 'Pausar el video');
    }
  };
  // Menos movimiento o ahorro de datos: el video no arranca solo (queda la portada).
  if (fx.reduce || saveData) {
    for (const v of videos) {
      v.removeAttribute('autoplay');
      v.preload = 'none';
    }
    setPaused(true);
  }
  play?.addEventListener('click', () => setPaused(!paused), { signal });
  sound?.addEventListener(
    'click',
    () => {
      const video = active();
      if (!video) return;
      const on = video.muted;
      for (const v of videos) v.muted = !on;
      if (on && paused) setPaused(false);
      sound.setAttribute('aria-pressed', String(on));
      sound.innerHTML = on
        ? `${SOUND}<span>Silenciar</span>`
        : `${MUTED}<span>Activar sonido</span>`;
    },
    { signal },
  );
  // Dos videos: al terminar uno entra el otro con un fundido, y así en bucle.
  if (videos.length > 1) {
    for (const v of videos) v.loop = false;
    videos.forEach((v, i) =>
      v.addEventListener(
        'ended',
        () => {
          if (i !== cur) return;
          const next = (cur + 1) % videos.length;
          const nv = videos[next];
          if (!nv) return;
          nv.currentTime = 0;
          nv.muted = v.muted;
          cur = next;
          v.classList.remove('on');
          v.setAttribute('aria-hidden', 'true');
          nv.classList.add('on');
          nv.removeAttribute('aria-hidden');
          if (!paused) void nv.play()?.catch(() => undefined);
        },
        { signal },
      ),
    );
    // El segundo se empieza a bajar cuando el primero ya va avanzado.
    videos[0]?.addEventListener(
      'timeupdate',
      function warm(this: HTMLVideoElement) {
        if (this.duration && this.currentTime / this.duration > 0.6 && !saveData) {
          const second = videos[1];
          if (second && second.preload === 'none') second.preload = 'auto';
        }
      },
      { signal },
    );
  }
  // Carrete sin video: cambia de toma cada 6 s (nunca con menos movimiento).
  const slides = qsa(app, '.dc-sl');
  if (!videos.length && slides.length > 1 && !fx.reduce) {
    let at = 0;
    const id = window.setInterval(() => {
      if (paused || document.hidden) return;
      slides[at]?.classList.remove('on');
      at = (at + 1) % slides.length;
      slides[at]?.classList.add('on');
    }, 6000);
    signal.addEventListener('abort', () => window.clearInterval(id));
  }
  // Fuera de pantalla el video descansa (batería y datos), y vuelve al regresar.
  if (videos.length)
    fx.observe(
      [stage],
      (en) => {
        const video = active();
        if (paused || !video) return;
        if (en.isIntersecting) void video.play()?.catch(() => undefined);
        else video.pause();
      },
      { threshold: 0.05 },
    );

  // Recorrido: la imagen se vuelve pantalla y aparecen los capítulos.
  const chap = qsa(app, '.dc-chap li');
  const top = qs(app, '.dc-top');
  if (!fx.reduce) {
    film.dataset.scrub = '';
    const clamp = (v: number) => Math.min(1, Math.max(0, v));
    const smooth = (v: number) => v * v * (3 - 2 * v);
    let last = -1;
    fx.onFrame(() => {
      const r = film.getBoundingClientRect();
      const run = Math.max(1, r.height - innerHeight);
      const p = clamp(-r.top / run);
      if (Math.abs(p - last) < 0.001) return;
      last = p;
      const c = 1 - smooth(clamp(p / 0.18));
      app.style.setProperty('--c', c.toFixed(3));
      // La cabecera se desvanece con el título; oculta, no recibe clics por error.
      top?.classList.toggle('is-gone', c < 0.05);
      app.style.setProperty('--q', smooth(clamp((p - 0.12) / 0.5)).toFixed(3));
      const at = p < 0.24 ? -1 : p < 0.48 ? 0 : p < 0.72 ? 1 : 2;
      chap.forEach((li, i) => li.classList.toggle('on', i === at));
    }, film);
  }

  // Código de tiempo del video (Sala de cine).
  const tc = qs(app, '[data-dc-tc]');
  if (videos.length && tc) {
    fx.onFrame(() => {
      const t = active()?.currentTime || 0;
      const f = Math.floor((t % 1) * 24);
      const s = Math.floor(t);
      const roll = videos.length > 1 ? `Rollo ${cur + 1}/${videos.length} · ` : '';
      tc.textContent = `${roll}00:${two(Math.floor(s / 60))}:${two(s % 60)}:${two(f)}`;
    }, stage);
  }

  // Grano de película: una textura de ruido que salta de lugar unas veces por segundo.
  const grain = qs(app, '.dc-grain');
  if (mode === 'dark' && grain && !fx.reduce) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 180;
    const g = cv.getContext('2d');
    if (!g) return;
    const img = g.createImageData(180, 180);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = (Math.random() * 255) | 0;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    grain.style.backgroundImage = `url(${cv.toDataURL()})`;
    let tick = 0;
    fx.onFrame(() => {
      if (tick++ % (fx.low ? 6 : 3)) return;
      grain.style.backgroundPosition = `${(Math.random() * 180) | 0}px ${(Math.random() * 180) | 0}px`;
    }, stage);
  }
}
