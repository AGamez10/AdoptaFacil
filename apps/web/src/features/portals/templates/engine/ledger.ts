import { EMPTY, type TplModel } from './model';

/**
 * Bloque "Libro público" que comparten TODAS las plantillas (RF14): totales y
 * los últimos movimientos, o el texto vacío con la clase propia de la plantilla.
 * Todo texto llega YA escapado desde `buildTemplateModel`. El detalle completo se
 * abre con el botón `[data-ledger]` de cada plantilla (mismo diálogo del portal).
 */
export function ledgerBlock(m: TplModel, emptyClass: string): string {
  const L = m.LEDGER;
  // Si el libro no cargó, nunca se afirma que no hay movimientos: los datos
  // existen y están en el libro completo, que el donante puede abrir.
  if (L.unavailable) {
    return `<p class="${emptyClass}">No pudimos cargar los movimientos en este momento. <button type="button" data-ledger>Ver libro completo</button></p>`;
  }
  if (L.rows.length === 0) return `<p class="${emptyClass}">${EMPTY.libro}</p>`;
  const rows = L.rows
    .map((r) => {
      const tag = r.online
        ? '<span class="tg on">Pago en línea verificado</span>'
        : r.support
          ? '<span class="tg ok">Con soporte</span>'
          : '';
      return `<li class="${r.voided ? 'vd' : r.income ? 'in' : 'out'}"><div><b>${r.concept}</b><span class="mt">${r.date}${r.category ? ` · ${r.category}` : ''}${tag}</span>${r.voided ? `<span class="why">Anulado: ${r.voidReason}</span>` : ''}</div><span class="am">${r.amount}</span></li>`;
    })
    .join('');
  return `<div class="af-led" data-testid="tpl-ledger"><dl><div><dt>Recibido</dt><dd>${L.income}</dd></div><div><dt>Gastado</dt><dd>${L.expense}</dd></div><div><dt>Saldo</dt><dd>${L.balance}</dd></div></dl><ul>${rows}</ul><p class="ft">${L.count === 1 ? '1 movimiento' : `${L.count} movimientos`}${L.last ? ` · último el ${L.last}` : ''} · <button type="button" data-ledger>Ver libro completo</button></p></div>`;
}

/**
 * Estilos del bloque. La forma sale de variables `--lg-*` que cada plantilla
 * define con su propio lenguaje (tarjeta, sombra, redondeo, tipografía y
 * acento), así el libro se ve como una sección más del portal y no como un
 * bloque genérico. Las plantillas del kit (`.kit`) y Premium (`.pk`) las toman
 * de sus variables `--k-*`; las clásicas las declaran en su propio CSS; sin
 * nada declarado queda el aspecto neutro de siempre (hereda tinta y letra).
 * `--lg-hi` (opcional) es el fondo destacado del saldo, el mismo de la
 * primera tarjeta de "Cómo ayudar" de la plantilla.
 * Solo presentación: el contenido lo arma `ledgerBlock`.
 */
export const LEDGER_CSS = `
.af-tpl.kit,.af-tpl.pk{--lg-card:var(--k-card);--lg-bd:0;--lg-sh:var(--k-sh);--lg-r:var(--k-r);--lg-fd:var(--k-fd);--lg-fw:var(--k-fw);--lg-ls:var(--k-ls);--lg-soft:var(--k-soft);--lg-line:var(--k-line);--lg-tint:var(--k-tint);--lg-acc:var(--k-acc);--lg-acc-ink:var(--k-acc-ink)}
.af-tpl .af-led{--lg-sep:color-mix(in srgb,currentColor 10%,transparent);display:grid;gap:14px;max-width:62em}
.af-tpl .af-led dl{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:clamp(10px,1.4vw,16px);margin:0}
.af-tpl .af-led dl>div{display:flex;flex-direction:column;justify-content:space-between;gap:6px;min-width:0;padding:clamp(14px,1.8vw,22px) clamp(16px,2vw,24px);border-radius:var(--lg-r,14px);border:var(--lg-bd,1px solid color-mix(in srgb,currentColor 14%,transparent));background:var(--lg-card,color-mix(in srgb,currentColor 4%,transparent));box-shadow:var(--lg-sh,none)}
.af-tpl .af-led dl>div:last-child{background:var(--lg-hi,var(--lg-acc,color-mix(in srgb,currentColor 4%,transparent)));color:var(--lg-acc-ink,inherit);box-shadow:none;border-color:transparent}
.af-tpl .af-led dt{font-size:12px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;opacity:.72}
.af-tpl .af-led dd{margin:0;font-family:var(--lg-fd,inherit);font-weight:var(--lg-fw,700);letter-spacing:var(--lg-ls,normal);font-size:clamp(20px,2.6vw,34px);line-height:1.05;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}
.af-tpl .af-led ul{list-style:none;margin:0;padding:0;border-radius:var(--lg-r,14px);border:var(--lg-bd,1px solid color-mix(in srgb,currentColor 14%,transparent));background:var(--lg-card,transparent);box-shadow:var(--lg-sh,none);overflow:hidden}
.af-tpl .af-led li{display:flex;justify-content:space-between;gap:14px;padding:14px clamp(16px,2vw,24px);align-items:flex-start}
.af-tpl .af-led li+li{border-top:1px solid var(--lg-line,var(--lg-sep))}
.af-tpl .af-led li b{display:block;font-weight:600}
.af-tpl .af-led .mt{display:flex;flex-wrap:wrap;align-items:center;gap:4px 8px;font-size:13px;color:var(--lg-soft,inherit);opacity:var(--lg-soft-o,.72);margin-top:2px}
.af-tpl.kit .af-led .mt,.af-tpl.pk .af-led .mt{--lg-soft-o:1}
.af-tpl .af-led .tg{padding:1px 9px;border-radius:99px;font-size:12px;font-weight:600;color:inherit;background:color-mix(in srgb,var(--lg-acc,var(--brand)) 16%,transparent)}
.af-tpl .af-led .why{display:block;font-size:13px;margin-top:4px;color:color-mix(in srgb,#c27a00 65%,currentColor)}
.af-tpl .af-led .am{white-space:nowrap;font-family:var(--lg-fd,inherit);font-weight:var(--lg-fw,700);letter-spacing:var(--lg-ls,normal);font-size:17px;font-variant-numeric:tabular-nums}
.af-tpl .af-led li.in .am{color:color-mix(in srgb,#12a065 65%,currentColor)}
.af-tpl .af-led li.out .am{color:color-mix(in srgb,#d0334f 65%,currentColor)}
.af-tpl .af-led li.vd b,.af-tpl .af-led li.vd .am{text-decoration:line-through;opacity:.55}
.af-tpl .af-led .ft{font-size:13px;color:var(--lg-soft,inherit);opacity:var(--lg-soft-o,.75)}
.af-tpl.kit .af-led .ft,.af-tpl.pk .af-led .ft{--lg-soft-o:1}
.af-tpl .af-led .ft button{background:none;border:0;padding:0;font:inherit;font-weight:600;color:var(--lg-acc-txt,inherit);text-decoration:underline;text-underline-offset:3px;cursor:pointer}
@media (max-width:600px){.af-tpl .af-led dl{grid-template-columns:1fr 1fr}.af-tpl .af-led dl>div:last-child{grid-column:1/-1}.af-tpl .af-led li{flex-direction:column;gap:4px}}
`;
