import { EMPTY, type TplModel } from './model';

/**
 * Bloque "Libro público" que comparten TODAS las plantillas (RF14): totales y
 * los últimos movimientos, o el texto vacío con la clase propia de la plantilla.
 * Todo texto llega YA escapado desde `buildTemplateModel`. El detalle completo se
 * abre con el botón `[data-ledger]` de cada plantilla (mismo diálogo del portal).
 */
export function ledgerBlock(m: TplModel, emptyClass: string): string {
  const L = m.LEDGER;
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

/** Estilos del bloque: neutros, heredan tipografía y color de cada plantilla. */
export const LEDGER_CSS = `
.af-tpl .af-led{display:grid;gap:14px;max-width:62em}
.af-tpl .af-led dl{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:0}
.af-tpl .af-led dl>div{padding:14px 16px;border-radius:14px;border:1px solid color-mix(in srgb,currentColor 14%,transparent);background:color-mix(in srgb,currentColor 4%,transparent)}
.af-tpl .af-led dt{font-size:12px;letter-spacing:.06em;text-transform:uppercase;opacity:.7}
.af-tpl .af-led dd{margin:4px 0 0;font-size:clamp(17px,2vw,22px);font-weight:700;font-variant-numeric:tabular-nums}
.af-tpl .af-led ul{list-style:none;margin:0;padding:0;border-radius:14px;border:1px solid color-mix(in srgb,currentColor 14%,transparent);overflow:hidden}
.af-tpl .af-led li{display:flex;justify-content:space-between;gap:14px;padding:12px 16px;align-items:flex-start}
.af-tpl .af-led li+li{border-top:1px solid color-mix(in srgb,currentColor 10%,transparent)}
.af-tpl .af-led li b{display:block;font-weight:600}
.af-tpl .af-led .mt{display:flex;flex-wrap:wrap;gap:4px 8px;font-size:13px;opacity:.72;margin-top:2px}
.af-tpl .af-led .tg{padding:0 8px;border-radius:99px;font-size:12px;background:color-mix(in srgb,var(--brand) 16%,transparent)}
.af-tpl .af-led .why{display:block;font-size:13px;margin-top:4px;color:color-mix(in srgb,#c27a00 65%,currentColor)}
.af-tpl .af-led .am{white-space:nowrap;font-weight:700;font-variant-numeric:tabular-nums}
.af-tpl .af-led li.in .am{color:color-mix(in srgb,#12a065 65%,currentColor)}
.af-tpl .af-led li.out .am{color:color-mix(in srgb,#d0334f 65%,currentColor)}
.af-tpl .af-led li.vd b,.af-tpl .af-led li.vd .am{text-decoration:line-through;opacity:.55}
.af-tpl .af-led .ft{font-size:13px;opacity:.75}
.af-tpl .af-led .ft button{background:none;border:0;padding:0;text-decoration:underline;cursor:pointer}
@media (max-width:600px){.af-tpl .af-led dl{grid-template-columns:1fr}.af-tpl .af-led li{flex-direction:column;gap:4px}}
`;
