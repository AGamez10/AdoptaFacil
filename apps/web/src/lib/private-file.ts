/**
 * Mostrar un archivo que subió un usuario SIN descargarlo y sin darle la
 * oportunidad de ejecutar nada en la página. El archivo llega por `fetch` con
 * sesión y se vuelve un `blob:` del mismo origen de la web, así que su tipo lo
 * decide ESTE módulo por los primeros bytes (nunca la cabecera ni el nombre):
 * solo un PDF o una imagen se muestran; HTML, SVG o cualquier otra cosa no.
 */
export type ViewableKind = 'pdf' | 'image';

export interface ViewableFile {
  kind: ViewableKind;
  contentType: string;
  blob: Blob;
}

function startsWith(bytes: Uint8Array, signature: number[], offset = 0): boolean {
  return signature.every((byte, i) => bytes[offset + i] === byte);
}

/** Tipo real por firma, o `null` si no es PDF ni una imagen que se pueda mostrar. */
export function sniffViewableType(bytes: Uint8Array): string | null {
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return 'application/pdf'; // %PDF-
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(bytes, [0x47, 0x49, 0x46, 0x38])) return 'image/gif'; // GIF8
  if (
    startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)
  ) {
    return 'image/webp'; // RIFF....WEBP
  }
  return null;
}

/** Lee los bytes de un `Blob` (con `FileReader` donde no hay `Blob.arrayBuffer`). */
function bufferOf(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === 'function') return blob.arrayBuffer();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

/** Rehace el blob con su tipo real, o `null` si no es seguro mostrarlo. */
export async function toViewableFile(blob: Blob): Promise<ViewableFile | null> {
  const buffer = await bufferOf(blob);
  const contentType = sniffViewableType(new Uint8Array(buffer, 0, Math.min(16, buffer.byteLength)));
  if (!contentType) return null;
  return {
    kind: contentType === 'application/pdf' ? 'pdf' : 'image',
    contentType,
    blob: new Blob([buffer], { type: contentType }),
  };
}
