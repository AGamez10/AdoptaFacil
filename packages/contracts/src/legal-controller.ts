/**
 * Titular que opera AdoptaFácil y aviso de los documentos que genera la
 * plataforma. ÚNICA fuente de estos datos: los textos legales usan marcadores
 * `{{titular}}`, `{{titular.nombre}}`, … que se sustituyen al mostrarlos, y el
 * pie de la web y de los correos los lee de aquí. Constituir la sociedad es
 * cambiar este objeto (y publicar una versión nueva de los textos que cambien
 * de responsable), no editar cada texto.
 *
 * Datos tomados del RUT del titular (formulario 001 de la DIAN, generado el
 * 2026-10-12). El NIT y su dígito de verificación se comprueban en una prueba.
 * La cédula NO se publica aparte: en una persona natural el NIT ya es ese
 * número, y la ley de comercio electrónico (Ley 1480 de 2011, art. 50) pide
 * identidad, NIT, dirección, teléfono y correo, no más.
 */
export interface LegalController {
  /** 'natural_person' mientras se opera con el RUT de la persona natural. */
  kind: 'natural_person' | 'company';
  /** Nombre tal como aparece en el RUT (o razón social de la sociedad). */
  name: string;
  /** Cédula. No se muestra en ninguna página: en persona natural el NIT es el
   *  mismo número. En una sociedad queda vacío. */
  idNumber: string;
  /** NIT con su dígito de verificación, con puntos y guion (p. ej. 1.004.356.866-5). */
  nit: string;
  /** Matrícula mercantil en la Cámara de Comercio. Vacío = no se menciona. */
  commercialRegistry: string;
  /** Dirección principal del RUT, con la ciudad. */
  address: string;
  /** Ciudad del domicilio (para el pie de página). */
  city: string;
  email: string;
  phone: string;
  domain: string;
  /** Actividad económica principal del RUT (casilla 46, código CIIU). Aditivo. */
  economicActivity?: { ciiu: string; description: string };
  /** Responsabilidades del RUT (casilla 53), con su descripción. Aditivo. */
  taxResponsibilities?: readonly { code: string; description: string }[];
  /**
   * Si el titular es responsable de IVA (responsabilidad 48 en el RUT). Si es
   * `false`, AdoptaFácil NO puede cobrar IVA sobre sus planes. Aditivo.
   */
  vatResponsible?: boolean;
}

export const LEGAL_CONTROLLER: LegalController = {
  kind: 'natural_person',
  name: 'Andres Felipe Gamez Arias',
  idNumber: '',
  nit: '1.004.356.866-5',
  // TODO(client): número de matrícula mercantil si la persona natural está
  // inscrita en la Cámara de Comercio de Bogotá; el RUT no la trae.
  commercialRegistry: '',
  address: 'Carrera 97 C Sur # 71-30, Condominios del Recreo 2, Bogotá D.C., Colombia',
  city: 'Bogotá D.C.',
  email: 'adoptafacil.oficial@gmail.com',
  phone: '302 852 8926',
  domain: 'adoptafacil.org',
  economicActivity: {
    ciiu: '6201',
    description: 'Actividades de desarrollo de sistemas informáticos',
  },
  taxResponsibilities: [
    { code: '05', description: 'Impuesto de renta y complementarios, régimen ordinario' },
  ],
  vatResponsible: false,
};

/** Pesos de la DIAN para el dígito de verificación (de derecha a izquierda). */
const NIT_WEIGHTS = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71] as const;

/** Dígito de verificación de un NIT (solo dígitos, sin el DV). */
export function nitVerificationDigit(base: string): number {
  const digits = base.replace(/\D/g, '');
  let sum = 0;
  for (let i = 0; i < digits.length; i += 1) {
    sum += Number(digits[digits.length - 1 - i]) * (NIT_WEIGHTS[i] ?? 0);
  }
  const r = sum % 11;
  return r > 1 ? 11 - r : r;
}

/** Línea corta para pies de página: quién opera la plataforma. */
export function legalControllerFooterLine(c: LegalController = LEGAL_CONTROLLER): string {
  const who = c.kind === 'company' ? c.name : `${c.name}, persona natural`;
  return `AdoptaFácil es operada por ${who} · NIT ${c.nit} · ${c.address}`;
}

/** Descripción completa del titular para el encabezado de los textos legales. */
export function describeLegalController(c: LegalController = LEGAL_CONTROLLER): string {
  const registry = c.commercialRegistry ? `, matrícula mercantil ${c.commercialRegistry}` : '';
  if (c.kind === 'company') {
    return `${c.name}, NIT ${c.nit}${registry}, con domicilio en ${c.address}`;
  }
  return `${c.name}, persona natural con actividad comercial, identificada con NIT ${c.nit}${registry}, con domicilio en ${c.address}`;
}

/** Sustituye los marcadores `{{titular…}}` de un texto legal. Marcadores desconocidos quedan igual. */
export function renderLegalTemplate(text: string, c: LegalController = LEGAL_CONTROLLER): string {
  const values: Record<string, string> = {
    titular: describeLegalController(c),
    'titular.nombre': c.name,
    'titular.documento': `NIT ${c.nit}`,
    'titular.nit': c.nit,
    'titular.matricula': c.commercialRegistry || 'no aplica',
    'titular.domicilio': c.address,
    'titular.ciudad': c.city,
    'titular.correo': c.email,
    'titular.telefono': c.phone,
    'titular.dominio': c.domain,
  };
  return text.replace(
    /\{\{\s*(titular(?:\.[a-z]+)?)\s*\}\}/g,
    (match, key: string) => values[key] ?? match,
  );
}

/**
 * Aviso que llevan TODOS los reportes, certificados, constancias, carnés y
 * contratos que genera la plataforma (Términos, sección 15).
 * TODO(client): ⟦ABOGADO/CONTADOR⟧ validar redacción.
 */
export const PLATFORM_DOCUMENT_NOTICE =
  'Documento generado por la plataforma AdoptaFácil con la información registrada por la organización. ' +
  'No reemplaza la certificación de contador público ni de revisor fiscal. ' +
  'El certificado de donación con efectos tributarios lo expide la organización donataria.';
