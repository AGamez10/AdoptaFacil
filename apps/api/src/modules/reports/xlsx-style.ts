import type * as ExcelJS from 'exceljs';

/**
 * Estilo común de los libros de Excel de AdoptaFácil (reportes y exportación
 * de datos): misma paleta que el PDF y misma configuración de impresión, para
 * que el diseño se conserve al abrirlo, imprimirlo o convertirlo a PDF.
 */

export const NAVY = 'FF14294D';
export const TEAL = 'FF0D7468';
export const PAPER = 'FFF3F6FA';
export const ZEBRA = 'FFF8FAFC';
export const LINE = 'FFD9DEE5';
export const WARNING = 'FFFFF4D6';
export const BORDER: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: LINE } },
  left: { style: 'thin', color: { argb: LINE } },
  bottom: { style: 'thin', color: { argb: LINE } },
  right: { style: 'thin', color: { argb: LINE } },
};

export function styleHeader(row: ExcelJS.Row): void {
  row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
  row.alignment = { vertical: 'middle', wrapText: true };
  row.height = 36;
}

/** Texto de encabezado/pie de impresión: sin controles y con `&` duplicado
 *  (Excel lo usa como código de formato). */
export function hf(text: string): string {
  // eslint-disable-next-line no-control-regex -- se buscan controles A PROPÓSITO para quitarlos.
  return text.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/&/g, '&&');
}

/**
 * Hace que la hoja se vea y se imprima igual en cualquier equipo: A4 apaisado,
 * todas las columnas en el ancho de la página (nunca partidas en dos hojas),
 * encabezado de columnas repetido, y folio y número de página al pie.
 */
export function setupPrint(
  ws: ExcelJS.Worksheet,
  opts: { title: string; org: string; code: string; verifyUrl: string; repeatHeader?: boolean },
): void {
  ws.pageSetup = {
    paperSize: 9,
    orientation: 'landscape',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    horizontalCentered: true,
    margins: { left: 0.4, right: 0.4, top: 0.7, bottom: 0.7, header: 0.3, footer: 0.3 },
    ...(opts.repeatHeader ? { printTitlesRow: '1:1' } : {}),
  };
  ws.headerFooter = {
    oddHeader: `&L&"-,Bold"${hf(opts.org)}&C${hf(opts.title)}&R${hf(opts.code)}`,
    oddFooter: `&L${hf(opts.verifyUrl)}&CPágina &P de &N&RGenerado por AdoptaFácil`,
  };
}

/** Tabla de detalle: bordes finos, filas alternas y filtro; el contenido no cambia. */
export function styleTable(ws: ExcelJS.Worksheet, columns: number): void {
  ws.eachRow((row, n) => {
    if (n === 1) return;
    for (let c = 1; c <= columns; c += 1) {
      const cell = row.getCell(c);
      cell.border = BORDER;
      cell.alignment = { vertical: 'middle', wrapText: true, ...cell.alignment };
      if (n % 2 === 1) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ZEBRA } };
      }
    }
  });
}
