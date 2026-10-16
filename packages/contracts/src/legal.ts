// Module: legal (términos, política de datos y aceptación versionada)
//
// Fuente única de los documentos legales publicados: la web los muestra y la API
// registra su aceptación con la MISMA versión y el MISMO hash. El texto vive en
// `docs/legal/<slug>/<version>.md` y es inmutable: cambiar una sola letra exige
// publicar una versión nueva (una prueba de la API compara el hash del archivo
// con el registrado aquí). Todos los textos son BORRADOR sujeto a abogado.

import type { AccountType } from './auth';

/** Documentos legales de la plataforma. */
export type LegalDocumentKey =
  | 'terms'
  | 'platform_scope'
  | 'org_terms'
  | 'privacy_policy'
  | 'data_authorization'
  | 'commercial_authorization'
  | 'ai_training_authorization'
  | 'privacy_notice'
  | 'cookies_policy';

/** Cómo se relaciona el usuario con el documento. */
export type LegalDocumentAcceptance =
  /** Debe aceptarse para tener cuenta (o para donar como invitado). */
  | 'required'
  /** Solo lo aceptan las cuentas de organización. */
  | 'required_organization'
  /** Autorización voluntaria, separada y revocable. */
  | 'optional'
  /** Se publica para informar; no se acepta. */
  | 'informative';

export interface LegalDocumentDescriptor {
  key: LegalDocumentKey;
  /** Segmento de URL de la página pública: `/legal/<slug>`. */
  slug: string;
  title: string;
  /** Fecha de la versión (YYYY-MM-DD); también es el nombre del archivo. */
  version: string;
  /** SHA-256 (hex) del archivo `docs/legal/<slug>/<version>.md`. */
  sha256: string;
  acceptance: LegalDocumentAcceptance;
  /** Mientras sea `true`, la web muestra el aviso de borrador sujeto a abogado. */
  draft: boolean;
}

/** Documentos vigentes (una sola versión por documento). */
export const LEGAL_DOCUMENTS: readonly LegalDocumentDescriptor[] = [
  {
    key: 'terms',
    slug: 'terminos',
    title: 'Términos y condiciones de uso',
    version: '2026-10-15',
    sha256: '2364d0e9428495f8561601756eeaada12afbceeccac59c3f6da87e87c57ff50a',
    acceptance: 'required',
    draft: true,
  },
  {
    key: 'platform_scope',
    slug: 'alcance',
    title: 'Qué es y qué no es AdoptaFácil',
    version: '2026-10-15',
    sha256: 'b96c62ceaf7302aa3d0b3d44cbeadd34e724fc97f8debecdcf6138ade4793ab2',
    acceptance: 'required',
    draft: true,
  },
  {
    key: 'org_terms',
    slug: 'condiciones-organizaciones',
    title: 'Condiciones para organizaciones y acuerdo de tratamiento de datos',
    version: '2026-10-15',
    sha256: '1155805979a37ea6b2d7da6a122354f2d4db98ce46ab1ad6de7ffc32bcbc4469',
    acceptance: 'required_organization',
    draft: true,
  },
  {
    key: 'privacy_policy',
    slug: 'politica-de-datos',
    title: 'Política de tratamiento de datos personales',
    version: '2026-10-15',
    sha256: '0a10e10607c1b0c8a201ee5ec8382721c97b666dfcac29d4b79000a44f3589dc',
    acceptance: 'required',
    draft: true,
  },
  {
    key: 'data_authorization',
    slug: 'autorizacion-datos',
    title: 'Autorización para el tratamiento de datos personales',
    version: '2026-10-15',
    sha256: 'dcbe0d15701e52a5c15cc362db53c2953f245569285a1fe6ce90976ff2d27ab7',
    acceptance: 'required',
    draft: true,
  },
  {
    key: 'commercial_authorization',
    slug: 'autorizacion-comercial',
    title: 'Autorización opcional para usos comerciales',
    version: '2026-10-15',
    sha256: 'fed58fb883ace5ff2cbf50404afa90cd0177869c0bc45a3382ba61f9ca2712ae',
    acceptance: 'optional',
    draft: true,
  },
  {
    key: 'ai_training_authorization',
    slug: 'autorizacion-ia',
    title: 'Autorización opcional para mejorar el producto y entrenar inteligencia artificial',
    version: '2026-10-15',
    sha256: '6ce09cd843b841705d66f444ba2b702e2853dc6d7d0c07bb8642ed8803d9c09d',
    acceptance: 'optional',
    draft: true,
  },
  {
    key: 'privacy_notice',
    slug: 'aviso-de-privacidad',
    title: 'Aviso de privacidad',
    version: '2026-10-15',
    sha256: '5d1cca885525bcce60e050dc5a90588dc5926bb8c3d5d2189d6c202c3b273b45',
    acceptance: 'informative',
    draft: true,
  },
  {
    key: 'cookies_policy',
    slug: 'cookies',
    title: 'Política de cookies',
    version: '2026-10-15',
    sha256: '14eb913f90b4d629652aef886811130f2be599ddbcfc84efa30edb314a81fb9d',
    acceptance: 'informative',
    draft: true,
  },
];

