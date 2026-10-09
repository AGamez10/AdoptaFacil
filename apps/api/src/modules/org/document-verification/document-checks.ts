import {
  DocumentType,
  FORMALIZATION_SEQUENCE,
  FormalizationState,
  type DocumentVerificationCheck,
  type DocumentVerificationReport,
  type DocumentVerificationSuggestion,
  type ExtractedDocumentField,
  type OfficialLookupLink,
  type VerificationCheckResult,
} from '@adoptafacil/contracts';
import { isValidNit, onlyDigits, splitNit } from './nit';

/**
 * Chequeos automáticos de un documento de organización a partir de su texto.
 * Funciones puras: no leen base de datos ni archivos. La máquina propone y una
 * persona de plataforma decide; nada de aquí aprueba un documento por sí solo.
 *
 * Los patrones están escritos para el RUT (formulario 001 de la DIAN) y el
 * certificado de existencia y representación legal de las Cámaras de Comercio.
 * TODO(client): calibrarlos con 10-20 documentos reales de organizaciones piloto.
 */

/** Antigüedad máxima aceptada del RUT y del certificado de Cámara.
 *  TODO(client): 30 días es la práctica común de bancos y entidades públicas. */
export const MAX_DOCUMENT_AGE_DAYS = 30;

export const OFFICIAL_LINKS: Record<string, OfficialLookupLink> = {
  rues: { label: 'Consultar en el RUES (Cámaras de Comercio)', url: 'https://www.rues.org.co/' },
  rutStatus: {
    label: 'Consultar estado del RUT en la DIAN',
    url: 'https://muisca.dian.gov.co/WebRutMuisca/DefConsultaEstadoRUT.faces',
  },
};

export interface VerificationContext {
  /** NIT que la organización escribió en su perfil, tal cual. */
  profileNit?: string | null;
  /** Razón social del perfil y nombre visible de la organización. */
  legalName?: string | null;
  organizationName: string;
  currentState: FormalizationState;
  /** Representante legal vigente registrado en la plataforma, si lo hay. */
  legalRepresentative?: { fullName: string; documentNumber: string } | null;
  now: Date;
}

/** Minúsculas, sin tildes y con espacios simples, para comparar sin falsos negativos. */
export function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9ñ]+/g, ' ')
    .trim();
}

/** Texto con solo dígitos y separadores borrados: "9 0 0 1 2 3" → "900123". */
function digitStream(text: string): string {
  return text.replace(/[\s.-]/g, '');
}

const MONTHS: Record<string, number> = {
  enero: 1,
  febrero: 2,
  marzo: 3,
  abril: 4,
  mayo: 5,
  junio: 6,
  julio: 7,
  agosto: 8,
  septiembre: 9,
  setiembre: 9,
  octubre: 10,
  noviembre: 11,
  diciembre: 12,
};

/** Interpreta las fechas que usan la DIAN y las Cámaras. Devuelve UTC. */
export function parseSpanishDate(raw: string): Date | null {
  // La primera fecha que aparezca, sea cual sea su formato.
  const candidates: Array<{ at: number; date: Date | null }> = [];
  let m = raw.match(/\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b/);
  if (m?.index !== undefined) candidates.push({ at: m.index, date: utc(+m[1], +m[2], +m[3]) });
  m = raw.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})\b/);
  if (m?.index !== undefined) candidates.push({ at: m.index, date: utc(+m[3], +m[2], +m[1]) });
  const s = normalize(raw);
  m = s.match(/\b(\d{1,2}) de ([a-z]+) de (\d{4})\b/);
  if (m && MONTHS[m[2]] && candidates.length === 0) return utc(+m[3], MONTHS[m[2]], +m[1]);
  candidates.sort((a, b) => a.at - b.at);
  if (candidates.length > 0) return candidates[0].date;
  return null;
}

function utc(year: number, month: number, day: number): Date | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return new Date(Date.UTC(year, month - 1, day));
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Busca la fecha que sigue a una etiqueta, en los 60 caracteres siguientes. */
function dateAfter(text: string, label: RegExp): Date | null {
  const m = text.match(label);
  if (!m || m.index === undefined) return null;
  return parseSpanishDate(text.slice(m.index + m[0].length, m.index + m[0].length + 60));
}

