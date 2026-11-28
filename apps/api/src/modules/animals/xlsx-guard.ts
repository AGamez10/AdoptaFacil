import { inflateRawSync } from 'node:zlib';

/**
 * Auditoría run-2 S-05: un .xlsx es un ZIP. Un archivo de pocos MB (dentro del
 * tope de subida) puede expandirse a cientos de MB de XML y agotar la memoria
 * de la API al cargarlo con ExcelJS (medido: 6,35 MB → sin memoria con 1 GB de
 * heap). Antes de entregarlo a ExcelJS se descomprime cada entrada con un tope
 * REAL de salida (`maxOutputLength` de zlib), sin confiar en los tamaños que
 * declara el propio ZIP (un atacante puede mentir en ellos).
 *
 * La plantilla de 500 filas pesa ~1 MB descomprimida: 20 MB deja mucho margen.
 */
export const XLSX_MAX_UNCOMPRESSED_BYTES = 20 * 1024 * 1024;
const MAX_ENTRIES = 1000;

export class XlsxTooLargeError extends Error {}
export class XlsxMalformedError extends Error {}

const EOCD_SIG = 0x06054b50;
const CD_SIG = 0x02014b50;
const LOCAL_SIG = 0x04034b50;

function findEndOfCentralDirectory(buf: Buffer): number {
  const min = Math.max(0, buf.length - (22 + 0xffff));
  for (let i = buf.length - 22; i >= min; i -= 1) {
    if (buf.readUInt32LE(i) === EOCD_SIG) return i;
  }
  throw new XlsxMalformedError('no end of central directory');
}

/** Throws {@link XlsxTooLargeError} / {@link XlsxMalformedError}; returns the real total. */
export function assertXlsxExpandsWithin(
  buf: Buffer,
  maxBytes: number = XLSX_MAX_UNCOMPRESSED_BYTES,
): number {
  if (buf.length < 22) throw new XlsxMalformedError('too short');
  const eocd = findEndOfCentralDirectory(buf);
  const entries = buf.readUInt16LE(eocd + 10);
  const cdSize = buf.readUInt32LE(eocd + 12);
  const cdOffset = buf.readUInt32LE(eocd + 16);
  // ZIP64 (sentinels) is never produced for a sheet of this size.
  if (entries === 0xffff || cdOffset === 0xffffffff || cdSize === 0xffffffff) {
    throw new XlsxMalformedError('zip64');
  }
  if (entries > MAX_ENTRIES) throw new XlsxTooLargeError('too many entries');
  // Auditoría run-4 F1: el conteo del EOCD lo controla quien sube el archivo.
  // JSZip (lo que usa ExcelJS) NO lo usa: recorre el directorio central por
  // firma y, si `cdOffset + cdSize` no coincide con el EOCD, desplaza todos los
  // offsets ("datos antepuestos"). Por eso aquí se exige un ZIP sin ambigüedad:
  // directorio central pegado al EOCD, y se miden TODOS los registros que haya
  // físicamente (por firma), no los que declara el conteo.
  if (cdOffset + cdSize !== eocd) throw new XlsxMalformedError('central directory mismatch');

  let total = 0;
  let seen = 0;
  let p = cdOffset;
  while (p + 4 <= buf.length && buf.readUInt32LE(p) === CD_SIG) {
    seen += 1;
    if (seen > MAX_ENTRIES) throw new XlsxTooLargeError('too many entries');
    if (p + 46 > eocd) throw new XlsxMalformedError('bad central directory');
    const method = buf.readUInt16LE(p + 10);
    const compressedSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    p += 46 + nameLen + extraLen + commentLen;

    if (localOffset + 30 > buf.length || buf.readUInt32LE(localOffset) !== LOCAL_SIG) {
      throw new XlsxMalformedError('bad local header');
    }
    const start =
      localOffset + 30 + buf.readUInt16LE(localOffset + 26) + buf.readUInt16LE(localOffset + 28);
    const end = start + compressedSize;
    if (end > buf.length) throw new XlsxMalformedError('truncated entry');
    const remaining = maxBytes - total;

    if (method === 0) {
      total += compressedSize;
    } else if (method === 8) {
      try {
        // +1 so "exactly at the limit" is distinguishable from "over it".
        total += inflateRawSync(buf.subarray(start, end), {
          maxOutputLength: remaining + 1,
        }).length;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ERR_BUFFER_TOO_LARGE') {
          throw new XlsxTooLargeError('expands over the limit');
        }
        throw new XlsxMalformedError('bad deflate data');
      }
    } else {
      throw new XlsxMalformedError(`unsupported compression ${method}`);
    }
    if (total > maxBytes) throw new XlsxTooLargeError('expands over the limit');
  }
  if (p !== eocd || seen !== entries) {
    throw new XlsxMalformedError('central directory entry count mismatch');
  }
  return total;
}
