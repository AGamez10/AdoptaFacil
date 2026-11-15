/**
 * Estilos del kit de secciones de las plantillas Premium (`.pk`). Misma
 * estructura para las cinco; color, tipografía y forma salen de las variables
 * `--k-*` que cada plantilla define por modo (`[data-mode=light|dark]`).
 */
export const PREMIUM_KIT_CSS = `
:where(.af-tpl.pk){--k-bg:#fff;--k-ink:#111;--k-soft:rgba(0,0,0,.62);--k-line:rgba(0,0,0,.12);--k-card:#fff;--k-tint:rgba(0,0,0,.05);--k-acc:var(--brand);--k-acc-ink:var(--brand-ink);--k-r:20px;--k-fd:inherit;--k-fw:700;--k-ls:-.02em;--k-sh:0 0 0 1px var(--k-line);background:var(--k-bg);color:var(--k-ink)}
.pk a{color:inherit}
.pk [hidden]{display:none!important}
:where(.pk) a[data-id]{display:inline-block;text-decoration:none;color:inherit}
.pk .k-contact.nomap{grid-template-columns:minmax(0,1fr)}
.pk .k-contact dd a{text-decoration:underline;text-underline-offset:3px}
.pk .k-ldg-e{margin-top:-6px}
.pk .k-sec{padding-block:clamp(56px,8vw,112px)}
.pk .k-hd{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:flex-end;gap:16px 30px;margin-bottom:clamp(24px,3vw,40px)}
.pk .k-hdt{min-width:0;max-width:760px}
.pk .k-eb{font-size:12px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:var(--k-acc)}
.pk .k-h2{font-family:var(--k-fd);font-weight:var(--k-fw);letter-spacing:var(--k-ls);font-size:clamp(36px,5vw,68px);line-height:.98;margin-top:10px}
.pk .k-h2.sm{font-size:clamp(30px,3.4vw,48px)}
.pk .k-sub{color:var(--k-soft);margin-top:14px;font-size:17px;line-height:1.55;max-width:36em}
.pk .k-lnk{display:inline-flex;align-items:center;gap:8px;background:none;border:0;padding:0;cursor:pointer;font:inherit;font-weight:700;color:var(--k-acc)!important;text-decoration:none}
.pk .k-lnk svg{width:16px;transition:transform .3s}
.pk .k-lnk:hover svg{transform:translateX(4px)}
.pk .k-btn{display:inline-flex;align-items:center;gap:10px;min-height:54px;padding:0 26px;border-radius:999px;background:var(--k-acc);color:var(--k-acc-ink)!important;text-decoration:none;font-weight:700;border:0;cursor:pointer;transition:translate .25s}
.pk .k-btn svg{width:18px}
.pk .k-empty{padding:26px 28px;border-radius:var(--k-r);background:var(--k-tint);color:var(--k-soft);font-size:17px;line-height:1.6;max-width:48em;display:flex;flex-wrap:wrap;gap:8px 16px;align-items:center}
.pk .k-tb{background:var(--k-tint);font-size:14px;color:var(--k-soft);position:relative;z-index:3}
.pk .k-tb .w{display:flex;flex-wrap:wrap;align-items:center;gap:8px 20px;padding-block:11px}
.pk .k-tb svg{width:18px;color:var(--k-acc)}
.pk .k-tb b{color:var(--k-ink);font-weight:700}
.pk .k-tb .lv{display:inline-flex;gap:4px}
.pk .k-tb .lv i{width:18px;height:6px;border-radius:6px;background:var(--k-line)}
.pk .k-tb .lv i.on{background:var(--k-acc)}
.pk .k-tb .esal{display:inline-flex;align-items:center;gap:5px;font-weight:700;color:var(--k-ink)}
.pk .k-tb .esal svg{width:15px}
.pk .k-tb .ac{margin-left:auto}
@media (max-width:760px){.pk .k-tb .ac{margin-left:0;flex-basis:100%}}
.pk .k-acts{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}
.pk .k-act{position:relative;display:flex;flex-direction:column;gap:10px;padding:28px;border-radius:var(--k-r);background:var(--k-card);box-shadow:var(--k-sh);text-decoration:none;min-height:200px;transition:transform .5s cubic-bezier(.2,.8,.2,1)}
.pk .k-act b{font-family:var(--k-fd);font-weight:var(--k-fw);letter-spacing:var(--k-ls);font-size:clamp(30px,3vw,44px);line-height:1;margin-top:auto}
.pk .k-act p{color:var(--k-soft);line-height:1.5}
.pk .k-go{position:absolute;top:22px;right:22px;width:42px;height:42px;border-radius:50%;display:grid;place-items:center;background:var(--k-tint)}
.pk .k-go svg{width:18px}
.pk .k-note{margin-top:16px;font-size:14px;color:var(--k-soft);display:flex;align-items:center;gap:8px}
.pk .k-note svg{width:16px;color:var(--k-acc);flex:none}
@media (max-width:860px){.pk .k-acts{grid-template-columns:minmax(0,1fr)}.pk .k-act{min-height:140px}}
.pk .k-needs{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px}
.pk .k-nd{display:flex;flex-direction:column;gap:10px;padding:24px;border-radius:var(--k-r);background:var(--k-card);box-shadow:var(--k-sh)}
.pk .k-nd .k{font-size:12px;font-weight:700;color:var(--k-acc);text-transform:uppercase;letter-spacing:.1em}
.pk .k-nd b{font-size:20px;line-height:1.15;font-family:var(--k-fd);font-weight:var(--k-fw);letter-spacing:var(--k-ls)}
.pk .k-bar{height:8px;border-radius:8px;background:var(--k-tint);overflow:hidden;margin-top:auto}
.pk .k-bar i{display:block;height:100%;width:var(--p,0%);background:var(--k-acc);border-radius:8px;transition:width 1.6s cubic-bezier(.2,.8,.2,1)}
.pk .k-nd p{display:flex;justify-content:space-between;font-size:14px;color:var(--k-soft);font-variant-numeric:tabular-nums}
.pk .k-nd a{font-weight:700;color:var(--k-acc)!important;text-decoration:none;font-size:14px}
.pk .k-prods{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px}
.pk .k-pr{display:flex;flex-direction:column;gap:4px;padding:16px;border-radius:var(--k-r);background:var(--k-card);box-shadow:var(--k-sh);text-decoration:none;transition:transform .5s cubic-bezier(.2,.8,.2,1)}
.pk .k-pr:hover{transform:translateY(-6px)}
.pk .k-pr .ph{aspect-ratio:1/1;border-radius:calc(var(--k-r) - 6px);background:var(--k-tint);padding:12%;margin-bottom:10px;overflow:hidden}
.pk .k-pr .k{font-size:12px;color:var(--k-soft);font-weight:600}
.pk .k-pr b{font-size:19px;font-family:var(--k-fd);font-weight:var(--k-fw);letter-spacing:var(--k-ls)}
.pk .k-pr .row{display:flex;justify-content:space-between;align-items:center;margin-top:8px;font-variant-numeric:tabular-nums}
.pk .k-pr .by{font-size:13px;font-weight:700;padding:8px 14px;border-radius:999px;background:var(--k-acc);color:var(--k-acc-ink)}
@media (max-width:1000px){.pk .k-needs,.pk .k-prods{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (max-width:520px){.pk .k-needs{grid-template-columns:minmax(0,1fr)}.pk .k-prods{gap:10px}.pk .k-pr{padding:10px}.pk .k-pr b{font-size:16px}}
.pk .k-help{padding:clamp(40px,7vw,96px) clamp(22px,6vw,80px);border-radius:calc(var(--k-r) * 1.5);background:var(--k-acc);color:var(--k-acc-ink);text-align:center;display:flex;flex-direction:column;align-items:center;gap:18px;position:relative;overflow:hidden}
.pk .k-help h2{font-family:var(--k-fd);font-weight:var(--k-fw);letter-spacing:var(--k-ls);font-size:clamp(38px,6vw,88px);line-height:.98;max-width:12em;position:relative}
.pk .k-help p{font-size:18px;line-height:1.55;max-width:30em;opacity:.92;position:relative}
.pk .k-help .k-btn{background:var(--k-acc-ink);color:var(--k-acc)!important;position:relative}
.pk .k-about{display:grid;grid-template-columns:minmax(0,.8fr) minmax(0,1.2fr);gap:44px}
.pk .k-about .tx{font-size:clamp(19px,1.9vw,26px);line-height:1.5}
.pk .k-bdg{display:flex;flex-wrap:wrap;gap:8px;margin-top:24px}
.pk .k-bdg span{display:inline-flex;align-items:center;gap:7px;padding:9px 14px;border-radius:999px;background:var(--k-tint);font-size:14px;font-weight:600}
.pk .k-bdg span.ok svg{color:var(--k-acc)}
.pk .k-bdg svg{width:15px;color:var(--k-soft)}
@media (max-width:860px){.pk .k-about{grid-template-columns:minmax(0,1fr);gap:16px}}
.pk .k-revs{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}
.pk .k-revs figure{margin:0;padding:28px;border-radius:var(--k-r);background:var(--k-card);box-shadow:var(--k-sh);display:flex;flex-direction:column;gap:14px}
.pk .k-revs .st{color:var(--k-acc);letter-spacing:3px}
.pk .k-revs blockquote{margin:0;font-size:18px;line-height:1.5}
.pk .k-revs figcaption{font-size:14px;color:var(--k-soft);margin-top:auto;font-weight:600}
@media (max-width:860px){.pk .k-revs{grid-template-columns:none;grid-auto-flow:column;grid-auto-columns:86%;overflow-x:auto;scroll-snap-type:x mandatory;padding-bottom:8px}.pk .k-revs figure{scroll-snap-align:start}}
.pk .k-ledger{border-radius:var(--k-r);background:var(--k-card);box-shadow:var(--k-sh);overflow:hidden}
.pk .k-lsum{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));border-bottom:1px solid var(--k-line)}
.pk .k-lsum div{padding:22px 26px;min-width:0}
.pk .k-lsum div + div{border-left:1px solid var(--k-line)}
.pk .k-lsum span{font-size:13px;color:var(--k-soft)}
.pk .k-lsum b{display:block;font-family:var(--k-fd);font-weight:var(--k-fw);letter-spacing:var(--k-ls);font-size:clamp(24px,2.8vw,40px);font-variant-numeric:tabular-nums}
.pk .k-tw{overflow-x:auto}
.pk .k-ledger table,.pk .ldg table{width:100%;border-collapse:collapse;font-size:15px}
.pk .k-ledger th,.pk .k-ledger td,.pk .ldg th,.pk .ldg td{text-align:left;padding:15px 24px;border-bottom:1px solid var(--k-line)}
.pk .k-ledger td:first-child,.pk .ldg td:first-child{white-space:nowrap}
.pk .k-ledger tr:last-child td{border-bottom:0}
.pk .k-ledger th,.pk .ldg th{font-size:12px;font-weight:600;color:var(--k-soft)}
.pk .k-ledger .num,.pk .ldg .num{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums;font-weight:600}
.pk .k-ledger .lk,.pk .ldg .lk{font-size:12px;padding:4px 10px;border-radius:999px;background:var(--k-tint)}
@media (max-width:700px){.pk .k-lsum{grid-template-columns:minmax(0,1fr)}.pk .k-lsum div + div{border-left:0;border-top:1px solid var(--k-line)}.pk .k-ledger table{min-width:620px}}
.pk .k-contact{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.3fr);border-radius:var(--k-r);overflow:hidden;background:var(--k-card);box-shadow:var(--k-sh)}
.pk .k-contact .info{padding:clamp(24px,4vw,48px);display:flex;flex-direction:column;align-items:flex-start}
.pk .k-contact dl{margin:20px 0 24px;display:grid;gap:16px}
.pk .k-contact dt{font-size:13px;color:var(--k-soft);display:flex;align-items:center;gap:6px}
.pk .k-contact dt svg{width:14px;color:var(--k-acc)}
.pk .k-contact dd{margin:4px 0 0;font-size:18px;font-weight:600}
.pk .k-contact .map{min-height:360px}
@media (max-width:860px){.pk .k-contact{grid-template-columns:minmax(0,1fr)}.pk .k-contact .map{min-height:220px}}
.pk .k-soc{display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:14px;padding-block:24px}
.pk .k-soc p{font-size:15px;color:var(--k-soft)}
.pk .k-soc div{display:flex;gap:8px;flex-wrap:wrap}
.pk .k-soc a{width:46px;height:46px;border-radius:50%;display:grid;place-items:center;background:var(--k-tint);transition:transform .3s,color .3s}
.pk .k-soc a:hover{transform:translateY(-3px);color:var(--k-acc)}
.pk .k-soc svg{width:19px}
.pk .k-foot{border-top:1px solid var(--k-line);padding-block:12px 30px}
.pk .k-fl{display:flex;flex-wrap:wrap;justify-content:space-between;gap:8px 20px;font-size:13px;color:var(--k-soft);padding-top:16px;border-top:1px solid var(--k-line)}
.pk .k-mode{display:inline-flex;align-items:center;gap:8px;height:44px;padding:0 16px 0 12px;border-radius:999px;border:0;cursor:pointer;background:var(--k-tint);color:var(--k-ink);font-weight:700;font-size:14px;white-space:nowrap}
.pk .k-mode svg{width:18px}
.pk .k-fbar{display:flex;flex-wrap:wrap;gap:10px;align-items:center}
.pk .k-q{display:flex;align-items:center;gap:8px;height:48px;padding:0 16px;border-radius:999px;background:var(--k-card);box-shadow:var(--k-sh);flex:1 1 240px;min-width:0;max-width:360px}
.pk .k-q svg{width:18px;color:var(--k-soft);flex:none}
.pk .k-q input{border:0;outline:0;background:transparent;min-width:0;width:100%;font-size:15px;color:var(--k-ink)}
.pk .k-q input::placeholder{color:var(--k-soft)}
.pk .k-q:focus-within{box-shadow:0 0 0 2px var(--k-acc)}
.pk .k-chips{display:flex;gap:6px;flex-wrap:wrap}
.pk .k-chip{display:inline-flex;align-items:center;gap:8px;height:44px;padding:0 16px;border-radius:999px;border:0;cursor:pointer;background:var(--k-card);box-shadow:var(--k-sh);font-weight:700;font-size:14px;color:var(--k-ink)}
.pk .k-chip span{font-size:12px;opacity:.6;font-variant-numeric:tabular-nums}
.pk .k-chip[aria-pressed="true"]{background:var(--k-ink);color:var(--k-bg);box-shadow:none}
.pk .k-sort select{height:44px;border-radius:999px;border:0;padding:0 14px;background:var(--k-card);box-shadow:var(--k-sh);font-weight:600;font-size:14px;color:var(--k-ink);cursor:pointer}
.pk .k-cnt{margin:18px 0 22px;font-size:14px;color:var(--k-soft)}
.pk .k-cnt b{color:var(--k-ink);font-variant-numeric:tabular-nums}
.pk .k-more{display:flex;align-items:center;gap:12px;margin:32px auto 0;height:54px;padding:0 26px;border-radius:999px;border:0;cursor:pointer;background:var(--k-ink);color:var(--k-bg);font-weight:700;font-size:15px}
.pk .k-more span{font-weight:500;opacity:.65;font-size:13px}
`;
