import { LEGAL_DOCUMENTS } from '@adoptafacil/contracts';

/**
 * Ruta pública de un documento legal. Vive aparte de `legal-content.ts` para
 * que los formularios que solo enlazan a los términos no arrastren al paquete
 * inicial todos los textos legales (más de 140 KB de Markdown): esos se bajan
 * solo al abrir `/legal/...`.
 */
export function legalPath(slug: string, version?: string): string {
  return version ? `/legal/${slug}/${version}` : `/legal/${slug}`;
}

export { LEGAL_DOCUMENTS };
