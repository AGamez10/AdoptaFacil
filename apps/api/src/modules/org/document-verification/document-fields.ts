import {
  DocumentType,
  type DocumentPrefill,
  type ExtractedDocumentField,
  type OrganizationLocation,
} from '@adoptafacil/contracts';
import { isValidNit, onlyDigits } from './nit';
import { extractNit, normalize, parseSpanishDate } from './document-checks';

/**
 * Datos del perfil leídos de un RUT (formulario 001 de la DIAN) o de un
 * certificado de existencia y representación legal (Cámaras de Comercio).
 *
 * Regla de oro: es mejor NO proponer un dato que proponer uno malo. Cada valor
 * pasa por un validador y, si parece una etiqueta del formulario ("31. Primer
 * apellido…"), está vacío ("No reportó") o hay dos lecturas distintas, no se
 * propone. La organización siempre confirma antes de guardar.
 *
 * Por qué hace falta: pdf.js entrega el texto EN EL ORDEN EN QUE EL PDF LO
 * DIBUJA, no por posición. En el RUT de la DIAN unas veces cada valor sale
 * debajo de su casilla ("35. Razón social" / "FUNDACION X") y otras sale todo
 * el fondo del formulario primero (todas las etiquetas) y los valores al final.
 * Tomar "lo que sigue a Razón social" en ese segundo caso devolvía las
 * etiquetas vecinas ("Primer apellido 32. Segundo apellido 33. Primer nombre").
 */

// ---------------------------------------------------------------------------
// Validadores
// ---------------------------------------------------------------------------

/** "31. Primer apellido", "5. Número de Identificación Tributaria (NIT)": número
 *  de casilla seguido de palabras en minúscula o Capitalizadas. Los valores que
 *  imprime la DIAN van en MAYÚSCULAS, así que no se tocan. */
const CASILLA_LABEL =
  /\b\d{1,3}\s?\.\s*(?:[A-ZÁÉÍÓÚÑ]?[a-záéíóúñü/]+\.?|\([A-Za-z]+\)|de|del|la|el|y|o|e|en|a)(?:[ \t]+(?:[A-ZÁÉÍÓÚÑ]?[a-záéíóúñü/,]+\.?|\([A-Za-z]+\)))*/g;
const HAS_CASILLA_LABEL = /\b\d{1,3}\s?\.\s*[A-ZÁÉÍÓÚÑ][a-záéíóúñ]/;

/** Etiquetas del RUT y del certificado que nunca son un valor. Normalizadas. */
const LABEL_PHRASES = [
  'primer apellido',
  'segundo apellido',
  'primer nombre',
  'otros nombres',
  'razon social',
  'nombre comercial',
  'tipo de contribuyente',
  'tipo de documento',
  'numero de identificacion',
  'identificacion tributaria',
  'fecha expedicion',
  'fecha de expedicion',
  'lugar de expedicion',
  'direccion principal',
  'direccion seccional',
  'correo electronico',
  'codigo postal',
  'telefono 1',
  'actividad principal',
  'actividad economica',
  'responsabilidades',
  'buzon electronico',
  'espacio reservado',
  'uso exclusivo',
  'ciudad municipio',
  'no reporto',
  'no reportado',
  'no aplica',
  'sin informacion',
];

/** ¿El texto es (o contiene) una etiqueta del formulario y no un dato? */
export function isLabelLike(value: string): boolean {
  if (HAS_CASILLA_LABEL.test(value)) return true;
  const s = normalize(value);
  if (s.length === 0) return true;
  if (/^(nit|dv|sigla|nombre|pais|departamento|ciudad|municipio|direccion)$/.test(s)) return true;
  return LABEL_PHRASES.some((p) => s.includes(p));
}

function letters(value: string): string {
  return value.replace(/[^A-Za-zÁÉÍÓÚÑÜáéíóúñü]/g, '');
}

/** Al menos el 80 % de las letras en mayúscula: así imprime la DIAN los datos. */
function isUpperCaseValue(value: string): boolean {
  const l = letters(value);
  if (l.length === 0) return false;
  const upper = l.replace(/[^A-ZÁÉÍÓÚÑÜ]/g, '').length;
  return upper / l.length >= 0.8;
}