/** NIT + DV leídos del texto: primero "NIT 900.123.456-7", luego dígitos sueltos. */
export function extractNit(text: string): { base: string; dv: string } | null {
  const labeled = text.match(/N\.?\s*I\.?\s*T\.?\s*[:.]?\s*([\d.\s]{6,20})\s*-\s*(\d)\b/i);
  if (labeled) return { base: onlyDigits(labeled[1]), dv: labeled[2] };
  const plain = text.match(/\b(\d{3}\.?\d{3}\.?\d{3})\s*-\s*(\d)\b/);
  if (plain) return { base: onlyDigits(plain[1]), dv: plain[2] };
  // RUT: el NIT viene en casillas, un dígito por casilla, y el DV en la casilla 6.
  // Se toma la primera tira de 9 a 11 dígitos; el último es el DV (casilla 6).
  const label = text.match(/Identificaci[oó]n\s+Tributaria/i);
  if (!label || label.index === undefined) return null;
  const window = text.slice(label.index, label.index + 240);
  const run = window.match(/(?<![\d.])((?:\d[ \t]?){9,11})(?![\d.])/);
  if (!run) return null;
  const digits = onlyDigits(run[1]);
  return { base: digits.slice(0, -1), dv: digits.slice(-1) };
}

/** Razón social: lo que sigue a "Razón social" o "Nombre:" en la misma línea. */
export function extractLegalName(text: string): string | null {
  const m = text.match(/(?:raz[oó]n\s+social|^\s*nombre)\s*:?[ \t]*([^\n]{3,160})/im);
  if (!m) return null;
  const value = m[1]
    .replace(/^\s*\d+\.\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();
  return /[A-Za-zÁÉÍÓÚÑáéíóúñ]{3}/.test(value) ? value : null;
}

function check(
  id: string,
  label: string,
  result: VerificationCheckResult,
  detail: string,
): DocumentVerificationCheck {
  return { id, label, result, detail };
}

function nitAgainstProfile(text: string, ctx: VerificationContext): DocumentVerificationCheck {
  const label = 'El NIT coincide con el del perfil';
  if (!ctx.profileNit?.trim()) {
    return check(
      'nit_profile',
      label,
      'warn',
      'La organización no ha escrito su NIT en el perfil.',
    );
  }
  const stream = digitStream(text);
  const found = splitNit(ctx.profileNit).some(
    ({ base }) => base.length >= 6 && stream.includes(base),
  );
  return found
    ? check('nit_profile', label, 'pass', `El documento trae el NIT ${ctx.profileNit.trim()}.`)
    : check(
        'nit_profile',
        label,
        'fail',
        `El perfil dice NIT ${ctx.profileNit.trim()} y el documento no lo trae.`,
      );
}

function nitCheckDigitCheck(nit: { base: string; dv: string } | null): DocumentVerificationCheck {
  const label = 'El dígito de verificación del NIT es correcto';
  if (!nit)
    return check(
      'nit_dv',
      label,
      'unknown',
      'No se encontró el NIT con su dígito de verificación.',
    );
  return isValidNit(nit.base, nit.dv)
    ? check('nit_dv', label, 'pass', `${nit.base}-${nit.dv} es un NIT válido.`)
    : check('nit_dv', label, 'fail', `${nit.base}-${nit.dv}: el dígito no corresponde al NIT.`);
}

function nameCheck(text: string, ctx: VerificationContext): DocumentVerificationCheck {
  const label = 'El nombre coincide con el de la organización';
  const haystack = normalize(text);
  const candidates = [ctx.legalName, ctx.organizationName]
    .filter((v): v is string => !!v && normalize(v).length >= 4)
    .map((v) => ({ raw: v.trim(), norm: normalize(v) }));
  const hit = candidates.find((c) => haystack.includes(c.norm));
  if (hit) return check('name', label, 'pass', `El documento trae "${hit.raw}".`);
  return check(
    'name',
    label,
    'warn',
    'No aparece el nombre registrado. Puede ser una sigla o un nombre comercial: compáralo en el archivo.',
  );
}

function freshnessCheck(
  issued: Date | null,
  ctx: VerificationContext,
  what: string,
): DocumentVerificationCheck {
  const label = `${what} tiene menos de ${MAX_DOCUMENT_AGE_DAYS} días`;
  if (!issued) return check('fresh', label, 'unknown', 'No se encontró la fecha de expedición.');
  const days = Math.floor((ctx.now.getTime() - issued.getTime()) / 86_400_000);
  if (days < -1) {
    return check('fresh', label, 'fail', `La fecha ${formatDate(issued)} está en el futuro.`);
  }
  return days <= MAX_DOCUMENT_AGE_DAYS
    ? check(
        'fresh',
        label,
        'pass',
        `Expedido el ${formatDate(issued)} (hace ${Math.max(days, 0)} días).`,
      )
    : check(
        'fresh',
        label,
        'warn',
        `Expedido el ${formatDate(issued)}, hace ${days} días: pide uno reciente.`,
      );
}

function legalRepCheck(text: string, ctx: VerificationContext): DocumentVerificationCheck {
  const label = 'El representante legal coincide con el registrado';
  const rep = ctx.legalRepresentative;
  if (!rep) {
    return check(
      'legal_rep',
      label,
      'warn',
      'La organización aún no registra a su representante legal.',
    );
  }
  const hasDoc = digitStream(text).includes(onlyDigits(rep.documentNumber));
  const hasName = normalize(text).includes(normalize(rep.fullName));
  if (hasDoc && hasName) {
    return check('legal_rep', label, 'pass', `${rep.fullName} aparece con su documento.`);
  }
  if (hasDoc || hasName) {
    return check(
      'legal_rep',
      label,
      'warn',
      `Solo coincide ${hasDoc ? 'el número de documento' : 'el nombre'} de ${rep.fullName}.`,
    );
  }
  return check('legal_rep', label, 'fail', `${rep.fullName} no aparece en el documento.`);
}

interface CheckSet {
  fields: ExtractedDocumentField[];
  checks: DocumentVerificationCheck[];
  supports?: FormalizationState;
  links: OfficialLookupLink[];
}

function rutChecks(text: string, ctx: VerificationContext): CheckSet {
  const fields: ExtractedDocumentField[] = [];
  const checks: DocumentVerificationCheck[] = [];
  const isRut =
    /registro\s+[uú]nico\s+tributario/i.test(text) || /formulario\s+del\s+rut/i.test(text);
  checks.push(
    check(
      'kind',
      'Es un RUT de la DIAN',
      isRut ? 'pass' : 'fail',
      isRut
        ? 'El archivo es un formulario del Registro Único Tributario.'
        : 'El archivo no parece un RUT.',
    ),
  );

  const nit = extractNit(text);
  if (nit) fields.push({ key: 'nit', label: 'NIT', value: `${nit.base}-${nit.dv}` });
  checks.push(nitCheckDigitCheck(nit), nitAgainstProfile(text, ctx), nameCheck(text, ctx));

  const juridica = /persona\s+jur[ií]dica/i.test(text);
  const natural = /persona\s+natural/i.test(text);
  const kind = juridica ? 'Persona jurídica' : natural ? 'Persona natural' : undefined;
  if (kind) fields.push({ key: 'taxpayer_type', label: 'Tipo de contribuyente', value: kind });
  checks.push(
    juridica
      ? check('juridica', 'Es una persona jurídica', 'pass', 'El RUT es de una persona jurídica.')
      : check(
          'juridica',
          'Es una persona jurídica',
          natural ? 'warn' : 'unknown',
          natural
            ? 'Es el RUT de una persona natural: sirve para un rescatista informal, no para formalizar.'
            : 'No se encontró el tipo de contribuyente.',
        ),
  );

  // Casilla 53. La DIAN cambia de oficio 04 → 05 cuando una ESAL sale del RTE,
  // así que un RUT reciente es la mejor prueba de que el RTE sigue vigente.
  const especial =
    /r[ée]gimen\s+(tributario\s+)?especial/i.test(text) || /\b04\s*-\s*impto?/i.test(text);
  const ordinario = /r[ée]gimen\s+ordinari/i.test(text) || /\b05\s*-\s*impto?/i.test(text);
  let supports: FormalizationState | undefined;
  if (especial) {
    fields.push({
      key: 'regime',
      label: 'Responsabilidad de renta',
      value: '04 · Régimen Tributario Especial',
    });
    checks.push(
      check(
        'rte',
        'Está en el Régimen Tributario Especial (04)',
        'pass',
        'Respalda pasar a ESAL con RTE.',
      ),
    );
    supports = juridica ? FormalizationState.ESAL_RTE : undefined;
  } else if (ordinario) {
    fields.push({
      key: 'regime',
      label: 'Responsabilidad de renta',
      value: '05 · Régimen ordinario',
    });
    checks.push(
      check(
        'rte',
        'Está en el Régimen Tributario Especial (04)',
        'warn',
        'Está en régimen ordinario (05): no puede emitir certificados con beneficio tributario.',
      ),
    );
  } else {
    checks.push(
      check(
        'rte',
        'Está en el Régimen Tributario Especial (04)',
        'unknown',
        'No se encontró la casilla 53.',
      ),
    );
  }

  const generated =
    dateAfter(text, /fecha\s+(de\s+)?generaci[oó]n(\s+(del\s+)?documento)?(\s+pdf)?\s*:?/i) ??
    dateAfter(text, /fecha\s+(de\s+)?(impresi[oó]n|expedici[oó]n)\s*:?/i);
  if (generated)
    fields.push({ key: 'generated_at', label: 'Generado', value: formatDate(generated) });
  checks.push(freshnessCheck(generated, ctx, 'El RUT'));

  return { fields, checks, supports, links: [OFFICIAL_LINKS.rutStatus] };
}

function cerlChecks(text: string, ctx: VerificationContext): CheckSet {
  const fields: ExtractedDocumentField[] = [];
  const checks: DocumentVerificationCheck[] = [];
  const isCerl =
    /existencia\s+y\s+representaci[oó]n/i.test(text) ||
    /inscripci[oó]n\s+de\s+documentos/i.test(text);
  const fromChamber = /c[aá]mara\s+de\s+comercio/i.test(text);
  checks.push(
    check(
      'kind',
      'Es un certificado de la Cámara de Comercio',
      isCerl && fromChamber ? 'pass' : 'fail',
      isCerl && fromChamber
        ? 'Es un certificado de existencia y representación legal.'
        : 'El archivo no parece un certificado de Cámara de Comercio.',
    ),
  );

  const nit = extractNit(text);
  if (nit) fields.push({ key: 'nit', label: 'NIT', value: `${nit.base}-${nit.dv}` });
  checks.push(nitCheckDigitCheck(nit), nitAgainstProfile(text, ctx), nameCheck(text, ctx));

  const esal =
    /sin\s+[aá]nimo\s+de\s+lucro/i.test(text) ||
    /\besal\b/i.test(text) ||
    /\b(fundaci[oó]n|asociaci[oó]n|corporaci[oó]n)\b/i.test(text);
  checks.push(
    esal
      ? check(
          'esal',
          'Es una entidad sin ánimo de lucro',
          'pass',
          'El certificado la registra como ESAL.',
        )
      : check(
          'esal',
          'Es una entidad sin ánimo de lucro',
          'warn',
          'No dice "sin ánimo de lucro": puede ser una sociedad, que no recibe donaciones deducibles.',
        ),
  );

  const closed = /\b(cancelada|disuelta|en\s+liquidaci[oó]n|liquidada)\b/i.test(text);
  const active = /\bactiv[ao]\b/i.test(text);
  checks.push(
    closed
      ? check(
          'active',
          'La inscripción está activa',
          'fail',
          'El certificado dice que está cancelada, disuelta o en liquidación.',
        )
      : check(
          'active',
          'La inscripción está activa',
          active ? 'pass' : 'unknown',
          active
            ? 'El certificado la reporta activa.'
            : 'No se encontró el estado de la inscripción.',
        ),
  );

  // La renovación vence el 31 de marzo de cada año (Código de Comercio, art. 33).
  const renewed = text.match(/[uú]ltimo\s+a[ñn]o\s+renovado\s*:?\s*(\d{4})/i);
  if (renewed) {
    const year = Number(renewed[1]);
    fields.push({ key: 'renewed', label: 'Último año renovado', value: String(year) });
    const current = ctx.now.getUTCFullYear();
    const pastDeadline = ctx.now.getUTCMonth() > 2; // después de marzo
    const expected = pastDeadline ? current : current - 1;
    checks.push(
      year >= expected
        ? check('renewed', 'Renovó su inscripción este año', 'pass', `Renovada en ${year}.`)
        : check(
            'renewed',
            'Renovó su inscripción este año',
            'warn',
            `Última renovación en ${year}: debe renovar.`,
          ),
    );
  }

  const issued = dateAfter(text, /fecha\s+(de\s+)?expedici[oó]n\s*:?/i);
  if (issued) fields.push({ key: 'issued_at', label: 'Expedido', value: formatDate(issued) });
  checks.push(freshnessCheck(issued, ctx, 'El certificado'));

  const code = text.match(/c[oó]digo\s+de\s+verificaci[oó]n\s*:?\s*([A-Za-z0-9]{6,20})/i);
  if (code)
    fields.push({ key: 'verification_code', label: 'Código de verificación', value: code[1] });

  checks.push(legalRepCheck(text, ctx));

  const supports = closed
    ? undefined
    : esal
      ? FormalizationState.ESAL
      : FormalizationState.Formalizada;
  return { fields, checks, supports, links: [OFFICIAL_LINKS.rues] };
}

function legalRepIdChecks(text: string, ctx: VerificationContext): CheckSet {
  return { fields: [], checks: [legalRepCheck(text, ctx)], links: [] };
}

function rank(state: FormalizationState): number {
  return FORMALIZATION_SEQUENCE.indexOf(state);
}

/** Motivo prellenado con lo que falló, en palabras para la organización. */
function noteFor(checks: DocumentVerificationCheck[]): string | undefined {
  const failed = checks.filter((c) => c.result === 'fail');
  if (failed.length === 0) return undefined;
  return `Revisamos tu documento y encontramos esto: ${failed.map((c) => c.detail).join(' ')} Sube una versión corregida, por favor.`;
}

/**
 * Arma el informe para el revisor. `text === null` significa que el archivo no
 * se pudo leer (escaneo, foto o formato no soportado): revisión manual.
 */
export function buildVerificationReport(
  doc: { id: string; organizationId: string; type: DocumentType },
  text: string | null,
  ctx: VerificationContext,
): DocumentVerificationReport {
  const base = {
    documentId: doc.id,
    organizationId: doc.organizationId,
    type: doc.type,
    currentState: ctx.currentState,
  };
  const partial: CheckSet | null =
    text === null
      ? null
      : doc.type === DocumentType.Rut
        ? rutChecks(text, ctx)
        : doc.type === DocumentType.ExistenceRepresentationCertificate
          ? cerlChecks(text, ctx)
          : doc.type === DocumentType.LegalRepresentativeId
            ? legalRepIdChecks(text, ctx)
            : null;

  if (!partial) {
    return {
      ...base,
      method: text === null ? 'none' : 'pdf_text',
      fields: [],
      checks: [],
      suggestion: 'manual',
      links: [OFFICIAL_LINKS.rues, OFFICIAL_LINKS.rutStatus],
    };
  }

  const kindFailed = partial.checks.some((c) => c.id === 'kind' && c.result === 'fail');
  const anyFail = partial.checks.some((c) => c.result === 'fail');
  const suggestion: DocumentVerificationSuggestion = anyFail ? 'observe' : 'approve';
  const suggestedState =
    !anyFail && !kindFailed && partial.supports && rank(partial.supports) > rank(ctx.currentState)
      ? partial.supports
      : undefined;

  return {
    ...base,
    method: 'pdf_text',
    fields: partial.fields,
    checks: partial.checks,
    suggestion,
    ...(anyFail ? { suggestedNote: noteFor(partial.checks) } : {}),
    ...(suggestedState ? { suggestedState } : {}),
    links: partial.links,
  };
}
