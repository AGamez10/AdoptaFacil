/**
 * Estilos compartidos por TODAS las plantillas, acotados a `.af-tpl` para que
 * nunca se filtren al resto de la app. `--brand`/`--brand-ink` salen de los
 * tokens de marca de la organización (mismo subconjunto seguro de T-027).
 *
 * El "kit" (`.kit .k-*`) es el set de secciones del contrato que usan las
 * plantillas de la Serie 1; cada una lo viste con sus variables `--k-*`.
 */
export const BASE_CSS = `
.af-tpl{--brand:hsl(var(--primary,172 67% 30%));--brand-ink:hsl(var(--primary-foreground,0 0% 100%));--bar:0px;position:relative;min-height:100vh;overflow-x:clip;-webkit-font-smoothing:antialiased;text-align:left;line-height:1.5}
.af-tpl *,.af-tpl *::before,.af-tpl *::after{box-sizing:border-box}
.af-tpl img,.af-tpl svg{max-width:100%}
.af-tpl h1,.af-tpl h2,.af-tpl h3,.af-tpl h4{margin:0;text-wrap:balance;font-size:revert;font-weight:revert}
.af-tpl p{margin:0}
.af-tpl button,.af-tpl input,.af-tpl select{font:inherit;color:inherit}
.af-tpl :focus-visible{outline:3px solid var(--brand);outline-offset:3px}
.af-tpl table{color:inherit;font-size:inherit}
.af-tpl [data-sec]{scroll-margin-top:70px}
/* "Ver más" y similares se ocultan con [hidden]; el display de cada plantilla no lo anula. */
.af-tpl [hidden]{display:none!important}
.af-tpl .sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.af-tpl .w{max-width:1320px;margin:0 auto;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px))}
@media (min-width:900px){.af-tpl .w{padding-left:max(40px,env(safe-area-inset-left,0px));padding-right:max(40px,env(safe-area-inset-right,0px))}}
.af-tpl .is-pre{opacity:0;transform:translateY(36px);transition:opacity 1s cubic-bezier(.2,.8,.2,1),transform 1s cubic-bezier(.2,.8,.2,1)}
.af-tpl .is-pre.is-in{opacity:1;transform:none}
.af-tpl .portrait{display:block;width:100%;height:100%}
.af-tpl img.portrait{object-fit:cover}
.af-tpl .tpl-map{display:block;width:100%;height:100%;min-height:inherit;border:0}
.af-tpl .tpl-empty{opacity:.8}
.af-tpl .tpl-logo-img{display:block;width:100%;height:100%;object-fit:cover;border-radius:inherit}
.af-tpl .tpl-more{list-style:none;margin:18px 0 0;padding:0;display:grid;gap:8px}
.af-tpl .tpl-more a{display:flex;flex-direction:column;gap:2px;padding:12px 16px;border-radius:14px;background:rgba(127,127,127,.1);text-decoration:none;color:inherit}
.af-tpl .tpl-more span{font-size:13px;opacity:.75}
.af-tpl .tpl-enter{animation:afTplIn .6s ease}
@keyframes afTplIn{from{opacity:0}to{opacity:1}}

:where(.af-tpl.kit){--k-card:#fff;--k-ink:inherit;--k-soft:rgba(0,0,0,.6);--k-line:rgba(0,0,0,.12);--k-acc:var(--brand);--k-acc-ink:var(--brand-ink);--k-r:24px;--k-fd:inherit;--k-fw:800;--k-ls:-.03em;--k-sh:0 0 0 1px var(--k-line);--k-tint:rgba(0,0,0,.04)}
:where(.af-tpl.kit) .k-sec{padding-block:clamp(64px,8vw,110px)}
:where(.af-tpl.kit) .k-hd{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:flex-end;gap:16px 30px;margin-bottom:36px}
:where(.af-tpl.kit) .k-eb{font-size:13px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--k-acc)}
:where(.af-tpl.kit) .k-h2{font-family:var(--k-fd);font-weight:var(--k-fw);letter-spacing:var(--k-ls);font-size:clamp(34px,4.4vw,62px);line-height:1;margin-top:10px}
:where(.af-tpl.kit) .k-sub{color:var(--k-soft);margin-top:12px;font-size:17px;line-height:1.55;max-width:34em}
:where(.af-tpl.kit) .k-lnk{display:inline-flex;align-items:center;gap:8px;background:none;border:0;padding:0;cursor:pointer;font:inherit;font-weight:700;color:var(--k-acc);text-decoration:none}
:where(.af-tpl.kit) .k-lnk svg{width:16px}
:where(.af-tpl.kit) .k-btn{display:inline-flex;align-items:center;gap:10px;min-height:52px;padding:0 24px;border-radius:999px;background:var(--k-acc);color:var(--k-acc-ink)!important;text-decoration:none;font-weight:700;border:0;cursor:pointer}
:where(.af-tpl.kit) .k-btn svg{width:17px}
:where(.af-tpl.kit) .k-empty{padding:28px;border-radius:var(--k-r);background:var(--k-tint);color:var(--k-soft);font-size:17px;line-height:1.55;max-width:46em}
:where(.af-tpl.kit) .k-tb{background:var(--k-tint);font-size:14px;color:var(--k-soft)}
:where(.af-tpl.kit) .k-tb .w{display:flex;flex-wrap:wrap;align-items:center;gap:8px 22px;padding-block:12px}
:where(.af-tpl.kit) .k-tb svg{width:18px;color:var(--k-acc)}
:where(.af-tpl.kit) .k-tb b{color:var(--k-ink);font-weight:700}
:where(.af-tpl.kit) .k-tb .ac{margin-left:auto}
:where(.af-tpl.kit) .k-acts{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}
:where(.af-tpl.kit) .k-act{display:flex;flex-direction:column;gap:10px;padding:30px;border-radius:var(--k-r);background:var(--k-card);box-shadow:var(--k-sh);text-decoration:none;color:inherit;min-height:210px;transition:transform .5s cubic-bezier(.2,.8,.2,1)}
:where(.af-tpl.kit) .k-act:hover{transform:translateY(-6px)}
:where(.af-tpl.kit) .k-act:first-child{background:var(--k-acc);color:var(--k-acc-ink);box-shadow:none}
:where(.af-tpl.kit) .k-act:first-child p{color:inherit;opacity:.85}
:where(.af-tpl.kit) .k-act .n{font-size:13px;font-weight:700;opacity:.6}
:where(.af-tpl.kit) .k-act b{font-family:var(--k-fd);font-weight:var(--k-fw);letter-spacing:var(--k-ls);font-size:clamp(32px,3.2vw,46px);line-height:1;margin-top:auto}
:where(.af-tpl.kit) .k-act p{color:var(--k-soft);line-height:1.5}
:where(.af-tpl.kit) .k-note{margin-top:16px;font-size:14px;color:var(--k-soft)}
@media (max-width:860px){:where(.af-tpl.kit) .k-acts{grid-template-columns:minmax(0,1fr)}:where(.af-tpl.kit) .k-act{min-height:150px}}
:where(.af-tpl.kit) .k-needs{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px}
:where(.af-tpl.kit) .k-nd{display:flex;flex-direction:column;gap:10px;padding:24px;border-radius:var(--k-r);background:var(--k-card);box-shadow:var(--k-sh)}
:where(.af-tpl.kit) .k-nd .k{font-size:12px;font-weight:700;color:var(--k-acc);text-transform:uppercase;letter-spacing:.08em}
:where(.af-tpl.kit) .k-nd b{font-size:20px;line-height:1.15;font-family:var(--k-fd);font-weight:var(--k-fw);letter-spacing:var(--k-ls)}
:where(.af-tpl.kit) .k-nd .bar{height:8px;border-radius:8px;background:var(--k-tint);overflow:hidden;margin-top:auto}
:where(.af-tpl.kit) .k-nd .bar i{display:block;height:100%;width:0;background:var(--k-acc);border-radius:8px;transition:width 1.6s cubic-bezier(.2,.8,.2,1)}
:where(.af-tpl.kit) .k-nd p{display:flex;justify-content:space-between;font-size:14px;color:var(--k-soft)}
:where(.af-tpl.kit) .k-nd a{font-weight:700;color:var(--k-acc);text-decoration:none;font-size:14px}
:where(.af-tpl.kit) .k-prods{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px}
:where(.af-tpl.kit) .k-pr{display:flex;flex-direction:column;gap:4px;padding:18px;border-radius:var(--k-r);background:var(--k-card);box-shadow:var(--k-sh);text-decoration:none;color:inherit;transition:transform .5s cubic-bezier(.2,.8,.2,1)}
:where(.af-tpl.kit) .k-pr:hover{transform:translateY(-6px)}
:where(.af-tpl.kit) .k-pr .ph{aspect-ratio:1/1;border-radius:calc(var(--k-r) - 8px);background:var(--k-tint);padding:14%;margin-bottom:10px;overflow:hidden}
:where(.af-tpl.kit) .k-pr .ph:has(img){padding:0}
:where(.af-tpl.kit) .k-pr .ph svg{width:100%;height:100%}
:where(.af-tpl.kit) .k-pr .k{font-size:12px;color:var(--k-soft);font-weight:600}
:where(.af-tpl.kit) .k-pr b{font-size:19px;font-family:var(--k-fd);font-weight:var(--k-fw);letter-spacing:var(--k-ls)}
:where(.af-tpl.kit) .k-pr .row{display:flex;justify-content:space-between;align-items:center;margin-top:8px}
:where(.af-tpl.kit) .k-pr .by{font-size:13px;font-weight:700;padding:7px 14px;border-radius:999px;background:var(--k-acc);color:var(--k-acc-ink)}
:where(.af-tpl.kit) .k-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:16px}
:where(.af-tpl.kit) .k-an{display:flex;flex-direction:column;gap:4px;padding:12px 12px 16px;border-radius:var(--k-r);background:var(--k-card);box-shadow:var(--k-sh);text-decoration:none;color:inherit;transition:transform .5s cubic-bezier(.2,.8,.2,1)}
:where(.af-tpl.kit) .k-an:hover{transform:translateY(-6px)}
:where(.af-tpl.kit) .k-an .ph{aspect-ratio:4/5;border-radius:calc(var(--k-r) - 6px);overflow:hidden;position:relative;margin-bottom:8px}
:where(.af-tpl.kit) .k-an b{font-size:19px;font-family:var(--k-fd);font-weight:var(--k-fw);letter-spacing:var(--k-ls)}
:where(.af-tpl.kit) .k-an span{font-size:13px;color:var(--k-soft)}
@media (max-width:1000px){:where(.af-tpl.kit) .k-needs,:where(.af-tpl.kit) .k-prods{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (max-width:560px){:where(.af-tpl.kit) .k-needs{grid-template-columns:minmax(0,1fr)}}
:where(.af-tpl.kit) .k-help{padding:clamp(40px,7vw,90px);border-radius:calc(var(--k-r) * 1.5);background:var(--k-acc);color:var(--k-acc-ink);text-align:center;display:flex;flex-direction:column;align-items:center;gap:18px}
:where(.af-tpl.kit) .k-help h2{font-family:var(--k-fd);font-weight:var(--k-fw);letter-spacing:var(--k-ls);font-size:clamp(38px,5.6vw,84px);line-height:1;max-width:12em}
:where(.af-tpl.kit) .k-help p{font-size:18px;line-height:1.55;max-width:30em;opacity:.9}
:where(.af-tpl.kit) .k-help .k-btn{background:var(--k-acc-ink);color:var(--k-acc)!important}
:where(.af-tpl.kit) .k-about{display:grid;grid-template-columns:minmax(0,.8fr) minmax(0,1.2fr);gap:44px}
:where(.af-tpl.kit) .k-about .tx{font-size:clamp(19px,1.8vw,25px);line-height:1.5}
:where(.af-tpl.kit) .k-bdg{display:flex;flex-wrap:wrap;gap:8px;margin-top:22px}
:where(.af-tpl.kit) .k-bdg span{display:inline-flex;align-items:center;gap:7px;padding:8px 14px;border-radius:999px;background:var(--k-tint);font-size:14px;font-weight:600}
:where(.af-tpl.kit) .k-bdg span.ok svg{color:var(--k-acc)}
:where(.af-tpl.kit) .k-bdg svg{width:15px;color:var(--k-soft)}
@media (max-width:860px){:where(.af-tpl.kit) .k-about{grid-template-columns:minmax(0,1fr);gap:16px}}
:where(.af-tpl.kit) .k-revs{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}
:where(.af-tpl.kit) .k-revs figure{margin:0;padding:28px;border-radius:var(--k-r);background:var(--k-card);box-shadow:var(--k-sh);display:flex;flex-direction:column;gap:14px}
:where(.af-tpl.kit) .k-revs .st{color:var(--k-acc);letter-spacing:3px}
:where(.af-tpl.kit) .k-revs blockquote{margin:0;font-size:18px;line-height:1.5}
:where(.af-tpl.kit) .k-revs figcaption{font-size:14px;color:var(--k-soft);margin-top:auto;font-weight:600}
@media (max-width:860px){:where(.af-tpl.kit) .k-revs{grid-template-columns:minmax(0,1fr)}}
:where(.af-tpl.kit) .k-contact{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.3fr);border-radius:var(--k-r);overflow:hidden;background:var(--k-card);box-shadow:var(--k-sh)}
:where(.af-tpl.kit) .k-contact.nomap{grid-template-columns:minmax(0,1fr)}
:where(.af-tpl.kit) .k-contact .info{padding:clamp(24px,4vw,48px);display:flex;flex-direction:column;align-items:flex-start}
:where(.af-tpl.kit) .k-contact dl{margin:18px 0 22px;display:grid;gap:14px}
:where(.af-tpl.kit) .k-contact dt{font-size:13px;color:var(--k-soft)}
:where(.af-tpl.kit) .k-contact dd{margin:3px 0 0;font-size:18px;font-weight:600}
:where(.af-tpl.kit) .k-contact .map{min-height:360px}
@media (max-width:860px){:where(.af-tpl.kit) .k-contact{grid-template-columns:minmax(0,1fr)}:where(.af-tpl.kit) .k-contact .map{min-height:240px}}
:where(.af-tpl.kit) .k-soc{display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:14px;padding-block:22px}
:where(.af-tpl.kit) .k-soc p{font-size:14px;color:var(--k-soft)}
:where(.af-tpl.kit) .k-soc div{display:flex;gap:8px;flex-wrap:wrap}
:where(.af-tpl.kit) .k-soc a{width:44px;height:44px;border-radius:50%;display:grid;place-items:center;background:var(--k-tint);color:inherit;transition:transform .3s}
:where(.af-tpl.kit) .k-soc a:hover{transform:translateY(-3px);color:var(--k-acc)}
:where(.af-tpl.kit) .k-soc svg{width:18px}
@media (prefers-reduced-motion:reduce){.af-tpl *,.af-tpl *::before,.af-tpl *::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}}
/* Logo del encabezado: su caja siempre reserva el mismo espacio (con o sin logo) y la
   imagen nunca se sale de ella; el nombre de la organización se parte en líneas. */
.af-tpl :is(.o-brand,.h-logo) i{flex:none;overflow:hidden;position:relative}
.af-tpl :is(.o-brand,.h-logo) b{min-width:0;overflow-wrap:anywhere}
.af-tpl .tpl-logo-img{display:block;width:100%;height:100%;object-fit:cover;border-radius:inherit}
`;
