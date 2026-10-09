import { Injectable, Logger } from '@nestjs/common';
import type { DocumentTextPort } from './document-text.port';

/** Páginas que se leen como máximo: el RUT ocupa 1-3 y el certificado de
 *  Cámara rara vez pasa de 8. Limita el costo de un PDF malicioso. */
const MAX_PAGES = 10;
/** Por debajo de esto el PDF es una imagen escaneada sin capa de texto. */
const MIN_TEXT_LENGTH = 40;

/**
 * Lee la capa de texto de los PDF que generan la DIAN y las Cámaras de Comercio.
 * No hace OCR de imágenes: un escaneo devuelve `null` y el revisor decide a mano.
 * TODO(client): OCR de fotos (tesseract con datos de idioma locales) si el piloto
 * muestra muchos escaneos; se agrega como otro adaptador de este mismo puerto.
 */
@Injectable()
export class PdfTextAdapter implements DocumentTextPort {
  private readonly logger = new Logger('PdfTextAdapter');

  async extractText(data: Buffer, contentType?: string): Promise<string | null> {
    const looksPdf = data.subarray(0, 5).toString('latin1') === '%PDF-';
    if (!looksPdf || (contentType && !/pdf|octet-stream/i.test(contentType))) return null;
    // Carga perezosa: pdf.js pesa varios MB y solo hace falta al leer un documento.
    const { PDFParse } = await import('pdf-parse');
    const parser = new PDFParse({
      data: new Uint8Array(data),
      isEvalSupported: false,
      disableFontFace: true,
      stopAtErrors: false,
    });
    try {
      const result = await parser.getText({ first: MAX_PAGES });
      const text = result.text?.trim() ?? '';
      return text.length >= MIN_TEXT_LENGTH ? text : null;
    } catch (error) {
      // Nunca se registra el contenido del documento, solo que no se pudo leer.
      this.logger.warn(`No se pudo leer el PDF: ${(error as Error).name}`);
      return null;
    } finally {
      await parser.destroy().catch(() => undefined);
    }
  }
}
