import * as ExcelJS from 'exceljs';
import { deflateRawSync } from 'node:zlib';
import {
  assertXlsxExpandsWithin,
  XLSX_MAX_UNCOMPRESSED_BYTES,
  XlsxMalformedError,
  XlsxTooLargeError,
} from './xlsx-guard';

/** Minimal one-entry ZIP whose headers DECLARE `declaredSize` (may lie). */
function zipWith(content: Buffer, declaredSize = content.length): Buffer {
  const name = Buffer.from('xl/worksheets/sheet1.xml');
  const data = deflateRawSync(content);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(8, 8);
  local.writeUInt32LE(data.length, 18);
  local.writeUInt32LE(declaredSize, 22);
  local.writeUInt16LE(name.length, 26);
  const cd = Buffer.alloc(46);
  cd.writeUInt32LE(0x02014b50, 0);
  cd.writeUInt16LE(8, 10);
  cd.writeUInt32LE(data.length, 20);
  cd.writeUInt32LE(declaredSize, 24);
  cd.writeUInt16LE(name.length, 28);
  cd.writeUInt32LE(0, 42);
  const cdOffset = local.length + name.length + data.length;
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(cd.length + name.length, 12);
  eocd.writeUInt32LE(cdOffset, 16);
  return Buffer.concat([local, name, data, cd, name, eocd]);
}

describe('assertXlsxExpandsWithin (audit run-2 S-05)', () => {
  it('accepts a real 500-row workbook made by ExcelJS (regression)', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Animales');
    ws.addRow(['Nombre', 'Especie', 'Sexo', 'Tamaño', 'Descripción']);
    for (let i = 0; i < 500; i += 1) {
      ws.addRow([
        `Animal ${i}`,
        'Perro',
        'Hembra',
        'Mediano',
        'Muy juguetona y cariñosa '.repeat(4),
      ]);
    }
    const buf = Buffer.from(await wb.xlsx.writeBuffer());
    const total = assertXlsxExpandsWithin(buf);
    expect(total).toBeGreaterThan(0);
    expect(total).toBeLessThan(XLSX_MAX_UNCOMPRESSED_BYTES / 4);
  });

  it('rejects a zip bomb: ~100 KB on disk that expands past the limit', () => {
    const bomb = zipWith(Buffer.alloc(XLSX_MAX_UNCOMPRESSED_BYTES + 1, 0x20));
    expect(bomb.length).toBeLessThan(200 * 1024);
    expect(() => assertXlsxExpandsWithin(bomb)).toThrow(XlsxTooLargeError);
  });

  it('does not trust the declared size: a bomb that lies (declares 10 bytes) is still caught', () => {
    const liar = zipWith(Buffer.alloc(XLSX_MAX_UNCOMPRESSED_BYTES + 1, 0x20), 10);
    expect(() => assertXlsxExpandsWithin(liar)).toThrow(XlsxTooLargeError);
  });

  it('accepts exactly the limit and rejects one byte more', () => {
    expect(assertXlsxExpandsWithin(zipWith(Buffer.alloc(1000)), 1000)).toBe(1000);
    expect(() => assertXlsxExpandsWithin(zipWith(Buffer.alloc(1001)), 1000)).toThrow(
      XlsxTooLargeError,
    );
  });

  it('rejects something that is not a zip', () => {
    expect(() => assertXlsxExpandsWithin(Buffer.from('no soy un excel, soy texto plano'))).toThrow(
      XlsxMalformedError,
    );
  });
});