function tidy(value: string): string {
  return value
    .replace(/[ \t\u00a0]+/g, ' ')
    .replace(/^[\s:.,;\-–]+|[\s:,;\-–]+$/g, '')
    .trim();
}

/** Razón social plausible: letras de verdad, largo razonable, no una etiqueta. */
export function isPlausibleName(value: string, opts: { upper?: boolean } = {}): boolean {
  const v = tidy(value);
  if (v.length < 3 || v.length > 160) return false;
  if (letters(v).length < 3) return false;
  if (/\d{5,}/.test(onlyDigits(v)) && onlyDigits(v).length > letters(v).length) return false;
  if (isLabelLike(v)) return false;
  if (opts.upper && !isUpperCaseValue(v)) return false;
  return true;
}

/** Formas jurídicas con las que casi siempre empieza o termina una razón social. */
const ENTITY_WORDS =
  /\b(fundacion|asociacion|corporacion|cooperativa|federacion|confederacion|congregacion|sociedad|s\s?a\s?s|ltda|limitada|s\s?a|e\s?u|esal|veeduria|red|colectivo|refugio|albergue|junta de accion comunal)\b/;

/** Direcciones colombianas: CL 10 20 30, KR 5 # 12-40, AV CALLE 26, KM 3 VIA… */
const ADDRESS =
  /^(?:CL|CLL|CALLE|KR|KRA|CRA|CR|CARRERA|AK|AC|AV|AVENIDA|DG|DIAGONAL|TV|TR|TRANSVERSAL|CIRCULAR|CQ|KM|KILOMETRO|VDA|VEREDA|VIA|MZ|MANZANA|LOTE|FINCA|PREDIO|BARRIO|SECTOR|CENTRO)\b\.?\s*\S/i;

function isPlausibleAddress(value: string): boolean {
  const v = tidy(value);
  if (v.length < 5 || v.length > 160 || isLabelLike(v)) return false;
  return ADDRESS.test(v) && /\d/.test(v);
}

function isPlausiblePlace(value: string): boolean {
  const v = tidy(value);
  return (
    v.length >= 3 &&
    v.length <= 60 &&
    !/\d/.test(v) &&
    letters(v).length >= 3 &&
    !isLabelLike(v) &&
    !/^colombia$/i.test(v)
  );
}

/** "Bogotá, D.C." y "BOGOTA D.C." son la misma ciudad: se comparan normalizadas. */
function uniqueValue(values: string[]): string | null {
  const distinct = new Map<string, string>();
  for (const v of values) distinct.set(normalize(v), v);
  return distinct.size === 1 ? [...distinct.values()][0] : null;
}

function lines(text: string): string[] {
  return text
    .slice(0, 100_000)
    .split(/\r?\n/)
    .map((l) => l.replace(/[ \t\u00a0]+/g, ' ').trim());
}

/** Lo que queda de una línea al quitarle las etiquetas de casilla. */
function stripLabels(line: string): string {
  return tidy(line.replace(CASILLA_LABEL, ' '));
}

/**
 * Valor de una casilla del RUT cuando el PDF lo trae junto a su etiqueta: en la
 * misma línea (después de quitar etiquetas) o en la línea siguiente si esa
 * línea no es otra fila de etiquetas. Si la siguiente es de etiquetas, el PDF
 * trae los valores en bloque al final y aquí no se adivina nada.
 */
