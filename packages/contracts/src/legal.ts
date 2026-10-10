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
    version: '2026-10-09',
    sha256: '0e31248fe56f497f2ba82545e4b2591161efb2bcbf6bc83d976ad3ba1f9195b3',
    acceptance: 'required',
    draft: true,
  },
  {
    key: 'platform_scope',
    slug: 'alcance',
    title: 'Qué es y qué no es AdoptaFácil',
    version: '2026-10-09',
    sha256: '2d6bcfae8ec1355b288c8d7c3e8dad6cba8ac1714439320ac5d4b079923db4de',
    acceptance: 'required',
    draft: true,
  },
  {
    key: 'org_terms',
    slug: 'condiciones-organizaciones',
    title: 'Condiciones para organizaciones y acuerdo de tratamiento de datos',
    version: '2026-10-09',
    sha256: '50835bf17a74787f3d71767978a0dd2212e60085f222565da7c4ae0c65bbf810',
    acceptance: 'required_organization',
    draft: true,
  },
  {
    key: 'privacy_policy',
    slug: 'politica-de-datos',
    title: 'Política de tratamiento de datos personales',
    version: '2026-10-09',
    sha256: '1744ccb476508164a3f2bb17fe2dc2e646731de8b9641d0c2618c971b6337cde',
    acceptance: 'required',
    draft: true,
  },
  {
    key: 'data_authorization',
    slug: 'autorizacion-datos',
    title: 'Autorización para el tratamiento de datos personales',
    version: '2026-10-09',
    sha256: 'f4657bbba43bb6ad05b3e5290069498d7f39dac621eacacf7b38890503eac95c',
    acceptance: 'required',
    draft: true,
  },
  {
    key: 'commercial_authorization',
    slug: 'autorizacion-comercial',
    title: 'Autorización opcional para usos comerciales',
    version: '2026-10-09',
    sha256: '71c7460304a1bc02a3cf4734409d3084e734267c6efdd2a67a3362fec02dea70',
    acceptance: 'optional',
    draft: true,
  },
  {
    key: 'ai_training_authorization',
    slug: 'autorizacion-ia',
    title: 'Autorización opcional para mejorar el producto y entrenar inteligencia artificial',
    version: '2026-10-09',
    sha256: '47537713816ce08afb8eb13db9e0266d4ffcfb4aae3b40024d09891025f43df7',
    acceptance: 'optional',
    draft: true,
  },
  {
    key: 'privacy_notice',
    slug: 'aviso-de-privacidad',
    title: 'Aviso de privacidad',
    version: '2026-10-09',
    sha256: '487fb120bd8336c782c1b2ab3b3c98e5fbfd95728c3552da1bf62d1180415a46',
    acceptance: 'informative',
    draft: true,
  },
  {
    key: 'cookies_policy',
    slug: 'cookies',
    title: 'Política de cookies',
    version: '2026-10-09',
    sha256: '4e006dcdeeb46b77171be950f356f9d59daca1bd0f70b630ed89e94b8a592e1a',
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
