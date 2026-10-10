/**
 * Dígito de verificación del NIT (DIAN). Pesos primos aplicados de derecha a
 * izquierda; residuo módulo 11: 0 y 1 se usan tal cual, el resto es 11 − r.
 */
const WEIGHTS = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71];

/** Solo los dígitos de un NIT escrito con puntos, guiones o espacios. */
export function onlyDigits(value: string): string {
  return value.replace(/\D/g, '');
}

export function nitCheckDigit(base: string): number {
  const digits = onlyDigits(base);
  if (digits.length === 0 || digits.length > WEIGHTS.length) {
    throw new Error('NIT inválido');
  }
  let sum = 0;
  for (let i = 0; i < digits.length; i += 1) {
    sum += Number(digits[digits.length - 1 - i]) * WEIGHTS[i];
  }
  const r = sum % 11;
  return r > 1 ? 11 - r : r;
}

/** ¿El dígito de verificación corresponde al NIT? */
export function isValidNit(base: string, dv: string | number): boolean {
  const digits = onlyDigits(base);
  if (digits.length < 6 || digits.length > 15) return false;
  return nitCheckDigit(digits) === Number(dv);
}

/**
 * Separa lo que la organización escribió en su perfil ("900.123.456-7",
 * "9001234567" o "900123456") en base y DV. Sin guion no se puede saber si el
 * último dígito es el DV, así que se devuelve también la lectura sin DV.
 */
export function splitNit(raw: string): { base: string; dv?: string }[] {
  const trimmed = raw.trim();
  const dash = trimmed.match(/^([\d.\s]+)-\s*(\d)$/);
  if (dash) return [{ base: onlyDigits(dash[1]), dv: dash[2] }];
  const digits = onlyDigits(trimmed);
  if (!digits) return [];
  const options: { base: string; dv?: string }[] = [{ base: digits }];
  if (digits.length >= 7) options.push({ base: digits.slice(0, -1), dv: digits.slice(-1) });
  return options;
}
