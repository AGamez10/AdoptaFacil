/**
 * Puerto para leer el texto de un documento subido (invariante 5: integraciones
 * detrás de puertos simulables). La lectura corre DENTRO del servidor: el archivo
 * nunca sale a un proveedor externo.
 */
export const DOCUMENT_TEXT_PORT = Symbol('DOCUMENT_TEXT_PORT');

export interface DocumentTextPort {
  /** Texto del documento, o `null` si no se puede leer (escaneo, foto o formato
   *  no soportado). Nunca lanza por un archivo dañado: devuelve `null`. */
  extractText(data: Buffer, contentType?: string): Promise<string | null>;
}
