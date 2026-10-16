/**
 * Titular que opera AdoptaFácil y aviso de los documentos que genera la
 * plataforma. ÚNICA fuente de estos datos: los textos legales usan marcadores
 * `{{titular}}`, `{{titular.nombre}}`, … que se sustituyen al mostrarlos, así
 * que constituir la sociedad es cambiar este objeto (y publicar una versión
 * nueva de los textos que cambien de responsable), no editar cada texto.
 *
 * TODO(client): completar al tener cédula, NIT, matrícula mercantil y
 * domicilio; cambiar `kind` a 'company' cuando se constituya la sociedad.
 */
export interface LegalController {
  /** 'natural_person' mientras se opera con el RUT de la persona natural. */
  kind: 'natural_person' | 'company';
  name: string;
  /** Cédula (persona natural). En una sociedad queda vacío. */
  idNumber: string;
  nit: string;
  /** Matrícula mercantil en la Cámara de Comercio. */
  commercialRegistry: string;
  address: string;
  email: string;
  phone: string;
  domain: string;
}

export const LEGAL_CONTROLLER: LegalController = {
  kind: 'natural_person',
  name: '⟦NOMBRE COMPLETO DE LA PERSONA NATURAL⟧',
  idNumber: '⟦CÉDULA⟧',
  nit: '⟦NIT DEL RUT⟧',
  commercialRegistry: '⟦MATRÍCULA MERCANTIL⟧',
  address: '⟦CIUDAD, DIRECCIÓN⟧',
  email: 'adoptafacil.oficial@gmail.com',
  phone: '302 852 8926',
  domain: 'adoptafacil.org',
};

/** Descripción completa del titular para el encabezado de los textos legales. */
export function describeLegalController(c: LegalController = LEGAL_CONTROLLER): string {
  if (c.kind === 'company') {
    return `${c.name}, NIT ${c.nit}, matrícula mercantil ${c.commercialRegistry}, con domicilio en ${c.address}`;
  }
  return `${c.name}, persona natural comerciante identificada con cédula ${c.idNumber} y NIT ${c.nit}, matrícula mercantil ${c.commercialRegistry}, con domicilio en ${c.address}`;
}

/** Sustituye los marcadores `{{titular…}}` de un texto legal. Marcadores desconocidos quedan igual. */
export function renderLegalTemplate(text: string, c: LegalController = LEGAL_CONTROLLER): string {
  const values: Record<string, string> = {
    titular: describeLegalController(c),
    'titular.nombre': c.name,
    'titular.documento': c.kind === 'company' ? `NIT ${c.nit}` : `cédula ${c.idNumber}`,
    'titular.nit': c.nit,
    'titular.matricula': c.commercialRegistry,
    'titular.domicilio': c.address,
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