/**
 * Casillas que ve el usuario. Cada casilla acepta uno o varios documentos y
 * ninguna viene marcada. La autorización de datos va SEPARADA de los términos
 * (Ley 1581 art. 9) y la comercial es opcional.
 */
export interface LegalConsentGroup {
  id: 'terms' | 'data' | 'organization' | 'commercial' | 'ai';
  documents: readonly LegalDocumentKey[];
  optional: boolean;
  /** Solo se muestra a cuentas de organización. */
  organizationOnly: boolean;
}

export const LEGAL_CONSENT_GROUPS: readonly LegalConsentGroup[] = [
  { id: 'terms', documents: ['terms', 'platform_scope'], optional: false, organizationOnly: false },
  {
    id: 'data',
    documents: ['data_authorization', 'privacy_policy'],
    optional: false,
    organizationOnly: false,
  },
  { id: 'organization', documents: ['org_terms'], optional: false, organizationOnly: true },
  {
    id: 'commercial',
    documents: ['commercial_authorization'],
    optional: true,
    organizationOnly: false,
  },
  {
    id: 'ai',
    documents: ['ai_training_authorization'],
    optional: true,
    organizationOnly: false,
  },
];

/** Una aceptación enviada por el cliente: documento + versión que vio. */
export interface LegalAcceptanceItem {
  key: LegalDocumentKey;
  version: string;
}

/** Por dónde llegó la aceptación (queda en el registro). */
export type LegalAcceptanceChannel =
  'registration' | 'reacceptance' | 'guest_donation' | 'preferences';

/** Un registro del historial de aceptaciones del usuario. Fechas ISO-8601 UTC. */
export interface LegalAcceptanceRecord {
  key: LegalDocumentKey;
  version: string;
  action: 'accepted' | 'revoked';
  channel: LegalAcceptanceChannel;
  createdAt: string;
}

/** `GET /legal/me`. */
export interface LegalStatus {
  /** Documentos obligatorios cuya versión vigente aún no ha aceptado. */
  pending: LegalDocumentKey[];
  /** Si la autorización comercial opcional está vigente. */
  commercialAuthorized: boolean;
  /** Si la autorización opcional de mejora del producto e IA está vigente. */
  aiTrainingAuthorized: boolean;
  /** Historial completo, más reciente primero. */
  history: LegalAcceptanceRecord[];
}

/** `POST /legal/me/acceptances`. */
export interface AcceptLegalDocumentsInput {
  documents: LegalAcceptanceItem[];
}

/** Autorizaciones opcionales: se dan y se retiran desde "Mis autorizaciones". */
export function optionalLegalDocuments(): LegalDocumentKey[] {
  return LEGAL_DOCUMENTS.filter((d) => d.acceptance === 'optional').map((d) => d.key);
}

/** `POST /legal/me/revocations` — solo documentos opcionales. */
export interface RevokeLegalDocumentInput {
  key: LegalDocumentKey;
}

export function getLegalDocument(key: LegalDocumentKey): LegalDocumentDescriptor {
  const doc = LEGAL_DOCUMENTS.find((d) => d.key === key);
  if (!doc) throw new Error(`Unknown legal document: ${key}`);
  return doc;
}

export function getLegalDocumentBySlug(slug: string): LegalDocumentDescriptor | undefined {
  return LEGAL_DOCUMENTS.find((d) => d.slug === slug);
}

/** Documentos que una cuenta debe tener aceptados en su versión vigente. */
export function requiredLegalDocuments(accountType: AccountType): LegalDocumentKey[] {
  return LEGAL_DOCUMENTS.filter(
    (d) =>
      d.acceptance === 'required' ||
      (d.acceptance === 'required_organization' && accountType === 'organization'),
  ).map((d) => d.key);
}

/** Documentos que debe aceptar quien dona sin cuenta. */
export function requiredGuestLegalDocuments(): LegalDocumentKey[] {
  return LEGAL_DOCUMENTS.filter((d) => d.acceptance === 'required').map((d) => d.key);
}

/** Versión vigente de cada documento pedido, lista para enviar a la API. */
export function currentLegalAcceptanceItems(
  keys: readonly LegalDocumentKey[],
): LegalAcceptanceItem[] {
  return keys.map((key) => ({ key, version: getLegalDocument(key).version }));
}