function casillaValue(all: string[], label: RegExp): string[] {
  const found: string[] = [];
  all.forEach((line, i) => {
    if (!label.test(line)) return;
    const same = stripLabels(line);
    if (same && letters(same).length >= 3) {
      found.push(same);
      return;
    }
    const next = all[i + 1];
    if (next && !HAS_CASILLA_LABEL.test(next) && !isLabelLike(next)) found.push(tidy(next));
  });
  return found;
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// RUT (formulario 001 de la DIAN)
// ---------------------------------------------------------------------------

export interface DocumentData {
  nit?: string;
  legalName?: string;
  location?: OrganizationLocation;
  details: ExtractedDocumentField[];
}

function validNit(text: string): string | undefined {
  const nit = extractNit(text);
  return nit && isValidNit(nit.base, nit.dv) ? `${nit.base}-${nit.dv}` : undefined;
}

function rutLegalName(all: string[]): string | undefined {
  // 1) El valor viene con su casilla (35. Razón social).
  const near = casillaValue(all, /\b35\s?\.\s*Raz[oó]n\s+social|^Raz[oó]n\s+social\b/i).filter(
    (v) => isPlausibleName(v, { upper: true }),
  );
  const fromLabel = uniqueValue(near);
  if (fromLabel) return fromLabel;
  if (near.length > 1) return undefined; // dos lecturas distintas: no se propone

  // 2) Valores en bloque: la única línea en MAYÚSCULAS con forma jurídica
  //    (FUNDACION, ASOCIACION, S.A.S., …). Si hay dos distintas, no se propone.
  const candidates = all
    .map(stripLabels)
    .filter(
      (l) =>
        isPlausibleName(l, { upper: true }) &&
        ENTITY_WORDS.test(normalize(l)) &&
        !/registro unico tributario|direccion de impuestos|camara de comercio/.test(normalize(l)),
    );
  return uniqueValue(candidates) ?? undefined;
}

/** Casillas 38-40 (o 28-30): "COLOMBIA 1 6 9 Valle del Cauca 7 6 Cali 0 0 1".
 *  Los códigos DANE en casillas sirven de ancla aunque el PDF venga en bloque. */
function rutPlaces(text: string): Array<{ department: string; city: string }> {
  const re =
    /COLOMBIA[ \t]+(?:\d[ \t]?){3}[ \t]*([^\d\n]{3,60}?)[ \t]+(?:\d[ \t]?){2}[ \t]*([^\d\n]{3,60}?)[ \t]+(?:\d[ \t]?){3}/gi;
  const out: Array<{ department: string; city: string }> = [];
  for (const m of text.slice(0, 100_000).matchAll(re)) {
    const department = tidy(m[1]);
    const city = tidy(m[2]);
    if (isPlausiblePlace(department) && isPlausiblePlace(city)) out.push({ department, city });
  }
  return out;
}

function rutAddress(all: string[]): string | undefined {
  const near = casillaValue(all, /\b41\s?\.\s*Direcci[oó]n\s+principal/i).filter(
    isPlausibleAddress,
  );
  const fromLabel = uniqueValue(near);
  if (fromLabel) return fromLabel;
  // En bloque: la única línea en mayúsculas con forma de dirección.
  const candidates = all
    .map(stripLabels)
    .filter((l) => isUpperCaseValue(l) && isPlausibleAddress(l));
  return uniqueValue(candidates) ?? undefined;
}

/** Hoja 3, casillas 101 y 104-107: solo si el PDF trae los valores junto a la casilla. */
function rutLegalRepresentative(all: string[]): string | undefined {
  const idx = all.findIndex((l) => /\b104\s?\.\s*Primer\s+apellido/i.test(l));
  if (idx < 0) return undefined;
  const value = casillaValue([all[idx], all[idx + 1] ?? ''], /\b104\s?\.\s*Primer/i)[0];
  if (!value || !isPlausibleName(value, { upper: true }) || ENTITY_WORDS.test(normalize(value))) {
    return undefined;
  }
  return value.split(/\s+/).length >= 2 ? value : undefined;
}

export function extractRutData(text: string): DocumentData {
  const all = lines(text);
  const details: ExtractedDocumentField[] = [];
  const nit = validNit(text);
  const juridica = /persona\s+jur[ií]dica/i.test(text);
  const natural = !juridica && /persona\s+natural/i.test(text);
  if (juridica || natural) {
    details.push({
      key: 'taxpayer_type',
      label: 'Tipo de contribuyente',
      value: juridica ? 'Persona jurídica' : 'Persona natural',
    });
  }
  // Una persona natural no tiene razón social: lo que hubiera ahí sería su nombre
  // comercial o una etiqueta. Se propone solo el NIT.
  const legalName = natural ? undefined : rutLegalName(all);

  const places = rutPlaces(text);
  const place = places.length > 0 ? uniquePlace(places) : null;
  const address = rutAddress(all);
  const location: OrganizationLocation = {
    ...(place ? { department: place.department, city: place.city } : {}),
    ...(address ? { address } : {}),
  };

  const rep = juridica ? rutLegalRepresentative(all) : undefined;
  if (rep) details.push({ key: 'legal_representative', label: 'Representante legal', value: rep });
  if (/r[ée]gimen\s+(tributario\s+)?especial/i.test(text) || /\b04\s*-\s*impto?/i.test(text)) {
    details.push({
      key: 'regime',
      label: 'Responsabilidad de renta',
      value: '04 · Régimen Tributario Especial',
    });
  }

  return {
    ...(nit ? { nit } : {}),
    ...(legalName ? { legalName } : {}),
    ...(Object.keys(location).length > 0 ? { location } : {}),
    details,
  };
}

function uniquePlace(
  places: Array<{ department: string; city: string }>,
): { department: string; city: string } | null {
  const key = (p: { department: string; city: string }) =>
    `${normalize(p.department)}|${normalize(p.city)}`;
  const distinct = new Map(places.map((p) => [key(p), p]));
  // 28-30 (lugar de expedición) va vacío en una persona jurídica; si aun así
  // hay dos lugares distintos no se sabe cuál es el domicilio.
  return distinct.size === 1 ? [...distinct.values()][0] : null;
}

// ---------------------------------------------------------------------------
// Certificado de existencia y representación legal (Cámaras de Comercio)
// ---------------------------------------------------------------------------

/** Valor de "Etiqueta: valor" en la misma línea. Tolera tabulaciones y puntos. */
function labeled(all: string[], label: RegExp): string[] {
  const out: string[] = [];
  for (const line of all) {
    const m = line.match(label);
    if (!m || m.index === undefined) continue;
    const rest = tidy(line.slice(m.index + m[0].length).replace(/^\s*(?:No\.?|N°|Nº)?\s*:/i, ''));
    if (rest) out.push(rest);
  }
  return out;
}

const SPLIT_PLACE = /^(.+?)\s*(?:,|\s-\s|\s–\s|\()\s*(.+?)\)?$/;

/** "Cali, Valle del Cauca", "MEDELLIN - ANTIOQUIA", "Bogotá D.C." */
function splitPlace(raw: string): { city?: string; department?: string } | null {
  const v = tidy(raw.replace(/\b(?:Colombia)\b\.?/i, ''));
  if (!v) return null;
  const m = v.match(SPLIT_PLACE);
  if (m && isPlausiblePlace(m[1]) && isPlausiblePlace(m[2])) {
    return { city: tidy(m[1]), department: tidy(m[2]) };
  }
  if (/^bogot[aá],?\s*d\.?\s*c\.?$/i.test(v))
    return { city: 'Bogotá, D.C.', department: 'Bogotá, D.C.' };
  return isPlausiblePlace(v) ? { city: v } : null;
}

const ROLE_WORDS =
  /^(?:(?:PRINCIPAL|SUPLENTE|PRIMER|SEGUNDO|PRESIDENTE|PRESIDENTA|DIRECTOR|DIRECTORA|EJECUTIVO|EJECUTIVA|GERENTE|GENERAL|Y|DE|LA|EL|DEL)\s+)+/;

/** Representante legal principal: nombre en MAYÚSCULAS y cédula. */
function chamberLegalRepresentative(text: string): { name: string; document: string } | undefined {
  const flat = text.slice(0, 100_000).replace(/[ \t\u00a0]+/g, ' ');
  const re =
    /REPRESENTANTE\s+LEGAL([A-ZÁÉÍÓÚÑ \n]{0,40}?)\s*\n?\s*([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ ]{4,80}?)\s+(?:C\.?\s?C\.?|CEDULA(?: DE CIUDADANIA)?|CÉDULA(?: DE CIUDADANÍA)?)\s*(?:No\.?|N°|Nº|NO\.?)?\s*:?\s*(\d[\d.]{5,14})/g;
  const reps: Array<{ name: string; document: string; suplente: boolean }> = [];
  for (const m of flat.matchAll(re)) {
    const role = `${m[1]} ${m[2]}`;
    const name = tidy(m[2].replace(ROLE_WORDS, ''));
    if (name.split(/\s+/).length < 2 || !isPlausibleName(name, { upper: true })) continue;
    if (ENTITY_WORDS.test(normalize(name))) continue;
    reps.push({ name, document: onlyDigits(m[3]), suplente: /SUPLENTE/.test(role) });
  }
  return reps.find((r) => !r.suplente) ?? reps[0];
}

export function extractChamberData(text: string): DocumentData {
  const all = lines(text);
  const details: ExtractedDocumentField[] = [];
  const nit = validNit(text);

  const names = [
    ...labeled(all, /^\s*Raz[oó]n\s+social\s*:?/i),
    ...labeled(all, /^\s*Nombre\s*:/i),
  ].filter((v) => isPlausibleName(v));
  const legalName = uniqueValue(names) ?? undefined;

  const address = uniqueValue(
    labeled(
      all,
      /^\s*Direcci[oó]n\s+(?:del\s+domicilio\s+principal|comercial|principal)\s*:?/i,
    ).filter(isPlausibleAddress),
  );
  const placeRaw = uniqueValue(
    [
      ...labeled(all, /^\s*Municipio(?:\s+comercial)?\s*:/i),
      ...labeled(all, /^\s*Domicilio(?:\s+principal)?\s*:/i),
    ].filter((v) => !isLabelLike(v)),
  );
  const place = placeRaw ? splitPlace(placeRaw) : null;
  const location: OrganizationLocation = {
    ...(place?.department ? { department: place.department } : {}),
    ...(place?.city ? { city: place.city } : {}),
    ...(address ? { address } : {}),
  };

  const rep = chamberLegalRepresentative(text);
  if (rep) {
    details.push({
      key: 'legal_representative',
      label: 'Representante legal',
      value: `${rep.name} · C.C. ${Number(rep.document).toLocaleString('es-CO')}`,
    });
  }
  const regDateRaw = labeled(all, /^\s*Fecha\s+de\s+(?:inscripci[oó]n|matr[ií]cula)\s*:?/i)[0];
  const regDate = regDateRaw ? parseSpanishDate(regDateRaw) : null;
  if (regDate) {
    details.push({
      key: 'registered_at',
      label: 'Fecha de inscripción',
      value: formatDate(regDate),
    });
  }
  const regNumber = labeled(all, /^\s*(?:Inscripci[oó]n|Matr[ií]cula)\s+(?:No\.?|N°|Nº|número)/i)
    .map((v) => v.match(/^[A-Z]?\d[\d-]{2,14}\b/i)?.[0])
    .find((v): v is string => !!v);
  if (regNumber) {
    details.push({ key: 'registration_number', label: 'Número de inscripción', value: regNumber });
  }
  const renewed = text.match(/[uú]ltimo\s+a[ñn]o\s+renovado\s*:?\s*(\d{4})/i);
  if (renewed) details.push({ key: 'renewed', label: 'Último año renovado', value: renewed[1] });

  return {
    ...(nit ? { nit } : {}),
    ...(legalName ? { legalName } : {}),
    ...(Object.keys(location).length > 0 ? { location } : {}),
    details,
  };
}

/** Lo que se le propone a la organización para su perfil, o nada. */
export function prefillFromText(
  documentId: string,
  type: DocumentType,
  text: string,
): DocumentPrefill {
  const data =
    type === DocumentType.Rut
      ? extractRutData(text)
      : type === DocumentType.ExistenceRepresentationCertificate
        ? extractChamberData(text)
        : { details: [] };
  return {
    documentId,
    readable: true,
    ...(data.nit ? { nit: data.nit } : {}),
    ...(data.legalName ? { legalName: data.legalName } : {}),
    ...(data.location ? { location: data.location } : {}),
    ...(data.details.length > 0 ? { details: data.details } : {}),
  };
}

/** ¿Hay algo que valga la pena mostrar en "Leímos tu documento"? */
export function hasProfileData(p: DocumentPrefill): boolean {
  return !!(p.nit || p.legalName || p.location);
}
