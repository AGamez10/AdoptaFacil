import {
  getLegalDocumentBySlug,
  LEGAL_DOCUMENTS,
  renderLegalTemplate,
  type LegalDocumentDescriptor,
} from '@adoptafacil/contracts';

/**
 * Textos legales versionados, empaquetados desde `docs/legal/<slug>/<versión>.md`
 * (la misma fuente cuyo hash registra la API al aceptar). Se incluyen TODAS las
 * versiones para poder mostrar exactamente lo que alguien aceptó en el pasado.
 */
const FILES = import.meta.glob('../../../../../../docs/legal/*/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const BY_SLUG_VERSION = new Map<string, string>();
for (const [path, text] of Object.entries(FILES)) {
  const match = /docs\/legal\/([^/]+)\/([^/]+)\.md$/.exec(path);
  if (match) BY_SLUG_VERSION.set(`${match[1]}@${match[2]}`, text);
}

export interface LegalDocumentContent {
  descriptor: LegalDocumentDescriptor;
  version: string;
  isCurrent: boolean;
  /** Texto con los datos del titular ya sustituidos (`{{titular…}}`). */
  markdown: string;
}

/** Texto de un documento (la versión vigente si no se indica otra). */
export function getLegalContent(slug: string, version?: string): LegalDocumentContent | null {
  const descriptor = getLegalDocumentBySlug(slug);
  if (!descriptor) return null;
  const wanted = version ?? descriptor.version;
  const markdown = BY_SLUG_VERSION.get(`${slug}@${wanted}`);
  if (markdown === undefined) return null;
  return {
    descriptor,
    version: wanted,
    isCurrent: wanted === descriptor.version,
    markdown: renderLegalTemplate(markdown),
  };
}

/** Versiones publicadas de un documento, más reciente primero. */
export function listLegalVersions(slug: string): string[] {
  return [...BY_SLUG_VERSION.keys()]
    .filter((k) => k.startsWith(`${slug}@`))
    .map((k) => k.slice(slug.length + 1))
    .sort()
    .reverse();
}

/** Ruta pública de un documento. */
export function legalPath(slug: string, version?: string): string {
  return version ? `/legal/${slug}/${version}` : `/legal/${slug}`;
}

export { LEGAL_DOCUMENTS };
