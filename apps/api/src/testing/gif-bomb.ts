/**
 * Solo para pruebas: GIF de un solo color, válido, con dimensiones enormes y
 * pocos KB (el LZW de un color repetido comprime miles de píxeles por código).
 * Reproduce la "bomba GIF" de la auditoría (AF-N05): un archivo pequeño que,
 * al decodificarlo sin tope de píxeles, ocupa cientos de MB de memoria.
 */
export function gifBomb(width: number, height: number): Buffer {
  const MIN_CODE_SIZE = 2;
  const CLEAR = 1 << MIN_CODE_SIZE;
  const END = CLEAR + 1;
  const bytes: number[] = [];
  let bitBuffer = 0;
  let bitCount = 0;
  let codeSize = MIN_CODE_SIZE + 1;
  const emit = (code: number): void => {
    bitBuffer |= code << bitCount;
    bitCount += codeSize;
    while (bitCount >= 8) {
      bytes.push(bitBuffer & 0xff);
      bitBuffer >>>= 8;
      bitCount -= 8;
    }
  };

  // Todo el flujo es el índice 0; la cadena de n ceros tiene el código chain[n].
  const chain: number[] = [0, 0];
  let next = END + 1;
  emit(CLEAR);
  let remaining = width * height;
  while (remaining > 0) {
    // La cadena más larga ya conocida que cabe en lo que falta.
    let len = Math.min(chain.length - 1, remaining);
    emit(chain[len]);
    remaining -= len;
    if (next < 4096 && remaining > 0) {
      // El codificador añade "cadena + siguiente símbolo" = len + 1 ceros.
      len += 1;
      if (len === chain.length) chain.push(next);
      next += 1;
      if (next > 1 << codeSize && codeSize < 12) codeSize += 1;
    }
  }
  emit(END);
  if (bitCount > 0) bytes.push(bitBuffer & 0xff);

  const u16 = (n: number): number[] => [n & 0xff, (n >> 8) & 0xff];
  const out: number[] = [
    ...Buffer.from('GIF89a'),
    ...u16(width),
    ...u16(height),
    0x80, // tabla global de 2 colores
    0,
    0,
    0,
    0,
    0,
    0xff,
    0xff,
    0xff,
    0x2c,
    ...u16(0),
    ...u16(0),
    ...u16(width),
    ...u16(height),
    0,
    MIN_CODE_SIZE,
  ];
  for (let i = 0; i < bytes.length; i += 255) {
    const block = bytes.slice(i, i + 255);
    out.push(block.length, ...block);
  }
  out.push(0, 0x3b);
  return Buffer.from(out);
}
